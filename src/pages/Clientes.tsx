import { useState } from "react";
import "../components/Layout.css";

const clientes = [
  { id: 1, nome: "João Silva", email: "joao@email.com", telefone: "(11) 99999-1111", status: "Ativo", qr: 12, plano: "Pro", data: "04/10/2026" },
  { id: 2, nome: "Maria Souza", email: "maria@email.com", telefone: "(21) 98888-2222", status: "Ativo", qr: 8, plano: "Básico", data: "03/10/2026" },
  { id: 3, nome: "Pedro Lima", email: "pedro@email.com", telefone: "(31) 97777-3333", status: "Pendente", qr: 0, plano: "Pro", data: "02/10/2026" },
  { id: 4, nome: "Ana Costa", email: "ana@email.com", telefone: "(41) 96666-4444", status: "Inativo", qr: 3, plano: "Básico", data: "01/10/2026" },
  { id: 5, nome: "Carlos Neto", email: "carlos@email.com", telefone: "(51) 95555-5555", status: "Ativo", qr: 21, plano: "Enterprise", data: "30/09/2026" },
  { id: 6, nome: "Fernanda Reis", email: "fernanda@email.com", telefone: "(61) 94444-6666", status: "Ativo", qr: 5, plano: "Pro", data: "29/09/2026" },
  { id: 7, nome: "Lucas Martins", email: "lucas@email.com", telefone: "(71) 93333-7777", status: "Inativo", qr: 0, plano: "Básico", data: "28/09/2026" },
];

const statusChip: Record<string, string> = { Ativo: "chip--green", Pendente: "chip--yellow", Inativo: "chip--gray" };
const planoChip: Record<string, string> = { Básico: "chip--gray", Pro: "chip--blue", Enterprise: "chip--green" };

export default function Clientes() {
  const [search, setSearch] = useState("");
  const filtered = clientes.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <p className="page-sub">{clientes.length} clientes cadastrados</p>
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <input
            className="search-input"
            placeholder="Buscar por nome ou e-mail…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary">+ Novo Cliente</button>
        </div>
        <div className="section-card-body" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Plano</th><th>Status</th><th>QRCodes</th><th>Cadastro</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><p>Nenhum cliente encontrado</p></div></td></tr>
              ) : filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nome}</td>
                  <td style={{ color: "var(--fg-muted)" }}>{c.email}</td>
                  <td style={{ color: "var(--fg-muted)" }}>{c.telefone}</td>
                  <td><span className={`chip ${planoChip[c.plano]}`}>{c.plano}</span></td>
                  <td><span className={`chip ${statusChip[c.status]}`}>{c.status}</span></td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.qr}</td>
                  <td style={{ color: "var(--fg-muted)" }}>{c.data}</td>
                  <td><button className="btn-sm">Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`.search-input{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:13px;color:var(--fg);outline:none;width:260px;font-family:var(--font)}.search-input:focus{border-color:var(--border-focus)}`}</style>
    </>
  );
}
