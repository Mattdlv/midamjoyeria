-- Cupones generados juntos: cada código es una promoción propia, y este id los agrupa en el panel.
ALTER TABLE promocion ADD COLUMN lote TEXT;

CREATE INDEX promocion_lote ON promocion (lote) WHERE lote IS NOT NULL;
