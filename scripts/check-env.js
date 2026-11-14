#!/usr/bin/env node
/**
 * Valida as variáveis de ambiente obrigatórias antes do Prisma/servidor.
 *
 * Sem isso o container falha uma variável por vez (o Prisma para na primeira),
 * gerando vários ciclos de restart. Aqui listamos todas de uma vez, com o
 * contexto do container (serviço/ambiente) para facilitar o diagnóstico.
 */
require('dotenv/config');

const required = [
  { name: 'DATABASE_URL', hint: 'Supabase: aba "Transaction pooler" (porta 6543) com ?pgbouncer=true' },
  { name: 'DIRECT_URL', hint: 'Supabase: aba "Session pooler" (porta 5432). No Railway/Neon pode ficar vazio', optional: true },
  { name: 'JWT_SECRET', hint: 'uma string longa e aleatoria' },
  { name: 'GITHUB_CLIENT_ID', hint: 'do GitHub OAuth App' },
  { name: 'GITHUB_CLIENT_SECRET', hint: 'do GitHub OAuth App' },
  { name: 'GITHUB_CALLBACK_URL', hint: 'https://<dominio-do-backend>/auth/github/callback' },
];

const isBlank = (name) => {
  const value = process.env[name];
  return !value || value.trim() === '';
};

const missing = required.filter(({ name, optional }) => !optional && isBlank(name));

// Referencia nao resolvida no Railway, ex.: "${{Postgres.DATABASE_URL}}".
const unresolved = required.filter(({ name }) => {
  const value = process.env[name];
  return typeof value === 'string' && value.includes('${{');
});

// Diagnostico: mostra em QUAL servico/ambiente o container esta rodando.
const CONTEXT_KEYS = [
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_PROJECT_NAME',
  'RAILWAY_GIT_REPO_NAME',
  'RAILWAY_GIT_BRANCH',
];

function describeContext() {
  const info = CONTEXT_KEYS.map((key) => [key, process.env[key]]).filter(
    ([, value]) => value,
  );

  if (info.length === 0) {
    return null;
  }

  return info.map(([key, value]) => `      ${key}: ${value}`).join('\n');
}

// Variaveis de sistema que nao ajudam no diagnostico.
const SYSTEM_VARS = /^(PATH|HOME|PWD|SHLVL|_|HOSTNAME|LANG|LC_.*|TERM|SHELL|USER|LOGNAME|TMPDIR|TEMP|TMP|npm_.*|NODE_.*|YARN_.*|NIXPACKS_.*|RAILWAY_ENVIRONMENT|RAILWAY_PROJECT_ID|HOST|HOSTNAME)$/;

function describeAvailable() {
  const names = Object.keys(process.env)
    .filter((key) => /^[A-Z][A-Z0-9_]*$/.test(key))
    .filter((key) => !SYSTEM_VARS.test(key))
    .sort();

  if (names.length === 0) {
    return '(nenhuma variavel de aplicacao encontrada)';
  }

  // Em producao (Linux) a lista e curta. O corte evita poluir o log.
  const LIMIT = 20;
  const shown = names.slice(0, LIMIT);
  const extra = names.length - shown.length;

  return shown.join(', ') + (extra > 0 ? ` (+${extra} outras)` : '');
}

if (missing.length > 0) {
  console.error('\n[SiNutre] Variaveis de ambiente obrigatorias ausentes:\n');

  for (const { name, hint } of missing) {
    console.error(`  - ${name}\n      ${hint}`);
  }

  const context = describeContext();

  if (context) {
    console.error('\n[SiNutre] Container rodando em:\n' + context);
    console.error(
      '\n      As variaveis precisam estar no servico acima (aba Variables)\n' +
        '      e no MESMO ambiente (environment) mostrado aqui.\n',
    );
  }

  console.error('[SiNutre] Variaveis recebidas (apenas nomes):');
  console.error('      ' + describeAvailable() + '\n');

  if (isBlank('DATABASE_URL') && !isBlank('SUPABASE_URL')) {
    console.error(
      '[SiNutre] Dica: SUPABASE_URL/SUPABASE_KEY nao sao usados por este backend.\n' +
        '      E preciso a connection string do PostgreSQL (postgresql://...pooler.supabase.com).\n',
    );
  }

  process.exit(1);
}

