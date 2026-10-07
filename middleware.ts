export const config = {
  matcher: [
    '/acesso',
    '/dashboard',
    '/clientes',
    '/clientes/:path*',
    '/qrcodes',
    '/qrcodes/:path*',
    '/pendentes',
    '/usuarios',
    '/configuracoes',
  ],
};

export default function middleware(request: Request): Response | undefined {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim();

  const allowed = (process.env.ALLOWED_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Se ALLOWED_IPS não estiver configurado, libera (para não travar o dev)
  if (allowed.length === 0) return undefined;

  if (!allowed.includes(ip)) {
    return Response.redirect('https://emec.mec.gov.br/', 302);
  }

  // IP autorizado — continua normalmente
  return undefined;
}
