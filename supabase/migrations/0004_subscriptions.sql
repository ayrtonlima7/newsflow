-- NewsFlow AI — campos de assinatura (Stripe)
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- Modelo: 1 assinatura por usuário. Trial = 4 emails grátis (contados via
-- deliveries com status='sent'), depois precisa de assinatura ativa.

alter table public.profiles
  -- ID do customer no Stripe (criado no primeiro checkout). 1 por usuário.
  add column if not exists stripe_customer_id text,
  -- ID da subscription ativa no Stripe.
  add column if not exists stripe_subscription_id text,
  -- Status do acesso pago. 'free' = nunca assinou / trial.
  -- 'active' = pagando (inclui período já cancelado mas ainda vigente).
  -- 'past_due' = pagamento falhou. 'canceled' = encerrado.
  add column if not exists subscription_status text not null default 'free'
    check (subscription_status in ('free', 'active', 'past_due', 'canceled')),
  -- Plano: 'mensal' | 'anual' | null (free).
  add column if not exists plan text,
  -- Fim do período pago atual (pra mostrar "renova em X" e dar grace).
  add column if not exists current_period_end timestamptz;

-- Índice pra achar rápido o profile pelo customer do Stripe (usado no webhook).
create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);
