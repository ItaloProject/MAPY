import { exigirAdmin } from "./_admin";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const negado = await exigirAdmin(req);
  if (negado) return negado;

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Variáveis de ambiente não configuradas no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { nome, email, perfil, matricula, password } = await req.json();

  if (!nome || !matricula || !password)
    return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });

  const authEmail = `${matricula}@emec.app`;

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { nome, perfil, matricula },
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: body.message ?? "Erro ao criar usuário" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, auth_user_id: body.id }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
