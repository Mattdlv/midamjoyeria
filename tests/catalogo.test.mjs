// Productos, fotos y promociones contra el servidor local, con ADMIN_DEV_EMAIL en .env.
// Crea datos en la base local y los borra al terminar.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { evaluarCupon, fechaDesdeFormulario, fechaParaFormulario, generarCodigo, precioConPromos, vigente } from '../src/lib/promos.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const MARCA = 'ZZPrueba';
let n = 0;

const sql = (consulta) => JSON.parse(execFileSync('node', ['scripts/db.mjs', 'consulta', consulta], { encoding: 'utf8' }));
const accion = async (ruta, campos, origen = BASE) => {
  const cuerpo = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) cuerpo.append(k, x);
  return fetch(`${BASE}${ruta}`, { method: 'POST', redirect: 'manual', headers: { Origin: origen, 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo });
};
const aviso = (r) => new URL(r.headers.get('location'), BASE).searchParams.get('aviso');

const crearProducto = async (extra = {}) => {
  const r = await accion('/admin/productos/nuevo', { nombre: `${MARCA} ${++n}`, descripcion: `${MARCA} aros de prueba`, precio: '10000', stock: '5', categoria: 'aros', tono: 'dorado', ...extra });
  assert.equal(r.status, 303);
  const id = new URL(r.headers.get('location'), BASE).pathname.split('/').pop();
  return sql(`SELECT id, slug, codigo FROM producto WHERE id = '${id}'`)[0];
};

// Imágenes mínimas: lo que valida el servidor es la firma del archivo.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const subirFoto = (id, contenido = WEBP) => {
  const f = new FormData();
  f.set('s', new Blob([contenido]), 's');
  f.set('m', new Blob([contenido]), 'm');
  return fetch(`${BASE}/admin/productos/${id}/fotos`, { method: 'POST', headers: { Origin: BASE }, body: f });
};
const crearPublicado = async (extra) => {
  const p = await crearProducto(extra);
  assert.equal((await subirFoto(p.id)).status, 201);
  return p;
};
const crearPromo = async (campos) => {
  const r = await accion('/admin/promos/nueva', { nombre: `${MARCA} promo ${++n}`, tipo: 'porcentaje', valor: '20', alcance: 'todo', activa: 'on', ...campos });
  assert.equal(r.status, 303, `${r.status}`);
  assert.equal(aviso(r), 'guardado', r.headers.get('location'));
  return Number(new URL(r.headers.get('location'), BASE).pathname.split('/').pop());
};
const cotizar = async (items, codigo = null) => (await fetch(`${BASE}/api/cotizar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, codigo }) })).json();
const pedir = (slug, extra = {}, cantidad = 1) =>
  fetch(`${BASE}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-vercel-forwarded-for': `10.8.${Date.now() % 250}.${++n % 250}` },
    body: JSON.stringify({ nombre: 'Prueba Catálogo', whatsapp: `380${6000000 + ((Date.now() + n * 1000) % 900000)}`, tipoEntrega: 'retiro', metodoPago: 'transferencia', items: [{ slug, opcion: null, cantidad }], ...extra }),
  });
const ficha = async (slug) => (await fetch(`${BASE}/productos/${slug}`)).text();

after(() => {
  const productos = `SELECT id FROM producto WHERE nombre LIKE '${MARCA}%'`;
  const pedidos = `SELECT p.id FROM pedido p JOIN cliente c ON c.id = p.cliente_id WHERE c.nombre = 'Prueba Catálogo'`;
  sql(`DELETE FROM historial_pedido WHERE pedido_id IN (${pedidos})`);
  sql(`DELETE FROM movimiento_stock WHERE producto_id IN (${productos}) OR pedido_id IN (${pedidos})`);
  sql(`DELETE FROM item_pedido WHERE pedido_id IN (${pedidos})`);
  sql(`DELETE FROM pedido WHERE id IN (${pedidos})`);
  sql(`DELETE FROM producto WHERE nombre LIKE '${MARCA}%'`);
  sql(`DELETE FROM imagen WHERE NOT EXISTS (SELECT 1 FROM producto WHERE instr(fotos, imagen.id) > 0)`);
  sql(`DELETE FROM promocion WHERE nombre LIKE '${MARCA}%'`);
  sql(`DELETE FROM cliente WHERE nombre = 'Prueba Catálogo'`);
});

