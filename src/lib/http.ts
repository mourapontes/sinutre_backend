import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Erros de validação por campo: { campo: 'mensagem' }. */
export type FieldErrors = Record<string, string>;

/** Erro com status HTTP explícito, tratado pelo middleware central. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Erro de validação de payload (HTTP 400 com detalhes por campo). */
export class ValidationError extends HttpError {
  constructor(fields: FieldErrors) {
    super(400, 'Dados inválidos.', fields);
    this.name = 'ValidationError';
  }
}

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Express 4 não captura rejeições de handlers async.
 * Este wrapper encaminha o erro para o middleware central.
 */
export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
