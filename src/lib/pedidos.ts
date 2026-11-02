// Lógica de pedidos en el servidor. Solo se importa desde rutas con `prerender = false`.
import type { Base, Sentencia } from './db';
import { METODOS_PAGO } from './mensaje';

export type LineaEntrada = { slug: string; opcion: string | null; cantidad: number };
export type EntradaPedido = {
  nombre: string;
  whatsapp: string;
  tipoEntrega: 'retiro' | 'envio';
  direccion: string | null;
  localidad: string | null;
  cp: string | null;
  metodoPago: string;
  nota: string | null;
  esRegalo: boolean;
  origen: string | null;
  items: LineaEntrada[];
};

export type FilaPedido = {
  id: number;
  token: string;
  nombre_entrega: string;
  whatsapp: string;
  tipo_entrega: 'retiro' | 'envio';
  direccion: string | null;
  localidad: string | null;
  cp: string | null;
  metodo_pago: string;
  nota: string | null;
  es_regalo: number;
  subtotal: number;
  descuento: number;
  costo_envio: number | null;
  seguimiento_empresa: string | null;
  seguimiento_codigo: string | null;
  link_pago: string | null;
  estado: string;
  estado_pago: string;
  reserva_vence_en: number;
  creado: number;
};

export type FilaItem = {
  nombre_al_comprar: string;
  descripcion_al_comprar: string;
  opcion: string | null;
  precio_al_comprar: number;
  cantidad: number;
};

type FilaProducto = {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock_disponible: number;
  opciones: string;
  etiqueta_opcion: string | null;
  activo: number;
};

export const numeroPedido = (id: number) => 'M-' + String(id).padStart(4, '0');

const MAX_LINEAS = 20;
const MAX_POR_LINEA = 50;

const texto = (v: unknown, max: number) => {
  if (typeof v !== 'string') return null;
  const limpio = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return limpio ? limpio.slice(0, max) : null;
};

/** Devuelve el celular argentino como 549 + característica + número, o null si no es válido. */
export const normalizarWhatsApp = (v: unknown) => {
  if (typeof v !== 'string') return null;
  let d = v.replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // "15" después de la característica: 380 15 4000000 pasa a 380 4000000.
  const con15 = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (con15 && con15[1].length + con15[2].length === 10) d = con15[1] + con15[2];
  return d.length === 10 ? `549${d}` : null;
};

export type ErroresCampo = Record<string, string>;

