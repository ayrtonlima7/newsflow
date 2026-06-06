-- NewsFlow AI — sinal de período de teste (trial de 30 dias)
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- O trial é nativo do Stripe (trial_period_days no checkout). Durante o trial a
-- subscription tem status 'trialing', que nosso webhook mapeia pra 'active'
-- (usuário recebe normalmente). Guardamos trial_end pra UI mostrar
-- "teste grátis até DATA — primeira cobrança nessa data" em vez de "renova em".
-- Detecção de trial em curso: trial_end IS NOT NULL AND trial_end > now().

alter table public.profiles
  add column if not exists trial_end timestamptz;
