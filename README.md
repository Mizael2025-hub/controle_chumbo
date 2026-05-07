# Controle de chumbo

Protótipo **offline-first** (IndexedDB via Dexie) com opcional **sync na nuvem** (Supabase).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### Variáveis de ambiente (nuvem)

Copie `.env.example` para `.env.local` e preencha com o projeto Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Sem essas variáveis o app funciona **somente local** (Dexie), com um aviso na tela.

## Supabase (primeira vez)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o script versionado em [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) (tabelas, RLS, triggers e Realtime).
3. Em **Authentication → Providers**, habilite **Email**.
4. Em **Authentication → Users**, crie um usuário (e-mail/senha) para você — não há tela de cadastro público no app.
5. Cole URL e anon key no `.env.local` e na Vercel (abaixo).

## Deploy na Vercel (Fase 1)

1. Envie o código para um repositório GitHub (recomendado privado).
2. Em [vercel.com](https://vercel.com) → **Add New Project** → importe o repo (framework Next.js detectado).
3. Configure as mesmas env vars (`NEXT_PUBLIC_SUPABASE_*`) em **Settings → Environment Variables**.
4. Cada `git push` na branch ligada gera um novo deploy.

## Sync após deploy

1. Abra a URL da Vercel no celular e no PC.
2. Faça login com o usuário criado no Supabase.
3. Na primeira vez com dados só no navegador, use **“Subir dados locais para a nuvem”** em cada aparelho que já tinha histórico local (ou só no que tem os dados “bons”).
4. Operações do dia a dia já enfileiram na **outbox** e são enviadas quando online; o motor também assina **Realtime** para receber mudanças do outro dispositivo.

## PWA

O arquivo [`public/manifest.webmanifest`](public/manifest.webmanifest) permite “instalar” o site no celular (ícones são placeholders; substitua por PNG 192/512 quando quiser).

## Documentação de domínio

Ver [`PROJECT_MAP.md`](PROJECT_MAP.md).
