import { useState, useEffect } from "react";
import "../components/Layout.css";
import { supabase } from "../lib/supabase";

type ControleStatus = "Pendente" | "Concluído";

type Registro = {
  id: string;
  nome: string;
  cpf: string | null;
  controle_status: ControleStatus;
  created_at: string;
};

function fmtCPF(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cpf;
}
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function diasDesde(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / 86400000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}
function iniciais(nome: string) {
  const p = nome.trim().split(" ");
  return (p[0][0] + (p[p.length - 1][0] ?? "")).toUpperCase();
}

const AVATAR_COLORS = ["#0ea5e9","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#8b5cf6"];
function avatarColor(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function Controle() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [aba,       setAba]       = useState<ControleStatus>("Pendente");
  const [modal,     setModal]     = useState(false);
  const [nome,      setNome]      = useState("");
  const [cpf,       setCpf]       = useState("");
  const [cpfErr,    setCpfErr]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState<string | null>(null);
  const [search,    setSearch]    = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id,nome,cpf,controle_status,created_at")
      .order("created_at", { ascending: false });
    setRegistros((data ?? []) as Registro[]);
    setLoading(false);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function formatarCPF(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    let f = d;
    if (d.length > 9) f = d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    else if (d.length > 6) f = d.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
    else if (d.length > 3) f = d.replace(/(\d{3})(\d{0,3})/, "$1.$2");
    return f;
  }

  function validarCPF(cpf: string) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
    let r = (s * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== parseInt(d[9])) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
    r = (s * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    return r === parseInt(d[10]);
  }

  async function adicionar() {
    if (!nome.trim()) return;
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo && !validarCPF(cpfLimpo)) { setCpfErr("CPF inválido."); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nome: nome.trim(), cpf: cpf || null, controle_status: "Pendente" })
      .select()
      .single();
    setSaving(false);
    if (error) { showToast("Erro ao adicionar."); return; }
    setRegistros(prev => [data as Registro, ...prev]);
    setModal(false); setNome(""); setCpf(""); setCpfErr("");
    showToast(`${nome.trim()} adicionado à lista de pendentes.`);
    setAba("Pendente");
  }

  async function concluir(id: string, nome: string) {
    const { data } = await supabase
      .from("clientes")
      .update({ controle_status: "Concluído" })
      .eq("id", id).select().single();
    if (data) setRegistros(prev => prev.map(r => r.id === id ? data as Registro : r));
    showToast(`${nome} marcado como concluído.`);
  }

  async function reabrir(id: string, nome: string) {
    const { data } = await supabase
      .from("clientes")
      .update({ controle_status: "Pendente" })
      .eq("id", id).select().single();
    if (data) setRegistros(prev => prev.map(r => r.id === id ? data as Registro : r));
    showToast(`${nome} reaberto.`);
  }

  async function remover(id: string) {
    await supabase.from("clientes").delete().eq("id", id);
    setRegistros(prev => prev.filter(r => r.id !== id));
  }

  const pendentes  = registros.filter(r => r.controle_status === "Pendente");
  const concluidos = registros.filter(r => r.controle_status === "Concluído");
  const lista = (aba === "Pendente" ? pendentes : concluidos)
    .filter(r => r.nome.toLowerCase().includes(search.toLowerCase()) || (r.cpf ?? "").includes(search));

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--fg)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", animation: "fadeUp .2s ease" }}>
          ✓ {toast}
        </div>
      )}

      {/* Modal novo cliente */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && (setModal(false), setNome(""), setCpf(""), setCpfErr(""))}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 400, padding: 30, boxShadow: "0 24px 64px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(14,165,233,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RobotIcon size={22} color="var(--accent)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>Novo cliente</h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--fg-muted)" }}>Entra na fila de pendentes</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelSt}>Nome completo *</label>
                <input
                  value={nome} onChange={e => setNome(e.target.value.toUpperCase())}
                  placeholder="EX.: JOÃO DA SILVA"
                  style={{ ...inputSt, textTransform: "uppercase" }} autoFocus
                  onKeyDown={e => e.key === "Enter" && adicionar()}
                />
              </div>
              <div>
                <label style={labelSt}>CPF</label>
                <input
                  value={cpf}
                  onChange={e => { setCpf(formatarCPF(e.target.value)); setCpfErr(""); }}
                  placeholder="000.000.000-00"
                  style={{ ...inputSt, borderColor: cpfErr ? "#f87171" : undefined }}
                  onKeyDown={e => e.key === "Enter" && adicionar()}
                />
                {cpfErr && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171" }}>{cpfErr}</p>}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => { setModal(false); setNome(""); setCpf(""); setCpfErr(""); }} style={btnSecSt}>Cancelar</button>
              <button onClick={adicionar} disabled={saving || !nome.trim()} style={{ ...btnPrimSt, opacity: !nome.trim() ? 0.5 : 1 }}>
                {saving ? "Adicionando…" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho com robô */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Robô animado */}
          <div style={{ animation: "float 3s ease-in-out infinite", flexShrink: 0 }}>
            <RobotFull />
          </div>
          <div>
            <h1 className="page-title">Controle</h1>
            <p className="page-sub">Gerencie clientes pendentes e concluídos</p>
            <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
              <Pill label="Pendentes" count={pendentes.length} color="#f59e0b" />
              <Pill label="Concluídos" count={concluidos.length} color="#34d399" />
            </div>
          </div>
        </div>
        <button className="btn-primary" style={{ alignSelf: "center" }} onClick={() => setModal(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Cliente
        </button>
      </div>

      {/* Abas + busca */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["Pendente", "Concluído"] as ControleStatus[]).map(t => (
          <button key={t} onClick={() => { setAba(t); setSearch(""); }} style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s",
            background: aba === t ? (t === "Pendente" ? "#f59e0b" : "#10b981") : "transparent",
            borderColor: aba === t ? (t === "Pendente" ? "#f59e0b" : "#10b981") : "var(--border)",
            color: aba === t ? "#000" : "var(--fg-muted)",
          }}>
            {t === "Pendente" ? "Pendentes" : "Concluídos"}
            <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.15)", padding: "1px 7px", borderRadius: 20 }}>
              {t === "Pendente" ? pendentes.length : concluidos.length}
            </span>
          </button>
        ))}

        {/* Busca */}
        <div style={{ position: "relative", marginLeft: "auto", minWidth: 220 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF…"
            style={{ ...inputSt, paddingLeft: 32, fontSize: 13 }}
          />
        </div>
      </div>

      {/* Lista */}
      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div style={{ width: 26, height: 26, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
            <p style={{ marginTop: 12 }}>Carregando…</p>
          </div>
        ) : lista.length === 0 ? (
          <div className="empty-state" style={{ padding: "70px 0" }}>
            <div style={{ opacity: 0.3 }}><RobotFull /></div>
            <p style={{ marginTop: 16, fontSize: 14 }}>
              {search ? "Nenhum resultado para a busca." : aba === "Pendente" ? "Nenhum cliente pendente." : "Nenhum cliente concluído ainda."}
            </p>
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Cliente", "CPF", "Entrada", "Tempo", ""].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", transition: "background .12s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: avatarColor(r.nome), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {iniciais(r.nome)}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>{r.nome}</span>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 13, color: "var(--fg-muted)" }}>
                      {r.cpf ? fmtCPF(r.cpf) : <span style={{ opacity: 0.4 }}>—</span>}
                    </td>

                    <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      {fmtData(r.created_at)}
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                        background: aba === "Pendente" ? "rgba(245,158,11,0.12)" : "rgba(52,211,153,0.12)",
                        color: aba === "Pendente" ? "#f59e0b" : "#34d399",
                      }}>
                        {diasDesde(r.created_at)}
                      </span>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {aba === "Pendente" ? (
                          <button onClick={() => concluir(r.id, r.nome)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#10b981", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                            ✓ Concluir
                          </button>
                        ) : (
                          <button onClick={() => reabrir(r.id, r.nome)} style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f59e0b"; (e.currentTarget as HTMLButtonElement).style.color = "#f59e0b"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)"; }}>
                            Reabrir
                          </button>
                        )}
                        <button onClick={() => remover(r.id)} title="Remover" style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 12, cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f87171"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)"; }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "11px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--fg-muted)" }}>
              {lista.length} registro{lista.length !== 1 ? "s" : ""}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ color: "var(--fg-muted)" }}>{label}:</span>
      <span style={{ fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </div>
  );
}

function RobotIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <rect x="9" y="7" width="6" height="4" rx="1"/>
      <line x1="12" y1="7" x2="12" y2="4"/>
      <circle cx="12" cy="3" r="1"/>
      <circle cx="8.5" cy="16" r="1.5" fill={color} stroke="none"/>
      <circle cx="15.5" cy="16" r="1.5" fill={color} stroke="none"/>
      <line x1="9" y1="19" x2="15" y2="19"/>
    </svg>
  );
}

function RobotFull() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Antena */}
      <line x1="36" y1="6" x2="36" y2="16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="36" cy="5" r="3" fill="var(--accent)"/>
      {/* Cabeça */}
      <rect x="14" y="16" width="44" height="28" rx="8" fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="1.5"/>
      {/* Olhos */}
      <rect x="21" y="24" width="10" height="8" rx="3" fill="var(--accent)" opacity="0.9"/>
      <rect x="41" y="24" width="10" height="8" rx="3" fill="var(--accent)" opacity="0.9"/>
      {/* Brilho nos olhos */}
      <rect x="23" y="26" width="3" height="2" rx="1" fill="white" opacity="0.6"/>
      <rect x="43" y="26" width="3" height="2" rx="1" fill="white" opacity="0.6"/>
      {/* Boca */}
      <rect x="26" y="36" width="20" height="4" rx="2" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.2"/>
      <rect x="28" y="37.5" width="4" height="1" rx=".5" fill="var(--accent)" opacity="0.7"/>
      <rect x="34" y="37.5" width="4" height="1" rx=".5" fill="var(--accent)" opacity="0.7"/>
      <rect x="40" y="37.5" width="4" height="1" rx=".5" fill="var(--accent)" opacity="0.7"/>
      {/* Corpo */}
      <rect x="20" y="46" width="32" height="20" rx="6" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5"/>
      {/* Painel do corpo */}
      <rect x="27" y="51" width="18" height="10" rx="3" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1" opacity="0.8"/>
      <circle cx="31" cy="56" r="2" fill="var(--accent)" opacity="0.7"/>
      <circle cx="36" cy="56" r="2" fill="#34d399" opacity="0.7"/>
      <circle cx="41" cy="56" r="2" fill="#f59e0b" opacity="0.7"/>
      {/* Braços */}
      <rect x="6" y="46" width="12" height="6" rx="3" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5"/>
      <rect x="54" y="46" width="12" height="6" rx="3" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5"/>
    </svg>
  );
}

const labelSt: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 };
const inputSt: React.CSSProperties = { width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontSize: 14, color: "var(--fg)", outline: "none", fontFamily: "var(--font)", boxSizing: "border-box" };
const btnPrimSt: React.CSSProperties = { padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecSt: React.CSSProperties = { padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
