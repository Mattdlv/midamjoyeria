import type { APIRoute } from 'astro';
import { env } from '../../lib/entorno';
import { leerStock } from '../../lib/pedidos';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const slugs = (url.searchParams.get('slugs') ?? '').split(',').filter((s) => /^[a-z0-9-]{1,120}$/.test(s)).slice(0, 40);
  const stock = slugs.length ? await leerStock(env.DB, slugs) : {};
  return new Response(JSON.stringify(stock), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
