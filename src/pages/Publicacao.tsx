import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate, useLocation, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { UsuarioLogado } from "../lib/usuario";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { supabase } from "../lib/supabase";
import { marcarConcluido } from "../lib/controle";
import { carregarRascunho, salvarRascunho, apagarRascunho, type Rascunho } from "../lib/rascunhos";
import HistoricoRegistros from "./HistoricoRegistros";
import "../components/Layout.css";
import "./Publicacao.css";

/* ── Helpers de template DOCX ──
   O template oficial é gerado por scripts/gerar-template-estacio.mjs a partir do diploma original. */
const TEMPLATE_URL = "/templates/diploma-estacio.docx";
const TEMPLATE_QR = "word/media/qrcode.png";
const TEMPLATE_KEY_LEGADO = "docx_template_estacio";

let templateCache: Promise<ArrayBuffer> | null = null;
function carregarTemplateEstacio(): Promise<ArrayBuffer> {
  templateCache ??= fetch(TEMPLATE_URL).then(async r => {
    if (!r.ok) throw new Error(`Template indisponível (HTTP ${r.status})`);
    const buf = await r.arrayBuffer();
    const assinatura = new Uint8Array(buf, 0, 2);
    if (assinatura[0] !== 0x50 || assinatura[1] !== 0x4b) throw new Error("Template recebido não é um .docx");
    return buf;
  }).catch(e => { templateCache = null; throw e; });
  return templateCache;
}

const STORAGE_BUCKET = "diplomas";
const DIPLOMA_BASE = "https://consultadiploma.estaciio.com.br/diploma";

async function uploadDocxStorage(blob: Blob, pubId: string): Promise<string | null> {
  try {
    const path = `estacio/${pubId}.docx`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (error) {
      console.error("[docx upload]", error.message, error);
      return null;
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    // O caminho se repete a cada edição; a versão evita que o CDN entregue o arquivo anterior.
    const url = `${data.publicUrl}?v=${Date.now()}`;
    console.log("[docx upload] ok →", url);
    return url;
  } catch (e) {
    console.error("[docx upload] catch", e);
    return null;
  }
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function dataPorExtenso(valor: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor.trim());
  if (!m || !MESES[Number(m[2]) - 1]) return valor;
  return `${Number(m[1])} de ${MESES[Number(m[2]) - 1]} de ${m[3]}`;
}

const PREFIXO_TECNOLOGIA = "CURSO SUPERIOR DE TECNOLOGIA EM ";
const RECONHECIMENTO_FIXO = "Portaria MEC n° 967, de 01/09/2017, DOU n° 170, Seção 1, Pág. 17, de 04/09/2017.";
const PROCESSO_FIXO = "SRD/6247907-IP/2022";
const REGISTRO_INICIAL = 27046;

function chaveRegistro(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos ? String(Number(digitos)) : "";
}

async function chavesRegistroPublicadas(excetoPubId?: string): Promise<Set<string>> {
  const usados = new Set<string>();
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabase
      .from("publicacoes")
      .select("pub_id, registro_numero")
      .eq("grupo", "estacio")
      .not("registro_numero", "is", null)
      .range(inicio, inicio + pagina - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (excetoPubId && row.pub_id === excetoPubId) continue;
      const chave = chaveRegistro(String(row.registro_numero ?? ""));
      if (chave) usados.add(chave);
    }
    if (!data || data.length < pagina) break;
  }
  return usados;
}

function proximoRegistroLivre(usados: Set<string>): string {
  let n = REGISTRO_INICIAL;
  while (usados.has(String(n))) n += 1;
  return String(n);
}

async function registroRepetido(numero: string, excetoPubId?: string): Promise<string | null> {
  const chave = chaveRegistro(numero);
  if (!chave) return null;
  const usados = await chavesRegistroPublicadas(excetoPubId);
  if (!usados.has(chave)) return null;
  return "Esse nº de registro já foi publicado. Informe outro ou use Gerar número.";
}

const PREFIXO_INSTITUICAO = "CENTRO UNIVERSITÁRIO ESTÁCIO DE ";

function instituicaoEstacio(v: string): string {
  const texto = v.toUpperCase();
  if (texto.startsWith(PREFIXO_INSTITUICAO)) return texto;
  const marca = texto.match(/EST[AÁ]CIO\s+DE\s*([\s\S]*)$/i);
  if (marca) return PREFIXO_INSTITUICAO + marca[1].trimStart();
  if (PREFIXO_INSTITUICAO.startsWith(texto)) return PREFIXO_INSTITUICAO;
  return PREFIXO_INSTITUICAO + texto.trimStart();
}

function instituicaoSemLugar(v: string) {
  return !/EST[AÁ]CIO\s+DE\s+\S/i.test(v);
}

// "CENTRO UNIVERSITÁRIO ESTÁCIO DE BACABAL" → "BACABAL", no lugar de "RIBEIRÃO PRETO".
function lugarMantenedora(instituicao: string): string {
  const nome = instituicao.trim();
  const marca = nome.match(/EST[AÁ]CIO\s+DE\s+(.+)$/i);
  return (marca?.[1] || nome).trim();
}

// Frente: "CURSO SUPERIOR DE TECNOLOGIA EM GESTÃO DE TURISMO"; verso: "Curso de GESTÃO DE TURISMO".
function nomesDoCurso(curso: string, modalidade: string): { descricao: string; nome: string } {
  const limpo = curso.trim();
  const nome = limpo.replace(/^CURSO SUPERIOR DE TECNOLOGIA EM\s+/i, "").replace(/^CURSO DE\s+/i, "");
  if (/^CURSO\b/i.test(limpo)) return { descricao: limpo, nome };
  return { descricao: (/TECN[OÓ]LOGO/i.test(modalidade) ? PREFIXO_TECNOLOGIA : "CURSO DE ") + nome, nome };
}

function dadosDoDiploma(c: Cliente): Record<string, string> {
  const curso = nomesDoCurso(c.curso, c.modalidade);
  return {
    instituicao: c.instituicao,
    mantenedora_lugar: lugarMantenedora(c.instituicao),
    reitor: c.reitor,
    curso_descricao: curso.descricao,
    curso_nome: curso.nome,
    curso_reconhecimento: RECONHECIMENTO_FIXO,
    modalidade: c.modalidade.replace(/\s*\(A\)$/i, " (A)"),
    data: c.data,
    data_colacao: c.dataColacao,
    nome: c.nome,
    nacionalidade: c.nacionalidade,
    naturalidade: c.naturalidade,
    nascimento: c.nascimento,
    rg: c.rg,
    orgao_expedidor: c.orgaoExpedidor,
    cidade_expedicao: c.cidadeExpedicao,
    data_expedicao_extenso: dataPorExtenso(c.dataExpedicao),
    registro_numero: c.registroNumero,
    registro_livro: c.registroLivro,
    registro_folha: c.registroFolha,
    registro_data: c.registroData,
    registro_processo: PROCESSO_FIXO,
    protocolo: c.protocolo,
    pub_id: c.pubId,
    url: c.url,
  };
}

const hexAleatorio = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(b => b.toString(16).padStart(2, "0")).join("");

// Estácio: mesmo formato do Código de Validação oficial, ex. "1270.163.c792736cf907".
const PREFIXO_CODIGO_ESTACIO = "1270.163.";

async function gerarPubId(estacio: boolean): Promise<string> {
  if (!estacio) return hexAleatorio(5);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const id = PREFIXO_CODIGO_ESTACIO + hexAleatorio(6);
    const { count, error } = await supabase
      .from("publicacoes").select("pub_id", { count: "exact", head: true }).eq("pub_id", id);
    if (error || !count) return id;
  }
  return PREFIXO_CODIGO_ESTACIO + hexAleatorio(6);
}

