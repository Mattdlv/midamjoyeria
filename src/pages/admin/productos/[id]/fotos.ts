import type { APIRoute } from 'astro';
import { agregarFoto } from '../../../../lib/admin-catalogo';
import { env } from '../../../../lib/entorno';

// Recibe una foto ya achicada en el navegador, en sus dos tamaños.
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.usuario) return new Response('No autorizado', { status: 403 });
  const json = (cuerpo: unknown, status: number) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
  let f: FormData;
  try {
    f = await request.formData();
  } catch {
    return json({ error: 'foto_tipo' }, 400);
  }
  const chica = f.get('s');
  const grande = f.get('m');
  if (!(chica instanceof File) || !(grande instanceof File)) return json({ error: 'foto_tipo' }, 400);
  const r = await agregarFoto(env.DB, params.id ?? '', new Uint8Array(await chica.arrayBuffer()), new Uint8Array(await grande.arrayBuffer()));
  return r.ok ? json({ ok: true }, 201) : json({ error: r.error }, 422);
};
