-- Montos en pesos enteros. Fechas en milisegundos UTC.
-- El stock es por producto y no por opción, porque el catálogo no informa cuántas unidades hay de cada una.

CREATE TABLE producto (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  precio INTEGER NOT NULL CHECK (precio >= 0),
  -- Este CHECK es lo que evita vender de más: si dos pedidos compiten por la última unidad,
  -- el segundo viola la restricción y su transacción completa se revierte.
  stock_disponible INTEGER NOT NULL CHECK (stock_disponible >= 0),
  stock_reservado INTEGER NOT NULL DEFAULT 0 CHECK (stock_reservado >= 0),
  etiqueta_opcion TEXT,
  opciones TEXT NOT NULL DEFAULT '[]',
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  whatsapp TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  creado INTEGER NOT NULL
);

CREATE TABLE pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES cliente (id),
  nombre_entrega TEXT NOT NULL,
  tipo_entrega TEXT NOT NULL CHECK (tipo_entrega IN ('retiro', 'envio')),
  direccion TEXT,
  localidad TEXT,
  cp TEXT,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('transferencia', 'mercado_pago', 'efectivo')),
  nota TEXT,
  es_regalo INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL,
  descuento INTEGER NOT NULL DEFAULT 0,
  -- NULL significa "a confirmar".
  costo_envio INTEGER,
  estado TEXT NOT NULL DEFAULT 'creado'
    CHECK (estado IN ('creado', 'confirmado', 'pagado', 'preparado', 'despachado', 'listo_retiro', 'entregado', 'vencido', 'cancelado', 'devuelto')),
  estado_pago TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'parcial', 'pagado', 'devuelto')),
  whatsapp_clic_en INTEGER,
  reserva_vence_en INTEGER NOT NULL,
  creado INTEGER NOT NULL,
  ip_hash TEXT,
  origen TEXT
);

CREATE INDEX pedido_vencimiento ON pedido (estado, reserva_vence_en);
CREATE INDEX pedido_cliente ON pedido (cliente_id, estado);
CREATE INDEX pedido_ip ON pedido (ip_hash, creado);

CREATE TABLE item_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedido (id),
  producto_id TEXT NOT NULL REFERENCES producto (id),
  -- Copias del momento de la compra: un cambio posterior no altera el comprobante.
  nombre_al_comprar TEXT NOT NULL,
  descripcion_al_comprar TEXT NOT NULL,
  opcion TEXT,
  precio_al_comprar INTEGER NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0)
);

CREATE INDEX item_pedido_pedido ON item_pedido (pedido_id);

CREATE TABLE movimiento_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id TEXT NOT NULL REFERENCES producto (id),
  cantidad INTEGER NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN ('carga_inicial', 'reserva', 'liberacion', 'venta', 'venta_otro_canal', 'ajuste', 'devolucion')),
  pedido_id INTEGER REFERENCES pedido (id),
  fecha INTEGER NOT NULL
);

CREATE INDEX movimiento_producto ON movimiento_stock (producto_id, fecha);