const escXml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function gerarDocxPreenchido(template: ArrayBuffer, cliente: Cliente): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }, { default: QRCode }] = await Promise.all([
    import("pizzip"),
    import("docxtemplater"),
    import("qrcode"),
  ]);
  const zip = new PizZip(template);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(dadosDoDiploma(cliente));
  const saida = doc.getZip();

  const qr = await QRCode.toDataURL(cliente.url, {
    errorCorrectionLevel: QR_STYLE.level, margin: QR_STYLE.marginSize, width: 512,
    color: { dark: QR_STYLE.fgColor, light: QR_STYLE.bgColor },
  });
  saida.file(TEMPLATE_QR, qr.split(",")[1], { base64: true });

  const relsPath = "word/_rels/document.xml.rels";
  const rels = saida.file(relsPath)?.asText();
  if (rels) {
    saida.file(relsPath, rels.replace(
      /(<Relationship [^>]*Type="[^"]*\/hyperlink"[^>]*Target=")[^"]*(")/g,
      `$1${escXml(cliente.url)}$2`,
    ));
  }

  const out = saida.generate({ type: "arraybuffer" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

// Gera o diploma preenchido e publica no Storage; docxUrl fica vazio se o upload falhar.
async function publicarDocxEstacio(cliente: Cliente): Promise<{ blob: Blob; docxUrl: string | null }> {
  const blob = await gerarDocxPreenchido(await carregarTemplateEstacio(), cliente);
  const docxUrl = await uploadDocxStorage(blob, cliente.pubId);
  return { blob, docxUrl };
}

async function renderizarDocx(blob: Blob, container: HTMLElement) {
  const { renderAsync } = await import("docx-preview");
  container.innerHTML = "";
  await renderAsync(blob, container);
}

/* ── Preview inline do DOCX ── */
function DocxPreview({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    renderizarDocx(blob, ref.current).catch(() => setErro(true));
  }, [blob]);

  if (erro) return <p style={{ color: "#f87171", fontSize: 13 }}>Não foi possível renderizar o documento.</p>;
  return (
    <div ref={ref} style={{
      background: "#fff", borderRadius: 6, border: "1px solid #e5e5e5",
      padding: "8px", maxHeight: 500, overflowY: "auto", width: "100%",
    }} />
  );
}

/* ── Máscaras ── */
function maskData(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function maskCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskRG(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 13);
  if (d.length < 13) return d;
  return `${d.slice(0, 12)}-${d.slice(12)}`;
}
function maskCEP(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
function maskOrgao(v: string) {
  const letters = v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (letters.length < 3) return letters;
  if (letters.length === 3) return /[A-Z]{3}\//.test(v.toUpperCase()) ? `${letters}/` : letters;
  return `${letters.slice(0, 3)}/${letters.slice(3)}`;
}
function orgaoIncompleto(v: string) {
  return !!v.trim() && !/^[A-Z]{3}\/[A-Z]{2}$/.test(v);
}
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
function maskCidadeUf(v: string) {
  const texto = v.replace(/[^A-Za-zÀ-ÿ\s\-\/]/g, "").replace(/^\s+/, "").replace(/[ \t]{2,}/g, " ");
  const separado = texto.match(/^(.*?)\s+[-\/]\s*([A-Za-z]{0,2})\s*$/);
  if (separado && separado[1].trim()) {
    const cidade = separado[1].trim();
    const uf = separado[2].toUpperCase();
    if (uf) return `${cidade} - ${uf}`;
    if (/\s$/.test(texto)) return `${cidade} - `;
    if (/[-\/]$/.test(texto.trimEnd())) return `${cidade} -`;
    return cidade;
  }
  const colado = texto.match(/^(.*\S)[-\/]([A-Za-z]{2})\s*$/);
  if (colado) return `${colado[1].trim()} - ${colado[2].toUpperCase()}`;
  const solto = texto.match(/^(.*\S)\s+([A-Za-z]{2})\s*$/);
  if (solto && UFS.has(solto[2].toUpperCase())) return `${solto[1]} - ${solto[2].toUpperCase()}`;
  return texto;
}
function cidadeUfIncompleta(v: string) {
  if (!v.trim()) return false;
  const m = v.match(/^(.+?) - ([A-Z]{2})$/);
  return !m || !UFS.has(m[2]);
}
const up = (v: string) => v.toUpperCase();

type EnderecoEmec = {
  logradouro: string; numero: string; bairro: string; cep: string;
  municipio: string; codigoMunicipio: string; uf: string;
};
type DadosEmec = {
  ies: { nome: string; codigoMec: string; cnpj: string; mantenedora: string } & EnderecoEmec;
  curso: { nome: string; codigo: string; titulo: string; grau: string } & EnderecoEmec;
  registro: { nome: string; codigoMec: string; cnpj: string; mantenedora: string } & EnderecoEmec;
};
const ENDERECO_EMEC_VAZIO: EnderecoEmec = {
  logradouro: "", numero: "", bairro: "", cep: "", municipio: "", codigoMunicipio: "", uf: "",
};
function emecVazio(): DadosEmec {
  return {
    ies: { nome: "", codigoMec: "1270", cnpj: "07195358000166", mantenedora: "", ...ENDERECO_EMEC_VAZIO },
    curso: { nome: "", codigo: "", titulo: "", grau: "", ...ENDERECO_EMEC_VAZIO },
    registro: {
      nome: "UNIVERSIDADE ESTÁCIO DE SÁ", codigoMec: "163", cnpj: "34075739000184",
      mantenedora: "SOCIEDADE DE ENSINO SUPERIOR ESTÁCIO DE SÁ",
      logradouro: "AVENIDA DAS AMERICAS", numero: "4200", bairro: "BARRA DA TIJUCA",
      cep: "22640102", municipio: "RIO DE JANEIRO", codigoMunicipio: "3304557", uf: "RJ",
    },
  };
}
function mesclarEmec(salvo?: Partial<DadosEmec> | null): DadosEmec {
  const base = emecVazio();
  if (!salvo) return base;
  return {
    ies: { ...base.ies, ...salvo.ies },
    curso: { ...base.curso, ...salvo.curso },
    registro: { ...base.registro, ...salvo.registro },
  };
}
function sexoSalvo(inep: string | undefined): string {
  if (!inep?.trim().startsWith("{")) return "";
  try {
    const s = String(JSON.parse(inep).sexo ?? "").toUpperCase();
    if (s === "M" || s.startsWith("MASC")) return "M";
    if (s === "F" || s.startsWith("FEM")) return "F";
    return "";
  } catch { return ""; }
}
function inepComDados(c: { dadosEmec: DadosEmec | null; sexo: string; inep: string }): string {
  if (!c.dadosEmec && !c.sexo) return c.inep;
  return JSON.stringify({ ...(c.dadosEmec ?? {}), ...(c.sexo ? { sexo: c.sexo } : {}) });
}
function lerDadosEmec(inep: string | undefined): DadosEmec | null {
  if (!inep?.trim().startsWith("{")) return null;
  try {
    const o = JSON.parse(inep);
    if (!o?.ies || !o?.curso || !o?.registro) return null;
    return mesclarEmec(o);
  } catch { return null; }
}
function chavesEmec(d: DadosEmec): string[] {
  const chaves: string[] = [];
  (["ies", "curso", "registro"] as const).forEach(bloco => {
    Object.keys(d[bloco]).forEach(campo => chaves.push(`${bloco}.${campo}`));
  });
  return chaves;
}
function tituloDe(modalidade: string) {
  const n = modalidade.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (n.startsWith("BACHAREL")) return "BACHAREL";
  if (n.startsWith("LICEN")) return "LICENCIADO (A)";
  if (n.startsWith("TECNOLOG")) return "TECNÓLOGO (A)";
  if (n.startsWith("ESPECIAL")) return "ESPECIALISTA";
  if (n.startsWith("MESTRE")) return "MESTRE";
  if (n.startsWith("DOUTOR")) return "DOUTOR (A)";
  return modalidade;
}
function grauDe(modalidade: string) {
  const n = modalidade.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (n.startsWith("BACHAREL")) return "Bacharelado";
  if (n.startsWith("LICEN")) return "Licenciatura";
  if (n.startsWith("TECNOLOG")) return "Tecnólogo";
  if (n.startsWith("ESPECIAL")) return "Especialização";
  if (n.startsWith("MESTRE")) return "Mestrado";
  if (n.startsWith("DOUTOR")) return "Doutorado";
  return modalidade;
}
const chaveMunicipio = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const municipiosPorUf = new Map<string, Promise<Map<string, string>>>();
function municipiosIbge(uf: string): Promise<Map<string, string>> {
  let lista = municipiosPorUf.get(uf);
  if (!lista) {
    lista = fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((itens: { id: number; nome: string }[]) => new Map(itens.map(m => [chaveMunicipio(m.nome), String(m.id)])));
    lista.catch(() => municipiosPorUf.delete(uf));
    municipiosPorUf.set(uf, lista);
  }
  return lista;
}

function sugerirEmec(prev: DadosEmec, origem: {
  instituicao: string; curso: string; modalidade: string; endereco: string;
  bairro: string; cep: string; municipio: string; cidadeExpedicao: string;
}, manual: Set<string>): DadosEmec {
  const ies = { ...prev.ies };
  const curso = { ...prev.curso };
  let mudou = false;
  const por = (bloco: string, campo: string, valor: string, alvo: Record<string, string>) => {
    if (manual.has(`${bloco}.${campo}`) || alvo[campo] === valor) return;
    alvo[campo] = valor;
    mudou = true;
  };
  const cidade = origem.municipio.replace(/\s*[-/]\s*[A-Za-z]{2}\s*$/, "").trim().toUpperCase();
  const uf = origem.cidadeExpedicao.match(/ - ([A-Z]{2})$/)?.[1] ?? "";
  const cep = origem.cep.replace(/\D/g, "");
  const lugar = lugarMantenedora(origem.instituicao);
  const mantenedora = lugar && lugar !== origem.instituicao.trim()
    ? `SOCIEDADE DE ENSINO SUPERIOR ESTÁCIO DE ${lugar} LTDA` : "";
  por("ies", "nome", origem.instituicao, ies);
  por("ies", "logradouro", origem.endereco, ies);
  por("ies", "bairro", origem.bairro, ies);
  por("ies", "cep", cep, ies);
  por("ies", "municipio", cidade, ies);
  if (uf) por("ies", "uf", uf, ies);
  if (mantenedora) por("ies", "mantenedora", mantenedora, ies);
  por("curso", "nome", origem.curso, curso);
  por("curso", "titulo", tituloDe(origem.modalidade), curso);
  por("curso", "grau", grauDe(origem.modalidade), curso);
  por("curso", "logradouro", origem.endereco, curso);
  por("curso", "bairro", origem.bairro, curso);
  por("curso", "cep", cep, curso);
  por("curso", "municipio", cidade, curso);
  if (uf) por("curso", "uf", uf, curso);
  return mudou ? { ...prev, ies, curso } : prev;
}


/* ── Municípios do Maranhão ── */
const MUNICIPIOS_MA: { nome: string; cep: string }[] = [
  { nome: "AÇAILÂNDIA", cep: "65930-000" },
  { nome: "AFONSO CUNHA", cep: "65640-000" },
  { nome: "ÁGUA DOCE DO MARANHÃO", cep: "65296-000" },
  { nome: "ALCÂNTARA", cep: "65250-000" },
  { nome: "ALDEIAS ALTAS", cep: "65570-000" },
  { nome: "ALTAMIRA DO MARANHÃO", cep: "65345-000" },
  { nome: "ALTO ALEGRE DO MARANHÃO", cep: "65185-000" },
  { nome: "ALTO ALEGRE DO PINDARÉ", cep: "65325-000" },
  { nome: "ALTO PARNAÍBA", cep: "65870-000" },
  { nome: "AMAPÁ DO MARANHÃO", cep: "65383-000" },
  { nome: "AMARANTE DO MARANHÃO", cep: "65965-000" },
  { nome: "ANAJATUBA", cep: "65140-000" },
  { nome: "ANAPURUS", cep: "65460-000" },
  { nome: "APICUM-AÇU", cep: "65230-000" },
  { nome: "ARAGUANÃ", cep: "65927-000" },
  { nome: "ARAIOSES", cep: "65465-000" },
  { nome: "ARAME", cep: "65970-000" },
  { nome: "ARARI", cep: "65155-000" },
  { nome: "AXIXÁ", cep: "65145-000" },
  { nome: "BACABAL", cep: "65700-000" },
  { nome: "BACABEIRA", cep: "65125-000" },
  { nome: "BACURI", cep: "65245-000" },
  { nome: "BACURITUBA", cep: "65246-000" },
  { nome: "BALSAS", cep: "65800-000" },
  { nome: "BARÃO DE GRAJAÚ", cep: "65605-000" },
  { nome: "BARRA DO CORDA", cep: "65950-000" },
  { nome: "BARREIRINHAS", cep: "65590-000" },
  { nome: "BELÁGUA", cep: "65462-000" },
  { nome: "BELA VISTA DO MARANHÃO", cep: "65185-000" },
  { nome: "BENEDITO LEITE", cep: "65875-000" },
  { nome: "BEQUIMÃO", cep: "65220-000" },
  { nome: "BERNARDO DO MEARIM", cep: "65726-000" },
  { nome: "BOA VISTA DO GURUPI", cep: "65380-000" },
  { nome: "BOM JARDIM", cep: "65320-000" },
  { nome: "BOM JESUS DAS SELVAS", cep: "65935-000" },
  { nome: "BOM LUGAR", cep: "65728-000" },
  { nome: "BREJO", cep: "65455-000" },
  { nome: "BREJO DE AREIA", cep: "65710-000" },
  { nome: "BURITI", cep: "65475-000" },
  { nome: "BURITI BRAVO", cep: "65565-000" },
  { nome: "BURITICUPU", cep: "65932-000" },
  { nome: "BURITIRANA", cep: "65910-000" },
  { nome: "CACHOEIRA GRANDE", cep: "65170-000" },
  { nome: "CAJAPIÓ", cep: "65165-000" },
  { nome: "CAJARI", cep: "65232-000" },
  { nome: "CAMPESTRE DO MARANHÃO", cep: "65908-000" },
  { nome: "CÂNDIDO MENDES", cep: "65385-000" },
  { nome: "CANTANHEDE", cep: "65560-000" },
  { nome: "CAROLINA", cep: "65980-000" },
  { nome: "CARUTAPERA", cep: "65395-000" },
  { nome: "CAXIAS", cep: "65604-000" },
  { nome: "CEDRAL", cep: "65476-000" },
  { nome: "CENTRAL DO MARANHÃO", cep: "65213-000" },
  { nome: "CENTRO DO GUILHERME", cep: "65337-000" },
  { nome: "CENTRO NOVO DO MARANHÃO", cep: "65382-000" },
  { nome: "CHAPADINHA", cep: "65500-000" },
  { nome: "CIDELÂNDIA", cep: "65912-000" },
  { nome: "CODÓ", cep: "65400-000" },
  { nome: "COELHO NETO", cep: "65620-000" },
  { nome: "COLINAS", cep: "65680-000" },
  { nome: "CONCEIÇÃO DO LAGO-AÇU", cep: "65715-000" },
  { nome: "COROATÁ", cep: "65580-000" },
  { nome: "CURURUPU", cep: "65225-000" },
  { nome: "DAVINÓPOLIS", cep: "65921-000" },
  { nome: "DOM PEDRO", cep: "65540-000" },
  { nome: "DUQUE BACELAR", cep: "65575-000" },
  { nome: "ESPERANTINÓPOLIS", cep: "65720-000" },
  { nome: "ESTREITO", cep: "65990-000" },
  { nome: "FEIRA NOVA DO MARANHÃO", cep: "65870-000" },
  { nome: "FERNANDO FALCÃO", cep: "65966-000" },
  { nome: "FORMOSA DA SERRA NEGRA", cep: "65945-000" },
  { nome: "FORTALEZA DOS NOGUEIRAS", cep: "65860-000" },
  { nome: "FORTUNA", cep: "65655-000" },
  { nome: "GODOFREDO VIANA", cep: "65395-000" },
  { nome: "GONÇALVES DIAS", cep: "65660-000" },
  { nome: "GOVERNADOR ARCHER", cep: "65545-000" },
  { nome: "GOVERNADOR EDISON LOBÃO", cep: "65905-000" },
  { nome: "GOVERNADOR EUGÊNIO BARROS", cep: "65550-000" },
  { nome: "GOVERNADOR LUIZ ROCHA", cep: "65548-000" },
  { nome: "GOVERNADOR NEWTON BELLO", cep: "65356-000" },
  { nome: "GOVERNADOR NUNES FREIRE", cep: "65370-000" },
  { nome: "GRAJAÚ", cep: "65940-000" },
  { nome: "GUIMARÃES", cep: "65210-000" },
  { nome: "HUMBERTO DE CAMPOS", cep: "65595-000" },
  { nome: "ICATU", cep: "65147-000" },
  { nome: "IGARAPÉ DO MEIO", cep: "65286-000" },
  { nome: "IGARAPÉ GRANDE", cep: "65730-000" },
  { nome: "IMPERATRIZ", cep: "65900-000" },
  { nome: "ITAIPAVA DO GRAJAÚ", cep: "65942-000" },
  { nome: "ITAPECURU MIRIM", cep: "65150-000" },
  { nome: "ITINGA DO MARANHÃO", cep: "65933-000" },
  { nome: "JATOBÁ", cep: "65735-000" },
  { nome: "JENIPAPO DOS VIEIRAS", cep: "65968-000" },
  { nome: "JOÃO LISBOA", cep: "65915-000" },
  { nome: "JOSELÂNDIA", cep: "65740-000" },
  { nome: "JUNCO DO MARANHÃO", cep: "65386-000" },
  { nome: "LAGO DA PEDRA", cep: "65705-000" },
  { nome: "LAGO DO JUNCO", cep: "65720-000" },
  { nome: "LAGO DOS RODRIGUES", cep: "65718-000" },
  { nome: "LAGO VERDE", cep: "65712-000" },
  { nome: "LAGOA DO MATO", cep: "65633-000" },
  { nome: "LAGOA GRANDE DO MARANHÃO", cep: "65304-000" },
  { nome: "LAJEADO NOVO", cep: "65911-000" },
  { nome: "LIMA CAMPOS", cep: "65735-000" },
  { nome: "LORETO", cep: "65880-000" },
  { nome: "LUÍS DOMINGUES", cep: "65388-000" },
  { nome: "MAGALHÃES DE ALMEIDA", cep: "65450-000" },
  { nome: "MARACAÇUMÉ", cep: "65375-000" },
  { nome: "MARAJÁ DO SENA", cep: "65290-000" },
  { nome: "MARANHÃOZINHO", cep: "65368-000" },
  { nome: "MATA ROMA", cep: "65470-000" },
  { nome: "MATINHA", cep: "65233-000" },
  { nome: "MATÕES", cep: "65675-000" },
  { nome: "MATÕES DO NORTE", cep: "65198-000" },
  { nome: "MILAGRES DO MARANHÃO", cep: "65478-000" },
  { nome: "MIRADOR", cep: "65860-000" },
  { nome: "MIRANDA DO NORTE", cep: "65289-000" },
  { nome: "MIRINZAL", cep: "65218-000" },
  { nome: "MONÇÃO", cep: "65295-000" },
  { nome: "MONTES ALTOS", cep: "65920-000" },
  { nome: "MORROS", cep: "65180-000" },
  { nome: "NINA RODRIGUES", cep: "65464-000" },
  { nome: "NOVA COLINAS", cep: "65877-000" },
  { nome: "NOVA IORQUE", cep: "65683-000" },
  { nome: "NOVA OLINDA DO MARANHÃO", cep: "65330-000" },
  { nome: "OLHO D'ÁGUA DAS CUNHÃS", cep: "65725-000" },
  { nome: "OLINDA NOVA DO MARANHÃO", cep: "65237-000" },
  { nome: "PAÇO DO LUMIAR", cep: "65130-000" },
  { nome: "PALMEIRÂNDIA", cep: "65235-000" },
  { nome: "PARAIBANO", cep: "65690-000" },
  { nome: "PARNARAMA", cep: "65615-000" },
  { nome: "PASSAGEM FRANCA", cep: "65670-000" },
  { nome: "PASTOS BONS", cep: "65863-000" },
  { nome: "PAULINO NEVES", cep: "65258-000" },
  { nome: "PAULO RAMOS", cep: "65740-000" },
  { nome: "PEDREIRAS", cep: "65725-000" },
  { nome: "PEDRO DO ROSÁRIO", cep: "65285-000" },
  { nome: "PENALVA", cep: "65275-000" },
  { nome: "PERI MIRIM", cep: "65240-000" },
  { nome: "PERITORÓ", cep: "65555-000" },
  { nome: "PINDARÉ-MIRIM", cep: "65320-000" },
  { nome: "PINHEIRO", cep: "65200-000" },
  { nome: "PIO XII", cep: "65745-000" },
  { nome: "PIRAPEMAS", cep: "65175-000" },
  { nome: "POÇÃO DE PEDRAS", cep: "65750-000" },
  { nome: "PORTO FRANCO", cep: "65978-000" },
  { nome: "PORTO RICO DO MARANHÃO", cep: "65183-000" },
  { nome: "PRESIDENTE DUTRA", cep: "65640-000" },
  { nome: "PRESIDENTE JUSCELINO", cep: "65187-000" },
  { nome: "PRESIDENTE MÉDICI", cep: "65355-000" },
  { nome: "PRESIDENTE SARNEY", cep: "65280-000" },
  { nome: "PRESIDENTE VARGAS", cep: "65193-000" },
  { nome: "PRIMEIRA CRUZ", cep: "65253-000" },
  { nome: "RIACHÃO", cep: "65850-000" },
  { nome: "RIBAMAR FIQUENE", cep: "65918-000" },
  { nome: "ROSÁRIO", cep: "65160-000" },
  { nome: "SAMBAÍBA", cep: "65885-000" },
  { nome: "SANTA FILOMENA DO MARANHÃO", cep: "65724-000" },
  { nome: "SANTA HELENA", cep: "65248-000" },
  { nome: "SANTA INÊS", cep: "65300-000" },
  { nome: "SANTA LUZIA", cep: "65390-000" },
  { nome: "SANTA LUZIA DO PARUÁ", cep: "65362-000" },
  { nome: "SANTA QUITÉRIA DO MARANHÃO", cep: "65490-000" },
  { nome: "SANTA RITA", cep: "65190-000" },
  { nome: "SANTANA DO MARANHÃO", cep: "65463-000" },
  { nome: "SANTO AMARO DO MARANHÃO", cep: "65260-000" },
  { nome: "SANTO ANTÔNIO DOS LOPES", cep: "65557-000" },
  { nome: "SÃO BENEDITO DO RIO PRETO", cep: "65480-000" },
  { nome: "SÃO BENTO", cep: "65430-000" },
  { nome: "SÃO BERNARDO", cep: "65455-000" },
  { nome: "SÃO DOMINGOS DO AZEITÃO", cep: "65882-000" },
  { nome: "SÃO DOMINGOS DO MARANHÃO", cep: "65645-000" },
  { nome: "SÃO FÉLIX DE BALSAS", cep: "65890-000" },
  { nome: "SÃO FÉLIX DO MARANHÃO", cep: "65754-000" },
  { nome: "SÃO FRANCISCO DO BREJÃO", cep: "65906-000" },
  { nome: "SÃO FRANCISCO DO MARANHÃO", cep: "65695-000" },
  { nome: "SÃO JOÃO BATISTA", cep: "65142-000" },
  { nome: "SÃO JOÃO DO CARÚ", cep: "65335-000" },
  { nome: "SÃO JOÃO DO PARAÍSO", cep: "65936-000" },
  { nome: "SÃO JOÃO DO SOTER", cep: "65677-000" },
  { nome: "SÃO JOÃO DOS PATOS", cep: "65665-000" },
  { nome: "SÃO JOSÉ DE RIBAMAR", cep: "65110-000" },
  { nome: "SÃO JOSÉ DOS BASÍLIOS", cep: "65547-000" },
  { nome: "SÃO LUÍS", cep: "65000-000" },
  { nome: "SÃO LUÍS GONZAGA DO MARANHÃO", cep: "65760-000" },
  { nome: "SÃO MATEUS DO MARANHÃO", cep: "65415-000" },
  { nome: "SÃO PEDRO DA ÁGUA BRANCA", cep: "65916-000" },
  { nome: "SÃO PEDRO DOS CRENTES", cep: "65897-000" },
  { nome: "SÃO RAIMUNDO DAS MANGABEIRAS", cep: "65895-000" },
  { nome: "SÃO RAIMUNDO DO DOCA BEZERRA", cep: "65755-000" },
  { nome: "SÃO ROBERTO", cep: "65732-000" },
  { nome: "SÃO VICENTE FERRER", cep: "65425-000" },
  { nome: "SATUBINHA", cep: "65761-000" },
  { nome: "SENADOR ALEXANDRE COSTA", cep: "65483-000" },
  { nome: "SENADOR LA ROCQUE", cep: "65925-000" },
  { nome: "SERRANO DO MARANHÃO", cep: "65216-000" },
  { nome: "SÍTIO NOVO", cep: "65972-000" },
  { nome: "SUCUPIRA DO NORTE", cep: "65770-000" },
  { nome: "SUCUPIRA DO RIACHÃO", cep: "65855-000" },
  { nome: "TASSO FRAGOSO", cep: "65898-000" },
  { nome: "TIMBIRAS", cep: "65573-000" },
  { nome: "TIMON", cep: "65630-000" },
  { nome: "TRIZIDELA DO VALE", cep: "65765-000" },
  { nome: "TUFILÂNDIA", cep: "65310-000" },
  { nome: "TUNTUM", cep: "65760-000" },
  { nome: "TURIAÇU", cep: "65360-000" },
  { nome: "TURILÂNDIA", cep: "65312-000" },
  { nome: "TUTÓIA", cep: "65255-000" },
  { nome: "URBANO SANTOS", cep: "65492-000" },
  { nome: "VARGEM GRANDE", cep: "65440-000" },
  { nome: "VIANA", cep: "65215-000" },
  { nome: "VILA NOVA DOS MARTÍRIOS", cep: "65913-000" },
  { nome: "VITÓRIA DO MEARIM", cep: "65270-000" },
  { nome: "VITORINO FREIRE", cep: "65316-000" },
  { nome: "ZÉ DOCA", cep: "65350-000" },
];

/* ── Autocomplete de Município ── */
function AutocompleteMunicipio({ value, onChange, onSelectSuggestion }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectSuggestion: (municipio: string, cep: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.length >= 2
    ? MUNICIPIOS_MA.filter(m => m.nome.includes(value.toUpperCase())).slice(0, 8)
    : [];

  useEffect(() => { setActiveIdx(0); }, [value]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const altura = Math.min(220, Math.max(filtered.length, 1) * 40);
      const espacoAbaixo = window.innerHeight - r.bottom;
      const acima = espacoAbaixo < altura + 12 && r.top > espacoAbaixo;
      setMenuStyle(acima
        ? { position: "fixed", left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, zIndex: 4000 }
        : { position: "fixed", left: r.left, width: r.width, top: r.bottom + 4, zIndex: 4000 });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, filtered.length, value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); onSelectSuggestion(filtered[activeIdx].nome, filtered[activeIdx].cep); setOpen(false); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="field-group" ref={containerRef} style={{ position: "relative" }}>
      <label className="edit-label">Município</label>
      <input
        ref={inputRef}
        className="edit-input"
        value={value}
        onChange={e => { onChange(e); setOpen(true); }}
        onFocus={() => { if (value.length >= 2) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder="Digite para buscar..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          ...menuStyle,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map((m, i) => (
            <div
              key={m.nome}
              onMouseDown={e => { e.preventDefault(); onSelectSuggestion(m.nome, m.cep); setOpen(false); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: "9px 14px", cursor: "pointer", fontSize: 13,
                background: i === activeIdx ? "var(--surface-2)" : "transparent",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <span style={{ color: "var(--fg)" }}>{m.nome}</span>
              <span style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "monospace", marginLeft: 12 }}>{m.cep}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Cursos oficiais do e-MEC (dados abertos MEC, IES Estácio) ── */
type CursoEmec = { ies: number; codigo: string; nome: string; grau: string; modalidade: string; situacao: string };
const SITUACAO_EMEC: Record<string, string> = { A: "Em atividade", E: "Em extinção", X: "Extinto" };
let cursosEmecCache: Promise<CursoEmec[]> | null = null;
function cursosEmec(): Promise<CursoEmec[]> {
  if (!cursosEmecCache) {
    cursosEmecCache = fetch("/cursos-emec-estacio.json")
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((linhas: [number, number, string, string, string, string][]) => linhas.map(([ies, codigo, nome, grau, mod, sit]) => ({
        ies, codigo: String(codigo), nome, grau,
        modalidade: mod === "D" ? "EAD" : "Presencial",
        situacao: SITUACAO_EMEC[sit] ?? sit,
      })));
    cursosEmecCache.catch(() => { cursosEmecCache = null; });
  }
  return cursosEmecCache;
}

function SeletorCursoEmec({ codigo, nomeCurso, iesCodigo, onChange, onEscolher }: {
  codigo: string;
  nomeCurso: string;
  iesCodigo: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEscolher: (curso: CursoEmec) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [cursos, setCursos] = useState<CursoEmec[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function abrir() {
    if (open) return;
    setBusca(nomeCurso);
    setOpen(true);
    if (!cursos) cursosEmec().then(setCursos).catch(() => setFalhou(true));
  }

  const daIes = cursos?.filter(c => String(c.ies) === iesCodigo.trim()) ?? [];
  const base = daIes.length ? daIes : cursos ?? [];
  const termos = chaveMunicipio(busca).split(" ").filter(Boolean);
  const filtrados = base
    .filter(c => termos.every(t => chaveMunicipio(c.nome).split(" ").some(p => p.startsWith(t)) || c.codigo.startsWith(t)))
    .sort((a, b) => (a.situacao === "Em atividade" ? 0 : 1) - (b.situacao === "Em atividade" ? 0 : 1) || a.nome.localeCompare(b.nome))
    .slice(0, 40);

  useEffect(() => {
    if (!open) return;
    function place() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const largura = Math.max(r.width, 420);
      const left = Math.min(r.left, window.innerWidth - largura - 8);
      const espacoAbaixo = window.innerHeight - r.bottom;
      setMenuStyle(espacoAbaixo < 300 && r.top > espacoAbaixo
        ? { position: "fixed", left, width: largura, bottom: window.innerHeight - r.top + 4, zIndex: 4000 }
        : { position: "fixed", left, width: largura, top: r.bottom + 4, zIndex: 4000 });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="field-group" ref={containerRef}>
      <label className="edit-label">Código Curso EMEC</label>
      <input
        ref={inputRef}
        className="edit-input"
        value={codigo}
        onChange={onChange}
        onFocus={abrir}
        onClick={abrir}
        placeholder="Clique para escolher o curso oficial"
        autoComplete="off"
      />
      {open && (
        <div style={{
          ...menuStyle,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          display: "flex", flexDirection: "column", maxHeight: 300,
        }}>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
            <input
              className="edit-input"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Qual é o curso? Digite o nome ou o código"
              autoComplete="off"
            />
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 6 }}>
              {daIes.length ? `Cursos da IES ${iesCodigo} no Cadastro e-MEC` : "Cursos das IES Estácio no Cadastro e-MEC"}
            </div>
          </div>
          <div style={{ overflowY: "auto" }}>
            {falhou && <div style={{ padding: "9px 14px", fontSize: 13, color: "#f87171" }}>Não foi possível carregar a lista de cursos.</div>}
            {!cursos && !falhou && <div style={{ padding: "9px 14px", fontSize: 13, color: "var(--fg-muted)" }}>Carregando cursos…</div>}
            {cursos && !filtrados.length && <div style={{ padding: "9px 14px", fontSize: 13, color: "var(--fg-muted)" }}>Nenhum curso encontrado.</div>}
            {filtrados.map(c => (
              <div
                key={`${c.ies}-${c.codigo}`}
                onMouseDown={e => { e.preventDefault(); onEscolher(c); setOpen(false); }}
                style={{
                  padding: "8px 14px", cursor: "pointer", fontSize: 13,
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                  borderBottom: "1px solid var(--border)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span>
                  <span style={{ color: "var(--fg)" }}>{c.nome}</span>
                  <span style={{ display: "block", fontSize: 11, color: c.situacao === "Em atividade" ? "var(--fg-muted)" : "#f59e0b" }}>
                    {c.grau} · {c.modalidade} · {c.situacao}{daIes.length ? "" : ` · IES ${c.ies}`}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "var(--fg-muted)", fontFamily: "monospace" }}>{c.codigo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tipos ── */
interface Cliente {
  id: number;
  pubId: string;
  nome: string; cpf: string; curso: string; status: string; data: string;
  nascimento: string; rg: string; orgaoExpedidor: string; sexo: string; nomeMae: string; nomePai: string; observacao: string;
  nacionalidade: string; dataColacao: string; reitor: string;
  instituicao: string; inep: string; endereco: string; bairro: string;
  municipio: string; cep: string; modalidade: string; anoConclusao: string;
  protocolo: string; url: string; docxUrl: string;
  naturalidade: string; cidadeExpedicao: string; dataExpedicao: string;
  registroNumero: string; registroLivro: string; registroFolha: string; registroData: string; registroProcesso: string;
  cursoReconhecimento: string;
  dadosEmec: DadosEmec | null;
  pagamentoStatus: "pendente" | "pago";
  ativo: boolean;
}

type DBRow = {
  id: number; pub_id: string; nome: string; cpf: string; curso: string; status: string; data: string;
  nascimento: string; rg: string; orgao_expedidor?: string; nome_mae: string; nome_pai: string; observacao: string;
  nacionalidade?: string; data_colacao?: string; reitor?: string;
  instituicao: string; inep: string; endereco: string; bairro: string;
  municipio: string; cep: string; modalidade: string; ano_conclusao: string; protocolo: string; url: string;
  docx_url?: string;
  naturalidade?: string; cidade_expedicao?: string; data_expedicao?: string;
  registro_numero?: string; registro_livro?: string; registro_folha?: string; registro_data?: string; registro_processo?: string;
  curso_reconhecimento?: string;
  pagamento_status?: "pendente" | "pago";
  ativo?: boolean;
  created_by?: string | null;
};

function rowToCliente(r: DBRow): Cliente {
  const dadosEmec = lerDadosEmec(r.inep);
  const sexo = sexoSalvo(r.inep);
  return {
    id: r.id, pubId: r.pub_id, nome: r.nome, cpf: r.cpf, curso: r.curso,
    status: r.status, data: r.data, nascimento: r.nascimento, rg: r.rg,
    orgaoExpedidor: r.orgao_expedidor ?? "",
    sexo,
    nomeMae: r.nome_mae, nomePai: r.nome_pai, observacao: r.observacao,
    nacionalidade: r.nacionalidade ?? "",
    dataColacao: r.data_colacao ?? "",
    reitor: r.reitor ?? "",
    instituicao: r.instituicao, inep: dadosEmec || sexo ? "" : r.inep, endereco: r.endereco, bairro: r.bairro,
    municipio: r.municipio, cep: r.cep, modalidade: r.modalidade,
    anoConclusao: r.ano_conclusao, protocolo: r.protocolo,
    url: r.pub_id.startsWith(PREFIXO_CODIGO_ESTACIO) ? `${DIPLOMA_BASE}/${r.pub_id}` : r.url,
    docxUrl: r.docx_url ?? "",
    naturalidade: r.naturalidade ?? "",
    cidadeExpedicao: r.cidade_expedicao ?? "",
    dataExpedicao: r.data_expedicao ?? "",
    registroNumero: r.registro_numero ?? "",
    registroLivro: r.registro_livro ?? "",
    registroFolha: r.registro_folha ?? "",
    registroData: r.registro_data ?? "",
    registroProcesso: r.registro_processo ?? "",
    cursoReconhecimento: r.curso_reconhecimento ?? "",
    dadosEmec,
    pagamentoStatus: r.pagamento_status === "pago" ? "pago" : "pendente",
    ativo: r.ativo !== false,
  };
}

function clienteToRow(c: Omit<Cliente, "id">): Omit<DBRow, "id"> {
  return {
    pub_id: c.pubId, nome: c.nome, cpf: c.cpf, curso: c.curso,
    status: c.status, data: c.data, nascimento: c.nascimento, rg: c.rg,
    orgao_expedidor: c.orgaoExpedidor || undefined,
    nome_mae: c.nomeMae, nome_pai: c.nomePai, observacao: c.observacao,
    nacionalidade: c.nacionalidade || undefined,
    data_colacao: c.dataColacao || undefined,
    reitor: c.reitor || undefined,
    instituicao: c.instituicao, inep: inepComDados(c), endereco: c.endereco, bairro: c.bairro,
    municipio: c.municipio, cep: c.cep, modalidade: c.modalidade,
    ano_conclusao: c.anoConclusao, protocolo: c.protocolo, url: c.url,
    docx_url: c.docxUrl || undefined,
    naturalidade: c.naturalidade || undefined,
    cidade_expedicao: c.cidadeExpedicao || undefined,
    data_expedicao: c.dataExpedicao || undefined,
    registro_numero: c.registroNumero || undefined,
    registro_livro: c.registroLivro || undefined,
    registro_folha: c.registroFolha || undefined,
    registro_data: c.registroData || undefined,
    registro_processo: c.registroProcesso || undefined,
    curso_reconhecimento: c.cursoReconhecimento || undefined,
  };
}

const statusChip: Record<string, string> = {
  Publicado: "chip--green", Pendente: "chip--yellow", Rascunho: "chip--gray",
};

type Tab = "clientes" | "novo" | "historico" | "publicados" | "visualizar" | "acesso";
const TABS_BASE: { id: Tab; label: string }[] = [
  { id: "clientes",   label: "CLIENTES" },
  { id: "novo",       label: "NOVO" },
  { id: "historico",  label: "HISTÓRICO" },
  { id: "publicados", label: "PUBLICADOS" },
  { id: "visualizar", label: "VISUALIZAR" },
];

const SIA_ACESSOS_KEY = "sia-acessos-estacio"; // legado: usado só na migração única para o banco
// A senha nunca é guardada em texto — apenas o hash (senhaHash). O login do aluno valida pelo hash.
type AcessoSIA = {
  id: string; matricula: string; senhaHash: string; nome: string;
  pubId: string; url: string; criadoEm: string;
};
type AcessoRow = {
  id: string; matricula: string; senha_hash: string; nome: string;
  pub_id: string; url: string; criado_em: string;
};

function rowToAcesso(r: AcessoRow): AcessoSIA {
  const pubId = r.pub_id || "";
  return {
    id: r.id,
    matricula: r.matricula || "",
    senhaHash: r.senha_hash || "",
    nome: r.nome || "",
    pubId,
    url: pubId ? `${DIPLOMA_BASE}/${pubId}` : (r.url || DIPLOMA_BASE),
    criadoEm: r.criado_em || "",
  };
}

async function hashSenha(senha: string): Promise<string> {
  const data = new TextEncoder().encode(senha);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Lista os acessos direto do banco (fonte da verdade, independente do navegador).
async function carregarAcessos(): Promise<AcessoSIA[]> {
  const { data, error } = await supabase
    .from("acessos_estacio")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) { console.error("[acessos]", error.message); return []; }
  return ((data as AcessoRow[] | null) ?? []).map(rowToAcesso).filter(a => a.matricula);
}

// Reconstrói o estacio/acessos.json (lido pelo login do aluno) a partir do banco.
async function publicarAcessosOnline(lista: AcessoSIA[]) {
  try {
    const corpo = lista.map(a => ({
      matricula: a.matricula,
      senhaHash: a.senhaHash,
      nome: a.nome,
      pubId: a.pubId,
      url: a.url,
    }));
    const blob = new Blob([JSON.stringify(corpo)], { type: "application/json" });
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload("estacio/acessos.json", blob, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
    if (error) console.error("[acessos]", error.message);
  } catch (e) {
    console.error("[acessos]", e);
  }
}

// Migração única: move acessos antigos do localStorage (com senha em texto) para o banco (hash).
async function migrarAcessosLocais(): Promise<void> {
  let legado: Array<{ matricula?: string; usuario?: string; senha?: string; nome?: string; pubId?: string; url?: string }> = [];
  try { legado = JSON.parse(localStorage.getItem(SIA_ACESSOS_KEY) || "[]"); } catch { legado = []; }
  if (!Array.isArray(legado) || !legado.length) return;
  for (const a of legado) {
    const matricula = (a.matricula || a.usuario || "").trim();
    const senha = (a.senha || "").trim();
    if (!matricula || !senha) continue;
    const { data: existe } = await supabase.from("acessos_estacio").select("id").eq("matricula", matricula).limit(1);
    if (((existe as { id: string }[] | null) ?? []).length) continue;
    const pubId = a.pubId || "";
    await supabase.from("acessos_estacio").insert({
      matricula,
      senha_hash: await hashSenha(senha),
      nome: a.nome || "",
      pub_id: pubId,
      url: pubId ? `${DIPLOMA_BASE}/${pubId}` : (a.url || DIPLOMA_BASE),
    });
  }
  localStorage.removeItem(SIA_ACESSOS_KEY);
}

function csvCampo(v: string) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function baixarCsv(nomeArquivo: string, linhas: string[]) {
  const blob = new Blob(["\uFEFF" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// Exporta a lista SEM a senha (que não é mais guardada em texto, só o hash).
function baixarAcessos(lista: AcessoSIA[]) {
  baixarCsv("sia-acessos.csv", [
    ["Nome", "Matrícula", "Código", "Diploma", "Criado em"].join(";"),
    ...lista.map(a => [a.nome, a.matricula, a.pubId, a.url, a.criadoEm].map(csvCampo).join(";")),
  ]);
}

// Baixa a credencial recém-criada (único momento em que a senha existe em texto).
function baixarCredencial(cred: { matricula: string; senha: string }, nome: string) {
  baixarCsv(`sia-acesso-${cred.matricula}.csv`, [
    ["Nome", "Matrícula", "Senha"].join(";"),
    [nome, cred.matricula, cred.senha].map(csvCampo).join(";"),
  ]);
}

function matriculaDoDiploma(dados: { registroNumero?: string; protocolo?: string; pubId?: string }): string {
  const registro = (dados.registroNumero || "").trim();
  if (registro) return registro;
  const protocolo = (dados.protocolo || "").trim();
  if (protocolo) return protocolo;
  return (dados.pubId || "").trim();
}

function gerarSenhaAcesso(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let senha = "";
  for (let i = 0; i < 8; i++) senha += chars[Math.floor(Math.random() * chars.length)];
  return senha;
}

// Cria/atualiza o acesso de um diploma no banco. Senha em branco mantém a senha atual (não troca o hash).
async function salvarAcessoDiploma(dados: { matricula: string; senha: string; nome: string; pubId: string; url?: string }): Promise<AcessoSIA[]> {
  const matricula = dados.matricula.trim();
  const url = dados.url || `${DIPLOMA_BASE}/${dados.pubId}`;

  // Acesso já existente deste diploma (para preservar o hash quando a senha vier em branco).
  const { data: doPub } = await supabase.from("acessos_estacio").select("*").eq("pub_id", dados.pubId);
  const atual = ((doPub as AcessoRow[] | null) ?? [])[0];
  const senhaHash = dados.senha.trim() ? await hashSenha(dados.senha.trim()) : (atual?.senha_hash ?? "");
  if (!senhaHash) throw new Error("sem-senha");

  // Remove linhas conflitantes (mesmo diploma ou mesma matrícula) antes de inserir a atual.
  const idsRemover = new Set<string>(((doPub as AcessoRow[] | null) ?? []).map(r => r.id));
  const { data: mesmaMat } = await supabase.from("acessos_estacio").select("id").eq("matricula", matricula);
  ((mesmaMat as { id: string }[] | null) ?? []).forEach(r => idsRemover.add(r.id));
  if (idsRemover.size) await supabase.from("acessos_estacio").delete().in("id", [...idsRemover]);

  await supabase.from("acessos_estacio").insert({
    matricula,
    senha_hash: senhaHash,
    nome: dados.nome,
    pub_id: dados.pubId,
    url,
    criado_em: atual?.criado_em ?? new Date().toISOString(),
  });

  const lista = await carregarAcessos();
  await publicarAcessosOnline(lista);
  return lista;
}

async function apagarAcesso(id: string): Promise<AcessoSIA[]> {
  await supabase.from("acessos_estacio").delete().eq("id", id);
  const lista = await carregarAcessos();
  await publicarAcessosOnline(lista);
  return lista;
}

function TabAcesso({ clientes }: { clientes: Cliente[] }) {
  const [acessos, setAcessos] = useState<AcessoSIA[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [pubId, setPubId] = useState("");
  const [matricula, setMatricula] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      await migrarAcessosLocais();
      const lista = await carregarAcessos();
      if (vivo) { setAcessos(lista); setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, []);

  const acessoEscolhido = acessos.find(a => a.pubId === pubId);

  function escolherDiploma(id: string) {
    setPubId(id);
    setErro("");
    setAviso("");
    const cliente = clientes.find(c => c.pubId === id);
    const acesso = acessos.find(a => a.pubId === id);
    setMatricula(cliente ? matriculaDoDiploma(cliente) : (acesso?.matricula ?? ""));
    setSenha("");
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    const cliente = clientes.find(c => c.pubId === pubId);
    const m = cliente ? matriculaDoDiploma(cliente) : matricula.trim();
    if (!cliente) { setErro("Escolha o diploma criado na guia NOVO."); return; }
    if (!m) { setErro("Este diploma ainda não tem número de registro nem protocolo."); return; }
    if (!senha.trim() && !acessoEscolhido) { setErro("Informe a senha de acesso."); return; }
    if (acessos.some(a => a.matricula.toLowerCase() === m.toLowerCase() && a.pubId !== cliente.pubId)) {
      setErro("Esta matrícula já aponta para outro diploma.");
      return;
    }
    const url = cliente.url || `${DIPLOMA_BASE}/${cliente.pubId}`;
    const senhaDigitada = senha.trim();
    setSalvando(true);
    try {
      setAcessos(await salvarAcessoDiploma({ matricula: m, senha: senhaDigitada, nome: cliente.nome, pubId: cliente.pubId, url }));
      setErro("");
      setSenha("");
      if (senhaDigitada) {
        baixarCredencial({ matricula: m, senha: senhaDigitada }, cliente.nome);
        setAviso("Acesso salvo no banco. A senha foi baixada agora — ela não fica visível depois.");
      } else {
        setAviso("Acesso atualizado (senha mantida).");
      }
    } catch {
      setErro("Não foi possível salvar o acesso no banco.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    if (acessos.find(a => a.id === id)?.pubId === pubId) {
      setMatricula("");
      setSenha("");
    }
    setAcessos(await apagarAcesso(id));
  }

  function baixarArquivo() {
    baixarAcessos(acessos);
  }

  const filtrados = acessos.filter(a =>
    a.matricula.toLowerCase().includes(busca.toLowerCase()) ||
    a.nome.toLowerCase().includes(busca.toLowerCase())
  );
  const diplomaEscolhido = clientes.find(c => c.pubId === pubId);

  return (
    <div className="tab-body">
      <form onSubmit={criar} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--fg-muted)", minWidth: 260 }}>
          Diploma da guia NOVO
          <select className="edit-input" value={pubId} onChange={e => escolherDiploma(e.target.value)}>
            <option value="">— Selecione o aluno —</option>
            {clientes.map(c => <option key={c.pubId} value={c.pubId}>{c.nome} — {c.cpf}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--fg-muted)" }}>
          Matrícula do diploma
          <input className="edit-input" value={matricula} readOnly placeholder="Nº de registro do diploma" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--fg-muted)" }}>
          Senha
          <input className="edit-input" type="text" value={senha} onChange={e => setSenha(e.target.value)}
            placeholder={acessoEscolhido ? "Em branco = manter atual" : "Senha de acesso"} autoComplete="new-password" />
        </label>
        <button className="btn-primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar acesso"}</button>
        <button className="btn-sm" type="button" onClick={baixarArquivo}>Baixar lista (.csv)</button>
      </form>
      {erro && <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 12px" }}>{erro}</p>}
      {aviso && <p style={{ color: "#4ade80", fontSize: 13, margin: "0 0 12px" }}>{aviso}</p>}
      <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 12px" }}>
        {diplomaEscolhido
          ? <>Esta matrícula abre {diplomaEscolhido.url || `${DIPLOMA_BASE}/${diplomaEscolhido.pubId}`}</>
          : <>Escolha um diploma publicado em NOVO. O login do SIA abre {DIPLOMA_BASE} desse aluno.</>}
      </p>
      <div className="tab-toolbar">
        <input className="search-input" placeholder="Buscar por matrícula ou nome…" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>
      <div className="pub-table-wrap">
        <table className="data-table pub-table">
          <thead>
            <tr>
              <th>Aluno</th><th>Matrícula</th><th>Senha</th><th>Diploma</th><th></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr className="pub-empty"><td colSpan={5}><div className="empty-state"><p>Carregando acessos…</p></div></td></tr>
            ) : filtrados.length === 0 ? (
              <tr className="pub-empty"><td colSpan={5}><div className="empty-state"><p>Nenhum acesso ligado a um diploma</p></div></td></tr>
            ) : filtrados.map(a => (
              <tr key={a.id}>
                <td className="pc-title">{a.nome || "—"}</td>
                <td className="pc-line" data-label="Matrícula">{a.matricula}</td>
                <td className="pc-line" data-label="Senha" title="Guardada apenas como hash">••••••</td>
                <td className="pc-line" data-label="Diploma">
                  <a href={a.url} target="_blank" rel="noreferrer">{a.url.replace(DIPLOMA_BASE + "/", "")}</a>
                </td>
                <td className="pc-actions">
                  <button className="btn-sm" type="button" onClick={() => apagar(a.id)}
                    style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}>Apagar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Estilo padrão de TODOS os QR codes: alta qualidade de leitura.
   A borda branca (quiet zone) é EXIGIDA pela norma do QR — sem ela o leitor não acha o código.
   level "Q" = 25% de correção de erro (lê mesmo com reflexo/desgaste). ── */
const QR_STYLE = {
  fgColor: "#000000",
  bgColor: "#ffffff",
  level: "Q",
  marginSize: 4,
} as const;

/* ── QR Display: sempre SVG fresco (sem cache localStorage) ── */
function QRDisplay({ cliente, size = 245 }: { cliente: Cliente; size?: number }) {
  if (!cliente.url) return (
    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--fg-muted)" }}>
      <p style={{ fontSize: 13 }}>QR Code não gerado ainda.<br />Gere a publicação primeiro na aba NOVO.</p>
    </div>
  );
  return <QRCodeSVG value={cliente.url} size={size} {...QR_STYLE} />;
}

/* ── Modal QR ── */
function ModalQR({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  async function compartilhar() {
    const dados = { title: "Publicação e-MEC", text: `Publicação de ${cliente.nome}`, url: cliente.url };
    try {
      if (navigator.share) await navigator.share(dados);
      else {
        await navigator.clipboard.writeText(cliente.url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }
    } catch { /* cancelado pelo usuário */ }
  }
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  function baixar() {
    const svg = svgRef.current;
    if (!svg) return;
    const cells = svg.viewBox.baseVal.width;
    const px = Math.round(1200 / cells);
    const total = cells * px;
    svg.setAttribute("width", String(total));
    svg.setAttribute("height", String(total));
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = total;
      c.height = total;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, total, total);
      ctx.drawImage(img, 0, 0, total, total);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `qrcode-${cliente.nome.split(" ")[0].toLowerCase()}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box modal-box--sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">QR Code</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3 }}>{cliente.nome}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body" style={{ alignItems: "center" }}>
          {cliente.url ? (
            <>
              {/* SVG oculto para download: versão 8 (49 módulos), sem borda */}
              <div style={{ position: "absolute", left: -9999, top: -9999, pointerEvents: "none" }}>
                <QRCodeSVG ref={svgRef} value={cliente.url} size={490} {...QR_STYLE} />
              </div>
              <div style={{ background: "#fff", padding: 16, borderRadius: 4, display: "inline-block", border: "1px solid #e5e5e5" }}>
                <QRDisplay cliente={cliente} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>
                  Escaneie para acessar o arquivo do aluno
                </div>
                <a href={cliente.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "var(--accent)", wordBreak: "break-all" }}>
                  {cliente.url}
                </a>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--fg-muted)" }}>
              <p style={{ fontSize: 13 }}>QR Code não gerado ainda.<br />Gere a publicação primeiro na aba NOVO.</p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {cliente.url && <button className="btn-sm" onClick={compartilhar}>{copiado ? "Link copiado ✓" : "Compartilhar"}</button>}
          {cliente.url && <button className="btn-sm" onClick={baixar}>Baixar PNG</button>}
          <button className="btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal EDITAR ── */
type CamposRegistro = Pick<Cliente,
  "cidadeExpedicao" | "dataExpedicao" | "registroNumero" | "registroLivro" | "registroFolha" | "registroData" | "registroProcesso">;
type SetCampo = (k: keyof CamposRegistro, transform?: (v: string) => string) =>
  (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

function SecaoRegistroEstacio({ form, sf, definirNumero, excetoPubId }: {
  form: CamposRegistro;
  sf: SetCampo;
  definirNumero: (valor: string) => void;
  excetoPubId?: string;
}) {
  const [gerandoNumero, setGerandoNumero] = useState(false);
  const [avisoNumero, setAvisoNumero] = useState("");

  async function gerarNumero() {
    setGerandoNumero(true);
    setAvisoNumero("");
    try {
      const numero = proximoRegistroLivre(await chavesRegistroPublicadas(excetoPubId));
      definirNumero(numero);
    } catch {
      setAvisoNumero("Não foi possível consultar os números já publicados.");
    } finally {
      setGerandoNumero(false);
    }
  }

  return (
    <div className="edit-section">
      <div className="edit-section-title">Expedição e Registro</div>
      <div className="edit-grid">
        <Field label="Cidade/UF da Expedição" value={form.cidadeExpedicao} onChange={sf("cidadeExpedicao", maskCidadeUf)} placeholder="Ribeirão Preto - SP" />
        <Field label="Data de Expedição" value={form.dataExpedicao} onChange={sf("dataExpedicao", maskData)} placeholder="DD/MM/AAAA" />
        <div className="field-group">
          <label className="edit-label">Nº do Registro</label>
          <div className="registro-numero">
            <input className="edit-input" value={form.registroNumero} onChange={sf("registroNumero")} inputMode="numeric" />
            <button type="button" className="btn-sm" onClick={gerarNumero} disabled={gerandoNumero}>
              {gerandoNumero ? "Gerando…" : "Gerar número"}
            </button>
          </div>
          {avisoNumero && <span className="registro-aviso">{avisoNumero}</span>}
        </div>
        <Field label="Livro" value={form.registroLivro} onChange={sf("registroLivro")} placeholder="1" />
        <Field label="Folhas" value={form.registroFolha} onChange={sf("registroFolha")} placeholder="13193" />
        <Field label="Data do Registro" value={form.registroData} onChange={sf("registroData", maskData)} placeholder="DD/MM/AAAA" />      </div>
    </div>
  );
}

function ModalEditar({ cliente, estacio, onSave, onClose }: { cliente: Cliente; estacio: boolean; onSave: (c: Cliente) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    naturalidade: cliente.naturalidade,
    cidadeExpedicao: maskCidadeUf(cliente.cidadeExpedicao),
    dataExpedicao: cliente.dataExpedicao,
    registroNumero: cliente.registroNumero,
    registroLivro: cliente.registroLivro,
    registroFolha: cliente.registroFolha,
    registroData: cliente.registroData,
    registroProcesso: cliente.registroProcesso,
    cursoReconhecimento: cliente.cursoReconhecimento,
    nome: cliente.nome,
    nascimento: cliente.nascimento,
    cpf: cliente.cpf,
    rg: cliente.rg,
    orgaoExpedidor: maskOrgao(cliente.orgaoExpedidor),
    sexo: cliente.sexo,
    nomeMae: cliente.nomeMae,
    nomePai: cliente.nomePai,
    observacao: cliente.observacao,
    nacionalidade: cliente.nacionalidade,
    dataColacao: cliente.dataColacao,
    reitor: cliente.reitor,
    instituicao: cliente.instituicao,
    inep: cliente.inep,
    endereco: cliente.endereco,
    bairro: cliente.bairro,
    municipio: cliente.municipio,
    cep: cliente.cep,
    modalidade: cliente.modalidade,
    curso: cliente.curso,
    anoConclusao: cliente.anoConclusao,
    protocolo: cliente.protocolo,
    data: cliente.data,
  });

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  function sf(k: keyof typeof form, transform?: (v: string) => string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let v = e.target.value;
      if (transform) v = transform(v);
      setForm(prev => ({ ...prev, [k]: v }));
    };
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (estacio && orgaoIncompleto(form.orgaoExpedidor)) {
      window.alert("Órgão Expedidor precisa da barra, no formato SSP/SP.");
      return;
    }
    if (estacio && instituicaoSemLugar(form.instituicao)) {
      window.alert("Complete o lugar depois de CENTRO UNIVERSITÁRIO ESTÁCIO DE.");
      return;
    }
    if (estacio && cidadeUfIncompleta(form.cidadeExpedicao)) {
      window.alert("Cidade/UF da Expedição precisa do traço e da UF, no formato Ribeirão Preto - SP.");
      return;
    }
    if (estacio) {
      const repetido = await registroRepetido(form.registroNumero, cliente.pubId);
      if (repetido) { window.alert(repetido); return; }
    }
    const atualizado: Cliente = {
      ...cliente,
      nome: form.nome,
      nascimento: form.nascimento,
      cpf: form.cpf,
      rg: form.rg,
      orgaoExpedidor: form.orgaoExpedidor,
      sexo: form.sexo,
      nomeMae: form.nomeMae,
      nomePai: form.nomePai,
      observacao: form.observacao,
      nacionalidade: form.nacionalidade,
      dataColacao: form.dataColacao,
      reitor: form.reitor,
      instituicao: form.instituicao,
      inep: form.inep,
      endereco: form.endereco,
      bairro: form.bairro,
      municipio: form.municipio,
      cep: form.cep,
      modalidade: form.modalidade,
      curso: form.curso,
      anoConclusao: form.anoConclusao,
      protocolo: form.protocolo,
      data: form.data,
      naturalidade: form.naturalidade,
      cidadeExpedicao: form.cidadeExpedicao,
      dataExpedicao: form.dataExpedicao,
      registroNumero: form.registroNumero,
      registroLivro: form.registroLivro,
      registroFolha: form.registroFolha,
      registroData: form.registroData,
      registroProcesso: form.registroProcesso,
      cursoReconhecimento: form.cursoReconhecimento,
    };
    onSave(atualizado);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Editar Publicação</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3 }}>{cliente.nome}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
          <div className="modal-body" style={{ gap: 0, padding: "16px 24px", overflowY: "auto", flex: 1 }}>
            <div className="edit-sections" style={{ margin: 0 }}>
              <div className="edit-section">
                <div className="edit-section-title">Dados do Aluno</div>
                <div className="edit-grid">
                  <Field label="Nome do Aluno *" value={form.nome} onChange={sf("nome", up)} full />
                  <Field label="Data de Nascimento" value={form.nascimento} onChange={sf("nascimento", maskData)} placeholder="DD/MM/AAAA" />
                  <Field label="CPF *" value={form.cpf} onChange={sf("cpf", maskCPF)} placeholder="000.000.000-00" />
                  <Field label="RG/RNE/RA" value={form.rg} onChange={sf("rg", maskRG)} placeholder="000000000000-0" />
                  <Field label="Órgão Expedidor" value={form.orgaoExpedidor} onChange={sf("orgaoExpedidor", maskOrgao)} placeholder="SSP/SP" />
                  <Field label="Nacionalidade" value={form.nacionalidade} onChange={sf("nacionalidade", up)} placeholder="BRASILEIRO(A)" />
                  {estacio && <Field label="Naturalidade" value={form.naturalidade} onChange={sf("naturalidade", up)} placeholder="SÃO PAULO" />}
                  {estacio ? (
                    <div className="field-group">
                      <label className="edit-label">Sexo</label>
                      <select className="edit-input" value={form.sexo} onChange={sf("sexo")}>
                        <option value="">Selecione</option>
                        <option value="M">Masculino</option>
                        <option value="F">Feminino</option>
                      </select>
                    </div>
                  ) : <Field label="Nome da Mãe" value={form.nomeMae} onChange={sf("nomeMae", up)} />}
                  {!estacio && <Field label="Nome do Pai" value={form.nomePai} onChange={sf("nomePai", up)} />}
                  {!estacio && <Field label="Observações" value={form.observacao} onChange={sf("observacao", up)} full />}
                </div>
              </div>
              <div className="edit-section">
                <div className="edit-section-title">Dados da Instituição</div>
                <div className="edit-grid">
                  <Field label="Nome da Instituição" value={form.instituicao} onChange={sf("instituicao", estacio ? instituicaoEstacio : up)} full />
                  <Field label="Reitor(a)" value={form.reitor} onChange={sf("reitor", up)} full />
                  <Field label="Endereço" value={form.endereco} onChange={sf("endereco", up)} />
                  <Field label="Bairro" value={form.bairro} onChange={sf("bairro", up)} />
                  <AutocompleteMunicipio
                    value={form.municipio}
                    onChange={sf("municipio", up)}
                    onSelectSuggestion={(municipio, cep) => setForm(prev => ({ ...prev, municipio, cep }))}
                  />
                  <Field label="CEP" value={form.cep} onChange={sf("cep", maskCEP)} placeholder="00000-000" />
                  <div className="field-group">
                    <label className="edit-label">Modalidade / Título</label>
                    <select className="edit-input" value={form.modalidade} onChange={sf("modalidade")}>
                      <option>BACHAREL</option>
                      <option>LICENCIADO(A)</option>
                      <option>TECNÓLOGO(A)</option>
                      <option>ESPECIALISTA</option>
                      <option>MESTRE</option>
                      <option>DOUTOR(A)</option>
                      <option>PRESENCIAL</option>
                      <option>SEMIPRESENCIAL</option>
                      <option>EAD</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="edit-section">
                <div className="edit-section-title">Resumo da Publicação</div>
                <div className="edit-grid">
                  <Field label="Curso" value={form.curso} onChange={sf("curso", up)} full />
                  {!estacio && <Field label="Ano de Conclusão" value={form.anoConclusao} onChange={sf("anoConclusao")} />}
                  <Field label="Data de Conclusão do Curso" value={form.data} onChange={sf("data", maskData)} placeholder="DD/MM/AAAA" />
                  <Field label="Data da Colação de Grau" value={form.dataColacao} onChange={sf("dataColacao", maskData)} placeholder="DD/MM/AAAA" />
                  <Field label={estacio ? "Protocolo (número do verso)" : "Protocolo"} value={form.protocolo} onChange={sf("protocolo")} full />
                </div>
              </div>
              {estacio && (
                <SecaoRegistroEstacio
                  form={form}
                  sf={sf}
                  excetoPubId={cliente.pubId}
                  definirNumero={valor => setForm(prev => ({ ...prev, registroNumero: valor }))}
                />
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-sm" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" style={{ fontSize: 13, padding: "7px 18px" }}>Salvar alterações</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Tab CLIENTES ── */
function TabClientes({ clientes, isAdmin, estacio, onNovo, onEditar, onApagar, onToggleAtivo, onToggleAtivoLote }: {
  clientes: Cliente[];
  isAdmin: boolean;
  estacio: boolean;
  onNovo: () => void;
  onEditar: (c: Cliente) => void;
  onApagar: (c: Cliente) => void | Promise<void>;
  onToggleAtivo: (c: Cliente) => void | Promise<void>;
  onToggleAtivoLote: (pubIds: string[], ativo: boolean) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [qrCliente, setQrCliente] = useState<Cliente | null>(null);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [delCliente, setDelCliente] = useState<Cliente | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = clientes.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) || c.cpf.includes(search)
  );

  function toggleSelect(pubId: string) {
    setSelected(prev => { const n = new Set(prev); n.has(pubId) ? n.delete(pubId) : n.add(pubId); return n; });
  }

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.pubId));

  function toggleSelectAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.pubId)));
  }

  async function confirmarApagar() {
    if (!delCliente) return;
    setDeleting(true);
    await onApagar(delCliente);
    setDeleting(false);
    setDelCliente(null);
  }

  return (
    <div className="tab-body">
      {qrCliente && <ModalQR cliente={qrCliente} onClose={() => setQrCliente(null)} />}
      {editCliente && (
        <ModalEditar
          cliente={editCliente}
          estacio={estacio}
          onSave={onEditar}
          onClose={() => setEditCliente(null)}
        />
      )}
      {delCliente && (
        <div className="modal-backdrop" onClick={() => !deleting && setDelCliente(null)}>
          <div className="modal-box modal-box--sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: "#f87171" }}>Apagar publicação</div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6, margin: 0 }}>
                Esta ação é <strong>irreversível</strong>. A publicação de{" "}
                <strong style={{ color: "var(--fg)" }}>{delCliente.nome}</strong> será removida
                permanentemente, e o QR Code dela deixará de funcionar.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-sm" disabled={deleting} onClick={() => setDelCliente(null)}>Cancelar</button>
              <button className="btn-sm" disabled={deleting} onClick={confirmarApagar}
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}>
                {deleting ? "Apagando…" : "Apagar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="tab-toolbar">
        <input className="search-input" placeholder="Buscar por nome ou CPF…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-primary pub-add-desktop" onClick={onNovo}>+ Adicionar cliente</button>
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="pub-bulk-bar">
          <span className="pub-bulk-count">{selected.size} selecionado{selected.size !== 1 ? "s" : ""}</span>
          <button className="btn-sm" onClick={() => { onToggleAtivoLote([...selected], false); setSelected(new Set()); }}
            style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}>Desativar</button>
          <button className="btn-sm" onClick={() => { onToggleAtivoLote([...selected], true); setSelected(new Set()); }}
            style={{ color: "#34d399", borderColor: "rgba(52,211,153,0.4)" }}>Ativar</button>
          <button className="btn-sm" onClick={() => setSelected(new Set())}>Limpar</button>
        </div>
      )}

      <div className="pub-table-wrap">
        <table className="data-table pub-table">
          <thead>
            <tr>
              {isAdmin && <th style={{ width: 36, padding: "0 8px" }}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: "pointer", accentColor: "var(--accent)" }} /></th>}
              <th>Nome</th><th>CPF</th><th>Curso</th><th>Status</th><th>Publicado em</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="pub-empty"><td colSpan={6}><div className="empty-state"><p>Nenhum cliente encontrado</p></div></td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className={`pub-row${selected.has(c.pubId) ? " pub-row--sel" : ""}`}>
                {isAdmin && <td style={{ width: 36, padding: "0 8px" }}><input type="checkbox" checked={selected.has(c.pubId)} onChange={() => toggleSelect(c.pubId)} style={{ cursor: "pointer", accentColor: "var(--accent)" }} /></td>}
                <td className="pc-title">{c.nome}</td>
                <td className="pc-line pc-cpf" data-label="CPF">{c.cpf}</td>
                <td className="pc-line pc-curso" data-label="Curso">{c.curso}</td>
                <td className="pc-badge"><span className={`chip ${statusChip[c.status]}`}>{c.status}</span></td>
                <td className="pc-line pc-data" data-label="Publicado em">{c.data}</td>
                <td className="pc-line pc-pag" data-label="Pagamento">
                  <span className={`chip ${c.pagamentoStatus === "pendente" ? "chip--red" : "chip--green"}`}>
                    {c.pagamentoStatus === "pendente" ? "Pendente" : "Em dia"}
                  </span>
                </td>
                <td className="pc-actions">
                  <div className="pub-actions">
                    <button
                      className="btn-sm pub-act"
                      disabled={c.status !== "Publicado"}
                      title={c.status === "Publicado" ? "Ver arquivo" : "Ainda não publicado"}
                      onClick={() => c.url ? window.open(c.url, "_blank") : undefined}
                      style={{ opacity: c.status === "Publicado" ? 1 : 0.4, cursor: c.status === "Publicado" ? "pointer" : "default" }}
                    >Ver</button>
                    <button className="btn-sm pub-act" onClick={() => setEditCliente(c)}>Editar</button>
                    <button
                      className="btn-sm btn-icon"
                      title={c.pagamentoStatus === "pendente" ? "QR Code — pagamento pendente" : "QR Code — pagamento em dia"}
                      aria-label="QR Code"
                      onClick={() => setQrCliente(c)}
                      style={{
                        color: c.pagamentoStatus === "pendente" ? "#f87171" : "#34d399",
                        borderColor: c.pagamentoStatus === "pendente" ? "rgba(248,113,113,0.5)" : "rgba(52,211,153,0.5)",
                        background: c.pagamentoStatus === "pendente" ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/>
                        <path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
                      </svg>
                    </button>
                    {isAdmin && (
                      <button
                        className="btn-sm btn-icon"
                        title={c.ativo ? "QR ativo — clique para desativar" : "QR desativado — clique para ativar"}
                        aria-label={c.ativo ? "Desativar QR" : "Ativar QR"}
                        onClick={() => onToggleAtivo(c)}
                        style={{
                          color: c.ativo ? "#34d399" : "#6b7280",
                          borderColor: c.ativo ? "rgba(52,211,153,0.4)" : "rgba(107,114,128,0.4)",
                          background: c.ativo ? "rgba(52,211,153,0.08)" : "rgba(107,114,128,0.08)",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18.36 6.64A9 9 0 1 1 5.64 5.64"/><line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                      </button>
                    )}
                    <button
                      className="btn-sm btn-icon"
                      title="Apagar publicação"
                      aria-label="Apagar publicação"
                      onClick={() => setDelCliente(c)}
                      style={{ color: "#f87171" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Captura PNG do QR canvas e salva no localStorage ── */
function QRCapture({ pubId, url }: { pubId: string; url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Espera o canvas renderizar antes de capturar
    const timer = setTimeout(() => {
      try {
        const png = ref.current!.toDataURL("image/png");
        localStorage.setItem(`qr_${pubId}`, png);
      } catch {}
    }, 100);
    return () => clearTimeout(timer);
  }, [pubId, url]);

  return (
    <div style={{ position: "absolute", left: -9999, top: -9999, pointerEvents: "none" }}>
      <QRCodeCanvas ref={ref} value={url} size={392} {...QR_STYLE} />
    </div>
  );
}

/* ── Tab NOVO ── */
const formVazio = {
  nome: "", nascimento: "", cpf: "", rg: "", orgaoExpedidor: "", sexo: "",
  nomeMae: "", nomePai: "", observacao: "",
  nacionalidade: "BRASILEIRO(A)", dataColacao: "", reitor: "",
  instituicao: "", inep: "", endereco: "", bairro: "", municipio: "", cep: "",
  modalidade: "BACHAREL", curso: "", anoConclusao: "2026", dataPublicacao: "",
  protocolo: "",
  naturalidade: "", cidadeExpedicao: "", dataExpedicao: "",
  registroNumero: "", registroLivro: "", registroFolha: "", registroData: "", registroProcesso: "",
  cursoReconhecimento: "",
};

// Valores fixos do template Estácio (assinatura do reitor e textos do verso são desta IES).
const formVazioEstacio: typeof formVazio = {
  ...formVazio,
  instituicao: PREFIXO_INSTITUICAO,
  reitor: "JONAS DOS SANTOS COLVARA",
  cidadeExpedicao: "Ribeirão Preto - SP",
  modalidade: "TECNÓLOGO(A)",
  registroNumero: String(REGISTRO_INICIAL),
  registroLivro: "1",
  registroFolha: "13193",
};

const CAMPOS_DIPLOMA: [keyof typeof formVazio, string][] = [
  ["instituicao", "Nome da Instituição"], ["reitor", "Reitor(a)"], ["curso", "Curso"],
  ["dataPublicacao", "Data de Conclusão"],
  ["dataColacao", "Data da Colação"], ["naturalidade", "Naturalidade"], ["nascimento", "Data de Nascimento"],
  ["rg", "RG"], ["orgaoExpedidor", "Órgão Expedidor"], ["cidadeExpedicao", "Cidade/UF da Expedição"],
  ["dataExpedicao", "Data de Expedição"], ["registroNumero", "Nº do Registro"], ["registroLivro", "Livro"],
  ["registroFolha", "Folhas"], ["registroData", "Data do Registro"],
];

/* ── Progresso do rascunho ("Concluir mais tarde") ── */
type CampoForm = keyof typeof formVazio;
const CAMPOS_PROGRESSO_PUBLICACAO: [CampoForm, string][] = [
  ["nome", "Nome do aluno"], ["cpf", "CPF"], ["nascimento", "Data de nascimento"], ["rg", "RG"],
  ["nomeMae", "Nome da mãe"], ["instituicao", "Instituição"], ["endereco", "Endereço"], ["bairro", "Bairro"],
  ["municipio", "Município"], ["cep", "CEP"], ["curso", "Curso"], ["dataPublicacao", "Data de conclusão"],
];
const CAMPOS_PROGRESSO_ESTACIO: [CampoForm, string][] = [
  ["nome", "Nome do aluno"], ["cpf", "CPF"], ["nascimento", "Data de nascimento"], ["rg", "RG"],
  ["orgaoExpedidor", "Órgão expedidor"], ["naturalidade", "Naturalidade"], ["sexo", "Sexo"],
  ["instituicao", "Instituição"], ["endereco", "Endereço"], ["bairro", "Bairro"], ["municipio", "Município"],
  ["cep", "CEP"], ["curso", "Curso"], ["dataPublicacao", "Data de conclusão"], ["dataColacao", "Data da colação"],
  ["dataExpedicao", "Data de expedição"], ["registroData", "Data do registro"],
];
const TAMANHO_DATA: CampoForm[] = ["nascimento", "dataPublicacao", "dataColacao", "dataExpedicao", "registroData"];

function campoPreenchido(k: CampoForm, form: typeof formVazio): boolean {
  const v = String(form[k] ?? "").trim();
  if (!v) return false;
  if (TAMANHO_DATA.includes(k)) return v.length === 10;
  if (k === "cpf") return v.replace(/\D/g, "").length === 11;
  if (k === "cep") return v.replace(/\D/g, "").length === 8;
  if (k === "orgaoExpedidor") return !orgaoIncompleto(v);
  if (k === "instituicao") return !instituicaoSemLugar(v);
  return true;
}

function analisarProgresso(form: typeof formVazio, estacio: boolean): { progresso: number; faltando: string[] } {
  const campos = estacio ? CAMPOS_PROGRESSO_ESTACIO : CAMPOS_PROGRESSO_PUBLICACAO;
  const faltando = campos.filter(([k]) => !campoPreenchido(k, form)).map(([, rotulo]) => rotulo);
  return { progresso: Math.round(((campos.length - faltando.length) / campos.length) * 100), faltando };
}

function formDeCliente(c: Cliente): typeof formVazio {
  return {
    nome: c.nome, nascimento: c.nascimento, cpf: c.cpf, rg: c.rg,
    orgaoExpedidor: maskOrgao(c.orgaoExpedidor),
    sexo: c.sexo, nomeMae: c.nomeMae, nomePai: c.nomePai, observacao: c.observacao,
    nacionalidade: c.nacionalidade || "BRASILEIRO(A)",
    dataColacao: c.dataColacao,
    reitor: c.reitor,
    instituicao: c.instituicao, inep: c.inep, endereco: c.endereco, bairro: c.bairro,
    municipio: c.municipio, cep: c.cep, modalidade: c.modalidade || "BACHAREL",
    curso: c.curso, anoConclusao: c.anoConclusao, dataPublicacao: c.data,
    protocolo: c.protocolo,
    naturalidade: c.naturalidade, cidadeExpedicao: maskCidadeUf(c.cidadeExpedicao), dataExpedicao: c.dataExpedicao,
    registroNumero: c.registroNumero, registroLivro: c.registroLivro, registroFolha: c.registroFolha,
    registroData: c.registroData, registroProcesso: c.registroProcesso,
    cursoReconhecimento: c.cursoReconhecimento,
  };
}

type RascunhoLocal = { form?: typeof formVazio; senhaAcesso?: string; editandoId?: string; emec?: DadosEmec; emecManual?: string[]; rascunhoId?: string };

function TabNovo({ clientes, onGerar, onEditar, prefill, grupo, rascunhoDb, autor, onRascunhoConcluido, editarPubId, onVerHistorico }: {
  clientes: Cliente[];
  onGerar: (c: Cliente) => void;
  onEditar: (c: Cliente) => Promise<boolean>;
  prefill?: { nome?: string; cpf?: string } | null;
  grupo?: string;
  rascunhoDb?: Rascunho | null;
  autor?: string;
  onRascunhoConcluido?: () => void;
  editarPubId?: string;
  onVerHistorico?: (pubId: string) => void;
}) {
  const navigate = useNavigate();
  const isEstacio = grupo === "estacio";
  const vazio = isEstacio ? formVazioEstacio : formVazio;
  const rascunhoKey = `pub-rascunho-${grupo ?? "publicacao"}`;
  const rascunhoInicial = useRef<RascunhoLocal | null | undefined>(undefined);
  if (rascunhoInicial.current === undefined) {
    let local: RascunhoLocal | null = null;
    try {
      const raw = sessionStorage.getItem(rascunhoKey);
      local = raw ? JSON.parse(raw) : null;
    } catch { local = null; }
    // Rascunho salvo no banco vence, a não ser que esta mesma sessão já o esteja editando.
    if (rascunhoDb && local?.rascunhoId !== rascunhoDb.id) {
      const d = rascunhoDb.dados;
      local = {
        form: d.form as typeof formVazio, emec: d.emec as DadosEmec | undefined,
        emecManual: d.emecManual, editandoId: d.editandoId, rascunhoId: rascunhoDb.id,
      };
    }
    rascunhoInicial.current = local;
  }
  const rascunho = rascunhoInicial.current;
  const [rascunhoId, setRascunhoId] = useState(rascunho?.rascunhoId ?? "");
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState(
    rascunhoDb && rascunhoDb.id === rascunho?.rascunhoId ? rascunhoDb.updated_at : "");
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const saindo = useRef(false);
  const [form, setForm] = useState(() => rascunho?.form
    ? { ...vazio, ...rascunho.form }
    : { ...vazio, nome: prefill?.nome ?? "", cpf: prefill?.cpf ? maskCPF(prefill.cpf) : "" });
  const [gerado, setGerado] = useState<Cliente | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [templateStatus, setTemplateStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [matricula, setMatricula] = useState("");
  const [senhaAcesso, setSenhaAcesso] = useState(rascunho?.senhaAcesso ?? "");
  const [emec, setEmec] = useState<DadosEmec>(() => rascunho?.emec ? mesclarEmec(rascunho.emec) : emecVazio());
  const [emecManual, setEmecManual] = useState<Set<string>>(() => new Set(rascunho?.emecManual ?? []));
  const [acessoCriado, setAcessoCriado] = useState<{ matricula: string; senha: string } | null>(null);

  useEffect(() => {
    if (!isEstacio) return;
    localStorage.removeItem(TEMPLATE_KEY_LEGADO);
    carregarTemplateEstacio().then(() => setTemplateStatus("ok"), () => setTemplateStatus("erro"));
  }, [isEstacio]);

  const editandoRestaurado = useRef(false);
  useEffect(() => {
    if (editandoRestaurado.current) return;
    const id = rascunho?.editandoId;
    if (!id) { editandoRestaurado.current = true; return; }
    const c = clientes.find(x => x.pubId === id);
    if (!c) return;
    setEditando(c);
    editandoRestaurado.current = true;
  }, [clientes, rascunho]);

  useEffect(() => {
    if (saindo.current) return;
    if (gerado) {
      sessionStorage.removeItem(rascunhoKey);
      return;
    }
    sessionStorage.setItem(rascunhoKey, JSON.stringify({
      form, senhaAcesso, editandoId: editando?.pubId ?? "",
      emec, emecManual: [...emecManual], rascunhoId,
    }));
  }, [form, senhaAcesso, editando, gerado, rascunhoKey, emec, emecManual, rascunhoId]);

  // Publicação concluída: o rascunho de origem deixa de existir.
  useEffect(() => {
    if (!gerado || !rascunhoId) return;
    void apagarRascunho(rascunhoId);
    setRascunhoId("");
    setRascunhoSalvoEm("");
    onRascunhoConcluido?.();
  }, [gerado, rascunhoId, onRascunhoConcluido]);

  async function concluirMaisTarde() {
    if (!form.nome.trim() && !form.cpf.trim()) {
      setErro("Informe ao menos o nome ou o CPF do aluno para salvar o rascunho.");
      return;
    }
    setErro("");
    setSalvandoRascunho(true);
    const { progresso, faltando } = analisarProgresso(form, isEstacio);
    try {
      await salvarRascunho({
        grupo: grupo ?? "publicacao",
        nome: form.nome.trim(),
        cpf: form.cpf.trim(),
        curso: form.curso.trim(),
        dados: { form, emec, emecManual: [...emecManual], editandoId: editando?.pubId ?? "" },
        progresso, faltando,
        edicao: !!editando,
        autor_nome: autor ?? "",
      }, rascunhoId || undefined);
    } catch (e) {
      console.error("[rascunho]", e);
      setSalvandoRascunho(false);
      setErro("Não foi possível salvar o rascunho. Verifique a conexão (e se a migração 017_rascunhos.sql foi aplicada).");
      return;
    }
    saindo.current = true;
    sessionStorage.removeItem(rascunhoKey);
    navigate("/clientes", { state: { rascunhoSalvo: form.nome.trim() || form.cpf.trim() } });
  }

  useEffect(() => {
    if (!isEstacio) return;
    setEmec(prev => sugerirEmec(prev, form, emecManual));
  }, [isEstacio, form, emecManual]);

  useEffect(() => {
    if (!isEstacio) return;
    let cancelado = false;
    (["ies", "curso", "registro"] as const).forEach(bloco => {
      if (emecManual.has(`${bloco}.codigoMunicipio`)) return;
      const { municipio, uf, codigoMunicipio } = emec[bloco];
      if (!municipio.trim() || !UFS.has(uf)) return;
      municipiosIbge(uf).then(lista => {
        const codigo = lista.get(chaveMunicipio(municipio)) ?? "";
        if (cancelado || codigo === codigoMunicipio) return;
        setEmec(prev => prev[bloco].municipio === municipio && prev[bloco].uf === uf
          ? { ...prev, [bloco]: { ...prev[bloco], codigoMunicipio: codigo } } : prev);
      }).catch(() => {});
    });
    return () => { cancelado = true; };
  }, [isEstacio, emec, emecManual]);

  async function carregarAcesso(id: string) {
    setMatricula("");
    setSenhaAcesso("");
    const { data } = await supabase.from("acessos_estacio").select("matricula").eq("pub_id", id).limit(1);
    setMatricula(((data as { matricula: string }[] | null) ?? [])[0]?.matricula ?? "");
  }

  function selecionarEdicao(pubId: string) {
    const c = clientes.find(x => x.pubId === pubId) ?? null;
    setEditando(c);
    setErro("");
    setForm(c ? formDeCliente(c) : vazio);
    if (c?.dadosEmec) {
      setEmec(c.dadosEmec);
      setEmecManual(new Set(chavesEmec(c.dadosEmec)));
    } else {
      setEmec(emecVazio());
      setEmecManual(new Set());
    }
    if (c) carregarAcesso(c.pubId);
    else { setMatricula(""); setSenhaAcesso(""); }
  }

  function cancelarEdicao() {
    setEditando(null);
    setErro("");
    setForm(vazio);
    setEmec(emecVazio());
    setEmecManual(new Set());
    setMatricula("");
    setSenhaAcesso("");
    sessionStorage.removeItem(rascunhoKey);
  }

  // Vindo da aba HISTÓRICO ("Editar na aba NOVO"): abre o registro já carregado no formulário.
  const editarAplicado = useRef("");
  useEffect(() => {
    if (!editarPubId || editarAplicado.current === editarPubId) return;
    const c = clientes.find(x => x.pubId === editarPubId);
    if (!c) return;
    editarAplicado.current = editarPubId;
    if (rascunho?.editandoId === editarPubId) return;
    selecionarEdicao(editarPubId);
  }, [editarPubId, clientes]);

  function confirmarCamposDiploma(): boolean {
    if (!isEstacio) return true;
    const vazios = CAMPOS_DIPLOMA.filter(([k]) => !String(form[k] ?? "").trim()).map(([, rotulo]) => rotulo);
    if (!vazios.length) return true;
    return window.confirm(`Estes campos do diploma estão vazios e ficarão em branco no documento:\n\n• ${vazios.join("\n• ")}\n\nGerar mesmo assim?`);
  }

  async function gerarDiploma(c: Cliente): Promise<Cliente | null> {
    try {
      const { blob, docxUrl } = await publicarDocxEstacio({ ...c, cursoReconhecimento: RECONHECIMENTO_FIXO, registroProcesso: PROCESSO_FIXO });
      setDocxBlob(blob);
      if (!docxUrl) {
        setErro("Diploma gerado, mas o envio do .docx falhou. Salve novamente para publicar.");
        return null;
      }
      return { ...c, cursoReconhecimento: RECONHECIMENTO_FIXO, registroProcesso: PROCESSO_FIXO, docxUrl };
    } catch (e) {
      console.error("[diploma]", e);
      setErro("Não foi possível gerar o diploma (.docx). Verifique os dados e tente novamente.");
      return null;
    }
  }

  function setField(k: keyof typeof form, transform?: (v: string) => string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let v = e.target.value;
      if (transform) v = transform(v);
      setForm(prev => ({ ...prev, [k]: v }));
    };
  }

  const camposDiploma = {
    naturalidade: form.naturalidade, cidadeExpedicao: form.cidadeExpedicao, dataExpedicao: form.dataExpedicao,
    registroNumero: form.registroNumero, registroLivro: form.registroLivro, registroFolha: form.registroFolha,
    registroData: form.registroData, registroProcesso: form.registroProcesso,
    cursoReconhecimento: form.cursoReconhecimento,
  };

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.cpf) return;
    if (isEstacio && orgaoIncompleto(form.orgaoExpedidor)) {
      setErro("Órgão Expedidor precisa da barra, no formato SSP/SP.");
      return;
    }
    if (isEstacio && instituicaoSemLugar(form.instituicao)) {
      setErro("Complete o lugar depois de CENTRO UNIVERSITÁRIO ESTÁCIO DE.");
      return;
    }
    if (isEstacio && cidadeUfIncompleta(form.cidadeExpedicao)) {
      setErro("Cidade/UF da Expedição precisa do traço e da UF, no formato Ribeirão Preto - SP.");
      return;
    }
    if (!confirmarCamposDiploma()) return;
    setErro("");
    let credenciaisNovas: { matricula: string; senha: string } | null = null;
    if (isEstacio && !editando) {
      const m = matriculaDoDiploma({ registroNumero: form.registroNumero, protocolo: form.protocolo });
      if (!m) { setErro("Gere o nº de registro do diploma antes de criar o acesso."); return; }
      const { data: mesmaMat, error: erroMat } = await supabase.from("acessos_estacio").select("id").ilike("matricula", m).limit(1);
      if (erroMat) { setErro("Não foi possível confirmar se a matrícula já existe."); return; }
      if (((mesmaMat as { id: string }[] | null) ?? []).length) { setErro("Este nº de registro já é a matrícula de outro diploma."); return; }
      credenciaisNovas = { matricula: m, senha: senhaAcesso.trim() || gerarSenhaAcesso() };
    }
    if (isEstacio) {
      try {
        const repetido = await registroRepetido(form.registroNumero, editando?.pubId);
        if (repetido) { setErro(repetido); return; }
      } catch {
        setErro("Não foi possível confirmar se o número de registro já foi publicado.");
        return;
      }
    }

    if (editando) {
      const atualizado: Cliente = {
        ...editando,
        ...camposDiploma,
        nome: form.nome, cpf: form.cpf, nascimento: form.nascimento, rg: form.rg,
        orgaoExpedidor: form.orgaoExpedidor,
        sexo: form.sexo,
      nomeMae: form.nomeMae, nomePai: form.nomePai, observacao: form.observacao,
        nacionalidade: form.nacionalidade,
        dataColacao: form.dataColacao,
        reitor: form.reitor,
        instituicao: form.instituicao, inep: form.inep, endereco: form.endereco,
        bairro: form.bairro, municipio: form.municipio, cep: form.cep,
        dadosEmec: isEstacio ? emec : null,
        modalidade: form.modalidade, curso: form.curso, anoConclusao: form.anoConclusao,
        data: form.dataPublicacao || editando.data,
        protocolo: form.protocolo || editando.protocolo,
      };
      setSalvando(true);
      const comDiploma = isEstacio ? await gerarDiploma(atualizado) : null;
      const ok = await onEditar(comDiploma ?? atualizado);
      setSalvando(false);
      if (!ok) { setErro("Não foi possível salvar as alterações. Tente novamente."); return; }
      if (isEstacio && !comDiploma) return;
      const salvo = comDiploma ?? atualizado;
      const matriculaDiploma = matriculaDoDiploma(salvo);
      const { data: doPub } = await supabase.from("acessos_estacio").select("id").eq("pub_id", salvo.pubId).limit(1);
      const temAcesso = ((doPub as { id: string }[] | null) ?? []).length > 0;
      const senha = senhaAcesso.trim();
      if (matriculaDiploma && (senha || temAcesso)) await vincularAcesso(salvo, { matricula: matriculaDiploma, senha });
      else setAcessoCriado(null);
      setGerado(salvo);
      return;
    }

    const pubId = await gerarPubId(grupo === "estacio");
    const url = grupo === "estacio"
      ? `${DIPLOMA_BASE}/${pubId}`
      : `${window.location.origin}/pub/${pubId}`;

    const dataDisplay = form.dataPublicacao || new Date().toLocaleDateString("pt-BR");
    const protocolo = Date.now().toString().slice(-13);

    const novo: Cliente = {
      ...camposDiploma,
      id: Date.now(),
      pubId,
      nome: form.nome, cpf: form.cpf,
      curso: form.curso, status: "Publicado",
      data: dataDisplay,
      nascimento: form.nascimento, rg: form.rg,
      orgaoExpedidor: form.orgaoExpedidor,
      sexo: form.sexo,
      nomeMae: form.nomeMae, nomePai: form.nomePai,
      observacao: form.observacao || "ALUNO APROVADO",
      nacionalidade: form.nacionalidade,
      dataColacao: form.dataColacao,
      reitor: form.reitor,
      instituicao: form.instituicao, inep: form.inep,
      endereco: form.endereco, bairro: form.bairro,
      dadosEmec: isEstacio ? emec : null,
      municipio: form.municipio, cep: form.cep,
      modalidade: form.modalidade,
      anoConclusao: form.anoConclusao,
      protocolo, url, docxUrl: "",
      pagamentoStatus: "pendente",
      ativo: true,
    };

    setSalvando(true);
    const comDiploma = isEstacio ? await gerarDiploma(novo) : null;
    setSalvando(false);
    if (isEstacio && !comDiploma) return;

    const novoFinal = comDiploma ?? novo;
    onGerar(novoFinal);
    if (isEstacio && credenciaisNovas) {
      const matriculaDiploma = matriculaDoDiploma(novoFinal);
      await vincularAcesso(novoFinal, { matricula: matriculaDiploma, senha: credenciaisNovas.senha });
    }
    setGerado(novoFinal);
  }

  // Senha em branco = mantém o hash atual no banco (a senha antiga não é recuperável).
  async function vincularAcesso(c: Cliente, cred: { matricula: string; senha: string }) {
    const url = c.url || `${DIPLOMA_BASE}/${c.pubId}`;
    try {
      await salvarAcessoDiploma({ matricula: cred.matricula, senha: cred.senha, nome: c.nome, pubId: c.pubId, url });
    } catch {
      setErro("Diploma salvo, mas não foi possível gravar o acesso do SIA no banco.");
      setAcessoCriado(null);
      return;
    }
    setAcessoCriado(cred);
    setMatricula(cred.matricula);
    setSenhaAcesso("");
    if (cred.senha) baixarCredencial(cred, c.nome);
  }

  function novaPublicacao() {
    setForm(vazio);
    setGerado(null);
    setDocxBlob(null);
    setEditando(null);
    setErro("");
    setMatricula("");
    setSenhaAcesso("");
    setAcessoCriado(null);
    setEmec(emecVazio());
    setEmecManual(new Set());
    sessionStorage.removeItem(rascunhoKey);
  }

  function alterarEmec(bloco: "ies" | "curso" | "registro", campo: string, transform?: (v: string) => string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const valor = transform ? transform(e.target.value) : e.target.value;
      setEmecManual(prev => {
        const next = new Set(prev);
        next.add(`${bloco}.${campo}`);
        return next;
      });
      setEmec(prev => ({ ...prev, [bloco]: { ...prev[bloco], [campo]: valor } }));
    };
  }

  function escolherCursoEmec(c: CursoEmec) {
    setEmecManual(prev => new Set(prev).add("curso.codigo").add("curso.nome"));
    setEmec(prev => ({ ...prev, curso: { ...prev.curso, codigo: c.codigo, nome: c.nome } }));
  }

  function limparCursoEmec() {
    const vazioCurso = emecVazio().curso;
    setEmecManual(prev => {
      const next = new Set(prev);
      Object.keys(vazioCurso).forEach(campo => next.add(`curso.${campo}`));
      return next;
    });
    setEmec(prev => ({ ...prev, curso: { ...vazioCurso } }));
  }

  if (gerado) return (
    <div className="tab-body" style={{ position: "relative" }}>
      <QRCapture pubId={gerado.pubId} url={gerado.url} />

      <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(52,211,153,0.12)", border: "2px solid #34d399", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>
            {editando ? "Alterações salvas!" : "Publicação gerada!"}
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{gerado.nome}</div>
          {acessoCriado && (
            <div style={{ marginTop: 12, textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8 }}>
                {acessoCriado.senha
                  ? "Acesso do SIA salvo no banco — anote a senha: ela só aparece agora (o arquivo .csv foi baixado)"
                  : "Acesso do SIA atualizado no banco (senha mantida)"}
              </div>
              <div style={{ fontSize: 14, color: "var(--fg)" }}>Matrícula: <strong>{acessoCriado.matricula}</strong></div>
              {acessoCriado.senha && <>
                <div style={{ fontSize: 14, color: "var(--fg)", marginTop: 4 }}>Senha: <strong>{acessoCriado.senha}</strong></div>
                <button type="button" className="btn-sm" style={{ marginTop: 10 }}
                  onClick={() => baixarCredencial(acessoCriado, gerado.nome)}>Baixar credencial (.csv) de novo</button>
              </>}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", padding: 16, borderRadius: 4, display: "inline-block", border: "1px solid #e5e5e5" }}>
          <QRCodeSVG value={gerado.url} size={245} {...QR_STYLE} />
        </div>

        <div style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 4 }}>Link da publicação</div>
          <a href={gerado.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--accent)", wordBreak: "break-all" }}>
            {gerado.url}
          </a>
        </div>

        {docxBlob && (
          <div style={{ width: "100%", textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Pré-visualização do documento</span>
              <a
                href={URL.createObjectURL(docxBlob)}
                download={`${gerado.nome.split(" ")[0].toLowerCase()}.docx`}
                style={{ fontSize: 12, color: "var(--accent)" }}
              >
                ↓ Baixar .docx
              </a>
            </div>
            <DocxPreview blob={docxBlob} />
          </div>
        )}

        <div className="pub-done-actions">
          <button className="btn-sm" onClick={() => window.open(gerado.url, "_blank")}>Ver página</button>
          {onVerHistorico && <button className="btn-sm" onClick={() => onVerHistorico(gerado.pubId)}>Ver histórico</button>}
          <button className="btn-primary" onClick={novaPublicacao}>+ Nova publicação</button>
        </div>
      </div>
    </div>
  );

  return (
    <form className="tab-body" onSubmit={gerar}>
      <div className="edit-sections">
        {rascunhoId && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 13, color: "var(--fg)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>
              <strong>Retomando um rascunho.</strong>{" "}
              {rascunhoSalvoEm && <span style={{ color: "var(--fg-muted)" }}>Salvo em {new Date(rascunhoSalvoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. </span>}
              <span style={{ color: "var(--fg-muted)" }}>Ao gerar a publicação, ele sai de Andamento.</span>
            </span>
          </div>
        )}
        {isEstacio && (
          <div className="edit-section">
            <div className="edit-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Diploma Estácio
              {templateStatus === "ok" && <span style={{ fontSize: 11, fontWeight: 400, color: "#34d399" }}>✓ template oficial</span>}
              {templateStatus === "carregando" && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--fg-muted)" }}>carregando template…</span>}
              {templateStatus === "erro" && <span style={{ fontSize: 11, fontWeight: 400, color: "#f87171" }}>template indisponível</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: 0 }}>
              O diploma (.docx) é gerado com os dados abaixo, o QR Code e o código de validação desta publicação.
            </p>
            <div className="edit-grid" style={{ marginTop: 12 }}>
              <div className="field-group">
                <label className="edit-label">Matrícula de acesso</label>
                <input className="edit-input" value={form.registroNumero || form.protocolo || ""} readOnly placeholder="Igual ao nº de registro do diploma" />
              </div>
              <Field label="Senha de acesso" value={senhaAcesso} onChange={e => setSenhaAcesso(e.target.value)} placeholder="Em branco, o sistema gera" />
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "8px 0 0" }}>
              A matrícula do login é o nº de registro impresso no diploma. Se ele ainda não existir, usa o protocolo da página. A senha é gerada se ficar em branco, e o arquivo sia-acessos.csv é baixado ao criar o cliente.
            </p>
          </div>
        )}

        {clientes.length > 0 && (
          <div className="edit-section">
            <div className="edit-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Editar publicação existente</span>
              {editando && onVerHistorico && (
                <button type="button" className="btn-sm" onClick={() => onVerHistorico(editando.pubId)}>Ver histórico deste registro</button>
              )}
            </div>
            <div className="edit-grid">
              <div className="field-group field-group--full">
                <label className="edit-label">Selecione uma publicação para editar ou deixe em branco para criar uma nova</label>
                <select className="edit-input" value={editando?.pubId ?? ""} onChange={e => selecionarEdicao(e.target.value)}>
                  <option value="">— Nova publicação —</option>
                  {clientes.map(c => <option key={c.pubId} value={c.pubId}>{c.nome} — {c.cpf}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
        <div className="edit-section">
          <div className="edit-section-title">Dados do Aluno</div>
          <div className="edit-grid">
            <Field label="Nome do Aluno *" value={form.nome} onChange={setField("nome", up)} full />
            <Field label="Data de Nascimento" value={form.nascimento} onChange={setField("nascimento", maskData)} placeholder="DD/MM/AAAA" />
            <Field label="CPF *" value={form.cpf} onChange={setField("cpf", maskCPF)} placeholder="000.000.000-00" />
            <Field label="RG/RNE/RA" value={form.rg} onChange={setField("rg", maskRG)} placeholder="000000000000-0" />
            {isEstacio && <Field label="Órgão Expedidor" value={form.orgaoExpedidor} onChange={setField("orgaoExpedidor", maskOrgao)} placeholder="SSP/SP" />}
            {isEstacio && <Field label="Nacionalidade" value={form.nacionalidade} onChange={setField("nacionalidade", up)} placeholder="BRASILEIRO(A)" />}
            {isEstacio && <Field label="Naturalidade" value={form.naturalidade} onChange={setField("naturalidade", up)} placeholder="SÃO PAULO" />}
            {isEstacio ? (
              <div className="field-group">
                <label className="edit-label">Sexo</label>
                <select className="edit-input" value={form.sexo} onChange={setField("sexo")}>
                  <option value="">Selecione</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
            ) : <Field label="Nome da Mãe" value={form.nomeMae} onChange={setField("nomeMae", up)} />}
            {!isEstacio && <Field label="Nome do Pai" value={form.nomePai} onChange={setField("nomePai", up)} />}
            {!isEstacio && <Field label="Observações" value={form.observacao} onChange={setField("observacao", up)} full />}
          </div>
        </div>
        <div className="edit-section">
          <div className="edit-section-title">Dados da Instituição</div>
          <div className="edit-grid">
            <Field label="Nome da Instituição" value={form.instituicao} onChange={setField("instituicao", isEstacio ? instituicaoEstacio : up)} full />
            {isEstacio && <Field label="Reitor(a)" value={form.reitor} onChange={setField("reitor", up)} placeholder="Nome do(a) Reitor(a)" full />}
            <Field label="Endereço" value={form.endereco} onChange={setField("endereco", up)} />
            <Field label="Bairro" value={form.bairro} onChange={setField("bairro", up)} />
            <AutocompleteMunicipio
              value={form.municipio}
              onChange={setField("municipio", up)}
              onSelectSuggestion={(municipio, cep) => setForm(prev => ({ ...prev, municipio, cep }))}
            />
            <Field label="CEP" value={form.cep} onChange={setField("cep", maskCEP)} placeholder="00000-000" />
            {!isEstacio && (
              <div className="field-group">
                <label className="edit-label">Modalidade</label>
                <select className="edit-input" value={form.modalidade} onChange={setField("modalidade")}>
                  <option>PRESENCIAL</option>
                  <option>SEMIPRESENCIAL</option>
                  <option>EAD</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="edit-section">
          <div className="edit-section-title">Resumo da Publicação</div>
          <div className="edit-grid">
            <Field label="Curso" value={form.curso} onChange={setField("curso", up)} full
              placeholder={isEstacio ? "GESTÃO DE TURISMO (o prefixo do curso é montado pelo título)" : undefined} />
            {isEstacio && (
              <div className="field-group">
                <label className="edit-label">Título/Grau Conferido</label>
                <select className="edit-input" value={form.modalidade} onChange={setField("modalidade")}>
                  <option>BACHAREL</option>
                  <option>LICENCIADO(A)</option>
                  <option>TECNÓLOGO(A)</option>
                  <option>ESPECIALISTA</option>
                  <option>MESTRE</option>
                  <option>DOUTOR(A)</option>
                </select>
              </div>
            )}
            {!isEstacio && <Field label="Ano de Conclusão" value={form.anoConclusao} onChange={setField("anoConclusao")} />}
            <Field label="Data de Conclusão do Curso" value={form.dataPublicacao} onChange={setField("dataPublicacao", maskData)} placeholder="DD/MM/AAAA" />
            {isEstacio && <Field label="Data da Colação de Grau" value={form.dataColacao} onChange={setField("dataColacao", maskData)} placeholder="DD/MM/AAAA" />}
          </div>
        </div>
        {isEstacio && (
          <>
            <PainelEmec titulo="Dados da IES Emissora" bloco={emec.ies} onChange={(campo, transform) => alterarEmec("ies", campo, transform)} />
            <PainelEmec titulo="Dados do Curso" bloco={emec.curso} curso iesCodigo={emec.ies.codigoMec} onEscolherCurso={escolherCursoEmec} onChange={(campo, transform) => alterarEmec("curso", campo, transform)} onLimpar={limparCursoEmec} />
            <PainelEmec titulo="Dados do Registro" bloco={emec.registro} onChange={(campo, transform) => alterarEmec("registro", campo, transform)} />
          </>
        )}
        {isEstacio && (
          <SecaoRegistroEstacio
            form={form}
            sf={setField}
            excetoPubId={editando?.pubId}
            definirNumero={valor => setForm(prev => ({ ...prev, registroNumero: valor }))}
          />
        )}
      </div>
      <div className="edit-footer">
        {erro ? <span style={{ color: "#f87171", fontSize: 13 }}>{erro}</span> : <span />}
        <div className="edit-actions">
          <button type="button" className="btn-sm" onClick={editando ? cancelarEdicao : () => { setForm(vazio); setSenhaAcesso(""); setEmec(emecVazio()); setEmecManual(new Set()); sessionStorage.removeItem(rascunhoKey); }}>
            {editando ? "Cancelar edição" : "Limpar"}
          </button>
          <button type="button" className="btn-sm" onClick={concluirMaisTarde} disabled={salvando || salvandoRascunho}
            title="Salva o que já foi preenchido e deixa em Andamento para terminar depois"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, borderColor: "rgba(245,158,11,0.45)", color: "#f59e0b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {salvandoRascunho ? "Salvando…" : "Concluir mais tarde"}
          </button>
          <button type="submit" className="btn-primary" disabled={salvando || (isEstacio && templateStatus !== "ok")}>
            {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Gerar Publicação"}
          </button>
        </div>
      </div>
    </form>
  );
}

function PainelEmec({ titulo, bloco, curso, iesCodigo, onEscolherCurso, onChange, onLimpar }: {
  titulo: string;
  bloco: DadosEmec["ies"] | DadosEmec["curso"] | DadosEmec["registro"];
  curso?: boolean;
  iesCodigo?: string;
  onEscolherCurso?: (curso: CursoEmec) => void;
  onChange: (campo: string, transform?: (v: string) => string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLimpar?: () => void;
}) {
  const identificacao = bloco as DadosEmec["ies"];
  const doCurso = bloco as DadosEmec["curso"];
  return (
    <div className="edit-section">
      <div className="edit-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>{titulo}</span>
        {onLimpar && <button type="button" className="btn-sm" onClick={onLimpar}>Limpar</button>}
      </div>
      <div className="edit-grid">
        {curso ? (
          <>
            <Field label="Nome do Curso" value={doCurso.nome} onChange={onChange("nome", up)} full />
            <SeletorCursoEmec
              codigo={doCurso.codigo}
              nomeCurso={doCurso.nome}
              iesCodigo={iesCodigo ?? ""}
              onChange={onChange("codigo", v => v.replace(/\D/g, ""))}
              onEscolher={c => onEscolherCurso?.(c)}
            />
            <Field label="Título Conferido" value={doCurso.titulo} onChange={onChange("titulo", up)} />
            <Field label="Grau Conferido" value={doCurso.grau} onChange={onChange("grau")} />
          </>
        ) : (
          <>
            <Field label="Nome" value={identificacao.nome} onChange={onChange("nome", up)} full />
            <Field label="Código MEC" value={identificacao.codigoMec} onChange={onChange("codigoMec")} />
            <Field label="CNPJ" value={identificacao.cnpj} onChange={onChange("cnpj")} />
            <Field label="Mantenedora" value={identificacao.mantenedora} onChange={onChange("mantenedora", up)} full />
          </>
        )}
        <Field label="Logradouro" value={bloco.logradouro} onChange={onChange("logradouro", up)} />
        <Field label="Número" value={bloco.numero} onChange={onChange("numero")} />
        <Field label="Bairro" value={bloco.bairro} onChange={onChange("bairro", up)} />
        <Field label="CEP" value={bloco.cep} onChange={onChange("cep", maskCEP)} placeholder="00000-000" />
        <Field label="Município" value={bloco.municipio} onChange={onChange("municipio", up)} />
        <Field label="Código do Município" value={bloco.codigoMunicipio} onChange={onChange("codigoMunicipio")} placeholder="Preenchido pelo IBGE a partir do município e UF" />
        <Field label="UF" value={bloco.uf} onChange={onChange("uf", v => v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, full, placeholder }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; full?: boolean; placeholder?: string }) {
  return (
    <div className={`field-group ${full ? "field-group--full" : ""}`}>
      <label className="edit-label">{label}</label>
      <input className="edit-input" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function FieldDate({ label, value, onChange, full }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; full?: boolean }) {
  return (
    <div className={`field-group ${full ? "field-group--full" : ""}`}>
      <label className="edit-label">{label}</label>
      <input type="date" className="edit-input" value={value} onChange={onChange} />
    </div>
  );
}

/* ── Tab PUBLICADOS (lista simples das publicações no ar) ── */
function TabPublicados({ clientes }: { clientes: Cliente[] }) {
  const publicados = clientes.filter(c => c.status === "Publicado");
  return (
    <div className="tab-body">
      <div className="pub-table-wrap">
        <table className="data-table pub-table">
          <thead>
            <tr><th>Protocolo</th><th>Nome</th><th>Status</th><th>Publicado em</th><th>Modalidade</th></tr>
          </thead>
          <tbody>
            {publicados.length === 0 ? (
              <tr className="pub-empty"><td colSpan={5}><div className="empty-state"><p>Nenhuma publicação encontrada</p></div></td></tr>
            ) : publicados.map(c => (
              <tr key={c.pubId} className="pub-row">
                <td className="pc-line pc-proto" data-label="Protocolo">{c.protocolo}</td>
                <td className="pc-title">{c.nome}</td>
                <td className="pc-badge"><span className="chip chip--green">Publicado</span></td>
                <td className="pc-line pc-data" data-label="Publicado em">{c.data}</td>
                <td className="pc-line pc-curso" data-label="Modalidade">{c.modalidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Tab VISUALIZAR ── */
function TabVisualizar({ clientes }: { clientes: Cliente[] }) {
  const publicados = clientes.filter(c => c.status === "Publicado");
  const [sel, setSel] = useState<Cliente | null>(publicados[0] ?? null);
  const c = sel;

  return (
    <div className="tab-body">
      {publicados.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <select className="edit-input" style={{ maxWidth: 400 }}
            value={sel?.pubId ?? ""} onChange={e => setSel(publicados.find(p => p.pubId === e.target.value) ?? null)}>
            {publicados.map(p => <option key={p.pubId} value={p.pubId}>{p.nome}</option>)}
          </select>
        </div>
      )}
      {!c ? (
        <div className="empty-state"><p>Nenhuma publicação disponível</p></div>
      ) : (
        <div className="preview-wrap">
          <div className="preview-label">Pré-visualização da publicação</div>
          <div className="preview-card">
            <div className="preview-intro">
              <strong>Publicação processada em DOU de<br />{c.data}</strong>
              <p>PROTOCOLO {c.protocolo}<br />REGISTRADO DE ACORDO COM A LEI SEB 738329/2025 e SEE 98483/2025</p>
            </div>
            <PrevSection title="Dados do Aluno">
              <PrevRow label="Nome do Aluno" value={c.nome} />
              <PrevRow label="Data de Nascimento" value={c.nascimento} />
              <PrevRow label="CPF" value={c.cpf} />
              <PrevRow label="RG/RNE/RA" value={c.rg} />
              <PrevRow label="Nome da Mãe" value={c.nomeMae} />
              <PrevRow label="Nome do Pai" value={c.nomePai} />
              <PrevRow label="Observações" value={c.observacao} />
            </PrevSection>
            <PrevSection title="Dados da Instituição">
              <PrevRow label="Nome da Instituição" value={c.instituicao} />
              <PrevRow label="Município" value={c.municipio} />
              <PrevRow label="Modalidades" value={c.modalidade} />
            </PrevSection>
            <PrevSection title="Resumo da Publicação">
              <PrevRow label="Curso" value={c.curso} />
              <PrevRow label="Ano de Conclusão" value={c.anoConclusao} />
              <PrevRow label="Data Publicação" value={c.data} />
            </PrevSection>
          </div>
        </div>
      )}
    </div>
  );
}

function PrevSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="prev-section">
      <div className="prev-section-title">{title}</div>
      <div className="prev-rows">{children}</div>
    </div>
  );
}
function PrevRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="prev-row">
      <span className="prev-label">{label}:</span>
      <span className="prev-value">{value}</span>
    </div>
  );
}

/* ── Componente principal ── */
const GRUPO_LABELS: Record<string, { titulo: string; breadcrumb: string; sub: string; novo: string }> = {
  publicacao: { titulo: "Publicação", breadcrumb: "PUBLICAÇÃO", sub: "Geração e gestão de publicações no Diário Oficial", novo: "+ Nova publicação" },
  estacio:    { titulo: "Estácio",    breadcrumb: "ESTÁCIO",    sub: "Publicações do grupo Estácio",                         novo: "+ Nova publicação" },
};

export default function Publicacao() {
  const navigate = useNavigate();
  const location = useLocation();
  const { grupo: grupoParam } = useParams<{ grupo: string }>();
  const grupo = grupoParam ?? "publicacao";
  const labels = GRUPO_LABELS[grupo] ?? GRUPO_LABELS["publicacao"];
  const tabs = grupo === "estacio"
    ? [TABS_BASE[0], TABS_BASE[1], TABS_BASE[2], { id: "acesso" as const, label: "ACESSO" }, ...TABS_BASE.slice(3)]
    : TABS_BASE;
  const { usuario } = useOutletContext<{ usuario: UsuarioLogado | null }>();
  const isAdmin = usuario?.perfil === "Administrador";
  const estadoNav = (location.state as { nome?: string; cpf?: string; rascunhoId?: string } | null) ?? null;
  const prefill = estadoNav && (estadoNav.nome !== undefined || estadoNav.cpf !== undefined) ? estadoNav : null;
  const rascunhoIdNav = estadoNav?.rascunhoId ?? "";
  const [rascunhoDb, setRascunhoDb] = useState<Rascunho | null>(null);
  const [rascunhoCarregando, setRascunhoCarregando] = useState(!!rascunhoIdNav);
  const [searchParams, setSearchParams] = useSearchParams();
  const abaUrl = searchParams.get("aba");
  const activeTab: Tab = tabs.some(t => t.id === abaUrl) ? (abaUrl as Tab) : (prefill ? "novo" : "clientes");
  const setActiveTab = (t: Tab) => setSearchParams({ aba: t });
  const pubHistorico = searchParams.get("pub") ?? "";
  const pubEditarUrl = searchParams.get("editar") ?? "";
  const abrirHistorico = (pubId: string) => setSearchParams(pubId ? { aba: "historico", pub: pubId } : { aba: "historico" });
  const editarDoHistorico = (pubId: string) => {
    const rascunhoKey = `pub-rascunho-${grupo}`;
    try {
      const local = JSON.parse(sessionStorage.getItem(rascunhoKey) ?? "null") as
        { form?: { nome?: string; cpf?: string }; editandoId?: string } | null;
      const temFormulario = !!(local?.form?.nome?.trim() || local?.form?.cpf?.trim());
      if (temFormulario && local?.editandoId !== pubId &&
        !window.confirm("Há um formulário em preenchimento na aba NOVO. Abrir este registro vai substituí-lo. Continuar?")) return;
      if (temFormulario && local?.editandoId !== pubId) sessionStorage.removeItem(rascunhoKey);
    } catch { /* sem formulário local */ }
    setSearchParams({ aba: "novo", editar: pubId });
  };
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setDbLoading(true);
      const { data } = await supabase
        .from("publicacoes")
        .select("*")
        .eq("grupo", grupo)
        .order("created_at", { ascending: false });
      if (data) setClientes((data as DBRow[]).map(rowToCliente));
      setDbLoading(false);
    }
    load();
    if (grupo === "estacio") {
      void (async () => {
        await migrarAcessosLocais();
        const lista = await carregarAcessos();
        if (lista.length) await publicarAcessosOnline(lista);
      })();
    }
  }, [grupo]);

  useEffect(() => {
    setRascunhoDb(null);
    if (!rascunhoIdNav) { setRascunhoCarregando(false); return; }
    let cancelado = false;
    setRascunhoCarregando(true);
    carregarRascunho(rascunhoIdNav)
      .then(r => { if (!cancelado) setRascunhoDb(r && r.grupo === grupo ? r : null); })
      .catch(() => {})
      .finally(() => { if (!cancelado) setRascunhoCarregando(false); });
    return () => { cancelado = true; };
  }, [rascunhoIdNav, grupo]);

  async function adicionarCliente(c: Cliente) {
    const { data: { user } } = await supabase.auth.getUser();
    const row = { ...clienteToRow(c), grupo, created_by: user?.id ?? null };
    const { data } = await supabase
      .from("publicacoes")
      .insert([row])
      .select()
      .single();
    if (data) {
      setClientes(prev => [rowToCliente(data as DBRow), ...prev]);
      if (c.nome.trim()) await marcarConcluido(c.nome, c.cpf || null);
    }
  }

  async function editarCliente(atualizado: Cliente): Promise<boolean> {
    const row = clienteToRow(atualizado);
    const { data } = await supabase
      .from("publicacoes")
      .update(row)
      .eq("pub_id", atualizado.pubId)
      .select()
      .single();
    if (!data) return false;
    setClientes(prev => prev.map(c => c.pubId === atualizado.pubId ? rowToCliente(data as DBRow) : c));
    return true;
  }

  async function editarComDiploma(c: Cliente) {
    if (grupo !== "estacio") { await editarCliente(c); return; }
    const publicado = await publicarDocxEstacio(c).catch((e) => { console.error("[diploma]", e); return null; });
    if (!publicado?.docxUrl) window.alert("Dados salvos, mas o diploma (.docx) não foi regenerado. Edite pela aba NOVO para tentar novamente.");
    await editarCliente(publicado?.docxUrl ? { ...c, docxUrl: publicado.docxUrl } : c);
  }

  async function apagarCliente(c: Cliente) {
    const { error } = await supabase
      .from("publicacoes")
      .delete()
      .eq("pub_id", c.pubId);
    if (!error) setClientes(prev => prev.filter(x => x.pubId !== c.pubId));
  }

  async function toggleAtivo(c: Cliente) {
    const novoAtivo = !c.ativo;
    const { error } = await supabase
      .from("publicacoes")
      .update({ ativo: novoAtivo })
      .eq("pub_id", c.pubId);
    if (!error) setClientes(prev => prev.map(x => x.pubId === c.pubId ? { ...x, ativo: novoAtivo } : x));
  }

  async function toggleAtivoLote(pubIds: string[], ativo: boolean) {
    await supabase.from("publicacoes").update({ ativo }).in("pub_id", pubIds);
    setClientes(prev => prev.map(c => pubIds.includes(c.pubId) ? { ...c, ativo } : c));
  }

  return (
    <>
      <div className="page-header pub-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="breadcrumb-path">
            <button className="breadcrumb-btn" onClick={() => navigate("/qrcodes")}>QRCodes</button>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{labels.breadcrumb}</span>
          </div>
          <h1 className="page-title" style={{ marginTop: 6 }}>{labels.titulo}</h1>
          <p className="page-sub">{labels.sub}</p>
        </div>
        <button className="btn-primary pub-new-btn" style={{ alignSelf: "flex-end", marginBottom: 4 }}
          onClick={() => setActiveTab("novo")}>
          {labels.novo}
        </button>
      </div>

      <div className="section-card pub-shell">
        <div className="pub-tabs">
          {tabs.map(t => (
            <button key={t.id}
              className={`pub-tab ${activeTab === t.id ? "pub-tab--active" : ""}`}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="pub-tab-content">
          {dbLoading || rascunhoCarregando ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "var(--fg-muted)", gap: 10 }}>
              <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Carregando...
            </div>
          ) : (
            <>
              {activeTab === "clientes"   && <TabClientes clientes={clientes} isAdmin={isAdmin} estacio={grupo === "estacio"} onNovo={() => setActiveTab("novo")} onEditar={editarComDiploma} onApagar={apagarCliente} onToggleAtivo={toggleAtivo} onToggleAtivoLote={toggleAtivoLote} />}
              {activeTab === "novo"       && <TabNovo key={grupo} clientes={clientes} onGerar={c => { adicionarCliente(c); }} onEditar={editarCliente} prefill={prefill} grupo={grupo} rascunhoDb={rascunhoDb} autor={usuario?.nome} onRascunhoConcluido={() => setRascunhoDb(null)} editarPubId={pubEditarUrl} onVerHistorico={abrirHistorico} />}
              {activeTab === "historico"  && (
                <HistoricoRegistros
                  grupo={grupo}
                  registros={clientes.map(c => ({
                    pubId: c.pubId, nome: c.nome, cpf: c.cpf, curso: c.curso, protocolo: c.protocolo, ativo: c.ativo,
                    modalidade: c.modalidade, nacionalidade: c.nacionalidade, rg: c.rg, orgaoExpedidor: c.orgaoExpedidor,
                    naturalidade: c.naturalidade, reitor: c.reitor,
                  }))}
                  selecionado={pubHistorico}
                  onSelecionar={abrirHistorico}
                  onEditar={editarDoHistorico}
                />
              )}
              {activeTab === "publicados" && <TabPublicados clientes={clientes} />}
              {activeTab === "visualizar" && <TabVisualizar clientes={clientes} />}
              {activeTab === "acesso" && <TabAcesso clientes={clientes} />}
            </>
          )}
        </div>
      </div>

      {activeTab !== "novo" && activeTab !== "acesso" && !dbLoading && (
        <button className="pub-fab" onClick={() => setActiveTab("novo")} aria-label="Nova publicação">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .search-input{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:13px;color:var(--fg);outline:none;min-width:240px;font-family:var(--font)}
        .search-input:focus{border-color:var(--border-focus)}
        .btn-icon{padding:5px 8px;display:inline-flex;align-items:center;justify-content:center;color:var(--fg-muted)}
        .btn-icon:hover{filter:brightness(1.15)}
        .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(3px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal-box{background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.4)}
        .modal-box--sm{max-width:360px}
        .modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 24px;border-bottom:1px solid var(--border)}
        .modal-title{font-size:15px;font-weight:700;color:var(--fg);line-height:1.3}
        .modal-close{background:none;border:none;cursor:pointer;color:var(--fg-muted);padding:4px;border-radius:6px;display:flex;flex-shrink:0;transition:color .15s,background .15s}
        .modal-close:hover{color:var(--fg);background:var(--surface-2)}
        .modal-body{overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px}
        .modal-footer{padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px}
      `}</style>
    </>
  );
}
