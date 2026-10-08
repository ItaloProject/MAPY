import { useState, useEffect } from "react";
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
  .pub-wrap    { width: 100%; max-width: 500px; min-height: 100vh; margin: 0 auto; display: block; }
  .pub-header  { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; flex-shrink: 0; }
  .pub-logo    { height: 32px; width: auto; max-width: 110px; object-fit: contain; object-position: left center; }
  .pub-a11y    { display: flex; gap: 14px; align-items: center; }
  .pub-a11y-btn { display: flex; align-items: center; gap: 5px; background: none; border: 0; cursor: pointer; font-weight: 700; font-size: 11px; padding: 0; white-space: nowrap; }
  .pub-a11y-tag { display: flex; align-items: center; gap: 5px; font-weight: 700; font-size: 11px; white-space: nowrap; }
  .pub-a11y-txt { }
  .pub-main    { padding: 16px; }
  .pub-intro   { padding: 18px 16px; text-align: center; }
  .pub-intro h1 { font-size: 16px; margin: 0 0 10px; font-weight: 700; line-height: 1.4; }
  .pub-intro p  { font-size: 13px; line-height: 1.5; margin: 0; }
  .pub-card    { border-radius: 4px; margin: 14px 0; }
  .pub-card-title { margin: 0; padding: 10px 14px; font-size: 15px; font-weight: 700; text-align: center; }
  .pub-card-body  { padding: 14px; font-size: 14px; line-height: 1.5; }
  .pub-row     { margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
  .pub-row-label { font-weight: 700; }
  .pub-legal   { border-radius: 4px; margin: 14px 0; padding: 14px; text-align: center; }
  .pub-legal p { font-size: 13px; line-height: 1.5; margin: 4px 0; }
  .pub-date    { border-radius: 4px; padding: 14px; text-align: center; margin-bottom: 30px; }

  @media (max-width: 420px) {
    .pub-header  { height: 54px; padding: 0 12px; }
    .pub-logo    { height: 28px; max-width: 90px; }
    .pub-a11y    { gap: 10px; }
    .pub-a11y-txt { display: none; }
    .pub-main    { padding: 12px; }
    .pub-intro   { padding: 14px 12px; }
    .pub-intro h1 { font-size: 14px; }
    .pub-card-title { font-size: 13px; padding: 9px 12px; }
    .pub-card-body  { padding: 12px; font-size: 13px; }
    .pub-legal p { font-size: 12px; }
  }
`;

function Card({ title, children, hi }: { title: string; children: React.ReactNode; hi: boolean }) {
  const border = hi ? "#ff0" : "#ddd";
  const bg     = hi ? "#000" : "#f9f9f9";
  const titleBg = hi ? "#000" : "#eee";
  const titleFg = hi ? "#ff0" : "#333";
  return (
    <section className="pub-card" style={{ border: `1px solid ${border}`, background: bg }}>
      <h2 className="pub-card-title" style={{ borderBottom: `1px solid ${border}`, background: titleBg, color: titleFg }}>
        {title}
      </h2>
      <div className="pub-card-body">{children}</div>
    </section>
  );
}

function Row({ label, value, hi }: { label: string; value: string; hi: boolean }) {
  const c = hi ? "#ff0" : "#333";
  return (
    <div className="pub-row" style={{ color: c }}>
      <span className="pub-row-label">{label}:</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export default function PubViewer() {
  const { id } = useParams<{ id: string }>();
  const [pub, setPub] = useState<PubData | null>(null);
  const [hi, setHi] = useState(false);
  const [dataConsulta] = useState(() => {
    const n = new Date();
    return n.toLocaleDateString("pt-BR") + " " + n.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  });

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data } = await supabase
        .from("publicacoes")
        .select("nome,nascimento,cpf,rg,nome_mae,nome_pai,observacao,instituicao,inep,endereco,bairro,municipio,cep,modalidade,curso,ano_conclusao,data,protocolo")
        .eq("pub_id", id)
        .single();
      if (data) {
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

  const fg       = hi ? "#ff0" : "#333";
  const pageBg   = hi ? "#000" : "#f5f5f5";
  const innerBg  = hi ? "#000" : "#fff";
  const borderClr = hi ? "#ff0" : "#ddd";
  const greenBorder = hi ? "#ff0" : "#00995d";

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
    <div style={{ margin: 0, padding: 0, width: "100%", background: pageBg, fontFamily: "Arial, sans-serif", color: fg, minHeight: "100vh" }}>
      <style>{STYLES}</style>

      <div className="pub-wrap" style={{ background: innerBg }}>

        {/* Header */}
        <header className="pub-header" style={{ background: innerBg, borderBottom: `2px solid ${greenBorder}` }}>
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
          <div className="pub-a11y" style={{ color: fg }}>
            <button
              className="pub-a11y-btn"
              onClick={toggleContraste}
              style={{ color: fg }}
            >
              <span style={{ fontSize: 15, color: hi ? "#ff0" : "#0055aa" }}>☽</span>
              <span className="pub-a11y-txt">Alto Contraste</span>
            </button>
            <div className="pub-a11y-tag" style={{ color: fg }}>
              <span style={{ fontSize: 15, color: hi ? "#ff0" : "#0055aa" }}>👂</span>
              <span className="pub-a11y-txt">VLibras</span>
            </div>
          </div>
        </header>

        <main className="pub-main">
          {/* Intro */}
          <section className="pub-intro" style={{ background: hi ? "#000" : "#f4f4f4", border: `1px solid ${borderClr}` }}>
            <h1 style={{ color: fg }}>
              Publicação processada em DOU de {pub.data}
            </h1>
            <p style={{ color: fg }}>
              PROTOCOLO {pub.protocolo}<br />
              REGISTRADO DE ACORDO COM A LEI SEB 738329/2025 e SEE 98483/2025
            </p>
          </section>

          <Card title="Dados do Aluno" hi={hi}>
            <Row label="Nome do Aluno"       value={pub.nome}        hi={hi} />
            <Row label="Data de Nascimento"  value={pub.nascimento}  hi={hi} />
            <Row label="CPF"                 value={pub.cpf}         hi={hi} />
            <Row label="RG/RNE/RA"           value={pub.rg}          hi={hi} />
            <Row label="Nome da Mãe"         value={pub.nomeMae}     hi={hi} />
            <Row label="Nome do Pai"         value={pub.nomePai}     hi={hi} />
            <Row label="Observações"         value={pub.observacao}  hi={hi} />
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
            <Row label="Curso"             value={pub.curso}        hi={hi} />
            <Row label="Ano de Conclusão"  value={pub.anoConclusao} hi={hi} />
            <Row label="Data Publicação"   value={pub.data}         hi={hi} />
          </Card>

          <section className="pub-legal" style={{ background: innerBg, border: `1px solid ${borderClr}` }}>
            <p style={{ color: fg, fontWeight: "bold", marginBottom: 8 }}>Fundamento Legal:</p>
            <p style={{ color: fg }}>Resolução SE Nº 108 de 25, publicada no DOU de 26/06/2002.</p>
            <p style={{ color: fg, fontWeight: "bold", marginTop: 12 }}>** Esta publicação não substitui documentos escolares. **</p>
          </section>

          <section className="pub-date" style={{ background: innerBg, border: `1px solid ${borderClr}` }}>
            <div style={{ fontSize: 14, fontWeight: "bold", color: fg }}>Data e Hora da Consulta:</div>
            <div style={{ fontSize: 14, color: fg }}>{dataConsulta}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
