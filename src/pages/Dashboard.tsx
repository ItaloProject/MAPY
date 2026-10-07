import "../components/Layout.css";

const stats = [
  { label: "Total Clientes", value: "1.284", delta: "+12% este mês", dir: "up",  color: "#6366f1", bg: "rgba(99,102,241,0.12)",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { label: "QRCodes Gerados", value: "3.470", delta: "+8% este mês", dir: "up", color: "#34d399", bg: "rgba(52,211,153,0.12)",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg> },
  { label: "Pendentes", value: "7", delta: "-3 desde ontem", dir: "down", color: "#fbbf24", bg: "rgba(251,191,36,0.12)",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { label: "Usuários Ativos", value: "24", delta: "+2 este mês", dir: "up", color: "#818cf8", bg: "rgba(129,140,248,0.12)",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

const recentClientes = [
  { nome: "João Silva", email: "joao@email.com", status: "Ativo", qr: 12, data: "04/10/2026" },
  { nome: "Maria Souza", email: "maria@email.com", status: "Ativo", qr: 8, data: "03/10/2026" },
  { nome: "Pedro Lima", email: "pedro@email.com", status: "Pendente", qr: 0, data: "02/10/2026" },
  { nome: "Ana Costa", email: "ana@email.com", status: "Inativo", qr: 3, data: "01/10/2026" },
  { nome: "Carlos Neto", email: "carlos@email.com", status: "Ativo", qr: 21, data: "30/09/2026" },
];

const statusChip: Record<string, string> = {
  Ativo: "chip--green", Pendente: "chip--yellow", Inativo: "chip--gray",
};

export default function Dashboard() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Visão geral do sistema — atualizado agora</p>
      </div>

      <div className="stats-row">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-delta ${s.dir}`}>{s.dir === "up" ? "↑" : "↓"} {s.delta}</div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Clientes Recentes</span>
          <button className="btn-sm">Ver todos</button>
        </div>
        <div className="section-card-body" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th><th>E-mail</th><th>Status</th><th>QRCodes</th><th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {recentClientes.map(c => (
                <tr key={c.email}>
                  <td style={{ fontWeight: 600 }}>{c.nome}</td>
                  <td style={{ color: "var(--fg-muted)" }}>{c.email}</td>
                  <td><span className={`chip ${statusChip[c.status]}`}>{c.status}</span></td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.qr}</td>
                  <td style={{ color: "var(--fg-muted)" }}>{c.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
