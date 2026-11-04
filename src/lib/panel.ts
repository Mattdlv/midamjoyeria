// Operaciones del panel. Solo se importa desde rutas de /admin.
// Cada cambio de estado corre en una transacción y exige el estado leído: un doble clic
// o dos personas a la vez no pueden devolver o descontar stock dos veces.
import type { Base, Sentencia } from './db';
import { liberarVencidos, type FilaItem } from './pedidos';

export type PedidoPanel = {
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
  cupon: string | null;
  costo_envio: number | null;
  costo_envio_real: number | null;
  seguimiento_empresa: string | null;
  seguimiento_codigo: string | null;
  link_pago: string | null;
  nota_interna: string | null;
  estado: string;
  estado_pago: string;
  venta_registrada: number;
  whatsapp_clic_en: number | null;
  reserva_vence_en: number;
  creado: number;
  origen: string | null;
  pagado: number;
  items_cantidad: number;
};

export const ESTADOS: Record<string, string> = {
  creado: 'Por confirmar',
  confirmado: 'Confirmado',
  pagado: 'Pagado',
  preparado: 'En preparación',
  despachado: 'Despachado',
  listo_retiro: 'Listo para retirar',
  entregado: 'Entregado',
  vencido: 'Reserva vencida',
  cancelado: 'Cancelado',
  devuelto: 'Devuelto',
};

export const TRANSICIONES: Record<string, string[]> = {
  creado: ['confirmado', 'cancelado'],
  confirmado: ['preparado', 'cancelado'],
  pagado: ['preparado', 'cancelado'],
  preparado: ['despachado', 'listo_retiro', 'cancelado'],
  despachado: ['entregado', 'devuelto'],
  listo_retiro: ['entregado', 'cancelado'],
  entregado: ['devuelto'],
  vencido: ['creado'],
  cancelado: [],
  devuelto: [],
};

export const BANDEJAS = [
  { id: 'confirmar', nombre: 'Por confirmar', sql: `p.estado = 'creado'` },
  { id: 'cobrar', nombre: 'Por cobrar', sql: `p.estado = 'confirmado' AND p.metodo_pago <> 'efectivo'` },
  { id: 'preparar', nombre: 'Por preparar', sql: `p.estado = 'pagado' OR (p.estado = 'confirmado' AND p.metodo_pago = 'efectivo')` },
  { id: 'curso', nombre: 'En curso', sql: `p.estado IN ('preparado', 'despachado', 'listo_retiro')` },
  { id: 'cerrados', nombre: 'Cerrados', sql: `p.estado IN ('entregado', 'vencido', 'cancelado', 'devuelto')` },
] as const;

const SELECT_PEDIDO = `
  SELECT p.id, p.token, p.nombre_entrega, c.whatsapp, p.tipo_entrega, p.direccion, p.localidad, p.cp, p.metodo_pago, p.nota, p.es_regalo,
         p.subtotal, p.descuento, p.cupon, p.costo_envio, p.costo_envio_real, p.seguimiento_empresa, p.seguimiento_codigo, p.link_pago, p.nota_interna,
         p.estado, p.estado_pago, p.venta_registrada, p.whatsapp_clic_en, p.reserva_vence_en, p.creado, p.origen,
         (SELECT COALESCE(SUM(g.monto), 0) FROM pago g WHERE g.pedido_id = p.id) AS pagado,
         (SELECT COALESCE(SUM(i.cantidad), 0) FROM item_pedido i WHERE i.pedido_id = p.id) AS items_cantidad
  FROM pedido p JOIN cliente c ON c.id = p.cliente_id`;

export const totalPedido = (p: Pick<PedidoPanel, 'subtotal' | 'descuento' | 'costo_envio'>) => p.subtotal - p.descuento + (p.costo_envio ?? 0);

const POR_PAGINA = 30;

export const contarBandejas = async (db: Base) => {
  const columnas = BANDEJAS.map((b) => `SUM(CASE WHEN ${b.sql} THEN 1 ELSE 0 END) AS ${b.id}`).join(', ');
  const fila = await db.prepare(`SELECT ${columnas} FROM pedido p`).first<Record<string, number | null>>();
  return Object.fromEntries(BANDEJAS.map((b) => [b.id, fila?.[b.id] ?? 0])) as Record<string, number>;
};

