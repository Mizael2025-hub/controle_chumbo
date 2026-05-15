-- Cor oficial da liga na UI (paleta fixa no app).
alter table public.lead_alloys
  add column if not exists color_key text not null default 'gray';
