export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Variáveis de ambiente não configuradas no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { auth_user_id, newPassword } = await req.json();

  if (!auth_user_id || !newPassword)
    return new Response(
      JSON.stringify({ error: "Campos obrigatórios ausentes" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${auth_user_id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({ password: newPassword }),
  });

  if (!res.ok) {
    const body = await res.json();
    return new Response(
      JSON.stringify({ error: body.message ?? "Erro ao resetar senha" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