export const listarPedidos = async (db: Base, o: { bandeja: string; q: string; pagina: number }) => {
  await liberarVencidos(db);
  const condiciones: string[] = [];
  const parametros: (string | number)[] = [];
  const q = o.q.trim();
  if (q) {
    const numero = q.match(/^m?-?0*(\d+)$/i);
    const digitos = q.replace(/\D/g, '');
    const parecido = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const partes = ['p.nombre_entrega LIKE ? ESCAPE \'\\\''];
    parametros.push(parecido);
    if (numero) {
      partes.push('p.id = ?');
      parametros.push(Number(numero[1]));
    }
    if (digitos.length >= 4) {
      partes.push('c.whatsapp LIKE ?');
      parametros.push(`%${digitos}%`);
    }
    condiciones.push(`(${partes.join(' OR ')})`);
  } else {
    const b = BANDEJAS.find((x) => x.id === o.bandeja) ?? BANDEJAS[0];
    condiciones.push(`(${b.sql})`);
  }
  const offset = (Math.max(1, o.pagina) - 1) * POR_PAGINA;
  const { results } = await db
    .prepare(`${SELECT_PEDIDO} WHERE ${condiciones.join(' AND ')} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
    .bind(...parametros, POR_PAGINA + 1, offset)
    .all<PedidoPanel>();
  return { pedidos: results.slice(0, POR_PAGINA), hayMas: results.length > POR_PAGINA };
};

export const leerPedidoPanel = async (db: Base, id: number) => {
  await liberarVencidos(db);
  const pedido = await db.prepare(`${SELECT_PEDIDO} WHERE p.id = ?`).bind(id).first<PedidoPanel>();
  if (!pedido) return null;
  const [items, pagos, historial] = await db.batch([
    db.prepare('SELECT nombre_al_comprar, descripcion_al_comprar, opcion, precio_al_comprar, cantidad FROM item_pedido WHERE pedido_id = ? ORDER BY id').bind(id),
    db.prepare('SELECT metodo, monto, referencia, fecha, registrado_por FROM pago WHERE pedido_id = ? ORDER BY id').bind(id),
    db.prepare('SELECT detalle, usuario, fecha FROM historial_pedido WHERE pedido_id = ? ORDER BY id DESC').bind(id),
  ]);
  return {
    pedido,
    items: items.results as FilaItem[],
    pagos: pagos.results as { metodo: string; monto: number; referencia: string | null; fecha: number; registrado_por: string }[],
    historial: historial.results as { detalle: string; usuario: string; fecha: number }[],
  };
};

export type Resultado = { ok: true } | { ok: false; error: string };

const CANTIDAD = `(SELECT COALESCE(SUM(i.cantidad), 0) FROM item_pedido i WHERE i.producto_id = producto.id AND i.pedido_id = ?1)`;
const DE_PEDIDO = `id IN (SELECT i.producto_id FROM item_pedido i WHERE i.pedido_id = ?1)`;
const SIGUE_IGUAL = `EXISTS (SELECT 1 FROM pedido WHERE id = ?1 AND estado = ?2 AND venta_registrada = ?3)`;

/** Mueve stock de todos los ítems del pedido y deja el movimiento, solo si el pedido sigue como se leyó. */
const moverStock = (db: Base, p: PedidoPanel, tipo: 'reservar' | 'liberar' | 'vender' | 'devolver', usuario: string, ahora: number) => {
  const sets = {
    reservar: `stock_disponible = stock_disponible - ${CANTIDAD}, stock_reservado = stock_reservado + ${CANTIDAD}`,
    liberar: `stock_disponible = stock_disponible + ${CANTIDAD}, stock_reservado = stock_reservado - ${CANTIDAD}`,
    vender: `stock_reservado = stock_reservado - ${CANTIDAD}`,
    devolver: `stock_disponible = stock_disponible + ${CANTIDAD}`,
  }[tipo];
  const mov = { reservar: ['reserva', -1], liberar: ['liberacion', 1], vender: ['venta', 0], devolver: ['devolucion', 1] } as const;
  const [motivo, signo] = mov[tipo];
  return [
    db.prepare(`INSERT INTO movimiento_stock (producto_id, cantidad, motivo, pedido_id, fecha, usuario)
      SELECT i.producto_id, ${signo} * SUM(i.cantidad), ?4, ?1, ?5, ?6 FROM item_pedido i WHERE i.pedido_id = ?1 AND ${SIGUE_IGUAL} GROUP BY i.producto_id`)
      .bind(p.id, p.estado, p.venta_registrada, motivo, ahora, usuario),
    db.prepare(`UPDATE producto SET ${sets} WHERE ${DE_PEDIDO} AND ${SIGUE_IGUAL}`).bind(p.id, p.estado, p.venta_registrada),
  ];
};

const anotar = (db: Base, p: PedidoPanel, detalle: string, usuario: string, ahora: number) =>
  db.prepare(`INSERT INTO historial_pedido (pedido_id, detalle, usuario, fecha) SELECT ?1, ?4, ?5, ?6 WHERE ${SIGUE_IGUAL}`)
    .bind(p.id, p.estado, p.venta_registrada, detalle, usuario, ahora);

const ejecutar = async (db: Base, sentencias: Sentencia[]): Promise<Resultado> => {
  try {
    const r = await db.batch(sentencias);
    return r.at(-1)!.meta.changes ? { ok: true } : { ok: false, error: 'cambio' };
  } catch (e) {
    if (/CHECK constraint/i.test(String(e))) return { ok: false, error: 'sin_stock' };
    throw e;
  }
};

export const cambiarEstado = async (db: Base, id: number, destino: string, usuario: string, horasReserva: number): Promise<Resultado> => {
  await liberarVencidos(db);
  const p = await db.prepare(`${SELECT_PEDIDO} WHERE p.id = ?`).bind(id).first<PedidoPanel>();
  if (!p) return { ok: false, error: 'no_existe' };
  if (!TRANSICIONES[p.estado]?.includes(destino)) return { ok: false, error: 'transicion' };
  if (destino === 'confirmado' && p.tipo_entrega === 'envio' && p.costo_envio == null) return { ok: false, error: 'falta_envio' };
  if (destino === 'despachado' && p.tipo_entrega !== 'envio') return { ok: false, error: 'transicion' };
  if (destino === 'listo_retiro' && p.tipo_entrega !== 'retiro') return { ok: false, error: 'transicion' };
  if (destino === 'entregado' && p.estado_pago !== 'pagado') return { ok: false, error: 'falta_pago' };

  const ahora = Date.now();
  const stock: Sentencia[] = [];
  if (destino === 'cancelado' || destino === 'devuelto') stock.push(...moverStock(db, p, p.venta_registrada ? 'devolver' : 'liberar', usuario, ahora));
  if (p.estado === 'vencido' && destino === 'creado') stock.push(...moverStock(db, p, 'reservar', usuario, ahora));

  const vence = destino === 'creado' ? ahora + horasReserva * 3_600_000 : p.reserva_vence_en;
  const devolverPago = (destino === 'cancelado' || destino === 'devuelto') && p.pagado > 0;
  return ejecutar(db, [
    ...stock,
    anotar(db, p, `${ESTADOS[p.estado]} → ${ESTADOS[destino]}`, usuario, ahora),
    db.prepare(`UPDATE pedido SET estado = ?, reserva_vence_en = ?, estado_pago = ?, actualizado = ? WHERE id = ? AND estado = ? AND venta_registrada = ?`)
      .bind(destino, vence, devolverPago ? 'devuelto' : p.estado_pago, ahora, id, p.estado, p.venta_registrada),
  ]);
};

export const METODOS_REGISTRO: Record<string, string> = { transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', efectivo: 'Efectivo', otro: 'Otro' };

export const registrarPago = async (db: Base, id: number, d: { metodo: string; monto: number; referencia: string | null }, usuario: string): Promise<Resultado> => {
  const p = await db.prepare(`${SELECT_PEDIDO} WHERE p.id = ?`).bind(id).first<PedidoPanel>();
  if (!p) return { ok: false, error: 'no_existe' };
  if (!['confirmado', 'pagado', 'preparado', 'despachado', 'listo_retiro'].includes(p.estado)) return { ok: false, error: 'pago_estado' };
  if (!(d.metodo in METODOS_REGISTRO) || !Number.isInteger(d.monto) || d.monto <= 0) return { ok: false, error: 'pago_datos' };
  const total = totalPedido(p);
  if (p.pagado + d.monto > total) return { ok: false, error: 'pago_excede' };

  const ahora = Date.now();
  const completo = p.pagado + d.monto === total;
  const stock = completo && !p.venta_registrada ? moverStock(db, p, 'vender', usuario, ahora) : [];
  const nuevoEstado = completo && p.estado === 'confirmado' ? 'pagado' : p.estado;
  // Los pagos se anotan solo si la suma sigue igual: un doble envío del formulario no registra dos veces.
  return ejecutar(db, [
    ...stock,
    anotar(db, p, `Pago de $${d.monto.toLocaleString('es-AR')} (${METODOS_REGISTRO[d.metodo]})`, usuario, ahora),
    db.prepare(`UPDATE pedido SET estado = ?, estado_pago = ?, venta_registrada = ?, actualizado = ? WHERE id = ? AND estado = ? AND venta_registrada = ? AND (SELECT COALESCE(SUM(monto), 0) FROM pago WHERE pedido_id = ?) = ?`)
      .bind(nuevoEstado, completo ? 'pagado' : 'parcial', completo ? 1 : p.venta_registrada, ahora, id, p.estado, p.venta_registrada, id, p.pagado),
    db.prepare(`INSERT INTO pago (pedido_id, metodo, monto, referencia, fecha, registrado_por) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(monto), 0) FROM pago WHERE pedido_id = ?) = ?`)
      .bind(id, d.metodo, d.monto, d.referencia, ahora, usuario, id, p.pagado),
  ]);
};

export const guardarEntrega = async (
  db: Base,
  id: number,
  d: { costoEnvio: number | null; costoReal: number | null; empresa: string | null; codigo: string | null; linkPago: string | null; nota: string | null },
  usuario: string,
): Promise<Resultado> => {
  const p = await db.prepare(`${SELECT_PEDIDO} WHERE p.id = ?`).bind(id).first<PedidoPanel>();
  if (!p) return { ok: false, error: 'no_existe' };
  const costo = p.tipo_entrega === 'retiro' ? null : d.costoEnvio;
  if (costo !== p.costo_envio && (p.pagado > 0 || ['entregado', 'cancelado', 'devuelto'].includes(p.estado))) return { ok: false, error: 'envio_bloqueado' };
  if (costo != null && (!Number.isInteger(costo) || costo < 0)) return { ok: false, error: 'monto' };
  if (d.costoReal != null && (!Number.isInteger(d.costoReal) || d.costoReal < 0)) return { ok: false, error: 'monto' };
  if (d.linkPago && !/^https:\/\/\S+$/.test(d.linkPago)) return { ok: false, error: 'link' };
  const ahora = Date.now();
  return ejecutar(db, [
    anotar(db, p, costo !== p.costo_envio ? `Envío: ${costo == null ? 'a confirmar' : `$${costo.toLocaleString('es-AR')}`}` : 'Datos de entrega actualizados', usuario, ahora),
    db.prepare(`UPDATE pedido SET costo_envio = ?, costo_envio_real = ?, seguimiento_empresa = ?, seguimiento_codigo = ?, link_pago = ?, nota_interna = ?, actualizado = ? WHERE id = ?`)
      .bind(costo, d.costoReal, d.empresa, d.codigo, d.linkPago, d.nota, ahora, id),
  ]);
};

export const extenderReserva = async (db: Base, id: number, horas: number, usuario: string): Promise<Resultado> => {
  await liberarVencidos(db);
  const p = await db.prepare(`${SELECT_PEDIDO} WHERE p.id = ?`).bind(id).first<PedidoPanel>();
  if (!p) return { ok: false, error: 'no_existe' };
  if (p.estado !== 'creado') return { ok: false, error: 'transicion' };
  const ahora = Date.now();
  return ejecutar(db, [
    anotar(db, p, `Reserva extendida ${horas} horas`, usuario, ahora),
    db.prepare(`UPDATE pedido SET reserva_vence_en = reserva_vence_en + ?, actualizado = ? WHERE id = ? AND estado = 'creado'`).bind(horas * 3_600_000, ahora, id),
  ]);
};

// Stock

export type ProductoStock = { id: string; codigo: string; slug: string; nombre: string; descripcion: string; precio: number; stock_disponible: number; stock_reservado: number; activo: number; sin_foto: number };

export const listarStock = async (db: Base, q: string, soloBajo: boolean) => {
  await liberarVencidos(db);
  const condiciones = ['1 = 1'];
  const parametros: string[] = [];
  if (q.trim()) {
    const parecido = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
    condiciones.push(`(nombre LIKE ? ESCAPE '\\' OR descripcion LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\')`);
    parametros.push(parecido, parecido, parecido);
  }
  if (soloBajo) condiciones.push('stock_disponible = 0');
  const { results } = await db
    .prepare(`SELECT id, codigo, slug, nombre, descripcion, precio, stock_disponible, stock_reservado, activo, json_array_length(fotos) = 0 AS sin_foto FROM producto WHERE ${condiciones.join(' AND ')} ORDER BY activo DESC, nombre`)
    .bind(...parametros)
    .all<ProductoStock>();
  return results;
};

