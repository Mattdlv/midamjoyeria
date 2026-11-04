-- El catálogo pasa a vivir en la base, para poder editarlo desde el panel sin volver a publicar.
ALTER TABLE producto ADD COLUMN numero INTEGER;
ALTER TABLE producto ADD COLUMN categoria TEXT;
ALTER TABLE producto ADD COLUMN tono TEXT NOT NULL DEFAULT 'plateado';
ALTER TABLE producto ADD COLUMN lineas TEXT NOT NULL DEFAULT '[]';
ALTER TABLE producto ADD COLUMN talles TEXT NOT NULL DEFAULT '[]';
ALTER TABLE producto ADD COLUMN regulable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE producto ADD COLUMN medida TEXT;
ALTER TABLE producto ADD COLUMN material TEXT;
-- JSON con etiqueta y opciones, cada una con el índice de su foto. `opciones` sigue siendo la lista que valida los pedidos.
ALTER TABLE producto ADD COLUMN variantes TEXT;
ALTER TABLE producto ADD COLUMN fotos TEXT NOT NULL DEFAULT '[]';

-- Fotos subidas desde el panel. Son chicas: el navegador las achica antes de enviarlas.
CREATE TABLE imagen (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('image/webp', 'image/jpeg')),
  datos BLOB NOT NULL,
  creado INTEGER NOT NULL
);

-- Sin código: baja el precio a la vista. Con código: es un cupón que se aplica en el pedido.
CREATE TABLE promocion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('porcentaje', 'monto')),
  valor INTEGER NOT NULL CHECK (valor > 0),
  alcance TEXT NOT NULL CHECK (alcance IN ('todo', 'categoria', 'productos')),
  -- Id de categoría, o JSON con los ids de producto.
  objetivo TEXT,
  codigo TEXT,
  minimo INTEGER NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  usos INTEGER NOT NULL DEFAULT 0,
  usos_max INTEGER,
  inicio INTEGER,
  fin INTEGER,
  activa INTEGER NOT NULL DEFAULT 1,
  creado INTEGER NOT NULL,
  usuario TEXT NOT NULL,
  -- Igual que con el stock: si dos pedidos compiten por el último uso, el segundo se revierte entero.
  CONSTRAINT cupon_agotado CHECK (usos_max IS NULL OR usos <= usos_max)
);

CREATE UNIQUE INDEX promocion_codigo ON promocion (codigo) WHERE codigo IS NOT NULL;

ALTER TABLE pedido ADD COLUMN cupon TEXT;
