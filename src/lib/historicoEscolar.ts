import { supabase } from "./supabase";
import {
  ANO_TOTAL_MODELO, CARGA_TOTAL_MODELO, DISCIPLINAS_T1_MODELO, DISCIPLINAS_T2_MODELO, type Disciplina,
} from "./historicoEscolarModelo";

export type { Disciplina };

export type ModeloHistorico = "simples" | "completo";

export const MODELOS_HISTORICO: readonly { id: ModeloHistorico; rotulo: string; descricao: string }[] = [
  { id: "simples", rotulo: "Simples", descricao: "Termina na linha “Carga Horária Total do Curso”." },
  { id: "completo", rotulo: "Com fechamento", descricao: "Inclui carga cursada, data de emissão, título do trabalho, nota e orientador." },
];

export type DadosHistoricoEscolar = {
  modelo: ModeloHistorico;
  titulo: string;
  assinante: string;
  grau: string;
  curso: string;
  nome: string;
  nacionalidade: string;
  rg: string;
  naturalidade: string;
  uf: string;
  rg_2: string;
  instituicao: string;
  data_emissao: string;
  t1: Disciplina[];
  t2: Disciplina[];
  ano_total: string;
  carga_total: string;
  titulo_tcc: string;
  nota_tcc: string;
  orientador: string;
};

export type FichaAluno = {
  nome: string;
  curso: string;
  modalidade?: string;
  nacionalidade?: string;
  rg?: string;
  orgaoExpedidor?: string;
  naturalidade?: string;
  reitor?: string;
};

export type HistoricoEscolarSalvo = {
  pub_id: string;
  dados: DadosHistoricoEscolar;
  created_at: string;
  updated_at: string;
};

export const INSTITUICAO_PADRAO = "UNIVERSIDADE ESTÁCIO DE SÁ - ESTÁCIO";
export type Assinante = { nome: string; rg: string; imagem: string };

// As duas imagens usam o mesmo quadro (398 x 286) do modelo, então a folha e o Word só trocam a imagem.
export const ASSINANTES: readonly Assinante[] = [
  { nome: "Prof. Jonas dos Santos Colvara", rg: "053971315", imagem: "/templates/assinatura-jonas.png" },
  { nome: "Prof. Flávio Murilo Oliveira de Gouvêa", rg: "35.087.826-2", imagem: "/templates/assinatura-flavio.png" },
];
export const ASSINANTE_PADRAO = ASSINANTES[0].nome;

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);

