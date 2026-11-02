import { enlaceWhatsApp, formatoPrecio } from './catalogo';

export type ItemMensaje = { nombre: string; descripcion: string; opcion: string | null; precio: number; cantidad: number };
export type DatosMensaje = {
  numero: string;
  nombre: string;
  items: ItemMensaje[];
  subtotal: number;
  tipoEntrega: 'retiro' | 'envio';
  cp: string | null;
  metodoPago: string;
  enlaceComprobante: string;
};

export const METODOS_PAGO: Record<string, string> = {
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  efectivo: 'Efectivo al retirar',
};

/** Fecha y hora de La Rioja, en 24 horas. */
export const fechaLocal = (ms: number) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/La_Rioja' }).format(ms);

const MAX_LINEAS = 12;

const lineaItem = (i: ItemMensaje) =>
  `• ${i.cantidad} × ${i.nombre}, ${i.descripcion.toLowerCase()}${i.opcion ? ` (${i.opcion})` : ''}: ${formatoPrecio(i.precio * i.cantidad)}`;

/**
 * La dirección y el teléfono no van acá porque el mensaje viaja en la URL del enlace.
 * Quedan en el comprobante. El cliente puede editar este texto: el dato válido es el pedido guardado.
 */
export const armarMensaje = (d: DatosMensaje) => {
  const visibles = d.items.slice(0, MAX_LINEAS).map(lineaItem);
  const resto = d.items.length - visibles.length;
  if (resto > 0) visibles.push(`• y ${resto} más (en el comprobante)`);
  return [
    `¡Hola Midam! Quiero confirmar mi pedido ${d.numero}:`,
    '',
    ...visibles,
    '',
    `Subtotal: ${formatoPrecio(d.subtotal)}`,
    d.tipoEntrega === 'envio' ? `Envío: a confirmar${d.cp ? ` (CP ${d.cp})` : ''}` : 'Entrega: retiro',
    `Pago: ${(METODOS_PAGO[d.metodoPago] ?? d.metodoPago).toLowerCase()}`,
    `A nombre de: ${d.nombre}`,
    '',
    `Comprobante: ${d.enlaceComprobante}`,
  ].join('\n');
};

export const enlaceMensaje = (d: DatosMensaje) => enlaceWhatsApp(armarMensaje(d));
