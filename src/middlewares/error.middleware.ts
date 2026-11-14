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

  if (error instanceof Prisma.PrismaClientInitializationError) {
    // Banco inacessivel (rede, Supabase pausado, credencial). Sem isso o login
    // aparecia como "Erro interno" generico e sem pista do que aconteceu.
    console.error('[SiNutre] Banco de dados inacessivel:', error.message);

    return res.status(503).json({
      error:
        'Banco de dados indisponível no momento. Tente novamente em instantes.',
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    if (error.code === 'P2024') {
      // Pool esgotado: Supabase com connection_limit=1 aguenta poucas
      // requisicoes simultaneas.
      console.error('[SiNutre] Pool de conexoes esgotado:', error.message);

      return res.status(503).json({
        error: 'Muitas requisições ao banco. Tente novamente em instantes.',
      });
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
