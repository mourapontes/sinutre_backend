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
const configuredFrontendUrls = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

// Railway define NODE_ENV=production; o fallback de redirect abaixo também vale
// quando só as variáveis do Railway estão presentes.
const isDeployed =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT);

/**
 * Domínios do front publicado na Vercel. Ficam no código porque são públicos e
 * porque sem eles a API responde 403 para o site em produção quando
 * FRONTEND_URL está ausente (ou apontando para outro domínio) no host.
 * Os curingas cobrem produção, alias do projeto e previews de branch.
 */
const PRODUCTION_FRONTEND_URL = 'https://sinutre-fontend-m7kr.vercel.app';

const PUBLISHED_FRONTEND_URLS = [
  PRODUCTION_FRONTEND_URL,
  'https://sinutre-fontend.vercel.app',
  'https://sinutre-fontend-*.vercel.app',
];

const LOCAL_FRONTEND_URL = 'http://localhost:5173';

const frontendUrls = Array.from(
  new Set([...configuredFrontendUrls, LOCAL_FRONTEND_URL, ...PUBLISHED_FRONTEND_URLS]),
);

function isLocalOrigin(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);
}

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
  // Em produção um FRONTEND_URL localhost (valor de exemplo) quebraria o login,
  // então preferimos o domínio publicado.
  frontendUrl: isDeployed
    ? (configuredFrontendUrls.find((url) => !isLocalOrigin(url)) ??
      PRODUCTION_FRONTEND_URL)
    : (configuredFrontendUrls[0] ?? LOCAL_FRONTEND_URL),
  github: {
    clientId: required('GITHUB_CLIENT_ID'),
    clientSecret: required('GITHUB_CLIENT_SECRET'),
    callbackUrl: normalizeOrigin(required('GITHUB_CALLBACK_URL')),
  },
};
