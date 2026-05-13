-- Agrupa linhas de liberação feitas no mesmo envio (modal). Rodar no SQL Editor do Supabase após deploy do app compatível.

alter table public.lead_transactions
  add column if not exists release_group_id uuid null;

comment on column public.lead_transactions.release_group_id is
  'Mesmo UUID para todas as transações criadas em um único envio de liberação; null em registros antigos.';
