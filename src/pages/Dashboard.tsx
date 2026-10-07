import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../components/Layout.css";
import { supabase } from "../lib/supabase";

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
const COLORS = ["#818cf8","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#8b5cf6","#ec4899"];
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

type Recente = { id: string; nome: string; cpf: string | null; controle_status: string; created_at: string };

function Sk({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "var(--surface-2)", animation: "sk 1.4s ease infinite", flexShrink: 0 }} />;
}

function Ring({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray .8s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
}

const CARDS = [
  { key: "clientes",  label: "Clientes",       color: "#818cf8", bg: "rgba(99,102,241,0.13)",  route: "/clientes",  icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: "qrcodes",   label: "QR Publicados",  color: "#34d399", bg: "rgba(52,211,153,0.13)",  route: "/qrcodes",   icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg> },
  { key: "pendentes", label: "Pendentes",      color: "#fbbf24", bg: "rgba(251,191,36,0.13)",  route: "/pendentes", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { key: "usuarios",  label: "Usuários Ativos",color: "#0ea5e9", bg: "rgba(14,165,233,0.13)", route: "/usuarios",  icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading,    setLoading]    = useState(true);
  const [clientes,   setClientes]   = useState<number | null>(null);
  const [qrcodes,    setQrcodes]    = useState<number | null>(null);
  const [pendentes,  setPendentes]  = useState<number | null>(null);
  const [concluidos, setConcluidos] = useState<number | null>(null);
  const [usuarios,   setUsuarios]   = useState<number | null>(null);
  const [recentes,   setRecentes]   = useState<Recente[]>([]);
  const [nomeAdmin,  setNomeAdmin]  = useState("Admin");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.nome) setNomeAdmin(user.user_metadata.nome.split(" ")[0]);
      else if (user?.email) setNomeAdmin(user.email.split("@")[0]);
    });

    async function load() {
      setLoading(true);
      const [
        { count: tCli },
        { count: tQR },
        { count: tPend },
        { count: tConc },
        { count: tUsu },
        { data: rec },
      ] = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("publicacoes").select("*", { count: "exact", head: true }),
        supabase.from("clientes").select("*", { count: "exact", head: true }).eq("controle_status", "Pendente"),
        supabase.from("clientes").select("*", { count: "exact", head: true }).eq("controle_status", "Concluído"),
        supabase.from("usuarios").select("*", { count: "exact", head: true }).eq("status", "Ativo"),
        supabase.from("clientes").select("id,nome,cpf,controle_status,created_at").order("created_at", { ascending: false }).limit(6),
      ]);
      setClientes(tCli ?? 0);
      setQrcodes(tQR ?? 0);
      setPendentes(tPend ?? 0);
      setConcluidos(tConc ?? 0);
      setUsuarios(tUsu ?? 0);
      setRecentes((rec ?? []) as Recente[]);
      setLoading(false);
    }
    load();
  }, []);

  const vals: Record<string, number | null> = { clientes, qrcodes, pendentes, usuarios };
  const total   = (pendentes ?? 0) + (concluidos ?? 0);
  const pctConc = total > 0 ? Math.round(((concluidos ?? 0) / total) * 100) : 0;

  return (
    <>
      <style>{`
        @keyframes sk { 0%,100%{opacity:.4} 50%{opacity:.9} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .db-wrap { display:flex; flex-direction:column; gap:16px; animation:fadeUp .3s ease both; }
        .db-cards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .db-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; display:flex; align-items:center; gap:12px; cursor:pointer; transition:border-color .15s,transform .15s; }
        .db-card:hover { border-color:var(--accent); transform:translateY(-1px); }
        .db-body { display:grid; grid-template-columns:1fr 260px; gap:12px; }
        .db-panel { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
        .db-panel-hd { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border); }
        .db-panel-hd-title { font-size:13px; font-weight:700; color:var(--fg); }
        .act-row { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .12s; }
        .act-row:last-child { border-bottom:none; }
        .act-row:hover { background:var(--surface-2); }
        .qbtn { display:flex; align-items:center; gap:8px; padding:9px 12px; background:var(--surface-2); border:1px solid var(--border); border-radius:9px; cursor:pointer; transition:all .15s; color:var(--fg-muted); font-size:12px; font-weight:600; width:100%; }
        .qbtn:hover { border-color:var(--accent); color:var(--accent); background:rgba(14,165,233,0.05); }
        @media(max-width:860px){ .db-cards{grid-template-columns:repeat(2,1fr)} .db-body{grid-template-columns:1fr} }
        @media(max-width:480px){ .db-cards{grid-template-columns:1fr 1fr} }
      `}</style>

      <div className="db-wrap">

        {/* ── Saudação compacta ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
          <div>
            <span style={{ fontSize:13, color:"var(--accent)", fontWeight:600 }}>{saudacao()}, {nomeAdmin}</span>
            <h1 style={{ fontSize:20, fontWeight:800, color:"var(--fg)", margin:"2px 0 0", letterSpacing:"-.02em" }}>Painel e-MEC</h1>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn-sm" style={{ fontSize:12 }} onClick={() => navigate("/clientes")}>+ Cliente</button>
            <button className="btn-primary" style={{ fontSize:12 }} onClick={() => navigate("/qrcodes/publicacao")}>+ Publicação</button>
          </div>
        </div>

        {/* ── 4 cards ── */}
        <div className="db-cards">
          {CARDS.map(card => (
            <div key={card.key} className="db-card" onClick={() => navigate(card.route)}>
              <div style={{ width:32, height:32, borderRadius:8, background:card.bg, display:"flex", alignItems:"center", justifyContent:"center", color:card.color, flexShrink:0 }}>
                {card.icon}
              </div>
              <div style={{ minWidth:0 }}>
                {loading
                  ? <Sk w={36} h={20} />
                  : <div style={{ fontSize:22, fontWeight:800, color:card.color, letterSpacing:"-.03em", lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{fmtNum(vals[card.key] ?? null)}</div>
                }
                <div style={{ fontSize:11, color:"var(--fg-muted)", fontWeight:600, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Corpo principal ── */}
        <div className="db-body">

          {/* Atividade Recente */}
          <div className="db-panel">
            <div className="db-panel-hd">
              <span className="db-panel-hd-title">Atividade Recente</span>
              <button className="btn-sm" style={{ fontSize:11, padding:"4px 10px" }} onClick={() => navigate("/clientes")}>Ver todos</button>
            </div>
            {loading ? (
              [1,2,3].map(i => (
                <div key={i} className="act-row">
                  <Sk w={34} h={34} r={50} />
                  <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
                    <Sk w="55%" h={12} />
                    <Sk w="35%" h={10} />
                  </div>
                  <Sk w={60} h={20} r={20} />
                </div>
              ))
            ) : recentes.length === 0 ? (
              <div style={{ padding:"32px 16px", textAlign:"center", color:"var(--fg-muted)", fontSize:13 }}>
                Nenhum cliente ainda.{" "}
                <button onClick={() => navigate("/clientes")} style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", fontSize:13, padding:0 }}>Adicionar</button>
              </div>
            ) : recentes.map(r => (
              <div key={r.id} className="act-row" onClick={() => navigate("/clientes")}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:avatarColor(r.nome), display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"#fff", flexShrink:0 }}>
                  {iniciais(r.nome)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--fg)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.nome}</div>
                  <div style={{ fontSize:11, color:"var(--fg-muted)", marginTop:1 }}>{r.cpf ?? "Sem CPF"} · {fmtData(r.created_at)}</div>
                </div>
                <span style={{
                  fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap", flexShrink:0,
                  background: r.controle_status === "Concluído" ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
                  color: r.controle_status === "Concluído" ? "#34d399" : "#fbbf24",
                }}>
                  {r.controle_status}
                </span>
              </div>
            ))}
          </div>

          {/* Coluna direita */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* Distribuição */}
            <div className="db-panel" style={{ padding:"14px 16px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--fg)", marginBottom:12 }}>Status dos Clientes</div>
              {loading ? (
                <div style={{ display:"flex", justifyContent:"center" }}><Sk w={72} h={72} r={50} /></div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ position:"relative", flexShrink:0 }}>
                    <Ring pct={pctConc} color="#34d399" size={72} />
                    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"var(--fg)" }}>{pctConc}%</div>
                  </div>
                  <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontSize:11, color:"#34d399", fontWeight:600 }}>Concluídos</span>
                        <span style={{ fontSize:11, fontWeight:700, color:"var(--fg)" }}>{fmtNum(concluidos)}</span>
                      </div>
                      <div style={{ height:3, background:"var(--surface-2)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pctConc}%`, background:"#34d399", borderRadius:3, transition:"width .8s ease" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontSize:11, color:"#fbbf24", fontWeight:600 }}>Pendentes</span>
                        <span style={{ fontSize:11, fontWeight:700, color:"var(--fg)" }}>{fmtNum(pendentes)}</span>
                      </div>
                      <div style={{ height:3, background:"var(--surface-2)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${100 - pctConc}%`, background:"#fbbf24", borderRadius:3, transition:"width .8s ease" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ fontSize:11, color:"var(--fg-muted)", marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)", textAlign:"center" }}>
                {fmtNum(total)} clientes no total
              </div>
            </div>

            {/* Ações rápidas */}
            <div className="db-panel" style={{ padding:"14px 16px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--fg)", marginBottom:10 }}>Ações Rápidas</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {[
                  { label:"Novo Cliente",     route:"/clientes",           color:"#818cf8", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> },
                  { label:"Nova Publicação",  route:"/qrcodes/publicacao", color:"#34d399", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg> },
                  { label:"Ver Pendentes",    route:"/pendentes",          color:"#fbbf24", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                  { label:"Gerenciar Usuários",route:"/usuarios",          color:"#0ea5e9", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                ].map(a => (
                  <button key={a.route} className="qbtn" onClick={() => navigate(a.route)}>
                    <span style={{ color:a.color }}>{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
