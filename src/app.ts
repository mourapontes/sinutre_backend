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

// Diagnostico do banco a partir do container publicado. Retorna apenas o codigo
// do erro do Prisma (ex.: P1001 = servidor inalcancavel), nunca host ou senha.
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.json({ status: 'ok' });
  } catch (error) {
    const code =
      (error as { errorCode?: string }).errorCode ??
      (error as Error).name ??
      'desconhecido';

    console.error('[SiNutre] Healthcheck do banco falhou:', error);

    return res.status(503).json({ status: 'error', code });
  }
});

app.use('/auth', authRoutes);
app.use('/meals', mealsRoutes);
app.use('/foods', foodRouter);
app.use('/profile', profileRouter);
app.use('/metrics', metricsRouter);

app.use(notFound);
app.use(errorHandler);
