-- NewsFlow AI — flag de cancelamento agendado
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- Quando o usuário cancela no Customer Portal, o Stripe mantém a subscription
-- 'active' até o fim do período pago (cancel_at_period_end=true). Guardamos
-- essa flag pra mostrar "acesso até DATA (não renova)" em vez de "renova em DATA".

alter table public.profiles
  add column if not exists cancel_at_period_end boolean not null default false;
