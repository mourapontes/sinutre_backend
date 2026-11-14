import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { authRoutes } from './routes/auth.routes';
import { mealsRoutes } from './routes/meals.routes';
import { foodRouter } from './routes/food.routes';
import { profileRouter } from './routes/profile.routes';
import { metricsRouter } from './routes/metrics.routes';
import { errorHandler, notFound } from './middlewares/error.middleware';

export const app = express();

app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/meals', mealsRoutes);
app.use('/foods', foodRouter);
app.use('/profile', profileRouter);
app.use('/metrics', metricsRouter);

app.use(notFound);
app.use(errorHandler);
