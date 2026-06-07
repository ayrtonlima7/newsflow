-- ============================================================================
-- Reset completo — apaga TODOS os dados EXCETO cupons (comp_code)
-- ============================================================================
--
-- Estratégia: como auth.users cascade deleta profiles, salvamos os cupons
-- numa tabela de apoio ANTES do delete. Depois do reset, quando os usuários
-- recriarem conta e perfil, os cupons estão disponíveis pra reassociar.
--
-- ⚠️  IRREVERSÍVEL. Confirme antes de rodar.
--
-- Como usar:
--   1. Cola este script no SQL Editor do Supabase
--   2. Rode o bloco 1 (backup)
--   3. Confira o resultado
--   4. Rode o bloco 2 (reset)
--   5. Confira o estado final

-- ============================================================================
-- BLOCO 1: Backup dos cupons ativos
-- ============================================================================

drop table if exists _reset_coupons_backup;

create table _reset_coupons_backup as
select user_id, comp_code
from public.profiles
where comp_code is not null and comp_code != '';

-- Mostra o que será preservado
select 'cupons preservados' as info, count(*) as total from _reset_coupons_backup;
select * from _reset_coupons_backup;

-- ============================================================================
-- BLOCO 2: Reset nuclear (rode APÓS conferir o bloco 1)
-- ============================================================================

-- Deleta TODOS os usuários. O cascade automático apaga:
--   public.profiles → public.briefings → public.deliveries
delete from auth.users;

-- ============================================================================
-- BLOCO 3: Sanity check
-- ============================================================================

select 'auth.users' as tabela, count(*) as total from auth.users
union all
select 'profiles', count(*) from public.profiles
union all
select 'briefings', count(*) from public.briefings
union all
select 'deliveries', count(*) from public.deliveries
union all
select '_reset_coupons_backup (cupons)', count(*) from _reset_coupons_backup;

-- ============================================================================
-- BLOCO 4: Restaurar cupom após usuário se recadastrar
-- ============================================================================
-- Depois que o usuário criar conta nova + perfil novo (via onboarding),
-- rode este UPDATE, substituindo <EMAIL_OU_USER_ID>:
--
--   update public.profiles p
--   set comp_code = b.comp_code
--   from _reset_coupons_backup b
--   where p.user_id = b.user_id;
--
-- Ou se quiser associar a um usuário específico manualmente:
--
--   update public.profiles
--   set comp_code = '<cupom>'
--   where user_id = '<novo_user_id>';
