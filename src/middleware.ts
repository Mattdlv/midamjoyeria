import { defineMiddleware } from 'astro:middleware';
import { getSecret } from 'astro:env/server';
import { COOKIE_SESION, autorizar, esRutaIngreso, esRutaPanel } from './lib/acceso';

// Las páginas públicas salen de la CDN. Un cambio en el panel se ve en hasta un minuto; el stock real y el precio final
// se consultan aparte, así que un dato viejo en pantalla no permite vender de más ni cobrar otro precio.
const CACHE_PUBLICA = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const esPublicaCacheable = (ruta: string) => !ruta.startsWith('/api/') && !/^\/pedido\/./.test(ruta);

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered) return next();
  if (!esRutaPanel(ctx.url.pathname)) {
    const r = await next();
    if (ctx.request.method === 'GET' && r.status === 200 && !r.headers.has('Cache-Control') && esPublicaCacheable(ctx.url.pathname)) r.headers.set('Cache-Control', CACHE_PUBLICA);
    return r;
  }

  const usuario = await autorizar(ctx.cookies.get(COOKIE_SESION)?.value, ctx.url, {
    secreto: getSecret('SESION_SECRETO'),
    usuarios: getSecret('ADMIN_USUARIOS'),
    devEmail: getSecret('ADMIN_DEV_EMAIL'),
  });

  const privada = (r: Response) => {
    r.headers.set('Cache-Control', 'no-store');
    r.headers.set('X-Robots-Tag', 'noindex');
    r.headers.set('X-Frame-Options', 'DENY');
    r.headers.set('Referrer-Policy', 'no-referrer');
    return r;
  };

  if (!usuario && !esRutaIngreso(ctx.url.pathname)) {
    if (ctx.request.method === 'GET') return privada(new Response(null, { status: 303, headers: { Location: '/admin/ingresar' } }));
    return privada(new Response('No autorizado', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  }

  ctx.locals.usuario = usuario ?? undefined;
  return privada(await next());
});
