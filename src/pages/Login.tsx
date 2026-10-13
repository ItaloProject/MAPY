import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import { supabase } from "../lib/supabase";

// Data por extenso no formato do SIA: "Segunda, 5 de outubro de 2026"
function dataExtenso(): string {
  const hoje = new Date();
  const semana = hoje.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
  const resto = hoje.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${resto}`;
}

export default function Login({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();

  useEffect(() => { document.title = "SIA - Sistema de Informações Acadêmicas - Estacio"; }, []);

  const [matricula, setMatricula] = useState("");
  const [senha,     setSenha]     = useState("");
  const [showPass,  setShowPass]  = useState(false);
  const [robo,      setRobo]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [erro,      setErro]      = useState<string | null>(null);
  const [sucesso,   setSucesso]   = useState(false);
  const [bannerAberto, setBannerAberto] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const id = matricula.trim();
    if (!id || !senha) { setErro("Informe sua matrícula e senha."); return; }
    if (!robo)         { setErro("Confirme que você não é um robô."); return; }

    setLoading(true);
    // Usuários gerenciados entram com <matrícula>@emec.app; admin-mestre usa e-mail real.
    const email = id.includes("@") ? id : `${id}@emec.app`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error || !data.user) {
      setLoading(false);
      setErro("Matrícula ou senha incorretas.");
      return;
    }

    const { data: cad } = await supabase
      .from("usuarios")
      .select("status")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (cad?.status === "Suspenso") {
      await supabase.auth.signOut();
      setLoading(false);
      setErro("Acesso suspenso. Procure o administrador.");
      return;
    }

    // Registra o último acesso (usuário gerenciado pela matrícula, admin-mestre pelo e-mail).
    const filtro = email.endsWith("@emec.app") ? { auth_user_id: data.user.id } : { email };
    await supabase.from("usuarios").update({ ultimo_acesso: new Date().toISOString() }).match(filtro);

    setLoading(false);
    setSucesso(true);
    setTimeout(() => { onLogin(); navigate("/dashboard"); }, 900);
  }

  const podeEntrar = !!matricula.trim() && !!senha && robo && !loading;

  return (
    <div className="sia-page">

      {/* Banner institucional que desce/sobe ao clicar no chevron */}
      <div className={`sia-banner${bannerAberto ? " sia-banner--open" : ""}`} aria-hidden={!bannerAberto}>
        <div className="sia-banner-inner">
          <div className="sia-banner-texto">Ensino <strong>Estácio.</strong><br />Brilhe com <strong>+ tecnologia.</strong></div>
          <img
            className="sia-banner-img"
            src="https://sia.estacio.br/sianet/Content/SiteNovo/dist/img/banners/banner_01.png"
            alt=""
          />
        </div>
      </div>

      <div className="sia-card">

        {/* Chevron: abre/fecha o banner */}
        <button
          type="button"
          className={`sia-collapse${bannerAberto ? " aberto" : ""}`}
          aria-label={bannerAberto ? "Recolher imagem" : "Mostrar imagem"}
          aria-expanded={bannerAberto}
          onClick={() => setBannerAberto(v => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {sucesso ? (
          <div className="sia-success">
            <div className="sia-success-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="sia-success-title">Acesso autorizado</h2>
            <p className="sia-success-sub">Redirecionando ao painel…</p>
          </div>
        ) : (
          <>
            {/* Marca */}
            <div className="sia-brand">
              <svg className="sia-logo" width="46" height="46" viewBox="0 0 78 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <polygon points="39,4 74,23 39,42 4,23"  fill="#2f7fd1" />
                <polygon points="4,23 39,42 39,76 4,57"  fill="#123a6b" />
                <polygon points="74,23 74,57 39,76 39,42" fill="#0d2a4e" />
                <polygon points="39,8 70,25 39,38 8,25"  fill="#fff" opacity="0.14" />
              </svg>
              <span className="sia-wordmark">Estácio</span>
            </div>

            <h1 className="sia-title">SIA - Sistema de Informações Acadêmicas</h1>
            <p className="sia-date">{dataExtenso()}</p>

            {/* Botão institucional (decorativo) */}
            <button type="button" className="sia-btn-email" onClick={() => {}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Entrar com e-mail de estudante
            </button>

            <div className="sia-ou"><span>OU</span></div>

            <form className="sia-form" onSubmit={handleSubmit} noValidate>
              <label className="sia-label" htmlFor="matricula">Matrícula</label>
              <div className="sia-input-wrap">
                <input
                  id="matricula"
                  className="sia-input"
                  placeholder="Digite sua matrícula"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={matricula}
                  onChange={e => { setMatricula(e.target.value); setErro(null); }}
                />
                <span className="sia-input-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <circle cx="8" cy="10" r="2" />
                    <path d="M14 9h4M14 13h4M4 16c0-1.7 1.8-3 4-3s4 1.3 4 3" />
                  </svg>
                </span>
              </div>
              <a href="#" className="sia-link sia-link-right" onClick={e => e.preventDefault()}>
                Não sei ou esqueci a matrícula
              </a>

              <label className="sia-label" htmlFor="senha">Senha</label>
              <div className="sia-input-wrap">
                <input
                  id="senha"
                  className="sia-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setErro(null); }}
                />
                <button type="button" className="sia-input-icon sia-eye" onClick={() => setShowPass(v => !v)} aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}>
                  {showPass ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="sia-links-row">
                <a href="#" className="sia-link" onClick={e => e.preventDefault()}>Esqueci minha senha / Cadastrar primeira senha</a>
              </div>

              {/* reCAPTCHA (decorativo) */}
              <div className="sia-recaptcha">
                <label className="sia-recaptcha-check">
                  <input type="checkbox" checked={robo} onChange={e => { setRobo(e.target.checked); setErro(null); }} />
                  <span className="sia-recaptcha-box" />
                  <span className="sia-recaptcha-label">Não sou um robô</span>
                </label>
                <div className="sia-recaptcha-brand">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1c3aa9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
                  </svg>
                  <span>reCAPTCHA</span>
                </div>
              </div>
              <p className="sia-recaptcha-note">Este site está excedendo a cota gratuita do reCAPTCHA Enterprise.</p>

              {erro && <div className="sia-erro">{erro}</div>}

              <button type="submit" className="sia-btn-entrar" disabled={!podeEntrar}>
                {loading ? <span className="sia-spinner" /> : "Entrar"}
              </button>
            </form>

            <div className="sia-help">
              <span>Está com dúvidas para fazer o login?</span>
              <a href="#" className="sia-help-link" onClick={e => e.preventDefault()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Acessar Ajuda
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
