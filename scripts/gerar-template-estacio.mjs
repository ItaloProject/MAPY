// Gera public/templates/diploma-estacio.docx a partir do diploma original (CGB.docx),
// trocando o conteúdo variável por marcadores do Docxtemplater e preservando a formatação.
// Uso: node scripts/gerar-template-estacio.mjs "C:\caminho\CGB.docx"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origem = process.argv[2];
const destino = path.join(raiz, "public", "templates", "diploma-estacio.docx");
if (!origem || !fs.existsSync(origem)) {
  console.error("Informe o caminho do CGB.docx original.");
  process.exit(1);
}

const g = (t) => ({ cat: "g", t });
const d = (t) => ({ cat: "d", t });
const x = (t) => ({ cat: "x", t });

// Cada regra localiza o parágrafo pelo texto original e define o novo conteúdo.
// g = texto fixo cinza, d = dado em preto, x = mesmo formato do primeiro trecho do parágrafo.
const REGRAS = [
  {
    nome: "IES (título)",
    casa: (t, p) => t === "CENTRO UNIVERSITÁRIO ESTÁCIO DE RIBEIRÃO PRETO" && estilo(p) === "Heading1",
    novo: [x("{instituicao}")],
  },
  {
    nome: "abertura",
    casa: (t) => t.startsWith("O(A) Reitor(a) do "),
    novo: [g("O(A) Reitor(a) do "), d("{instituicao}"), g(", no uso de suas")],
  },
  {
    nome: "corpo",
    casa: (t) => t.startsWith("atribuições, tendo em vista"),
    novo: [
      g("atribuições, tendo em vista a conclusão do "), d("{curso_descricao}"),
      g(", na data de "), d("{data}"),
      g(", e a colação de grau na data de "), d("{data_colacao}"),
      g(", confere o título de "), d("{modalidade} "),
      g("a "), d("{nome}"),
      g(", nacionalidade "), d("{nacionalidade}"),
      g(", natural de "), d("{naturalidade}"),
      g(", nascido(a) em "), d("{nascimento}"),
      g(", portador(a) da Cédula de Identidade "), d("{rg}"),
      g(", órgão expedidor "), d("{orgao_expedidor}"),
      g(", e outorga-lhe o presente Diploma, a fim de que possa gozar de todos os direitos e prerrogativas legais."),
    ],
  },
  {
    nome: "local e data",
    casa: (t) => /^Ribeirão Preto - SP, \d/.test(t),
    novo: [x("{cidade_expedicao}, {data_expedicao_extenso}.")],
  },
  { nome: "reitor", casa: (t) => t === "JONAS DOS SANTOS COLVARA", novo: [x("{reitor}")] },
  {
    nome: "IES (rodapé)",
    casa: (t, p) => t === "CENTRO UNIVERSITÁRIO ESTÁCIO DE RIBEIRÃO PRETO" && estilo(p) !== "Heading1",
    novo: [x("{instituicao}")],
  },
  {
    nome: "código de validação",
    casa: (t) => t.startsWith("Código de Validação:"),
    novo: [x("Código de Validação: {pub_id} | ")],
    link: "{url}",
  },
  {
    nome: "registro",
    casa: (t) => t.startsWith("Diploma registrado sob o n°"),
    novo: [x(
      "Diploma registrado sob o n° {registro_numero}, Livro {registro_livro}, fls {registro_folha}, em {registro_data}, " +
      "por delegação de competência do Ministério da Educação, nos termos da Lei nº 9.394 de 20 de dezembro de 1996, " +
      "e do Decreto nº 9.235, de 15 de dezembro de 2017."
    )],
  },
  {
    nome: "processo",
    casa: (t) => t.startsWith("Processo n°"),
    novo: [x("Processo n° {registro_processo}. Rio de Janeiro - RJ, {registro_data}")],
  },
  { nome: "curso (verso)", casa: (t) => t.startsWith("Curso de "), novo: [x("Curso de {curso_nome}")] },
  {
    nome: "reconhecimento",
    casa: (t) => t.startsWith("Reconhecimento: "),
    novo: [x("Reconhecimento: {curso_reconhecimento}")],
  },
  { nome: "número do verso", casa: (t) => /^\d{10,}$/.test(t), novo: [x("{protocolo}")] },
];

