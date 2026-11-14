import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, type FieldErrors } from '../lib/http';
import { asObject, assertValid, readNumber, readString } from '../lib/validation';
import { LEVEL_CHOICES } from '../constants/enums';
import { bmiInfo, type BmiInfo } from '../lib/bmi';

const DEFAULT_LEVEL_ACTIVITY = 'MODERADAMENTE_ATIVO';

const LIMITS = {
  targetDietDaily: {
    required: true,
    integer: true,
    min: 500,
    max: 10000,
    label: 'Meta calórica diária',
  },
  height: { required: true, min: 0.5, max: 2.5, label: 'Altura (m)' },
  weight: { required: true, min: 20, max: 500, label: 'Peso (kg)' },
} as const;

export interface UserProfile {
  targetDietDaily: number | null;
  levelActivity: string | null;
  height: number | null;
  weight: number | null;
  bmi: BmiInfo | null;
  updatedAt: string | null;
}

/** Lê a meta ativa (HealthData) e a última medição (WeightLog) do usuário. */
export async function loadProfile(userId: number): Promise<UserProfile> {
  const [health, weightLog] = await Promise.all([
    prisma.healthData.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.weightLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const height = weightLog?.height ?? null;
  const weight = weightLog?.weight ?? null;

  const updatedAt =
    weightLog?.createdAt ?? health?.createdAt ?? null;

  return {
    targetDietDaily: health?.targetDietDaily ?? null,
    levelActivity: health?.levelActivity ?? null,
    height,
    weight,
    bmi: height !== null && weight !== null ? bmiInfo(weight, height) : null,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
  };
}

// GET /profile
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await loadProfile(req.userId!);
  return res.json(profile);
});

// PUT /profile
// Cria (primeiro cadastro) ou altera os dados complementares do usuário.
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const source = asObject(req.body);
  const errors: FieldErrors = {};

  const targetDietDaily = readNumber(source, 'targetDietDaily', errors, LIMITS.targetDietDaily);
  const height = readNumber(source, 'height', errors, LIMITS.height);
  const weight = readNumber(source, 'weight', errors, LIMITS.weight);
  const levelActivity = readString(source, 'levelActivity', errors, {
    allowed: LEVEL_CHOICES,
    label: 'Nível de atividade',
  });

  assertValid(errors);

  await prisma.$transaction(async (tx) => {
    const activeHealth = await tx.healthData.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeHealth) {
      await tx.healthData.update({
        where: { id: activeHealth.id },
        data: {
          targetDietDaily: targetDietDaily!,
          levelActivity: levelActivity ?? activeHealth.levelActivity,
        },
      });
    } else {
      await tx.healthData.create({
        data: {
          userId,
          targetDietDaily: targetDietDaily!,
          levelActivity: levelActivity ?? DEFAULT_LEVEL_ACTIVITY,
        },
      });
    }

    // Peso/altura são um histórico: cada atualização gera uma nova medição.
    await tx.weightLog.create({
      data: { userId, height: height!, weight: weight! },
    });
  });

  const profile = await loadProfile(userId);

  return res.json(profile);
});
