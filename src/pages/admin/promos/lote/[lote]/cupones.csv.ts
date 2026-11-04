import type { APIRoute } from 'astro';
import { exportarLote } from '../../../../../lib/admin-catalogo';
import { env } from '../../../../../lib/entorno';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.usuario) return new Response('No autorizado', { status: 403 });
  const csv = await exportarLote(env.DB, params.lote ?? '');
  if (!csv) return new Response('No encontrado', { status: 404 });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="midam-cupones.csv"' } });
};
