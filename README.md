# Tienda Midam

Tienda en Astro, TypeScript y React, publicada en Vercel con base de datos Turso. El catálogo es estático; los pedidos, el stock, el comprobante y el panel corren en funciones de Vercel. El pago y el cierre son por WhatsApp.

## Ejecutar

La primera vez, instalar y preparar la base local. No hace falta ninguna cuenta.

```bash
npm install
```

```bash
npm run db:migrar
```

```bash
npm run db:seed
```

Para entrar al panel en local, copiar `.env.example` como `.env`. Sin ese archivo, `/admin` pide contraseña y no hay usuarios cargados.

Después, para trabajar:

```bash
npm run dev
```

Queda en http://localhost:4321, con el panel en http://localhost:4321/admin.

La base local es un archivo en la carpeta temporal del sistema (`midam-local`). Se puede cambiar con la variable `MIDAM_ESTADO_LOCAL`.

## Otros comandos

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Genera el sitio y las funciones en `.vercel/output` |
| `npm run test:acceso` | Prueba permisos y sesiones; no necesita servidor |
| `npm run test:pedidos` | Prueba pedidos contra el servidor en marcha (`BASE_URL` para otro puerto). Modifica el stock local |
| `npm run test:panel` | Prueba el panel de la misma forma |
| `npm run test:ingreso` | Prueba el ingreso real. Requiere un servidor sin `ADMIN_DEV_EMAIL` y las variables `EMAIL_PRUEBA` y `CLAVE_PRUEBA` |
| `npm run db:seed` | Carga los productos que falten; no pisa stock ni precios existentes |
| `npm run db:limpiar` | Borra los pedidos y vuelve el stock a la carga inicial. Solo para desarrollo |
| `node scripts/db.mjs consulta "SELECT ..."` | Ejecuta una consulta. Usa `DB_URL` y `DB_TOKEN` si están definidas; si no, la base local |
| `node scripts/crear-usuario.mjs persona@ejemplo.com` | Genera la entrada de `ADMIN_USUARIOS` para una persona del panel |
| `node scripts/armar-catalogo.mjs fuente` | Regenera datos y fotos desde `fuente/` |

## Cómo funciona un pedido

1. `POST /api/pedidos` valida los datos y toma precio y opciones de la base, no del navegador.
2. Una sola transacción crea el pedido y descuenta el stock. Una restricción `CHECK` en la tabla revierte todo si no alcanza: así dos compras no pueden llevarse la última unidad.
3. `/pedido/[token]/confirmacion` muestra el botón a WhatsApp con el mensaje armado.
4. `/pedido/[token]` es el comprobante, privado por su token.
5. Las reservas vencidas se liberan cada vez que se crea o se lee un pedido o se consulta stock.

## Panel

`/admin` gestiona pedidos, cobros, stock y ajustes. Lo protege `src/middleware.ts`, que falla cerrado: sin configuración válida no entra nadie.

- **Producción:** ingreso con mail y contraseña en `/admin/ingresar`. Las personas habilitadas están en `ADMIN_USUARIOS`, con la contraseña como hash, y la sesión es una cookie firmada con `SESION_SECRETO` que dura 7 días. Cambiar la contraseña o sacar a alguien cierra sus sesiones.
- **Intentos:** 5 fallidos por persona e IP, o 20 por IP, bloquean durante 15 minutos.
- **Local:** `ADMIN_DEV_EMAIL` en `.env` entra sin contraseña, solo desde localhost. No se carga en Vercel.

Un cambio de estado corre en una transacción que exige el estado leído, así que un doble clic no mueve el stock dos veces.

## Publicar

Las cuentas y los cambios en Hostinger los hace quien administra el proyecto, idealmente a nombre del cliente.

**Vercel:** el plan Hobby es solo para uso personal, no comercial. Sirve para probar; para vender hace falta Pro.

1. **Base de datos.** Crear la base en [Turso](https://app.turso.tech) y generar un token. Cargar el esquema y el catálogo, con `DB_URL` y `DB_TOKEN` definidas en la terminal:

   ```bash
   npm run db:migrar
   ```

   ```bash
   npm run db:seed
   ```

2. **Usuarios.** Correr `node scripts/crear-usuario.mjs` por cada persona del panel. Las entradas se separan con punto y coma.
3. **Proyecto en Vercel.** Importar el proyecto; si está dentro de un repositorio con otras carpetas, poner `tienda` como Root Directory.
4. **Variables,** en Settings > Environment Variables: `DB_URL`, `DB_TOKEN`, `ADMIN_USUARIOS` y `SESION_SECRETO` (al menos 32 caracteres al azar). No cargar `ADMIN_DEV_EMAIL`.
5. **Primera prueba en la dirección `.vercel.app`:** `node tests/humo-publicado.mjs`, con `BASE_URL`, `DB_URL`, `DB_TOKEN`, `EMAIL_PRUEBA` y `CLAVE_PRUEBA` definidas. Prueba compra, comprobante, panel y cambio de estado, y borra sus datos.
6. **Dominio.** En Vercel, Settings > Domains, agregar `midamjoyeria.shop` y `www.midamjoyeria.shop`. En Hostinger, DNS / Nameservers, cargar los registros que indique Vercel y borrar el `A` y el `CNAME` de `www` de la página de estacionamiento. Los nameservers no se cambian.
7. **Redirigir** `www` a la raíz desde Settings > Domains.

## Antes de vender

- Sacar `noindex` de `src/layouts/Base.astro`, que hoy bloquea todo el sitio para los buscadores.
- Sumar la verificación antibots. Hoy hay trampa de bots y límites por teléfono e IP.
- Validar con el contador el nombre y la leyenda del comprobante.
- Cargar datos de transferencia y lugar de retiro en Ajustes.

## Carpetas

| Carpeta | Contenido |
| --- | --- |
| `db/migraciones/` | Esquema de la base |
| `db/seed.sql` | Carga del catálogo, generada |
| `fuente/` | Catálogo y fotos originales leídos de Treinta el 2/11/2026; no va al repositorio ni se publica. `armar-catalogo` la necesita |
| `scripts/curaduria.mjs` | Descripción, tono, línea, variantes y recorte de cada producto (borradores a confirmar) |
| `src/data/productos.json` | Catálogo generado; no se edita a mano |
| `src/lib/` | Catálogo, contacto, bolsa, pedidos, panel, acceso y base de datos |
| `src/components/` | Componentes reutilizables |
| `src/pages/` | Páginas y API |
| `src/styles/` | Tokens y estilos |
| `tests/` | Criterios de aceptación de pedidos, panel y permisos |

El sistema visual está en `DESIGN_SYSTEM.md`.