export const leerProductoStock = async (db: Base, id: string) => {
  await liberarVencidos(db);
  const producto = await db.prepare('SELECT id, codigo, slug, nombre, descripcion, precio, stock_disponible, stock_reservado, activo, json_array_length(fotos) = 0 AS sin_foto FROM producto WHERE id = ?').bind(id).first<ProductoStock>();
  if (!producto) return null;
  const { results: movimientos } = await db
    .prepare(`SELECT m.cantidad, m.motivo, m.fecha, m.usuario, m.nota, m.pedido_id FROM movimiento_stock m WHERE m.producto_id = ? ORDER BY m.id DESC LIMIT 50`)
    .bind(id)
    .all<{ cantidad: number; motivo: string; fecha: number; usuario: string | null; nota: string | null; pedido_id: number | null }>();
  return { producto, movimientos };
};

export const ventaOtroCanal = async (db: Base, id: string, cantidad: number, nota: string | null, usuario: string): Promise<Resultado> => {
  if (!Number.isInteger(cantidad) || cantidad < 1) return { ok: false, error: 'monto' };
  return ejecutar(db, [
    db.prepare(`INSERT INTO movimiento_stock (producto_id, cantidad, motivo, fecha, usuario, nota) VALUES (?, ?, 'venta_otro_canal', ?, ?, ?)`).bind(id, -cantidad, Date.now(), usuario, nota),
    db.prepare('UPDATE producto SET stock_disponible = stock_disponible - ? WHERE id = ?').bind(cantidad, id),
  ]);
};

