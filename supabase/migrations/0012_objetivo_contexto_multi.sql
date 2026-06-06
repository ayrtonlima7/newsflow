-- NewsFlow AI — objetivo e contexto viram múltipla escolha (text → text[])
-- Aplicação: cole no SQL Editor do Supabase e rode (seguro; converte linhas existentes).
--
-- O usuário pode ter mais de um objetivo (ex: "ficar de olho" + "aprender") e
-- mais de um contexto (ex: "Profissão" + "Hobby"). As colunas viram array; o
-- valor único existente vira um array de 1 elemento. contexto guarda slugs
-- ('profession', 'hobby', ...); o código normaliza/tolera legado.

alter table public.profiles
  alter column objetivo drop default,
  alter column objetivo type text[] using (
    case when objetivo is null or objetivo = '' then '{}'::text[] else array[objetivo] end
  ),
  alter column objetivo set default '{}';

alter table public.profiles
  alter column contexto drop default,
  alter column contexto type text[] using (
    case when contexto is null or contexto = '' then '{}'::text[] else array[contexto] end
  ),
  alter column contexto set default '{}';
