export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { token_hash } = await req.json();
  if (!token_hash) return new Response(JSON.stringify({ ok: false }), { status: 400 });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/usuarios?token_hash=eq.${encodeURIComponent(token_hash)}&status=eq.Ativo&select=matricula,email`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0)
    return new Response(JSON.stringify({ ok: false }), { status: 200 });

  const { matricula } = rows[0];
  return new Response(
    JSON.stringify({ ok: true, matricula, authEmail: `${matricula}@emec.app` }),
    { status: 200 },
  );
}
