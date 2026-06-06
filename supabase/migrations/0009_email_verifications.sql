-- NewsFlow AI — verificação por código do email de entrega
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- O usuário só passa a receber a curadoria num email novo depois de confirmar
-- um código de 6 dígitos enviado pra ele. Isso garante que o endereço existe e
-- é dele (evita typo→bounce na raiz).
--
-- ⚠️ O código fica AQUI, não no profiles: a tabela profiles é legível pelo dono
-- via RLS, então um usuário poderia ler o próprio código e furar a verificação.
-- Esta tabela tem RLS LIGADA e SEM policies → só o service-role (admin client,
-- server-side) acessa. O usuário nunca lê o código pelo banco.

create table if not exists public.email_verifications (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  pending_email text not null,
  code          text not null,
  expires_at    timestamptz not null,
  attempts      int  not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.email_verifications enable row level security;
