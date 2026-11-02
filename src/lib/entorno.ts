// Configuración de las rutas de servidor. Solo se importa desde rutas con `prerender = false`.
import { getSecret } from 'astro:env/server';
import { obtenerBase } from './db';

export const env = {
  get DB() {
    return obtenerBase();
  },
  get HORAS_RESERVA() {
    return getSecret('HORAS_RESERVA') ?? '24';
  },
  get LIMITE_PEDIDOS_HORA_IP() {
    return getSecret('LIMITE_PEDIDOS_HORA_IP') ?? '10';
  },
  get LIMITE_PEDIDOS_ABIERTOS() {
    return getSecret('LIMITE_PEDIDOS_ABIERTOS') ?? '3';
  },
};

/** IP de quien hace el pedido. Vercel escribe este encabezado: el visitante no puede falsificarlo. */
export const ipCliente = (request: Request) => request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || null;
