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

function Card({ title, children, hi }: { title: string; children: React.ReactNode; hi: boolean }) {
  return (
    <section style={{ border: `1px solid ${hi ? "#ff0" : "#ddd"}`, borderRadius: 4, background: hi ? "#000" : "#f9f9f9", margin: "15px 0" }}>
      <h2 style={{ margin: 0, padding: 12, borderBottom: `1px solid ${hi ? "#ff0" : "#ddd"}`, textAlign: "center", fontSize: 18, fontWeight: 700, background: hi ? "#000" : "#eee", color: hi ? "#ff0" : "#333" }}>
        {title}
      </h2>
      <div style={{ padding: 15, fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </section>
  );
}

function Row({ label, value, hi }: { label: string; value: string; hi: boolean }) {
  const c = hi ? "#ff0" : "#333";
  return (
    <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 5, color: c }}>
      <span style={{ fontWeight: 700 }}>{label}:</span>
      <span>{value}</span>
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

  const fg = hi ? "#ff0" : "#333";
  const pageBg = hi ? "#000" : "#f5f5f5";
  const innerBg = hi ? "#000" : "#fff";
  const borderClr = hi ? "#ff0" : "#ddd";

  if (!pub) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: pageBg, color: fg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h2 style={{ margin: "0 0 8px" }}>Publicação não encontrada</h2>
        <p style={{ color: "#888", margin: 0 }}>O link pode ter expirado ou ser inválido.</p>
      </div>
    </div>
  );

  return (
    <div style={{ margin: 0, padding: 0, background: pageBg, fontFamily: "sans-serif", color: fg, minHeight: "100vh" }}>
      <div style={{ width: "min(100%, 480px)", minHeight: "100vh", margin: "auto", background: innerBg }}>

        {/* Header */}
        <header style={{ height: 70, background: innerBg, borderBottom: `2px solid ${hi ? "#ff0" : "#00995d"}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 15px" }}>
          <img
            src="/govnovo.png" alt="gov.br"
            style={{ width: 100, height: 36.25, objectFit: "contain", objectPosition: "left center" }}
            onError={e => { const el = e.target as HTMLImageElement; el.replaceWith(Object.assign(document.createElement("span"), { textContent: "gov.br", style: { fontWeight: "900", fontSize: "18px", color: "#1351b4" } } as any)); }}
          />
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: fg, alignItems: "center", fontWeight: "bold" }}>
            <button onClick={toggleContraste} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: 0, cursor: "pointer", font: "inherit", fontWeight: "bold", color: fg }}>
              <span style={{ fontSize: 16, color: hi ? "#ff0" : "#0055aa" }}>☽</span>
              <span>Alto Contraste</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 16, color: hi ? "#ff0" : "#0055aa" }}>👂</span>
              <span>VLibras</span>
            </div>
          </div>
        </header>

        <main style={{ padding: 20 }}>
          {/* Intro */}
          <section style={{ background: hi ? "#000" : "#f4f4f4", border: `1px solid ${borderClr}`, padding: 20, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, margin: "0 0 10px", fontWeight: 700, color: fg }}>
              Publicação processada em DOU de <br />{pub.data}
            </h1>
            <div style={{ fontSize: 14, lineHeight: 1.4, color: fg }}>
              PROTOCOLO {pub.protocolo}<br />
              REGISTRADO DE ACORDO COM A LEI SEB 738329/2025 e SEE 98483/2025
            </div>
          </section>

          <Card title="Dados do Aluno" hi={hi}>
            <Row label="Nome do Aluno" value={pub.nome} hi={hi} />
            <Row label="Data de Nascimento" value={pub.nascimento} hi={hi} />
            <Row label="CPF" value={pub.cpf} hi={hi} />
            <Row label="RG/RNE/RA" value={pub.rg} hi={hi} />
            <Row label="Nome da Mãe" value={pub.nomeMae} hi={hi} />
            <Row label="Nome do Pai" value={pub.nomePai} hi={hi} />
            <Row label="Observações" value={pub.observacao} hi={hi} />
          </Card>

          <Card title="Dados da Instituição" hi={hi}>
            <Row label="Nome da Instituição" value={pub.instituicao} hi={hi} />
            <Row label="Código do INEP" value={pub.inep} hi={hi} />
            <Row label="Endereço" value={pub.endereco} hi={hi} />
            <Row label="Bairro" value={pub.bairro} hi={hi} />
            <Row label="Município" value={pub.municipio} hi={hi} />
            <Row label="CEP" value={pub.cep} hi={hi} />
            <Row label="Modalidades" value={pub.modalidade} hi={hi} />
          </Card>

          <Card title="RESUMO DA PUBLICAÇÃO" hi={hi}>
            <Row label="Curso" value={pub.curso} hi={hi} />
            <Row label="Ano de Conclusão" value={pub.anoConclusao} hi={hi} />
            <Row label="Data Publicação" value={pub.data} hi={hi} />
          </Card>

          <section style={{ background: innerBg, border: `1px solid ${borderClr}`, borderRadius: 4, margin: "15px 0", padding: 15, textAlign: "center" }}>
            <div style={{ fontSize: 14, lineHeight: 1.4, color: fg }}>
              <div style={{ fontWeight: "bold", marginBottom: 10 }}>Fundamento Legal:</div>
              <div>Resolução SE Nº 108 de 25, publicada no DOU de 26/06/2002.</div>
              <div style={{ fontWeight: "bold", marginTop: 15 }}>** Esta publicação não substitui documentos escolares. **</div>
            </div>
          </section>

          <section style={{ background: innerBg, border: `1px solid ${borderClr}`, borderRadius: 4, padding: 15, textAlign: "center", marginBottom: 30 }}>
            <div style={{ fontSize: 14, fontWeight: "bold", color: fg }}>Data e Hora da Consulta:</div>
            <div style={{ fontSize: 14, color: fg }}>{dataConsulta}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