/** Valida la forma de los datos. Precio, stock y opciones se comprueban después contra la base. */
export const validarEntrada = (b: unknown): { entrada: EntradaPedido } | { errores: ErroresCampo } => {
  const d = (b ?? {}) as Record<string, unknown>;
  const errores: ErroresCampo = {};
  const nombre = texto(d.nombre, 80);
  if (!nombre || nombre.length < 2) errores.nombre = 'Contanos tu nombre.';
  const whatsapp = normalizarWhatsApp(d.whatsapp);
  if (!whatsapp) errores.whatsapp = 'Revisá el número: característica y celular, por ejemplo 380 400 0000.';
  const tipoEntrega = d.tipoEntrega === 'retiro' || d.tipoEntrega === 'envio' ? d.tipoEntrega : null;
  if (!tipoEntrega) errores.tipoEntrega = 'Elegí cómo querés recibirlo.';
  const direccion = texto(d.direccion, 160);
  const localidad = texto(d.localidad, 80);
  const cp = texto(d.cp, 8);
  if (tipoEntrega === 'envio') {
    if (!direccion) errores.direccion = 'Falta la dirección.';
    if (!localidad) errores.localidad = 'Falta la localidad.';
    if (!cp || !/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(cp)) errores.cp = 'Revisá el código postal, por ejemplo 5300.';
  }
  const metodoPago = typeof d.metodoPago === 'string' && d.metodoPago in METODOS_PAGO ? d.metodoPago : null;
  if (!metodoPago) errores.metodoPago = 'Elegí cómo preferís pagar.';
  else if (metodoPago === 'efectivo' && tipoEntrega === 'envio') errores.metodoPago = 'El efectivo es solo para retiro.';

  const crudos = Array.isArray(d.items) ? d.items : [];
  const items: LineaEntrada[] = [];
  for (const i of crudos.slice(0, MAX_LINEAS + 1)) {
    const slug = texto((i as Record<string, unknown>)?.slug, 120);
    const cantidad = (i as Record<string, unknown>)?.cantidad;
    if (!slug || !Number.isInteger(cantidad) || (cantidad as number) < 1 || (cantidad as number) > MAX_POR_LINEA) {
      errores.items = 'Hay una pieza con datos inválidos.';
      break;
    }
    items.push({ slug, opcion: texto((i as Record<string, unknown>)?.opcion, 60), cantidad: cantidad as number });
  }
  if (!items.length && !errores.items) errores.items = 'Tu bolsa está vacía.';
  if (crudos.length > MAX_LINEAS) errores.items = `Podés pedir hasta ${MAX_LINEAS} piezas distintas por pedido.`;

  if (Object.keys(errores).length) return { errores };
  return {
    entrada: {
      nombre: nombre!,
      whatsapp: whatsapp!,
      tipoEntrega: tipoEntrega!,
      direccion: tipoEntrega === 'envio' ? direccion : null,
      localidad: tipoEntrega === 'envio' ? localidad : null,
      cp: tipoEntrega === 'envio' ? cp : null,
      metodoPago: metodoPago!,
      nota: texto(d.nota, 280),
      esRegalo: d.esRegalo === true,
      origen: texto(d.origen, 120),
      items,
    },
  };
};

const hexa = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const crearToken = () => hexa(crypto.getRandomValues(new Uint8Array(24)));
/** Los límites por IP guardan solo un hash, no la dirección. */
export const hashIp = async (ip: string) => hexa(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`midam:${ip}`))).slice(0, 32);

/**
 * Libera las reservas vencidas. Todo corre en una transacción y las tres sentencias usan el mismo corte,
 * así que dos ejecuciones simultáneas no pueden devolver dos veces el mismo stock.
 */
export const liberarVencidos = async (db: Base, ahora = Date.now()) => {
  const vencidos = `SELECT p.id FROM pedido p WHERE p.estado = 'creado' AND p.reserva_vence_en <= ?1`;
  await db.batch([
    db.prepare(
      `UPDATE producto SET
         stock_disponible = stock_disponible + (SELECT COALESCE(SUM(i.cantidad), 0) FROM item_pedido i WHERE i.producto_id = producto.id AND i.pedido_id IN (${vencidos})),
         stock_reservado = stock_reservado - (SELECT COALESCE(SUM(i.cantidad), 0) FROM item_pedido i WHERE i.producto_id = producto.id AND i.pedido_id IN (${vencidos}))
       WHERE id IN (SELECT i.producto_id FROM item_pedido i WHERE i.pedido_id IN (${vencidos}))`,
    ).bind(ahora),
    db.prepare(
      `INSERT INTO movimiento_stock (producto_id, cantidad, motivo, pedido_id, fecha)
       SELECT i.producto_id, i.cantidad, 'liberacion', i.pedido_id, ?1 FROM item_pedido i WHERE i.pedido_id IN (${vencidos})`,
    ).bind(ahora),
    db.prepare(`UPDATE pedido SET estado = 'vencido' WHERE estado = 'creado' AND reserva_vence_en <= ?1`).bind(ahora),
  ]);
};

export type Conflicto = { slug: string; nombre: string; disponibles: number };
export type ResultadoCrear =
  | { ok: true; id: number; token: string; numero: string }
  | { ok: false; codigo: 'sin_stock'; conflictos: Conflicto[] }
  | { ok: false; codigo: 'invalido'; mensaje: string }
  | { ok: false; codigo: 'limite'; mensaje: string };

type Opciones = { horasReserva: number; limiteIpHora: number; limiteAbiertos: number; ipHash: string | null; ahora?: number };

