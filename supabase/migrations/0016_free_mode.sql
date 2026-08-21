-- NewsFlow AI — modo GRÁTIS global (feature flag FREE_MODE)
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- A flag `FREE_MODE` (env var) alterna o modelo de negócio do produto inteiro:
--   OFF → assinatura (Stripe), como hoje.
--   ON  → tudo grátis: entra, faz onboarding, recebe curadoria.
--
-- Duas colunas guardam o que a FLAG NÃO consegue guardar (porque a flag muda e o
-- efeito no usuário é permanente):
--
-- 1. `free_forever` — acesso VITALÍCIO concedido na "era grátis". Quem usou o
--    produto enquanto a flag estava ON continua recebendo para sempre, mesmo
--    depois de ela voltar pra OFF. É estampado quando o acesso é exercido
--    (entrega ou criação de perfil), nunca revogado.
--
-- 2. `billing_paused_at` — quando a cobrança desse assinante foi PAUSADA no
--    Stripe (pause_collection) porque o produto virou grátis. Volta a null
--    quando a cobrança é retomada. Serve de idempotência pro comando de
--    reconciliação (`npm run sync-billing`) e pra UI explicar o estado.
--
-- Assinante pagante NÃO ganha vitalício: a assinatura dele é pausada e retomada
-- quando a flag volta pra OFF.

alter table public.profiles
  add column if not exists free_forever      boolean not null default false,
  add column if not exists billing_paused_at timestamptz;

-- Índice parcial: o comando de reconciliação varre só quem tem cobrança pausada.
create index if not exists profiles_billing_paused_idx
  on public.profiles (billing_paused_at)
  where billing_paused_at is not null;
