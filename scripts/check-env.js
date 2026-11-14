#!/usr/bin/env node
/**
 * Valida as variáveis de ambiente obrigatórias antes do Prisma/servidor.
 *
 * Sem isso o container falha uma variável por vez (o Prisma para na primeira),
 * gerando vários ciclos de restart. Aqui listamos todas de uma vez.
 */
require('dotenv/config');

const required = [
  { name: 'DATABASE_URL', hint: 'Railway: crie um PostgreSQL e use ${{Postgres.DATABASE_URL}} (ou a string do Supabase/Neon)' },
  { name: 'JWT_SECRET', hint: 'uma string longa e aleatoria' },
  { name: 'GITHUB_CLIENT_ID', hint: 'do GitHub OAuth App' },
  { name: 'GITHUB_CLIENT_SECRET', hint: 'do GitHub OAuth App' },
  { name: 'GITHUB_CALLBACK_URL', hint: 'https://<dominio-do-backend>/auth/github/callback' },
];

const missing = required.filter(({ name }) => {
  const value = process.env[name];
  return !value || value.trim() === '';
});

// Referencia nao resolvida no Railway, ex.: "${{Postgres.DATABASE_URL}}".
const unresolved = required.filter(({ name }) => {
  const value = process.env[name];
  return typeof value === 'string' && value.includes('${{');
});

if (missing.length > 0) {
  console.error('\n[SiNutre] Variaveis de ambiente obrigatorias ausentes:\n');

  for (const { name, hint } of missing) {
    console.error(`  - ${name}\n      ${hint}`);
  }

  console.error(
    '\nConfigure em Railway > seu servico > Variables e faca o redeploy.\n',
  );

  process.exit(1);
}

if (unresolved.length > 0) {
  console.error(
    '\n[SiNutre] Referencia de variavel nao resolvida: ' +
      unresolved.map(({ name }) => name).join(', ') +
      '\n',
  );
  console.error(
    'O nome do servico na referencia precisa ser identico ao nome real.\n' +
      'Ex.: se o banco se chama "Postgres", use ${{Postgres.DATABASE_URL}}.\n',
  );

  process.exit(1);
}

if (!process.env.FRONTEND_URL) {
  console.warn(
    '[SiNutre] FRONTEND_URL nao definida; usando http://localhost:5173. ' +
      'Em producao configure o dominio da Vercel para o CORS funcionar.',
  );
}

console.log('[SiNutre] Variaveis de ambiente validadas.');