test('cálculo: elige la mejor promo, respeta fechas y no baja de cero', () => {
  const base = { activa: 1, codigo: null, alcance: 'todo', objetivo: null, inicio: null, fin: null, usos: 0, usos_max: null, minimo: 0 };
  const pieza = { id: 'a', categoria: 'aros' };
  const p10 = { ...base, tipo: 'porcentaje', valor: 10 };
  const m3 = { ...base, tipo: 'monto', valor: 3000 };
  assert.equal(precioConPromos(10000, pieza, [p10, m3], 0), 7000);
  assert.equal(precioConPromos(1000, pieza, [m3], 0), 0);
  assert.equal(precioConPromos(10000, pieza, [{ ...p10, alcance: 'categoria', objetivo: 'anillos' }], 0), 10000);
  assert.equal(precioConPromos(10000, pieza, [{ ...p10, codigo: 'X10' }], 0), 10000, 'un cupón no baja el precio a la vista');
  assert.equal(vigente({ ...p10, inicio: 100 }, 50), false);
  assert.equal(vigente({ ...p10, fin: 100 }, 100), false);
  assert.equal(fechaParaFormulario(fechaDesdeFormulario('2026-12-24T18:30')), '2026-12-24T18:30');
  assert.equal(fechaDesdeFormulario('2026-12-24T18:30'), Date.UTC(2026, 11, 24, 21, 30));
});

test('cálculo: el cupón solo cuenta lo que alcanza y respeta mínimo y usos', () => {
  const c = { activa: 1, codigo: 'X', tipo: 'porcentaje', valor: 50, alcance: 'categoria', objetivo: 'aros', inicio: null, fin: null, usos: 0, usos_max: null, minimo: 0 };
  const lineas = [{ id: 'a', categoria: 'aros', precio: 1000, cantidad: 2 }, { id: 'b', categoria: 'anillos', precio: 5000, cantidad: 1 }];
  assert.deepEqual(evaluarCupon(c, lineas, 0), { ok: true, descuento: 1000 });
  assert.deepEqual(evaluarCupon({ ...c, tipo: 'monto', valor: 9000 }, lineas, 0), { ok: true, descuento: 2000 }, 'no descuenta más que lo alcanzado');
  assert.equal(evaluarCupon({ ...c, minimo: 8000 }, lineas, 0).ok, false);
  assert.equal(evaluarCupon({ ...c, usos: 1, usos_max: 1 }, lineas, 0).ok, false);
  assert.equal(evaluarCupon({ ...c, activa: 0 }, lineas, 0).ok, false);
  assert.equal(evaluarCupon(null, lineas, 0).ok, false);
});

test('un producto nuevo aparece en la tienda recién cuando tiene foto', async () => {
  const p = await crearProducto();
  assert.match(p.codigo, /^MDM-ARO-\d+$/);
  assert.equal((await fetch(`${BASE}/productos/${p.slug}`)).status, 404);
  assert.equal(sql(`SELECT stock_disponible d FROM producto WHERE id = '${p.id}'`)[0].d, 5);

  assert.equal((await subirFoto(p.id)).status, 201);
  const pagina = await fetch(`${BASE}/productos/${p.slug}`);
  assert.equal(pagina.status, 200);
  const url = (await pagina.text()).match(/\/fotos\/[0-9a-f]{32}/)?.[0];
  assert.ok(url, 'la ficha muestra la foto subida');
  const foto = await fetch(`${BASE}${url}`);
  assert.equal(foto.status, 200);
  assert.equal(foto.headers.get('content-type'), 'image/webp');
  assert.match(foto.headers.get('cache-control'), /immutable/);
  assert.deepEqual(new Uint8Array(await foto.arrayBuffer()), WEBP);
  const indice = await (await fetch(`${BASE}/indice.json`)).json();
  assert.ok(indice.some((x) => x.slug === p.slug), 'el buscador lo encuentra');
});

