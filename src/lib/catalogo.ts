// Tipos y utilidades del catálogo, sin datos: los productos se leen de la base en lib/tienda.ts.
export type Foto = { s: string; m: string };
export type Producto = {
  id: string;
  codigo: string;
  numero: number;
  nombre: string;
  descripcion: string;
  slug: string;
  categoria: string;
  precio: number;
  /** Precio sin promoción, solo si hay una vigente. */
  precioLista: number | null;
  stock: number;
  tono: string;
  lineas: string[];
  talles: number[];
  regulable: boolean;
  medida: string | null;
  material: string | null;
  variantes: { etiqueta: string; opciones: { nombre: string; foto: number | null }[] } | null;
  fotos: Foto[];
};

export const CATEGORIAS = [
  { id: 'anillos', nombre: 'Anillos', promesa: 'Para las manos que hablan.', portada: 'Regina' },
  { id: 'aros', nombre: 'Aros', promesa: 'Cuando tu opinión sean unos aros, me la das.', portada: 'Lady Macbeth' },
  { id: 'collares', nombre: 'Collares', promesa: 'Lo primero que ven cuando entrás.', portada: 'Clea' },
  { id: 'pulseras', nombre: 'Pulseras', promesa: 'Un brillo más, por las dudas.', portada: 'Carmilla' },
] as const;

export const TONOS = [
  { id: 'plateado', nombre: 'Plateado' },
  { id: 'dorado', nombre: 'Dorado' },
  { id: 'mixto', nombre: 'Varios tonos' },
];

export const RANGOS = [
  { id: 'hasta-5000', nombre: 'Hasta $5.000', min: 0, max: 5000, nota: 'para quedar bien' },
  { id: '5000-a-10000', nombre: '$5.000 a $10.000', min: 5001, max: 10000, nota: 'para quedar muy bien' },
  { id: 'mas-de-10000', nombre: 'Más de $10.000', min: 10001, max: Infinity, nota: 'para que te perdonen' },
];

export const LINEAS = [
  { id: 'giratoria', nombre: 'Giratoria' },
  { id: 'flor', nombre: 'Flor' },
  { id: 'perla', nombre: 'Perla' },
  { id: 'argollas', nombre: 'Argollas' },
  { id: 'chunky', nombre: 'Chunky' },
  { id: 'dije', nombre: 'Con dije' },
  { id: 'cadena', nombre: 'Cadena' },
];

export const formatoPrecio = (n: number) => '$' + n.toLocaleString('es-AR');
export const numeroElenco = (n: number) => 'Nº ' + String(n).padStart(2, '0');
export const notaStock = (stock: number) => (stock <= 0 ? 'Sin stock' : stock === 1 ? 'Queda 1' : stock <= 3 ? `Quedan ${stock}` : null);
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const porCategoria = (productos: Producto[], id: string) => productos.filter((p) => p.categoria === id);
export const porLinea = (productos: Producto[], id: string) => productos.filter((p) => p.lineas.includes(id));
export const enRango = (productos: Producto[], id: string) => {
  const r = RANGOS.find((x) => x.id === id)!;
  return productos.filter((p) => p.precio >= r.min && p.precio <= r.max);
};

/** Una pieza con variantes de tono cuenta también como dorada o plateada si tiene esa opción. */
export const tieneTono = (p: Producto, tono: string) =>
  p.tono === tono || (tono !== 'mixto' && (p.variantes?.opciones ?? []).some((o) => normalizar(o.nombre).includes(tono)));

export const textoBusqueda = (p: Producto) =>
  normalizar([p.nombre, p.descripcion, p.categoria, p.tono, ...p.lineas, ...(p.variantes?.opciones ?? []).map((o) => o.nombre)].join(' '));

/** Piezas de otra categoría, del mismo tono y precio parecido, para "completá el look". */
export const completarLook = (productos: Producto[], p: Producto, cantidad = 4) =>
  productos
    .filter((x) => x.categoria !== p.categoria && (x.tono === p.tono || x.tono === 'mixto' || p.tono === 'mixto'))
    .sort((a, b) => Math.abs(a.precio - p.precio) - Math.abs(b.precio - p.precio))
    .slice(0, cantidad);

export const CONTACTO = {
  // Número indicado para el proyecto. Los horarios salen del catálogo de Treinta; falta confirmarlos.
  whatsapp: '5493804151249',
  instagram: 'https://www.instagram.com/midamjoyeria/',
  usuario: '@midamjoyeria',
  ciudad: 'La Rioja',
  horario: 'Lunes a viernes de 8 a 21 · Sábados de 8 a 18',
};

export const enlaceWhatsApp = (mensaje: string) => `https://wa.me/${CONTACTO.whatsapp}?text=${encodeURIComponent(mensaje)}`;
