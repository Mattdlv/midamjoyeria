// Lectura del catálogo para las páginas de la tienda. Solo se importa en el servidor.
import type { Base } from './db';
import { env } from './entorno';
import { leerPromosAutomaticas } from './pedidos';
import { precioConPromos, vigente, type Promo } from './promos';
import type { Producto } from './catalogo';

type FilaCatalogo = {
  id: string;
  codigo: string;
  numero: number;
  nombre: string;
  descripcion: string;
  slug: string;
  categoria: string;
  precio: number;
  stock_disponible: number;
  tono: string;
  lineas: string;
  talles: string;
  regulable: number;
  medida: string | null;
  material: string | null;
  variantes: string | null;
  fotos: string;
};

const aProducto = (f: FilaCatalogo, promos: Promo[], ahora: number): Producto => {
  const precio = precioConPromos(f.precio, f, promos, ahora);
  return {
    id: f.id,
    codigo: f.codigo,
    numero: f.numero,
    nombre: f.nombre,
    descripcion: f.descripcion,
    slug: f.slug,
    categoria: f.categoria,
    precio,
    precioLista: precio < f.precio ? f.precio : null,
    stock: f.stock_disponible,
    tono: f.tono,
    lineas: JSON.parse(f.lineas),
    talles: JSON.parse(f.talles),
    regulable: Boolean(f.regulable),
    medida: f.medida,
    material: f.material,
    variantes: f.variantes ? JSON.parse(f.variantes) : null,
    fotos: JSON.parse(f.fotos),
  };
};

export const cargarCatalogo = async (db: Base, ahora = Date.now()) => {
  // Un producto sin foto o sin categoría todavía no está listo para mostrarse.
  const [{ results }, promos] = await Promise.all([
    db
      .prepare(
        `SELECT id, codigo, numero, nombre, descripcion, slug, categoria, precio, stock_disponible, tono, lineas, talles, regulable, medida, material, variantes, fotos
         FROM producto WHERE activo = 1 AND categoria IS NOT NULL AND json_array_length(fotos) > 0 ORDER BY numero`,
      )
      .all<FilaCatalogo>(),
    leerPromosAutomaticas(db),
  ]);
  return {
    productos: results.map((f) => aProducto(f, promos, ahora)),
    franja: promos.find((p) => vigente(p, ahora))?.nombre ?? null,
  };
};

export type Catalogo = Awaited<ReturnType<typeof cargarCatalogo>>;

/** Se lee una sola vez por página, aunque lo usen el layout y la página misma. */
export const leerCatalogo = (locals: App.Locals) => (locals.catalogo ??= cargarCatalogo(env.DB));
