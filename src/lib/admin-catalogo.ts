// Productos, fotos y promociones del panel. Solo se importa desde rutas de /admin.
import type { Base } from './db';
import { CATEGORIAS, LINEAS, TONOS, normalizar, type Foto, type Producto } from './catalogo';
import { fechaDesdeFormulario, generarCodigo, normalizarCodigo, type Promo } from './promos';
import { aCsv, type Resultado } from './panel';

export const MAX_FOTOS = 8;
const MAX_BYTES_IMAGEN = 1_500_000;

export type ProductoPanel = {
  id: string;
  codigo: string;
  slug: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock_disponible: number;
  stock_reservado: number;
  etiqueta_opcion: string | null;
  opciones: string;
  activo: number;
  categoria: string | null;
  tono: string;
  lineas: string;
  talles: string;
  regulable: number;
  medida: string | null;
  material: string | null;
  variantes: string | null;
  fotos: string;
};

export const leerProducto = (db: Base, id: string) => db.prepare('SELECT * FROM producto WHERE id = ?').bind(id).first<ProductoPanel>();

const textoForm = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);
const entero = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);

type DatosProducto = {
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  tono: string;
  lineas: string[];
  talles: number[];
  regulable: boolean;
  medida: string | null;
  material: string | null;
  etiqueta: string | null;
  opciones: string[];
};

export const leerFormProducto = (f: FormData): { ok: true; datos: DatosProducto } | { ok: false; error: string } => {
  const nombre = textoForm(f, 'nombre', 80);
  const descripcion = textoForm(f, 'descripcion', 160);
  const precio = entero(textoForm(f, 'precio', 12));
  const categoria = textoForm(f, 'categoria', 20);
  const tono = textoForm(f, 'tono', 20);
  if (!nombre || !descripcion) return { ok: false, error: 'producto_datos' };
  if (!Number.isInteger(precio) || precio <= 0) return { ok: false, error: 'monto' };
  if (!CATEGORIAS.some((c) => c.id === categoria) || !TONOS.some((t) => t.id === tono)) return { ok: false, error: 'producto_datos' };

  const crudos = textoForm(f, 'talles', 80).split(/[,\s]+/).filter(Boolean).map(Number);
  if (crudos.some((t) => !Number.isInteger(t) || t <= 0)) return { ok: false, error: 'talles' };

  const opciones = [...new Set(textoForm(f, 'opciones', 400).split(',').map((o) => o.trim().slice(0, 60)).filter(Boolean))];
  const etiqueta = textoForm(f, 'etiqueta', 30) || (opciones.length ? 'Opción' : null);

  return {
    ok: true,
    datos: {
      nombre,
      descripcion,
      precio,
      categoria,
      tono,
      lineas: f.getAll('lineas').map(String).filter((l) => LINEAS.some((x) => x.id === l)),
      talles: [...new Set(crudos)].sort((a, b) => a - b),
      regulable: f.get('regulable') === 'on',
      medida: textoForm(f, 'medida', 60) || null,
      material: textoForm(f, 'material', 60) || null,
      etiqueta: opciones.length ? etiqueta : null,
      opciones,
    },
  };
};

/** Conserva la foto que ya tenía cada opción, buscándola por nombre. */
const armarVariantes = (d: DatosProducto, previas: string | null) => {
  if (!d.opciones.length) return null;
  const antes = previas ? (JSON.parse(previas) as NonNullable<Producto['variantes']>).opciones : [];
  return JSON.stringify({ etiqueta: d.etiqueta, opciones: d.opciones.map((nombre) => ({ nombre, foto: antes.find((o) => o.nombre === nombre)?.foto ?? null })) });
};

const armarSlug = async (db: Base, texto: string) => {
  const base = normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'pieza';
  const { results } = await db.prepare(`SELECT slug FROM producto WHERE slug = ? OR slug LIKE ?`).bind(base, `${base}-%`).all<{ slug: string }>();
  const usados = new Set(results.map((r) => r.slug));
  if (!usados.has(base)) return base;
  for (let i = 2; ; i++) if (!usados.has(`${base}-${i}`)) return `${base}-${i}`;
};

