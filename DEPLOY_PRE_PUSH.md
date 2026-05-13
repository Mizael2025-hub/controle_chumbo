# Checklist antes de subir no GitHub / deploy (Supabase, Vercel, GitHub)

Este documento lista o que **você** precisa conferir ou executar **no provedor** (Supabase, Vercel, GitHub) quando o código passar a incluir mudanças de schema ou de build — em especial a migração planejada da coluna **`release_group_id`** em `lead_transactions`.  
Atualize este arquivo se o time mudar o fluxo de deploy.

---

## 1. Supabase (banco Postgres + Auth)

### 1.1 Ordem recomendada

1. Aplicar **no Supabase** o SQL da nova migração **antes** ou **junto** do deploy do front que já **lê** a coluna nova (o ideal é: migração aplicada → depois deploy da versão do app que usa o campo).
2. Se o app antigo **ignorar** colunas extras no JSON do Supabase, uma janela curta “migração primeiro, app depois” costuma ser segura. Se algo no cliente quebrar ao receber payload inesperado, faça deploy do app **depois** da migração.

### 1.2 O que alterar no banco (quando a migração existir no repositório)

Arquivo versionado no repositório: [`supabase/migrations/0002_add_release_group_id.sql`](supabase/migrations/0002_add_release_group_id.sql).

1. Abra o projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2. Vá em **SQL Editor** → **New query**.
3. Cole e execute **o conteúdo completo** do arquivo de migração novo do repositório.

Conteúdo esperado (resumo — o arquivo no repo é a fonte da verdade):

- `alter table public.lead_transactions add column if not exists release_group_id uuid null;`
- Opcional: `comment on column ...` para documentação.
- **Não** é obrigatório apagar dados existentes; linhas antigas ficam com `release_group_id` nulo até haver backfill (se um dia existir).

### 1.3 RLS, triggers e Realtime

- As políticas atuais usam `owner_id` e **não** dependem do nome das colunas extras; em geral **nada** muda na RLS só por adicionar uma coluna nullable.
- Triggers de `updated_at` em `lead_transactions` continuam válidos.
- Se **Realtime** estiver habilitado para `lead_transactions`, continua funcionando; novas colunas aparecem no payload.

### 1.4 Auth

- Nenhuma mudança típica só por causa de `release_group_id`. Mantenha **Email** habilitado e os usuários já criados.

### 1.5 Conferência rápida pós-SQL

No **SQL Editor**:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lead_transactions'
order by ordinal_position;
```

Confirme que `release_group_id` existe, tipo `uuid`, `YES` em `is_nullable`.

---

## 2. Vercel (hospedagem Next.js)

### 2.1 Variáveis de ambiente

O app usa apenas (público ao browser):

| Variável | Onde configurar |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel → Project → **Settings** → **Environment Variables** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Idem |

- **Produção**, **Preview** e **Development**: replique os valores em todos os ambientes em que você faz deploy de testes, para não quebrar PR previews.
- Só a migração no Postgres **não** exige mudar essas variáveis, desde que continuem apontando para o **mesmo** projeto Supabase onde você rodou o SQL.

### 2.2 Build

- Nenhuma config extra esperada para `release_group_id`; o build continua `npm run build` (padrão Next na Vercel).
- Após `git push`, acompanhe o log de build na Vercel; erros de TypeScript falham o deploy — corrija no branch e push de novo.

### 2.3 Domínio e PWA

- Sem alteração obrigatória por causa do schema. Se mudar URL do projeto, atualize `NEXT_PUBLIC_SUPABASE_URL` se for outro projeto Supabase.

---

## 3. GitHub (repositório)

### 3.1 O que commitar

- **Sim:** código, `supabase/migrations/0002_*.sql` (ou o número que for), este `DEPLOY_PRE_PUSH.md`, `.env.example`.
- **Não:** `.env.local`, chaves, tokens (devem estar no `.gitignore`).

### 3.2 Actions / Secrets

- Este repositório **não** usa GitHub Actions no momento; **não** há secrets obrigatórios no GitHub para build — a Vercel usa as env vars dela.

### 3.3 Fluxo sugerido antes do merge na `main`

1. Branch com código + arquivo SQL da migração.
2. **Supabase (projeto de staging ou o mesmo de produção):** rodar o SQL da migração.
3. **Vercel Preview:** abrir o deploy do PR e testar login + sync + liberação.
4. Merge → produção na Vercel.
5. Se produção usa o **mesmo** Supabase que já recebeu o SQL, não rode o SQL duas vezes de forma duplicada sem `if not exists` (o script deve ser idempotente).

---

## 4. Dados existentes e rollback

- **Rollback do SQL:** remover coluna em produção raramente é necessário; se precisar, algo como `alter table public.lead_transactions drop column if exists release_group_id;` — só use se nenhum cliente novo tiver gravado grupos ainda.
- **Rollback do app:** deploy da versão anterior na Vercel; coluna extra no Postgres não quebra clientes antigos que ignoram o campo.

---

## 5. Resumo executivo

| Onde | Ação |
|------|------|
| **Supabase** | Executar o SQL da nova migração (`release_group_id` em `lead_transactions`). |
| **Vercel** | Manter `NEXT_PUBLIC_SUPABASE_*`; redeploy após merge. |
| **GitHub** | Commitar migração + código; sem secrets novos obrigatórios. |

Quando novas tabelas ou políticas RLS forem adicionadas no futuro, **amplie** este documento com uma subseção por migração.
