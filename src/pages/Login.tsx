import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import { supabase } from "../lib/supabase";

type Field = "email" | "password";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState<Field | null>(null);

  function validate() {
    const e: Partial<Record<Field, string>> = {};
    if (!email.trim()) e.email = "E-mail é obrigatório";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "E-mail inválido";
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
      setErrors({ password: "E-mail ou senha incorretos" });
      return;
    }
    setSuccess(true);
    setTimeout(() => { onLogin(); navigate("/dashboard"); }, 900);
  }

  function handleChange(field: Field, val: string) {
    if (field === "email") setEmail(val);
    else setPassword(val);
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="page">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="card">
        <div className="brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7v5c0 5.25 4.2 10.15 10 11.35C17.8 22.15 22 17.25 22 12V7L12 2z" fill="currentColor" opacity=".9"/>
            </svg>
          </div>
          <span className="brand-name">e-mec.com.br</span>
        </div>

        {success ? (
          <div className="success-state">
            <div className="success-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 className="success-title">Acesso autorizado</h2>
            <p className="success-sub">Bem-vindo de volta, redirecionando…</p>
          </div>
        ) : (
          <>
            <div className="card-header">
              <h1 className="card-title">Entrar</h1>
              <p className="card-sub">Acesse sua conta para continuar</p>
            </div>
            <form className="form" onSubmit={handleSubmit} noValidate>
              <div className={`field ${focused === "email" ? "field--focused" : ""} ${errors.email ? "field--error" : ""}`}>
                <label className="field-label" htmlFor="email">E-mail</label>
                <div className="input-wrap">
                  <span className="input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </span>
                  <input id="email" type="email" className="input" placeholder="seu@email.com" value={email} autoComplete="email"
                    onChange={e => handleChange("email", e.target.value)}
                    onFocus={() => setFocused("email")} onBlur={() => setFocused(null)} />
                </div>
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>

              <div className={`field ${focused === "password" ? "field--focused" : ""} ${errors.password ? "field--error" : ""}`}>
                <label className="field-label" htmlFor="password">Senha</label>
                <div className="input-wrap">
                  <span className="input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input id="password" type={showPass ? "text" : "password"} className="input" placeholder="••••••••"
                    value={password} autoComplete="current-password"
                    onChange={e => handleChange("password", e.target.value)}
                    onFocus={() => setFocused("password")} onBlur={() => setFocused(null)} />
                  <button type="button" className="toggle-pass" aria-label={showPass ? "Ocultar" : "Mostrar"} onClick={() => setShowPass(v => !v)}>
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && <span className="field-error">{errors.password}</span>}
              </div>

              <div className="form-meta">
                <label className="checkbox-label">
                  <input type="checkbox" className="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  <span className="checkbox-custom" /><span>Lembrar-me</span>
                </label>
                <a href="#" className="link-forgot" onClick={e => e.preventDefault()}>Esqueceu a senha?</a>
              </div>

              <button type="submit" className={`btn-submit ${loading ? "btn-submit--loading" : ""}`} disabled={loading}>
                {loading ? <span className="spinner" /> : (
                  <><span>Entrar</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg></>
                )}
              </button>
            </form>

            <div className="divider"><span>ou</span></div>
            <div className="social-row">
              <button type="button" className="btn-social">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>
              <button type="button" className="btn-social">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12"/>
                </svg>
                GitHub
              </button>
            </div>
            <p className="footer-text">Não tem uma conta? <a href="#" className="link-register" onClick={e => e.preventDefault()}>Criar conta</a></p>
          </>
        )}
      </div>
    </div>
  );
}
