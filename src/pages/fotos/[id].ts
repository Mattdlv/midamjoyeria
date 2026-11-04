import type { APIRoute } from 'astro';
import { env } from '../../lib/entorno';

// Una foto nunca cambia: reemplazarla crea otra con otro id. Por eso se puede guardar para siempre en la CDN.
export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response('No encontrada', { status: 404 });
  const foto = await env.DB.prepare('SELECT tipo, datos FROM imagen WHERE id = ?').bind(id).first<{ tipo: string; datos: ArrayBuffer }>();
  if (!foto) return new Response('No encontrada', { status: 404 });
  return new Response(foto.datos, {
    headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
};
