-- 0014: cooldown do "Gerar agora" baseado na frequência (travado na geração).
--
-- Antes: cooldown fixo de 5 min (constante no código).
-- Agora: ao entregar/gerar um email, gravamos quando o próximo "Gerar agora"
-- fica disponível = agora + cadência-base da frequência (diária=1d, a cada
-- 3 dias=3d, semanal=7d). Travado no MOMENTO da geração — mudar a frequência
-- depois NÃO encurta o cooldown (evita burla).
--
-- NULL = sem cooldown (perfil que nunca gerou). Setado por delivery.ts em toda
-- entrega (cron e "Gerar agora").

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sample_cooldown_until timestamptz;
