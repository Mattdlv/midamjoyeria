// Criterios de aceptación de la Fase 6, contra el servidor local.
// Necesita `npm run dev` corriendo y la base local con migraciones y catálogo.
// Modifica stock de la base local: se vuelve atrás con `npm run db:limpiar`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
let ipN = 0;
let telN = 0;

const pedir = (cuerpo, { origen = BASE, ip } = {}) =>
  fetch(`${BASE}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origen ? { Origin: origen } : {}), 'x-vercel-forwarded-for': ip ?? `10.0.0.${++ipN}` },
    body: JSON.stringify(cuerpo),
  });

const datos = (items, extra = {}) => ({
  nombre: 'Prueba Ñandú',
  whatsapp: `380${String(4000000 + ++telN + (Date.now() % 900000))}`,
  tipoEntrega: 'retiro',
  metodoPago: 'transferencia',
  items,
  ...extra,
});

const sql = (consulta) => JSON.parse(execFileSync('node', ['scripts/db.mjs', 'consulta', consulta], { encoding: 'utf8' }));

const stock = async (slug) => (await (await fetch(`${BASE}/api/stock?slugs=${slug}`)).json())[slug];
const fijarStock = (slug, n) => sql(`UPDATE producto SET stock_disponible = ${n}, stock_reservado = 0 WHERE slug = '${slug}'`);
const SIMPLE = 'aros-de-flor'; // Catwoman: sin opciones
const CON_OPCION = 'aros-de-flor-esmaltada'; // Ravenna: tres tonos

test('dos compras simultáneas de la última unidad: solo una se concreta', async () => {
  fijarStock(SIMPLE, 1);
  const r = await Promise.all([1, 2, 3, 4].map(() => pedir(datos([{ slug: SIMPLE, opcion: null, cantidad: 1 }]))));
  const codigos = r.map((x) => x.status).sort();
  assert.deepEqual(codigos, [201, 409, 409, 409]);
  assert.equal(await stock(SIMPLE), 0);
  const conflicto = await r.find((x) => x.status === 409).json();
  assert.equal(conflicto.conflictos[0].slug, SIMPLE);
  assert.equal(conflicto.conflictos[0].disponibles, 0);
});

test('si una pieza no alcanza, no se reserva ninguna del pedido', async () => {
  fijarStock(SIMPLE, 0);
  fijarStock(CON_OPCION, 2);
  const r = await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }, { slug: SIMPLE, opcion: null, cantidad: 1 }]));
  assert.equal(r.status, 409);
  assert.equal(await stock(CON_OPCION), 2);
});

test('un precio alterado en el navegador no cambia el total', async () => {
  fijarStock(CON_OPCION, 2);
  const r = await pedir(datos([{ slug: CON_OPCION, opcion: 'Blanco con dorado', cantidad: 2, precio: 1 }], { subtotal: 1, total: 1 }));
  assert.equal(r.status, 201);
  const { token } = await r.json();
  const html = await (await fetch(`${BASE}/pedido/${token}`)).text();
  assert.ok(html.includes('$22.000'), 'el comprobante muestra el precio de la base');
  assert.equal(await stock(CON_OPCION), 0);
});

test('líneas repartidas entre opciones descuentan del mismo stock', async () => {
  fijarStock(CON_OPCION, 1);
  const r = await pedir(datos([{ slug: CON_OPCION, opcion: 'Blanco con dorado', cantidad: 1 }, { slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }]));
  assert.equal(r.status, 409);
});

test('valida opción, datos y origen', async () => {
  fijarStock(CON_OPCION, 2);
  assert.equal((await pedir(datos([{ slug: CON_OPCION, opcion: null, cantidad: 1 }]))).status, 422, 'falta opción');
  assert.equal((await pedir(datos([{ slug: CON_OPCION, opcion: 'Inventada', cantidad: 1 }]))).status, 422, 'opción inexistente');
  assert.equal((await pedir(datos([{ slug: 'no-existe', opcion: null, cantidad: 1 }]))).status, 422, 'pieza inexistente');
  assert.equal((await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: -1 }]))).status, 422, 'cantidad negativa');
  const campos = await pedir({ ...datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }]), whatsapp: '123', tipoEntrega: 'envio' });
  assert.equal(campos.status, 422);
  const { errores } = await campos.json();
  assert.ok(errores.whatsapp && errores.direccion && errores.cp);
  const efectivo = await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }], { tipoEntrega: 'envio', direccion: 'Calle 1', localidad: 'La Rioja', cp: '5300', metodoPago: 'efectivo' }));
  assert.equal(efectivo.status, 422, 'efectivo solo con retiro');
  assert.equal((await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }]), { origen: 'https://otro.example' })).status, 403);
  assert.equal((await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }]), { origen: null })).status, 403);
  assert.equal((await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }], { sitio: 'spam' }))).status, 400, 'trampa de bots');
  assert.equal(await stock(CON_OPCION), 2, 'ningún rechazo reserva stock');
});

test('el mensaje llega con acentos, símbolos y sin datos personales en la URL', async () => {
  fijarStock(CON_OPCION, 2);
  const r = await pedir(datos([{ slug: CON_OPCION, opcion: 'Negro con plateado', cantidad: 1 }], {
    tipoEntrega: 'envio', direccion: 'Calle Secreta 123', localidad: 'La Rioja', cp: '5300', nombre: 'María & José #1', whatsapp: '380 15 415 1249',
  }));
  assert.equal(r.status, 201);
  const { token, numero } = await r.json();
  const html = await (await fetch(`${BASE}/pedido/${token}/confirmacion`)).text();
  const href = html.match(/id="enviar"[^>]*href="([^"]+)"/)?.[1] ?? html.match(/href="(https:\/\/wa\.me[^"]+)"[^>]*id="enviar"/)?.[1];
  assert.ok(href, 'hay enlace de WhatsApp');
  const url = new URL(href.replaceAll('&amp;', '&'));
  assert.equal(url.pathname, '/5493804151249');
  const texto = url.searchParams.get('text');
  assert.ok(texto.includes(numero));
  assert.ok(texto.includes('¡Hola Midam!'));
  assert.ok(texto.includes('María & José #1'), 'acentos y símbolos sobreviven al enlace');
  assert.ok(texto.includes('Negro con plateado'));
  assert.ok(texto.includes(`/pedido/${token}`));
  assert.ok(!texto.includes('Calle Secreta'), 'sin dirección');
  assert.ok(!texto.includes('4151249') , 'sin teléfono del cliente');
  assert.ok(href.length < 2000, 'largo razonable');
  const fila = sql(`SELECT c.whatsapp FROM pedido p JOIN cliente c ON c.id = p.cliente_id WHERE p.token = '${token}'`)[0];
  assert.equal(fila.whatsapp, '5493804151249', 'normaliza el 15');
  const clic = await fetch(`${BASE}/api/pedidos/${token}/clic`, { method: 'POST' });
  assert.equal(clic.status, 204);
  assert.ok(sql(`SELECT whatsapp_clic_en c FROM pedido WHERE token = '${token}'`)[0].c > 0);
});

test('el comprobante no se indexa ni se accede sin el token', async () => {
  fijarStock(CON_OPCION, 2);
  const { token } = await (await pedir(datos([{ slug: CON_OPCION, opcion: 'Blanco con dorado', cantidad: 1 }]))).json();
  const ok = await fetch(`${BASE}/pedido/${token}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get('x-robots-tag')?.includes('noindex'));
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const cuerpo = await ok.text();
  assert.ok(cuerpo.includes('no es una factura'));
  assert.ok(cuerpo.includes('Comprobante de pedido'));
  assert.equal((await fetch(`${BASE}/pedido/${'0'.repeat(48)}`)).status, 404);
  assert.equal((await fetch(`${BASE}/pedido/1`)).status, 404);
});

