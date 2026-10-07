import { useState } from "react";
import "../components/Layout.css";

export default function Configuracoes() {
  const [nome, setNome] = useState("Italo Admin");
  const [email] = useState("suporte.ferramentas@cgbengenharia.com.br");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSistema, setNotifSistema] = useState(true);
  const [notifPendentes, setNotifPendentes] = useState(false);
  const [saved, setSaved] = useState(false);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
        <p className="page-sub">Preferências da conta e do sistema</p>
      </div>

      <div style={{ display: "grid", gap: 20, maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <form className="section-card" onSubmit={salvar}>
          <div className="section-card-header">
            <span className="section-card-title">Perfil</span>
          </div>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "var(--accent)",
                color: "#fff", fontSize: 18, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>IT</div>
              <div>
                <div style={{ fontWeight: 600, color: "var(--fg)" }}>{nome}</div>
                <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>Administrador</div>
                <button type="button" className="btn-sm" style={{ marginTop: 8, fontSize: 12 }}>Alterar foto</button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>Nome</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontSize: 14, color: "var(--fg)", outline: "none", fontFamily: "var(--font)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>E-mail</label>
                <input
                  value={email}
                  disabled
                  style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontSize: 14, color: "var(--fg-muted)", outline: "none", fontFamily: "var(--font)", cursor: "not-allowed" }}
                />
              </div>
            </div>
          </div>
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {saved && <span style={{ fontSize: 13, color: "var(--success)" }}>✓ Alterações salvas</span>}
            {!saved && <span />}
            <button type="submit" className="btn-primary">Salvar alterações</button>
          </div>
        </form>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Notificações</span>
          </div>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "Notificações por e-mail", sub: "Receber alertas e relatórios por e-mail", val: notifEmail, set: setNotifEmail },
              { label: "Notificações do sistema", sub: "Avisos em tempo real dentro do painel", val: notifSistema, set: setNotifSistema },
              { label: "Alertas de pendências", sub: "Notificar quando houver novos itens pendentes", val: notifPendentes, set: setNotifPendentes },
            ].map(n => (
              <div key={n.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{n.label}</div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{n.sub}</div>
                </div>
                <button
                  type="button"
                  onClick={() => n.set(v => !v)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: n.val ? "var(--accent)" : "var(--border)",
                    position: "relative", flexShrink: 0, transition: "background 0.2s"
                  }}
                  aria-pressed={n.val}
                >
                  <span style={{
                    position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    left: n.val ? 23 : 3
                  }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Segurança</span>
          </div>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="btn-sm" style={{ alignSelf: "flex-start" }}>Alterar senha</button>
            <button className="btn-sm" style={{ alignSelf: "flex-start" }}>Ativar autenticação em dois fatores</button>
            <button className="btn-sm" style={{ alignSelf: "flex-start", color: "var(--error)", borderColor: "rgba(248,113,113,0.3)" }}>
              Encerrar todas as sessões ativas
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
