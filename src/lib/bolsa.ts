// Estado de la bolsa, compartido entre islas y guardado en el navegador.
export type ItemBolsa = {
  clave: string;
  slug: string;
  nombre: string;
  descripcion: string;
  variante: string | null;
  precio: number;
  foto: string;
  stock: number;
  cantidad: number;
};

const CLAVE = 'midam-bolsa';
let items: ItemBolsa[] = [];
let cargada = false;
const oyentes = new Set<() => void>();
const VACIA: ItemBolsa[] = [];

const cargar = () => {
  if (cargada || typeof window === 'undefined') return;
  cargada = true;
  try {
    items = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
  } catch {
    items = [];
  }
};

const guardar = () => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(items));
  } catch {
    // Sin almacenamiento disponible la bolsa dura lo que dura la página.
  }
  oyentes.forEach((o) => o());
};

export const leerBolsa = () => {
  cargar();
  return items;
};
export const leerBolsaServidor = () => VACIA;
export const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => oyentes.delete(o);
};

export const agregar = (item: Omit<ItemBolsa, 'clave' | 'cantidad'>) => {
  cargar();
  const clave = item.slug + (item.variante ? `:${item.variante}` : '');
  const existente = items.find((i) => i.clave === clave);
  const enOtras = items.filter((i) => i.slug === item.slug).reduce((a, i) => a + i.cantidad, 0);
  if (enOtras >= item.stock) return false;
  items = existente
    ? items.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + 1 } : i))
    : [...items, { ...item, clave, cantidad: 1 }];
  guardar();
  return true;
};

export const cambiarCantidad = (clave: string, delta: number) => {
  cargar();
  const actual = items.find((i) => i.clave === clave);
  if (!actual) return;
  const enOtras = items.filter((i) => i.slug === actual.slug && i.clave !== clave).reduce((a, i) => a + i.cantidad, 0);
  const nueva = Math.min(actual.cantidad + delta, actual.stock - enOtras);
  items = nueva <= 0 ? items.filter((i) => i.clave !== clave) : items.map((i) => (i.clave === clave ? { ...i, cantidad: nueva } : i));
  guardar();
};

export const quitar = (clave: string) => {
  cargar();
  items = items.filter((i) => i.clave !== clave);
  guardar();
};

export const vaciar = () => {
  cargar();
  items = [];
  guardar();
};

/** Recorta las cantidades de una pieza al stock real; si no queda nada, la saca de la bolsa. */
export const ajustarStock = (slug: string, disponibles: number) => {
  cargar();
  let resto = disponibles;
  items = items.flatMap((i) => {
    if (i.slug !== slug) return [i];
    const cantidad = Math.min(i.cantidad, resto);
    resto -= cantidad;
    return cantidad > 0 ? [{ ...i, cantidad, stock: disponibles }] : [];
  });
  guardar();
};

export const unidadesTope = (slug: string) => {
  cargar();
  return items.filter((i) => i.slug === slug).reduce((a, i) => a + i.cantidad, 0);
};
