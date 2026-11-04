import type { APIRoute } from 'astro';
import { textoBusqueda } from '../lib/catalogo';
import { leerCatalogo } from '../lib/tienda';

export const GET: APIRoute = async ({ locals }) =>
  new Response(
    JSON.stringify(
      (await leerCatalogo(locals)).productos.map((p) => ({
        slug: p.slug,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        foto: p.fotos[0].s,
        texto: textoBusqueda(p),
      })),
    ),
    { headers: { 'Content-Type': 'application/json' } },
  );
