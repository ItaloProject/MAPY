import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import { supabase } from "../lib/supabase";

type Etapa = "chave" | "senha" | "success";

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function Login({ onLogin }: { onLogin: () => void }) {
  const navigate  = useNavigate();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [etapa,        setEtapa]        = useState<Etapa>("chave");
  const [matricula,    setMatricula]    = useState("");
  const [authEmail,    setAuthEmail]    = useState("");
  const [password,     setPassword]     = useState("");
  const [showPass,     setShowPass]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [chaveErr,     setChaveErr]     = useState<string | null>(null);
  const [senhaErr,     setSenhaErr]     = useState<string | null>(null);
  const [dragging,     setDragging]     = useState(false);

  // Admin bypass: triple-click no rodapé "Portal e-MEC"
  const footerClicks  = useRef(0);
  const footerTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adminMode,   setAdminMode]    = useState(false);
  const [adminEmail,  setAdminEmail]   = useState("");
  const [adminPass,   setAdminPass]    = useState("");
  const adminRef = useRef(false);
  adminRef.current = adminMode;

  // Acesso por matrícula: segurar o cubo (~1s) troca a cor e libera matrícula + senha
  const HOLD_MS = 900;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const [pressing, setPressing] = useState(false);

  function startHold() {
    if (etapa !== "chave") return;
    holdFired.current = false;
    setPressing(true);
    holdTimer.current = setTimeout(() => {
      holdFired.current = true;
      setPressing(false);
      setAdminMode(m => !m);
      setChaveErr(null);
      setSenhaErr(null);
      try { navigator.vibrate?.(40); } catch {}
    }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setPressing(false);
  }
  function handleCubeClick() {
    if (holdFired.current) { holdFired.current = false; return; }
    if (etapa === "chave" && !adminRef.current) fileRef.current?.click();
  }

  // ── Lê e valida o arquivo de chave ────────────────────────────────────────
  async function processarChave(file: File) {
    if (!file.name.endsWith(".csv")) {
      setChaveErr("Arquivo inválido. Selecione o arquivo .csv fornecido no cadastro.");
      return;
    }
    setLoading(true);
    setChaveErr(null);
    try {
      const text  = await file.text();
      const lines = text.trim().split("\n").filter(l => !l.startsWith("#"));
      // Espera: linha 0 = header, linha 1 = dados
      if (lines.length < 2) throw new Error("formato");
      const [, token] = lines[1].split(",").map(s => s.trim());
      if (!token) throw new Error("formato");

      const hash = await sha256hex(token);

      const res  = await fetch("/api/verificar-chave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: hash }),
      });
      const body = await res.json();

      if (!body.ok) {
        setChaveErr("Chave inválida, expirada ou usuário suspenso.");
        setLoading(false);
        return;
      }

      setMatricula(body.matricula);
      setAuthEmail(body.authEmail);
      setLoading(false);
      setEtapa("senha");
    } catch {
      setChaveErr("Não foi possível ler o arquivo. Verifique se é o arquivo correto.");
      setLoading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processarChave(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processarChave(f);
  }

  // ── Login normal (etapa senha) ─────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) { setSenhaErr("Senha obrigatória"); return; }
    setSenhaErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    setLoading(false);
    if (error) { setSenhaErr("Senha incorreta"); return; }
    setEtapa("success");
    setTimeout(() => { onLogin(); navigate("/dashboard"); }, 1000);
  }

  // ── Admin bypass ──────────────────────────────────────────────────────────
  function handleFooterClick() {
    footerClicks.current += 1;
    if (footerTimer.current) clearTimeout(footerTimer.current);
    footerTimer.current = setTimeout(() => { footerClicks.current = 0; }, 1500);
    if (footerClicks.current >= 3) {
      footerClicks.current = 0;
      setAdminMode(m => !m);
      setChaveErr(null);
    }
  }

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSenhaErr(null);
    const id = adminEmail.trim();
    if (!id || !adminPass) { setSenhaErr("Informe matrícula e senha"); return; }
    setLoading(true);
    const email = id.includes("@") ? id : `${id}@emec.app`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: adminPass });
    if (error || !data.user) { setLoading(false); setSenhaErr("Matrícula ou senha incorretas"); return; }
    // Suspensão só é checada pela chave; aqui conferimos o status do cadastro
    const { data: cad } = await supabase.from("usuarios").select("status").eq("auth_user_id", data.user.id).maybeSingle();
    if (cad?.status === "Suspenso") {
      await supabase.auth.signOut();
      setLoading(false);
      setSenhaErr("Acesso suspenso. Procure o administrador.");
      return;
    }
    setLoading(false);
    setEtapa("success");
    setTimeout(() => { onLogin(); navigate("/dashboard"); }, 1000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />

      {/* Header */}
      <header className="header">
        <div className="logo-row">

          {/* ── Cubo = zona de upload ── */}
          <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: "none" }} />
          <div
            className="cube-wrap"
            onClick={handleCubeClick}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onContextMenu={e => e.preventDefault()}
            style={{
              position: "relative", cursor: etapa === "chave" ? "pointer" : "default",
              touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none",
              WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent",
              transform: pressing ? "scale(0.93)" : "scale(1)", transition: pressing ? "transform .9s ease-out" : "transform .2s ease",
            } as React.CSSProperties}
            onDragOver={etapa === "chave" ? e => { e.preventDefault(); setDragging(true); } : undefined}
            onDragLeave={etapa === "chave" ? () => setDragging(false) : undefined}
            onDrop={etapa === "chave" ? onDrop : undefined}
          >
            <svg
              width="78" height="80" viewBox="0 0 78 80"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                filter: dragging
                  ? "drop-shadow(0 0 16px #7DD43A) brightness(1.2)"
                  : etapa === "chave" && adminMode
                    ? "drop-shadow(0 0 12px rgba(56,189,248,0.6))"
                  : etapa === "chave"
                    ? "drop-shadow(0 0 8px rgba(125,212,58,0.4))"
                    : etapa === "senha"
                      ? "drop-shadow(0 0 10px rgba(14,165,233,0.5))"
                      : undefined,
                transition: "filter .3s",
              }}
            >
              <polygon points="39,4 74,23 39,42 4,23"  fill={adminMode ? "#38BDF8" : "#7DD43A"} style={{ transition: "fill .4s" }}/>
              <polygon points="4,23 39,42 39,76 4,57"  fill={adminMode ? "#0EA5E9" : "#3A9A1E"} style={{ transition: "fill .4s" }}/>
              <polygon points="74,23 74,57 39,76 39,42" fill={adminMode ? "#0369A1" : "#255E12"} style={{ transition: "fill .4s" }}/>
              <polygon points="39,8 70,25 39,38 8,25"  fill="url(#hl)" opacity="0.18"/>
              <defs>
                <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff"/>
                  <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
                </linearGradient>
              </defs>
            </svg>

            {/* Ícone de check quando chave validada */}
            {etapa === "senha" && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                pointerEvents: "none",
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "rgba(14,165,233,0.9)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 12px rgba(14,165,233,0.6)",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </div>
              </div>
            )}
          </div>

          <div className="logo-wordmark"><em>e-</em>MEC</div>
        </div>
      </header>

      {/* Separador */}
      <div className="sep" aria-hidden="true">
        {etapa === "chave" ? "Autenticação por chave de acesso" : "Acesso seguro"}
      </div>

      {/* Card */}
      <section className="card">

        {/* ── SUCCESS ── */}
        {etapa === "success" && (
          <div className="success-state">
            <div className="success-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 className="success-title">Acesso autorizado</h2>
            <p className="success-sub">Redirecionando ao painel…</p>
          </div>
        )}

        {/* ── ETAPA 1: CHAVE ── */}
        {etapa === "chave" && !adminMode && (
          <>
            <div className="card-head">
              <h2>Verificação de chave</h2>
              <p>Clique no logo acima ou arraste seu arquivo <strong>.csv</strong> de acesso</p>
            </div>

            {/* Zona de drop alternativa */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              style={{
                border: `2px dashed ${dragging ? "#7DD43A" : "var(--border)"}`,
                borderRadius: 12,
                padding: "28px 20px",
                textAlign: "center",
                cursor: "pointer",
                background: dragging ? "rgba(125,212,58,0.06)" : "var(--surface-2)",
                transition: "all .2s",
                marginBottom: 6,
              }}
            >
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 22, height: 22, border: "3px solid var(--border)", borderTopColor: "#7DD43A", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} />
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Verificando chave…</span>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : (
                <>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={dragging ? "#7DD43A" : "var(--fg-muted)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, transition: "stroke .2s" }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9"  y1="15" x2="15" y2="15"/>
                  </svg>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                    {dragging ? "Solte o arquivo aqui" : "Arraste o arquivo ou clique para selecionar"}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-muted)", opacity: .6 }}>
                    Arquivo <code style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4 }}>emec_chave_*.csv</code>
                  </p>
                </>
              )}
            </div>

            {chaveErr && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171", marginTop: 8 }}>
                ✕ {chaveErr}
              </div>
            )}

            <div className="status-bar" style={{ marginTop: 16 }}>
              <div className="status-dot" />
              <span>Conexão criptografada · Chave de uso único por sessão</span>
            </div>
          </>
        )}

        {/* ── ETAPA 1 ADMIN BYPASS ── */}
        {etapa === "chave" && adminMode && (
          <>
            <div className="card-head">
              <h2>Acesso por matrícula</h2>
              <p>Informe sua matrícula e senha para entrar sem o arquivo</p>
            </div>
            <form className="form" onSubmit={handleAdminSubmit} noValidate>
              <div className="field">
                <label className="field-label">Matrícula</label>
                <div className="input-wrap">
                  <input type="text" className="input" autoFocus
                    inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username"
                    placeholder="Ex.: 2026001"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Senha</label>
                <div className="input-wrap">
                  <input type="password" className="input" autoComplete="current-password"
                    placeholder="••••••••"
                    value={adminPass}
                    onChange={e => setAdminPass(e.target.value)} />
                </div>
              </div>
              {senhaErr && <span className="field-error">{senhaErr}</span>}
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? <span className="spinner" /> : "Entrar"}
              </button>
              <button type="button" onClick={() => { setAdminMode(false); setSenhaErr(null); }}
                style={{ background: "none", border: "none", color: "var(--fg-muted)", fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                ← Voltar
              </button>
            </form>
          </>
        )}

        {/* ── ETAPA 2: SENHA ── */}
        {etapa === "senha" && (
          <>
            <div className="card-head">
              <h2>Entrar na plataforma</h2>
              <p>Chave verificada. Insira sua senha para continuar.</p>
            </div>

            {/* Chip de matrícula */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Matrícula verificada</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg)", fontFamily: "monospace", letterSpacing: ".06em" }}>{matricula}</div>
              </div>
              <button
                onClick={() => { setEtapa("chave"); setMatricula(""); setAuthEmail(""); setPassword(""); setSenhaErr(null); }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 12 }}
                title="Usar outra chave"
              >
                Trocar
              </button>
            </div>

            <form className="form" onSubmit={handleSubmit} noValidate>
              <div className={`field${senhaErr ? " field--error" : ""}`}>
                <label className="field-label" htmlFor="password">Senha</label>
                <div className="input-wrap">
                  <input
                    id="password"
                    type={showPass ? "text" : "password"}
                    className="input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={e => { setPassword(e.target.value); setSenhaErr(null); }}
                  />
                  <button type="button" className="toggle-pass" onClick={() => setShowPass(v => !v)} aria-label={showPass ? "Ocultar" : "Mostrar"}>
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
                {senhaErr && <span className="field-error">{senhaErr}</span>}
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

      {/* Badges */}
      <div className="badges">
        <span className="badge">Cadastro</span>
        <span className="badge">Regulação</span>
        <span className="badge">Supervisão</span>
        <span className="badge">Avaliação</span>
        <span className="badge">Relatórios</span>
      </div>

      {/* Footer — clique 3× para modo admin */}
      <footer className="footer-text">
        Ministério da Educação &nbsp;·&nbsp;{" "}
        <span onClick={handleFooterClick} style={{ cursor: "default", userSelect: "none" }}>
          Portal e-MEC
        </span>
        &nbsp;·&nbsp; © 2026
      </footer>
    </div>
  );
}
