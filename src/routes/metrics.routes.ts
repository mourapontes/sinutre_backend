import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getMetrics } from '../controllers/metrics.controller';

export const metricsRouter = Router();

metricsRouter.use(requireAuth);

// IMC e média calórica dos últimos 7 dias.
metricsRouter.get('/', getMetrics);
