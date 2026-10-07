import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../components/Layout.css";
import { supabase } from "../lib/supabase";

/* ── helpers ── */
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtNum(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR");
}
function iniciais(nome: string) {
  const p = nome.trim().split(" ");
  return (p[0][0] + (p[p.length - 1]?.[0] ?? "")).toUpperCase();
}
const COLORS = ["#0ea5e9","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#8b5cf6","#ec4899"];
function avatarColor(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function dataExtenso() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

type Recente = { id: string; nome: string; cpf: string | null; controle_status: string; created_at: string };

/* ── Skeleton ── */
function Sk({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "var(--surface-2)", animation: "sk 1.4s ease infinite" }} />;
}

/* ── Ring (mini donut) ── */
function Ring({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray .8s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading,   setLoading]   = useState(true);
  const [clientes,  setClientes]  = useState<number | null>(null);
  const [qrcodes,   setQrcodes]   = useState<number | null>(null);
  const [pendentes, setPendentes] = useState<number | null>(null);
  const [concluidos,setConcluidos]= useState<number | null>(null);
  const [usuarios,  setUsuarios]  = useState<number | null>(null);
  const [recentes,  setRecentes]  = useState<Recente[]>([]);
  const [nomeAdmin, setNomeAdmin] = useState("Administrador");
  const [cliMes,    setCliMes]    = useState<number>(0);
  const [cliMesAnt, setCliMesAnt] = useState<number>(0);
  const [qrMes,     setQrMes]     = useState<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.nome) setNomeAdmin(user.user_metadata.nome.split(" ")[0]);
      else if (user?.email) setNomeAdmin(user.email.split("@")[0]);
    });

    async function load() {
      setLoading(true);
      const now = new Date();
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const inicioAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

      const [
        { count: tCli },
        { count: tQR },
        { count: tPend },
        { count: tConc },
        { count: tUsu },
        { data: rec },
        { count: cMes },
        { count: cAnt },
        { count: qMes },
      ] = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }),
        supabase.from("clientes").select("*", { count: "exact", head: true }).eq("controle_status", "Pendente"),
        supabase.from("clientes").select("*", { count: "exact", head: true }).eq("controle_status", "Concluído"),
        supabase.from("usuarios").select("*", { count: "exact", head: true }).eq("status", "Ativo"),
        supabase.from("clientes").select("id,nome,cpf,controle_status,created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", inicioMes),
        supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", inicioAnt).lt("created_at", inicioMes),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }).gte("created_at", inicioMes),
      ]);

      setClientes(tCli ?? 0);
      setQrcodes(tQR ?? 0);
      setPendentes(tPend ?? 0);
      setConcluidos(tConc ?? 0);
      setUsuarios(tUsu ?? 0);
      setRecentes((rec ?? []) as Recente[]);
      setCliMes(cMes ?? 0);
      setCliMesAnt(cAnt ?? 0);
      setQrMes(qMes ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  const total = (pendentes ?? 0) + (concluidos ?? 0);
  const pctConc = total > 0 ? Math.round(((concluidos ?? 0) / total) * 100) : 0;
  const pctPend = 100 - pctConc;
  const deltaCliPct = cliMesAnt > 0 ? Math.round(((cliMes - cliMesAnt) / cliMesAnt) * 100) : null;

  return (
    <>
      <style>{`
        @keyframes sk { 0%,100%{opacity:.4} 50%{opacity:.9} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .dash-animate { animation: fadeUp .35s ease both; }
        .stat-new { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:22px; display:flex; flex-direction:column; gap:4px; transition:border-color .15s, transform .15s; cursor:default; }
        .stat-new:hover { border-color: var(--accent); transform: translateY(-2px); }
        .quick-btn { display:flex; flex-direction:column; align-items:center; gap:8px; padding:18px 12px; background:var(--surface); border:1px solid var(--border); border-radius:14px; cursor:pointer; transition:all .15s; color:var(--fg-muted); font-size:12px; font-weight:600; text-align:center; }
        .quick-btn:hover { border-color:var(--accent); color:var(--accent); transform:translateY(-2px); background:rgba(14,165,233,0.04); }
        .act-row { display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); }
        .act-row:last-child { border-bottom:none; }
      `}</style>

      {/* ── Hero ── */}
      <div className="dash-animate" style={{
        background: "linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(99,102,241,0.08) 50%, rgba(16,185,129,0.06) 100%)",
        border: "1px solid rgba(14,165,233,0.18)",
        borderRadius: 20, padding: "28px 32px", marginBottom: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, marginBottom: 4, textTransform: "capitalize" }}>
            {saudacao()}, {nomeAdmin} 👋
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--fg)", margin: "0 0 6px", letterSpacing: "-.03em" }}>
            Painel e-MEC
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)", textTransform: "capitalize" }}>
            {dataExtenso()}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => navigate("/clientes")} style={{ fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo Cliente
          </button>
          <button className="btn-sm" onClick={() => navigate("/qrcodes/publicacao")} style={{ fontSize: 13 }}>
            Nova Publicação
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }} className="dash-animate">

        {/* Clientes */}
        <div className="stat-new" onClick={() => navigate("/clientes")} style={{ cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(99,102,241,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            {!loading && deltaCliPct !== null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: deltaCliPct >= 0 ? "#34d399" : "#f87171", background: deltaCliPct >= 0 ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", padding: "2px 8px", borderRadius: 20 }}>
                {deltaCliPct >= 0 ? "+" : ""}{deltaCliPct}%
              </span>
            )}
          </div>
          {loading ? <Sk w={60} h={34} /> : <div style={{ fontSize: 34, fontWeight: 800, color: "#818cf8", letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{fmtNum(clientes)}</div>}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginTop: 2 }}>Total Clientes</div>
          {!loading && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{cliMes} novos este mês</div>}
        </div>

        {/* QRCodes */}
        <div className="stat-new" onClick={() => navigate("/qrcodes")} style={{ cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(52,211,153,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34d399" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
            </div>
            {!loading && <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "2px 8px", borderRadius: 20 }}>+{qrMes} mês</span>}
          </div>
          {loading ? <Sk w={60} h={34} /> : <div style={{ fontSize: 34, fontWeight: 800, color: "#34d399", letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{fmtNum(qrcodes)}</div>}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginTop: 2 }}>QRCodes Gerados</div>
          {!loading && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{qrMes} publicações este mês</div>}
        </div>

        {/* Pendentes */}
        <div className="stat-new" onClick={() => navigate("/pendentes")} style={{ cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(251,191,36,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            {!loading && (
              <span style={{ fontSize: 11, fontWeight: 700, color: (pendentes ?? 0) > 0 ? "#fbbf24" : "#34d399", background: (pendentes ?? 0) > 0 ? "rgba(251,191,36,0.1)" : "rgba(52,211,153,0.1)", padding: "2px 8px", borderRadius: 20 }}>
                {(pendentes ?? 0) > 0 ? "Atenção" : "Em dia"}
              </span>
            )}
          </div>
          {loading ? <Sk w={60} h={34} /> : <div style={{ fontSize: 34, fontWeight: 800, color: "#fbbf24", letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{fmtNum(pendentes)}</div>}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginTop: 2 }}>Pendentes</div>
          {!loading && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{concluidos} concluídos no total</div>}
        </div>

        {/* Usuários */}
        <div className="stat-new" onClick={() => navigate("/usuarios")} style={{ cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(14,165,233,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          </div>
          {loading ? <Sk w={60} h={34} /> : <div style={{ fontSize: 34, fontWeight: 800, color: "#0ea5e9", letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{fmtNum(usuarios)}</div>}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginTop: 2 }}>Usuários Ativos</div>
          {!loading && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>operadores cadastrados</div>}
        </div>
      </div>

      {/* ── Linha inferior: Atividade + Status + Ações rápidas ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }} className="dash-animate">

        {/* Coluna esquerda: Clientes recentes */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>Atividade Recente</div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}>Últimos clientes adicionados</div>
            </div>
            <button className="btn-sm" onClick={() => navigate("/clientes")} style={{ fontSize: 12 }}>Ver todos</button>
          </div>

          <div style={{ padding: "8px 20px" }}>
            {loading ? (
              [1,2,3,4].map(i => (
                <div key={i} className="act-row">
                  <Sk w={38} h={38} r={50} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <Sk w="60%" h={13} />
                    <Sk w="40%" h={11} />
                  </div>
                  <Sk w={70} h={22} r={20} />
                </div>
              ))
            ) : recentes.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                Nenhum cliente ainda. <button onClick={() => navigate("/clientes")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, padding: 0 }}>Adicionar</button>
              </div>
            ) : recentes.map(r => (
              <div key={r.id} className="act-row" style={{ cursor: "pointer" }} onClick={() => navigate("/clientes")}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(r.nome), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                  {iniciais(r.nome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nome}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{r.cpf ?? "Sem CPF"} · {fmtData(r.created_at)}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap",
                  background: r.controle_status === "Concluído" ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
                  color: r.controle_status === "Concluído" ? "#34d399" : "#fbbf24",
                }}>
                  {r.controle_status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita: status + ações */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Distribuição de status */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 18 }}>Distribuição de Status</div>

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}><Sk w={80} h={80} r={50} /></div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <Ring pct={pctConc} color="#34d399" size={80} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "var(--fg)" }}>
                      {pctConc}%
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>● Concluídos</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>{fmtNum(concluidos)}</span>
                      </div>
                      <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctConc}%`, background: "#34d399", borderRadius: 4, transition: "width .8s ease" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>● Pendentes</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>{fmtNum(pendentes)}</span>
                      </div>
                      <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctPend}%`, background: "#fbbf24", borderRadius: 4, transition: "width .8s ease" }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  {fmtNum(total)} clientes no total
                </div>
              </>
            )}
          </div>

          {/* Ações rápidas */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 14 }}>Ações Rápidas</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button className="quick-btn" onClick={() => navigate("/clientes")}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                </div>
                Novo Cliente
              </button>
              <button className="quick-btn" onClick={() => navigate("/qrcodes/publicacao")}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(52,211,153,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34d399" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                </div>
                Publicar QR
              </button>
              <button className="quick-btn" onClick={() => navigate("/pendentes")}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(251,191,36,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                Pendentes
              </button>
              <button className="quick-btn" onClick={() => navigate("/usuarios")}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(14,165,233,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                Usuários
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* responsivo: stack em mobile */}
      <style>{`
        @media (max-width: 780px) {
          .dash-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
