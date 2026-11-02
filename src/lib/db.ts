// Base de datos con Turso (libSQL). En desarrollo, sin DB_URL, usa un archivo local.
// Mantiene una interfaz chica (prepare, bind, first, all, run, batch) para que la lógica no dependa del proveedor.
import type { Client, InValue, ResultSet } from '@libsql/client';
import { getSecret } from 'astro:env/server';

// El archivo local necesita el cliente con módulo nativo. Publicado se usa el de HTTP, que no depende de él.
const { createClient } = import.meta.env.DEV ? await import('@libsql/client') : await import('@libsql/client/web');

const aFilas = <T>(r: ResultSet) => r.rows.map((f) => Object.fromEntries(r.columns.map((c, i) => [c, f[i]])) as T);

export class Sentencia {
  constructor(private base: Base, readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: InValue[]) {
    return new Sentencia(this.base, this.sql, args);
  }
  async first<T>() {
    return aFilas<T>(await this.base.ejecutar(this))[0] ?? null;
  }
  async all<T>() {
    return { results: aFilas<T>(await this.base.ejecutar(this)) };
  }
  async run() {
    return this.base.ejecutar(this);
  }
}

export class Base {
  private preparado: Promise<void> | null = null;
  constructor(private client: Client, local: boolean) {
    if (local) this.preparado = client.execute('PRAGMA busy_timeout = 5000').then(() => undefined);
  }
  prepare(sql: string) {
    return new Sentencia(this, sql);
  }
  async ejecutar(s: Sentencia) {
    await this.preparado;
    return this.client.execute({ sql: s.sql, args: s.args });
  }
  /** Todas las sentencias corren en una sola transacción: si una falla, se revierte el conjunto. */
  async batch(sentencias: Sentencia[]) {
    await this.preparado;
    const r = await this.client.batch(sentencias.map((s) => ({ sql: s.sql, args: s.args })), 'write');
    return r.map((x) => ({ results: aFilas<Record<string, unknown>>(x), meta: { changes: x.rowsAffected } }));
  }
}

let unica: Base | null = null;

export const obtenerBase = () => {
  if (unica) return unica;
  const url = getSecret('DB_URL');
  // La ruta local la define astro.config.mjs: si estuviera acá, el empaquetador la incluiría al publicar.
  const local = import.meta.env.DEV ? process.env.MIDAM_DB_LOCAL : undefined;
  if (!url && !local) throw new Error('Falta la variable DB_URL');
  unica = new Base(createClient({ url: url ?? local!, authToken: getSecret('DB_TOKEN') }), !url);
  return unica;
};
