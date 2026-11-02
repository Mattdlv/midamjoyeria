import { productos, textoBusqueda } from '../lib/catalogo';

export const GET = () =>
  new Response(
    JSON.stringify(
      productos.map((p) => ({
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
