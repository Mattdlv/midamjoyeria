// Comprueba una tienda ya publicada y borra lo que crea. Necesita BASE_URL, DB_URL y DB_TOKEN.
// Con EMAIL_PRUEBA y CLAVE_PRUEBA prueba además el ingreso y el panel con sesión.
import { createClient } from '@libsql/client';

const { BASE_URL: BASE, DB_URL, DB_TOKEN, EMAIL_PRUEBA: EMAIL, CLAVE_PRUEBA: CLAVE } = process.env;
if (!BASE || !DB_URL) throw new Error('Faltan variables');
const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
const SLUG = 'aros-de-flor';
const TELEFONOS = ['3809990001', '3809990002', '3809990003', '3809990004'];
const manual = { redirect: 'manual' };
const https = BASE.startsWith('https:');
let fallas = 0;

const probar = (nombre, ok, detalle = '') => {
  if (!ok) fallas++;
  console.log(`${ok ? 'OK ' : 'MAL'} ${nombre}${!ok && detalle ? ` (${detalle})` : ''}`);
};
const uno = async (sql, args = []) => {
  const r = await db.execute({ sql, args });
  return r.rows[0] ? Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0][i]])) : null;
};
const stock = () => uno('SELECT stock_disponible d, stock_reservado r FROM producto WHERE slug = ?', [SLUG]);

const limpiar = async () => {
  const lista = TELEFONOS.map((t) => `'549${t}'`).join(',');
  const pedidos = `SELECT p.id FROM pedido p JOIN cliente c ON c.id = p.cliente_id WHERE c.whatsapp IN (${lista})`;
  await db.batch([
    `DELETE FROM historial_pedido WHERE pedido_id IN (${pedidos})`,
    `DELETE FROM pago WHERE pedido_id IN (${pedidos})`,
    `DELETE FROM movimiento_stock WHERE pedido_id IN (${pedidos})`,
    `DELETE FROM item_pedido WHERE pedido_id IN (${pedidos})`,
    `DELETE FROM pedido WHERE id IN (${pedidos})`,
    `DELETE FROM cliente WHERE whatsapp IN (${lista})`,
    `DELETE FROM sqlite_sequence WHERE name = 'pedido' AND NOT EXISTS (SELECT 1 FROM pedido)`,
  ], 'write');
};

const original = await stock();
await limpiar();

