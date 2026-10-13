import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { UsuarioLogado } from "../lib/usuario";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { supabase } from "../lib/supabase";
import { marcarConcluido } from "../lib/controle";
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
    reitor: c.reitor,
    curso_descricao: curso.descricao,
    curso_nome: curso.nome,
    curso_reconhecimento: c.cursoReconhecimento,
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
    registro_processo: c.registroProcesso,
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
const up = (v: string) => v.toUpperCase();


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
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.length >= 2
    ? MUNICIPIOS_MA.filter(m => m.nome.includes(value.toUpperCase())).slice(0, 8)
    : [];

  useEffect(() => { setActiveIdx(0); }, [value]);

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
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
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

/* ── Tipos ── */
interface Cliente {
  id: number;
  pubId: string;
  nome: string; cpf: string; curso: string; status: string; data: string;
  nascimento: string; rg: string; orgaoExpedidor: string; nomeMae: string; nomePai: string; observacao: string;
  nacionalidade: string; dataColacao: string; reitor: string;
  instituicao: string; inep: string; endereco: string; bairro: string;
  municipio: string; cep: string; modalidade: string; anoConclusao: string;
  protocolo: string; url: string; docxUrl: string;
  naturalidade: string; cidadeExpedicao: string; dataExpedicao: string;
  registroNumero: string; registroLivro: string; registroFolha: string; registroData: string; registroProcesso: string;
  cursoReconhecimento: string;
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
  return {
    id: r.id, pubId: r.pub_id, nome: r.nome, cpf: r.cpf, curso: r.curso,
    status: r.status, data: r.data, nascimento: r.nascimento, rg: r.rg,
    orgaoExpedidor: r.orgao_expedidor ?? "",
    nomeMae: r.nome_mae, nomePai: r.nome_pai, observacao: r.observacao,
    nacionalidade: r.nacionalidade ?? "",
    dataColacao: r.data_colacao ?? "",
    reitor: r.reitor ?? "",
    instituicao: r.instituicao, inep: r.inep, endereco: r.endereco, bairro: r.bairro,
    municipio: r.municipio, cep: r.cep, modalidade: r.modalidade,
    anoConclusao: r.ano_conclusao, protocolo: r.protocolo, url: r.url,
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
    instituicao: c.instituicao, inep: c.inep, endereco: c.endereco, bairro: c.bairro,
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

type Tab = "clientes" | "novo" | "historico" | "visualizar";
const tabs: { id: Tab; label: string }[] = [
  { id: "clientes",   label: "CLIENTES" },
  { id: "novo",       label: "NOVO" },
  { id: "historico",  label: "HISTÓRICO" },
  { id: "visualizar", label: "VISUALIZAR" },
];

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

function SecaoRegistroEstacio({ form, sf }: { form: CamposRegistro; sf: SetCampo }) {
  return (
    <div className="edit-section">
      <div className="edit-section-title">Expedição e Registro</div>
      <div className="edit-grid">
        <Field label="Cidade/UF da Expedição" value={form.cidadeExpedicao} onChange={sf("cidadeExpedicao")} placeholder="Ribeirão Preto - SP" />
        <Field label="Data de Expedição" value={form.dataExpedicao} onChange={sf("dataExpedicao", maskData)} placeholder="DD/MM/AAAA" />
        <Field label="Nº do Registro" value={form.registroNumero} onChange={sf("registroNumero")} placeholder="27046" />
        <Field label="Livro" value={form.registroLivro} onChange={sf("registroLivro")} placeholder="1" />
        <Field label="Folhas" value={form.registroFolha} onChange={sf("registroFolha")} placeholder="13193" />
        <Field label="Data do Registro" value={form.registroData} onChange={sf("registroData", maskData)} placeholder="DD/MM/AAAA" />
        <Field label="Processo" value={form.registroProcesso} onChange={sf("registroProcesso", up)} placeholder="SRD/6247907-IP/2022" full />
      </div>
    </div>
  );
}

function ModalEditar({ cliente, estacio, onSave, onClose }: { cliente: Cliente; estacio: boolean; onSave: (c: Cliente) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    naturalidade: cliente.naturalidade,
    cidadeExpedicao: cliente.cidadeExpedicao,
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
    orgaoExpedidor: cliente.orgaoExpedidor,
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

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const atualizado: Cliente = {
      ...cliente,
      nome: form.nome,
      nascimento: form.nascimento,
      cpf: form.cpf,
      rg: form.rg,
      orgaoExpedidor: form.orgaoExpedidor,
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
                  <Field label="Órgão Expedidor" value={form.orgaoExpedidor} onChange={sf("orgaoExpedidor", up)} placeholder="SSP/SP" />
                  <Field label="Nacionalidade" value={form.nacionalidade} onChange={sf("nacionalidade", up)} placeholder="BRASILEIRO(A)" />
                  {estacio && <Field label="Naturalidade" value={form.naturalidade} onChange={sf("naturalidade", up)} placeholder="SÃO PAULO" />}
                  <Field label="Nome da Mãe" value={form.nomeMae} onChange={sf("nomeMae", up)} />
                  <Field label="Nome do Pai" value={form.nomePai} onChange={sf("nomePai", up)} />
                  <Field label="Observações" value={form.observacao} onChange={sf("observacao", up)} full />
                </div>
              </div>
              <div className="edit-section">
                <div className="edit-section-title">Dados da Instituição</div>
                <div className="edit-grid">
                  <Field label="Nome da Instituição" value={form.instituicao} onChange={sf("instituicao", up)} full />
                  <Field label="Reitor(a)" value={form.reitor} onChange={sf("reitor", up)} full />
                  <Field label="Código INEP" value={form.inep} onChange={sf("inep")} />
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
                  {estacio && <Field label="Reconhecimento do Curso" value={form.cursoReconhecimento} onChange={sf("cursoReconhecimento")} placeholder="Portaria MEC n° 967, de 01/09/2017, DOU n° 170, Seção 1, Pág. 17, de 04/09/2017." full />}
                  <Field label="Ano de Conclusão" value={form.anoConclusao} onChange={sf("anoConclusao")} />
                  <Field label="Data de Conclusão do Curso" value={form.data} onChange={sf("data", maskData)} placeholder="DD/MM/AAAA" />
                  <Field label="Data da Colação de Grau" value={form.dataColacao} onChange={sf("dataColacao", maskData)} placeholder="DD/MM/AAAA" />
                  <Field label={estacio ? "Protocolo (número do verso)" : "Protocolo"} value={form.protocolo} onChange={sf("protocolo")} full />
                </div>
              </div>
              {estacio && <SecaoRegistroEstacio form={form} sf={sf} />}
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
  nome: "", nascimento: "", cpf: "", rg: "", orgaoExpedidor: "",
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
  instituicao: "CENTRO UNIVERSITÁRIO ESTÁCIO DE RIBEIRÃO PRETO",
  reitor: "JONAS DOS SANTOS COLVARA",
  cidadeExpedicao: "Ribeirão Preto - SP",
  modalidade: "TECNÓLOGO(A)",
};

const CAMPOS_DIPLOMA: [keyof typeof formVazio, string][] = [
  ["instituicao", "Nome da Instituição"], ["reitor", "Reitor(a)"], ["curso", "Curso"],
  ["cursoReconhecimento", "Reconhecimento do Curso"], ["dataPublicacao", "Data de Conclusão"],
  ["dataColacao", "Data da Colação"], ["naturalidade", "Naturalidade"], ["nascimento", "Data de Nascimento"],
  ["rg", "RG"], ["orgaoExpedidor", "Órgão Expedidor"], ["cidadeExpedicao", "Cidade/UF da Expedição"],
  ["dataExpedicao", "Data de Expedição"], ["registroNumero", "Nº do Registro"], ["registroLivro", "Livro"],
  ["registroFolha", "Folhas"], ["registroData", "Data do Registro"], ["registroProcesso", "Processo"],
];

function formDeCliente(c: Cliente): typeof formVazio {
  return {
    nome: c.nome, nascimento: c.nascimento, cpf: c.cpf, rg: c.rg,
    orgaoExpedidor: c.orgaoExpedidor,
    nomeMae: c.nomeMae, nomePai: c.nomePai, observacao: c.observacao,
    nacionalidade: c.nacionalidade || "BRASILEIRO(A)",
    dataColacao: c.dataColacao,
    reitor: c.reitor,
    instituicao: c.instituicao, inep: c.inep, endereco: c.endereco, bairro: c.bairro,
    municipio: c.municipio, cep: c.cep, modalidade: c.modalidade || "BACHAREL",
    curso: c.curso, anoConclusao: c.anoConclusao, dataPublicacao: c.data,
    protocolo: c.protocolo,
    naturalidade: c.naturalidade, cidadeExpedicao: c.cidadeExpedicao, dataExpedicao: c.dataExpedicao,
    registroNumero: c.registroNumero, registroLivro: c.registroLivro, registroFolha: c.registroFolha,
    registroData: c.registroData, registroProcesso: c.registroProcesso,
    cursoReconhecimento: c.cursoReconhecimento,
  };
}

function TabNovo({ clientes, onGerar, onEditar, prefill, grupo }: {
  clientes: Cliente[];
  onGerar: (c: Cliente) => void;
  onEditar: (c: Cliente) => Promise<boolean>;
  prefill?: { nome?: string; cpf?: string } | null;
  grupo?: string;
}) {
  const isEstacio = grupo === "estacio";
  const vazio = isEstacio ? formVazioEstacio : formVazio;
  const [form, setForm] = useState({
    ...vazio,
    nome: prefill?.nome ?? "",
    cpf: prefill?.cpf ? maskCPF(prefill.cpf) : "",
  });
  const [gerado, setGerado] = useState<Cliente | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [templateStatus, setTemplateStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isEstacio) return;
    localStorage.removeItem(TEMPLATE_KEY_LEGADO);
    carregarTemplateEstacio().then(() => setTemplateStatus("ok"), () => setTemplateStatus("erro"));
  }, [isEstacio]);

  function selecionarEdicao(pubId: string) {
    const c = clientes.find(x => x.pubId === pubId) ?? null;
    setEditando(c);
    setErro("");
    setForm(c ? formDeCliente(c) : vazio);
  }

  function cancelarEdicao() {
    setEditando(null);
    setErro("");
    setForm(vazio);
  }

  function confirmarCamposDiploma(): boolean {
    if (!isEstacio) return true;
    const vazios = CAMPOS_DIPLOMA.filter(([k]) => !String(form[k] ?? "").trim()).map(([, rotulo]) => rotulo);
    if (!vazios.length) return true;
    return window.confirm(`Estes campos do diploma estão vazios e ficarão em branco no documento:\n\n• ${vazios.join("\n• ")}\n\nGerar mesmo assim?`);
  }

  async function gerarDiploma(c: Cliente): Promise<Cliente | null> {
    try {
      const { blob, docxUrl } = await publicarDocxEstacio(c);
      setDocxBlob(blob);
      if (!docxUrl) {
        setErro("Diploma gerado, mas o envio do .docx falhou. Salve novamente para publicar.");
        return null;
      }
      return { ...c, docxUrl };
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
    if (!confirmarCamposDiploma()) return;
    setErro("");

    if (editando) {
      const atualizado: Cliente = {
        ...editando,
        ...camposDiploma,
        nome: form.nome, cpf: form.cpf, nascimento: form.nascimento, rg: form.rg,
        orgaoExpedidor: form.orgaoExpedidor,
        nomeMae: form.nomeMae, nomePai: form.nomePai, observacao: form.observacao,
        nacionalidade: form.nacionalidade,
        dataColacao: form.dataColacao,
        reitor: form.reitor,
        instituicao: form.instituicao, inep: form.inep, endereco: form.endereco,
        bairro: form.bairro, municipio: form.municipio, cep: form.cep,
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
      setGerado(comDiploma ?? atualizado);
      return;
    }

    const pubId = await gerarPubId(grupo === "estacio");
    const url = grupo === "estacio"
      ? `https://est-fawn-sigma.vercel.app/diploma/${pubId}`
      : `${window.location.origin}/pub/${pubId}`;

    const dataDisplay = form.dataPublicacao || new Date().toLocaleDateString("pt-BR");
    const protocolo = form.protocolo || Date.now().toString().slice(-13);

    const novo: Cliente = {
      ...camposDiploma,
      id: Date.now(),
      pubId,
      nome: form.nome, cpf: form.cpf,
      curso: form.curso, status: "Publicado",
      data: dataDisplay,
      nascimento: form.nascimento, rg: form.rg,
      orgaoExpedidor: form.orgaoExpedidor,
      nomeMae: form.nomeMae, nomePai: form.nomePai,
      observacao: form.observacao || "ALUNO APROVADO",
      nacionalidade: form.nacionalidade,
      dataColacao: form.dataColacao,
      reitor: form.reitor,
      instituicao: form.instituicao, inep: form.inep,
      endereco: form.endereco, bairro: form.bairro,
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
    setGerado(novoFinal);
  }

  function novaPublicacao() {
    setForm(vazio);
    setGerado(null);
    setDocxBlob(null);
    setEditando(null);
    setErro("");
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
          <button className="btn-primary" onClick={novaPublicacao}>+ Nova publicação</button>
        </div>
      </div>
    </div>
  );

  return (
    <form className="tab-body" onSubmit={gerar}>
      <div className="edit-sections">
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
          </div>
        )}

        {clientes.length > 0 && (
          <div className="edit-section">
            <div className="edit-section-title">Editar publicação existente</div>
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
            {isEstacio && <Field label="Órgão Expedidor" value={form.orgaoExpedidor} onChange={setField("orgaoExpedidor", up)} placeholder="SSP/SP" />}
            {isEstacio && <Field label="Nacionalidade" value={form.nacionalidade} onChange={setField("nacionalidade", up)} placeholder="BRASILEIRO(A)" />}
            {isEstacio && <Field label="Naturalidade" value={form.naturalidade} onChange={setField("naturalidade", up)} placeholder="SÃO PAULO" />}
            <Field label="Nome da Mãe" value={form.nomeMae} onChange={setField("nomeMae", up)} />
            <Field label="Nome do Pai" value={form.nomePai} onChange={setField("nomePai", up)} />
            <Field label="Observações" value={form.observacao} onChange={setField("observacao", up)} full />
          </div>
        </div>
        <div className="edit-section">
          <div className="edit-section-title">Dados da Instituição</div>
          <div className="edit-grid">
            <Field label="Nome da Instituição" value={form.instituicao} onChange={setField("instituicao", up)} full />
            {isEstacio && <Field label="Reitor(a)" value={form.reitor} onChange={setField("reitor", up)} placeholder="Nome do(a) Reitor(a)" full />}
            <Field label="Código INEP" value={form.inep} onChange={setField("inep")} />
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
            {isEstacio && <Field label="Reconhecimento do Curso" value={form.cursoReconhecimento} onChange={setField("cursoReconhecimento")} placeholder="Portaria MEC n° 967, de 01/09/2017, DOU n° 170, Seção 1, Pág. 17, de 04/09/2017." full />}
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
            <Field label="Ano de Conclusão" value={form.anoConclusao} onChange={setField("anoConclusao")} />
            <Field label="Data de Conclusão do Curso" value={form.dataPublicacao} onChange={setField("dataPublicacao", maskData)} placeholder="DD/MM/AAAA" />
            {isEstacio && <Field label="Data da Colação de Grau" value={form.dataColacao} onChange={setField("dataColacao", maskData)} placeholder="DD/MM/AAAA" />}
            <Field label={isEstacio ? "Protocolo (número do verso)" : "Protocolo"} value={form.protocolo} onChange={setField("protocolo")} full placeholder="Deixe em branco para gerar automaticamente" />
          </div>
        </div>
        {isEstacio && <SecaoRegistroEstacio form={form} sf={setField} />}
      </div>
      <div className="edit-footer">
        {erro ? <span style={{ color: "#f87171", fontSize: 13 }}>{erro}</span> : <span />}
        <div className="edit-actions">
          <button type="button" className="btn-sm" onClick={editando ? cancelarEdicao : () => setForm(vazio)}>
            {editando ? "Cancelar edição" : "Limpar"}
          </button>
          <button type="submit" className="btn-primary" disabled={salvando || (isEstacio && templateStatus !== "ok")}>
            {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Gerar Publicação"}
          </button>
        </div>
      </div>
    </form>
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

/* ── Tab HISTÓRICO ── */
function TabHistorico({ clientes }: { clientes: Cliente[] }) {
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
              <PrevRow label="Código do INEP" value={c.inep} />
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
  const { usuario } = useOutletContext<{ usuario: UsuarioLogado | null }>();
  const isAdmin = usuario?.perfil === "Administrador";
  const prefill = (location.state as { nome?: string; cpf?: string } | null) ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const abaUrl = searchParams.get("aba");
  const activeTab: Tab = tabs.some(t => t.id === abaUrl) ? (abaUrl as Tab) : (prefill ? "novo" : "clientes");
  const setActiveTab = (t: Tab) => setSearchParams({ aba: t });
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
  }, [grupo]);

  async function adicionarCliente(c: Cliente) {
    const row = { ...clienteToRow(c), grupo };
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
          {dbLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "var(--fg-muted)", gap: 10 }}>
              <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Carregando...
            </div>
          ) : (
            <>
              {activeTab === "clientes"   && <TabClientes clientes={clientes} isAdmin={isAdmin} estacio={grupo === "estacio"} onNovo={() => setActiveTab("novo")} onEditar={editarComDiploma} onApagar={apagarCliente} onToggleAtivo={toggleAtivo} onToggleAtivoLote={toggleAtivoLote} />}
              {activeTab === "novo"       && <TabNovo clientes={clientes} onGerar={c => { adicionarCliente(c); }} onEditar={editarCliente} prefill={prefill} grupo={grupo} />}
              {activeTab === "historico"  && <TabHistorico clientes={clientes} />}
              {activeTab === "visualizar" && <TabVisualizar clientes={clientes} />}
            </>
          )}
        </div>
      </div>

      {activeTab !== "novo" && !dbLoading && (
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
