export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Verifica autenticação: apenas usuários autenticados podem criar
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Valida o token do chamador
  const check = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
  });
  if (!check.ok) return new Response("Unauthorized", { status: 401 });

  const { nome, email, perfil, matricula, password } = await req.json();

  if (!nome || !matricula || !password)
    return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), { status: 400 });

  // Cria o usuário no Supabase Auth com email derivado da matrícula
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
    return new Response(JSON.stringify({ error: body.message ?? "Erro ao criar usuário" }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, auth_user_id: body.id }), { status: 200 });
}