/** Conteo físico: fija lo disponible y registra la diferencia, si nadie lo cambió desde que se abrió la pantalla. */
export const ajustarConteo = async (db: Base, id: string, previo: number, nuevo: number, nota: string | null, usuario: string): Promise<Resultado> => {
  if (!Number.isInteger(nuevo) || nuevo < 0 || !Number.isInteger(previo)) return { ok: false, error: 'monto' };
  if (nuevo === previo) return { ok: true };
  return ejecutar(db, [
    db.prepare(`INSERT INTO movimiento_stock (producto_id, cantidad, motivo, fecha, usuario, nota) SELECT ?, ?, 'ajuste', ?, ?, ? WHERE EXISTS (SELECT 1 FROM producto WHERE id = ? AND stock_disponible = ?)`)
      .bind(id, nuevo - previo, Date.now(), usuario, nota, id, previo),
    db.prepare('UPDATE producto SET stock_disponible = ? WHERE id = ? AND stock_disponible = ?').bind(nuevo, id, previo),
  ]);
};

// Configuración

export const CLAVES_CONFIG = ['datos_transferencia', 'punto_retiro'] as const;
export type ConfigTienda = Partial<Record<(typeof CLAVES_CONFIG)[number], string>>;

export const leerConfig = async (db: Base): Promise<ConfigTienda> => {
  const { results } = await db.prepare('SELECT clave, valor FROM configuracion').all<{ clave: string; valor: string }>();
  return Object.fromEntries(results.map((r) => [r.clave, r.valor]));
};

