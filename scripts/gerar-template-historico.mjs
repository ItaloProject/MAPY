// Gera os templates do histórico escolar a partir do modelo (geraPDFLista.docx), trocando o conteúdo variável
// por marcadores do Docxtemplater e preservando o layout original. Também grava src/lib/historicoEscolarModelo.ts.
// Duas variantes: "simples" -> historico-estacio.docx (termina na linha de carga horária total)
//                 "completo" -> historico-estacio-completo.docx (bloco de fechamento: carga, data, TCC, nota, orientador)
// Uso: node scripts/gerar-template-historico.mjs "C:\caminho\geraPDFLista.docx" [simples|completo]
// Rode as duas variantes sempre que o modelo mudar.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origem = process.argv[2];
const variante = process.argv[3] ?? "completo";
if (!["simples", "completo"].includes(variante)) {
  console.error('Variante inválida. Use "simples" (termina na linha de carga horária) ou "completo" (com o bloco de fechamento).');
  process.exit(1);
}
const completo = variante === "completo";
const destino = path.join(raiz, "public", "templates", completo ? "historico-estacio-completo.docx" : "historico-estacio.docx");
const destinoModelo = path.join(raiz, "src", "lib", "historicoEscolarModelo.ts");
if (!origem || !fs.existsSync(origem)) {
  console.error("Informe o caminho do modelo .docx do histórico (base: geraPDFLista com a assinatura do Flávio).");
  process.exit(1);
}

const x = (t) => ({ cat: "x", t });

// Cada regra localiza o parágrafo pelo texto original e define o novo conteúdo.
const REGRAS = [
  { nome: "assinante", casa: (t) => t.startsWith("Prof. "), novo: [x("{assinante}")] },
  { nome: "curso", casa: (t) => t === "Bacharelado Medicina", novo: [x("{grau} {curso}")] },
  { nome: "nome", casa: (t) => t.startsWith("Nome:"), novo: [x("Nome: {nome} Nacionalidade: {nacionalidade}")] },
  { nome: "rg", casa: (t) => t.startsWith("RG: 1836098"), novo: [x("RG: {rg}")] },
  { nome: "naturalidade", casa: (t) => t.startsWith("Naturalidade:"), novo: [x("Naturalidade: {naturalidade} UF: {uf}")] },
  { nome: "rg 2", casa: (t) => t.startsWith("RG: 35.087"), novo: [x("{#rg_2}RG: {rg_2}{/rg_2}")] },
  { nome: "título", casa: (t) => t === "HISTÓRICO", novo: [x("{titulo}")] },
  { nome: "instituição", casa: (t) => t.startsWith("Instituição:"), novo: [x("Instituição: {instituicao}")] },
  { nome: "data", casa: (t) => t.startsWith("Data:"), novo: [x("Data: {data_emissao}")] },
];

const filhos = (el, nome) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === nome);
const filho = (el, nome) => (el ? filhos(el, nome)[0] ?? null : null);

function textoDoParagrafo(p) {
  return runsDeTexto(p).map((run) => filhos(run, "t").map((t) => t.textContent).join("")).join("");
}

