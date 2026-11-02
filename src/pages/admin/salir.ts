import type { APIRoute } from 'astro';
import { COOKIE_SESION } from '../../lib/acceso';

export const prerender = false;

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(COOKIE_SESION, { path: '/admin' });
  return redirect('/admin/ingresar', 303);
};
