-- Schema espelho do Dexie + Supabase Auth + RLS (usuário único).
-- Rode no SQL Editor do projeto Supabase após criar o projeto.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.lead_alloys (
  id uuid primary key,
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table public.lead_batches (
  id uuid primary key,
  alloy_id uuid not null references public.lead_alloys (id) on delete cascade,
  batch_number text not null,
  arrival_date date not null,
  initial_total_weight numeric not null,
  initial_total_bars integer not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table public.lead_piles (
  id uuid primary key,
  batch_id uuid not null references public.lead_batches (id) on delete cascade,
  current_weight numeric not null,
  current_bars integer not null,
  grid_position_x integer not null,
  grid_position_y integer not null,
  status text not null,
  reserved_for text null,
  reserved_at timestamptz null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table public.lead_transactions (
  id uuid primary key,
  pile_id uuid not null references public.lead_piles (id) on delete cascade,
  deducted_weight numeric not null,
  deducted_bars integer not null,
  destination text not null,
  transaction_date timestamptz not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table public.lead_pile_events (
  id uuid primary key,
  pile_id uuid not null references public.lead_piles (id) on delete cascade,
  kind text not null,
  recipient text not null,
  event_date timestamptz not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at automático (carimbo servidor para LWW)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lead_alloys_updated_at
  before update on public.lead_alloys
  for each row execute function public.set_updated_at();

create trigger lead_batches_updated_at
  before update on public.lead_batches
  for each row execute function public.set_updated_at();

create trigger lead_piles_updated_at
  before update on public.lead_piles
  for each row execute function public.set_updated_at();

create trigger lead_transactions_updated_at
  before update on public.lead_transactions
  for each row execute function public.set_updated_at();

create trigger lead_pile_events_updated_at
  before update on public.lead_pile_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lead_alloys enable row level security;
alter table public.lead_batches enable row level security;
alter table public.lead_piles enable row level security;
alter table public.lead_transactions enable row level security;
alter table public.lead_pile_events enable row level security;

create policy "lead_alloys_own"
  on public.lead_alloys for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "lead_batches_own"
  on public.lead_batches for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "lead_piles_own"
  on public.lead_piles for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "lead_transactions_own"
  on public.lead_transactions for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "lead_pile_events_own"
  on public.lead_pile_events for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime (para pull contínuo no cliente)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.lead_alloys;
alter publication supabase_realtime add table public.lead_batches;
alter publication supabase_realtime add table public.lead_piles;
alter publication supabase_realtime add table public.lead_transactions;
alter publication supabase_realtime add table public.lead_pile_events;
