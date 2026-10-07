export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Valida token do chamador
  const check = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
  });
  if (!check.ok) return new Response("Unauthorized", { status: 401 });

  const { auth_user_id, newPassword } = await req.json();

  if (!auth_user_id || !newPassword)
    return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), { status: 400 });

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
    return new Response(JSON.stringify({ error: body.message ?? "Erro ao resetar senha" }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
