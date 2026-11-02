-- Intentos fallidos de ingreso al panel, para frenar a quien prueba contraseñas.
CREATE TABLE intento_login (
  clave TEXT NOT NULL,
  fecha INTEGER NOT NULL
);

CREATE INDEX intento_login_clave ON intento_login (clave, fecha);
