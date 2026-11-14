import { ValidationError, type FieldErrors } from './http';

export type Payload = Record<string, unknown>;

export interface FieldOptions {
  /** Rótulo usado nas mensagens de erro. */
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  allowed?: readonly string[];
}

/** Garante que o corpo da requisição é um objeto JSON. */
export function asObject(body: unknown): Payload {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError({ body: 'O corpo da requisição deve ser um objeto JSON.' });
  }
  return body as Payload;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function readString(
  source: Payload,
  field: string,
  errors: FieldErrors,
  options: FieldOptions = {},
): string | undefined {
  const label = options.label ?? field;
  const raw = source[field];

  if (isBlank(raw)) {
    if (options.required) errors[field] = `${label} é obrigatório.`;
    return undefined;
  }

  if (typeof raw !== 'string') {
    errors[field] = `${label} deve ser um texto.`;
    return undefined;
  }

  const value = raw.trim();

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    errors[field] = `${label} deve ter no máximo ${options.maxLength} caracteres.`;
    return undefined;
  }

  if (options.allowed && !options.allowed.includes(value)) {
    errors[field] = `${label} deve ser um dos valores: ${options.allowed.join(', ')}.`;
    return undefined;
  }

  return value;
}

export function readNumber(
  source: Payload,
  field: string,
  errors: FieldErrors,
  options: FieldOptions = {},
): number | undefined {
  const label = options.label ?? field;
  const raw = source[field];

  if (isBlank(raw)) {
    if (options.required) errors[field] = `${label} é obrigatório.`;
    return undefined;
  }

  if (typeof raw !== 'number' && typeof raw !== 'string') {
    errors[field] = `${label} deve ser um número.`;
    return undefined;
  }

  const value = typeof raw === 'number' ? raw : Number(raw);

  if (!Number.isFinite(value)) {
    errors[field] = `${label} deve ser um número válido.`;
    return undefined;
  }

  if (options.integer && !Number.isInteger(value)) {
    errors[field] = `${label} deve ser um número inteiro.`;
    return undefined;
  }

  if (options.min !== undefined && value < options.min) {
    errors[field] = `${label} deve ser maior ou igual a ${options.min}.`;
    return undefined;
  }

  if (options.max !== undefined && value > options.max) {
    errors[field] = `${label} deve ser menor ou igual a ${options.max}.`;
    return undefined;
  }

  return value;
}

/** Lê o `:id` da rota como inteiro positivo. */
export function readIdParam(raw: string, label = 'Identificador'): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError({ id: `${label} inválido.` });
  }

  return value;
}

/** Levanta ValidationError se houver qualquer campo inválido. */
export function assertValid(errors: FieldErrors): void {
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }
}
