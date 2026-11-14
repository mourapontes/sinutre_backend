import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }

  return value.trim();
}

/**
 * Normaliza um domínio: remove espaços e aspas (colar `"https://..."` no painel
 * da hospedagem mantém as aspas no valor) e barras no final.
 */
function normalizeOrigin(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .replace(/\/+$/, '');
}

// FRONTEND_URL aceita uma lista separada por vírgula, útil para liberar
// domínios de produção e de preview da Vercel ao mesmo tempo.
const frontendUrls = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

/**
 * Aceita também curingas de subdomínio, ex.: `https://*.vercel.app`.
 * Sem curinga a comparação é exata.
 */
function isAllowedOrigin(origin: string): boolean {
  const target = normalizeOrigin(origin);

  return frontendUrls.some((allowed) => {
    if (allowed === target) {
      return true;
    }

    if (!allowed.includes('*')) {
      return false;
    }

    const escaped = allowed
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^.]+');

    return new RegExp(`^${escaped}$`).test(target);
  });
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  jwtSecret: required('JWT_SECRET'),
  /** Todos os domínios liberados no CORS. */
  frontendUrls,
  /** Verifica se uma origem pode consumir a API. */
  isAllowedOrigin,
  /** Domínio usado no redirect após o login. */
  frontendUrl: frontendUrls[0] ?? 'http://localhost:5173',
  github: {
    clientId: required('GITHUB_CLIENT_ID'),
    clientSecret: required('GITHUB_CLIENT_SECRET'),
    callbackUrl: normalizeOrigin(required('GITHUB_CALLBACK_URL')),
  },
};