export const crearPedido = async (db: Base, e: EntradaPedido, o: Opciones): Promise<ResultadoCrear> => {
  const ahora = o.ahora ?? Date.now();
  await liberarVencidos(db, ahora);

  if (o.ipHash) {
    const { n } = (await db.prepare('SELECT COUNT(*) AS n FROM pedido WHERE ip_hash = ? AND creado > ?').bind(o.ipHash, ahora - 3_600_000).first<{ n: number }>())!;
    if (n >= o.limiteIpHora) return { ok: false, codigo: 'limite', mensaje: 'Hiciste muchos pedidos seguidos. Escribinos por WhatsApp y lo vemos.' };
  }
  const abiertos = await db
    .prepare(`SELECT COUNT(*) AS n FROM pedido p JOIN cliente c ON c.id = p.cliente_id WHERE c.whatsapp = ? AND p.estado = 'creado'`)
    .bind(e.whatsapp)
    .first<{ n: number }>();
  if (abiertos!.n >= o.limiteAbiertos) {
    return { ok: false, codigo: 'limite', mensaje: 'Ya tenés pedidos esperando confirmación. Escribinos por WhatsApp y los vemos.' };
  }

  // Se unifican líneas iguales y se toma todo de la base; lo que manda el navegador solo elige qué y cuánto.
  const slugs = [...new Set(e.items.map((i) => i.slug))];
  const { results: filas } = await db
    .prepare(`SELECT id, slug, nombre, descripcion, precio, stock_disponible, opciones, etiqueta_opcion, activo FROM producto WHERE slug IN (${slugs.map(() => '?').join(',')})`)
    .bind(...slugs)
    .all<FilaProducto>();
  const porSlug = new Map(filas.map((f) => [f.slug, f]));

  const lineas = new Map<string, LineaEntrada>();
  for (const i of e.items) {
    const p = porSlug.get(i.slug);
    if (!p || !p.activo) return { ok: false, codigo: 'invalido', mensaje: 'Una de las piezas ya no está disponible.' };
    const opciones = JSON.parse(p.opciones) as string[];
    if (opciones.length && !i.opcion) return { ok: false, codigo: 'invalido', mensaje: `Falta elegir ${(p.etiqueta_opcion ?? 'una opción').toLowerCase()} de ${p.nombre}.` };
    if (i.opcion && !opciones.includes(i.opcion)) return { ok: false, codigo: 'invalido', mensaje: `La opción elegida de ${p.nombre} no existe.` };
    const clave = `${i.slug}|${i.opcion ?? ''}`;
    const previa = lineas.get(clave);
    lineas.set(clave, previa ? { ...previa, cantidad: previa.cantidad + i.cantidad } : { ...i });
  }

  const porProducto = new Map<string, number>();
  for (const l of lineas.values()) porProducto.set(l.slug, (porProducto.get(l.slug) ?? 0) + l.cantidad);
  const subtotal = [...lineas.values()].reduce((a, l) => a + porSlug.get(l.slug)!.precio * l.cantidad, 0);

  const token = crearToken();
  const vence = ahora + o.horasReserva * 3_600_000;
  const idPedido = 'SELECT id FROM pedido WHERE token = ?';

  const sentencias: Sentencia[] = [
    db.prepare(`INSERT INTO cliente (whatsapp, nombre, creado) VALUES (?, ?, ?) ON CONFLICT (whatsapp) DO UPDATE SET nombre = excluded.nombre`).bind(e.whatsapp, e.nombre, ahora),
    db.prepare(
      `INSERT INTO pedido (token, cliente_id, nombre_entrega, tipo_entrega, direccion, localidad, cp, metodo_pago, nota, es_regalo, subtotal, reserva_vence_en, creado, ip_hash, origen)
       VALUES (?, (SELECT id FROM cliente WHERE whatsapp = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(token, e.whatsapp, e.nombre, e.tipoEntrega, e.direccion, e.localidad, e.cp, e.metodoPago, e.nota, e.esRegalo ? 1 : 0, subtotal, vence, ahora, o.ipHash, e.origen),
  ];
  for (const l of lineas.values()) {
    const p = porSlug.get(l.slug)!;
    sentencias.push(
      db.prepare(
        `INSERT INTO item_pedido (pedido_id, producto_id, nombre_al_comprar, descripcion_al_comprar, opcion, precio_al_comprar, cantidad) VALUES ((${idPedido}), ?, ?, ?, ?, ?, ?)`,
      ).bind(token, p.id, p.nombre, p.descripcion, l.opcion, p.precio, l.cantidad),
    );
  }
  for (const [slug, cantidad] of porProducto) {
    const p = porSlug.get(slug)!;
    // Sin condición a propósito: si no alcanza, el CHECK de la tabla hace fallar y revierte todo el pedido.
    sentencias.push(
      db.prepare('UPDATE producto SET stock_disponible = stock_disponible - ?, stock_reservado = stock_reservado + ? WHERE id = ?').bind(cantidad, cantidad, p.id),
      db.prepare(`INSERT INTO movimiento_stock (producto_id, cantidad, motivo, pedido_id, fecha) VALUES (?, ?, 'reserva', (${idPedido}), ?)`).bind(p.id, -cantidad, token, ahora),
    );
  }

  try {
    await db.batch(sentencias);
  } catch (err) {
    if (!/CHECK constraint/i.test(String(err))) throw err;
    const { results } = await db
      .prepare(`SELECT slug, nombre, stock_disponible FROM producto WHERE slug IN (${slugs.map(() => '?').join(',')})`)
      .bind(...slugs)
      .all<{ slug: string; nombre: string; stock_disponible: number }>();
    const conflictos = results
      .filter((r) => r.stock_disponible < (porProducto.get(r.slug) ?? 0))
      .map((r) => ({ slug: r.slug, nombre: r.nombre, disponibles: r.stock_disponible }));
    return { ok: false, codigo: 'sin_stock', conflictos };
  }

  const fila = await db.prepare('SELECT id FROM pedido WHERE token = ?').bind(token).first<{ id: number }>();
  return { ok: true, id: fila!.id, token, numero: numeroPedido(fila!.id) };
};

/** Busca un pedido por su token. Libera antes lo vencido para que el estado que se muestra sea el real. */
export const leerPedido = async (db: Base, token: string) => {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  await liberarVencidos(db);
  const pedido = await db
    .prepare(
      `SELECT p.id, p.token, p.nombre_entrega, c.whatsapp, p.tipo_entrega, p.direccion, p.localidad, p.cp, p.metodo_pago, p.nota, p.es_regalo,
              p.subtotal, p.descuento, p.costo_envio, p.seguimiento_empresa, p.seguimiento_codigo, p.link_pago, p.estado, p.estado_pago, p.reserva_vence_en, p.creado
       FROM pedido p JOIN cliente c ON c.id = p.cliente_id WHERE p.token = ?`,
    )
    .bind(token)
    .first<FilaPedido>();
  if (!pedido) return null;
  const { results: items } = await db
    .prepare('SELECT nombre_al_comprar, descripcion_al_comprar, opcion, precio_al_comprar, cantidad FROM item_pedido WHERE pedido_id = ? ORDER BY id')
    .bind(pedido.id)
    .all<FilaItem>();
  return { pedido, items };
};

export const marcarClicWhatsApp = (db: Base, token: string) =>
  db.prepare('UPDATE pedido SET whatsapp_clic_en = COALESCE(whatsapp_clic_en, ?) WHERE token = ?').bind(Date.now(), token).run();

/** Stock actual por slug, sin contar lo reservado. */
export const leerStock = async (db: Base, slugs: string[]) => {
  await liberarVencidos(db);
  const { results } = await db
    .prepare(`SELECT slug, stock_disponible FROM producto WHERE activo = 1 AND slug IN (${slugs.map(() => '?').join(',')})`)
    .bind(...slugs)
    .all<{ slug: string; stock_disponible: number }>();
  return Object.fromEntries(results.map((r) => [r.slug, r.stock_disponible]));
};
