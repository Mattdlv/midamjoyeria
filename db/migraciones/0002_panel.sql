ALTER TABLE pedido ADD COLUMN costo_envio_real INTEGER;
ALTER TABLE pedido ADD COLUMN seguimiento_empresa TEXT;
ALTER TABLE pedido ADD COLUMN seguimiento_codigo TEXT;
ALTER TABLE pedido ADD COLUMN link_pago TEXT;
ALTER TABLE pedido ADD COLUMN nota_interna TEXT;
-- 1 cuando la reserva ya pasó a ser venta. Evita descontar o devolver stock dos veces.
ALTER TABLE pedido ADD COLUMN venta_registrada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pedido ADD COLUMN actualizado INTEGER;

ALTER TABLE movimiento_stock ADD COLUMN usuario TEXT;
ALTER TABLE movimiento_stock ADD COLUMN nota TEXT;

CREATE TABLE pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedido (id),
  metodo TEXT NOT NULL CHECK (metodo IN ('transferencia', 'mercado_pago', 'efectivo', 'otro')),
  monto INTEGER NOT NULL CHECK (monto > 0),
  referencia TEXT,
  fecha INTEGER NOT NULL,
  registrado_por TEXT NOT NULL
);

CREATE INDEX pago_pedido ON pago (pedido_id);

CREATE TABLE historial_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedido (id),
  detalle TEXT NOT NULL,
  usuario TEXT NOT NULL,
  fecha INTEGER NOT NULL
);

CREATE INDEX historial_pedido_pedido ON historial_pedido (pedido_id, fecha);

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado INTEGER NOT NULL,
  usuario TEXT NOT NULL
);
