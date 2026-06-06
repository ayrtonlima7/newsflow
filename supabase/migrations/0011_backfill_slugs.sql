-- NewsFlow AI — backfill: contexto/frequencia de rótulo PT legado → slug canônico
-- Aplicação: cole no SQL Editor do Supabase e rode (one-off; seguro re-rodar).
--
-- A i18n desacoplou os 2 campos load-bearing em slugs neutros de idioma. O
-- código tolera os valores PT antigos (normalize*), mas convertemos as linhas
-- existentes pra slug pra (a) consistência e (b) a UI de settings exibir o
-- rótulo certo no idioma do usuário. O `else` preserva qualquer valor já-slug.

update public.profiles set contexto = case lower(coalesce(contexto, ''))
  when 'profissão' then 'profession'
  when 'profissao' then 'profession'
  when 'estudo' then 'study'
  when 'hobby ou paixão' then 'hobby'
  when 'hobby ou paixao' then 'hobby'
  when 'curiosidade geral' then 'curiosity'
  else contexto
end
where contexto is not null and contexto <> '';

update public.profiles set frequencia = case lower(coalesce(frequencia, ''))
  when 'todo dia' then 'daily'
  when 'a cada 3 dias' then 'every3days'
  when 'uma vez por semana' then 'weekly'
  else frequencia
end
where frequencia is not null and frequencia <> '';
