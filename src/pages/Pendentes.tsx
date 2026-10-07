import { useState } from "react";
import "../components/Layout.css";

const inicial = [
  { id: 1, tipo: "Novo Cliente", descricao: "João Pedro solicitou cadastro", prioridade: "Alta", data: "06/10/2026 09:14" },
  { id: 2, tipo: "QRCode", descricao: "QR-007 aguardando aprovação de destino", prioridade: "Média", data: "06/10/2026 08:50" },
  { id: 3, tipo: "Pagamento", descricao: "Plano Pro — fatura vencida (Lucas Martins)", prioridade: "Alta", data: "05/10/2026 18:00" },
  { id: 4, tipo: "Suporte", descricao: "Fernanda Reis reportou erro no QR-005", prioridade: "Média", data: "05/10/2026 14:22" },
  { id: 5, tipo: "Novo Cliente", descricao: "Rafael Torres aguardando verificação", prioridade: "Baixa", data: "04/10/2026 11:00" },
  { id: 6, tipo: "Suporte", descricao: "QRCode estático não está sendo lido (Ana Costa)", prioridade: "Baixa", data: "03/10/2026 16:35" },
  { id: 7, tipo: "QRCode", descricao: "QR-008 link de destino inválido", prioridade: "Alta", data: "02/10/2026 10:10" },
];

const prioChip: Record<string, string> = { Alta: "chip--red", Média: "chip--yellow", Baixa: "chip--gray" };
const tipoChip: Record<string, string> = { "Novo Cliente": "chip--blue", QRCode: "chip--green", Pagamento: "chip--red", Suporte: "chip--yellow" };

export default function Pendentes() {
  const [items, setItems] = useState(inicial);

  function resolver(id: number) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pendentes</h1>
        <p className="page-sub">{items.length} item{items.length !== 1 ? "s" : ""} aguardando resolução</p>
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Fila de pendências</span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Mais recentes primeiro</span>
        </div>
        <div className="section-card-body" style={{ overflowX: "auto" }}>
          {items.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <p>Tudo resolvido! Nenhuma pendência no momento.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Tipo</th><th>Descrição</th><th>Prioridade</th><th>Data</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id}>
                    <td><span className={`chip ${tipoChip[i.tipo]}`}>{i.tipo}</span></td>
                    <td>{i.descricao}</td>
                    <td><span className={`chip ${prioChip[i.prioridade]}`}>{i.prioridade}</span></td>
                    <td style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{i.data}</td>
                    <td>
                      <button className="btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => resolver(i.id)}>
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
