import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface PubData {
  nome: string; nascimento: string; cpf: string; rg: string;
  nomeMae: string; nomePai: string; observacao: string;
  instituicao: string; inep: string; endereco: string;
  bairro: string; municipio: string; cep: string; modalidade: string;
  curso: string; anoConclusao: string; data: string; protocolo: string;
}

const STYLES = `
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

  .pub-root { width: 100%; min-height: 100vh; min-height: 100dvh; margin: 0; padding: 0; overflow-x: hidden;
              font-family: Arial, Helvetica, sans-serif; background: var(--pub-page); color: var(--pub-fg); }
  .pub-wrap { width: 100%; max-width: 520px; margin: 0 auto; background: var(--pub-inner);
              min-height: 100vh; min-height: 100dvh; }
  .pub-wrap--z { min-height: 0; }

  .pub-header  { height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
                 padding: 0 16px; background: var(--pub-inner); }
  .pub-logo    { height: 30px; width: auto; max-width: 110px; object-fit: contain; object-position: left center; flex-shrink: 0; }
  .pub-a11y    { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .pub-a11y-btn, .pub-a11y-tag { display: flex; align-items: center; gap: 5px; min-height: 44px; padding: 0 8px;
                 background: none; border: 0; font: inherit; font-weight: 700; font-size: 12px; white-space: nowrap; color: inherit; }
  .pub-a11y-btn { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .pub-a11y-ico { font-size: 16px; }

  .pub-main    { padding: 14px; }
  .pub-intro   { padding: 18px 14px; text-align: center; }
  .pub-intro h1 { font-size: 17px; line-height: 1.35; margin: 0 0 10px; font-weight: 700; }
  .pub-intro p  { font-size: 13px; line-height: 1.5; margin: 0; overflow-wrap: anywhere; }

  .pub-card    { border-radius: 4px; margin: 14px 0; overflow: hidden; }
  .pub-card-title { margin: 0; padding: 12px 14px; font-size: 16px; font-weight: 700; text-align: center; line-height: 1.3; }
  .pub-card-body  { padding: 14px; font-size: 15px; line-height: 1.45; }

  .pub-row     { display: flex; flex-wrap: wrap; gap: 2px 6px; padding: 8px 0; border-bottom: 1px solid var(--pub-line); }
  .pub-row:first-child { padding-top: 0; }
  .pub-row:last-child  { padding-bottom: 0; border-bottom: 0; }
  .pub-row-label { font-weight: 700; }
  .pub-row-value { overflow-wrap: anywhere; min-width: 0; }

  .pub-legal   { border-radius: 4px; margin: 14px 0; padding: 16px 14px; text-align: center; }
  .pub-legal p { font-size: 13px; line-height: 1.5; margin: 4px 0; }
  .pub-date    { border-radius: 4px; padding: 14px; text-align: center; margin-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); font-size: 14px; }

  @media (min-width: 480px) {
    .pub-header { height: 64px; }
    .pub-main   { padding: 20px; }
    .pub-intro h1 { font-size: 18px; }
  }
  @media (max-width: 479px) {
    .pub-a11y-txt { display: none; }
    .pub-a11y { gap: 6px; }
  }
  .pub-wrap--z .pub-a11y-txt { display: none; }
  @media (max-width: 340px) {
    .pub-card-body { padding: 12px; font-size: 14px; }
  }

  .pub-root--canvas { position: fixed; inset: 0; min-height: 0; overflow: hidden; touch-action: none; }
  .pub-wrap--canvas { position: absolute; top: 0; left: 0; width: 520px; max-width: none; min-height: 0;
                      transform-origin: 0 0; will-change: transform; box-shadow: 0 0 0 1px var(--pub-line); }
  .pub-zoom { position: fixed; right: 16px; bottom: 16px; z-index: 10; display: flex; align-items: center;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
  .pub-zoom button { min-width: 40px; height: 38px; padding: 0 10px; border: 0; background: none; color: inherit;
                     font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; }
  .pub-zoom button:hover { background: rgba(127,127,127,.15); }
  .pub-zoom .pub-zoom-pct { font-size: 13px; min-width: 62px; }
`;

