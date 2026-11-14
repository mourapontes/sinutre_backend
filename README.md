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
| `FRONTEND_URL` | Origem liberada no CORS e destino do redirect pós-login |

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

1. Crie um serviço a partir do repositório.
2. Adicione um banco PostgreSQL (ou use o Supabase) e configure `DATABASE_URL`.
3. Configure as variáveis da tabela acima, com `GITHUB_CALLBACK_URL` apontando
   para o domínio do Railway e `FRONTEND_URL` para o domínio da Vercel.
4. Build: `npm install && npm run build`
5. Start: `npm start` (executa `prisma migrate deploy` e sobe o servidor)