test('fotos: rechaza lo que no es imagen; quitar y hacer principal mantienen las opciones', async () => {
  const p = await crearProducto({ etiqueta: 'Tono', opciones: 'Dorado, Plateado' });
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal((await subirFoto(p.id, svg)).status, 422, 'un SVG no se acepta');
  assert.equal((await subirFoto(p.id, new Uint8Array(1_600_000).fill(0xff))).status, 422, 'demasiado pesada');
  assert.equal((await subirFoto(p.id)).status, 201);
  assert.equal((await subirFoto(p.id)).status, 201);
  const fotos = () => JSON.parse(sql(`SELECT fotos FROM producto WHERE id = '${p.id}'`)[0].fotos);
  const [a, b] = fotos();
  sql(`UPDATE producto SET variantes = '${JSON.stringify({ etiqueta: 'Tono', opciones: [{ nombre: 'Dorado', foto: 0 }, { nombre: 'Plateado', foto: 1 }] })}' WHERE id = '${p.id}'`);
  const opciones = () => JSON.parse(sql(`SELECT variantes FROM producto WHERE id = '${p.id}'`)[0].variantes).opciones.map((o) => o.foto);

  assert.equal(aviso(await accion(`/admin/productos/${p.id}`, { accion: 'principal', foto: b.m })), 'guardado');
  assert.deepEqual(fotos().map((f) => f.m), [b.m, a.m]);
  assert.deepEqual(opciones(), [1, 0], 'cada opción sigue apuntando a su foto');

  const idBorrada = b.m.split('/').pop();
  assert.equal(aviso(await accion(`/admin/productos/${p.id}`, { accion: 'quitar', foto: b.m })), 'guardado');
  assert.deepEqual(fotos().map((f) => f.m), [a.m]);
  assert.deepEqual(opciones(), [0, null]);
  assert.equal(sql(`SELECT COUNT(*) n FROM imagen WHERE id = '${idBorrada}'`)[0].n, 0, 'borra la imagen');
  assert.equal((await fetch(`${BASE}${b.m}`)).status, 404);
  assert.equal(aviso(await accion(`/admin/productos/${p.id}`, { accion: 'quitar', foto: b.m })), 'cambio', 'un doble clic no rompe nada');
});

test('editar: cambia el precio y ocultar saca de la venta, sin tocar el enlace ni el stock', async () => {
  const p = await crearPublicado();
  const datos = { accion: 'datos', nombre: `${MARCA} editado`, descripcion: 'Otra descripción', precio: '7500', categoria: 'anillos', tono: 'plateado', activo: 'on' };
  assert.equal(aviso(await accion(`/admin/productos/${p.id}`, datos)), 'guardado');
  const html = await ficha(p.slug);
  assert.ok(html.includes(`${MARCA} editado`) && html.includes('$7.500'));
  const r = await pedir(p.slug);
  assert.equal(r.status, 201);
  const { token } = await r.json();
  assert.equal(sql(`SELECT subtotal s FROM pedido WHERE token = '${token}'`)[0].s, 7500, 'el pedido usa el precio nuevo');

  assert.equal(aviso(await accion(`/admin/productos/${p.id}`, { ...datos, precio: '-5' })), 'monto');
  assert.equal(sql(`SELECT precio FROM producto WHERE id = '${p.id}'`)[0].precio, 7500);

  const { activo, ...sinActivo } = datos;
  assert.equal(aviso(await accion(`/admin/productos/${p.id}`, sinActivo)), 'guardado');
  assert.equal((await fetch(`${BASE}/productos/${p.slug}`)).status, 404);
  assert.equal((await pedir(p.slug)).status, 422, 'no se puede pedir oculto');
  assert.ok((await (await fetch(`${BASE}/admin/stock?q=${encodeURIComponent(MARCA)}`)).text()).includes(`${MARCA} editado`), 'en el panel sigue visible');
  assert.equal(sql(`SELECT slug FROM producto WHERE id = '${p.id}'`)[0].slug, p.slug);
});

test('stock: el ingreso de mercadería suma y queda en el historial', async () => {
  const p = await crearProducto();
  const r = await accion(`/admin/stock/${p.id}`, { accion: 'ingreso', cantidad: '4', nota: '' });
  assert.equal(aviso(r), 'guardado');
  assert.equal(sql(`SELECT stock_disponible d FROM producto WHERE id = '${p.id}'`)[0].d, 9);
  assert.equal(sql(`SELECT cantidad c FROM movimiento_stock WHERE producto_id = '${p.id}' AND motivo = 'ajuste'`)[0].c, 4);
  assert.equal(aviso(await accion(`/admin/stock/${p.id}`, { accion: 'ingreso', cantidad: '0' })), 'monto');
});

test('promo automática: tacha el precio, y el pedido cobra el precio rebajado', async () => {
  const p = await crearPublicado();
  const id = await crearPromo({ alcance: 'productos', productos: [p.id] });
  const html = await ficha(p.slug);
  assert.ok(html.includes('precio-lista') && html.includes('$10.000') && html.includes('$8.000'));
  assert.equal((await cotizar([{ slug: p.slug, cantidad: 2 }])).subtotal, 16000);
  const { token } = await (await pedir(p.slug, {}, 2)).json();
  const f = sql(`SELECT subtotal s, descuento d FROM pedido WHERE token = '${token}'`)[0];
  assert.deepEqual(f, { s: 16000, d: 0 });
  assert.equal(sql(`SELECT i.precio_al_comprar p FROM item_pedido i JOIN pedido x ON x.id = i.pedido_id WHERE x.token = '${token}'`)[0].p, 8000);

  assert.equal(aviso(await accion(`/admin/promos/${id}`, { nombre: 'ZZPrueba pausada', tipo: 'porcentaje', valor: '20', alcance: 'productos', productos: p.id })), 'guardado', 'sin "activa" queda pausada');
  assert.equal((await cotizar([{ slug: p.slug, cantidad: 1 }])).subtotal, 10000);

  const fin = '2020-01-01T00:00';
  assert.equal(aviso(await accion(`/admin/promos/${id}`, { nombre: 'ZZPrueba vieja', tipo: 'porcentaje', valor: '20', alcance: 'productos', productos: p.id, activa: 'on', fin })), 'guardado');
  assert.equal((await cotizar([{ slug: p.slug, cantidad: 1 }])).subtotal, 10000, 'una promo vencida no aplica');
});

