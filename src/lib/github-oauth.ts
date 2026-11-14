import { env } from '../config/env';

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';

/**
 * Resultado da verificação do OAuth App no GitHub.
 *
 * A tela de autorização (`/login/oauth/authorize`) redireciona para o login
 * mesmo com um `client_id` inexistente — o 404 só aparece DEPOIS do login, e
 * sem redirect de volta o app nunca recebe o token. Para detectar isso antes,
 * usamos o endpoint de device flow, que é público (não exige o client secret) e
 * responde 404 `{"error":"Not Found"}` apenas quando o OAuth App não existe.
 *
 * Comportamento comprovado na prática:
 *   Iv1.b507a08c87ecfe98 (app real) -> 200 com device_code
 *   um client_id inexistente          -> 404 {"error":"Not Found"}
 *
 * A API `GET /applications/{client_id}` NÃO serve para isso: ela responde 404
 * também quando o secret está errado, então acusaria falso positivo.
 */
export type GithubOauthStatus =
  | { status: 'ok' }
  | { status: 'invalid-client-id' }
  | { status: 'unknown'; detail: string };

export async function verifyGithubOauth(
  timeoutMs = 8000,
): Promise<GithubOauthStatus> {
  try {
    const res = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'sinutre-back',
      },
      body: new URLSearchParams({
        client_id: env.github.clientId,
        scope: 'read:user',
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 404) {
      return { status: 'invalid-client-id' };
    }

    if (!res.ok) {
      return { status: 'unknown', detail: `${res.status} ${res.statusText}` };
    }

    // App existente responde com `device_code` (device flow ligado) ou com
    // `device_flow_disabled`. Ambos provam que o client_id é válido.
    const body = (await res.json()) as { device_code?: string; error?: string };

    if (body.device_code || body.error === 'device_flow_disabled') {
      return { status: 'ok' };
    }

    if (body.error === 'Not Found') {
      return { status: 'invalid-client-id' };
    }

    return { status: 'unknown', detail: body.error ?? 'resposta inesperada' };
  } catch (error) {
    return { status: 'unknown', detail: (error as Error).message };
  }
}

function mask(value: string): string {
  return value.length <= 8 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/** Loga o resultado sem interromper o servidor: o login é só uma das rotas. */
export function logGithubOauthStatus(result: GithubOauthStatus): void {
  const clientId = mask(env.github.clientId);
  const length = env.github.clientId.length;

  switch (result.status) {
    case 'ok':
      console.log(
        `[SiNutre] GitHub OAuth App OK (client_id ${clientId}, ${length} caracteres)`,
      );
      return;
    case 'invalid-client-id':
      console.error(
        `[SiNutre] GitHub OAuth App NAO existe para o client_id ${clientId} ` +
          `(${length} caracteres).\n` +
          '      O login falha com 404 na tela do GitHub e nunca volta para o app.\n' +
          '      Copie o Client ID novamente em:\n' +
          '      GitHub > Settings > Developer settings > OAuth Apps > seu app\n' +
          '      (se o app for de uma organizacao: Organization settings >\n' +
          '      Developer settings > OAuth Apps).\n' +
          '      Se o app nao estiver na lista, crie um novo com New OAuth App e\n' +
          '      Authorization callback URL =\n' +
          '      GITHUB_CALLBACK_URL do servico.\n' +
          '      Depois atualize GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET e\n' +
          '      GITHUB_CALLBACK_URL no host e faca o redeploy.',
      );
      return;
    default:
      console.warn(
        `[SiNutre] Nao foi possivel validar o OAuth App do GitHub (${result.detail}).`,
      );
  }
}
