import { supabase } from "./supabase";

export type EventoHistorico =
  "criado" | "editado" | "diploma" | "ativado" | "desativado" | "pagamento" | "acesso" | "excluido" | "nota" | "historico";

export type Alteracao = { campo: string; de: unknown; para: unknown };

export type HistoricoEvento = {
  id: string;
  pub_id: string;
  grupo: string;
  evento: EventoHistorico;
  descricao: string;
  alteracoes: Alteracao[];
  nome: string;
  cpf: string;
  autor_nome: string;
  created_at: string;
};

const PAGINA = 1000;
const MAX_PAGINAS = 10;

// Eventos são gravados por trigger no banco (migração 019); aqui só se lê e se adicionam anotações.
export async function listarHistorico(grupo: string): Promise<HistoricoEvento[]> {
  const todos: HistoricoEvento[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await supabase
      .from("historico_publicacoes")
      .select("id,pub_id,grupo,evento,descricao,alteracoes,nome,cpf,autor_nome,created_at")
      .eq("grupo", grupo)
      .order("created_at", { ascending: false })
      .range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as HistoricoEvento[];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todos;
}

export async function adicionarNota(
  reg: { pubId: string; grupo: string; nome: string; cpf: string },
  texto: string,
): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Sessão expirada.");
  const { error } = await supabase.from("historico_publicacoes").insert({
    pub_id: reg.pubId, grupo: reg.grupo, evento: "nota",
    descricao: texto.trim(), nome: reg.nome, cpf: reg.cpf, autor_id: uid,
  });
  if (error) throw error;
}

const ROTULOS: Record<string, string> = {
  nome: "Nome do aluno", cpf: "CPF", curso: "Curso", status: "Status", data: "Data da publicação",
  nascimento: "Data de nascimento", rg: "RG", orgao_expedidor: "Órgão expedidor",
  nome_mae: "Nome da mãe", nome_pai: "Nome do pai", observacao: "Observações",
  nacionalidade: "Nacionalidade", data_colacao: "Data da colação", reitor: "Reitor(a)",
  instituicao: "Instituição", inep: "Dados e-MEC", endereco: "Endereço", bairro: "Bairro",
  municipio: "Município", cep: "CEP", modalidade: "Modalidade", ano_conclusao: "Ano de conclusão",
  protocolo: "Protocolo", url: "Link da publicação", docx_url: "Diploma (.docx)",
  naturalidade: "Naturalidade", cidade_expedicao: "Cidade de expedição", data_expedicao: "Data de expedição",
  registro_numero: "Nº de registro", registro_livro: "Livro", registro_folha: "Folha",
  registro_data: "Data do registro", registro_processo: "Processo", curso_reconhecimento: "Reconhecimento do curso",
  pagamento_status: "Pagamento", ativo: "QR Code", grupo: "Grupo",
  he_titulo: "Título do histórico", he_assinante: "Assinatura", he_grau: "Grau", he_curso: "Curso (histórico)",
  he_nome: "Nome (histórico)", he_nacionalidade: "Nacionalidade (histórico)", he_rg: "RG (histórico)",
  he_naturalidade: "Naturalidade (histórico)", he_uf: "UF", he_rg_2: "RG (2º documento)",
  he_instituicao: "Instituição (histórico)", he_data_emissao: "Data de emissão",
  he_t1: "Disciplinas (tabela 1)", he_t2: "Disciplinas (tabela 2)",
  he_ano_total: "Ano do total", he_carga_total: "Carga horária total",
  he_modelo: "Modelo do histórico",
  he_titulo_tcc: "Título do trabalho de conclusão", he_nota_tcc: "Nota do trabalho", he_orientador: "Orientador (a)",
};

export function rotuloCampo(campo: string): string {
  return ROTULOS[campo] ?? campo.replace(/_/g, " ");
}
