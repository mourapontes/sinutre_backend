import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { prisma } from './prisma';
import { authRoutes } from './routes/auth.routes';
import { mealsRoutes } from './routes/meals.routes';
import { foodRouter } from './routes/food.routes';
import { profileRouter } from './routes/profile.routes';
import { metricsRouter } from './routes/metrics.routes';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { HttpError } from './lib/http';

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Requisições sem Origin (curl, health check, server-to-server) passam.
      if (!origin || env.isAllowedOrigin(origin)) {
        return callback(null, origin ?? true);
      }

      // Negar aqui faria o middleware chamar next(), e o preflight cairia no
      // notFound (404). Respondemos com 403 explicito para o navegador.
      console.warn(
        `[CORS] Origem bloqueada: ${origin}. ` +
          `Permitidas: ${env.frontendUrls.join(', ') || '(nenhuma)'}`,
      );
      return callback(new HttpError(403, `Origem nao permitida: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Classifica a falha do Prisma em uma categoria segura (sem host nem senha).
 * A mensagem crua fica só no log do container.
 */
function classifyDbError(error: unknown): string {
  const code = (error as { errorCode?: string }).errorCode;
  const message = String(
    (error as Error)?.message ?? (error as unknown) ?? '',
  ).toLowerCase();

  if (code === 'P1000' || message.includes('authentication failed')) {
    return 'authentication-failed';
  }

  if (message.includes('enotfound') || message.includes('getaddrinfo')) {
    return 'dns-not-found';
  }

  if (
    message.includes("can't reach database server") ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('timed out')
  ) {
    return 'unreachable';
  }

  if (
    message.includes('certificate') ||
    message.includes('tls') ||
    message.includes('ssl')
  ) {
    return 'tls';
  }

  if (message.includes('too many connections') || message.includes('pool')) {
    return 'pool-exhausted';
  }

  if (code === 'P2021' || message.includes('does not exist')) {
    return 'schema-missing';
  }

  if (code === 'P1003' || message.includes('does not exist in the database')) {
    return 'database-missing';
  }

  return 'unknown';
}

// Diagnostico do banco a partir do container publicado. Retorna a categoria da
// falha (ex.: unreachable, dns-not-found), nunca host ou senha.
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.json({ status: 'ok' });
  } catch (error) {
    const reason = classifyDbError(error);
    const code = (error as { errorCode?: string }).errorCode ?? null;

    console.error(
      `[SiNutre] Healthcheck do banco falhou (${reason}):`,
      error,
    );

    return res.status(503).json({ status: 'error', reason, code });
  }
});

app.use('/auth', authRoutes);
app.use('/meals', mealsRoutes);
app.use('/foods', foodRouter);
app.use('/profile', profileRouter);
app.use('/metrics', metricsRouter);

app.use(notFound);
app.use(errorHandler);
