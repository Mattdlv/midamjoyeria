import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { urlBaseLocal } from './scripts/estado-local.mjs';

process.env.MIDAM_DB_LOCAL ??= urlBaseLocal();

const secreto = () => envField.string({ context: 'server', access: 'secret', optional: true });

// El sitio sigue siendo estático; solo las rutas con `prerender = false` corren en una función de Vercel.
export default defineConfig({
  site: 'https://midamjoyeria.shop',
  integrations: [react()],
  adapter: vercel(),
  security: {
    // Hosts de los que se acepta X-Forwarded-Host para armar enlaces y validar el origen de los formularios.
    allowedDomains: [
      { hostname: 'midamjoyeria.shop', protocol: 'https' },
      { hostname: 'www.midamjoyeria.shop', protocol: 'https' },
      { hostname: '**.vercel.app', protocol: 'https' },
    ],
  },
  env: {
    schema: {
      DB_URL: secreto(),
      DB_TOKEN: secreto(),
      SESION_SECRETO: secreto(),
      ADMIN_USUARIOS: secreto(),
      ADMIN_DEV_EMAIL: secreto(),
      HORAS_RESERVA: secreto(),
      LIMITE_PEDIDOS_HORA_IP: secreto(),
      LIMITE_PEDIDOS_ABIERTOS: secreto(),
    },
  },
  devToolbar: { enabled: false },
});
