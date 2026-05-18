import type { Profile } from '../lib/types.ts';
import { frequenciaParaJanela } from '../lib/types.ts';

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
- Selecione entre 3 e 7 conteúdos — qualidade acima de quantidade.
- Ignore completamente os tópicos listados em "ignorar" no perfil.
- Para cada conteúdo selecionado, extraia:
  * Título original
  * Fonte e URL
  * Por que isso é relevante para esse usuário (1 frase)
  * Resumo do conteúdo (3 a 5 linhas, sem spoiler completo)
  * Nível de relevância: Alta ou Média
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
