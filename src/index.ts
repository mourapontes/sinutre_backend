import { app } from './app';
import { env } from './config/env';

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
