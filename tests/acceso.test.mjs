// Permisos del panel. No necesita servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autorizar, crearEntradaUsuario, esRutaIngreso, esRutaPanel, firmarSesion, verificarCredenciales, verificarSesion } from '../src/lib/acceso.ts';

const SECRETO = 'x'.repeat(40);
const CLAVE = 'una clave larga de prueba';
const USUARIOS = await crearEntradaUsuario('Duena@Midam.ar', CLAVE);
const prod = new URL('https://midamjoyeria.shop/admin');
const local = new URL('http://localhost:4321/admin');

test('la contraseña correcta entra; otra, no', async () => {
  assert.equal(await verificarCredenciales(USUARIOS, 'duena@midam.ar', CLAVE), 'duena@midam.ar');
  assert.equal(await verificarCredenciales(USUARIOS, ' DUENA@midam.ar ', CLAVE), 'duena@midam.ar', 'mail sin distinguir mayúsculas');
  assert.equal(await verificarCredenciales(USUARIOS, 'duena@midam.ar', 'otra'), null);
  assert.equal(await verificarCredenciales(USUARIOS, 'nadie@midam.ar', CLAVE), null);
  assert.equal(await verificarCredenciales('', 'duena@midam.ar', CLAVE), null);
  assert.equal(await verificarCredenciales('basura', 'basura', CLAVE), null);
});

test('la entrada guarda hash, no la contraseña', () => {
  assert.ok(!USUARIOS.includes(CLAVE));
  assert.equal(USUARIOS.split('|').length, 3);
});

test('acepta una sesión firmada', async () => {
  const c = await firmarSesion('duena@midam.ar', USUARIOS, SECRETO);
  assert.equal(await verificarSesion(c, USUARIOS, SECRETO), 'duena@midam.ar');
  assert.equal(await autorizar(c, prod, { secreto: SECRETO, usuarios: USUARIOS }), 'duena@midam.ar');
});

test('rechaza sesión alterada, vencida, con otro secreto o basura', async () => {
  const c = await firmarSesion('duena@midam.ar', USUARIOS, SECRETO);
  const [cuerpo, firma] = c.split('.');
  const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url')), e: 'intruso@x.com' })).toString('base64url');
  assert.equal(await verificarSesion(`${otro}.${firma}`, USUARIOS, SECRETO), null, 'alterada');
  assert.equal(await verificarSesion(c, USUARIOS, 'y'.repeat(40)), null, 'otro secreto');
  assert.equal(await verificarSesion(c, USUARIOS, SECRETO, Date.now() + 8 * 86_400_000), null, 'vencida');
  for (const b of ['', 'a', 'a.b', 'a.b.c', '%%%.%%%']) assert.equal(await verificarSesion(b, USUARIOS, SECRETO), null, b);
});

test('una sesión deja de valer si sacan a la persona o cambia su contraseña', async () => {
  const c = await firmarSesion('duena@midam.ar', USUARIOS, SECRETO);
  assert.equal(await verificarSesion(c, await crearEntradaUsuario('otra@midam.ar', CLAVE), SECRETO), null);
  assert.equal(await verificarSesion(c, await crearEntradaUsuario('duena@midam.ar', 'contraseña nueva distinta'), SECRETO), null);
});

test('sin configuración no entra nadie', async () => {
  const c = await firmarSesion('duena@midam.ar', USUARIOS, SECRETO);
  assert.equal(await autorizar(undefined, prod, {}), null);
  assert.equal(await autorizar(c, prod, {}), null);
  assert.equal(await autorizar(c, prod, { secreto: SECRETO }), null, 'sin usuarios');
  assert.equal(await autorizar(c, prod, { usuarios: USUARIOS }), null, 'sin secreto');
  assert.equal(await autorizar(c, prod, { secreto: 'corto', usuarios: USUARIOS }), null, 'secreto débil');
  assert.equal(await autorizar(undefined, local, {}), null);
});

test('el acceso de desarrollo solo funciona desde localhost', async () => {
  assert.equal(await autorizar(undefined, local, { devEmail: 'dev@x' }), 'dev@x');
  assert.equal(await autorizar(undefined, prod, { devEmail: 'dev@x' }), null);
});

test('reconoce variantes de la ruta del panel', () => {
  for (const r of ['/admin', '/admin/', '/admin/stock', '/ADMIN', '/%61dmin', '/Admin/pedidos/1', '/%zz']) assert.equal(esRutaPanel(r), true, r);
  for (const r of ['/', '/administrar', '/tienda', '/pedido/admin']) assert.equal(esRutaPanel(r), false, r);
  assert.equal(esRutaIngreso('/admin/ingresar'), true);
  assert.equal(esRutaIngreso('/admin/ingresar/'), true);
  assert.equal(esRutaIngreso('/admin/stock'), false);
});
