import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { iniciais, type UsuarioLogado } from "../lib/usuario";
import { usePwaInstall } from "../lib/pwa";
import "../components/Layout.css";
import "./Configuracoes.css";

type ModalTipo = "senha" | "sessoes" | null;

export default function Configuracoes() {
  const { usuario } = useOutletContext<{ usuario: UsuarioLogado | null }>();
  const pwa = usePwaInstall();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSistema, setNotifSistema] = useState(true);
  const [notifPendentes, setNotifPendentes] = useState(false);
  const [saved, setSaved] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalTipo>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confSenha, setConfSenha] = useState("");
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [verif, setVerif] = useState<"" | "buscando" | "ok" | "nova">("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user?.email) setEmail(user.email); });
  }, []);
  useEffect(() => { if (usuario) setNome(usuario.nome); }, [usuario]);

  // Usuários gerenciados entram com <matrícula>@emec.app
  const ehMatricula = email.endsWith("@emec.app");

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function fecharModal() {
    setModal(null); setNovaSenha(""); setConfSenha(""); setSenhaErro(null); setBusy(false);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const n = nome.trim();
    if (!n) { setErro("Informe seu nome."); return; }
    setErro(null);
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSalvando(false); setErro("Sessão expirada. Entre novamente."); return; }
    await supabase.from("usuarios").update({ nome: n }).eq("auth_user_id", user.id);
    const { error } = await supabase.auth.updateUser({ data: { nome: n } });
    setSalvando(false);
    if (error) { setErro("Não foi possível salvar. Tente novamente."); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function trocarSenha() {
    setSenhaErro(null);
    if (novaSenha.length < 8) { setSenhaErro("A senha deve ter pelo menos 8 caracteres."); return; }
    if (novaSenha !== confSenha) { setSenhaErro("As senhas não coincidem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setBusy(false);
    if (error) {
      setSenhaErro(/different/i.test(error.message) ? "A nova senha deve ser diferente da atual." : "Não foi possível alterar a senha.");
      return;
    }
    fecharModal();
    mostrarToast("Senha alterada com sucesso.");
  }

  async function encerrarSessoes() {
    setBusy(true);
    await supabase.auth.signOut({ scope: "global" }); // o App volta para o login sozinho
  }

  async function verificarAtualizacao() {
    setVerif("buscando");
    let nova = false;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      await new Promise(r => setTimeout(r, 1500));
      nova = !!(reg?.installing || reg?.waiting);
      if (nova) navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    } catch { /* sem service worker (modo desenvolvimento) */ }
    setVerif(nova ? "nova" : "ok");
  }

  return (
    <>
      {toast && <div className="cfg-toast">✓ {toast}</div>}

      {modal && (
        <div className="cfg-backdrop" onClick={e => e.target === e.currentTarget && !busy && fecharModal()}>
          <div className="cfg-sheet" role="dialog" aria-modal="true">
            {modal === "senha" && (
              <>
                <h3 className="cfg-sheet-title">Alterar senha</h3>
                <div className="cfg-fields">
                  <div>
                    <label className="cfg-label" htmlFor="cfg-nova">Nova senha</label>
                    <input id="cfg-nova" type="password" className="cfg-input" autoComplete="new-password" autoFocus
                      value={novaSenha} onChange={e => { setNovaSenha(e.target.value); setSenhaErro(null); }} placeholder="Mínimo de 8 caracteres" />
                  </div>
                  <div>
                    <label className="cfg-label" htmlFor="cfg-conf">Confirmar nova senha</label>
                    <input id="cfg-conf" type="password" className="cfg-input" autoComplete="new-password"
                      value={confSenha} onChange={e => { setConfSenha(e.target.value); setSenhaErro(null); }}
                      onKeyDown={e => e.key === "Enter" && trocarSenha()} />
                  </div>
                </div>
                {senhaErro && <p className="cfg-err">{senhaErro}</p>}
                <div className="cfg-sheet-actions">
                  <button className="btn-sm" onClick={fecharModal} disabled={busy}>Cancelar</button>
                  <button className="btn-primary" onClick={trocarSenha} disabled={busy}>{busy ? "Salvando…" : "Alterar senha"}</button>
                </div>
              </>
            )}

            {modal === "sessoes" && (
              <>
                <h3 className="cfg-sheet-title" style={{ color: "#f87171" }}>Encerrar todas as sessões</h3>
                <p className="cfg-sheet-text">
                  Você será desconectado de <strong>todos os aparelhos</strong>, inclusive este, e precisará entrar novamente.
                </p>
                <div className="cfg-sheet-actions">
                  <button className="btn-sm" onClick={fecharModal} disabled={busy}>Cancelar</button>
                  <button className="btn-primary" style={{ background: "#ef4444" }} onClick={encerrarSessoes} disabled={busy}>{busy ? "Saindo…" : "Encerrar sessões"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
              </div>
            </div>

            <div className="cfg-fields">
              <div>
                <label className="cfg-label" htmlFor="cfg-nome">Nome</label>
                <input id="cfg-nome" className="cfg-input" value={nome} onChange={e => { setNome(e.target.value); setErro(null); }} />
              </div>
              <div>
                <label className="cfg-label" htmlFor="cfg-email">{ehMatricula ? "Matrícula" : "E-mail"}</label>
                <input id="cfg-email" className="cfg-input" value={ehMatricula ? email.replace("@emec.app", "") : email} disabled />
              </div>
            </div>
            {erro && <p className="cfg-err">{erro}</p>}
          </div>
          <div className="cfg-foot">
            {saved ? <span className="cfg-saved">✓ Alterações salvas</span> : <span />}
            <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
          </div>
        </form>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Aplicativo</span>
          </div>
          <div className="cfg-sec">
            {pwa.instalado ? (
              <div className="cfg-app-ok">✓ App instalado neste aparelho</div>
            ) : pwa.podeInstalar ? (
              <button className="btn-primary cfg-install" onClick={pwa.instalar}>Instalar app</button>
            ) : (
              <p className="cfg-hint">
                {pwa.ios
                  ? "No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”."
                  : "Para instalar: abra o menu ⋮ do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”."}
              </p>
            )}
            <button type="button" className="btn-sm" onClick={verificarAtualizacao} disabled={verif === "buscando"}>
              {verif === "buscando" ? "Verificando…" : verif === "ok" ? "✓ Você está na versão mais recente" : verif === "nova" ? "Nova versão encontrada — atualizando…" : "Verificar atualização"}
            </button>
          </div>
        </div>

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
            <button className="btn-sm" onClick={() => setModal("senha")}>Alterar senha</button>
            <button className="btn-sm" disabled title="Em breve">Autenticação em dois fatores (em breve)</button>
            <button className="btn-sm" style={{ color: "var(--error)", borderColor: "rgba(248,113,113,0.3)" }} onClick={() => setModal("sessoes")}>
              Encerrar todas as sessões ativas
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
