import type { Profile } from '../lib/types';
import { frequenciaParaJanela } from '../lib/types';

export function buildCuratePrompt(profile: Profile): { system: string; user: string } {
  const { rotulo } = frequenciaParaJanela(profile.frequencia);

  const system =
    'Você é um agente de curadoria de conteúdo profissional. ' +
    'Você recebe o perfil de um usuário e sua tarefa é pesquisar, filtrar e selecionar ' +
    `os conteúdos mais relevantes publicados nas ${rotulo}.`;

  const user = `PERFIL DO USUÁRIO:
${JSON.stringify(profile, null, 2)}

INSTRUÇÕES:
- Pesquise nas fontes indicadas pelo usuário e nas fontes convencionais da área dele
  (Twitter/X, LinkedIn, Reddit, Hacker News, blogs especializados, portais do setor).
- Se a área for específica (ex: jardinagem, enfermagem), priorize portais e comunidades
  especializadas dessa área.
- Selecione entre 4 e 7 conteúdos. Qualidade acima de quantidade — uma camada
  de validação posterior descarta URLs quebradas, então priorize itens cujas
  URLs você tem alta confiança que são reais.
- Ignore completamente os tópicos listados em "ignorar" no perfil.

REGRAS PARA EVITAR ALUCINAÇÃO DE URL (CRÍTICAS):
- PREFIRA URLs canônicas de artigos/posts/vídeos específicos. EVITE páginas
  agregadoras de "notícias do dia" (ex: site.com/ai-news/may-18-2026,
  site.com/news/today, site.com/daily-roundup) — esse padrão é onde os
  modelos mais alucinam URLs que ainda não existem.
- Para cada item, confirme que a data de PUBLICAÇÃO do conteúdo é real e
  recente. NÃO inclua artigos sobre eventos futuros cujo conteúdo "vai sair"
  amanhã ou em breve — esses raramente têm URL real ainda.
- Se entre seus resultados de busca aparecer "previews" ou "expected
  announcements" de eventos que ainda não aconteceram, só inclua se houver
  uma URL real e estável já publicada (não uma URL futura inventada).
- Para cada conteúdo selecionado, extraia:
  * Título original
  * Fonte e URL
  * Por que isso é relevante para esse usuário (1 frase)
  * Resumo do conteúdo: 6 a 10 linhas, denso, com fatos concretos —
    números, nomes, datas, citações, contexto e implicações. O leitor
    raramente vai clicar no link original; o resumo precisa ser
    autocontido o suficiente para ele ENTENDER o assunto. Não esconda
    detalhes-chave por receio de "spoiler" — esse não é um produto de
    teaser, é um produto de conhecimento.
  * Nível de relevância: Alta ou Média

REGRAS CRÍTICAS SOBRE URLS:
- A URL DEVE ser exatamente a URL real do artigo/post/vídeo que veio dos
  seus resultados de busca. Cole a URL verbatim como apareceu na busca.
- NUNCA invente, adivinhe, complete ou modifique URLs.
- NUNCA use placeholders como "your_video_id", "example.com", "TODO",
  "[ID]", "..." ou qualquer template — se você não tem a URL real, não
  inclua o item.
- NUNCA mescle informação de um artigo com a URL de outro. Cada item
  precisa ser fielmente do conteúdo daquela URL específica.
- Se um conteúdo é interessante mas você não conseguiu confirmar a URL
  real, DESCARTE — é melhor entregar 3 itens verificáveis do que 5
  itens com 2 links quebrados.

- Se não encontrar nada relevante, retorne "itens": [].

RESPONDA APENAS COM UM JSON VÁLIDO, sem markdown, sem texto antes ou depois:
{
  "data_referencia": "YYYY-MM-DD",
  "itens": [
    {
      "titulo": "",
      "fonte": "",
      "url": "",
      "relevancia": "Alta",
      "motivo_relevancia": "",
      "resumo": ""
    }
  ]
}`;

  return { system, user };
}
