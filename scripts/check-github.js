#!/usr/bin/env node
/**
 * Verifica se o GITHUB_CLIENT_ID configurado existe como OAuth App no GitHub.
 *
 * Roda antes/depois do deploy para explicar o 404 na tela de autorizacao:
 *   npm run check:github
 *
 * Usa o endpoint publico de device flow (nao precisa do client secret) e um
 * client_id real conhecido como grupo de controle, para nunca acusar erro por
 * causa de rede/bloqueio.
 */
require('dotenv/config');

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
// GitHub CLI (publico). Se este falhar, o problema e de rede, nao do app.
const CONTROL_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

async function probe(clientId) {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'sinutre-back',
    },
    body: new URLSearchParams({ client_id: clientId, scope: 'read:user' }).toString(),
    signal: AbortSignal.timeout(15000),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { status: res.status, body };
}

function mask(value) {
  return value.length <= 8 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

(async () => {
  const clientId = (process.env.GITHUB_CLIENT_ID ?? '').trim();

  if (!clientId) {
    console.error(
      '\n[SiNutre] GITHUB_CLIENT_ID nao esta definida (no .env ou no ambiente).\n' +
        '      No Railway: servico > Variables > GITHUB_CLIENT_ID.\n',
    );
    process.exit(1);
  }

  console.log(`[SiNutre] client_id configurado: ${clientId} (${clientId.length} caracteres)`);

  console.log('[SiNutre] Verificando conectividade com o GitHub...');
  const control = await probe(CONTROL_CLIENT_ID);

  if (control.status === 404) {
    console.error(
      '\n[SiNutre] Nao foi possivel falar com o GitHub (o client_id de controle\n' +
        '      tambem retornou 404). Verifique a conexao/proxy e tente de novo.\n',
    );
    process.exit(1);
  }

  console.log('[SiNutre] GitHub acessivel, verificando o app...');
  const result = await probe(clientId);

  if (result.status === 404) {
    console.error(
      `\n[SiNutre] OAuth App NAO encontrado para ${mask(clientId)}.\n` +
        '      E isso que produz o 404 em github.com/login/oauth/authorize e o\n' +
        '      login que nunca volta para o app.\n\n' +
        '      Como corrigir:\n' +
        '      1. GitHub > Settings > Developer settings > OAuth Apps\n' +
        '         (app de organizacao: Organization settings > Developer settings)\n' +
        '      2. Se o app nao estiver na lista, clique em New OAuth App.\n' +
        '      3. Authorization callback URL:\n' +
        `         ${(process.env.GITHUB_CALLBACK_URL ?? '').trim() || 'https://<backend>/auth/github/callback'}\n` +
        '      4. Copie o Client ID COMPLETO (apps novos comecam com Ov23li) e\n' +
        '         gere/copie o Client secret (40 caracteres).\n' +
        '      5. Atualize GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET no host e\n' +
        '         faca o redeploy. Rode este script de novo para confirmar.\n',
    );
    process.exit(1);
  }

  if (result.body && result.body.device_code) {
    console.log(
      `\n[SiNutre] OK: OAuth App existe para ${mask(clientId)}.\n` +
        '      Se o login ainda falhar, o proximo suspeito e o client secret\n' +
        '      (erro "Falha ao obter access_token" /\n' +
        '      incorrect_client_credentials) ou o redirect_uri\n' +
        '      (erro redirect_uri_mismatch na tela do GitHub).\n',
    );
    return;
  }

  if (result.body && result.body.error === 'device_flow_disabled') {
    console.log(
      `\n[SiNutre] OK: OAuth App existe para ${mask(clientId)} ` +
        '(device flow desabilitado, o que e normal).\n' +
        '      Se o login falhar, o suspeito e o GITHUB_CLIENT_SECRET\n' +
        '      (incorrect_client_credentials) ou o redirect_uri.\n',
    );
    return;
  }

  console.warn(
    `\n[SiNutre] Resposta inesperada do GitHub (HTTP ${result.status}): ` +
      `${JSON.stringify(result.body)}\n`,
  );
})().catch((error) => {
  console.error('[SiNutre] Falha ao verificar o OAuth App:', error.message);
  process.exit(1);
});
