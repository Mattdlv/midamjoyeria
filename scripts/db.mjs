// Administra la base. Usa DB_URL y DB_TOKEN si están definidas; si no, la base local.
//   node scripts/db.mjs migrar
//   node scripts/db.mjs archivo db/seed.sql
//   node scripts/db.mjs consulta "SELECT COUNT(*) n FROM pedido"
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { urlBaseLocal } from './estado-local.mjs';

const client = createClient({ url: process.env.DB_URL ?? urlBaseLocal(), authToken: process.env.DB_TOKEN });
const [comando, argumento] = process.argv.slice(2);
const filas = (r) => r.rows.map((f) => Object.fromEntries(r.columns.map((c, i) => [c, f[i]])));

if (comando === 'migrar') {
  await client.execute('CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY, fecha INTEGER NOT NULL)');
  const hechas = new Set((await client.execute('SELECT nombre FROM _migraciones')).rows.map((f) => f[0]));
  const carpeta = 'db/migraciones';
  for (const nombre of fs.readdirSync(carpeta).filter((a) => a.endsWith('.sql')).sort()) {
    if (hechas.has(nombre)) {
      console.log('ya aplicada', nombre);
      continue;
    }
    await client.executeMultiple(fs.readFileSync(path.join(carpeta, nombre), 'utf8'));
    await client.execute({ sql: 'INSERT INTO _migraciones (nombre, fecha) VALUES (?, ?)', args: [nombre, Date.now()] });
    console.log('aplicada', nombre);
  }
} else if (comando === 'archivo' && argumento) {
  await client.executeMultiple(fs.readFileSync(argumento, 'utf8'));
  console.log('ejecutado', argumento);
} else if (comando === 'consulta' && argumento) {
  await client.executeMultiple('PRAGMA busy_timeout = 5000').catch(() => {});
  console.log(JSON.stringify(filas(await client.execute(argumento))));
} else {
  console.error('Uso: migrar | archivo <ruta> | consulta "<sql>"');
  process.exitCode = 1;
}
client.close();
