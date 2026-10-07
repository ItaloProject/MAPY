import { useState, useEffect } from "react";
import "../components/Layout.css";
import { supabase } from "../lib/supabase";

type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  status: string;
  ultimo_acesso: string | null;
  created_at: string;
};

type ModalTipo = "criar" | "suspender" | "reset" | "apagar" | null;

const PERFIS = ["Administrador", "Operador", "Suporte", "Visualizador"];

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];
function avatarColor(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function iniciais(nome: string) {
  const p = nome.trim().split(" ");
  return (p[0][0] + (p[p.length - 1][0] ?? "")).toUpperCase();
}
function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const perfilColor: Record<string, { bg: string; fg: string }> = {
  Administrador: { bg: "rgba(239,68,68,0.15)",  fg: "#f87171" },
  Operador:      { bg: "rgba(99,102,241,0.15)",  fg: "#818cf8" },
  Suporte:       { bg: "rgba(245,158,11,0.15)",  fg: "#fbbf24" },
  Visualizador:  { bg: "rgba(107,114,128,0.15)", fg: "#9ca3af" },
};
const statusColor: Record<string, { dot: string; fg: string }> = {
  Ativo:    { dot: "#34d399", fg: "#34d399" },
  Suspenso: { dot: "#f87171", fg: "#f87171" },
};

export default function Usuarios() {
  const [usuarios,  setUsuarios]  = useState<Usuario[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<ModalTipo>(null);
  const [alvo,      setAlvo]      = useState<Usuario | null>(null);
  const [form,      setForm]      = useState({ nome: "", email: "", perfil: "Operador" });
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState<string | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("*")
      .order("created_at", { ascending: false });
    setUsuarios(data ?? []);
    setLoading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function abrirModal(tipo: ModalTipo, usuario?: Usuario) {
    setAlvo(usuario ?? null);
    setFormErr(null);
    if (tipo === "criar") setForm({ nome: "", email: "", perfil: "Operador" });
    setModal(tipo);
  }

  function fecharModal() {
    setModal(null);
    setAlvo(null);
    setFormErr(null);
  }

  // ── CRIAR ──────────────────────────────────────────────────────────────────
  async function criarUsuario() {
    const { nome, email, perfil } = form;
    if (!nome.trim()) return setFormErr("O nome é obrigatório.");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormErr("E-mail inválido.");

    setSaving(true);
    setFormErr(null);

    // Verifica duplicata
    const existente = usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existente) { setFormErr("Já existe um usuário com este e-mail."); setSaving(false); return; }

    const { error } = await supabase.from("usuarios").insert({ nome: nome.trim(), email: email.trim().toLowerCase(), perfil, status: "Ativo" });
    setSaving(false);
    if (error) { setFormErr("Erro ao criar usuário: " + error.message); return; }

    // Envia convite de redefinição de senha via Supabase Auth
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/acesso`,
    });

    fecharModal();
    await carregar();
    showToast(`Usuário ${nome.trim()} criado. Convite enviado para ${email.trim()}.`);
  }

  // ── SUSPENDER / REATIVAR ───────────────────────────────────────────────────
  async function alternarStatus() {
    if (!alvo) return;
    setSaving(true);
    const novoStatus = alvo.status === "Ativo" ? "Suspenso" : "Ativo";
    const { error } = await supabase.from("usuarios").update({ status: novoStatus }).eq("id", alvo.id);
    setSaving(false);
    if (error) { showToast("Erro ao atualizar status."); return; }
    fecharModal();
    await carregar();
    showToast(`Acesso de ${alvo.nome} ${novoStatus === "Suspenso" ? "suspenso" : "reativado"}.`);
  }

  // ── RESET SENHA ────────────────────────────────────────────────────────────
  async function resetarSenha() {
    if (!alvo) return;
    setSaving(true);
    const { error } = await supabase.auth.resetPasswordForEmail(alvo.email, {
      redirectTo: `${window.location.origin}/acesso`,
    });
    setSaving(false);
    if (error) { showToast("Erro ao enviar e-mail de redefinição."); return; }
    fecharModal();
    showToast(`E-mail de redefinição de senha enviado para ${alvo.email}.`);
  }

  // ── APAGAR ─────────────────────────────────────────────────────────────────
  async function apagarUsuario() {
    if (!alvo) return;
    setSaving(true);
    const { error } = await supabase.from("usuarios").delete().eq("id", alvo.id);
    setSaving(false);
    if (error) { showToast("Erro ao apagar usuário."); return; }
    fecharModal();
    await carregar();
    showToast(`Usuário ${alvo.nome} removido.`);
  }

  const ativos    = usuarios.filter(u => u.status === "Ativo").length;
  const suspensos = usuarios.filter(u => u.status === "Suspenso").length;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: "var(--surface)", border: "1px solid var(--accent)",
          borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--fg)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)", maxWidth: 360,
          animation: "fadeIn 0.2s ease"
        }}>
          <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
          ✓ {toast}
        </div>
      )}

      {/* Modal overlay */}
      {modal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && fecharModal()}
        >
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, width: "100%", maxWidth: 460, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

            {/* CRIAR */}
            {modal === "criar" && (
              <>
                <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Novo Usuário</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Campo label="Nome completo">
                    <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: João Silva" style={inputStyle} />
                  </Campo>
                  <Campo label="E-mail">
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="joao@empresa.com" style={inputStyle} />
                  </Campo>
                  <Campo label="Perfil">
                    <select value={form.perfil} onChange={e => setForm(f => ({ ...f, perfil: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                      {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Campo>
                  {formErr && <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{formErr}</p>}
                </div>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 14, marginBottom: 0 }}>
                  Um e-mail de convite será enviado para o endereço informado.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={criarUsuario} disabled={saving} style={btnPrimStyle}>{saving ? "Criando…" : "Criar Usuário"}</button>
                </div>
              </>
            )}

            {/* SUSPENDER / REATIVAR */}
            {modal === "suspender" && alvo && (
              <>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: alvo.status === "Ativo" ? "#f87171" : "#34d399" }}>
                  {alvo.status === "Ativo" ? "Suspender acesso" : "Reativar acesso"}
                </h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  {alvo.status === "Ativo"
                    ? <>Suspender <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> vai bloquear o acesso ao sistema. A conta pode ser reativada a qualquer momento.</>
                    : <>Reativar <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> vai restaurar o acesso ao sistema.</>}
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={alternarStatus} disabled={saving} style={{ ...btnPrimStyle, background: alvo.status === "Ativo" ? "#ef4444" : "#10b981" }}>
                    {saving ? "Aguarde…" : alvo.status === "Ativo" ? "Suspender" : "Reativar"}
                  </button>
                </div>
              </>
            )}

            {/* RESET SENHA */}
            {modal === "reset" && alvo && (
              <>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>Redefinir senha</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Será enviado um e-mail de redefinição de senha para <strong style={{ color: "var(--fg)" }}>{alvo.email}</strong>.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={resetarSenha} disabled={saving} style={btnPrimStyle}>{saving ? "Enviando…" : "Enviar e-mail"}</button>
                </div>
              </>
            )}

            {/* APAGAR */}
            {modal === "apagar" && alvo && (
              <>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#f87171" }}>Apagar usuário</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Esta ação é <strong>irreversível</strong>. O usuário <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> ({alvo.email}) será removido permanentemente.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecStyle}>Cancelar</button>
                  <button onClick={apagarUsuario} disabled={saving} style={{ ...btnPrimStyle, background: "#ef4444" }}>
                    {saving ? "Removendo…" : "Apagar definitivamente"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="page-sub">{loading ? "…" : `${usuarios.length} usuário${usuarios.length !== 1 ? "s" : ""} do sistema`}</p>
        </div>
        <button className="btn-primary" style={{ alignSelf: "center" }} onClick={() => abrirModal("criar")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Usuário
        </button>
      </div>

      {/* Métricas rápidas */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <div className="section-card" style={{ padding: "16px 22px", margin: 0, display: "flex", alignItems: "center", gap: 14, flex: "1 1 160px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#818cf8", lineHeight: 1 }}>{loading ? "…" : usuarios.length}</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3 }}>Total</div>
          </div>
        </div>
        <div className="section-card" style={{ padding: "16px 22px", margin: 0, display: "flex", alignItems: "center", gap: 14, flex: "1 1 160px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#34d399", lineHeight: 1 }}>{loading ? "…" : ativos}</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3 }}>Ativos</div>
          </div>
        </div>
        <div className="section-card" style={{ padding: "16px 22px", margin: 0, display: "flex", alignItems: "center", gap: 14, flex: "1 1 160px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f87171", lineHeight: 1 }}>{loading ? "…" : suspensos}</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3 }}>Suspensos</div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>Equipe</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          {loading ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <div style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <p style={{ marginTop: 12 }}>Carregando usuários…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : usuarios.length === 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <p>Nenhum usuário cadastrado.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Usuário", "Perfil", "Status", "Último acesso", ""].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => {
                  const sc = statusColor[u.status] ?? statusColor["Ativo"];
                  const pc = perfilColor[u.perfil] ?? perfilColor["Visualizador"];
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)", transition: "background .12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(u.nome), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                            {iniciais(u.nome)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>{u.nome}</div>
                            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}>{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: pc.bg, color: pc.fg }}>
                          {u.perfil}
                        </span>
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, flexShrink: 0, boxShadow: `0 0 6px ${sc.dot}` }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: sc.fg }}>{u.status}</span>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                        {fmtData(u.ultimo_acesso)}
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <ActionBtn
                            title={u.status === "Ativo" ? "Suspender acesso" : "Reativar acesso"}
                            color={u.status === "Ativo" ? "#f87171" : "#34d399"}
                            onClick={() => abrirModal("suspender", u)}
                          >
                            {u.status === "Ativo" ? "Suspender" : "Reativar"}
                          </ActionBtn>
                          <ActionBtn title="Redefinir senha" onClick={() => abrirModal("reset", u)}>
                            Resetar senha
                          </ActionBtn>
                          <ActionBtn title="Apagar usuário" color="#f87171" onClick={() => abrirModal("apagar", u)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {!loading && (
          <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--fg-muted)" }}>
            {ativos} ativo{ativos !== 1 ? "s" : ""} · {suspensos} suspenso{suspensos !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function ActionBtn({ children, title, color, onClick }: { children: React.ReactNode; title?: string; color?: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: color ?? "var(--fg-muted)", fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all .15s", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
      onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = color ?? "var(--accent)"; b.style.color = color ?? "var(--accent)"; }}
      onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = "var(--border)"; b.style.color = color ?? "var(--fg-muted)"; }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "9px 14px", fontSize: 14, color: "var(--fg)", outline: "none", fontFamily: "var(--font)",
  boxSizing: "border-box",
};
const btnPrimStyle: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "opacity .15s",
};
const btnSecStyle: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent",
  color: "var(--fg-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