test('cupón: se aplica al pedido, valida el código y cuenta usos sin pasarse', async () => {
  const p = await crearPublicado({ stock: '10' });
  const codigo = `ZZ${Date.now() % 100000}`;
  await crearPromo({ codigo: codigo.toLowerCase(), valor: '25', usos_max: '2', minimo: '5000' });

  const c = await cotizar([{ slug: p.slug, cantidad: 2 }], codigo);
  assert.equal(c.descuento, 5000);
  assert.equal(c.cupon.codigo, codigo, 'guarda el código en mayúsculas');
  assert.ok((await cotizar([{ slug: p.slug, cantidad: 1 }], 'NOEXISTE')).errorCupon);

  const malo = await pedir(p.slug, { cupon: 'NOEXISTE' });
  assert.equal(malo.status, 422, 'un código inválido no crea el pedido');

  const { token } = await (await pedir(p.slug, { cupon: codigo.toLowerCase() }, 2)).json();
  assert.deepEqual(sql(`SELECT subtotal s, descuento d, cupon c FROM pedido WHERE token = '${token}'`)[0], { s: 20000, d: 5000, c: codigo });
  const comprobante = await (await fetch(`${BASE}/pedido/${token}`)).text();
  assert.ok(comprobante.includes(codigo) && comprobante.includes('$15.000'), 'el comprobante muestra descuento y total');
  const confirmacion = await (await fetch(`${BASE}/pedido/${token}/confirmacion`)).text();
  assert.ok(confirmacion.includes('Descuento: −$5.000'), 'el mensaje de WhatsApp incluye el descuento');

  // Queda un solo uso: de tres pedidos simultáneos, uno solo lo consigue y los otros no reservan stock.
  const antes = sql(`SELECT stock_disponible d FROM producto WHERE id = '${p.id}'`)[0].d;
  const respuestas = await Promise.all([1, 2, 3].map(() => pedir(p.slug, { cupon: codigo })));
  assert.deepEqual(respuestas.map((r) => r.status).sort(), [201, 422, 422]);
  assert.equal(sql(`SELECT stock_disponible d FROM producto WHERE id = '${p.id}'`)[0].d, antes - 1);
  assert.equal(sql(`SELECT usos FROM promocion WHERE codigo = '${codigo}'`)[0].usos, 2);
});

test('promos: valida datos y código repetido', async () => {
  const base = { nombre: `${MARCA} mala`, tipo: 'porcentaje', valor: '20', alcance: 'todo', activa: 'on' };
  assert.equal(aviso(await accion('/admin/promos/nueva', { ...base, valor: '95' })), 'promo_valor');
  assert.equal(aviso(await accion('/admin/promos/nueva', { ...base, alcance: 'productos' })), 'promo_alcance');
  assert.equal(aviso(await accion('/admin/promos/nueva', { ...base, codigo: 'con espacios' })), 'promo_codigo');
  assert.equal(aviso(await accion('/admin/promos/nueva', { ...base, inicio: '2030-01-02T00:00', fin: '2030-01-01T00:00' })), 'promo_fechas');
  const codigo = `RP${Date.now() % 100000}`;
  const id = await crearPromo({ codigo });
  assert.equal(aviso(await accion('/admin/promos/nueva', { ...base, codigo })), 'promo_repetida');
  assert.equal((await accion(`/admin/promos/${id}`, { accion: 'borrar' })).status, 303);
  assert.equal(sql(`SELECT COUNT(*) n FROM promocion WHERE id = ${id}`)[0].n, 0);
});

