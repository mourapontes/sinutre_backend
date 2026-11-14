import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, HttpError, type FieldErrors } from '../lib/http';
import { asObject, assertValid, readNumber, readString } from '../lib/validation';
import { MEAL_CHOICES } from '../constants/enums';

interface MealItemInput {
  foodId: number;
  grams: number;
}

interface MealInput {
  type: string;
  eatTime: Date;
  description?: string;
  items: MealItemInput[];
}

function parseMealPayload(body: unknown): MealInput {
  const source = asObject(body);
  const errors: FieldErrors = {};

  const type = readString(source, 'type', errors, {
    required: true,
    allowed: MEAL_CHOICES,
    label: 'Tipo de refeição',
  });

  const eatTimeRaw = readString(source, 'eatTime', errors, {
    required: true,
    label: 'Data e horário',
  });

  const description = readString(source, 'description', errors, {
    maxLength: 200,
    label: 'Descrição',
  });

  const eatTime = eatTimeRaw ? new Date(eatTimeRaw) : undefined;

  if (eatTime && Number.isNaN(eatTime.getTime())) {
    errors.eatTime = 'Data e horário inválidos.';
  }

  const items: MealItemInput[] = [];
  const rawItems = source.items;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    errors.items = 'Selecione ao menos um alimento.';
  } else {
    rawItems.forEach((rawItem, index) => {
      const itemSource = (
        rawItem && typeof rawItem === 'object' ? rawItem : {}
      ) as Record<string, unknown>;
      const itemErrors: FieldErrors = {};

      const foodId = readNumber(itemSource, 'foodId', itemErrors, {
        required: true,
        integer: true,
        min: 1,
        label: `Alimento do item #${index + 1}`,
      });

      const grams = readNumber(itemSource, 'grams', itemErrors, {
        required: true,
        min: 1,
        max: 5000,
        label: `Gramas do item #${index + 1}`,
      });

      const firstError = Object.values(itemErrors)[0];

      if (firstError) {
        errors.items = firstError;
        return;
      }

      items.push({ foodId: foodId!, grams: grams! });
    });

    if (!errors.items && new Set(items.map((item) => item.foodId)).size !== items.length) {
      errors.items = 'Não repita o mesmo alimento na refeição.';
    }
  }

  assertValid(errors);

  return {
    type: type!,
    eatTime: eatTime!,
    description,
    items,
  };
}

export const meals = asyncHandler(async (req: Request, res: Response) => {
  const meals = await prisma.meal.findMany({
    where: {
      userId: req.userId,
    },

    include: {
      foods: {
        include: {
          food: true,
        },
      },
    },

    orderBy: {
      createdAt: 'desc',
    },
  });

  const result = meals.map((meal) => {
    const totals = meal.foods.reduce(
      (acc, item) => {
        const factor = item.foodG / 100;

        acc.grams += item.foodG;

        acc.calories +=
          item.food.caloriesPer100g *
          factor;

        acc.carbs +=
          item.food.carbsPer100g *
          factor;

        acc.proteins +=
          item.food.proteinPer100g *
          factor;

        acc.fats +=
          item.food.fatPer100g *
          factor;

        return acc;
      },
      {
        grams: 0,
        calories: 0,
        carbs: 0,
        proteins: 0,
        fats: 0,
      },
    );

    return {
      id: meal.id,
      name: meal.description,
      type: meal.type,
      createdAt: meal.createdAt,
      eatTime: meal.eatTime,

      totals,

      items: meal.foods,
    };
  });

  return res.json(result);
});

export const createMeal = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const {
    type,
    eatTime,
    description,
    items,
  } = parseMealPayload(req.body);

  const meal = await prisma.$transaction(
    async (tx) => {
      // Busca os alimentos envolvidos
      const foods = await tx.food.findMany({
        where: {
          id: {
            in: items.map((item) => item.foodId),
          },

          userId,
        },
      });

      if (foods.length !== items.length) {
        throw new HttpError(
          400,
          'Alimento não encontrado.',
        );
      }

      // Cria a refeição
      const meal = await tx.meal.create({
        data: {
          type,
          eatTime,
          description,
          userId,
        },
      });

      // Cria MealFood
      await tx.mealFood.createMany({
        data: items.map((item) => {
          const food = foods.find(
            (f) => f.id === item.foodId,
          )!;

          return {
            mealId: meal.id,

            foodId: food.id,

            foodG: item.grams,

            calories:
              (food.caloriesPer100g *
                item.grams) /
              100,

            carbs:
              (food.carbsPer100g *
                item.grams) /
              100,

            protein:
              (food.proteinPer100g *
                item.grams) /
              100,

            fat:
              (food.fatPer100g *
                item.grams) /
              100,
          };
        }),
      });

      return meal;
    },
  );

  return res.status(201).json(meal);
});
