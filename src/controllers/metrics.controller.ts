import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../lib/http';
import { loadProfile } from './profile.controller';

export const WINDOW_DAYS = 7;

// Faixa considerada "dentro da meta" (margem de 5%).
const ON_TARGET_MIN = 95;
const ON_TARGET_MAX = 105;

export type GoalStatus = 'ABAIXO' | 'NA_META' | 'ACIMA' | 'SEM_META';

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// GET /metrics
// IMC + média calórica dos últimos 7 dias e sua relação com a meta.
export const getMetrics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const profile = await loadProfile(userId);

  const today = startOfDay(new Date());
  const windowStart = addDays(today, -(WINDOW_DAYS - 1));

  const meals = await prisma.meal.findMany({
    where: {
      userId,
      eatTime: {
        gte: windowStart,
        lt: addDays(today, 1),
      },
    },
    include: {
      foods: { select: { calories: true } },
    },
    orderBy: { eatTime: 'asc' },
  });

  const dailyCalories = Array.from({ length: WINDOW_DAYS }, (_, index) => ({
    date: dateKey(addDays(windowStart, index)),
    calories: 0,
  }));

  for (const meal of meals) {
    const index = dailyCalories.findIndex(
      (day) => day.date === dateKey(meal.eatTime),
    );

    if (index < 0) {
      continue;
    }

    dailyCalories[index].calories += meal.foods.reduce(
      (total, item) => total + item.calories,
      0,
    );
  }

  for (const day of dailyCalories) {
    day.calories = round1(day.calories);
  }

  const totalLast7Days = round1(
    dailyCalories.reduce((total, day) => total + day.calories, 0),
  );

  // Média sobre 7 dias (dias sem refeição contam como zero).
  const averageLast7Days = round1(totalLast7Days / WINDOW_DAYS);

  const goal = profile.targetDietDaily;

  let status: GoalStatus = 'SEM_META';
  let percentOfGoal: number | null = null;
  let difference: number | null = null;

  if (goal !== null && goal > 0) {
    percentOfGoal = round1((averageLast7Days / goal) * 100);
    difference = round1(averageLast7Days - goal);

    if (percentOfGoal < ON_TARGET_MIN) {
      status = 'ABAIXO';
    } else if (percentOfGoal > ON_TARGET_MAX) {
      status = 'ACIMA';
    } else {
      status = 'NA_META';
    }
  }

  return res.json({
    bmi: profile.bmi,
    targetDietDaily: goal,
    averageLast7Days,
    totalLast7Days,
    dailyCalories,
    goalComparison: {
      goal,
      difference,
      percentOfGoal,
      status,
    },
  });
});
