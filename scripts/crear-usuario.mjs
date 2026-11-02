// Genera la entrada de ADMIN_USUARIOS para una persona del panel. La contraseña no se guarda en ningún lado.
//   node scripts/crear-usuario.mjs persona@ejemplo.com
// Varias personas se separan con punto y coma en la variable.
import { createInterface } from 'node:readline/promises';
import { crearEntradaUsuario } from '../src/lib/acceso.ts';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Uso: node scripts/crear-usuario.mjs persona@ejemplo.com');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const clave = await rl.question('Contraseña (mínimo 12 caracteres): ');
rl.close();
if (clave.length < 12) {
  console.error('Tiene que tener al menos 12 caracteres.');
  process.exit(1);
}
console.log('\nAgregá esto a ADMIN_USUARIOS:\n');
console.log(await crearEntradaUsuario(email, clave));
