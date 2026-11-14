import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  createFood,
  deleteFood,
  listFoods,
  updateFood,
} from '../controllers/food.controller';

export const foodRouter = Router();

foodRouter.use(requireAuth);

//foods/
foodRouter.get('/', listFoods);
foodRouter.post('/', createFood);
foodRouter.put('/:id', updateFood);
foodRouter.delete('/:id', deleteFood);