test('generador de códigos: formato legible y sin repetidos', () => {
  assert.match(generarCodigo(), /^[A-HJ-NP-Z2-9]{8}$/);
  assert.match(generarCodigo('NAVIDAD'), /^NAVIDAD-[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(new Set(Array.from({ length: 5000 }, () => generarCodigo())).size, 5000);
});

test('lote de cupones: códigos únicos de un uso, que se agrupan, exportan, pausan y borran', async () => {
  const p = await crearPublicado({ stock: '10' });
  const base = { nombre: `${MARCA} lote`, tipo: 'porcentaje', valor: '10', alcance: 'todo', usos_max: '1' };
  assert.equal(aviso(await accion('/admin/promos/generar', { ...base, cantidad: '0' })), 'lote_cantidad');
  assert.equal(aviso(await accion('/admin/promos/generar', { ...base, cantidad: '501' })), 'lote_cantidad');
  assert.equal(aviso(await accion('/admin/promos/generar', { ...base, cantidad: '2', prefijo: 'con espacio' })), 'lote_prefijo');
  assert.equal(aviso(await accion('/admin/promos/generar', { ...base, cantidad: '2', valor: '95' })), 'promo_valor');

  const r = await accion('/admin/promos/generar', { ...base, cantidad: '5', prefijo: 'zzlote' });
  assert.equal(r.status, 303);
  const ruta = new URL(r.headers.get('location'), BASE).pathname;
  const lote = ruta.split('/').pop();
  const codigos = sql(`SELECT codigo, usos_max FROM promocion WHERE lote = '${lote}'`);
  assert.equal(new Set(codigos.map((c) => c.codigo)).size, 5);
  assert.ok(codigos.every((c) => /^ZZLOTE-[A-HJ-NP-Z2-9]{8}$/.test(c.codigo) && c.usos_max === 1));

  const listado = await (await fetch(`${BASE}/admin/promos`)).text();
  assert.ok(listado.includes('Lote de 5 cupones') && !listado.includes(codigos[0].codigo), 'la lista muestra el lote, no cada código');
  const pantalla = await (await fetch(`${BASE}${ruta}`)).text();
  assert.ok(codigos.every((c) => pantalla.includes(c.codigo)));
  const csv = await fetch(`${BASE}${ruta}/cupones.csv`);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok((await csv.text()).includes(codigos[0].codigo));

  // Un código sirve una vez; otro del mismo lote sigue valiendo.
  const [a, b, c] = codigos.map((x) => x.codigo);
  assert.equal((await pedir(p.slug, { cupon: a })).status, 201);
  assert.equal((await pedir(p.slug, { cupon: a })).status, 422, 'no se usa dos veces');
  assert.equal((await cotizar([{ slug: p.slug, cantidad: 1 }], b)).descuento, 1000);

  assert.equal(aviso(await accion(ruta, { accion: 'pausar' })), 'guardado');
  assert.equal((await pedir(p.slug, { cupon: c })).status, 422, 'pausado no aplica');
  assert.equal(aviso(await accion(ruta, { accion: 'activar' })), 'guardado');
  assert.equal((await cotizar([{ slug: p.slug, cantidad: 1 }], c)).descuento, 1000);

  assert.equal(aviso(await accion(ruta, { accion: 'borrar' })), 'guardado');
  assert.deepEqual(sql(`SELECT codigo FROM promocion WHERE lote = '${lote}'`), [{ codigo: a }], 'conserva solo el usado');

  assert.equal((await accion('/admin/promos/generar', { ...base, cantidad: '2' }, 'https://otro.example')).status, 403);
  assert.equal((await fetch(`${BASE}/admin/promos/lote/no-existe`)).status, 404);
  assert.equal((await fetch(`${BASE}/admin/promos/lote/no-existe/cupones.csv`)).status, 404);
});

test('seguridad: el panel rechaza otro origen; páginas públicas con caché y privadas sin', async () => {
  const p = await crearProducto();
  assert.equal((await accion(`/admin/productos/${p.id}`, { accion: 'datos', nombre: 'Hackeado' }, 'https://otro.example')).status, 403);
  assert.equal((await accion('/admin/promos/nueva', { nombre: 'Hackeada' }, 'https://otro.example')).status, 403);
  const f = new FormData();
  assert.equal((await fetch(`${BASE}/admin/productos/${p.id}/fotos`, { method: 'POST', headers: { Origin: 'https://otro.example' }, body: f })).status, 403);

  assert.match((await fetch(`${BASE}/tienda`)).headers.get('cache-control'), /s-maxage=60/);
  assert.match((await fetch(`${BASE}/admin/promos`)).headers.get('cache-control'), /no-store/);
  assert.match((await fetch(`${BASE}/api/stock?slugs=aros-de-flor`)).headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(`${BASE}/no-existe`)).status, 404);
  assert.equal((await fetch(`${BASE}/tienda/no-existe`)).status, 404);
});