export function capitalizar(texto: string): string {
  return texto.trim().toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

const PREFIXO_PROFESSOR = /^(?:prof(?:essor)?a?\.?\s+)+/i;

function chaveAssinante(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(PREFIXO_PROFESSOR, "").trim();
}

export function assinanteDe(nome: string): Assinante | undefined {
  const chave = chaveAssinante(nome);
  return chave ? ASSINANTES.find(a => chaveAssinante(a.nome) === chave) : undefined;
}

export function avisosDoHistorico(dados: DadosHistoricoEscolar): string[] {
  const avisos: string[] = [];
  if (/\bprof(?:essor)?a?\.?\s+prof/i.test(dados.assinante)) {
    avisos.push("A assinatura repete “Prof.”. Escolha um dos assinantes da lista.");
  }
  if (!assinanteDe(dados.assinante)) {
    avisos.push("Este assinante não tem assinatura cadastrada: o documento sai sem a rubrica. Escolha um assinante da lista.");
  }
  return avisos;
}

function hojeBR(): string {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function grauDaModalidade(modalidade: string): string {
  if (/bachar/i.test(modalidade)) return "Bacharelado";
  if (/licenc/i.test(modalidade)) return "Licenciatura";
  if (/tecn[oó]log/i.test(modalidade)) return "Tecnólogo";
  return "";
}

function nomeDoCurso(curso: string): string {
  const limpo = curso.trim()
    .replace(/^CURSO SUPERIOR DE TECNOLOGIA EM\s+/i, "")
    .replace(/^CURSO DE\s+/i, "")
    .replace(/^BACHARELADO EM\s+/i, "")
    .replace(/^LICENCIATURA EM\s+/i, "");
  return capitalizar(limpo);
}

function separarNaturalidade(valor: string): { cidade: string; uf: string } {
  const m = /^(.*?)\s*[\/\-–,]\s*([A-Za-z]{2})$/.exec(valor.trim());
  if (m) return { cidade: capitalizar(m[1]), uf: m[2].toUpperCase() };
  return { cidade: capitalizar(valor), uf: "" };
}

const clonar = (lista: Disciplina[]): Disciplina[] => lista.map(d => ({ ...d }));

export function disciplinasDoModelo(): { t1: Disciplina[]; t2: Disciplina[]; ano_total: string; carga_total: string } {
  return {
    t1: clonar(DISCIPLINAS_T1_MODELO), t2: clonar(DISCIPLINAS_T2_MODELO),
    ano_total: ANO_TOTAL_MODELO, carga_total: CARGA_TOTAL_MODELO,
  };
}

// Começa do modelo (mesmas disciplinas e estrutura) e troca só os dados de identificação do aluno.
export function dadosIniciais(ficha: FichaAluno): DadosHistoricoEscolar {
  const nat = separarNaturalidade(ficha.naturalidade ?? "");
  const rg = [ficha.rg ?? "", (ficha.orgaoExpedidor ?? "").replace(/\//g, " ")].map(s => s.trim()).filter(Boolean).join(" ");
  const assinante = assinanteDe(ficha.reitor ?? "") ?? ASSINANTES[0];
  return comCargaCalculada({
    modelo: "completo",
    titulo: "HISTÓRICO",
    assinante: assinante.nome,
    grau: grauDaModalidade(ficha.modalidade ?? ""),
    curso: nomeDoCurso(ficha.curso),
    nome: capitalizar(ficha.nome),
    nacionalidade: (ficha.nacionalidade ?? "").trim() || "BRASILEIRO(A)",
    rg,
    naturalidade: nat.cidade,
    uf: nat.uf,
    rg_2: assinante.rg,
    instituicao: INSTITUICAO_PADRAO,
    data_emissao: hojeBR(),
    ...disciplinasDoModelo(),
    titulo_tcc: "",
    nota_tcc: notaDoTcc(DISCIPLINAS_T2_MODELO),
    orientador: "",
  });
}

// O modelo já imprime o rótulo e as aspas do título; sem isso o texto sairia duplicado.
export function limparTituloTcc(texto: string): string {
  return texto
    .replace(/^\s*t[ií]tulo(?:\s+d[aoe]s?\s+[^:]*?)?\s*:\s*/i, "")
    .replace(/^[“"\s]+|[”"\s]+$/g, "");
}

function notaDoTcc(t2: Disciplina[]): string {
  return t2.find(d => /conclus[ãa]o de curso/i.test(d.disciplina))?.media ?? "";
}

// Registros salvos antes de um campo existir continuam abrindo: o que falta vem dos valores iniciais.
export function completarDados(salvo: Partial<DadosHistoricoEscolar>, ficha: FichaAluno): DadosHistoricoEscolar {
  const base = dadosIniciais(ficha);
  const linhas = (v: unknown, padrao: Disciplina[]): Disciplina[] =>
    Array.isArray(v) ? v.map(l => ({
      sem: String(l?.sem ?? ""), ano: String(l?.ano ?? ""), disciplina: String(l?.disciplina ?? ""),
      media: String(l?.media ?? ""), cm: String(l?.cm ?? ""), situacao: String(l?.situacao ?? ""),
    })) : padrao;
  const texto = (v: unknown, padrao: string) => (typeof v === "string" ? v : padrao);
  // Registros salvos antes da escolha de modelo seguem no formato que tinham: o simples.
  const modelo: ModeloHistorico = salvo.modelo === "completo" ? "completo" : "simples";
  return comCargaCalculada({
    modelo,
    titulo: texto(salvo.titulo, base.titulo),
    assinante: texto(salvo.assinante, base.assinante),
    grau: texto(salvo.grau, base.grau),
    curso: texto(salvo.curso, base.curso),
    nome: texto(salvo.nome, base.nome),
    nacionalidade: texto(salvo.nacionalidade, base.nacionalidade),
    rg: texto(salvo.rg, base.rg),
    naturalidade: texto(salvo.naturalidade, base.naturalidade),
    uf: texto(salvo.uf, base.uf),
    rg_2: texto(salvo.rg_2, base.rg_2),
    instituicao: texto(salvo.instituicao, base.instituicao),
    data_emissao: texto(salvo.data_emissao, base.data_emissao),
    t1: linhas(salvo.t1, base.t1),
    t2: linhas(salvo.t2, base.t2),
    ano_total: texto(salvo.ano_total, base.ano_total),
    carga_total: base.carga_total,
    titulo_tcc: limparTituloTcc(texto(salvo.titulo_tcc, base.titulo_tcc)),
    nota_tcc: texto(salvo.nota_tcc, base.nota_tcc),
    orientador: texto(salvo.orientador, base.orientador),
  });
}

// O que vale para a turma toda (modelo, curso, instituição, assinatura, disciplinas, fechamento).
// Ficam de fora os dados de identificação, a data de emissão e o título do trabalho, que são de cada aluno.
export function camposDoModelo(o: DadosHistoricoEscolar): Partial<DadosHistoricoEscolar> {
  return {
    modelo: o.modelo, titulo: o.titulo, assinante: o.assinante, grau: o.grau, curso: o.curso,
    rg_2: o.rg_2, instituicao: o.instituicao, ano_total: o.ano_total,
    nota_tcc: o.nota_tcc, orientador: o.orientador,
    t1: o.t1.map(l => ({ ...l })), t2: o.t2.map(l => ({ ...l })),
  };
}

export function somaCargaHoraria(dados: DadosHistoricoEscolar): number {
  return [...dados.t1, ...dados.t2].reduce((acc, d) => {
    const n = Number(String(d.cm).replace(/\D/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function comCargaCalculada(dados: DadosHistoricoEscolar): DadosHistoricoEscolar {
  return { ...dados, carga_total: formatarHoras(somaCargaHoraria(dados)) };
}

export function formatarHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR")} horas`;
}

export function nomeArquivo(dados: DadosHistoricoEscolar): string {
  const nome = dados.nome.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ");
  return `Histórico escolar${nome ? ` - ${nome}` : ""}`;
}

/* ── Persistência ── */

export async function listarHistoricosEscolares(grupo: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabase
      .from("historicos_escolares")
      .select("pub_id,updated_at")
      .eq("grupo", grupo)
      .range(inicio, inicio + pagina - 1);
    if (error) throw error;
    for (const r of data ?? []) mapa.set(r.pub_id as string, r.updated_at as string);
    if (!data || data.length < pagina) break;
  }
  return mapa;
}

export async function carregarHistoricoEscolar(pubId: string): Promise<HistoricoEscolarSalvo | null> {
  const { data, error } = await supabase
    .from("historicos_escolares")
    .select("pub_id,dados,created_at,updated_at")
    .eq("pub_id", pubId)
    .maybeSingle();
  if (error) throw error;
  return (data as HistoricoEscolarSalvo | null) ?? null;
}

export async function salvarHistoricoEscolar(
  pubId: string, grupo: string, dados: DadosHistoricoEscolar,
): Promise<HistoricoEscolarSalvo> {
  const { data, error } = await supabase
    .from("historicos_escolares")
    .upsert({ pub_id: pubId, grupo, dados }, { onConflict: "pub_id" })
    .select("pub_id,dados,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as HistoricoEscolarSalvo;
}

// Copia o histórico de um registro para outro (novo processo). Sem histórico na origem, não faz nada.
export async function duplicarHistoricoEscolar(
  origemPubId: string, destinoPubId: string, grupo: string, ficha: FichaAluno, mesmoCurso: boolean,
): Promise<boolean> {
  const origem = await carregarHistoricoEscolar(origemPubId);
  if (!origem) return false;
  const novo = dadosIniciais(ficha);
  const copia = camposDoModelo(completarDados(origem.dados, ficha));
  const dados = comCargaCalculada({
    ...novo,
    ...copia,
    ...(mesmoCurso ? {} : { curso: novo.curso, grau: novo.grau }),
  });
  await salvarHistoricoEscolar(destinoPubId, grupo, dados);
  return true;
}

export async function excluirHistoricoEscolar(pubId: string): Promise<void> {
  const { data, error } = await supabase.from("historicos_escolares").delete().eq("pub_id", pubId).select("pub_id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nenhuma linha excluída: confirme se a migração 021_excluir_historicos_escolares.sql foi aplicada.");
}

/* ── Word (.docx) a partir do modelo ── */

const TEMPLATES: Record<ModeloHistorico, string> = {
  simples: "/templates/historico-estacio.docx",
  completo: "/templates/historico-estacio-completo.docx",
};
const templateCache = new Map<ModeloHistorico, Promise<ArrayBuffer>>();

function carregarTemplate(modelo: ModeloHistorico): Promise<ArrayBuffer> {
  let cache = templateCache.get(modelo);
  if (!cache) {
    cache = fetch(TEMPLATES[modelo]).then(async r => {
      if (!r.ok) throw new Error(`Modelo indisponível (HTTP ${r.status})`);
      const buf = await r.arrayBuffer();
      const assinatura = new Uint8Array(buf, 0, 2);
      if (assinatura[0] !== 0x50 || assinatura[1] !== 0x4b) throw new Error("Modelo recebido não é um .docx");
      return buf;
    }).catch(e => { templateCache.delete(modelo); throw e; });
    templateCache.set(modelo, cache);
  }
  return cache;
}

const MIDIA_ASSINATURA = "word/media/image2.png";
const PNG_TRANSPARENTE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function imagemDaAssinatura(nomeAssinante: string): Promise<ArrayBuffer> {
  const assinante = assinanteDe(nomeAssinante);
  if (!assinante) {
    const bin = atob(PNG_TRANSPARENTE);
    return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
  }
  const r = await fetch(assinante.imagem);
  if (!r.ok) throw new Error(`Assinatura indisponível (HTTP ${r.status})`);
  return r.arrayBuffer();
}

export async function gerarDocxHistorico(dados: DadosHistoricoEscolar): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }, template] = await Promise.all([
    import("pizzip"), import("docxtemplater"), carregarTemplate(dados.modelo),
  ]);
  const zip = new PizZip(template);
  zip.file(MIDIA_ASSINATURA, await imagemDaAssinatura(dados.assinante));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(dados);
  const saida = doc.getZip().generate({ type: "arraybuffer" });
  return new Blob([saida], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
