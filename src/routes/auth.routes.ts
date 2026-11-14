import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { asyncHandler } from '../lib/http';
import { me } from '../controllers/auth.me';

import {
  redirectToGithub,
  githubCallback,
} from '../controllers/auth.controller';

export const authRoutes = Router();

authRoutes.get('/github', redirectToGithub);
authRoutes.get('/github/callback', asyncHandler(githubCallback));
authRoutes.get('/me', requireAuth, asyncHandler(me));