const CANVAS_W = 520;
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const KEEP_VISIBLE = 80;

interface View { s: number; x: number; y: number; }

function isDesktopPointer(): boolean {
  try { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch { return false; }
}

function initialView(): View {
  return { s: 1, x: Math.max(0, (window.innerWidth - CANVAS_W) / 2), y: 0 };
}

function Card({ title, children, hi }: { title: string; children: React.ReactNode; hi: boolean }) {
  const border = hi ? "#ff0" : "#ddd";
  return (
    <section className="pub-card" style={{ border: `1px solid ${border}`, background: hi ? "#000" : "#f9f9f9" }}>
      <h2 className="pub-card-title" style={{ borderBottom: `1px solid ${border}`, background: hi ? "#000" : "#eee", color: hi ? "#ff0" : "#333" }}>
        {title}
      </h2>
      <div className="pub-card-body">{children}</div>
    </section>
  );
}

function Row({ label, value, hi }: { label: string; value: string; hi: boolean }) {
  return (
    <div className="pub-row" style={{ color: hi ? "#ff0" : "#333" }}>
      <span className="pub-row-label">{label}:</span>
      <span className="pub-row-value">{value || "—"}</span>
    </div>
  );
}

// Alguns navegadores móveis (modo "Site para computador", webviews) montam a página
// com ~980px de largura e encolhem tudo. Detecta isso e escala para caber na tela.
function detectZoom(): number {
  try {
    if (navigator.maxTouchPoints < 1) return 1;
    const sw = window.screen.width;
    const iw = window.innerWidth;
    if (sw > 0 && sw < 800 && iw > sw * 1.25) return iw / sw;
  } catch {}
  return 1;
}

export default function PubViewer() {
  const { id } = useParams<{ id: string }>();
  const [pub, setPub] = useState<PubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [desativado, setDesativado] = useState(false);
  const [hi, setHi] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dataConsulta] = useState(() => {
    const n = new Date();
    return n.toLocaleDateString("pt-BR") + " " + n.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  });

  const [canvas] = useState(isDesktopPointer);
  const [view, setView] = useState<View>(initialView);
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => { if (!canvas) setZoom(detectZoom()); }, [canvas]);

  const clampView = useCallback((v: View): View => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s));
    const w = CANVAS_W * s;
    const h = (wrapRef.current?.offsetHeight ?? 0) * s;
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      s,
      x: Math.min(vw - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - w, v.x)),
      y: Math.min(vh - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - h, v.y)),
    };
  }, []);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView(v => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      const k = s / v.s;
      return clampView({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    });
  }, [clampView]);

  const zoomCenter = useCallback((factor: number) => {
    zoomAt(factor, window.innerWidth / 2, window.innerHeight / 2);
  }, [zoomAt]);

  const resetView = useCallback(() => setView(clampView(initialView())), [clampView]);

  useEffect(() => {
    const root = rootRef.current;
    if (!canvas || !root) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      // Ctrl+scroll do mouse e pinça do touchpad (Chrome/Edge/Firefox) chegam como wheel com ctrlKey
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-dy * 0.002), e.clientX, e.clientY);
      } else if (e.shiftKey && dx === 0) {
        setView(v => clampView({ ...v, x: v.x - dy }));
      } else {
        setView(v => clampView({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };

    // Pinça do touchpad no Safari
    let gestureStart = 1;
    const onGestureStart = (e: Event) => { e.preventDefault(); gestureStart = 1; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      zoomAt(ge.scale / gestureStart, ge.clientX, ge.clientY);
      gestureStart = ge.scale;
    };

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomCenter(1.2); }
      else if (e.key === "-") { e.preventDefault(); zoomCenter(1 / 1.2); }
      else if (e.key === "0") { e.preventDefault(); resetView(); }
    };

    const onResize = () => setView(v => clampView(v));

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("gesturestart", onGestureStart);
    root.addEventListener("gesturechange", onGestureChange);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("gesturestart", onGestureStart);
      root.removeEventListener("gesturechange", onGestureChange);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [canvas, pub, zoomAt, zoomCenter, resetView, clampView]);

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }      const { data } = await supabase
        .from("publicacoes")
        .select("*")
        .eq("pub_id", id)
        .single();
      if (data) {
        if (data.ativo === false) { setDesativado(true); }
        else {
          setPub({
            nome: data.nome, nascimento: data.nascimento, cpf: data.cpf, rg: data.rg,
            nomeMae: data.nome_mae, nomePai: data.nome_pai, observacao: data.observacao,
            instituicao: data.instituicao, inep: data.inep, endereco: data.endereco,
            bairro: data.bairro, municipio: data.municipio, cep: data.cep,
            modalidade: data.modalidade, curso: data.curso, anoConclusao: data.ano_conclusao,
            data: data.data, protocolo: data.protocolo,
          });
        }
      }
      setLoading(false);
    }
    load();
    try {
      if (localStorage.getItem("consulta-alto-contraste") === "1") setHi(true);
    } catch {}
  }, [id]);

  function toggleContraste() {
    setHi(v => {
      try { localStorage.setItem("consulta-alto-contraste", !v ? "1" : "0"); } catch {}
      return !v;
    });
  }

  const fg        = hi ? "#ff0" : "#333";
  const innerBg   = hi ? "#000" : "#fff";
  const pageBg    = zoom > 1 ? innerBg : (hi ? "#000" : "#f5f5f5");
  const borderClr = hi ? "#ff0" : "#ddd";
  const accent    = hi ? "#ff0" : "#0055aa";

  // Cor do fundo atrás da página (overscroll / áreas fora do #root)
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = pageBg;
    document.body.style.background = pageBg;
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, [pageBg]);

  const vars = {
    "--pub-page": pageBg, "--pub-inner": innerBg, "--pub-fg": fg, "--pub-line": hi ? "#665" : "#e3e3e3",
  } as React.CSSProperties;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: pageBg }}>
      <div style={{ width: 36, height: 36, border: "3px solid #ccc", borderTopColor: "#0055aa", borderRadius: "50%", animation: "pubSpin .7s linear infinite" }} />
      <style>{`@keyframes pubSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (desativado) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: pageBg }}>
      <div style={{ width: 36, height: 36, border: "3px solid #ccc", borderTopColor: "#0055aa", borderRadius: "50%", animation: "pubSpin .7s linear infinite" }} />
      <style>{`@keyframes pubSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!pub) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: pageBg, color: fg, padding: 20 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Publicação não encontrada</h2>
        <p style={{ color: "#888", margin: 0, fontSize: 14 }}>O link pode ter expirado ou ser inválido.</p>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`pub-root${canvas ? " pub-root--canvas" : ""}`} style={vars}>
      <style>{STYLES}</style>

      {canvas && (
        <div className="pub-zoom" style={{ background: innerBg, color: fg, border: `1px solid ${borderClr}` }}>
          <button onClick={() => zoomCenter(1 / 1.2)} aria-label="Diminuir zoom" title="Diminuir zoom (Ctrl −)">−</button>
          <button className="pub-zoom-pct" onClick={resetView} title="Restaurar (Ctrl 0)">{Math.round(view.s * 100)}%</button>
          <button onClick={() => zoomCenter(1.2)} aria-label="Aumentar zoom" title="Aumentar zoom (Ctrl +)">+</button>
        </div>
      )}

      <div
        ref={wrapRef}
        className={`pub-wrap${canvas ? " pub-wrap--canvas" : zoom > 1 ? " pub-wrap--z" : ""}`}
        style={canvas
          ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }
          : zoom > 1 ? { zoom } : undefined}
      >

        <header className="pub-header" style={{ borderBottom: `2px solid ${hi ? "#ff0" : "#00995d"}` }}>
          <img
            className="pub-logo"
            src="/govnovo.png"
            alt="gov.br"
            onError={e => {
              const el = e.target as HTMLImageElement;
              const span = document.createElement("span");
              span.textContent = "gov.br";
              span.style.cssText = "font-weight:900;font-size:18px;color:#1351b4";
              el.replaceWith(span);
            }}
          />
          <div className="pub-a11y">
            <button className="pub-a11y-btn" onClick={toggleContraste} aria-pressed={hi}>
              <span className="pub-a11y-ico" style={{ color: accent }}>☽</span>
              <span className="pub-a11y-txt">Alto Contraste</span>
            </button>
            <div className="pub-a11y-tag">
              <span className="pub-a11y-ico" style={{ color: accent }}>👂</span>
              <span className="pub-a11y-txt">VLibras</span>
            </div>
          </div>
        </header>

        <main className="pub-main">
          <section className="pub-intro" style={{ background: hi ? "#000" : "#f4f4f4", border: `1px solid ${borderClr}` }}>
            <h1>Publicação processada em DOU de<br />{pub.data}</h1>
            <p>
              PROTOCOLO {pub.protocolo}<br />
              REGISTRADO DE ACORDO COM A LEI SEB 738329/2025 e SEE 98483/2025
            </p>
          </section>

          <Card title="Dados do Aluno" hi={hi}>
            <Row label="Nome do Aluno"      value={pub.nome}       hi={hi} />
            <Row label="Data de Nascimento" value={pub.nascimento} hi={hi} />
            <Row label="CPF"                value={pub.cpf}        hi={hi} />
            <Row label="RG/RNE/RA"          value={pub.rg}         hi={hi} />
            <Row label="Nome da Mãe"        value={pub.nomeMae}    hi={hi} />
            <Row label="Nome do Pai"        value={pub.nomePai}    hi={hi} />
            <Row label="Observações"        value={pub.observacao} hi={hi} />
          </Card>

          <Card title="Dados da Instituição" hi={hi}>
            <Row label="Nome da Instituição" value={pub.instituicao} hi={hi} />
            <Row label="Código do INEP"      value={pub.inep}        hi={hi} />
            <Row label="Endereço"            value={pub.endereco}    hi={hi} />
            <Row label="Bairro"              value={pub.bairro}      hi={hi} />
            <Row label="Município"           value={pub.municipio}   hi={hi} />
            <Row label="CEP"                 value={pub.cep}         hi={hi} />
            <Row label="Modalidades"         value={pub.modalidade}  hi={hi} />
          </Card>

          <Card title="RESUMO DA PUBLICAÇÃO" hi={hi}>
            <Row label="Curso"            value={pub.curso}        hi={hi} />
            <Row label="Ano de Conclusão" value={pub.anoConclusao} hi={hi} />
            <Row label="Data Publicação"  value={pub.data}         hi={hi} />
          </Card>

          <section className="pub-legal" style={{ background: innerBg, border: `1px solid ${borderClr}` }}>
            <p style={{ fontWeight: "bold", marginBottom: 8 }}>Fundamento Legal:</p>
            <p>Resolução SE Nº 108 de 25, publicada no DOU de 26/06/2002.</p>
            <p style={{ fontWeight: "bold", marginTop: 12 }}>** Esta publicação não substitui documentos escolares. **</p>
          </section>

          <section className="pub-date" style={{ background: innerBg, border: `1px solid ${borderClr}` }}>
            <div style={{ fontWeight: "bold" }}>Data e Hora da Consulta:</div>
            <div>{dataConsulta}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
