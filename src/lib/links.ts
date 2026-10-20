import { supabase } from "./supabase";

// Encurtador interno: tabela `links` (migração 023) + rota pública /g/<apelido> (api/go.ts).

export const SLUG_RE = /^[A-Za-z0-9_-]{3,40}$/;

// Sem letras ambíguas (l, I, 0, O, 1) para o código ser fácil de digitar
const ALFABETO = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function gerarSlug(tamanho = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join("");
}

export function destinoValido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Domínios que servem o mesmo sistema e o mesmo banco (projetos e-mec.com e mapy no Vercel).
 * Os destinos (/r/<id>) dos alunos ficam num deles; a troca em lote alterna entre os três como rota de fuga.
 */
export const BASES_DESTINO = ["https://emec.br.com", "https://e-meccom.vercel.app", "https://mapy-one.vercel.app"];

export function origemDe(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}

/**
 * Troca só o domínio do destino por `base`, mantendo caminho, query e hash (/r/<id>).
 * Devolve null se o domínio atual não for um de BASES_DESTINO (destinos de outros sites não são tocados).
 */
export function trocarOrigem(target: string, base: string): string | null {
  try {
    const u = new URL(target);
    if (!BASES_DESTINO.includes(u.origin)) return null;
    return new URL(u.pathname + u.search + u.hash, base).toString();
  } catch {
    return null;
  }
}

/**
 * Remove o BOM (U+FEFF), espaços de largura zero e espaços nas pontas. Eles entram por valores colados
 * em variáveis de ambiente ou campos e, dentro de um QR, fazem o leitor não reconhecer o link.
 */
export function limparTexto(v: string): string {
  return v.replace(/[​-‍﻿]/g, "").trim();
}

/** Domínio vindo de variável de ambiente: sem caracteres invisíveis, sem espaços e sem barra no fim. */
export function limparBase(v: string | undefined): string {
  return limparTexto(v ?? "").replace(/\/+$/, "");
}

/**
 * Domínio que vai DENTRO do QR. Defina VITE_SHORT_BASE_URL com o domínio mais estável
 * (ex.: https://e-meccom.vercel.app); sem ela, usa o domínio em que o sistema está aberto.
 */
export function baseLinkCurto(): string {
  return limparBase(import.meta.env.VITE_SHORT_BASE_URL as string | undefined) || window.location.origin;
}

export const linkCurtoUrl = (slug: string) => `${baseLinkCurto()}/g/${slug}`;

/**
 * Cria o link e devolve o apelido. Sem `apelido`, gera um código aleatório e tenta de novo se ele já existir.
 * Lança Error com mensagem em português.
 */
export async function criarLinkCurto(target: string, apelido = ""): Promise<string> {
  const alvo = limparTexto(target);
  const { data: { user } } = await supabase.auth.getUser();
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = apelido || gerarSlug();
    const { error } = await supabase.from("links").insert({ slug, target: alvo, created_by: user?.id ?? null });
    if (!error) return slug;
    if (error.code !== "23505") throw new Error("Erro ao criar o link: " + error.message);
    if (apelido) throw new Error("Esse apelido já está em uso.");
  }
  throw new Error("Não consegui gerar um código livre. Tente de novo.");
}

/** Procura um link já criado cujo destino termina com `sufixo` (ex.: "/r/<pubId>"), para não duplicar. */
export async function acharLinkPorFinalDoDestino(sufixo: string): Promise<string | null> {
  const { data } = await supabase.from("links").select("slug").like("target", `%${sufixo}`).limit(1);
  return data && data.length > 0 ? (data[0] as { slug: string }).slug : null;
}

/** Remove um link criado por engano (ex.: a publicação não chegou a ser salva). */
export async function removerLinkCurto(slug: string): Promise<void> {
  const { error } = await supabase.from("links").delete().eq("slug", slug);
  if (error) console.error("[link-curto/remover]", error);
}
