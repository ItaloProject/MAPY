import "../components/Layout.css";

const usuarios = [
  { id: 1, nome: "Italo Admin", email: "suporte.ferramentas@cgbengenharia.com.br", perfil: "Administrador", status: "Ativo", ultimo: "06/10/2026 09:00" },
  { id: 2, nome: "Carla Ops", email: "carla@empresa.com", perfil: "Operador", status: "Ativo", ultimo: "05/10/2026 17:30" },
  { id: 3, nome: "Roberto Suporte", email: "roberto@empresa.com", perfil: "Suporte", status: "Ativo", ultimo: "04/10/2026 14:00" },
  { id: 4, nome: "Tatiane Viewer", email: "tatiane@empresa.com", perfil: "Visualizador", status: "Inativo", ultimo: "20/09/2026 10:00" },
];

const perfilChip: Record<string, string> = {
  Administrador: "chip--red",
  Operador: "chip--blue",
  Suporte: "chip--yellow",
  Visualizador: "chip--gray",
};
const statusChip: Record<string, string> = { Ativo: "chip--green", Inativo: "chip--gray" };

export default function Usuarios() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Usuários</h1>
        <p className="page-sub">{usuarios.length} usuários do sistema</p>
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Equipe</span>
          <button className="btn-primary">+ Convidar Usuário</button>
        </div>
        <div className="section-card-body" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th></th></tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--accent), #7c3aed)",
                        color: "#fff", fontSize: 11, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                      }}>
                        {u.nome.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <span style={{ fontWeight: 600 }}>{u.nome}</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--fg-muted)" }}>{u.email}</td>
                  <td><span className={`chip ${perfilChip[u.perfil]}`}>{u.perfil}</span></td>
                  <td><span className={`chip ${statusChip[u.status]}`}>{u.status}</span></td>
                  <td style={{ color: "var(--fg-muted)" }}>{u.ultimo}</td>
                  <td><button className="btn-sm">Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
