// Flujo del panel contra el servidor local, con ADMIN_DEV_EMAIL en .dev.vars.
// Modifica pedidos y stock de la base local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const A = 'aros-de-flor-esmaltada'; // Ravenna, $11.000
const OP = 'Blanco con dorado';
let n = 0;

const sql = (consulta) => JSON.parse(execFileSync('node', ['scripts/db.mjs', 'consulta', consulta], { encoding: 'utf8' }));
const fijarStock = (slug, disponible) => sql(`UPDATE producto SET stock_disponible = ${disponible}, stock_reservado = 0 WHERE slug = '${slug}'`);
const stock = (slug) => sql(`SELECT stock_disponible d, stock_reservado r FROM producto WHERE slug = '${slug}'`)[0];

const crear = async (extra = {}, cantidad = 1) => {
  n += 1;
  const r = await fetch(`${BASE}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-vercel-forwarded-for': `10.1.${Date.now() % 250}.${n}` },
    body: JSON.stringify({ nombre: 'Ana Prueba', whatsapp: `380${5000000 + (Date.now() % 900000) + n}`, tipoEntrega: 'retiro', metodoPago: 'transferencia', items: [{ slug: A, opcion: OP, cantidad }], ...extra }),
  });
  assert.equal(r.status, 201);
  const { token, numero } = await r.json();
  return { id: Number(numero.slice(2)), token };
};

/** Envía un formulario del panel y devuelve el aviso de la redirección. */
const accion = async (ruta, campos, origen = BASE) => {
  const r = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: origen, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos),
  });
  assert.equal(r.status, 303, `${ruta} ${JSON.stringify(campos)} → ${r.status}`);
  return new URL(r.headers.get('location'), BASE).searchParams.get('aviso');
};
const estado = (id, destino) => accion(`/admin/pedidos/${id}`, { accion: 'estado', destino });
const pago = (id, monto, metodo = 'transferencia') => accion(`/admin/pedidos/${id}`, { accion: 'pago', monto: String(monto), metodo });
const entrega = (id, campos) => accion(`/admin/pedidos/${id}`, { accion: 'entrega', ...campos });
const pedido = (id) => sql(`SELECT estado, estado_pago ep, venta_registrada v, costo_envio ce FROM pedido WHERE id = ${id}`)[0];
const pagina = async (ruta) => (await fetch(`${BASE}${ruta}`)).text();

test('flujo completo de retiro: confirmar, cobrar, preparar, entregar', async () => {
  fijarStock(A, 2);
  const { id, token } = await crear();
  assert.deepEqual(stock(A), { d: 1, r: 1 });
  assert.equal(await estado(id, 'confirmado'), 'guardado');
  assert.equal(await estado(id, 'entregado'), 'transicion', 'no saltea pasos');
  assert.equal(await pago(id, 11000), 'guardado');
  assert.equal(pedido(id).estado, 'pagado');
  assert.deepEqual(stock(A), { d: 1, r: 0 }, 'la reserva pasa a venta');
  assert.equal(await estado(id, 'preparado'), 'guardado');
  assert.equal(await estado(id, 'despachado'), 'transicion', 'retiro no se despacha');
  assert.equal(await estado(id, 'listo_retiro'), 'guardado');
  assert.equal(await estado(id, 'entregado'), 'guardado');
  assert.equal(pedido(id).estado, 'entregado');
  assert.deepEqual(stock(A), { d: 1, r: 0 });
  const html = await pagina(`/pedido/${token}`);
  assert.ok(html.includes('Entregado') && html.includes('Pago recibido'));
});

test('envío: exige costo para confirmar, lo suma al total y bloquea cambios tras cobrar', async () => {
  fijarStock(A, 2);
  const { id, token } = await crear({ tipoEntrega: 'envio', direccion: 'Calle 1', localidad: 'La Rioja', cp: '5300' });
  assert.equal(await estado(id, 'confirmado'), 'falta_envio');
  await entrega(id, { nota_interna: 'no borrar', empresa: 'Correo' });
  assert.equal(await accion(`/admin/pedidos/${id}`, { accion: 'costo', costo_envio: '$2.500' }), 'guardado');
  assert.equal(sql(`SELECT nota_interna n FROM pedido WHERE id = ${id}`)[0].n, 'no borrar', 'el costo rápido no pisa otros datos');
  assert.equal(await accion(`/admin/pedidos/${id}`, { accion: 'costo', costo_envio: 'gratis' }), 'monto');
  assert.equal(pedido(id).ce, 2500);
  assert.equal(await estado(id, 'confirmado'), 'guardado');
  assert.ok((await pagina(`/pedido/${token}`)).includes('$13.500'), 'comprobante con envío');
  assert.equal(await pago(id, 11000), 'guardado', 'pago parcial');
  assert.equal(pedido(id).ep, 'parcial');
  assert.equal(pedido(id).v, 0, 'parcial no pasa a venta');
  assert.equal(await entrega(id, { costo_envio: '100' }), 'envio_bloqueado');
  assert.equal(await pago(id, 9999), 'pago_excede');
  assert.equal(await pago(id, 2500), 'guardado');
  assert.equal(pedido(id).ep, 'pagado');
  assert.equal(await estado(id, 'preparado'), 'guardado');
  assert.equal(await estado(id, 'listo_retiro'), 'transicion', 'envío no se retira');
  assert.equal(await entrega(id, { costo_envio: '2500', empresa: 'Correo', codigo: 'AB123' }), 'guardado');
  assert.equal(await estado(id, 'despachado'), 'guardado');
  const panel = await pagina(`/admin/pedidos/${id}`);
  assert.ok(panel.includes('AB123'));
  assert.ok((await pagina(`/pedido/${token}`)).includes('Correo: AB123'));
});

test('no se entrega sin cobrar', async () => {
  fijarStock(A, 1);
  const { id } = await crear({ metodoPago: 'efectivo' });
  await estado(id, 'confirmado');
  await estado(id, 'preparado');
  await estado(id, 'listo_retiro');
  assert.equal(await estado(id, 'entregado'), 'falta_pago');
  assert.equal(await pago(id, 11000, 'efectivo'), 'guardado');
  assert.equal(pedido(id).estado, 'listo_retiro', 'cobrar no retrocede el estado');
  assert.equal(await estado(id, 'entregado'), 'guardado');
});

test('cancelar devuelve el stock una sola vez, aun con clics simultáneos', async () => {
  fijarStock(A, 2);
  const { id } = await crear({}, 2);
  assert.deepEqual(stock(A), { d: 0, r: 2 });
  const r = await Promise.all([estado(id, 'cancelado'), estado(id, 'cancelado'), estado(id, 'cancelado')]);
  assert.equal(r.filter((x) => x === 'guardado').length, 1, r.join());
  assert.deepEqual(stock(A), { d: 2, r: 0 });
});

test('devolver o cancelar lo ya vendido repone stock sin tocar reservas', async () => {
  fijarStock(A, 1);
  const { id } = await crear();
  await estado(id, 'confirmado');
  await pago(id, 11000);
  assert.deepEqual(stock(A), { d: 0, r: 0 });
  await estado(id, 'cancelado');
  assert.deepEqual(stock(A), { d: 1, r: 0 });
  assert.equal(pedido(id).ep, 'devuelto');
  assert.equal(await estado(id, 'cancelado'), 'transicion');
});

test('un pago enviado dos veces a la vez se registra una vez', async () => {
  fijarStock(A, 1);
  const { id } = await crear();
  await estado(id, 'confirmado');
  await Promise.all([pago(id, 11000), pago(id, 11000)]);
  assert.equal(sql(`SELECT COUNT(*) n, SUM(monto) s FROM pago WHERE pedido_id = ${id}`)[0].s, 11000);
  assert.deepEqual(stock(A), { d: 0, r: 0 });
});

test('una reserva confirmada no vence; una sin confirmar sí, y se puede reactivar si hay stock', async () => {
  fijarStock(A, 2);
  const uno = await crear();
  const dos = await crear();
  await estado(uno.id, 'confirmado');
  sql(`UPDATE pedido SET reserva_vence_en = 1 WHERE id IN (${uno.id}, ${dos.id})`);
  await pagina('/admin');
  assert.equal(pedido(uno.id).estado, 'confirmado');
  assert.equal(pedido(dos.id).estado, 'vencido');
  assert.deepEqual(stock(A), { d: 1, r: 1 });
  await accion('/admin/stock/' + sql(`SELECT id FROM producto WHERE slug = '${A}'`)[0].id, { accion: 'venta', cantidad: '1' });
  assert.equal(await estado(dos.id, 'creado'), 'sin_stock', 'sin stock no reactiva');
  assert.equal(pedido(dos.id).estado, 'vencido');
  fijarStock(A, 1);
  assert.equal(await estado(dos.id, 'creado'), 'guardado');
  assert.equal(pedido(dos.id).estado, 'creado');
  assert.deepEqual(stock(A), { d: 0, r: 1 });
});

test('stock: venta en otro canal, tope y conteo con historial', async () => {
  fijarStock(A, 3);
  const pid = sql(`SELECT id FROM producto WHERE slug = '${A}'`)[0].id;
  const ruta = `/admin/stock/${pid}`;
  assert.equal(await accion(ruta, { accion: 'venta', cantidad: '2', nota: 'Instagram' }), 'guardado');
  assert.equal(stock(A).d, 1);
  assert.equal(await accion(ruta, { accion: 'venta', cantidad: '5' }), 'sin_stock');
  assert.equal(stock(A).d, 1, 'no descuenta de más');
  assert.equal(await accion(ruta, { accion: 'venta', cantidad: '-1' }), 'monto');
  assert.equal(await accion(ruta, { accion: 'conteo', previo: '9', nuevo: '4' }), 'cambio', 'pantalla desactualizada');
  assert.equal(stock(A).d, 1);
  assert.equal(await accion(ruta, { accion: 'conteo', previo: '1', nuevo: '4', nota: 'recuento' }), 'guardado');
  assert.equal(stock(A).d, 4);
  const html = await pagina(ruta);
  assert.ok(html.includes('Instagram') && html.includes('recuento') && html.includes('dev@midam.local'));
  assert.equal(await accion('/admin/stock', { producto: pid }), 'guardado');
  assert.equal(stock(A).d, 3);
});

test('datos de pago: se ven recién al confirmar, y el mensaje los incluye', async () => {
  fijarStock(A, 1);
  await accion('/admin/ajustes', { datos_transferencia: 'Alias: prueba.local', punto_retiro: 'Plaza de prueba' });
  const { id, token } = await crear();
  assert.ok(!(await pagina(`/pedido/${token}`)).includes('prueba.local'), 'oculto antes de confirmar');
  await estado(id, 'confirmado');
  assert.ok((await pagina(`/pedido/${token}`)).includes('prueba.local'));
  const panel = await pagina(`/admin/pedidos/${id}`);
  const href = panel.match(/href="(https:\/\/wa\.me\/[^"]+)"/)[1].replaceAll('&amp;', '&');
  const url = new URL(href);
  assert.ok(url.pathname.startsWith('/549380'), 'va al teléfono del cliente');
  const texto = url.searchParams.get('text');
  assert.ok(texto.includes('prueba.local') && texto.includes('$11.000') && texto.includes(`/pedido/${token}`));
  await accion('/admin/ajustes', { datos_transferencia: '', punto_retiro: '' });
});

test('link de pago solo https y texto escapado', async () => {
  fijarStock(A, 1);
  const { id } = await crear({ metodoPago: 'mercado_pago', nombre: '<script>alert(1)</script>', nota: '=SUMA(1)' });
  assert.equal(await entrega(id, { link_pago: 'javascript:alert(1)' }), 'link');
  assert.equal(await entrega(id, { link_pago: 'https://mpago.la/x' }), 'guardado');
  const panel = await pagina(`/admin/pedidos/${id}`);
  assert.ok(!panel.includes('<script>alert(1)'));
  const csv = await pagina('/admin/exportar/pedidos.csv');
  assert.ok(csv.includes('"Pedido";"Fecha"'));
  sql(`UPDATE pedido SET nombre_entrega = '=HYPERLINK(1)' WHERE id = ${id}`);
  assert.ok((await pagina('/admin/exportar/pedidos.csv')).includes(`"'=HYPERLINK(1)"`), 'neutraliza fórmulas');
  await estado(id, 'cancelado');
});

test('formularios desde otro origen se rechazan y no cambian nada', async () => {
  fijarStock(A, 1);
  const { id } = await crear();
  const r = await fetch(`${BASE}/admin/pedidos/${id}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: 'https://otro.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ accion: 'estado', destino: 'cancelado' }),
  });
  assert.equal(r.status, 403);
  assert.equal(pedido(id).estado, 'creado');
  await estado(id, 'cancelado');
});

test('pantallas y bandejas responden; cabeceras privadas', async () => {
  for (const ruta of ['/admin', '/admin?bandeja=cerrados', '/admin?q=Ana', '/admin?q=M-0001', '/admin/stock', '/admin/stock?agotados=1', '/admin/ajustes']) {
    const r = await fetch(`${BASE}${ruta}`);
    assert.equal(r.status, 200, ruta);
    assert.equal(r.headers.get('cache-control'), 'no-store', ruta);
    assert.ok(r.headers.get('x-robots-tag')?.includes('noindex'), ruta);
  }
  assert.equal((await fetch(`${BASE}/admin/pedidos/999999`)).status, 404);
  assert.equal((await fetch(`${BASE}/admin/pedidos/abc`)).status, 404);
  assert.equal((await fetch(`${BASE}/admin/exportar/otra.csv`)).status, 404);
});
