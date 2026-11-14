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
| `DATABASE_URL` | String de conexão do PostgreSQL |
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
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência) ou a string do provedor |
   | `JWT_SECRET` | string longa e aleatória |
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
as variáveis ausentes de uma vez (em vez de falhar uma por vez) e detecta
referências não resolvidas como `${{Postgres.DATABASE_URL}}`. Para rodar só a
checagem:

```bash
npm run check:env
```

### Múltiplos domínios no CORS

`FRONTEND_URL` aceita uma lista separada por vírgula, útil para liberar o domínio
de produção e os previews da Vercel ao mesmo tempo:

```
FRONTEND_URL=https://sinutre-fontend-m7kr.vercel.app,https://sinutre-fontend-git-main.vercel.app
```

O primeiro domínio da lista é usado no redirect após o login.
