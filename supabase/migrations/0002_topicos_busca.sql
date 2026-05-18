-- NewsFlow AI — coluna topicos_busca
-- Aplicação: cole no SQL Editor do Supabase e rode.
--
-- Motivação: o que o usuário digita ("novidades de IA hoje", "cloude code") é
-- ótimo pra UI ("foi isso que eu pedi") mas péssimo como query pra LLM com
-- web search — marcadores temporais e typos disparam alucinação de URL.
-- topicos_busca guarda uma versão normalizada gerada por LLM no save,
-- usada apenas internamente pelos prompts.

alter table public.profiles
  add column if not exists topicos_busca text[];

-- Backfill: pra perfis existentes, copia topicos cru. A próxima edição
-- via /settings vai gerar a versão normalizada automaticamente.
update public.profiles
  set topicos_busca = topicos
  where topicos_busca is null;
