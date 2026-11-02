import type { APIRoute } from 'astro';
import { env } from '../../../../lib/entorno';
import { marcarClicWhatsApp } from '../../../../lib/pedidos';

export const prerender = false;

/** Registra el clic en el botón. No prueba que el mensaje se haya enviado: WhatsApp no lo informa. */
export const POST: APIRoute = async ({ params }) => {
  const token = params.token ?? '';
  if (/^[0-9a-f]{48}$/.test(token)) await marcarClicWhatsApp(env.DB, token);
  return new Response(null, { status: 204 });
};
