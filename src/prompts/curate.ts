import type { Profile, BriefingItem } from '../lib/types';
import { frequenciaParaJanela, profileForPrompt } from '../lib/types';

export interface RetryContext {
  validItems: BriefingItem[];
  brokenItems: { titulo: string; url: string; reason: string }[];
  targetMin: number;
  targetMax: number;
}

export function buildCuratePrompt(profile: Profile): { system: string; user: string } {
  const janela = frequenciaParaJanela(profile.frequencia);

  const system =
    'Você é um agente de curadoria de conteúdo profissional. ' +
    'Você recebe o perfil de um usuário e sua tarefa é pesquisar, filtrar e selecionar ' +
    `os conteúdos mais NOVOS e RELEVANTES — publicados nos ${janela.rotulo}. ` +
    'Frescor é tão importante quanto relevância — o usuário quer notícias atuais, não enciclopédia.';

  const user = `PERFIL DO USUÁRIO:
${JSON.stringify(profileForPrompt(profile), null, 2)}

DATA ATUAL: ${janela.todayISO}
JANELA DE FRESCOR: ${janela.rotulo}
  - Cadência de entrega do usuário: ${profile.frequencia}
  - Cutoff: artigos publicados antes de ${janela.cutoffISO} são REJEITADOS

REGRA CRÍTICA DE FRESCOR (a mais importante):
- A janela é EXATA, espelha a cadência de entrega. Se o usuário recebe semanalmente, ele só
  quer notícias dos últimos 7 dias. Se recebe diariamente, dos últimos 1 dia.
- Conteúdo anterior ao cutoff já foi visto na entrega passada — ou é velho demais pra importar.
- O usuário quer NOTÍCIAS frescas, não enciclopédia. Conteúdo evergreen (tutoriais antigos,
  posts atemporais, biografias, "como funciona X") está FORA — esse não é o produto.
- Se a URL contém data antiga (ex: /2024/03/15/, /2022/, /noticias/jan-2023/), DESCARTE
  imediatamente — sinal forte de artigo velho.
- Sem data de publicação confirmada = DESCARTE. Não tem como garantir frescor sem data.
- NUNCA inclua artigos antes de ${janela.cutoffISO}, mesmo que pareçam super relevantes. Trate
  como spam — é melhor email mais enxuto com 2 itens FRESCOS do que 6 itens com metade velhos.

INSTRUÇÕES:
- Pesquise nas referências do usuário (campo "referencias") e nas fontes convencionais
  dos temas dele (blogs, portais, comunidades). Priorize as referências quando aparecerem.
- O campo "contexto" (Profissão/Estudo/Hobby/Curiosidade) e "descricao_livre" são
  CRÍTICOS pra calibrar PROFUNDIDADE. Profissão → conteúdo técnico, aplicável; Estudo →
  fundamentos com profundidade média; Hobby → ângulo apaixonado, casos reais; Curiosidade →
  acessível, contexto pra leigo.
- O campo "objetivo" determina o RECORTE do que selecionar:
  * "Ficar de olho no que tá rolando" → priorize lançamentos, anúncios, eventos recentes
  * "Aprender coisas novas" → priorize tutoriais avançados, papers, explicadores
  * "Decisões pro meu dia a dia" → priorize comparativos, trade-offs, casos reais aplicáveis
  * "Inspiração e tendências" → priorize cases inspiradores, projetos notórios, visões
  * "Cultura geral / saber sobre" → priorize panoramas, debates, contexto histórico
- O campo "formatos" indica preferência de tipo de conteúdo. Priorize esses formatos.
- Se o tema é específico de nicho (ex: jardinagem, enfermagem equina, restauração de móveis),
  busque em portais e comunidades especializadas — não force fontes mainstream.
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
- Atenção especial a IDs de posts (Reddit /comments/<id>, YouTube ?v=<id>,
  HackerNews item?id=<id>, tweets/X status/<id>): esses IDs são curtos e
  arbitrários, e modelos costumam inventá-los com aparência plausível. Só
  inclua se o ID vier literalmente de um resultado de busca específico —
  na dúvida, descarte.
- Twitter/X e LinkedIn bloqueiam validação automática, então URLs desses
  sites caem direto no risco de falso positivo. Use com moderação e só
  quando tiver alta confiança que o post existe — prefira artigos em
  blogs/portais com URL canônica.

- Se não encontrar nada relevante, retorne "itens": [].

RESPONDA APENAS COM UM JSON VÁLIDO, sem markdown, sem texto antes ou depois:
{
  "data_referencia": "${janela.todayISO}",
  "itens": [
    {
      "titulo": "",
      "fonte": "",
      "url": "",
      "data_publicacao": "YYYY-MM-DD (entre ${janela.cutoffISO} e ${janela.todayISO}, OBRIGATÓRIO)",
      "relevancia": "Alta",
      "motivo_relevancia": "",
      "resumo": ""
    }
  ]
}`;

  return { system, user };
}

