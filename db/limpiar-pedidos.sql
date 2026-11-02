-- Solo para desarrollo: borra pedidos de prueba y deja el stock como en la carga inicial del catálogo.
UPDATE producto SET
  stock_disponible = COALESCE((SELECT cantidad FROM movimiento_stock m WHERE m.producto_id = producto.id AND m.motivo = 'carga_inicial'), stock_disponible),
  stock_reservado = 0;
DELETE FROM pago;
DELETE FROM historial_pedido;
DELETE FROM item_pedido;
DELETE FROM movimiento_stock WHERE motivo <> 'carga_inicial';
DELETE FROM pedido;
DELETE FROM cliente;
DELETE FROM sqlite_sequence WHERE name IN ('pedido', 'cliente', 'pago', 'historial_pedido', 'item_pedido');
DELETE FROM intento_login;
