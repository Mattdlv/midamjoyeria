// Genera db/seed.sql desde el catálogo. En un producto existente solo completa los datos que falten:
// no pisa stock, precios ni lo que se haya editado en el panel.
import fs from 'node:fs';

const productos = JSON.parse(fs.readFileSync('src/data/productos.json', 'utf8'));
const q = (v) => (v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
// Fecha fija de la carga original: así generar de nuevo no cambia el archivo.
const CARGA = 1793648870578;
const CAMPOS = ['numero', 'categoria', 'tono', 'lineas', 'talles', 'regulable', 'medida', 'material', 'variantes', 'fotos'];
const lineas = [];

for (const p of productos) {
  const opciones = (p.variantes?.opciones ?? []).map((o) => o.nombre);
  lineas.push(
    `INSERT INTO producto (id, codigo, slug, nombre, descripcion, precio, stock_disponible, etiqueta_opcion, opciones, ${CAMPOS.join(', ')}) VALUES (${[
      q(p.id), q(p.codigo), q(p.slug), q(p.nombre), q(p.descripcion), p.precio, p.stock, q(p.variantes?.etiqueta ?? null), q(JSON.stringify(opciones)),
      p.numero, q(p.categoria), q(p.tono), q(JSON.stringify(p.lineas)), q(JSON.stringify(p.talles)), p.regulable ? 1 : 0, q(p.medida), q(p.material),
      q(p.variantes ? JSON.stringify(p.variantes) : null), q(JSON.stringify(p.fotos)),
    ].join(', ')}) ON CONFLICT (id) DO UPDATE SET ${CAMPOS.map((c) => `${c} = excluded.${c}`).join(', ')} WHERE producto.categoria IS NULL;`,
  );
  lineas.push(
    `INSERT INTO movimiento_stock (producto_id, cantidad, motivo, fecha) SELECT ${q(p.id)}, ${p.stock}, 'carga_inicial', ${CARGA} WHERE NOT EXISTS (SELECT 1 FROM movimiento_stock WHERE producto_id = ${q(p.id)} AND motivo = 'carga_inicial');`,
  );
}

fs.writeFileSync('db/seed.sql', lineas.join('\n') + '\n');
console.log('productos', productos.length);
