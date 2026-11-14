import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, HttpError, type FieldErrors } from '../lib/http';
import {
  asObject,
  assertValid,
  readIdParam,
  readNumber,
  readString,
  type Payload,
} from '../lib/validation';

// Limites coerentes com o que se espera no banco (valores por 100 g).
const LIMITS = {
  name: { required: true, maxLength: 120, label: 'Nome' },
  caloriesPer100g: { required: true, min: 0, max: 900, label: 'Calorias por 100g' },
  carbsPer100g: { required: true, min: 0, max: 100, label: 'Carboidratos por 100g' },
  proteinPer100g: { required: true, min: 0, max: 100, label: 'Proteínas por 100g' },
  fatPer100g: { required: true, min: 0, max: 100, label: 'Gorduras por 100g' },
} as const;

interface FoodInput {
  name: string;
  caloriesPer100g: number;
  carbsPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
}

function parseFoodPayload(body: unknown): FoodInput {
  const source = asObject(body);
  const errors: FieldErrors = {};

  const name = readString(source, 'name', errors, LIMITS.name);
  const caloriesPer100g = readNumber(source, 'caloriesPer100g', errors, LIMITS.caloriesPer100g);
  const carbsPer100g = readNumber(source, 'carbsPer100g', errors, LIMITS.carbsPer100g);
  const proteinPer100g = readNumber(source, 'proteinPer100g', errors, LIMITS.proteinPer100g);
  const fatPer100g = readNumber(source, 'fatPer100g', errors, LIMITS.fatPer100g);

  assertValid(errors);

  return {
    name: name!,
    caloriesPer100g: caloriesPer100g!,
    carbsPer100g: carbsPer100g!,
    proteinPer100g: proteinPer100g!,
    fatPer100g: fatPer100g!,
  };
}

async function findOwnedFood(id: number, userId: number) {
  const food = await prisma.food.findFirst({ where: { id, userId } });

  if (!food) {
    throw new HttpError(404, 'Alimento não encontrado.');
  }

  return food;
}

// GET /foods?search=
export const listFoods = asyncHandler(async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();

  const foods = await prisma.food.findMany({
    where: {
      userId: req.userId!,
      name: { contains: search },
    },
    take: 10,
    orderBy: { name: 'asc' },
  });

  return res.json(foods);
});

// POST /foods
export const createFood = asyncHandler(async (req: Request, res: Response) => {
  const data = parseFoodPayload(req.body);

  const food = await prisma.food.create({
    data: { ...data, userId: req.userId! },
  });

  return res.status(201).json(food);
});

// PUT /foods/:id
export const updateFood = asyncHandler(async (req: Request, res: Response) => {
  const id = readIdParam(req.params.id, 'Identificador do alimento');
  const data = parseFoodPayload(req.body);

  await findOwnedFood(id, req.userId!);

  const food = await prisma.food.update({ where: { id }, data });

  return res.json(food);
});

// DELETE /foods/:id
export const deleteFood = asyncHandler(async (req: Request, res: Response) => {
  const id = readIdParam(req.params.id, 'Identificador do alimento');

  await findOwnedFood(id, req.userId!);

  const usedInMeals = await prisma.mealFood.count({ where: { foodId: id } });

  if (usedInMeals > 0) {
    throw new HttpError(
      409,
      'Este alimento já foi usado em refeições e não pode ser excluído.',
    );
  }

  await prisma.food.delete({ where: { id } });

  return res.status(204).send();
});
