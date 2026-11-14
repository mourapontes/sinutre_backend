import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http';

export function notFound(req: Request, res: Response) {
  return res.status(404).json({
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

// Middleware central: converte erros conhecidos em respostas JSON com mensagem
// amigável, sempre informando o usuário sobre o que deu errado.
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Já existe um registro com esses dados.' });
    }

    if (error.code === 'P2003') {
      return res.status(409).json({
        error: 'Este registro está em uso e não pode ser excluído.',
      });
    }
  }

  // JSON malformado enviado pelo cliente (express.json).
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }

  console.error('[erro não tratado]', error);

  return res.status(500).json({ error: 'Erro interno do servidor.' });
}
