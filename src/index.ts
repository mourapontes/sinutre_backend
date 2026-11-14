import { app } from './app';
import { env } from './config/env';
import { verifyGithubOauth, logGithubOauthStatus } from './lib/github-oauth';

// Rede de seguranca: no Node 22 uma Promise rejeitada sem catch encerra o
// processo. Num handler async do Express 4 (que nao captura rejeicoes) isso
// derrubava o container com "Application failed to respond" em pleno login,
// sempre que o banco oscilava. Os handlers usam asyncHandler; isto aqui cobre
// qualquer caminho que escape.
process.on('unhandledRejection', (reason) => {
  console.error('[SiNutre] Promise rejeitada sem tratamento:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[SiNutre] Excecao nao capturada:', error);
});

// Plataformas de container (Railway, Fly, Render) roteiam para a interface
// pública do container. Escutar só em loopback faria o proxy receber
// "application failed to respond" (HTTP 502).
const HOST = process.env.HOST ?? '0.0.0.0';

const server = app.listen(env.port, HOST, () => {
  console.log(`SiNutre back rodando em http://${HOST}:${env.port}`);
  console.log(
    `[SiNutre] PORT=${env.port} (origem: ${
      process.env.PORT ? 'variavel PORT' : 'padrao 3333'
    })`,
  );
  console.log(`[SiNutre] CORS liberado para: ${env.frontendUrls.join(', ')}`);
  console.log(
    `[SiNutre] GitHub authorize: /auth/github (callback ${env.github.callbackUrl})`,
  );

  // Falha de OAuth App nao impede a API de subir, mas deixa o login impossivel.
  // Roda depois do listen para nao atrasar o healthcheck do Railway.
  void verifyGithubOauth().then(logGithubOauthStatus);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[SiNutre] Porta ${env.port} ja esta em uso. ` +
        'Defina PORT com uma porta livre.',
    );
  } else {
    console.error('[SiNutre] Falha ao iniciar o servidor HTTP:', error.message);
  }

  process.exit(1);
});

function shutdown(signal: string) {
  console.log(`[SiNutre] ${signal} recebido, encerrando...`);
  server.close(() => process.exit(0));

  // Nao deixa o container pendurado se alguma conexao travar.
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
