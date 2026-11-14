import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getProfile, updateProfile } from '../controllers/profile.controller';

export const profileRouter = Router();

profileRouter.use(requireAuth);

// Dados complementares do usuário logado (meta calórica, altura e peso).
profileRouter.get('/', getProfile);
profileRouter.put('/', updateProfile);
