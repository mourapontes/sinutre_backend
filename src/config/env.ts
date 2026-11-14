import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

// FRONTEND_URL aceita uma lista separada por vírgula, útil para liberar
// domínios de produção e de preview da Vercel ao mesmo tempo.
const frontendUrls = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT ?? 3333),
  jwtSecret: required('JWT_SECRET'),
  /** Todos os domínios liberados no CORS. */
  frontendUrls,
  /** Domínio usado no redirect após o login. */
  frontendUrl: frontendUrls[0],
  github: {
    clientId: required('GITHUB_CLIENT_ID'),
    clientSecret: required('GITHUB_CLIENT_SECRET'),
    callbackUrl: required('GITHUB_CALLBACK_URL'),
  },
};
