# sinutre-back

Backend do **SiNutre — Sistema de Ingestão de Macronutrientes**.

Stack: **TypeScript + Express + Prisma + PostgreSQL**.

## Funcionalidades

- Login via GitHub OAuth (JWT)
- Cadastro/listagem de refeições
- CRUD de alimentos (**incluindo alteração, exclusão e validação de dados**)
- Dados complementares do usuário: meta calórica diária, altura, peso e nível de
  atividade (com validação)
- Métricas: IMC classificado pela OMS e média calórica dos últimos 7 dias
  comparada à meta

## Setup

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL, JWT_SECRET e o OAuth do GitHub
npm run check:env             # valida se todas as variáveis obrigatórias existem
npm run check:github          # confirma que o OAuth App do GitHub existe
npx prisma migrate dev        # cria as tabelas no banco
npm run dev
```

O banco é PostgreSQL (funciona com Supabase, Neon ou o Postgres do Railway).
Para gerar uma nova migração depois de alterar o schema:

```bash
npx prisma migrate dev --name nome-da-migracao
```

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | String de conexão do PostgreSQL (no Supabase, o *transaction pooler* na porta 6543) |
| `DIRECT_URL` | Conexão direta usada pelas migrações (opcional; padrão = `DATABASE_URL`) |
| `PORT` | Porta HTTP (padrão `3333`) |
| `TZ` | Fuso usado nas métricas (ex.: `America/Sao_Paulo`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Credenciais do OAuth App |
| `GITHUB_CALLBACK_URL` | URL de callback (`.../auth/github/callback`) |
| `JWT_SECRET` | Segredo para assinar os tokens |
| `FRONTEND_URL` | Origem liberada no CORS e destino do redirect pós-login. Aceita vários domínios separados por vírgula |

## Rotas

Todas as rotas (exceto `/health` e `/auth/github*`) exigem
`Authorization: Bearer <token>`.

### Autenticação

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/auth/github` | Inicia o login no GitHub |
| GET | `/auth/github/callback` | Callback do OAuth (redireciona ao front com `?token=`) |
| GET | `/auth/me` | Usuário logado |

### Alimentos

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/foods?search=` | Lista os alimentos do usuário |
| POST | `/foods` | Cadastra um alimento |
| PUT | `/foods/:id` | Altera um alimento |
| DELETE | `/foods/:id` | Exclui um alimento (bloqueado se já usado em refeição) |

### Perfil (dados complementares)

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/profile` | Meta calórica, altura, peso, nível de atividade e IMC |
| PUT | `/profile` | Cria/atualiza os dados complementares |

### Refeições

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/meals` | Lista as refeições com totais de macros |
| POST | `/meals` | Cria uma refeição com seus itens |

### Métricas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/metrics` | IMC, média calórica de 7 dias, percentual e situação da meta |

## Validação de dados

Os payloads são validados antes de chegar ao banco. Em caso de erro a API
responde `400` com a mensagem e o detalhamento por campo:

```json
{
  "error": "Dados inválidos.",
  "fields": {
    "name": "Nome é obrigatório.",
    "caloriesPer100g": "Calorias por 100g deve ser no máximo 900."
  }
}
```

Limites aplicados:

| Campo | Regra |
| --- | --- |
| `name` | obrigatório, até 120 caracteres |
| `caloriesPer100g` | obrigatório, número entre 0 e 900 |
| `carbsPer100g`, `proteinPer100g`, `fatPer100g` | obrigatório, número entre 0 e 100 |
| `targetDietDaily` | obrigatório, inteiro entre 500 e 10000 |
| `height` | obrigatório, entre 0,5 e 2,5 (metros) |
| `weight` | obrigatório, entre 20 e 500 (kg) |
| `type` (refeição) | obrigatório, um dos valores de `MEAL_CHOICES` |
| `eatTime` | obrigatório, data válida |
| `items` | ao menos um alimento, sem repetição, `grams` entre 1 e 5000 |

## Banco de dados

### As tabelas são criadas automaticamente

Sim. `npm start` executa `prisma migrate deploy` antes de subir o servidor, que
aplica todas as migrações versionadas em `prisma/migrations/`. Você **nunca**
precisa rodar SQL manualmente — num banco vazio ele cria todas as tabelas.

