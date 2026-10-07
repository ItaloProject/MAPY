import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import { supabase } from "../lib/supabase";

type Field = "email" | "password";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [success, setSuccess] = useState(false);

  function validate() {
    const e: Partial<Record<Field, string>> = {};
    if (!email.trim()) e.email = "Usuário é obrigatório";
    if (!password) e.password = "Senha é obrigatória";
    else if (password.length < 6) e.password = "Mínimo de 6 caracteres";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErrors({ password: "Credenciais inválidas" });
      return;
    }
    setSuccess(true);
    setTimeout(() => { onLogin(); navigate("/dashboard"); }, 1000);
  }

  function handleChange(field: Field, val: string) {
    if (field === "email") setEmail(val);
    else setPassword(val);
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="page">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="header">
        <div className="logo-row">
          <div className="cube-wrap">
            <svg width="78" height="80" viewBox="0 0 78 80" xmlns="http://www.w3.org/2000/svg" aria-label="Logo e-MEC">
              <polygon points="39,4 74,23 39,42 4,23" fill="#7DD43A"/>
              <polygon points="4,23 39,42 39,76 4,57" fill="#3A9A1E"/>
              <polygon points="74,23 74,57 39,76 39,42" fill="#255E12"/>
              <polygon points="39,8 70,25 39,38 8,25" fill="url(#hl)" opacity="0.18"/>
              <defs>
                <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff"/>
                  <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="logo-wordmark"><em>e-</em>MEC</div>
        </div>
      </header>

      {/* ── Separator ── */}
      <div className="sep" aria-hidden="true">Acesso seguro</div>

      {/* ── Card ── */}
      <section className="card">
        {success ? (
          <div className="success-state">
            <div className="success-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 className="success-title">Acesso autorizado</h2>
            <p className="success-sub">Redirecionando ao painel…</p>
          </div>
        ) : (
          <>
            <div className="card-head">
              <h2>Entrar na plataforma</h2>
              <p>Use suas credenciais institucionais para acessar</p>
            </div>

            <form className="form" onSubmit={handleSubmit} noValidate>
              <div className={`field${errors.email ? " field--error" : ""}`}>
                <label className="field-label" htmlFor="email">Usuário</label>
                <div className="input-wrap">
                  <input id="email" type="email" className="input"
                    placeholder="CPF ou e-mail institucional"
                    autoComplete="username"
                    value={email}
                    onChange={e => handleChange("email", e.target.value)} />
                </div>
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>

              <div className={`field${errors.password ? " field--error" : ""}`}>
                <label className="field-label" htmlFor="password">Senha</label>
                <div className="input-wrap">
                  <input id="password" type={showPass ? "text" : "password"} className="input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => handleChange("password", e.target.value)} />
                  <button type="button" className="toggle-pass" aria-label={showPass ? "Ocultar" : "Mostrar"} onClick={() => setShowPass(v => !v)}>
                    {showPass ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && <span className="field-error">{errors.password}</span>}
              </div>

              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? <span className="spinner" /> : "Entrar"}
              </button>
            </form>

            <div className="card-links">
              <a href="#" onClick={e => e.preventDefault()}>Esqueci minha senha</a>
              <a href="#" onClick={e => e.preventDefault()}>Suporte</a>
            </div>

            <div className="status-bar">
              <div className="status-dot" />
              <span>Ambiente seguro · Conexão criptografada</span>
            </div>
          </>
        )}
      </section>

      {/* ── Badges ── */}
      <div className="badges">
        <span className="badge">Cadastro</span>
        <span className="badge">Regulação</span>
        <span className="badge">Supervisão</span>
        <span className="badge">Avaliação</span>
        <span className="badge">Relatórios</span>
      </div>

      {/* ── Footer ── */}
      <footer className="footer-text">
        Ministério da Educação &nbsp;·&nbsp; Portal e-MEC &nbsp;·&nbsp; © 2026
      </footer>
    </div>
  );
}
