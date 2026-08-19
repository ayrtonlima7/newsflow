-- NewsFlow AI — cota diária de regeneração de sugestões de tópicos
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- Cada regeneração de sugestões é uma chamada de LLM (custo real), então o
-- usuário tem um teto por dia (ver SUGGESTIONS_DAILY_LIMIT em
-- src/lib/suggestion-quota.ts).
--
-- ⚠️ Por que uma tabela separada, e não colunas em `profiles`:
--   1. `profiles` é escrita pelo dono via RLS → o usuário poderia zerar a
--      própria cota. Aqui a RLS fica LIGADA e SEM policies → só o service-role
--      (admin client, server-side) acessa.
--   2. Durante o ONBOARDING o perfil ainda NÃO existe, e a cota precisa valer
--      naquele momento também.

create table if not exists public.suggestion_quota (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  used_date  date not null,
  used_count int  not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.suggestion_quota enable row level security;
-- Sem policies de propósito: nenhum acesso via chave anon/authenticated.
-- Só o service-role (que ignora RLS) lê e escreve.
