import { useState, useEffect } from "react";
import "../components/Layout.css";
import "./Usuarios.css";
import { supabase } from "../lib/supabase";

type Usuario = {
  id: string;
  nome: string;
  email: string | null;
  perfil: string;
  status: string;
  matricula: string | null;
  auth_user_id: string | null;
  token_hash: string | null;
  ultimo_acesso: string | null;
  created_at: string;
};

type ModalTipo = "criar" | "suspender" | "reset" | "apagar" | "credenciais" | "qrs" | null;

const PERFIS = ["Administrador", "Operador", "Suporte", "Visualizador"];

// ── Criptografia ──────────────────────────────────────────────────────────
async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function gerarToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function baixarChaveCSV(matricula: string, token: string) {
  const csv = [
    "# e-MEC Chave de Acesso - CONFIDENCIAL - NAO COMPARTILHE",
    "MATRICULA,TOKEN",
    `${matricula},${token}`,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `emec_chave_${matricula}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Gerador de senha forte ─────────────────────────────────────────────────
function gerarSenha(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const digits  = "23456789";
  const special = "@#$%&*!";
  const all     = upper + lower + digits + special;
  let pwd = "";
  pwd += upper  [Math.floor(Math.random() * upper.length)];
  pwd += lower  [Math.floor(Math.random() * lower.length)];
  pwd += digits [Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

// ── Gerador de matrícula ───────────────────────────────────────────────────
async function gerarMatricula(): Promise<string> {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from("usuarios")
    .select("matricula")
    .ilike("matricula", `${year}%`)
    .order("matricula", { ascending: false })
    .limit(1);
  const seq = data && data.length > 0 && data[0].matricula
    ? parseInt(data[0].matricula.slice(4)) + 1
    : 1;
  return `${year}${String(seq).padStart(3, "0")}`;
}

const AVATAR_COLORS = ["#0ea5e9","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#8b5cf6"];
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
  Operador:      { bg: "rgba(14,165,233,0.15)",  fg: "#38bdf8" },
  Suporte:       { bg: "rgba(245,158,11,0.15)",  fg: "#fbbf24" },
  Visualizador:  { bg: "rgba(100,116,139,0.15)", fg: "#94a3b8" },
};
const statusColor: Record<string, { dot: string; fg: string }> = {
  Ativo:    { dot: "#34d399", fg: "#34d399" },
  Suspenso: { dot: "#f87171", fg: "#f87171" },
};

export default function Usuarios() {
  const [usuarios,   setUsuarios]   = useState<Usuario[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState<ModalTipo>(null);
  const [alvo,       setAlvo]       = useState<Usuario | null>(null);
  const [form,       setForm]       = useState({ nome: "", email: "", perfil: "Operador" });
  const [formErr,    setFormErr]    = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);

  // Credenciais geradas (mostrar ao admin)
  const [credMatricula, setCredMatricula] = useState("");
  const [credSenha,     setCredSenha]     = useState("");
  const [copied,        setCopied]        = useState<"mat"|"pwd"|null>(null);

  // QRs do usuário
  const [qrsCount,  setQrsCount]  = useState<number | null>(null);
  const [qrsBusy,   setQrsBusy]   = useState(false);

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

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  function abrirCriar() {
    setForm({ nome: "", email: "", perfil: "Operador" });
    setFormErr(null);
    setModal("criar");
  }

  function fecharModal() { setModal(null); setAlvo(null); setFormErr(null); setSaving(false); setQrsCount(null); }

  async function abrirQRs(u: Usuario) {
    setAlvo(u); setQrsCount(null); setModal("qrs");
    if (!u.auth_user_id) return;
    const { count } = await supabase
      .from("publicacoes").select("*", { count: "exact", head: true }).eq("created_by", u.auth_user_id);
    setQrsCount(count ?? 0);
  }

  async function toggleQRsUsuario(ativo: boolean) {
    if (!alvo?.auth_user_id) return;
    setQrsBusy(true);
    await supabase.from("publicacoes").update({ ativo }).eq("created_by", alvo.auth_user_id);
    setQrsBusy(false);
    fecharModal();
    showToast(ativo ? "QRs ativados." : "QRs desativados.");
  }

  async function copiar(texto: string, tipo: "mat"|"pwd") {
    await navigator.clipboard.writeText(texto).catch(() => {});
    setCopied(tipo);
    setTimeout(() => setCopied(null), 2000);
  }

  // ── CRIAR ──────────────────────────────────────────────────────────────────
  async function criarUsuario() {
    if (!form.nome.trim()) return setFormErr("O nome é obrigatório.");
    setSaving(true);
    setFormErr(null);

    const matricula  = await gerarMatricula();
    const password   = gerarSenha();
    const chaveToken = gerarToken();
    const tokenHash  = await sha256hex(chaveToken);

    // Obtém token da sessão atual para chamar a API
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? "";

    const res = await fetch("/api/criar-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ nome: form.nome.trim(), email: form.email.trim() || null, perfil: form.perfil, matricula, password }),
    });

    const body = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFormErr(body.error ?? "Erro ao criar usuário.");
      return;
    }

    // Salva na tabela usuarios (com token_hash)
    const { error } = await supabase.from("usuarios").insert({
      nome: form.nome.trim(),
      email: form.email.trim() || null,
      perfil: form.perfil,
      status: "Ativo",
      matricula,
      auth_user_id: body.auth_user_id,
      token_hash: tokenHash,
    });

    if (error) { setFormErr("Usuário criado no Auth mas erro ao salvar perfil: " + error.message); return; }

    fecharModal();
    await carregar();

    // Download automático da chave CSV
    baixarChaveCSV(matricula, chaveToken);

    // Exibe modal de credenciais
    setCredMatricula(matricula);
    setCredSenha(password);
    setModal("credenciais");
  }

  // ── BAIXAR CHAVE (regenerar token) ─────────────────────────────────────────
  async function baixarChave(u: Usuario) {
    const novoToken = gerarToken();
    const novoHash  = await sha256hex(novoToken);
    const { error } = await supabase.from("usuarios").update({ token_hash: novoHash }).eq("id", u.id);
    if (error) { showToast("Erro ao gerar chave."); return; }
    baixarChaveCSV(u.matricula!, novoToken);
    showToast(`Nova chave gerada para ${u.nome}.`);
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
    if (!alvo?.auth_user_id) { showToast("Usuário sem vínculo de autenticação."); fecharModal(); return; }
    setSaving(true);
    const novaSenha = gerarSenha();

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const res = await fetch("/api/resetar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ auth_user_id: alvo.auth_user_id, newPassword: novaSenha }),
    });

    setSaving(false);
    fecharModal();

    if (!res.ok) { showToast("Erro ao resetar senha."); return; }

    // Exibe nova senha ao admin
    setCredMatricula(alvo.matricula ?? "");
    setCredSenha(novaSenha);
    setAlvo(alvo);
    setModal("credenciais");
  }

  // ── APAGAR ─────────────────────────────────────────────────────────────────
  async function apagarUsuario() {
    if (!alvo) return;
    setSaving(true);
    await supabase.from("usuarios").delete().eq("id", alvo.id);
    setSaving(false);
    fecharModal();
    await carregar();
    showToast(`Usuário ${alvo.nome} removido.`);
  }

  const ativos    = usuarios.filter(u => u.status === "Ativo").length;
  const suspensos = usuarios.filter(u => u.status === "Suspenso").length;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Toast */}
      {toast && (
        <div className="usr-toast" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--fg)", boxShadow: "0 8px 32px rgba(0,0,0,.3)", animation: "fadeUp .2s ease" }}>
          ✓ {toast}
        </div>
      )}

      {/* Modal overlay */}
      {modal && (
        <div className="usr-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && modal !== "credenciais" && fecharModal()}>
          <div className="usr-sheet" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, width: "100%", maxWidth: 460, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>

            {/* CRIAR */}
            {modal === "criar" && (
              <>
                <h3 style={h3St}>Novo Usuário</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Campo label="Nome completo *">
                    <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: João Silva" style={inputSt} autoFocus />
                  </Campo>
                  <Campo label="E-mail (opcional — contato)">
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="joao@empresa.com" style={inputSt} />
                  </Campo>
                  <Campo label="Perfil">
                    <select value={form.perfil} onChange={e => setForm(f => ({ ...f, perfil: e.target.value }))} style={{ ...inputSt, cursor: "pointer" }}>
                      {PERFIS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Campo>
                </div>
                {formErr && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#f87171" }}>{formErr}</p>}
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 14, marginBottom: 0 }}>
                  A matrícula e senha forte serão geradas automaticamente.
                </p>
                <div className="usr-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecSt}>Cancelar</button>
                  <button onClick={criarUsuario} disabled={saving} style={btnPrimSt}>
                    {saving ? "Criando…" : "Criar Usuário"}
                  </button>
                </div>
              </>
            )}

            {/* CREDENCIAIS GERADAS */}
            {modal === "credenciais" && (
              <>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                  <h3 style={{ ...h3St, marginBottom: 4 }}>{alvo ? "Nova senha gerada" : "Usuário criado!"}</h3>
                  <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>Guarde estas credenciais — a senha não será exibida novamente.</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <CredBox label="Matrícula" value={credMatricula} onCopy={() => copiar(credMatricula, "mat")} copied={copied === "mat"} mono />
                  <CredBox label="Senha"     value={credSenha}     onCopy={() => copiar(credSenha,     "pwd")} copied={copied === "pwd"} mono />
                </div>

                <p style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 14, textAlign: "center" }}>
                  Login: matrícula <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 4 }}>{credMatricula}</code> + senha acima
                </p>

                <button onClick={fecharModal} style={{ ...btnPrimSt, width: "100%", marginTop: 18, textAlign: "center" }}>
                  Entendido
                </button>
              </>
            )}

            {/* SUSPENDER / REATIVAR */}
            {modal === "suspender" && alvo && (
              <>
                <h3 style={{ ...h3St, color: alvo.status === "Ativo" ? "#f87171" : "#34d399" }}>
                  {alvo.status === "Ativo" ? "Suspender acesso" : "Reativar acesso"}
                </h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  {alvo.status === "Ativo"
                    ? <><strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> não poderá mais entrar no sistema. Pode ser reativado a qualquer momento.</>
                    : <><strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> terá o acesso restaurado.</>}
                </p>
                <div className="usr-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecSt}>Cancelar</button>
                  <button onClick={alternarStatus} disabled={saving} style={{ ...btnPrimSt, background: alvo.status === "Ativo" ? "#ef4444" : "#10b981" }}>
                    {saving ? "Aguarde…" : alvo.status === "Ativo" ? "Suspender" : "Reativar"}
                  </button>
                </div>
              </>
            )}

            {/* RESET SENHA */}
            {modal === "reset" && alvo && (
              <>
                <h3 style={h3St}>Resetar senha</h3>
                <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Uma nova senha forte será gerada para <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> (matrícula <strong style={{ color: "var(--accent)" }}>{alvo.matricula}</strong>).
                </p>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "#fbbf24" }}>
                  ⚠ A senha atual será invalidada imediatamente.
                </p>
                <div className="usr-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecSt}>Cancelar</button>
                  <button onClick={resetarSenha} disabled={saving} style={btnPrimSt}>
                    {saving ? "Gerando…" : "Gerar nova senha"}
                  </button>
                </div>
              </>
            )}

            {/* QRs DO USUÁRIO */}
            {modal === "qrs" && alvo && (
              <>
                <h3 style={h3St}>QR Codes de {alvo.nome.split(" ")[0]}</h3>
                <p style={{ margin: "0 0 6px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  {!alvo.auth_user_id
                    ? "Este usuário não tem conta vinculada — sem QR codes para gerenciar."
                    : qrsCount === null
                      ? "Contando QR codes…"
                      : qrsCount === 0
                        ? "Nenhum QR code encontrado para este usuário."
                        : <><strong style={{ color: "var(--fg)" }}>{qrsCount} QR code{qrsCount !== 1 ? "s" : ""}</strong> publicado{qrsCount !== 1 ? "s" : ""} por este usuário.</>
                  }
                </p>
                {alvo.auth_user_id && qrsCount !== null && qrsCount > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                    <button onClick={() => toggleQRsUsuario(false)} disabled={qrsBusy} style={{ ...btnPrimSt, background: "#ef4444", borderColor: "#ef4444" }}>
                      {qrsBusy ? "Aguarde…" : `Desativar todos (${qrsCount})`}
                    </button>
                    <button onClick={() => toggleQRsUsuario(true)} disabled={qrsBusy} style={{ ...btnPrimSt, background: "#10b981", borderColor: "#10b981" }}>
                      {qrsBusy ? "Aguarde…" : `Ativar todos (${qrsCount})`}
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
                  <button onClick={fecharModal} style={btnSecSt}>Fechar</button>
                </div>
              </>
            )}

            {/* APAGAR */}
            {modal === "apagar" && alvo && (
              <>
                <h3 style={{ ...h3St, color: "#f87171" }}>Apagar usuário</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                  Esta ação é <strong>irreversível</strong>. <strong style={{ color: "var(--fg)" }}>{alvo.nome}</strong> (matrícula {alvo.matricula ?? "—"}) será removido permanentemente.
                </p>
                <div className="usr-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={fecharModal} style={btnSecSt}>Cancelar</button>
                  <button onClick={apagarUsuario} disabled={saving} style={{ ...btnPrimSt, background: "#ef4444" }}>
                    {saving ? "Removendo…" : "Apagar definitivamente"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="page-header usr-head">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="page-sub">{loading ? "…" : `${usuarios.length} usuário${usuarios.length !== 1 ? "s" : ""} do sistema`}</p>
        </div>
        <button className="btn-primary usr-new" onClick={abrirCriar}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Usuário
        </button>
      </div>

      {/* Métricas */}
      <div className="usr-metrics">
        {[
          { label: "Total", val: usuarios.length, color: "#818cf8", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, bg: "rgba(129,140,248,0.12)" },
          { label: "Ativos",    val: ativos,    color: "#34d399", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, bg: "rgba(52,211,153,0.12)" },
          { label: "Suspensos", val: suspensos, color: "#f87171", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>, bg: "rgba(248,113,113,0.12)" },
        ].map(m => (
          <div key={m.label} className="section-card usr-metric">
            <div className="usr-metric-ico" style={{ background: m.bg }}>{m.icon}</div>
            <div>
              <div className="usr-metric-val" style={{ color: m.color }}>{loading ? "…" : m.val}</div>
              <div className="usr-metric-lbl">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div className={`section-card usr-card${!loading && usuarios.length > 0 ? " usr-card--list" : ""}`}>
        <div className="usr-card-hd">
          <span>Equipe</span>
        </div>
        <div className="usr-scroll">
          {loading ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <div style={{ width: 26, height: 26, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <p style={{ marginTop: 12 }}>Carregando…</p>
            </div>
          ) : usuarios.length === 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}><p>Nenhum usuário cadastrado.</p></div>
          ) : (
            <table className="usr-table">
              <thead>
                <tr>
                  {["Usuário", "Matrícula", "Perfil", "Status", "Último acesso", ""].map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => {
                  const sc = statusColor[u.status] ?? statusColor["Ativo"];
                  const pc = perfilColor[u.perfil] ?? perfilColor["Visualizador"];
                  return (
                    <tr key={u.id} className="usr-row">
                      <td className="usr-user">
                        <div className="usr-who">
                          <div className="usr-avatar" style={{ background: avatarColor(u.nome) }}>{iniciais(u.nome)}</div>
                          <div className="usr-who-txt">
                            <div className="usr-nome">{u.nome}</div>
                            <div className="usr-email">{u.email ?? "—"}</div>
                          </div>
                        </div>
                      </td>

                      <td className="usr-line usr-mat" data-label="Matrícula">
                        {u.matricula ? (
                          <div className="usr-mat-wrap">
                            <span className="usr-mat-num">{u.matricula}</span>
                            <button className="usr-copy" onClick={() => copiar(u.matricula!, "mat")} title="Copiar matrícula" aria-label="Copiar matrícula">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        ) : <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>—</span>}
                      </td>

                      <td className="usr-perfil">
                        <span className="usr-chip" style={{ background: pc.bg, color: pc.fg }}>{u.perfil}</span>
                      </td>

                      <td className="usr-line usr-status" data-label="Status">
                        <div className="usr-status-wrap">
                          <span className="usr-dot" style={{ background: sc.dot, boxShadow: `0 0 6px ${sc.dot}` }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: sc.fg }}>{u.status}</span>
                        </div>
                      </td>

                      <td className="usr-line usr-ultimo" data-label="Último acesso">{fmtData(u.ultimo_acesso)}</td>

                      <td className="usr-acoes">
                        <div className="usr-btns">
                          <ABtn color={u.status === "Ativo" ? "#f87171" : "#34d399"} onClick={() => { setAlvo(u); setModal("suspender"); }}>
                            {u.status === "Ativo" ? "Suspender" : "Reativar"}
                          </ABtn>
                          <ABtn onClick={() => { setAlvo(u); setModal("reset"); }}>Resetar senha</ABtn>
                          {u.matricula && (
                            <ABtn color="#7DD43A" onClick={() => baixarChave(u)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Chave
                            </ABtn>
                          )}
                          <ABtn color="#a78bfa" onClick={() => abrirQRs(u)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/>
                              <path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/>
                            </svg>
                            <span className="usr-abtn-txt">QRs</span>
                          </ABtn>
                          <ABtn color="#f87171" onClick={() => { setAlvo(u); setModal("apagar"); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            <span className="usr-abtn-txt">Apagar</span>
                          </ABtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {!loading && usuarios.length > 0 && (
          <div className="usr-foot">
            {ativos} ativo{ativos !== 1 ? "s" : ""} · {suspensos} suspenso{suspensos !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <button className="usr-fab" onClick={abrirCriar} aria-label="Novo usuário">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
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

function ABtn({ children, color, onClick }: { children: React.ReactNode; color?: string; onClick: () => void }) {
  return (
    <button className="usr-abtn" onClick={onClick}
      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: color ?? "var(--fg-muted)", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
      onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = color ?? "var(--accent)"; b.style.color = color ?? "var(--accent)"; }}
      onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = "var(--border)"; b.style.color = color ?? "var(--fg-muted)"; }}>
      {children}
    </button>
  );
}

function CredBox({ label, value, onCopy, copied, mono }: { label: string; value: string; onCopy: () => void; copied: boolean; mono?: boolean }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--fg)", fontFamily: mono ? "monospace" : undefined, letterSpacing: mono ? "0.1em" : undefined, wordBreak: "break-all" }}>
          {value}
        </span>
        <button onClick={onCopy} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: copied ? "rgba(52,211,153,0.12)" : "transparent", color: copied ? "#34d399" : "var(--fg-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

const h3St:     React.CSSProperties = { margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: "var(--fg)" };
const inputSt:  React.CSSProperties = { width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontSize: 14, color: "var(--fg)", outline: "none", fontFamily: "var(--font)", boxSizing: "border-box" };
const btnPrimSt: React.CSSProperties = { padding: "9px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecSt: React.CSSProperties = { padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
