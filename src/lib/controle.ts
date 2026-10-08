import { supabase } from "./supabase";

type Pessoa = { nome: string; cpf: string | null };

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const normNome = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

// Mesma pessoa: compara CPF quando os dois têm; senão compara o nome.
export function mesmaPessoa(a: Pessoa, b: Pessoa): boolean {
  const ca = digitos(a.cpf), cb = digitos(b.cpf);
  if (ca.length === 11 && cb.length === 11) return ca === cb;
  return normNome(a.nome) !== "" && normNome(a.nome) === normNome(b.nome);
}

// Registra no Controle (clientes) como Concluído quem gerou publicação.
export async function marcarConcluido(nome: string, cpf: string | null) {
  const pessoa = { nome, cpf };
  const { data } = await supabase.from("clientes").select("id,nome,cpf,controle_status");
  const existente = (data ?? []).find(c => mesmaPessoa(c, pessoa));
  if (existente) {
    if (existente.controle_status !== "Concluído")
      await supabase.from("clientes").update({ controle_status: "Concluído" }).eq("id", existente.id);
    return;
  }
  await supabase.from("clientes").insert({ nome: nome.trim(), cpf: cpf || null, controle_status: "Concluído" });
}

// Garante que toda publicação existente esteja no Controle como Concluído.
// Retorna os ids de clientes que possuem publicação.
let emAndamento: Promise<Set<string>> | null = null;
export function sincronizarPublicacoes(): Promise<Set<string>> {
  if (!emAndamento) {
    emAndamento = executarSync().finally(() => { emAndamento = null; });
  }
  return emAndamento;
}

async function executarSync(): Promise<Set<string>> {
  const [{ data: pubs }, { data: clis }] = await Promise.all([
    supabase.from("publicacoes").select("nome,cpf,created_at").order("created_at", { ascending: true }),
    supabase.from("clientes").select("id,nome,cpf,controle_status"),
  ]);
  const clientes = [...(clis ?? [])];
  const comPublicacao = new Set<string>();
  const novos: { nome: string; cpf: string | null; controle_status: string; created_at: string }[] = [];

  for (const p of pubs ?? []) {
    if (!normNome(p.nome)) continue;
    const alvo = clientes.find(c => mesmaPessoa(c, p));
    if (alvo) {
      comPublicacao.add(alvo.id);
      continue;
    }
    if (novos.some(n => mesmaPessoa(n, p))) continue;
    novos.push({ nome: p.nome, cpf: p.cpf || null, controle_status: "Concluído", created_at: p.created_at });
  }

  const pendentes = clientes.filter(c => comPublicacao.has(c.id) && c.controle_status !== "Concluído");
  await Promise.all(pendentes.map(c => supabase.from("clientes").update({ controle_status: "Concluído" }).eq("id", c.id)));

  if (novos.length) {
    const { data: criados } = await supabase.from("clientes").insert(novos).select("id");
    (criados ?? []).forEach(c => comPublicacao.add(c.id));
  }
  return comPublicacao;
}
