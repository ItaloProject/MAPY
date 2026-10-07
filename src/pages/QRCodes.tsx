import { useNavigate } from "react-router-dom";
import "../components/Layout.css";
import "./QRCodes.css";

const grupos = [
  {
    id: "publicacao",
    nome: "PUBLICAÇÃO",
    descricao: "Publicações no Diário Oficial — geração e gestão de registros",
    total: 6,
    ativos: 4,
    cor: "#6366f1",
    bg: "rgba(99,102,241,0.08)",
    bordaAtiva: "rgba(99,102,241,0.4)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" x2="8" y1="13" y2="13"/>
        <line x1="16" x2="8" y1="17" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
];

export default function QRCodes() {
  const navigate = useNavigate();

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">QRCodes</h1>
        <p className="page-sub">Selecione um grupo para gerenciar</p>
      </div>

      <div className="grupos-grid">
        {grupos.map(g => (
          <button
            key={g.id}
            className="grupo-card"
            style={{ "--cor": g.cor, "--bg": g.bg, "--borda": g.bordaAtiva } as React.CSSProperties}
            onClick={() => navigate(`/qrcodes/${g.id}`)}
          >
            <div className="grupo-icon" style={{ background: g.bg, color: g.cor }}>
              {g.icon}
            </div>
            <div className="grupo-info">
              <div className="grupo-nome">{g.nome}</div>
              <div className="grupo-desc">{g.descricao}</div>
            </div>
            <div className="grupo-meta">
              <div className="grupo-stat">
                <span className="grupo-stat-val">{g.total}</span>
                <span className="grupo-stat-label">total</span>
              </div>
              <div className="grupo-stat">
                <span className="grupo-stat-val" style={{ color: "#34d399" }}>{g.ativos}</span>
                <span className="grupo-stat-label">ativos</span>
              </div>
            </div>
            <div className="grupo-arrow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
        ))}

        <div className="grupo-card grupo-card--vazio">
          <div className="grupo-icon" style={{ background: "rgba(139,143,168,0.08)", color: "var(--fg-muted)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/>
            </svg>
          </div>
          <div className="grupo-info">
            <div className="grupo-nome" style={{ color: "var(--fg-muted)" }}>Novo grupo</div>
            <div className="grupo-desc">Em breve novos tipos de QRCode</div>
          </div>
        </div>
      </div>
    </>
  );
}
