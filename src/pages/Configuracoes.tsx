import { useState, useEffect } from "react";
import "../components/Layout.css";
import "./Configuracoes.css";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { iniciais, type UsuarioLogado } from "../lib/usuario";

export default function Configuracoes() {
  const { usuario } = useOutletContext<{ usuario: UsuarioLogado | null }>();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSistema, setNotifSistema] = useState(true);
  const [notifPendentes, setNotifPendentes] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  useEffect(() => { if (usuario) setNome(usuario.nome); }, [usuario]);

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

      <div className="cfg-grid">
        <form className="section-card" onSubmit={salvar}>
          <div className="section-card-header">
            <span className="section-card-title">Perfil</span>
          </div>
          <div className="cfg-body">
            <div className="cfg-profile">
              <div className="cfg-avatar">{iniciais(nome || usuario?.nome || "")}</div>
              <div style={{ minWidth: 0 }}>
                <div className="cfg-name">{nome}</div>
                <div className="cfg-role">{usuario?.perfil ?? ""}</div>
                <button type="button" className="btn-sm" style={{ marginTop: 8, fontSize: 12 }}>Alterar foto</button>
              </div>
            </div>

            <div className="cfg-fields">
              <div>
                <label className="cfg-label" htmlFor="cfg-nome">Nome</label>
                <input id="cfg-nome" className="cfg-input" value={nome} onChange={e => setNome(e.target.value)} />
              </div>
              <div>
                <label className="cfg-label" htmlFor="cfg-email">E-mail</label>
                <input id="cfg-email" className="cfg-input" value={email} disabled />
              </div>
            </div>
          </div>
          <div className="cfg-foot">
            {saved ? <span className="cfg-saved">✓ Alterações salvas</span> : <span />}
            <button type="submit" className="btn-primary">Salvar alterações</button>
          </div>
        </form>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Notificações</span>
          </div>
          <div className="cfg-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "Notificações por e-mail", sub: "Receber alertas e relatórios por e-mail", val: notifEmail, set: setNotifEmail },
              { label: "Notificações do sistema", sub: "Avisos em tempo real dentro do painel", val: notifSistema, set: setNotifSistema },
              { label: "Alertas de pendências", sub: "Notificar quando houver novos itens pendentes", val: notifPendentes, set: setNotifPendentes },
            ].map(n => (
              <div key={n.label} className="cfg-switch-row">
                <div>
                  <div className="cfg-switch-title">{n.label}</div>
                  <div className="cfg-switch-sub">{n.sub}</div>
                </div>
                <button type="button" className={`cfg-toggle${n.val ? " is-on" : ""}`} onClick={() => n.set(v => !v)} aria-pressed={n.val} aria-label={n.label}>
                  <span className="cfg-knob" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Segurança</span>
          </div>
          <div className="cfg-sec">
            <button className="btn-sm">Alterar senha</button>
            <button className="btn-sm">Ativar autenticação em dois fatores</button>
            <button className="btn-sm" style={{ color: "var(--error)", borderColor: "rgba(248,113,113,0.3)" }}>
              Encerrar todas as sessões ativas
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
