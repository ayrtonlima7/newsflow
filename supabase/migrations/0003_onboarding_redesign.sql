-- NewsFlow AI — redesign do onboarding
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- Motivação: o onboarding antigo era centrado em "profissional ativo"
-- (area + cargo). O novo é centrado em "interesses + intenção", servindo
-- qualquer pessoa (profissional, estudante, hobbyista, curioso).
--
-- Estratégia:
--   1. Adicionar colunas novas
--   2. Backfill dos campos legacy pros novos (preserva dados do beta)
--   3. DROP das colunas legacy (não temos usuários reais ainda — beta
--      privado, limpar agora evita esquema sujo no longo prazo)

-- 1. Adicionar colunas novas
alter table public.profiles
  add column if not exists nome text not null default '',
  add column if not exists tema text[] not null default '{}',
  add column if not exists contexto text not null default '',
  add column if not exists descricao_livre text not null default '',
  add column if not exists objetivo text not null default '',
  add column if not exists referencias text[] not null default '{}',
  add column if not exists formatos text[] not null default '{}';

-- 2. Backfill dos campos legacy pros novos
update public.profiles
  set tema = ARRAY[area]
  where (tema = '{}' or tema is null) and area is not null and area <> '';

update public.profiles
  set descricao_livre = cargo
  where descricao_livre = '' and cargo is not null and cargo <> '';

-- Heurística: quem tinha cargo é "Profissão". Usuário pode editar em /settings.
update public.profiles
  set contexto = 'Profissão'
  where contexto = '' and cargo is not null and cargo <> '';

-- 3. DROP das colunas legacy
alter table public.profiles
  drop column if exists area,
  drop column if exists cargo,
  drop column if exists fontes_prioritarias,
  drop column if exists tom,
  drop column if exists descricoes_livres;