O que **não** é criado automaticamente é o *servidor* de PostgreSQL: ele precisa
existir antes. Há duas formas de obtê-lo.

### Opção A — PostgreSQL do Railway (1 clique)

1. No projeto: **+ Create** → **Database** → **Add PostgreSQL**.
2. No serviço do backend, aba **Variables** → **+ New Variable** →
   **Add Reference** → escolha o serviço do Postgres → `DATABASE_URL`.

O Railway injeta a connection string interna (`*.railway.internal`) e o
`migrate deploy` cria o schema no primeiro boot.

### Opção B — Supabase (banco já criado no painel)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → Database → Connection string**, copie **duas** URLs:

   | Variável | Qual pegar | Porta |
   | --- | --- | --- |
   | `DATABASE_URL` | **Transaction pooler** + `?pgbouncer=true&connection_limit=1` | 6543 |
   | `DIRECT_URL` | **Session pooler** (ou *Direct connection*, se habilitado) | 5432 |

3. Substitua `[YOUR-PASSWORD]` pela senha do banco nas duas.

> **Por que duas URLs?** A porta 6543 usa PgBouncer em modo *transaction*, que
> não aceita os comandos de DDL das migrações. O `prisma migrate deploy` usa
> `DIRECT_URL` (porta 5432) e a aplicação em execução usa `DATABASE_URL`
> (pooler), que aguenta mais conexões.
>
> Se você informar só `DATABASE_URL`, o `scripts/start.js` usa ela também para
> migrar — funciona em Railway/Neon, mas **não** no pooler do Supabase.

Exemplo:

```
DATABASE_URL=postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Vantagem: não é preciso criar serviço de banco no Railway. Funciona igual.

> Em ambos os casos o schema é criado pelo próprio deploy. O que difere é apenas
> quem provisiona o servidor PostgreSQL.

## Segurança

- `.env` e variações (`.env.local`, `.env.production`...) **nunca** são
  versionados; apenas `.env.example`, com valores de modelo.
- Certificados e chaves (`*.pem`, `*.key`, `*.p12`, `*.pfx`) também são ignorados.
- Em produção, todas as credenciais ficam nas *Variables* do Railway — nenhuma
  senha ou segredo no código ou no histórico do Git.
- Antes de commitar, confira com `git status --short` e
  `git check-ignore -v .env`.

## Deploy no Railway

O repositório já inclui `railway.json` (build, start e health check em `/health`).

1. **Crie o projeto** em [railway.app](https://railway.app) → *New Project*.
2. **Adicione o banco**: *Create* → *Database* → **PostgreSQL**.
   O Railway expõe `DATABASE_URL`; se usar Supabase/Neon, copie a connection
   string com `?sslmode=require`.
3. **Adicione o serviço**: *Create* → *GitHub Repo* → `mourapontes/sinutre_backend`.
4. Em **Variables**, configure:

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | **Com Supabase:** cole a URL do *transaction pooler* (porta 6543). **Com Railway/Neon:** `${{Postgres.DATABASE_URL}}` ou a URL do provedor |
   | `DIRECT_URL` | Só no Supabase: a URL do *session pooler* (porta 5432) |
   | `JWT_SECRET` | string longa e aleatória |

   > ⚠️ **Usando Supabase? Não use `${{Postgres.DATABASE_URL}}`.** Essa sintaxe
   > é uma referência a um serviço PostgreSQL do próprio Railway. Se não existir
   > um serviço com esse nome exato no projeto, o Railway não salva a variável
   > (e as outras do mesmo bloco também não são aplicadas). Cole a string do
   > Supabase diretamente.
   | `GITHUB_CLIENT_ID` | do OAuth App |
   | `GITHUB_CLIENT_SECRET` | do OAuth App |
   | `GITHUB_CALLBACK_URL` | `https://sinutrebackend-production.up.railway.app/auth/github/callback` |
   | `FRONTEND_URL` | `https://sinutre-fontend-m7kr.vercel.app` |
   | `TZ` | `America/Sao_Paulo` |

   `PORT` é injetada automaticamente pelo Railway.