test('una reserva vencida libera el stock una sola vez', async () => {
  fijarStock(CON_OPCION, 2);
  const { token } = await (await pedir(datos([{ slug: CON_OPCION, opcion: 'Blanco con dorado', cantidad: 2 }]))).json();
  assert.equal(await stock(CON_OPCION), 0);
  sql(`UPDATE pedido SET reserva_vence_en = 1 WHERE token = '${token}'`);
  await Promise.all([stock(CON_OPCION), stock(CON_OPCION), stock(CON_OPCION)]);
  assert.equal(await stock(CON_OPCION), 2);
  const html = await (await fetch(`${BASE}/pedido/${token}`)).text();
  assert.ok(html.includes('Reserva vencida'));
  const mov = sql(`SELECT COUNT(*) n FROM movimiento_stock m JOIN pedido p ON p.id = m.pedido_id WHERE p.token = '${token}' AND m.motivo = 'liberacion'`)[0];
  assert.equal(mov.n, 1);
});

test('limita pedidos abiertos por teléfono y por IP', async () => {
  fijarStock(CON_OPCION, 20);
  const tel = '3807777777';
  const item = [{ slug: CON_OPCION, opcion: 'Blanco con dorado', cantidad: 1 }];
  const resultados = [];
  for (let i = 0; i < 4; i++) resultados.push((await pedir(datos(item, { whatsapp: tel }))).status);
  assert.deepEqual(resultados, [201, 201, 201, 429]);
  const ip = '10.9.9.9';
  const porIp = [];
  for (let i = 0; i < 11; i++) porIp.push((await pedir(datos(item), { ip })).status);
  assert.equal(porIp.filter((s) => s === 201).length, 10);
  assert.equal(porIp.at(-1), 429);
});
