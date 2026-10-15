// Rota pública /g/:slug (ligada em vercel.json): redireciona para o destino do link.
// Usa a service role para ler o destino e somar o clique, sem expor a tabela `links` ao público.

export const config = { runtime: "edge" };

const SLUG_RE = /^[A-Za-z0-9_-]{3,40}$/;

export default async function handler(req: Request): Promise<Response> {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) return new Response("Link não encontrado.", { status: 404 });

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceKey) return new Response("Encurtador não configurado no servidor.", { status: 500 });

  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/resolver_link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({ p_slug: slug }),
  });
  if (!r.ok) return new Response("Erro ao consultar o link.", { status: 502 });

  const target = (await r.json()) as string | null;
  if (!target) return new Response("Link não encontrado.", { status: 404 });

  // Sem cache: cada leitura do QR precisa passar aqui para contar o clique e pegar o destino atual.
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