export const crearProducto = async (db: Base, d: DatosProducto, stock: number, usuario: string) => {
  const id = crypto.randomUUID();
  const ahora = Date.now();
  const slug = await armarSlug(db, d.descripcion);
  const { n } = (await db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM producto').first<{ n: number }>())!;
  const codigo = `MDM-${d.categoria.slice(0, 3).toUpperCase()}-${String(n).padStart(3, '0')}`;
  await db.batch([
    db.prepare(
      `INSERT INTO producto (id, codigo, slug, nombre, descripcion, precio, stock_disponible, etiqueta_opcion, opciones, numero, categoria, tono, lineas, talles, regulable, medida, material, variantes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, codigo, slug, d.nombre, d.descripcion, d.precio, stock, d.etiqueta, JSON.stringify(d.opciones), n, d.categoria, d.tono, JSON.stringify(d.lineas), JSON.stringify(d.talles), d.regulable ? 1 : 0, d.medida, d.material, armarVariantes(d, null)),
    db.prepare(`INSERT INTO movimiento_stock (producto_id, cantidad, motivo, fecha, usuario) VALUES (?, ?, 'carga_inicial', ?, ?)`).bind(id, stock, ahora, usuario),
  ]);
  return id;
};

/** El slug y el código no cambian: así no se rompen enlaces ya compartidos. */
export const actualizarProducto = async (db: Base, id: string, d: DatosProducto, activo: boolean): Promise<Resultado> => {
  const previo = await leerProducto(db, id);
  if (!previo) return { ok: false, error: 'no_existe' };
  await db
    .prepare(
      `UPDATE producto SET nombre = ?, descripcion = ?, precio = ?, etiqueta_opcion = ?, opciones = ?, categoria = ?, tono = ?, lineas = ?, talles = ?, regulable = ?, medida = ?, material = ?, variantes = ?, activo = ? WHERE id = ?`,
    )
    .bind(d.nombre, d.descripcion, d.precio, d.etiqueta, JSON.stringify(d.opciones), d.categoria, d.tono, JSON.stringify(d.lineas), JSON.stringify(d.talles), d.regulable ? 1 : 0, d.medida, d.material, armarVariantes(d, previo.variantes), activo ? 1 : 0, id)
    .run();
  return { ok: true };
};

export const ingresarStock = async (db: Base, id: string, cantidad: number, nota: string | null, usuario: string): Promise<Resultado> => {
  if (!Number.isInteger(cantidad) || cantidad < 1) return { ok: false, error: 'monto' };
  const r = await db.batch([
    db.prepare(`INSERT INTO movimiento_stock (producto_id, cantidad, motivo, fecha, usuario, nota) SELECT id, ?, 'ajuste', ?, ?, ? FROM producto WHERE id = ?`).bind(cantidad, Date.now(), usuario, nota ?? 'Ingreso de mercadería', id),
    db.prepare('UPDATE producto SET stock_disponible = stock_disponible + ? WHERE id = ?').bind(cantidad, id),
  ]);
  return r.at(-1)!.meta.changes ? { ok: true } : { ok: false, error: 'no_existe' };
};

// Fotos

const TIPOS: Record<string, (b: Uint8Array) => boolean> = {
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

/** El tipo sale del contenido del archivo, no de lo que declara el navegador. */
const tipoReal = (b: Uint8Array) => Object.keys(TIPOS).find((t) => TIPOS[t](b)) ?? null;

export const agregarFoto = async (db: Base, id: string, chica: Uint8Array, grande: Uint8Array): Promise<Resultado> => {
  if (chica.length > MAX_BYTES_IMAGEN || grande.length > MAX_BYTES_IMAGEN) return { ok: false, error: 'foto_pesada' };
  const tipoS = tipoReal(chica);
  const tipoM = tipoReal(grande);
  if (!tipoS || !tipoM) return { ok: false, error: 'foto_tipo' };
  const p = await leerProducto(db, id);
  if (!p) return { ok: false, error: 'no_existe' };
  const fotos = JSON.parse(p.fotos) as Foto[];
  if (fotos.length >= MAX_FOTOS) return { ok: false, error: 'foto_limite' };

  const idS = crypto.randomUUID().replaceAll('-', '');
  const idM = crypto.randomUUID().replaceAll('-', '');
  const ahora = Date.now();
  const nuevas = JSON.stringify([...fotos, { s: `/fotos/${idS}`, m: `/fotos/${idM}` }]);
  // Si otra pestaña cambió las fotos en el medio, el UPDATE no aplica; no se guardan imágenes sueltas.
  const SIGUE_IGUAL = 'EXISTS (SELECT 1 FROM producto WHERE id = ? AND fotos = ?)';
  const r = await db.batch([
    db.prepare(`INSERT INTO imagen (id, tipo, datos, creado) SELECT ?, ?, ?, ? WHERE ${SIGUE_IGUAL}`).bind(idS, tipoS, chica, ahora, id, p.fotos),
    db.prepare(`INSERT INTO imagen (id, tipo, datos, creado) SELECT ?, ?, ?, ? WHERE ${SIGUE_IGUAL}`).bind(idM, tipoM, grande, ahora, id, p.fotos),
    db.prepare('UPDATE producto SET fotos = ? WHERE id = ? AND fotos = ?').bind(nuevas, id, p.fotos),
  ]);
  return r.at(-1)!.meta.changes ? { ok: true } : { ok: false, error: 'cambio' };
};

/** Aplica un nuevo orden de fotos y corrige el índice de foto de cada opción. */
const reordenar = (p: ProductoPanel, orden: Foto[]) => {
  const fotos = JSON.parse(p.fotos) as Foto[];
  const v = p.variantes ? (JSON.parse(p.variantes) as NonNullable<Producto['variantes']>) : null;
  const variantes = v && {
    ...v,
    opciones: v.opciones.map((o) => {
      if (o.foto == null) return o;
      const i = orden.findIndex((f) => f.m === fotos[o.foto!]?.m);
      return { ...o, foto: i < 0 ? null : i };
    }),
  };
  return { fotos: JSON.stringify(orden), variantes: variantes ? JSON.stringify(variantes) : null };
};

const ID_IMAGEN = /^\/fotos\/([0-9a-f]{32})$/;

export const quitarFoto = async (db: Base, id: string, url: string): Promise<Resultado> => {
  const p = await leerProducto(db, id);
  if (!p) return { ok: false, error: 'no_existe' };
  const fotos = JSON.parse(p.fotos) as Foto[];
  const foto = fotos.find((f) => f.m === url);
  if (!foto) return { ok: false, error: 'cambio' };
  const nuevo = reordenar(p, fotos.filter((f) => f !== foto));
  // Las fotos originales del catálogo son archivos del sitio: solo se borran las subidas desde el panel.
  const imagenes = [foto.s, foto.m].flatMap((u) => u.match(ID_IMAGEN)?.[1] ?? []);
  const r = await db.batch([
    ...imagenes.map((i) => db.prepare('DELETE FROM imagen WHERE id = ? AND EXISTS (SELECT 1 FROM producto WHERE id = ? AND fotos = ?)').bind(i, id, p.fotos)),
    db.prepare('UPDATE producto SET fotos = ?, variantes = ? WHERE id = ? AND fotos = ?').bind(nuevo.fotos, nuevo.variantes, id, p.fotos),
  ]);
  return r.at(-1)!.meta.changes ? { ok: true } : { ok: false, error: 'cambio' };
};

export const fotoPrincipal = async (db: Base, id: string, url: string): Promise<Resultado> => {
  const p = await leerProducto(db, id);
  if (!p) return { ok: false, error: 'no_existe' };
  const fotos = JSON.parse(p.fotos) as Foto[];
  const foto = fotos.find((f) => f.m === url);
  if (!foto) return { ok: false, error: 'cambio' };
  const nuevo = reordenar(p, [foto, ...fotos.filter((f) => f !== foto)]);
  const r = await db.prepare('UPDATE producto SET fotos = ?, variantes = ? WHERE id = ? AND fotos = ?').bind(nuevo.fotos, nuevo.variantes, id, p.fotos).run();
  return r.rowsAffected ? { ok: true } : { ok: false, error: 'cambio' };
};

// Promociones

export const listarPromos = async (db: Base) => (await db.prepare('SELECT * FROM promocion WHERE lote IS NULL ORDER BY activa DESC, id DESC').all<Promo>()).results;
export const leerPromo = (db: Base, id: number) => db.prepare('SELECT * FROM promocion WHERE id = ?').bind(id).first<Promo>();
export const listarParaElegir = async (db: Base) =>
  (await db.prepare('SELECT id, nombre, descripcion, categoria FROM producto WHERE activo = 1 AND categoria IS NOT NULL ORDER BY categoria, numero').all<{ id: string; nombre: string; descripcion: string; categoria: string }>()).results;

type DatosPromo = { nombre: string; tipo: string; valor: number; alcance: string; objetivo: string | null; minimo: number; usosMax: number | null; inicio: number | null; fin: number | null };

const leerFormPromo = (f: FormData): { ok: true; datos: DatosPromo } | { ok: false; error: string } => {
  const nombre = textoForm(f, 'nombre', 80);
  const tipo = textoForm(f, 'tipo', 12);
  const valor = entero(textoForm(f, 'valor', 10));
  const alcance = textoForm(f, 'alcance', 12);
  if (!nombre || !['porcentaje', 'monto'].includes(tipo) || !['todo', 'categoria', 'productos'].includes(alcance)) return { ok: false, error: 'promo_datos' };
  if (!Number.isInteger(valor) || valor <= 0 || (tipo === 'porcentaje' && valor > 90)) return { ok: false, error: 'promo_valor' };

  let objetivo: string | null = null;
  if (alcance === 'categoria') {
    objetivo = textoForm(f, 'categoria', 20);
    if (!CATEGORIAS.some((c) => c.id === objetivo)) return { ok: false, error: 'promo_alcance' };
  }
  if (alcance === 'productos') {
    const ids = f.getAll('productos').map(String);
    if (!ids.length) return { ok: false, error: 'promo_alcance' };
    objetivo = JSON.stringify(ids);
  }

  const minimo = textoForm(f, 'minimo', 12) ? entero(textoForm(f, 'minimo', 12)) : 0;
  const usosMax = textoForm(f, 'usos_max', 8) ? entero(textoForm(f, 'usos_max', 8)) : null;
  if (Number.isNaN(minimo) || (usosMax !== null && (Number.isNaN(usosMax) || usosMax < 1))) return { ok: false, error: 'monto' };

  const textoInicio = textoForm(f, 'inicio', 20);
  const textoFin = textoForm(f, 'fin', 20);
  const inicio = fechaDesdeFormulario(textoInicio);
  const fin = fechaDesdeFormulario(textoFin);
  if ((textoInicio && inicio == null) || (textoFin && fin == null) || (inicio != null && fin != null && fin <= inicio)) return { ok: false, error: 'promo_fechas' };

  return { ok: true, datos: { nombre, tipo, valor, alcance, objetivo, minimo, usosMax, inicio, fin } };
};

export const guardarPromo = async (db: Base, id: number | null, f: FormData, usuario: string): Promise<Resultado & { id?: number }> => {
  const leido = leerFormPromo(f);
  if (!leido.ok) return leido;
  const { nombre, tipo, valor, alcance, objetivo, minimo, usosMax, inicio, fin } = leido.datos;
  const codigo = normalizarCodigo(textoForm(f, 'codigo', 20)) || null;
  if (codigo && !/^[A-Z0-9-]{3,20}$/.test(codigo)) return { ok: false, error: 'promo_codigo' };
  const activa = f.get('activa') === 'on' ? 1 : 0;
  // El mínimo y el tope de usos son solo de cupones: una promoción sin código los ignora.
  const valores = [nombre, tipo, valor, alcance, objetivo, codigo, codigo ? minimo : 0, codigo ? usosMax : null, inicio, fin, activa];
  try {
    if (id == null) {
      const r = await db
        .prepare(`INSERT INTO promocion (nombre, tipo, valor, alcance, objetivo, codigo, minimo, usos_max, inicio, fin, activa, creado, usuario) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(...valores, Date.now(), usuario)
        .first<{ id: number }>();
      return { ok: true, id: r!.id };
    }
    const r = await db
      .prepare('UPDATE promocion SET nombre = ?, tipo = ?, valor = ?, alcance = ?, objetivo = ?, codigo = ?, minimo = ?, usos_max = ?, inicio = ?, fin = ?, activa = ? WHERE id = ?')
      .bind(...valores, id)
      .run();
    return r.rowsAffected ? { ok: true, id } : { ok: false, error: 'no_existe' };
  } catch (e) {
    if (/UNIQUE constraint/i.test(String(e))) return { ok: false, error: 'promo_repetida' };
    if (/cupon_agotado/i.test(String(e))) return { ok: false, error: 'promo_usos' };
    throw e;
  }
};

// Cupones generados en lote

export const MAX_LOTE = 500;

export const generarCupones = async (db: Base, f: FormData, usuario: string): Promise<{ ok: true; lote: string } | { ok: false; error: string }> => {
  const leido = leerFormPromo(f);
  if (!leido.ok) return leido;
  const d = leido.datos;
  const cantidad = entero(textoForm(f, 'cantidad', 6));
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_LOTE) return { ok: false, error: 'lote_cantidad' };
  const prefijo = normalizarCodigo(textoForm(f, 'prefijo', 12));
  if (prefijo && !/^[A-Z0-9]{1,10}$/.test(prefijo)) return { ok: false, error: 'lote_prefijo' };
  // Por defecto cada código sirve una sola vez: para eso se reparten de a uno.
  const usosMax = d.usosMax ?? 1;
  const ahora = Date.now();
  const lote = crypto.randomUUID().replaceAll('-', '');

  // Un código repetido es casi imposible, pero revertiría todo el lote: se reintenta con otros.
  for (let intento = 0; ; intento++) {
    const codigos = new Set<string>();
    while (codigos.size < cantidad) codigos.add(generarCodigo(prefijo));
    try {
      await db.batch(
        [...codigos].map((codigo) =>
          db
            .prepare('INSERT INTO promocion (nombre, tipo, valor, alcance, objetivo, codigo, minimo, usos_max, inicio, fin, activa, creado, usuario, lote) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
            .bind(d.nombre, d.tipo, d.valor, d.alcance, d.objetivo, codigo, d.minimo, usosMax, d.inicio, d.fin, ahora, usuario, lote),
        ),
      );
      return { ok: true, lote };
    } catch (e) {
      if (intento >= 2 || !/UNIQUE constraint/i.test(String(e))) throw e;
    }
  }
};

export type ResumenLote = { lote: string; nombre: string; tipo: Promo['tipo']; valor: number; total: number; usados: number; activos: number; fin: number | null };

export const listarLotes = async (db: Base) =>
  (
    await db
      .prepare(
        `SELECT lote, MIN(nombre) AS nombre, MIN(tipo) AS tipo, MIN(valor) AS valor, COUNT(*) AS total, SUM(usos > 0) AS usados, SUM(activa) AS activos, MAX(fin) AS fin
         FROM promocion WHERE lote IS NOT NULL GROUP BY lote ORDER BY MAX(id) DESC`,
      )
      .all<ResumenLote>()
  ).results;

export const leerLote = async (db: Base, lote: string) => (await db.prepare('SELECT * FROM promocion WHERE lote = ? ORDER BY usos > 0, codigo').bind(lote).all<Promo>()).results;

export const activarLote = (db: Base, lote: string, activa: boolean) => db.prepare('UPDATE promocion SET activa = ? WHERE lote = ?').bind(activa ? 1 : 0, lote).run();

/** Los usados quedan: son el registro de qué código se aplicó en cada pedido. */
export const borrarSinUsarLote = (db: Base, lote: string) => db.prepare('DELETE FROM promocion WHERE lote = ? AND usos = 0').bind(lote).run();

export const exportarLote = async (db: Base, lote: string) => {
  const cupones = await leerLote(db, lote);
  if (!cupones.length) return null;
  return aCsv([['Código', 'Promo', 'Descuento', 'Usos', 'Máximo de usos'], ...cupones.map((c) => [c.codigo, c.nombre, c.tipo === 'porcentaje' ? `${c.valor}%` : `$${c.valor}`, c.usos, c.usos_max])]);
};

export const borrarPromo = async (db: Base, id: number): Promise<Resultado> => {
  const r = await db.prepare('DELETE FROM promocion WHERE id = ?').bind(id).run();
  return r.rowsAffected ? { ok: true } : { ok: false, error: 'no_existe' };
};
