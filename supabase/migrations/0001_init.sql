-- NewsFlow AI — schema inicial
-- Aplicação: cole isso no SQL Editor do Supabase e rode (Run).

-- =========================================================================
-- Tabelas
-- =========================================================================

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  area text not null,
  cargo text not null,
  topicos text[] not null default '{}',
  ignorar text[] not null default '{}',
  frequencia text not null,
  horario text not null,
  tom text not null,
  fontes_prioritarias text[] not null default '{}',
  descricoes_livres jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_referencia date not null,
  itens jsonb not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index briefings_user_created_idx
  on public.briefings (user_id, created_at desc);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_id uuid references public.briefings(id) on delete set null,
  subject text not null,
  html text not null,
  resend_id text,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  feedback text check (feedback in ('up','down') or feedback is null),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index deliveries_user_created_idx
  on public.deliveries (user_id, created_at desc);

-- =========================================================================
-- updated_at trigger para profiles
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.profiles  enable row level security;
alter table public.briefings enable row level security;
alter table public.deliveries enable row level security;

-- Profiles: usuário gerencia o próprio perfil
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id);

-- Briefings: só leitura pelo dono (escrita só pelo backend com service key)
create policy "briefings_select_own"
  on public.briefings for select
  using (auth.uid() = user_id);

-- Deliveries: só leitura pelo dono
create policy "deliveries_select_own"
  on public.deliveries for select
  using (auth.uid() = user_id);

-- Permite o usuário marcar feedback no próprio delivery (botões 👍/👎 do email
-- também passam por route handler com service key, mas deixamos a porta aberta
-- caso queira fazer pela UI logada).
create policy "deliveries_update_feedback_own"
  on public.deliveries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
