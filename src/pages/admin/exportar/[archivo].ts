import type { APIRoute } from 'astro';
import { env } from '../../../lib/entorno';
import { exportarPedidos, exportarStock } from '../../../lib/panel';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.usuario) return new Response('No autorizado', { status: 403 });
  const generadores: Record<string, () => Promise<string>> = {
    'pedidos.csv': () => exportarPedidos(env.DB),
    'stock.csv': () => exportarStock(env.DB),
  };
  const generar = generadores[params.archivo ?? ''];
  if (!generar) return new Response('No encontrado', { status: 404 });
  return new Response(await generar(), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="midam-${params.archivo}"` },
  });
};
