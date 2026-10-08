// Auxiliar das rotas /api que exigem administrador (arquivos com "_" não viram rota na Vercel).
// Mantém a mesma regra do banco (supabase/migrations/010_usuarios_rls.sql, função is_admin).

const ADMIN_MESTRE = "italo.fontes2026@gmail.com";

const json = (corpo: unknown, status: number) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Retorna uma Response de erro se quem chamou não for administrador ativo; null se estiver autorizado. */
export async function exigirAdmin(req: Request): Promise<Response | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  const url     = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !service) return json({ error: "Variáveis de ambiente não configuradas no servidor." }, 500);

  // 1) O token precisa ser uma sessão válida do Supabase
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey || service } });
  if (!r.ok) return json({ error: "Unauthorized" }, 401);
  const user = (await r.json()) as { id?: string; email?: string };
  if (!user.id) return json({ error: "Unauthorized" }, 401);
  const email = (user.email ?? "").toLowerCase();

  if (email === ADMIN_MESTRE) return null;

  // 2) Precisa ser Administrador ativo na tabela usuarios
  const q = await fetch(`${url}/rest/v1/usuarios?perfil=eq.Administrador&status=eq.Ativo&select=auth_user_id,email`, {
    headers: { Authorization: `Bearer ${service}`, apikey: service },
  });
  const admins = (await q.json()) as { auth_user_id: string | null; email: string | null }[];
  const ok = Array.isArray(admins) && admins.some(a =>
    a.auth_user_id === user.id || (!a.auth_user_id && !!a.email && a.email.toLowerCase() === email));
  return ok ? null : json({ error: "Forbidden" }, 403);
}
