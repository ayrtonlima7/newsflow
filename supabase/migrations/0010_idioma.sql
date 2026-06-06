-- NewsFlow AI — idioma do usuário (i18n)
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- O idioma é por CONTA (não na URL): guardado aqui e usado pra (1) gerar a
-- curadoria no idioma certo e (2) traduzir a UI/emails. Default 'pt' → as linhas
-- de beta existentes ficam em português automaticamente (sem backfill manual).

alter table public.profiles
  add column if not exists idioma text not null default 'pt'
  check (idioma in ('pt', 'en', 'es'));
