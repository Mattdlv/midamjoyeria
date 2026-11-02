// Base de desarrollo: un archivo en la carpeta temporal, para no depender de la ruta del proyecto.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const carpeta = process.env.MIDAM_ESTADO_LOCAL ?? path.join(os.tmpdir(), 'midam-local');

export const urlBaseLocal = () => {
  fs.mkdirSync(carpeta, { recursive: true });
  return `file:${path.join(carpeta, 'midam.db').replaceAll('\\', '/')}`;
};
