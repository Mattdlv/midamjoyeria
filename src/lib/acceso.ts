// Quién puede entrar al panel. Falla cerrado: sin configuración válida no entra nadie.
// Las contraseñas se guardan como hash en ADMIN_USUARIOS y la sesión es una cookie firmada.
// En local, ADMIN_DEV_EMAIL permite entrar sin contraseña, solo desde localhost.

export type ConfigAcceso = { secreto?: string; usuarios?: string; devEmail?: string };

export const COOKIE_SESION = 'midam_sesion';
export const DURACION_SESION = 7 * 86_400;

const ITERACIONES = 210_000;
const codificar = new TextEncoder();
const aB64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const deB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

const hashClave = async (clave: string, sal: BufferSource) => {
  const k = await crypto.subtle.importKey('raw', codificar.encode(clave), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES }, k, 256);
};

const igual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};

/** Entrada de ADMIN_USUARIOS: mail|sal|hash. Varias se separan con punto y coma. */
export const crearEntradaUsuario = async (email: string, clave: string) => {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `${email.trim().toLowerCase()}|${aB64(sal)}|${aB64(await hashClave(clave, sal))}`;
};

const leerUsuarios = (usuarios = '') =>
  usuarios.split(';').map((e) => e.trim().split('|')).filter((p) => p.length === 3 && p[0] && p[1] && p[2]).map(([email, sal, hash]) => ({ email: email.toLowerCase(), sal, hash }));

const SAL_FALSA = new Uint8Array(16);

/** Devuelve el mail normalizado si la contraseña es correcta. Calcula el hash aunque el usuario no exista, para no delatarlo por el tiempo. */
export const verificarCredenciales = async (usuarios: string | undefined, email: string, clave: string) => {
  const u = leerUsuarios(usuarios).find((x) => x.email === email.trim().toLowerCase());
  try {
    const calculado = new Uint8Array(await hashClave(clave, u ? deB64(u.sal) : SAL_FALSA));
    return u && igual(calculado, deB64(u.hash)) ? u.email : null;
  } catch {
    return null;
  }
};

const claveHmac = (secreto: string) => crypto.subtle.importKey('raw', codificar.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const firmarSesion = async (email: string, usuarios: string | undefined, secreto: string, ahora = Date.now()) => {
  // La huella del hash invalida las sesiones abiertas cuando cambia la contraseña.
  const huella = leerUsuarios(usuarios).find((u) => u.email === email)?.hash.slice(0, 12) ?? '';
  const cuerpo = aB64(codificar.encode(JSON.stringify({ e: email, h: huella, x: Math.floor(ahora / 1000) + DURACION_SESION })));
  return `${cuerpo}.${aB64(await crypto.subtle.sign('HMAC', await claveHmac(secreto), codificar.encode(cuerpo)))}`;
};

export const verificarSesion = async (cookie: string, usuarios: string | undefined, secreto: string, ahora = Date.now()) => {
  try {
    const [cuerpo, firma] = cookie.split('.');
    if (!cuerpo || !firma) return null;
    const valida = await crypto.subtle.verify('HMAC', await claveHmac(secreto), deB64(firma), codificar.encode(cuerpo));
    if (!valida) return null;
    const d = JSON.parse(new TextDecoder().decode(deB64(cuerpo)));
    if (typeof d.x !== 'number' || d.x * 1000 <= ahora) return null;
    const u = leerUsuarios(usuarios).find((x) => x.email === d.e);
    return u && u.hash.slice(0, 12) === d.h ? u.email : null;
  } catch {
    return null;
  }
};

const ES_LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Devuelve el mail de quien entra, o null si no está autorizado. */
export const autorizar = async (cookie: string | undefined, url: URL, c: ConfigAcceso) => {
  if (c.devEmail && ES_LOCAL.has(url.hostname)) return c.devEmail;
  if (!cookie || !c.secreto || c.secreto.length < 32 || !c.usuarios) return null;
  return verificarSesion(cookie, c.usuarios, c.secreto);
};

const normalizar = (pathname: string) => {
  try {
    return decodeURIComponent(pathname).toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
};

/** Cubre variantes como /ADMIN o /%61dmin, que el enrutador también podría resolver. */
export const esRutaPanel = (pathname: string) => {
  const p = normalizar(pathname);
  return p === null || p === '/admin' || p.startsWith('/admin/');
};

export const esRutaIngreso = (pathname: string) => normalizar(pathname) === '/admin/ingresar';
