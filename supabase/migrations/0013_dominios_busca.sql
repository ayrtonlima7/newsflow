-- Adiciona coluna dominios_busca (array de domínios derivado por LLM no save do perfil).
-- Usado pelo pipeline pra restringir a busca Tavily aos domínios mais relevantes pro
-- usuário. Só preenchido pra pt; en/es ficam sem restrição (NULL = comportamento atual).

alter table public.profiles
  add column if not exists dominios_busca text[];

-- Backfill: copia a lista estática de domínios pt pros perfis existentes.
-- Na próxima edição via /settings ou /onboarding, a derivação por LLM sobrescreve.
-- A lista estática é a mesma de src/lib/pipeline.ts DOMAINS_BY_LOCALE['pt'] em 2026-06.
update public.profiles
  set dominios_busca = array[
    -- Notícia geral
    'g1.globo.com', 'oglobo.globo.com', 'uol.com.br', 'folha.uol.com.br',
    'estadao.com.br', 'cnnbrasil.com.br', 'terra.com.br', 'metropoles.com',
    'r7.com', 'band.uol.com.br', 'cartacapital.com.br', 'gazetadopovo.com.br',
    'poder360.com.br', 'agenciabrasil.ebc.com.br', 'brasil.elpais.com',
    -- Esporte
    'ge.globo.com', 'lance.com.br', 'espn.com.br', 'trivela.com.br',
    -- Economia / negócios
    'valor.globo.com', 'exame.com', 'infomoney.com.br', 'braziljournal.com',
    'neofeed.com.br', 'moneytimes.com.br',
    -- Tecnologia
    'tecmundo.com.br', 'canaltech.com.br', 'olhardigital.com.br',
    'tecnoblog.net', 'meiobit.com', 'mobiletime.com.br',
    -- Ciência / saúde / cultura
    'veja.abril.com.br', 'super.abril.com.br', 'saude.abril.com.br',
    'revistagalileu.globo.com', 'omelete.com.br'
  ]
  where idioma = 'pt' or idioma is null;
