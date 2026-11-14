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

const PLACEHOLDER_PATTERNS = [
  /\bPROJECT_REF\b/i,
  /\bREGIAO\b/i,
  /\bSUA_SENHA\b/i,
  /\bSENHA\b/i,
  /\[YOUR-PASSWORD\]/i,
  /\bYOUR-PASSWORD\b/i,
  /\bSEU_[A-Z_]+\b/i,
  /\bTROCAR\b/i,
  /\bCOLE(_AQUI)?\b/i,
  /\bUSER:PASSWORD\b/i,
  /\bHOST:5432\b/i,
  /\busuario:senha\b/i,
];

function findPlaceholders(url) {
  return PLACEHOLDER_PATTERNS.filter((pattern) => pattern.test(url)).map(
    (pattern) => pattern.source.replace(/\\b|\[|\]|\//g, ''),
  );
}

function analyze(url, label) {
  const problems = [];

  if (!url) {
    problems.push(`${label} nao definida.`);
    return problems;
  }

  const placeholders = findPlaceholders(url);

  if (placeholders.length > 0) {
    problems.push(
      `${label} ainda tem placeholder(s) do .env.example: ` +
        placeholders.join(', ') +
        '. Substitua pelos valores reais do painel do Supabase.',
    );
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

    const hasPlaceholders = [databaseUrl, directUrl].some(
      (url) => url && findPlaceholders(url).length > 0,
    );

    if (hasPlaceholders) {
      console.error('\n=== Onde pegar os valores reais ===');
      console.error(
        '  Supabase > Project Settings > Database > Connection string\n' +
          '  (ou o botao "Connect" no topo do dashboard do projeto)\n',
      );
      console.error('  DATABASE_URL  -> aba Transaction pooler (porta 6543)');
      console.error('  DIRECT_URL    -> aba Session pooler (porta 5432)');
      console.error(
        '\n  O host real tem o formato aws-0-<regiao>.pooler.supabase.com' +
          '\n  (ex.: aws-0-us-east-1), e o usuario e postgres.<project-ref>.',
      );
      console.error(
        '\n  Copie a string do painel em vez de digitar o modelo do .env.example.\n',
      );
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

    const isUnreachable =
      error?.code === 'P1001' ||
      message.includes('P1001') ||
      /can't reach database server|can not reach database server/i.test(message);

    if (isUnreachable) {
      console.error('  P1001 = servidor inalcancavel. Causas comuns:');
      console.error('    - host errado ou db.<ref>.supabase.co (IPv6 no Railway)');
      console.error('    - projeto do Supabase pausado');

      const poolerHost = target.match(
        /@(aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com):(\d+)/,
      );

      if (poolerHost) {
        const [, host, port] = poolerHost;
        const cluster = host.match(/^(aws-\d+)-/)?.[1] ?? '';
        const rest = host.replace(/^aws-\d+-/, '');
        const others = ['aws-0', 'aws-1']
          .filter((candidate) => candidate !== cluster)
          .map((candidate) => `${candidate}-${rest}`);

        console.error(
          '\n  Host de pooler detectado. O Prisma reporta "tenant not found"' +
            '\n  como P1001, e cada projeto Supabase vive em um cluster' +
            `\n  (aws-0, aws-1...). Este projeto pode estar em outro:`,
        );

        for (const other of others) {
          console.error(`    ${other}:${port}`);
        }

        console.error(
          '\n  Confirme o host exato em Supabase > Connect > Connection string' +
            '\n  (ou Project Settings > Database).\n',
        );
      }
    } else if (message.includes('P1000')) {
      console.error('  P1000 = autenticacao falhou. Revise usuario e senha.');
      console.error('    - a senha foi substituida no lugar de [YOUR-PASSWORD]?');
      console.error('    - caracteres especiais sem URL-encode?');
    } else if (message.includes('P1003') || message.includes('P1010')) {
      console.error('  O banco/role informado nao existe.');
    } else if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      console.error('  DNS nao resolveu o host. Confira o dominio na URL.');
    }

    // O pooler do Supabase separa os tenants por cluster (aws-0, aws-1...).
    // Um projeto pode estar no aws-1 mesmo que a documentacao mostre aws-0.
    const tenantMissing = /tenant\/user .* not found/i.test(message);
    const poolerMatch = target.match(
      /@(aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com):(\d+)/,
    );

    if (tenantMissing && poolerMatch) {
      const [, currentHost, port] = poolerMatch;
      const cluster = currentHost.match(/^(aws-\d+)-/)?.[1];
      const rest = currentHost.replace(/^aws-\d+-/, '');

      console.error('\n=== Cluster do pooler errado ===');
      console.error(
        `  O tenant existe, mas nao neste cluster (${cluster}). ` +
          'Tente o outro:',
      );

      const alternatives = ['aws-0', 'aws-1']
        .filter((candidate) => candidate !== cluster)
        .map((candidate) => `${candidate}-${rest}`);

      for (const alt of alternatives) {
        console.error(`    ${alt}:${port}`);
      }

      console.error(
        '\n  Substitua o host na URL e rode novamente.\n' +
          '  (o host correto aparece em Supabase > Connect > Connection string)',
      );
    }

    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
})();
