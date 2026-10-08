import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Perfil = "Administrador" | "Operador" | "Suporte" | "Visualizador" | null;
export type UsuarioLogado = { nome: string; email: string; perfil: Perfil };

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Admin-mestre entra com e-mail real; usuários gerenciados entram com <matricula>@emec.app
export async function carregarUsuarioLogado(user: User): Promise<UsuarioLogado> {
  const email = user.email ?? "";
  const { data } = await supabase
    .from("usuarios")
    .select("nome,perfil")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const mestre = !email.endsWith("@emec.app");
  return {
    nome: data?.nome || user.user_metadata?.nome || email.split("@")[0] || "Usuário",
    email,
    perfil: mestre ? "Administrador" : ((data?.perfil as Perfil) ?? null),
  };
}