const filhos = (el, nome) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === nome);
const filho = (el, nome) => (el ? filhos(el, nome)[0] ?? null : null);
const estilo = (p) => filho(filho(p, "pPr"), "pStyle")?.getAttributeNS(W, "val") ?? null;

function textoDoParagrafo(p) {
  return runsDeTexto(p).map(({ run }) => filhos(run, "t").map((t) => t.textContent).join("")).join("");
}

// Runs com w:t diretamente no parágrafo ou dentro de hyperlink (não desce em caixas de texto).
function runsDeTexto(p) {
  const lista = [];
  for (const c of Array.from(p.childNodes)) {
    if (c.nodeType !== 1) continue;
    if (c.localName === "r" && filhos(c, "t").length) lista.push({ run: c, link: null });
    if (c.localName === "hyperlink") {
      for (const r of filhos(c, "r")) if (filhos(r, "t").length) lista.push({ run: r, link: c });
    }
  }
  return lista;
}

const ehCinza = (run) => filho(filho(run, "rPr"), "color")?.getAttributeNS(W, "val")?.toUpperCase() === "696969";
const espacamento = (run) => Number(filho(filho(run, "rPr"), "spacing")?.getAttributeNS(W, "val") ?? 0);

function moda(valores) {
  if (!valores.length) return 0;
  const cont = new Map();
  for (const v of valores) cont.set(v, (cont.get(v) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0][0];
}

function perfil(runs) {
  const palavras = [], espacos = [];
  for (const r of runs) {
    const t = filhos(r, "t").map((n) => n.textContent).join("");
    (t.trim() ? palavras : espacos).push(espacamento(r));
  }
  return { modelo: runs[0], palavra: moda(palavras), espaco: moda(espacos.length ? espacos : palavras) };
}

function novoRun(doc, modelo, texto, esp) {
  const run = doc.createElementNS(W, "w:r");
  const rPrOrig = filho(modelo, "rPr");
  if (rPrOrig) {
    const rPr = rPrOrig.cloneNode(true);
    filhos(rPr, "spacing").forEach((s) => rPr.removeChild(s));
    filhos(rPr, "w").forEach((s) => rPr.removeChild(s));
    if (esp) {
      const s = doc.createElementNS(W, "w:spacing");
      s.setAttributeNS(W, "w:val", String(esp));
      const ref = filho(rPr, "sz") ?? filho(rPr, "szCs");
      ref ? rPr.insertBefore(s, ref) : rPr.appendChild(s);
    }
    run.appendChild(rPr);
  }
  const t = doc.createElementNS(W, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(texto));
  run.appendChild(t);
  return run;
}

// Texto fixo vira um run por palavra/espaço (espaçamento do original);
// marcadores ficam inteiros num único run para o Docxtemplater.
function montarRuns(doc, segmento, perf) {
  const partes = segmento.t.split(/(\{[a-z_]+\})/).filter(Boolean);
  const runs = [];
  for (const parte of partes) {
    if (/^\{[a-z_]+\}$/.test(parte)) {
      runs.push(novoRun(doc, perf.modelo, parte, perf.palavra));
      continue;
    }
    for (const token of parte.split(/( +)/).filter(Boolean)) {
      runs.push(novoRun(doc, perf.modelo, token, token.trim() ? perf.palavra : perf.espaco));
    }
  }
  return runs;
}

const zip = new PizZip(fs.readFileSync(origem));
const doc = new DOMParser().parseFromString(zip.file("word/document.xml").asText(), "application/xml");
const aplicadas = new Map(REGRAS.map((r) => [r.nome, 0]));

for (const p of Array.from(doc.getElementsByTagNameNS(W, "p"))) {
  const texto = textoDoParagrafo(p);
  if (!texto.trim()) continue;
  const regra = REGRAS.find((r) => r.casa(texto, p));
  if (!regra) continue;

  const runs = runsDeTexto(p);
  const soltos = runs.filter((r) => !r.link).map((r) => r.run);
  const doLink = runs.filter((r) => r.link);
  const cinzas = soltos.filter(ehCinza);
  const pretos = soltos.filter((r) => !ehCinza(r));
  const perfis = {
    x: perfil(soltos),
    g: perfil(cinzas.length ? cinzas : soltos),
    d: perfil(pretos.length ? pretos : soltos),
  };

  const ancora = soltos[0];
  const novos = regra.novo.flatMap((seg) => montarRuns(doc, seg, perfis[seg.cat]));
  novos.forEach((n) => p.insertBefore(n, ancora));
  soltos.forEach((r) => p.removeChild(r));

  if (regra.link && doLink.length) {
    const link = doLink[0].link;
    const [primeiro, ...resto] = doLink.map((r) => r.run);
    filhos(primeiro, "t").forEach((t, i) => {
      if (i === 0) { t.textContent = regra.link; t.setAttribute("xml:space", "preserve"); }
      else primeiro.removeChild(t);
    });
    resto.forEach((r) => link.removeChild(r));
  }
  aplicadas.set(regra.nome, aplicadas.get(regra.nome) + 1);
}

const faltando = [...aplicadas].filter(([, n]) => n === 0).map(([nome]) => nome);
if (faltando.length) {
  console.error("Regras sem parágrafo correspondente:", faltando.join(", "));
  process.exit(1);
}
let documentoXml = new XMLSerializer().serializeToString(doc);
documentoXml = documentoXml.replace(
  /(<w:t>)RIBEIRÃO(<\/w:t><\/w:r><w:r><w:rPr><w:spacing w:val="-5"\/><\/w:rPr><w:t>) (<\/w:t><\/w:r><w:r><w:rPr\/><w:t>)PRETO(<\/w:t>)/,
  "$1{mantenedora_lugar}$2$3$4",
);
zip.file("word/document.xml", documentoXml);

// O título original usa recuo suspenso medido para "DE RIBEIRÃO PRETO".
// Sem centralizar, a segunda linha de outro nome (ex.: "DE BACABAL") fica à esquerda.
const stylesPath = "word/styles.xml";
const stylesXml = zip.file(stylesPath)?.asText();
if (stylesXml) {
  zip.file(stylesPath, stylesXml.replace(
    /(<w:style w:styleId="Heading1"[\s\S]*?<w:pPr>)[\s\S]*?(<\/w:pPr>)/,
    '$1<w:spacing w:before="66"/><w:ind w:left="4372" w:right="4372"/><w:jc w:val="center"/><w:outlineLvl w:val="1"/>$2',
  ));
}

// O QR do verso passa a ter caminho fixo para o painel substituí-lo na geração.
const relsPath = "word/_rels/document.xml.rels";
const rels = zip.file(relsPath).asText();
const docTxt = zip.file("word/document.xml").asText();
const alvoQr = [...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="(media\/[^"]+\.png)"[^>]*\/>/g)]
  .map((m) => ({ id: m[1], alvo: m[2] }))
  .find(({ id }) => {
    const ext = new RegExp(`<wp:extent cx="(\\d+)" cy="(\\d+)"/>(?:(?!</wp:anchor>)[\\s\\S])*?r:embed="${id}"`).exec(docTxt);
    return ext && Math.abs(Number(ext[1]) - Number(ext[2])) < Number(ext[1]) * 0.15 && Number(ext[1]) < 2_000_000;
  });
if (!alvoQr) {
  console.error("Imagem do QR Code não encontrada.");
  process.exit(1);
}
zip.file("word/media/qrcode.png", zip.file("word/" + alvoQr.alvo).asUint8Array());
zip.remove("word/" + alvoQr.alvo);
zip.file(relsPath, rels.replace(`Target="${alvoQr.alvo}"`, 'Target="media/qrcode.png"'));

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Template gerado:", destino);
for (const [nome, n] of aplicadas) console.log(`  ${nome}: ${n}`);