export const guardarConfig = async (db: Base, valores: ConfigTienda, usuario: string) => {
  const ahora = Date.now();
  await db.batch(
    CLAVES_CONFIG.map((clave) =>
      db.prepare('INSERT INTO configuracion (clave, valor, actualizado, usuario) VALUES (?, ?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado, usuario = excluded.usuario')
        .bind(clave, (valores[clave] ?? '').slice(0, 500), ahora, usuario),
    ),
  );
};

// Exportación

const celda = (v: unknown) => {
  let s = v == null ? '' : String(v);
  // Evita que Excel interprete como fórmula un texto que escribió un cliente.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export const aCsv = (filas: unknown[][]) => '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';

export const exportarPedidos = async (db: Base) => {
  const { results } = await db.prepare(`${SELECT_PEDIDO} ORDER BY p.id DESC`).all<PedidoPanel>();
  return aCsv([
    ['Pedido', 'Fecha', 'Estado', 'Pago', 'Cliente', 'WhatsApp', 'Entrega', 'Localidad', 'CP', 'Subtotal', 'Descuento', 'Cupón', 'Envío cobrado', 'Envío real', 'Total', 'Pagado', 'Origen'],
    ...results.map((p) => [
      `M-${String(p.id).padStart(4, '0')}`, new Date(p.creado).toISOString(), ESTADOS[p.estado], p.estado_pago, p.nombre_entrega, p.whatsapp, p.tipo_entrega, p.localidad, p.cp,
      p.subtotal, p.descuento, p.cupon, p.costo_envio, p.costo_envio_real, totalPedido(p), p.pagado, p.origen,
    ]),
  ]);
};

export const exportarStock = async (db: Base) => {
  const lista = await listarStock(db, '', false);
  return aCsv([['Código', 'Nombre', 'Descripción', 'Precio', 'Disponible', 'Reservado'], ...lista.map((p) => [p.codigo, p.nombre, p.descripcion, p.precio, p.stock_disponible, p.stock_reservado])]);
};
