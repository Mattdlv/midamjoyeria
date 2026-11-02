import type { APIRoute } from 'astro';
import { env, ipCliente } from '../../lib/entorno';
import { crearPedido, hashIp, validarEntrada } from '../../lib/pedidos';

export const prerender = false;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, url }) => {
  // Solo se aceptan pedidos enviados desde la propia tienda.
  const origen = request.headers.get('origin');
  if (!origen || ![url.host, request.headers.get('host')].includes(new URL(origen).host)) return json({ codigo: 'origen' }, 403);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ codigo: 'invalido', mensaje: 'No pudimos leer el pedido.' }, 400);
  }

  // Campo oculto: una persona no lo completa. Se responde igual que un error genérico.
  if (cuerpo.sitio) return json({ codigo: 'invalido', mensaje: 'No pudimos procesar el pedido.' }, 400);

  const validado = validarEntrada(cuerpo);
  if ('errores' in validado) return json({ codigo: 'campos', errores: validado.errores }, 422);

  const ip = ipCliente(request);
  const r = await crearPedido(env.DB, validado.entrada, {
    horasReserva: Number(env.HORAS_RESERVA),
    limiteIpHora: Number(env.LIMITE_PEDIDOS_HORA_IP),
    limiteAbiertos: Number(env.LIMITE_PEDIDOS_ABIERTOS),
    ipHash: ip ? await hashIp(ip) : null,
  });

  if (r.ok) return json({ token: r.token, numero: r.numero }, 201);
  if (r.codigo === 'sin_stock') return json(r, 409);
  if (r.codigo === 'limite') return json(r, 429);
  return json(r, 422);
};