5. Em **Settings → Networking**, clique em *Generate Domain* e copie a URL.
6. Atualize `GITHUB_CALLBACK_URL` com o domínio gerado e faça o redeploy.
7. Valide: `https://sinutrebackend-production.up.railway.app/health` deve responder
   `{"status":"ok"}`.
8. No **GitHub OAuth App**, ajuste *Authorization callback URL* para o mesmo
   valor de `GITHUB_CALLBACK_URL`.

O start roda `prisma migrate deploy` antes de subir o servidor, então as tabelas
são criadas automaticamente no primeiro deploy.

Antes do Prisma, o `npm start` executa `scripts/check-env.js`, que lista **todas**
as variáveis ausentes de uma vez (em vez de falhar uma por vez), detecta
referências não resolvidas como `${{Postgres.DATABASE_URL}}` e informa em qual
**serviço/ambiente** o container está rodando:

```
[SiNutre] Variaveis de ambiente obrigatorias ausentes:
  - DATABASE_URL
  ...
[SiNutre] Container rodando em:
      RAILWAY_SERVICE_NAME: sinutre_backend
      RAILWAY_ENVIRONMENT_NAME: production
```

Se `RAILWAY_SERVICE_NAME` não for o serviço onde você cadastrou as variáveis, é
sinal de que elas estão no lugar errado. Para rodar só a checagem:

```bash
npm run check:env
```

### Testar a conexão do banco

Antes de subir para o Railway, valide a connection string localmente:

```bash
# preencha DATABASE_URL (e DIRECT_URL, se Supabase) no .env
npm run test:db
```

O script valida o formato da URL (placeholder de senha, `db.<ref>.supabase.co`
IPv6, `pgbouncer=true` ausente) e tenta conectar, mostrando o banco, a lista de
tabelas e a causa provável de cada erro (`P1001`, `P1000`, DNS etc.).

### Múltiplos domínios no CORS

`FRONTEND_URL` aceita uma lista separada por vírgula, útil para liberar o domínio
de produção e os previews da Vercel ao mesmo tempo:

```
FRONTEND_URL=https://sinutre-fontend-m7kr.vercel.app,https://sinutre-fontend-git-main.vercel.app
```

O primeiro domínio da lista é usado no redirect após o login.

Os domínios publicados do front (`sinutre-fontend.vercel.app` e
`sinutre-fontend-*.vercel.app`, que cobre produção e previews) já vêm liberados
em `src/config/env.ts`. Sem isso a API respondia **403** para o site em produção
quando `FRONTEND_URL` estava ausente ou apontando para outro domínio. Em ambiente
publicado, se `FRONTEND_URL` só tiver domínios locais (`localhost`), o redirect
após o login usa `https://sinutre-fontend-m7kr.vercel.app`.

## Login pelo GitHub retorna 404

Se ao clicar em *Entrar com GitHub* o GitHub mostra uma página **404**, o
`GITHUB_CLIENT_ID` não existe como OAuth App. O GitHub redireciona para o login
mesmo com client_id inválido (`/login/oauth/authorize` → `/login?client_id=...`);
o 404 aparece **depois** do login e, como não há redirect de volta, o app nunca
recebe o token — é exatamente o "não retorna logado".

Rode o diagnóstico (usa um client_id real como grupo de controle, então também
detecta problema de rede):

```bash
npm run check:github
```

Saída quando o app não existe:

```
[SiNutre] client_id configurado: v23liAbC1234567890ab (19 caracteres)
[SiNutre] OAuth App NAO encontrado para v23liA...90ab.
```

Em produção o mesmo teste roda no boot e aparece no log do container:

```
[SiNutre] GitHub OAuth App OK (client_id Ov23li...MNOP, 22 caracteres)
```

### Por que a verificação usa device flow

`POST https://github.com/login/device/code` é público (não exige o client
secret) e responde `404 {"error":"Not Found"}` **somente** quando o app não
existe. Um app válido responde com `device_code` (ou `device_flow_disabled`).
A API `GET /applications/{client_id}` não serve para isso: ela retorna 404
também quando o secret está errado, gerando falso positivo.

### Como corrigir

1. **GitHub → Settings → Developer settings → OAuth Apps** (se o app for de uma
   organização: **Organization settings → Developer settings**). Se o app não
   estiver na lista, clique em **New OAuth App**.
