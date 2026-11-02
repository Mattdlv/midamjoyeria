// Genera db/seed.sql desde el catálogo. No pisa stock ni precios de productos que ya existen.
import fs from 'node:fs';

const productos = JSON.parse(fs.readFileSync('src/data/productos.json', 'utf8'));
const q = (v) => (v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const ahora = Date.now();
const lineas = [];

for (const p of productos) {
  const opciones = (p.variantes?.opciones ?? []).map((o) => o.nombre);
  lineas.push(
    `INSERT INTO producto (id, codigo, slug, nombre, descripcion, precio, stock_disponible, etiqueta_opcion, opciones) VALUES (${[
      q(p.id), q(p.codigo), q(p.slug), q(p.nombre), q(p.descripcion), p.precio, p.stock, q(p.variantes?.etiqueta ?? null), q(JSON.stringify(opciones)),
    ].join(', ')}) ON CONFLICT (id) DO NOTHING;`,
  );
  lineas.push(
    `INSERT INTO movimiento_stock (producto_id, cantidad, motivo, fecha) SELECT ${q(p.id)}, ${p.stock}, 'carga_inicial', ${ahora} WHERE NOT EXISTS (SELECT 1 FROM movimiento_stock WHERE producto_id = ${q(p.id)} AND motivo = 'carga_inicial');`,
  );
}

fs.writeFileSync('db/seed.sql', lineas.join('\n') + '\n');
console.log('productos', productos.length);
