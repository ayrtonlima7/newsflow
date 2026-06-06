-- NewsFlow AI — email de entrega separado do email de login
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- O usuário autentica com um email (Google ou magic-link) mas pode preferir
-- receber a curadoria em OUTRO endereço. delivery_email guarda essa preferência;
-- NULL = usa o email da conta (auth). A resolução acontece no runDeliveryPipeline.

alter table public.profiles
  add column if not exists delivery_email text;