if (unresolved.length > 0) {
  console.error(
    '\n[SiNutre] Referencia de variavel nao resolvida: ' +
      unresolved.map(({ name }) => name).join(', ') +
      '\n',
  );
  console.error(
    'O servico citado na referencia precisa existir no projeto.\n' +
      'Se voce usa Supabase, NAO use ${{Postgres.DATABASE_URL}}:\n' +
      'cole a connection string completa.\n',
  );

  process.exit(1);
}

if (!process.env.FRONTEND_URL) {
  console.warn(
    '[SiNutre] FRONTEND_URL nao definida; usando http://localhost:5173. ' +
      'Em producao configure o dominio da Vercel para o CORS funcionar.',
  );
}

// Formato do client_id de um OAuth App do GitHub. Um valor truncado (ex.:
// "v23li..." em vez de "Ov23li...") faz a tela de autorizacao do GitHub
// responder 404 e o login nunca volta para o app.
const GITHUB_CLIENT_ID_PATTERNS = [
  /^Ov23li[A-Za-z0-9]{16}$/, // OAuth App criado a partir de 2024
  /^[0-9a-f]{20}$/, // OAuth App antigo (hex)
  /^Iv1\.[0-9a-f]{16}$/, // GitHub App
];

function mask(value) {
  return value.length <= 8 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function checkGithubOauth() {
  const clientId = (process.env.GITHUB_CLIENT_ID ?? '').trim();

  if (clientId && !GITHUB_CLIENT_ID_PATTERNS.some((re) => re.test(clientId))) {
    console.warn(
      `\n[SiNutre] GITHUB_CLIENT_ID parece invalido (${mask(clientId)}, ` +
        `${clientId.length} caracteres).\n` +
        '      Formatos aceitos: Ov23li + 16 caracteres (OAuth App novo),\n' +
        '      20 caracteres hexadecimais (OAuth App antigo) ou Iv1. + 16 (GitHub App).\n' +
        '      Com o valor errado a pagina do GitHub responde 404 e o login nao\n' +
        '      retorna para o app. Copie o Client ID em\n' +
        '      GitHub > Settings > Developer settings > OAuth Apps > (seu app).\n' +
        '      Se o app nao existir mais, crie outro e atualize Client ID,\n' +
        '      Client Secret e GITHUB_CALLBACK_URL aqui e no GitHub.\n',
    );
    return;
  }

  if (clientId) {
    console.log(`[SiNutre] GitHub client_id: ${mask(clientId)}`);
  }

  const callbackUrl = (process.env.GITHUB_CALLBACK_URL ?? '').trim();
  const deployed = Boolean(
    process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT,
  );

  if (callbackUrl && !/\/auth\/github\/callback$/.test(callbackUrl)) {
    console.warn(
      `[SiNutre] GITHUB_CALLBACK_URL deveria terminar em /auth/github/callback: ${callbackUrl}`,
    );
  }

  if (deployed && /localhost|127\.0\.0\.1/.test(callbackUrl)) {
    console.warn(
      '[SiNutre] GITHUB_CALLBACK_URL aponta para localhost, mas o servidor esta\n' +
        '      publicado. O GitHub so aceita a URL cadastrada no OAuth App; use o\n' +
        '      dominio publico do backend.',
    );
  }

  console.log(`[SiNutre] GitHub callback: ${callbackUrl || '(vazio)'}`);
}

checkGithubOauth();

console.log('[SiNutre] Variaveis de ambiente validadas.');

const context = describeContext();
if (context) {
  console.log('[SiNutre] Container:\n' + context);
}
