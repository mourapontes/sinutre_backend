#!/usr/bin/env node
/**
 * Testa a conexão com o banco informado em DATABASE_URL / DIRECT_URL.
 *
 *   npm run test:db
 *
 * Rode localmente (com .env preenchido) para descobrir se a connection string do
 * Supabase está correta ANTES de subir para o Railway. Também funciona como
 * diagnóstico dentro do container.
 */
require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const mask = (url) => {
  if (!url) return '(nao definida)';
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
};

function analyze(url, label) {
  const problems = [];

  if (!url) {
    problems.push(`${label} nao definida.`);
    return problems;
  }

  if (url.includes('${{')) {
    problems.push(
      `${label} contem uma referencia nao resolvida (formato de referencia` +
        ' do Railway). Cole o valor literal entre aspas.',
    );
  }

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    // ok
  } else {
    problems.push(`${label} nao comeca com postgresql:// ou postgres://.`);
  }

  if (url.includes('[YOUR-PASSWORD]') || url.includes('[SENHA]')) {
    problems.push(`${label} ainda tem o placeholder da senha.`);
  }

  if (/db\.[a-z0-9]+\.supabase\.co/i.test(url)) {
    problems.push(
      `${label} usa a "Direct connection" do Supabase (IPv6-only). ` +
        'No Railway isso falha com P1001. Use o Session pooler (porta 5432).',
    );
  }

  if (/:6543/.test(url) && !/pgbouncer=true/.test(url)) {
    problems.push(
      `${label} usa a porta 6543 (pooler) sem ?pgbouncer=true. ` +
        'O Prisma precisa desse parametro.',
    );
  }

  return problems;
}

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  console.log('\n=== Configuracao ===');
  console.log('DATABASE_URL:', mask(databaseUrl));
  console.log('DIRECT_URL:  ', mask(directUrl));

  const problems = [
    ...analyze(databaseUrl, 'DATABASE_URL'),
    // DIRECT_URL e opcional: sem ela, as migracoes usam DATABASE_URL.
    ...(directUrl ? analyze(directUrl, 'DIRECT_URL') : []),
  ];

  const hints = [];

  if (databaseUrl && /:6543/.test(databaseUrl) && !directUrl) {
    hints.push(
      'DATABASE_URL esta no pooler (6543) e DIRECT_URL esta vazia. ' +
        'As migracoes precisam da porta 5432 (Session pooler).',
    );
  }

  if (problems.length > 0) {
    console.error('\n=== Problemas no formato ===');
    for (const problem of problems) {
      console.error('  - ' + problem);
    }
  }

  if (hints.length > 0) {
    console.error('\n=== Avisos ===');
    for (const hint of hints) {
      console.error('  - ' + hint);
    }
  }

  if (problems.length > 0) {
    console.error('\nCorrija os itens acima e rode novamente.');
    process.exit(1);
  }

  const target = directUrl || databaseUrl;
  const client = new PrismaClient({
    datasources: { db: { url: target } },
  });

  console.log('\n=== Teste de conexao ===');

  try {
    const rows = await client.$queryRawUnsafe(
      'select current_database() as db, version() as version',
    );
    const info = rows[0];

    console.log('  conectado ao banco:', info.db);
    console.log('  ' + String(info.version).split(',')[0]);

    const tables = await client.$queryRawUnsafe(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );

    console.log(
      '  tabelas em public:',
      tables.length === 0
        ? '(nenhuma - o migrate deploy vai cria-las)'
        : tables.map((t) => t.tablename).join(', '),
    );

    console.log('\nOK: a connection string esta valida.\n');
  } catch (error) {
    const message = String(
      error?.message || error?.meta?.message || JSON.stringify(error) || error,
    );
    const code = error?.code ? `[${error.code}] ` : '';
    const firstLine = message.trim().split('\n')[0]?.trim() ?? '';
    const detail =
      code || /connection|reach|auth|ENOTFOUND|refused/i.test(message)
        ? message
        : `${code}${firstLine}`;

    console.error('\n  FALHOU:');
    for (const line of detail.trim().split('\n').slice(0, 4)) {
      if (line.trim()) console.error('    ' + line.trim());
    }
    console.error('');

    if (message.includes('P1001')) {
      console.error('  P1001 = servidor inalcancavel. Causas comuns:');
      console.error('    - host errado ou db.<ref>.supabase.co (IPv6 no Railway)');
      console.error('    - projeto do Supabase pausado');
    } else if (message.includes('P1000')) {
      console.error('  P1000 = autenticacao falhou. Revise usuario e senha.');
      console.error('    - a senha foi substituida no lugar de [YOUR-PASSWORD]?');
      console.error('    - caracteres especiais sem URL-encode?');
    } else if (message.includes('P1003') || message.includes('P1010')) {
      console.error('  O banco/role informado nao existe.');
    } else if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      console.error('  DNS nao resolveu o host. Confira o dominio na URL.');
    }

    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
})();