export function buildRetryCuratePrompt(
  profile: Profile,
  ctx: RetryContext,
): { system: string; user: string } {
  const janela = frequenciaParaJanela(profile.frequencia);

  const system =
    'Você é um agente de curadoria de conteúdo profissional executando uma SEGUNDA tentativa. ' +
    'Uma rodada anterior produziu itens com URLs inválidas que foram descartadas pela validação. ' +
    `Sua tarefa agora é encontrar conteúdos REAIS, FRESCOS e VERIFICÁVEIS publicados nos ${janela.rotulo}, ` +
    'cuidando para não repetir os erros anteriores.';

  const brokenList = ctx.brokenItems
    .map((b, i) => `  ${i + 1}. "${b.titulo}"\n     URL: ${b.url}\n     Motivo: ${b.reason}`)
    .join('\n');

  const keptList =
    ctx.validItems.length > 0
      ? '\n\nITENS JÁ APROVADOS (NÃO REPITA — busque conteúdos diferentes):\n' +
        ctx.validItems.map((v, i) => `  ${i + 1}. ${v.titulo} (${v.url})`).join('\n')
      : '';

  const needed = Math.max(ctx.targetMin - ctx.validItems.length, 1);
  const max = Math.max(ctx.targetMax - ctx.validItems.length, needed);

  const user = `PERFIL DO USUÁRIO:
${JSON.stringify(profileForPrompt(profile), null, 2)}

ITENS QUE FALHARAM NA TENTATIVA ANTERIOR (URLs inválidas):
${brokenList}
${keptList}

INSTRUÇÕES PARA ESTA TENTATIVA:
- Encontre ${needed} a ${max} NOVOS conteúdos para completar o briefing.
- NÃO repita nenhum item da lista de aprovados nem da lista de falhados.
- NÃO use a mesma URL que falhou — busque conteúdo de outras fontes.
- Aplique as MESMAS regras de qualidade do curate original:
  * Resumo de 6-10 linhas, denso, com fatos concretos
  * Relevância Alta ou Média
  * Motivo de relevância (1 frase)

REGRAS CRÍTICAS DE URL (REFORÇADAS — a tentativa anterior falhou aqui):
- COLE URLs verbatim dos seus resultados de busca. Não modifique, não complete,
  não construa por padrão. Se você "lembra" de um artigo mas não vê a URL no
  search atual, DESCARTE.
- NUNCA invente IDs de posts (Reddit /comments/<id>, YouTube ?v=<id>,
  HackerNews item?id=<id>, X status/<id>). Esses IDs são curtos e seu cérebro
  vai querer completá-los — resista. Só inclua se o ID estiver literal no resultado.
- PREFIRA URLs canônicas de artigos/posts específicos sobre páginas
  agregadoras com data (ex: /news/today, /ai-news/may-18-2026).
- Se você não encontrar URLs verificáveis suficientes, retorne MENOS itens
  do que o solicitado — é melhor 1 item real do que 4 inventados.

REGRAS CRÍTICAS DE FRESCOR:
- Data atual: ${janela.todayISO}.
- Limite máximo de antiguidade: ${janela.cutoffISO}. NÃO inclua artigos antes disso.
- Cada item DEVE ter campo "data_publicacao" no formato YYYY-MM-DD.
- Se a URL contém data antiga no caminho (ex: /2023/, /noticias/abril-2024/), DESCARTE — é artigo velho.
- Sem data confirmada = descarta.

RESPONDA APENAS COM UM JSON VÁLIDO, sem markdown, sem texto antes ou depois:
{
  "data_referencia": "${janela.todayISO}",
  "itens": [ {
    "titulo": "",
    "fonte": "",
    "url": "",
    "data_publicacao": "YYYY-MM-DD (entre ${janela.cutoffISO} e ${janela.todayISO}, OBRIGATÓRIO)",
    "relevancia": "Alta",
    "motivo_relevancia": "",
    "resumo": ""
  } ]
}`;

  return { system, user };
}
