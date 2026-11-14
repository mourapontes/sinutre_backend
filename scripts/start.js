#!/usr/bin/env node
/**
 * Runner de produção.
 *
 * 1. valida as variáveis de ambiente (scripts/check-env.js)
 * 2. garante DIRECT_URL para as migrações (fallback para DATABASE_URL)
 * 3. aplica as migrações
 * 4. sobe o servidor
 *
 * Fica num único processo Node para que o fallback de DIRECT_URL valha para o
 * prisma migrate e para o PrismaClient, sem depender de shell (Windows/Linux).
 */
require('dotenv/config');
require('./check-env');

const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Supabase/Neon com pooler exigem conexão direta para migrar; se o usuário não
// informou DIRECT_URL, usamos DATABASE_URL.
if (!process.env.DIRECT_URL || process.env.DIRECT_URL.trim() === '') {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (process.env.DATABASE_URL.includes('pooler.supabase.com:6543')) {
  console.log(
    '[SiNutre] DATABASE_URL aponta para o pooler (porta 6543). ' +
      'As migrações usarão DIRECT_URL (porta 5432).',
  );
}

const prismaBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

console.log('[SiNutre] Aplicando migrações...');

const migrate = spawnSync(
  process.execPath,
  [prismaBin, 'migrate', 'deploy'],
  { stdio: 'inherit', env: process.env },
);

if (migrate.status !== 0) {
  console.error(
    '\n[SiNutre] Falha ao aplicar as migrações. ' +
      'Verifique DATABASE_URL/DIRECT_URL e se o banco está acessível.\n',
  );
  process.exit(migrate.status ?? 1);
}

require(path.join(__dirname, '..', 'dist', 'index.js'));
