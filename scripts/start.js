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
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** Mostra apenas host:porta, sem usuário/senha. */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '(URL invalida)';
  }
}

// Supabase/Neon atras do pooler exigem conexao direta para migrar; se o usuario
// nao informou DIRECT_URL, usamos DATABASE_URL.
if (!process.env.DIRECT_URL || process.env.DIRECT_URL.trim() === '') {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (process.env.DATABASE_URL.includes('pooler.supabase.com:6543')) {
  console.log(
    '[SiNutre] DATABASE_URL aponta para o pooler (porta 6543). ' +
      'As migrações usarão DIRECT_URL (porta 5432).',
  );
}

console.log('[SiNutre] Migrações em:', describeTarget(process.env.DIRECT_URL));

// O build precisa ter gerado dist/. Sem isso o require abaixo falha com
// MODULE_NOT_FOUND e o container reinicia em loop (502 no proxy).
const entry = path.join(root, 'dist', 'index.js');

if (!fs.existsSync(entry)) {
  console.error(
    '\n[SiNutre] dist/index.js nao existe. O build nao rodou ou falhou.\n' +
      '      Rode "npm run build" antes de "npm start"\n' +
      '      (o railway.json ja executa o build no deploy).\n',
  );
  process.exit(1);
}

const prismaBin = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

console.log('[SiNutre] Aplicando migrações...');

const migrate = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
  // Falha rapido quando o banco nao responde: com o healthcheck do Railway em
  // 100s, um migrate pendurado derrubaria o deploy antes de qualquer log util.
  timeout: 90_000,
});

if (migrate.error && migrate.error.code === 'ETIMEDOUT') {
  console.error(
    '\n[SiNutre] A migração excedeu 90s. O banco não respondeu.\n' +
      '      Verifique se o host aceita conexão de fora (o Supabase\n' +
      '      "Direct connection" e IPv6-only e nao funciona no Railway).\n',
  );
  process.exit(1);
}

if (migrate.status !== 0) {
  console.error(
    '\n[SiNutre] Falha ao aplicar as migrações. ' +
      'Verifique DATABASE_URL/DIRECT_URL e se o banco está acessível.\n',
  );
  process.exit(migrate.status ?? 1);
}

require(entry);
