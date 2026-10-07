import { useState } from "react";
import "../components/Layout.css";

const CLIENTES = [
  { id: 1, nome: "João Silva",    email: "joao@email.com",     telefone: "(11) 99999-1111", status: "Ativo",    qr: 12, plano: "Pro",        data: "04/10/2026" },
  { id: 2, nome: "Maria Souza",   email: "maria@email.com",    telefone: "(21) 98888-2222", status: "Ativo",    qr: 8,  plano: "Básico",     data: "03/10/2026" },
  { id: 3, nome: "Pedro Lima",    email: "pedro@email.com",    telefone: "(31) 97777-3333", status: "Pendente", qr: 0,  plano: "Pro",        data: "02/10/2026" },
  { id: 4, nome: "Ana Costa",     email: "ana@email.com",      telefone: "(41) 96666-4444", status: "Inativo",  qr: 3,  plano: "Básico",     data: "01/10/2026" },
  { id: 5, nome: "Carlos Neto",   email: "carlos@email.com",   telefone: "(51) 95555-5555", status: "Ativo",    qr: 21, plano: "Enterprise", data: "30/09/2026" },
  { id: 6, nome: "Fernanda Reis", email: "fernanda@email.com", telefone: "(61) 94444-6666", status: "Ativo",    qr: 5,  plano: "Pro",        data: "29/09/2026" },
  { id: 7, nome: "Lucas Martins", email: "lucas@email.com",    telefone: "(71) 93333-7777", status: "Inativo",  qr: 0,  plano: "Básico",     data: "28/09/2026" },
];

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444",
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

const STATUS_OPTS = ["Todos", "Ativo", "Pendente", "Inativo"];
const PLANO_OPTS  = ["Todos", "Básico", "Pro", "Enterprise"];

const statusStyle: Record<string, { dot: string; label: string }> = {
  Ativo:    { dot: "#34d399", label: "Ativo"    },
  Pendente: { dot: "#f59e0b", label: "Pendente" },
  Inativo:  { dot: "#6b7280", label: "Inativo"  },
};

const planoStyle: Record<string, { bg: string; fg: string }> = {
  Básico:     { bg: "rgba(107,114,128,0.15)", fg: "#9ca3af"  },
  Pro:        { bg: "rgba(99,102,241,0.15)",  fg: "#818cf8"  },
  Enterprise: { bg: "rgba(16,185,129,0.15)",  fg: "#34d399"  },
};

export default function Clientes() {
  const [search,      setSearch]      = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroPlano,  setFiltroPlano]  = useState("Todos");

  const filtered = CLIENTES.filter(c => {
    const q = search.toLowerCase();
    const matchQ = c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    const matchS = filtroStatus === "Todos" || c.status === filtroStatus;
    const matchP = filtroPlano  === "Todos" || c.plano  === filtroPlano;
    return matchQ && matchS && matchP;
  });

  const ativos    = CLIENTES.filter(c => c.status === "Ativo").length;
  const pendentes = CLIENTES.filter(c => c.status === "Pendente").length;
  const inativos  = CLIENTES.filter(c => c.status === "Inativo").length;
  const totalQR   = CLIENTES.reduce((s, c) => s + c.qr, 0);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">Gerencie sua base de clientes</p>
        </div>
        <button className="btn-primary" style={{ alignSelf: "flex-end" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Cliente
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        <MetricCard label="Total de Clientes" value={CLIENTES.length} icon="👥" accent="#6366f1" />
        <MetricCard label="Clientes Ativos"   value={ativos}          icon="✅" accent="#34d399" />
        <MetricCard label="Pendentes"          value={pendentes}       icon="⏳" accent="#f59e0b" />
        <MetricCard label="QRCodes gerados"    value={totalQR}         icon="⬛" accent="#818cf8" />
      </div>

      {/* Painel principal */}
      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {/* Search */}
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

          {/* Filtros */}
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
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p>Nenhum cliente encontrado</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Cliente", "Contato", "Plano", "Status", "QRCodes", "Cadastro", ""].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", transition: "background .12s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                    {/* Cliente */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(c.nome), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0, letterSpacing: 0 }}>
                          {iniciais(c.nome)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>{c.nome}</div>
                          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}>ID #{c.id.toString().padStart(4, "0")}</div>
                        </div>
                      </div>
                    </td>

                    {/* Contato */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, color: "var(--fg)" }}>{c.email}</div>
                      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{c.telefone}</div>
                    </td>

                    {/* Plano */}
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: planoStyle[c.plano].bg, color: planoStyle[c.plano].fg }}>
                        {c.plano}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusStyle[c.status].dot, flexShrink: 0, boxShadow: `0 0 6px ${statusStyle[c.status].dot}` }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: statusStyle[c.status].dot }}>{c.status}</span>
                      </div>
                    </td>

                    {/* QRCodes */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ height: 4, width: 60, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min((c.qr / 25) * 100, 100)}%`, background: "var(--accent)", borderRadius: 4, transition: "width .4s" }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{c.qr}</span>
                      </div>
                    </td>

                    {/* Cadastro */}
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{c.data}</td>

                    {/* Ações */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button title="Ver" style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)", fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all .15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)"; }}>
                          Ver
                        </button>
                        <button title="Editar" style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid transparent", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "opacity .15s" }}
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
        <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--fg-muted)" }}>
          <span>Exibindo {filtered.length} de {CLIENTES.length} clientes</span>
          <span>{ativos} ativo{ativos !== 1 ? "s" : ""} · {inativos} inativo{inativos !== 1 ? "s" : ""} · {pendentes} pendente{pendentes !== 1 ? "s" : ""}</span>
        </div>
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
