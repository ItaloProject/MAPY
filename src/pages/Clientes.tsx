import { useState, useEffect } from "react";
import "../components/Layout.css";
import { supabase } from "../lib/supabase";

type Cliente = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  plano: string;
  status: string;
  created_at: string;
  qr_count?: number;
};

const AVATAR_COLORS = [
  "#0ea5e9","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#8b5cf6",
];
function avatarColor(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function iniciais(nome: string) {
  const p = nome.trim().split(" ");
  return (p[0][0] + (p[p.length - 1][0] ?? "")).toUpperCase();
}
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

const STATUS_OPTS = ["Todos", "Ativo", "Pendente", "Inativo"];
const PLANO_OPTS  = ["Todos", "Básico", "Pro", "Enterprise"];

const statusStyle: Record<string, { dot: string }> = {
  Ativo:    { dot: "#34d399" },
  Pendente: { dot: "#f59e0b" },
  Inativo:  { dot: "#6b7280" },
};
const planoStyle: Record<string, { bg: string; fg: string }> = {
  Básico:     { bg: "rgba(100,116,139,0.15)", fg: "#94a3b8" },
  Pro:        { bg: "rgba(14,165,233,0.15)",  fg: "#38bdf8" },
  Enterprise: { bg: "rgba(16,185,129,0.15)",  fg: "#34d399" },
};

export default function Clientes() {
  const [clientes,      setClientes]      = useState<Cliente[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [filtroStatus,  setFiltroStatus]  = useState("Todos");
  const [filtroPlano,   setFiltroPlano]   = useState("Todos");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data: clientesData } = await supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });

    if (!clientesData) { setLoading(false); return; }

    // conta publicações por nome de cliente (instituição)
    const { data: pubData } = await supabase
      .from("publicacoes")
      .select("instituicao");

    const contagem: Record<string, number> = {};
    for (const p of pubData ?? []) {
      if (p.instituicao) contagem[p.instituicao] = (contagem[p.instituicao] ?? 0) + 1;
    }

    setClientes(clientesData.map(c => ({ ...c, qr_count: contagem[c.nome] ?? 0 })));
    setLoading(false);
  }

  const filtered = clientes.filter(c => {
    const q = search.toLowerCase();
    const matchQ = c.nome.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
    const matchS = filtroStatus === "Todos" || c.status === filtroStatus;
    const matchP = filtroPlano  === "Todos" || c.plano  === filtroPlano;
    return matchQ && matchS && matchP;
  });

  const ativos    = clientes.filter(c => c.status === "Ativo").length;
  const pendentes = clientes.filter(c => c.status === "Pendente").length;
  const inativos  = clientes.filter(c => c.status === "Inativo").length;
  const totalQR   = clientes.reduce((s, c) => s + (c.qr_count ?? 0), 0);

  return (
    <>
      {/* Cabeçalho */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">Gerencie sua base de clientes</p>
        </div>
        <button className="btn-primary" style={{ alignSelf: "center", marginTop: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Cliente
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        <MetricCard label="Total de Clientes" value={clientes.length} icon="👥" accent="#6366f1" />
        <MetricCard label="Clientes Ativos"   value={ativos}          icon="✅" accent="#34d399" />
        <MetricCard label="Pendentes"          value={pendentes}       icon="⏳" accent="#f59e0b" />
        <MetricCard label="Publicações"        value={totalQR}         icon="📄" accent="#818cf8" />
      </div>

      {/* Painel principal */}
      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)", pointerEvents: "none" }}
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--fg)", outline: "none", boxSizing: "border-box" }}
              placeholder="Buscar por nome ou e-mail…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_OPTS.map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                style={{ padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid", cursor: "pointer", transition: "all .15s",
                  background: filtroStatus === s ? "var(--accent)" : "transparent",
                  borderColor: filtroStatus === s ? "var(--accent)" : "var(--border)",
                  color: filtroStatus === s ? "#fff" : "var(--fg-muted)" }}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PLANO_OPTS.map(p => (
              <button key={p} onClick={() => setFiltroPlano(p)}
                style={{ padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid", cursor: "pointer", transition: "all .15s",
                  background: filtroPlano === p ? "var(--accent)" : "transparent",
                  borderColor: filtroPlano === p ? "var(--accent)" : "var(--border)",
                  color: filtroPlano === p ? "#fff" : "var(--fg-muted)" }}>
                {p}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Tabela */}
        <div style={{ overflowX: "auto" }}>
          {loading ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <div style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <p style={{ marginTop: 12 }}>Carregando clientes…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p>{clientes.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Cliente", "Contato", "Plano", "Status", "Publicações", "Cadastro", ""].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", transition: "background .12s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(c.nome), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {iniciais(c.nome)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>{c.nome}</div>
                          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}>{c.email ?? "—"}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, color: "var(--fg)" }}>{c.email ?? "—"}</div>
                      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{c.telefone ?? "—"}</div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: (planoStyle[c.plano] ?? planoStyle["Básico"]).bg, color: (planoStyle[c.plano] ?? planoStyle["Básico"]).fg }}>
                        {c.plano}
                      </span>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: (statusStyle[c.status] ?? statusStyle["Inativo"]).dot, flexShrink: 0, boxShadow: `0 0 6px ${(statusStyle[c.status] ?? statusStyle["Inativo"]).dot}` }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: (statusStyle[c.status] ?? statusStyle["Inativo"]).dot }}>{c.status}</span>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ height: 4, width: 60, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(((c.qr_count ?? 0) / 25) * 100, 100)}%`, background: "var(--accent)", borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{c.qr_count ?? 0}</span>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{fmtData(c.created_at)}</td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all .15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)"; }}>
                          Ver
                        </button>
                        <button style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid transparent", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "opacity .15s" }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = ".85")}
                          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--fg-muted)" }}>
            <span>Exibindo {filtered.length} de {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</span>
            <span>{ativos} ativo{ativos !== 1 ? "s" : ""} · {inativos} inativo{inativos !== 1 ? "s" : ""} · {pendentes} pendente{pendentes !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </>
  );
}

function MetricCard({ label, value, icon, accent }: { label: string; value: number; icon: string; accent: string }) {
  return (
    <div className="section-card" style={{ padding: "20px 22px", margin: 0, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: accent, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4, lineHeight: 1.2 }}>{label}</div>
      </div>
    </div>
  );
}
