import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { env } from '../config/env';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

function maskClientId(value: string): string {
  return value.length <= 8 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/**
 * Traduz o `error` do GitHub para uma mensagem acionavel. A tela do front mostra
 * esse texto, entao ele precisa dizer o que corrigir em vez de "falhou".
 */
function describeTokenError(error: string | undefined): string {
  switch (error) {
    case 'incorrect_client_credentials':
      return (
        'GitHub recusou as credenciais (incorrect_client_credentials). ' +
        'O GITHUB_CLIENT_SECRET nao corresponde ao GITHUB_CLIENT_ID: ' +
        'gere um novo secret no OAuth App e atualize a variavel no host.'
      );
    case 'redirect_uri_mismatch':
      return (
        'redirect_uri_mismatch: GITHUB_CALLBACK_URL difere da ' +
        '"Authorization callback URL" cadastrada no OAuth App do GitHub.'
      );
    case 'bad_verification_code':
      return (
        'O code do GitHub expirou ou ja foi usado. Clique em ' +
        '"Entrar com GitHub" novamente (nao recarregue a pagina de callback).'
      );
    default:
      return (
        'Falha ao obter access_token do GitHub' +
        (error ? ` (${error})` : '') +
        '. Confira GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET e ' +
        'GITHUB_CALLBACK_URL e veja os logs do servidor.'
      );
  }
}

// GET /auth/github
// Redireciona o navegador para a tela de autorização do GitHub.
export async function redirectToGithub(_req: Request, res: Response) {
  const params = new URLSearchParams({
    client_id: env.github.clientId,
    redirect_uri: env.github.callbackUrl,
    scope: 'read:user',
  });
  res.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
}

/**
 * Falha de login: para o navegador, volta ao front com `?error=` (a tela de
 * login exibe a mensagem e o usuário pode tentar de novo); para chamadas de API
 * (curl, testes) mantém o JSON.
 */
function failAuth(
  req: Request,
  res: Response,
  status: number,
  message: string,
): void {
  const wantsHtml = (req.headers.accept ?? '').includes('text/html');

  if (wantsHtml) {
    const params = new URLSearchParams({ error: message });
    res.redirect(`${env.frontendUrl}/login?${params.toString()}`);
    return;
  }

  res.status(status).json({ error: message });
}

// GET /auth/github/callback?code=...
// 1) troca o code pelo access_token
// 2) busca dados do usuário no GitHub
// 3) cria ou atualiza o User
// 4) emite um JWT e redireciona ao frontend
export async function githubCallback(req: Request, res: Response) {
  // O GitHub devolve ?error=... quando o usuário nega a autorização.
  const githubError = req.query.error as string | undefined;

  if (githubError) {
    console.warn(`[SiNutre] Autorizacao negada no GitHub: ${githubError}`);
    return failAuth(
      req,
      res,
      401,
      githubError === 'access_denied'
        ? 'Autorização cancelada no GitHub. Tente novamente.'
        : `O GitHub retornou um erro: ${githubError}.`,
    );
  }

  const code = req.query.code as string | undefined;
  if (!code) {
    return failAuth(req, res, 400, 'Parâmetro "code" ausente.');
  }

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.github.clientId,
      client_secret: env.github.clientSecret,
      code,
      redirect_uri: env.github.callbackUrl,
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    // O GitHub responde 200 com { error } nesse endpoint. Sem logar o codigo do
    // erro, qualquer falha virava "Falha ao obter access_token" e nao dava para
    // saber se o problema era secret, code expirado ou redirect_uri.
    console.error(
      '[SiNutre] Falha na troca de code por access_token: ' +
        `${tokenData.error ?? '(sem error)'} - ` +
        `${tokenData.error_description ?? '(sem descricao)'} ` +
        `[client_id ${maskClientId(env.github.clientId)}]`,
    );

    const detail = describeTokenError(tokenData.error);
    return failAuth(req, res, 401, detail);
  }

  const userResponse = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sinutre-back',
    },
  });

  const githubUser = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  const user = await prisma.user.upsert({
    where: { githubId: String(githubUser.id) },
    update: {
      githubLogin: githubUser.login,
      name: githubUser.name ?? githubUser.login,
      avatarUrl: githubUser.avatar_url ?? undefined,
    },
    create: {
      githubId: String(githubUser.id),
      githubLogin: githubUser.login,
      name: githubUser.name ?? githubUser.login,
      avatarUrl: githubUser.avatar_url ?? undefined,
    },
  });

  const token = jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: '7d' });

  res.redirect(`${env.frontendUrl}/?token=${token}`);
}
