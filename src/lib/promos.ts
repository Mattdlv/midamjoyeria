// Cálculo de promociones. No toca la base, así que lo usan por igual el catálogo, los pedidos y las pruebas.
export type Promo = {
  id: number;
  nombre: string;
  tipo: 'porcentaje' | 'monto';
  valor: number;
  alcance: 'todo' | 'categoria' | 'productos';
  objetivo: string | null;
  codigo: string | null;
  minimo: number;
  usos: number;
  usos_max: number | null;
  inicio: number | null;
  fin: number | null;
  activa: number;
};

type Pieza = { id: string; categoria: string | null };

export const vigente = (p: Promo, ahora: number) => Boolean(p.activa) && (p.inicio == null || p.inicio <= ahora) && (p.fin == null || ahora < p.fin);

export const aplicaA = (p: Promo, pieza: Pieza) => {
  if (p.alcance === 'todo') return true;
  if (p.alcance === 'categoria') return p.objetivo === pieza.categoria;
  try {
    return (JSON.parse(p.objetivo ?? '[]') as string[]).includes(pieza.id);
  } catch {
    return false;
  }
};

const rebajar = (precio: number, p: Promo) => Math.max(0, p.tipo === 'porcentaje' ? Math.round((precio * (100 - p.valor)) / 100) : precio - p.valor);

/** Con varias promociones se aplica la más conveniente para quien compra; no se acumulan. */
export const precioConPromos = (precio: number, pieza: Pieza, promos: Promo[], ahora: number) =>
  promos.reduce((mejor, p) => (!p.codigo && vigente(p, ahora) && aplicaA(p, pieza) ? Math.min(mejor, rebajar(precio, p)) : mejor), precio);

export type LineaCupon = Pieza & { precio: number; cantidad: number };

export type ResultadoCupon = { ok: true; descuento: number } | { ok: false; mensaje: string };

/** Descuento de un cupón sobre las líneas que alcanza. La compra mínima se mide contra el total de la bolsa. */
export const evaluarCupon = (p: Promo | null, lineas: LineaCupon[], ahora: number): ResultadoCupon => {
  if (!p || !p.codigo || !vigente(p, ahora)) return { ok: false, mensaje: 'Ese código no existe o ya no está vigente.' };
  if (p.usos_max != null && p.usos >= p.usos_max) return { ok: false, mensaje: 'Ese código ya se terminó.' };
  const subtotal = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
  if (subtotal < p.minimo) return { ok: false, mensaje: `Ese código es para compras desde $${p.minimo.toLocaleString('es-AR')}.` };
  const alcanzado = lineas.filter((l) => aplicaA(p, l)).reduce((a, l) => a + l.precio * l.cantidad, 0);
  if (!alcanzado) return { ok: false, mensaje: 'Ese código no aplica a las piezas de tu bolsa.' };
  return { ok: true, descuento: p.tipo === 'porcentaje' ? Math.round((alcanzado * p.valor) / 100) : Math.min(p.valor, alcanzado) };
};

// Sin letras ni números que se confunden al dictarlos o copiarlos (I, O, 0, 1). Son 32: cada byte se reparte parejo.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código al azar. Con 8 caracteres hay más de un billón de combinaciones: no se pueden adivinar probando. */
export const generarCodigo = (prefijo = '', largo = 8) => {
  const azar = [...crypto.getRandomValues(new Uint8Array(largo))].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return prefijo ? `${prefijo}-${azar}` : azar;
};

export const normalizarCodigo = (s: string) => s.trim().toUpperCase();

// Argentina no cambia de hora: las fechas del panel se interpretan siempre en UTC-3.
export const fechaDesdeFormulario = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}:00-03:00`);
  return Number.isNaN(ms) ? null : ms;
};
export const fechaParaFormulario = (ms: number | null) => (ms == null ? '' : new Date(ms - 3 * 3_600_000).toISOString().slice(0, 16));
