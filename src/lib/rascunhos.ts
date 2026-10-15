import { supabase } from "./supabase";

export type RascunhoDados = {
  form: Record<string, string>;
  emec?: unknown;
  emecManual?: string[];
  editandoId?: string;
};

export type Rascunho = {
  id: string;
  grupo: string;
  nome: string;
  cpf: string;
  curso: string;
  dados: RascunhoDados;
  progresso: number;
  faltando: string[];
  edicao: boolean;
  autor_nome: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RascunhoEntrada = Pick<Rascunho, "grupo" | "nome" | "cpf" | "curso" | "dados" | "progresso" | "faltando" | "edicao" | "autor_nome">;

// Rascunhos são privados. O banco filtra por dono (RLS, migração 018); aqui o filtro
// repete a regra para que nada de outro usuário apareça mesmo que a política esteja desatualizada.
async function usuarioAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function contarRascunhos(): Promise<number> {
  const uid = await usuarioAtual();
  if (!uid) return 0;
  const { count } = await supabase.from("rascunhos").select("*", { count: "exact", head: true }).eq("created_by", uid);
  return count ?? 0;
}

export async function listarRascunhos(): Promise<Rascunho[]> {
  const uid = await usuarioAtual();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("rascunhos").select("*").eq("created_by", uid).order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as Rascunho[];
}

export async function carregarRascunho(id: string): Promise<Rascunho | null> {
  const uid = await usuarioAtual();
  if (!uid) return null;
  const { data } = await supabase.from("rascunhos").select("*").eq("id", id).eq("created_by", uid).maybeSingle();
  return (data as Rascunho | null) ?? null;
}

// Cria (sem id) ou atualiza o rascunho e devolve o id e o horário gravado.
export async function salvarRascunho(entrada: RascunhoEntrada, id?: string): Promise<{ id: string; updated_at: string }> {
  const uid = await usuarioAtual();
  if (!uid) throw new Error("Sessão expirada.");
  const agora = new Date().toISOString();
  if (id) {
    const { data, error } = await supabase
      .from("rascunhos")
      .update({ ...entrada, updated_at: agora })
      .eq("id", id)
      .eq("created_by", uid)
      .select("id,updated_at")
      .maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string; updated_at: string };
  }
  const { data, error } = await supabase
    .from("rascunhos")
    .insert({ ...entrada, created_by: uid, updated_at: agora })
    .select("id,updated_at")
    .single();
  if (error) throw error;
  return data as { id: string; updated_at: string };
}

export async function apagarRascunho(id: string): Promise<boolean> {
  const uid = await usuarioAtual();
  if (!uid) return false;
  const { error } = await supabase.from("rascunhos").delete().eq("id", id).eq("created_by", uid);
  return !error;
}

// Chamado ao sair da conta: nada do formulário em andamento pode sobrar para o próximo usuário.
export function limparRascunhosLocais() {
  try {
    Object.keys(sessionStorage).filter(k => k.startsWith("pub-rascunho-")).forEach(k => sessionStorage.removeItem(k));
  } catch { /* storage indisponível */ }
}
