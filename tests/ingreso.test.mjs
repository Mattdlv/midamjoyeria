// Ingreso real al panel. Necesita un servidor SIN ADMIN_DEV_EMAIL, con SESION_SECRETO y ADMIN_USUARIOS
// y la contraseña en CLAVE_PRUEBA. Ver README.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const EMAIL = process.env.EMAIL_PRUEBA;
const CLAVE = process.env.CLAVE_PRUEBA;
const manual = { redirect: 'manual' };
let ipN = 0;

const ingresar = (email, clave, ip) =>
  fetch(`${BASE}/admin/ingresar`, {
    ...manual,
    method: 'POST',
    headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded', 'x-vercel-forwarded-for': ip ?? `10.3.0.${++ipN}` },
    body: new URLSearchParams({ email, clave }),
  });

test('sin sesión manda al ingreso o rechaza', async () => {
  for (const r of ['/admin', '/admin/', '/admin/stock', '/%61dmin', '/admin/pedidos/1', '/admin/exportar/pedidos.csv', '/admin/ajustes']) {
    const x = await fetch(`${BASE}${r}`, manual);
    assert.equal(x.status, 303, r);
    assert.equal(x.headers.get('location'), '/admin/ingresar', r);
  }
  const post = await fetch(`${BASE}/admin/pedidos/1`, { ...manual, method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'accion=estado&destino=cancelado' });
  assert.equal(post.status, 403);
  const falsa = await fetch(`${BASE}/admin`, { ...manual, headers: { Cookie: 'midam_sesion=a.b' } });
  assert.equal(falsa.status, 303, 'cookie falsa');
  assert.equal((await fetch(`${BASE}/admin/ingresar`)).status, 200);
});

test('contraseña incorrecta no entra ni crea sesión', async () => {
  const r = await ingresar(EMAIL, 'incorrecta');
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('ingreso correcto da una cookie protegida que abre el panel, y salir la borra', async () => {
  const r = await ingresar(EMAIL, CLAVE);
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/admin/i);
  const par = cookie.split(';')[0];
  const panel = await fetch(`${BASE}/admin`, { ...manual, headers: { Cookie: par } });
  assert.equal(panel.status, 200);
  assert.ok((await panel.text()).includes(EMAIL), 'muestra quién entró');
  assert.equal(panel.headers.get('cache-control'), 'no-store');
  const salir = await fetch(`${BASE}/admin/salir`, { ...manual, method: 'POST', headers: { Cookie: par, Origin: BASE } });
  assert.equal(salir.status, 303);
  assert.match(salir.headers.get('set-cookie') ?? '', /midam_sesion=/);
});

test('formularios desde otro origen se rechazan aun con sesión', async () => {
  const par = (await ingresar(EMAIL, CLAVE)).headers.get('set-cookie').split(';')[0];
  const r = await fetch(`${BASE}/admin/ajustes`, { ...manual, method: 'POST', headers: { Cookie: par, Origin: 'https://otro.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'datos_transferencia=robado' });
  assert.equal(r.status, 403);
});

test('frena a quien prueba contraseñas, sin afectar a otras personas', async () => {
  const ip = '10.3.9.9';
  const estados = [];
  for (let i = 0; i < 6; i++) estados.push((await ingresar(EMAIL, 'mala', ip)).status);
  assert.deepEqual(estados, [401, 401, 401, 401, 401, 429]);
  assert.equal((await ingresar(EMAIL, CLAVE, ip)).status, 429, 'ni con la clave correcta mientras dura el bloqueo');
  assert.equal((await ingresar(EMAIL, CLAVE, '10.3.9.10')).status, 303, 'otra IP entra');
});