2. *Authorization callback URL*:
   `https://sinutrebackend-production.up.railway.app/auth/github/callback`
   (idêntico a `GITHUB_CALLBACK_URL`).
3. Copie o **Client ID** completo — apps criados recentemente começam com
   `Ov23li`; o valor depois do prefixo varia. Um Client ID truncado (faltando
   caracteres) é a causa do 404.
4. Copie o **Client secret** (40 caracteres hexadecimais; só aparece uma vez —
   use *Generate a new client secret* se perdeu).
5. No host (**Railway → serviço → Variables**), atualize `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET` e `GITHUB_CALLBACK_URL`, depois
   **Deployments → ⋯ → Redeploy**.
6. Confirme: `npm run check:github` deve responder `OK: OAuth App existe`, e
   `GET /auth/github` deve redirecionar para `github.com/login/oauth/authorize`
   com o novo `client_id`.

### Outros sintomas de login

| O que aparece | Causa |
| --- | --- |
| 404 na página do GitHub | `client_id` não existe (valor truncado ou OAuth App apagado) |
| `incorrect_client_credentials` | `GITHUB_CLIENT_SECRET` não é o secret desse `client_id` (app recriado, secret regenerado ou valor copiado com espaços/aspas) |
| `bad_verification_code` | `code` expirado/usado (a página de callback foi recarregada) |
| `redirect_uri_mismatch` | `GITHUB_CALLBACK_URL` diferente da *Authorization callback URL* do app |
| `access_denied` | o usuário cancelou a autorização no GitHub |
| Volta para `/login` sem token | `FRONTEND_URL` com valor inválido (ex.: linhas coladas) ou domínio diferente do front |
| `Origin ... nao permitida` | domínio do front fora da allowlist de CORS |

## O login não retorna logado (FRONTEND_URL com valor inválido)

O redirect final do OAuth é `${FRONTEND_URL}/?token=...`. Se `FRONTEND_URL`
contiver algo que não é URL, o navegador cai em uma página inexistente e o
usuário volta ao login — mesmo com o GitHub tendo autorizado.

Isso acontece quando o painel da hospedagem recebe um bloco multi-linha colado
no campo, salvando o valor como:

```
https://sinutre-fontend-m7kr.vercel.app
TZ=America/Sao_Paulo
```

O servidor agora descarta entradas que não sejam URLs `http(s)` (o aviso
aparece no boot) e usa a primeira válida. Para conferir o valor efetivo:

```bash
npm run check:env   # avisa: "FRONTEND_URL tem 1 entrada(s) que nao sao URL: TZ=..."
```

Corrija separando as variáveis no painel: `FRONTEND_URL` só com a URL do front e
`TZ` como variável própria. Aceita-se mais de um domínio separado por vírgula
(produção e previews).

## Falha ao obter access_token (secret inválido)

Depois que o `client_id` está correto, o próximo erro comum é a troca do `code`
por token falhar. O GitHub responde **HTTP 200** com `{"error": ...}`, então o
servidor agora registra o código exato e mostra a mensagem na tela de login:

```
[SiNutre] Falha na troca de code por access_token:
      incorrect_client_credentials - The client_id and/or client_secret passed are incorrect.
      [client_id Ov23li...vfee]
```

`incorrect_client_credentials` significa que o **Client secret não pertence a
esse Client ID** — típico de app recriado (o secret antigo fica órfão), de
secret regenerado, ou de valor salvo com espaços/aspas no painel.

Para corrigir:

1. No OAuth App, clique em **Client secrets → Generate a new client secret**.
2. Copie o valor **sem espaços e sem aspas**.
3. Atualize `GITHUB_CLIENT_SECRET` no host e faça o redeploy.
4. Rode `npm run check:env` — ele avisa se o secret não tem 40 caracteres
   hexadecimais, se está entre aspas ou se é um Personal Access Token (`ghp_...`)
   colado por engano.
5. Teste o login de novo: o `code` só vale uma vez e expira em minutos, então não
   recarregue a página de callback.

`npm run check:github` valida apenas o Client ID (existe ou não); o secret só
pode ser validado durante a troca do code, com um login real.
