// Convierte el catálogo de Treinta y las fotos originales en datos y WebP para la tienda.
// Uso: node scripts/armar-catalogo.mjs <carpeta con catalogo-crudo.json y fotos/>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { curaduria, CROP_DEFECTO } from './curaduria.mjs';

const fuente = process.argv[2];
if (!fuente) throw new Error('Falta la carpeta de origen');

const crudo = JSON.parse(fs.readFileSync(path.join(fuente, 'catalogo-crudo.json'), 'utf8'));
const visibles = crudo.filter((p) => p.visible).sort((a, b) => a.name.localeCompare(b.name, 'es'));
const destino = 'public/img/p';
fs.mkdirSync(destino, { recursive: true });

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const PREFIJO = { anillos: 'ANI', aros: 'ARO', collares: 'COL', pulseras: 'PUL' };
const contadores = {};
const usados = new Set();
const faltantes = [];
const productos = [];

for (const [i, p] of visibles.entries()) {
  const c = curaduria[p.name];
  if (!c) { faltantes.push(p.name); continue; }
  const categoria = p.cats[0];
  const descripcion = c.d.replace('{c}', categoria === 'pulseras' ? 'Pulsera' : 'Cadena');
  let slug = slugify(descripcion);
  for (let n = 2; usados.has(slug); n++) slug = `${slugify(descripcion)}-${n}`;
  usados.add(slug);
  contadores[categoria] = (contadores[categoria] || 0) + 1;

  const pedido = c.crop === true ? CROP_DEFECTO : c.crop;
  // El texto de las gráficas ocupa más de lo que indica el valor base: se amplía el margen.
  const ampliar = (c) => c && [c[0] >= 0.08 ? c[0] + 0.09 : c[0], c[1] + 0.07];
  const fotos = [];
  for (const [k, url] of p.images.entries()) {
    const crop = ampliar(c.cropFotos?.[k] ?? pedido);
    const entrada = path.join(fuente, 'fotos', url.split('/').pop());
    const base = sharp(entrada).rotate().flatten({ background: '#FAF6EE' });
    const { width, height } = await sharp(await base.clone().png().toBuffer()).metadata();
    const top = Math.round(height * (crop ? crop[0] : 0));
    const alto = height - top - Math.round(height * (crop ? crop[1] : 0));
    let h = alto, w = Math.round(h * 0.8);
    if (w > width) { w = width; h = Math.round(w / 0.8); }
    const left = Math.round((width - w) / 2);
    const recorte = await base.clone().extract({ left, top: top + Math.round((alto - h) / 2), width: w, height: h }).toBuffer();
    const salida = {};
    for (const [clave, ancho] of [['s', 420], ['m', 840]]) {
      const nombre = `${slug}-${k + 1}-${ancho}.webp`;
      await sharp(recorte).resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(destino, nombre));
      salida[clave] = `/img/p/${nombre}`;
    }
    fotos.push(salida);
  }

  productos.push({
    id: p.id,
    codigo: `MDM-${PREFIJO[categoria]}-${String(contadores[categoria]).padStart(3, '0')}`,
    numero: i + 1,
    nombre: c.nombre ?? p.name,
    descripcion,
    slug,
    categoria,
    precio: p.price,
    stock: p.stock,
    tono: c.t,
    lineas: c.l,
    talles: c.talle ?? [],
    regulable: Boolean(c.regulable),
    medida: c.medida ?? null,
    material: c.material ?? null,
    variantes: c.v ? { etiqueta: c.v[0], opciones: c.v[1].map(([nombre, foto]) => ({ nombre, foto })) } : null,
    fotos,
    fotoRecortada: Boolean(pedido),
  });
}

if (faltantes.length) throw new Error('Sin curaduría: ' + faltantes.join(', '));
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/productos.json', JSON.stringify(productos, null, 1));
console.log('productos', productos.length, contadores, 'recortados', productos.filter((p) => p.fotoRecortada).length, 'fotos', productos.reduce((a, p) => a + p.fotos.length, 0));
console.log('stock 1:', productos.filter((p) => p.stock === 1).length, 'stock 2:', productos.filter((p) => p.stock === 2).length, 'stock >2:', productos.filter((p) => p.stock > 2).length);
