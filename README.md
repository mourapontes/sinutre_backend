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
   | `GITHUB_CALLBACK_URL` | `https://<seu-servico>.up.railway.app/auth/github/callback` |
   | `FRONTEND_URL` | `https://sinutre-fontend-m7kr.vercel.app` |
   | `TZ` | `America/Sao_Paulo` |

   `PORT` é injetada automaticamente pelo Railway.
5. Em **Settings → Networking**, clique em *Generate Domain* e copie a URL.
6. Atualize `GITHUB_CALLBACK_URL` com o domínio gerado e faça o redeploy.
7. Valide: `https://<seu-servico>.up.railway.app/health` deve responder
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
