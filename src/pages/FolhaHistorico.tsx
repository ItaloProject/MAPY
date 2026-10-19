import { assinanteDe, type DadosHistoricoEscolar, type Disciplina } from "../lib/historicoEscolar";
import "./FolhaHistorico.css";

const LOGO = "/templates/estacio-logo.jpg";

function Linhas({ itens, ultimaFechada, primeiraSolta }: { itens: Disciplina[]; ultimaFechada?: boolean; primeiraSolta?: boolean }) {
  return (
    <>
      {itens.map((d, i) => (
        <tr key={i} className={i === 0 && !primeiraSolta ? "he-tr--primeira" : ultimaFechada && i === itens.length - 1 ? "he-tr--ultima" : undefined}>
          <td className="he-c-sem">{d.sem}</td>
          <td className="he-c-ano">{d.ano}</td>
          <td className="he-c-disc">{d.disciplina}</td>
          <td className="he-c-num">{d.media}</td>
          <td className="he-c-num">{d.cm}</td>
          <td className="he-c-num">{d.situacao}</td>
        </tr>
      ))}
    </>
  );
}

function Cabecalho() {
  return (
    <thead>
      <tr>
        <th className="he-h-sem">Sem.</th>
        <th className="he-h-ano">Ano</th>
        <th className="he-h-disc">Disciplinas</th>
        <th className="he-h-num">Média</th>
        <th className="he-h-num">CM</th>
        <th className="he-h-num">Situação</th>
      </tr>
    </thead>
  );
}

// Reprodução fiel do modelo geraPDFLista.docx: medidas em pt tiradas do próprio documento (layout do Word).
export default function FolhaHistorico({ dados }: { dados: DadosHistoricoEscolar }) {
  const cursoLinha = [dados.grau, dados.curso].filter(s => s.trim()).join(" ");
  const assinatura = assinanteDe(dados.assinante);
  const completo = dados.modelo === "completo";
  return (
    <div className="he-folha">
      <div className="he-cab">
        <img className="he-logo" src={LOGO} alt="" />
        {assinatura && <img className="he-assinatura" src={assinatura.imagem} alt="" />}
        <p className="he-p he-p--assinante">{dados.assinante}</p>

        {dados.rg_2.trim() && <p className="he-p he-p--c3" style={{ top: "139pt" }}>RG: {dados.rg_2}</p>}

        <div className="he-linhas">
          <div className="he-col1">
            <p className="he-p">{cursoLinha}</p>
            <p className="he-p he-p--duas he-nome">Nome: {dados.nome} Nacionalidade: {dados.nacionalidade}</p>
            <p className="he-p he-rg">RG: {dados.rg}</p>
          </div>
          <div className="he-col2">
            <p className="he-p he-p--duas">Naturalidade: {dados.naturalidade} UF: {dados.uf}</p>
          </div>
        </div>

        <div className="he-caixa">
          <div className="he-caixa-int">
            <p className="he-caixa-titulo">{dados.titulo}</p>
            <p className="he-caixa-linha he-caixa-linha--1">Instituição: {dados.instituicao}</p>
            <p className="he-caixa-linha he-caixa-linha--2">Data: {dados.data_emissao}</p>
          </div>
        </div>
      </div>

      <table className="he-tab he-tab--1">
        <Cabecalho />
        <tbody>
          <Linhas itens={dados.t1} />
          <Linhas itens={dados.t2} primeiraSolta ultimaFechada={completo} />
          {!completo && (
            <tr className="he-tr--total">
              <td className="he-c-sem" />
              <td className="he-c-ano">{dados.ano_total}</td>
              <td className="he-c-disc">Carga Horária Total do Curso: {dados.carga_total}</td>
              <td /><td /><td />
            </tr>
          )}
        </tbody>
      </table>

      {completo && (
        <table className="he-tab he-fecho">
          <tbody>
            <tr>
              <td className="he-fecho-a"><b>TOTAL DA CARGA HORÁRIA CURSADA:</b> {dados.carga_total}</td>
              <td className="he-fecho-b"><b>DATA DE EMISSÃO:</b> {dados.data_emissao}</td>
            </tr>
            <tr>
              <td className="he-fecho-a">
                <b>TÍTULO DO TRABALHO DE CONCLUSÃO:</b> “{dados.titulo_tcc}” &nbsp; <b>NOTA:</b> {dados.nota_tcc}
              </td>
              <td className="he-fecho-b"><b>ORIENTADOR (A):</b><span className="he-fecho-nome">{dados.orientador}</span></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
