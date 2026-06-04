-- ============================================================================
-- Reset do beta — apaga TODOS os usuários e seus dados
-- ============================================================================
--
-- Usar quando quiser começar o beta do zero (sem usuários existentes).
-- Inclui o seu próprio usuário admin — você vai precisar fazer signup de novo.
--
-- Como rodar:
--   1. Aplica primeiro a migração 0003_onboarding_redesign.sql (se ainda não rodou)
--   2. Cola este script no SQL Editor do Supabase
--   3. Roda
--
-- Cascata: deletar auth.users também deleta automaticamente:
--   - public.profiles (via FK on delete cascade)
--   - public.briefings (via FK on delete cascade)
--   - public.deliveries (via FK on delete cascade)
--
-- ⚠️  ESSA OPERAÇÃO É IRREVERSÍVEL. Confirme antes de rodar.

delete from auth.users;

-- Sanity check — todas as tabelas devem ficar vazias
select 'auth.users' as tabela, count(*) as total from auth.users
union all
select 'profiles', count(*) from public.profiles
union all
select 'briefings', count(*) from public.briefings
union all
select 'deliveries', count(*) from public.deliveries;
