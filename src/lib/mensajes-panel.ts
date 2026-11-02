// Mensaje que corresponde enviarle al cliente según cómo está su pedido.
// Abren WhatsApp con el texto listo: la persona lo revisa y lo envía.
import { formatoPrecio } from './catalogo';
import { numeroPedido } from './pedidos';
import { totalPedido, type ConfigTienda, type PedidoPanel } from './panel';

export type MensajeSugerido = { titulo: string; texto: string; aviso?: string };

export const enlaceCliente = (whatsapp: string, texto: string) => `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`;

const primerNombre = (n: string) => n.trim().split(/\s+/)[0];

const comoPagar = (p: PedidoPanel, c: ConfigTienda): { lineas: string[]; aviso?: string } => {
  if (p.metodo_pago === 'efectivo') return { lineas: ['Pagás en efectivo cuando lo retirás.'] };
  if (p.metodo_pago === 'mercado_pago') {
    return p.link_pago
      ? { lineas: [`Podés pagar acá: ${p.link_pago}`] }
      : { lineas: ['Enseguida te paso el link de pago.'], aviso: 'Falta cargar el link de Mercado Pago de este pedido.' };
  }
  return c.datos_transferencia
    ? { lineas: ['Datos para la transferencia:', c.datos_transferencia, '', 'Cuando la hagas, mandame el comprobante por acá.'] }
    : { lineas: ['Enseguida te paso los datos para la transferencia.'], aviso: 'Faltan los datos de transferencia en Ajustes.' };
};

export const mensajeSugerido = (p: PedidoPanel, c: ConfigTienda, origen: string): MensajeSugerido | null => {
  const numero = numeroPedido(p.id);
  const nombre = primerNombre(p.nombre_entrega);
  const comprobante = `Comprobante: ${origen}/pedido/${p.token}`;
  const total = formatoPrecio(totalPedido(p));

  switch (p.estado) {
    case 'creado':
      return {
        titulo: p.whatsapp_clic_en ? 'Avisar que lo estás revisando' : 'Recordar el pedido',
        texto: `¡Hola ${nombre}! Te escribo de Midam por tu pedido ${numero}. ¿Seguimos con la compra?\n\n${comprobante}`,
      };
    case 'confirmado': {
      const pago = comoPagar(p, c);
      const envio = p.tipo_entrega === 'envio' ? `Envío: ${formatoPrecio(p.costo_envio ?? 0)}\n` : '';
      return {
        titulo: 'Confirmar y pasar datos de pago',
        texto: [`¡Hola ${nombre}! Confirmamos tu pedido ${numero}.`, '', `${envio}Total: ${total}`, '', ...pago.lineas, '', comprobante].join('\n'),
        aviso: pago.aviso,
      };
    }
    case 'pagado':
      return { titulo: 'Avisar que recibiste el pago', texto: `¡Hola ${nombre}! Recibimos tu pago del pedido ${numero}. Ya lo estamos preparando.\n\n${comprobante}` };
    case 'despachado': {
      const seguimiento = [p.seguimiento_empresa, p.seguimiento_codigo].filter(Boolean).join(': ');
      return {
        titulo: 'Avisar que salió',
        texto: `¡Hola ${nombre}! Tu pedido ${numero} ya salió.${seguimiento ? `\nSeguimiento: ${seguimiento}` : ''}\n\n${comprobante}`,
        aviso: seguimiento ? undefined : 'Falta cargar el seguimiento.',
      };
    }
    case 'listo_retiro':
      return {
        titulo: 'Avisar que está listo',
        texto: `¡Hola ${nombre}! Tu pedido ${numero} está listo para retirar.${c.punto_retiro ? `\n${c.punto_retiro}` : ''}${p.estado_pago !== 'pagado' ? `\nTotal a pagar: ${formatoPrecio(totalPedido(p) - p.pagado)}` : ''}`,
        aviso: c.punto_retiro ? undefined : 'Falta el lugar de retiro en Ajustes.',
      };
    case 'vencido':
      return { titulo: 'Avisar que venció la reserva', texto: `¡Hola ${nombre}! La reserva de tu pedido ${numero} venció. Si todavía lo querés, avisame y me fijo si sigue disponible.` };
    default:
      return null;
  }
};
