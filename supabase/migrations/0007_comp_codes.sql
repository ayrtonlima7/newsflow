-- NewsFlow AI — acesso de cortesia ("plano manual") via cupom resgatável
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- Modelo: amigos de beta furam o paywall sem Stripe/cartão. Eles resgatam um
-- cupom no /settings → o perfil vira subscription_status='manual', que o gate
-- trata como liberado. O webhook do Stripe NUNCA toca esses perfis (não têm
-- subscription), então 'manual' nunca é sobrescrito.

-- 1) Permite o novo status 'manual' no enum (CHECK).
--    O nome padrão do constraint criado em 0004 é profiles_subscription_status_check.
--    Se no seu banco tiver outro nome, ajuste o DROP abaixo.
alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;
alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('free', 'active', 'past_due', 'canceled', 'manual'));

-- 2) Qual cupom o perfil resgatou (auditoria / evitar resgate duplo).
alter table public.profiles
  add column if not exists comp_code text;

-- 3) Tabela de cupons de cortesia.
create table if not exists public.comp_codes (
  code            text primary key,        -- guardado em MAIÚSCULAS
  label           text,                    -- ex: "Beta amigos"
  max_redemptions int,                     -- null = ilimitado
  redeemed_count  int  not null default 0,
  is_active       boolean not null default true,
  expires_at      timestamptz,             -- null = nunca expira
  created_at      timestamptz not null default now()
);

-- RLS: só o service-role (admin client) mexe nos cupons. Sem policies de
-- leitura pública — o resgate roda numa server action com admin client.
alter table public.comp_codes enable row level security;

-- Exemplo de criação de cupom (rode separado, ajustando os valores):
-- insert into public.comp_codes (code, label, max_redemptions)
-- values ('AMIGO-NEWSFLOW', 'Beta amigos', 20);
