import type { APIRoute } from 'astro';
import { env } from '../../lib/entorno';
import { cotizar } from '../../lib/pedidos';

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Precios y descuento actuales de una bolsa. Solo informa: el pedido vuelve a calcular todo al crearse.
export const POST: APIRoute = async ({ request }) => {
  let cuerpo: { items?: unknown; codigo?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return json({ codigo: 'invalido' }, 400);
  }
  const items = (Array.isArray(cuerpo.items) ? cuerpo.items : []).slice(0, 20).flatMap((i) => {
    const { slug, cantidad } = (i ?? {}) as { slug?: unknown; cantidad?: unknown };
    return typeof slug === 'string' && /^[a-z0-9-]{1,120}$/.test(slug) && Number.isInteger(cantidad) && (cantidad as number) > 0 && (cantidad as number) <= 50 ? [{ slug, cantidad: cantidad as number }] : [];
  });
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo.slice(0, 20) : null;
  return json(await cotizar(env.DB, items, codigo));
};