// Runs com w:t diretamente no parágrafo (não desce em caixas de texto).
function runsDeTexto(p) {
  return Array.from(p.childNodes).filter((c) => c.nodeType === 1 && c.localName === "r" && filhos(c, "t").length);
}

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
  const partes = segmento.t.split(/(\{[#/]?[a-z_0-9]+\})/).filter(Boolean);
  const runs = [];
  for (const parte of partes) {
    if (/^\{[#/]?[a-z_0-9]+\}$/.test(parte)) {
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

  const soltos = runsDeTexto(p);
  const perf = perfil(soltos);
  const novos = regra.novo.flatMap((seg) => montarRuns(doc, seg, perf));
  novos.forEach((n) => p.insertBefore(n, soltos[0]));
  soltos.forEach((r) => p.removeChild(r));
  aplicadas.set(regra.nome, aplicadas.get(regra.nome) + 1);
}

const faltando = [...aplicadas].filter(([, n]) => n === 0).map(([nome]) => nome);
if (faltando.length) {
  console.error("Regras sem parágrafo correspondente:", faltando.join(", "));
  process.exit(1);
}

// ── Tabelas de disciplinas: a linha 3 vira o modelo do laço; as demais saem. ──
const COLUNAS = ["sem", "ano", "disciplina", "media", "cm", "situacao"];
const textoDaCelula = (tc) => filhos(tc, "p")
  .map((p) => runsDeTexto(p).map((r) => filhos(r, "t").map((t) => t.textContent).join("")).join(""))
  .join("").trim();

function definirTextoDaCelula(tc, texto) {
  const p = filhos(tc, "p")[0];
  const runs = runsDeTexto(p);
  if (!runs.length) throw new Error("Célula sem texto para receber marcador: " + texto);
  const [primeiro, ...resto] = runs;
  filhos(primeiro, "t").forEach((t, i) => {
    if (i === 0) { t.textContent = texto; t.setAttribute("xml:space", "preserve"); }
    else primeiro.removeChild(t);
  });
  resto.forEach((r) => p.removeChild(r));
}

// Afasta o texto da linha de total da borda inferior: linha mais alta e texto um pouco mais abaixo.
function afastarLinhaTotal(tr) {
  for (const tc of filhos(tr, "tc")) {
    const p = filhos(tc, "p")[0];
    let pPr = filhos(p, "pPr")[0];
    if (!pPr) {
      pPr = doc.createElementNS(W, "w:pPr");
      p.insertBefore(pPr, p.firstChild);
    }
    let sp = filhos(pPr, "spacing")[0];
    if (!sp) {
      sp = doc.createElementNS(W, "w:spacing");
      const estilo = filhos(pPr, "pStyle")[0];
      pPr.insertBefore(sp, estilo ? estilo.nextSibling : pPr.firstChild);
    }
    sp.setAttributeNS(W, "w:before", "60");
  }
  let trPr = filhos(tr, "trPr")[0];
  if (!trPr) {
    trPr = doc.createElementNS(W, "w:trPr");
    tr.insertBefore(trPr, tr.firstChild);
  }
  let altura = filhos(trPr, "trHeight")[0];
  if (!altura) {
    altura = doc.createElementNS(W, "w:trHeight");
    trPr.appendChild(altura);
  }
  altura.setAttributeNS(W, "w:val", "364");
  altura.setAttributeNS(W, "w:hRule", "atLeast");
}

const tabelas = Array.from(doc.getElementsByTagNameNS(W, "tbl"));
if (tabelas.length !== 2) {
  console.error(`Esperava 2 tabelas de disciplinas, encontrei ${tabelas.length}.`);
  process.exit(1);
}

const modelo = { t1: [], t2: [], carga_total: "", ano_total: "" };
tabelas.forEach((tbl, i) => {
  const chave = `t${i + 1}`;
  const linhas = filhos(tbl, "tr");
  const ultima = linhas[linhas.length - 1];
  const ehTotal = i === 1;
  const dados = linhas.slice(1, ehTotal ? -1 : undefined);

  for (const tr of dados) {
    const cel = filhos(tr, "tc").map(textoDaCelula);
    modelo[chave].push(Object.fromEntries(COLUNAS.map((c, k) => [c, cel[k] ?? ""])));
  }

  const molde = linhas[2];
  const celulas = filhos(molde, "tc");
  COLUNAS.forEach((col, k) => {
    let marcador = `{${col}}`;
    if (k === 0) marcador = `{#${chave}}${marcador}`;
    if (k === COLUNAS.length - 1) marcador = `${marcador}{/${chave}}`;
    definirTextoDaCelula(celulas[k], marcador);
  });
  for (const tr of linhas.slice(1)) {
    if (tr === molde || (ehTotal && !completo && tr === ultima)) continue;
    tbl.removeChild(tr);
  }

  if (ehTotal && completo) {
    const linhaFecho = molde.cloneNode(true);
    for (const r of Array.from(linhaFecho.getElementsByTagNameNS(W, "r"))) r.parentNode.removeChild(r);
    for (const bordasCel of Array.from(linhaFecho.getElementsByTagNameNS(W, "tcBorders"))) {
      const inferior = filhos(bordasCel, "bottom")[0];
      if (!inferior) continue;
      inferior.setAttributeNS(W, "w:val", "single");
      inferior.setAttributeNS(W, "w:sz", "12");
      inferior.setAttributeNS(W, "w:space", "0");
      inferior.setAttributeNS(W, "w:color", "000000");
    }
    const alturaLinha = linhaFecho.getElementsByTagNameNS(W, "trHeight")[0];
    if (alturaLinha) {
      alturaLinha.setAttributeNS(W, "w:val", "20");
      alturaLinha.setAttributeNS(W, "w:hRule", "exact");
    }
    molde.parentNode.insertBefore(linhaFecho, molde.nextSibling);
  }

  if (ehTotal) {
    afastarLinhaTotal(ultima);
    const cel = filhos(ultima, "tc")[2];
    const original = textoDaCelula(cel);
    const m = /^Carga Horária Total do Curso:\s*(.+)$/.exec(original);
    if (!m) throw new Error("Linha de carga horária total não encontrada: " + original);
    modelo.carga_total = m[1];
    definirTextoDaCelula(cel, "Carga Horária Total do Curso: {carga_total}");

    const celAno = filhos(ultima, "tc")[1];
    modelo.ano_total = textoDaCelula(celAno);
    definirTextoDaCelula(celAno, "{ano_total}");
  }
});

// Une as duas tabelas em uma só: o cabeçalho aparece uma vez e se repete no topo de cada página nova.
{
  const [tabA, tabB] = tabelas;
  const linhasA = filhos(tabA, "tr");
  const linhasB = filhos(tabB, "tr");
  for (const tr of linhasB.slice(1)) tabA.appendChild(tr);

  let no = tabA.nextSibling;
  while (no && no !== tabB) {
    const prox = no.nextSibling;
    const temSecao = no.nodeType === 1 && no.getElementsByTagNameNS(W, "sectPr").length > 0;
    const temTexto = (no.textContent ?? "").trim().length > 0;
    if (!temSecao && !temTexto) no.parentNode.removeChild(no);
    no = prox;
  }
  tabB.parentNode.removeChild(tabB);

  let trPr = filhos(linhasA[0], "trPr")[0];
  if (!trPr) {
    trPr = doc.createElementNS(W, "w:trPr");
    linhasA[0].insertBefore(trPr, linhasA[0].firstChild);
  }
  if (!filhos(trPr, "tblHeader")[0]) trPr.appendChild(doc.createElementNS(W, "w:tblHeader"));

  const seguinte = tabA.nextSibling;
  if (!seguinte || seguinte.localName !== "p") {
    const p = doc.createElementNS(W, "w:p");
    tabA.parentNode.insertBefore(p, seguinte);
  }
}

// O nome do assinante ocupa a largura inteira da caixa (152,1 pt) e quebraria no Word: alarga a caixa para a direita.
const LARGURA_ASSINANTE = "2540000";
const seteCx = (el) => { if (el) el.setAttribute("cx", LARGURA_ASSINANTE); };
for (const caixa of Array.from(doc.getElementsByTagName("wps:wsp")).filter(w => w.textContent.includes("{assinante}"))) {
  caixa.getElementsByTagName("wps:bodyPr")[0].setAttribute("wrap", "square");
  seteCx(caixa.getElementsByTagName("a:ext")[0]);
  const grupo = caixa.parentNode;
  const xfrm = grupo.getElementsByTagName("wpg:grpSpPr")[0]?.getElementsByTagName("a:xfrm")[0];
  seteCx(xfrm?.getElementsByTagName("a:ext")[0]);
  seteCx(xfrm?.getElementsByTagName("a:chExt")[0]);
  let anc = grupo;
  while (anc && anc.nodeName !== "wp:anchor") anc = anc.parentNode;
  seteCx(anc?.getElementsByTagName("wp:extent")[0]);
}
for (const forma of Array.from(doc.getElementsByTagName("v:shape"))) {
  if (!forma.textContent.includes("{assinante}")) continue;
  forma.setAttribute("style", forma.getAttribute("style").replace(/width:\d+/, "width:4000"));
}

// Bloco de fechamento (carga cursada, data, TCC, nota e orientador) ao final do documento.
const runTcc = (t, negrito = false) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${negrito ? "<w:b/>" : ""}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
const paragrafoTcc = (runs, antes = 20) => `<w:p><w:pPr><w:spacing w:before="${antes}" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
const celulaTcc = (largura, runs) => `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/></w:tcPr>${paragrafoTcc(runs)}</w:tc>`;
const celulaOrientador = (largura, rotulo, nome) => `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/></w:tcPr>${paragrafoTcc(rotulo)}${paragrafoTcc(nome, 80)}</w:tc>`;
const linhaTcc = (c1, c2) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${c1}${c2}</w:tr>`;
const L1 = 6800, L2 = 3472;
const bordas = ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="8" w:space="0" w:color="000000"/>`).join("");
const blocoTcc = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="exact"/></w:pPr></w:p>`
  + `<w:tbl><w:tblPr><w:tblW w:w="${L1 + L2}" w:type="dxa"/><w:tblInd w:w="107" w:type="dxa"/><w:tblBorders>${bordas}</w:tblBorders>`
  + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr>`
  + `<w:tblGrid><w:gridCol w:w="${L1}"/><w:gridCol w:w="${L2}"/></w:tblGrid>`
  + linhaTcc(celulaTcc(L1, runTcc("TOTAL DA CARGA HORÁRIA CURSADA: ", true) + runTcc("{carga_total}")), celulaTcc(L2, runTcc("DATA DE EMISSÃO: ", true) + runTcc("{data_emissao}")))
  + linhaTcc(celulaTcc(L1, runTcc("TÍTULO DO TRABALHO DE CONCLUSÃO: “", true) + runTcc("{titulo_tcc}") + runTcc("”   ") + runTcc("NOTA: ", true) + runTcc("{nota_tcc}")), celulaOrientador(L2, runTcc("ORIENTADOR (A):", true), runTcc("{orientador}")))
  + `</w:tbl>`;

let xmlDoc = new XMLSerializer().serializeToString(doc);
if (completo) {
  const fimCorpo = xmlDoc.lastIndexOf("<w:sectPr");
  xmlDoc = xmlDoc.slice(0, fimCorpo) + blocoTcc + xmlDoc.slice(fimCorpo);
}
zip.file("word/document.xml", xmlDoc);

// Padrão do documento: Arial 9 (o título "HISTÓRICO" mantém o tamanho 15 gravado no próprio trecho).
{
  let estilos = zip.file("word/styles.xml").asText();
  const arial = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
  estilos = estilos.replace(/(<w:rPrDefault><w:rPr>)<w:rFonts[^>]*\/>(<w:sz w:val=")\d+("\/><w:szCs w:val=")\d+("\/>)/,
    `$1${arial}$218$318$4`);
  for (const id of ["Normal", "TableParagraph"]) {
    estilos = estilos.replace(new RegExp(`(<w:style [^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?)(</w:style>)`), (m, ini, fim) => {
      if (/<w:sz w:val=/.test(ini)) return ini.replace(/<w:sz w:val="\d+"\/>/, '<w:sz w:val="18"/>') + fim;
      if (/<\/w:rPr>/.test(ini)) return ini.replace(/<\/w:rPr>/, '<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>') + fim;
      return ini + '<w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>' + fim;
    });
  }
  zip.file("word/styles.xml", estilos);
}

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

const linhaTs = (d) => `  { sem: ${JSON.stringify(d.sem)}, ano: ${JSON.stringify(d.ano)}, disciplina: ${JSON.stringify(d.disciplina)}, media: ${JSON.stringify(d.media)}, cm: ${JSON.stringify(d.cm)}, situacao: ${JSON.stringify(d.situacao)} },`;
fs.writeFileSync(destinoModelo, `// Gerado por scripts/gerar-template-historico.mjs a partir do modelo geraPDFLista.docx. Não editar à mão.
export type Disciplina = { sem: string; ano: string; disciplina: string; media: string; cm: string; situacao: string };

export const CARGA_TOTAL_MODELO = ${JSON.stringify(modelo.carga_total)};
export const ANO_TOTAL_MODELO = ${JSON.stringify(modelo.ano_total)};

export const DISCIPLINAS_T1_MODELO: Disciplina[] = [
${modelo.t1.map(linhaTs).join("\n")}
];

export const DISCIPLINAS_T2_MODELO: Disciplina[] = [
${modelo.t2.map(linhaTs).join("\n")}
];
`);

console.log("Template gerado:", destino);
console.log("Modelo de dados:", destinoModelo);
for (const [nome, n] of aplicadas) console.log(`  ${nome}: ${n}`);
console.log(`  disciplinas: t1=${modelo.t1.length}, t2=${modelo.t2.length}, carga=${modelo.carga_total}, ano_total=${modelo.ano_total}`);