try {
  for (const ruta of ['/', '/tienda', '/tienda/aros', `/productos/${SLUG}`, '/giratorias', '/pedido']) {
    const r = await fetch(BASE + ruta);
    probar(`Página ${ruta}`, r.ok, String(r.status));
  }
  const s = await fetch(`${BASE}/api/stock?slugs=${SLUG}`);
  probar('Consulta de stock contra la base', s.ok && typeof (await s.clone().json())[SLUG] === 'number', String(s.status));

  const sin = await fetch(`${BASE}/admin`, manual);
  probar('El panel sin sesión manda al ingreso', sin.status === 303 && sin.headers.get('location') === '/admin/ingresar', String(sin.status));
  const noPost = await fetch(`${BASE}/admin/ajustes`, { ...manual, method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'datos_transferencia=x' });
  probar('El panel sin sesión no acepta cambios', noPost.status === 403, String(noPost.status));

  // La última unidad, con pedidos simultáneos contra la base real.
  await db.execute({ sql: 'UPDATE producto SET stock_disponible = 1, stock_reservado = 0 WHERE slug = ?', args: [SLUG] });
  const pedir = (tel) =>
    fetch(`${BASE}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({ nombre: 'Prueba Automática', whatsapp: tel, tipoEntrega: 'retiro', metodoPago: 'transferencia', items: [{ slug: SLUG, opcion: null, cantidad: 1 }] }),
    });
  const respuestas = await Promise.all(TELEFONOS.map(pedir));
  const estados = respuestas.map((r) => r.status).sort();
  probar('4 compras simultáneas de la última unidad: solo una se concreta', estados.join() === '201,409,409,409', estados.join());
  const creada = respuestas.find((r) => r.status === 201);
  const { token, numero } = creada ? await creada.json() : {};
  const despues = await stock();
  probar('El stock quedó reservado', despues.d === 0 && despues.r === 1, JSON.stringify(despues));
  const otro = await fetch(`${BASE}/api/pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://otro.example' }, body: '{}' });
  probar('Rechaza pedidos desde otro sitio', otro.status === 403, String(otro.status));

  if (token) {
    const conf = await (await fetch(`${BASE}/pedido/${token}/confirmacion`)).text();
    const href = conf.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    const url = href ? new URL(href) : null;
    probar('El mensaje va al WhatsApp de Midam', url?.pathname === '/5493804151249', url?.pathname);
    probar('El mensaje enlaza al comprobante en esta dirección', Boolean(url?.searchParams.get('text')?.includes(`${BASE}/pedido/${token}`)));
    const comp = await fetch(`${BASE}/pedido/${token}`);
    const texto = await comp.text();
    probar('Comprobante con leyenda y privado', comp.ok && texto.includes('no es una factura') && Boolean(comp.headers.get('x-robots-tag')?.includes('noindex')));
  }

  if (!EMAIL || !CLAVE) {
    console.log('--  Ingreso y panel con sesión: sin probar, faltan EMAIL_PRUEBA y CLAVE_PRUEBA');
    const mal = await fetch(`${BASE}/admin/ingresar`, { ...manual, method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'nadie@midam.invalid', clave: 'incorrecta-de-prueba' }) });
    probar('Contraseña incorrecta no entra', mal.status === 401, String(mal.status));
    throw new Error('FIN_SIN_SESION');
  }
  const mala = await fetch(`${BASE}/admin/ingresar`, { ...manual, method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `no-${EMAIL}`, clave: 'incorrecta' }) });
  probar('Contraseña incorrecta no entra', mala.status === 401, String(mala.status));
  const ingreso = await fetch(`${BASE}/admin/ingresar`, { ...manual, method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: EMAIL, clave: CLAVE }) });
  const galleta = ingreso.headers.get('set-cookie') ?? '';
  probar('Ingreso con la contraseña correcta', ingreso.status === 303 && galleta.includes('midam_sesion='), String(ingreso.status));
  if (https) probar('La cookie de sesión es segura', /secure/i.test(galleta) && /httponly/i.test(galleta));
  const cookie = galleta.split(';')[0];
  const panel = await fetch(`${BASE}/admin`, { ...manual, headers: { Cookie: cookie } });
  probar('El panel abre con sesión y muestra el pedido', panel.status === 200 && (!numero || (await panel.text()).includes(numero)), String(panel.status));

  if (numero) {
    const ruta = `${BASE}/admin/pedidos/${Number(numero.slice(2))}`;
    const cuerpo = 'accion=estado&destino=cancelado';
    const tipo = 'application/x-www-form-urlencoded';
    const ajeno = await fetch(ruta, { ...manual, method: 'POST', headers: { Cookie: cookie, Origin: 'https://otro.example', 'Content-Type': tipo }, body: cuerpo });
    probar('El panel rechaza formularios de otro sitio', ajeno.status === 403, String(ajeno.status));
    const cancelar = await fetch(ruta, { ...manual, method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'Content-Type': tipo }, body: cuerpo });
    probar('Cancelar desde el panel funciona', cancelar.status === 303 && Boolean(cancelar.headers.get('location')?.includes('aviso=guardado')), `${cancelar.status} ${cancelar.headers.get('location')}`);
    const final = await stock();
    probar('Cancelar devolvió el stock', final.d === 1 && final.r === 0, JSON.stringify(final));
  }
} catch (e) {
  if (e.message !== 'FIN_SIN_SESION') {
    fallas++;
    console.log(`MAL Se cortó la prueba: ${String(e.message ?? e).slice(0, 300)}`);
  }
} finally {
  await limpiar();
  await db.execute({ sql: 'UPDATE producto SET stock_disponible = ?, stock_reservado = ? WHERE slug = ?', args: [original.d, original.r, SLUG] });
  await db.execute({ sql: 'DELETE FROM intento_login', args: [] });
  const quedo = await stock();
  probar('Datos de prueba borrados', quedo.d === original.d && quedo.r === original.r);
  db.close();
}

console.log(`\n${fallas ? `${fallas} con problemas` : 'Todas bien'}`);
process.exit(fallas ? 1 : 0);
