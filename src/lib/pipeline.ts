import { getProvider, extractJson } from './providers';
import { buildCurateFromResultsPrompt, buildSearchQueries } from '../prompts/curate';
import { calculateCost } from './pricing';
import { validateSelectedLeniently, type DroppedItem } from './url-validation';
import { tavilySearchMany, tavilyExtract, type SearchResult } from './search';
import { googleNewsSearchMany } from './search-rss';
import { renderEmailHtml } from './email-template';
import type { Profile, Briefing, BriefingItem, EmailOutput } from './types';
import { frequenciaParaJanela } from './types';
import { normalizeLocale, type Locale } from './i18n';

/** Domínios de qualidade em português por idioma. ~100 fontes: Brasil,
 *  Portugal/lusofonia e internacionais com edição em pt. O índice `news` da
 *  Tavily é global/inglês por padrão — pra usuários pt isso devolve lixo dos EUA
 *  sem restrição. en/es ficam globais (sem lista).
 *  Mantenha sincronizado com DOMAIN_CATALOG em domain-derivation.ts. */
const DOMAINS_BY_LOCALE: Partial<Record<Locale, string[]>> = {
  pt: [
    // Notícia geral / Política (30)
    'g1.globo.com', 'oglobo.globo.com', 'uol.com.br', 'folha.uol.com.br',
    'estadao.com.br', 'cnnbrasil.com.br', 'terra.com.br', 'metropoles.com',
    'r7.com', 'band.uol.com.br', 'cartacapital.com.br', 'gazetadopovo.com.br',
    'poder360.com.br', 'agenciabrasil.ebc.com.br', 'brasil.elpais.com',
    'jovempan.com.br', 'ig.com.br', 'istoe.com.br', 'revistaforum.com.br',
    'nexojornal.com.br', 'theintercept.com.br', 'antagonista.com.br',
    'crusoe.com.br', 'jota.info', 'brasil247.com', 'brasildefato.com.br',
    'revistapiaui.com.br', 'noticias.r7.com', 'epoca.globo.com',
    'bbc.com/portuguese',
    // Mundo / Lusofonia (19)
    'dw.com/pt-br', 'rfi.fr/br', 'sputniknewsbrasil.com.br', 'rt.com/brasil',
    'observador.pt', 'publico.pt', 'expresso.pt', 'cnnportugal.iol.pt',
    'sicnoticias.pt', 'rtp.pt', 'tsf.pt', 'dn.pt', 'jornaldenegocios.pt',
    'eco.sapo.pt', 'jornaleconomico.pt', 'visao.pt', 'noticiasaominuto.com',
    'verangola.co.ao', 'ionline.pt',
    // Esporte (11)
    'ge.globo.com', 'lance.com.br', 'espn.com.br', 'trivela.com.br',
    'sportv.globo.com', 'cbf.com.br', 'futebolinterior.com.br',
    'torcedores.com', 'ogol.com.br', 'superesportes.com.br', 'placar.uol.com.br',
    // Economia / negócios (12)
    'valor.globo.com', 'exame.com', 'infomoney.com.br', 'braziljournal.com',
    'neofeed.com.br', 'moneytimes.com.br', 'forbes.com.br',
    'epocanegocios.globo.com', 'mercadoeconsumo.com.br', 'baguete.com.br',
    'startupi.com.br', 'bloomberglinea.com',
    // Tecnologia (12)
    'tecmundo.com.br', 'canaltech.com.br', 'olhardigital.com.br',
    'tecnoblog.net', 'meiobit.com', 'mobiletime.com.br', 'techtudo.com.br',
    'tudocelular.com', 'showmetech.com.br', 'adrenaline.com.br',
    'techguide.com.br', 'gizmodo.uol.com.br',
    // Ciência / saúde / cultura / entretenimento (16)
    'veja.abril.com.br', 'super.abril.com.br', 'saude.abril.com.br',
    'revistagalileu.globo.com', 'omelete.com.br', 'cinepop.com.br',
    'adorocinema.com', 'inovasocial.com.br', 'megacurioso.com.br',
    'minhavida.com.br', 'rollingstone.com.br', 'gshow.globo.com', 'b9.com.br',
    'spotniks.com', 'hypeness.com.br', 'contigo.uol.com.br',
  ],
};

export interface PipelineUsage {
  inputTokens: number;
  outputTokens: number;
  toolTokens: number;
  totalTokens: number;
  groundingRequests: number;
}

export interface PipelineMeta {
  provider: string;
  model: string;
  elapsedSeconds: number;
  usage: PipelineUsage;
  cost: ReturnType<typeof calculateCost>;
  searchQueries?: string[];
  searchResultCount?: number;
  droppedItems?: DroppedItem[];
  hallucinatedUrlsDropped?: number;
}

/** Resolve a lista de domínios pra restrição de busca: usa a lista derivada por
 *  perfil se disponível, senão cai na estática. pt-only; en/es retornam undefined
 *  (sem restrição). */
function resolveDomains(profile: Profile, locale: Locale): string[] | undefined {
  if (locale !== 'pt') return undefined;
  if (profile.dominios_busca && profile.dominios_busca.length > 0) {
    return profile.dominios_busca;
  }
  return DOMAINS_BY_LOCALE[locale];
}

/** Normaliza título pra detecção de duplicata (minúsculo, sem acento/pontuação). */
function normalizeTitleForDedup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Remove itens duplicados DENTRO do mesmo briefing. O LLM às vezes seleciona a
 * mesma matéria 2× (URL idêntica) ou a mesma notícia por fontes diferentes
 * (título quase idêntico). Mantém a 1ª ocorrência. (Dedup entre EDIÇÕES é outro
 * mecanismo, via `excludeUrls`.)
 */
export function dedupeItems<T extends { url: string; titulo: string }>(itens: T[]): T[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: T[] = [];
  for (const it of itens) {
    const url = (it.url ?? '').replace(/\/+$/, '').toLowerCase();
    const title = normalizeTitleForDedup(it.titulo ?? '');
    if (seenUrl.has(url) || (title.length > 0 && seenTitle.has(title))) continue;
    seenUrl.add(url);
    if (title) seenTitle.add(title);
    out.push(it);
  }
  return out;
}

/**
 * Gera o briefing em 2 passos:
 *   1. Tavily busca conteúdo REAL e fresco (URLs verdadeiras + datas).
 *   2. DeepSeek (CURATE_LLM_PROVIDER) seleciona e escreve resumos densos —
 *      só pode usar URLs da lista, então não há alucinação de link.
 */
export async function generateBriefing(
  profile: Profile,
  opts: { excludeUrls?: Set<string> } = {},
): Promise<{ briefing: Briefing; meta: PipelineMeta }> {
  const janela = frequenciaParaJanela(profile.frequencia);
  const locale = normalizeLocale(profile.idioma);
  const t0 = Date.now();
  const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  // --- Passo 1: busca real. SEARCH_PROVIDER: 'tavily' (só Tavily, kill-switch) |
  //     'rss' (só Google News RSS) | ausente/'merge' = FAN-OUT (default): roda as
  //     duas fontes e mescla. Tavily traz corpo extraível (tópico amplo); o RSS
  //     cobre nicho/local DATADO que o Tavily não pega e engrossa o pool — de
  //     graça (sem chave). Mais candidatos ⇒ diário enche melhor + frescor real. ---
  const searchProvider =
    process.env.SEARCH_PROVIDER === 'tavily' || process.env.SEARCH_PROVIDER === 'rss'
      ? process.env.SEARCH_PROVIDER
      : 'merge';
  const queries = buildSearchQueries(profile, locale);
  if (queries.length === 0) {
    throw new Error('curate: nenhuma query de busca derivada do perfil');
  }

  const searchTavily = async (): Promise<SearchResult[]> => {
    const restrictedDomains = resolveDomains(profile, locale);
    let res = await tavilySearchMany(queries, {
      days: janela.janelaDias,
      maxResults: 12,
      topic: 'news',
      includeDomains: restrictedDomains,
    });
    // Fallback: busca restrita a domínios (pt) veio MUITO pouco → refaz SEM
    // restrição (global) e mescla (preferência BR primeiro). Só dispara quando
    // faltou conteúdo de verdade — nicho internacional não tem cobertura BR.
    if (restrictedDomains && res.length < janela.itemsMin) {
      console.warn(
        `[curate] busca restrita a domínios devolveu ${res.length} (< itemsMin ${janela.itemsMin}) — refazendo SEM restrição (fallback global)`,
      );
      const global = await tavilySearchMany(queries, { days: janela.janelaDias, maxResults: 12, topic: 'news' });
      const seen = new Set(res.map((r) => r.url));
      res = [...res, ...global.filter((r) => !seen.has(r.url))];
    }
    return res;
  };
  const searchRss = (): Promise<SearchResult[]> =>
    googleNewsSearchMany(queries, { days: janela.janelaDias, maxResults: 10 }, locale);

  // Teto do pool mesclado pra não estourar o prompt do LLM (Tavily score-desc
  // primeiro, RSS data-desc depois → o extract pega os top Tavily; o resto é oferta).
  const MERGE_CAP = 50;
  const tSearch = Date.now();
  let rawResults: SearchResult[];
  if (searchProvider === 'tavily') {
    rawResults = await searchTavily();
    console.log(
      `[timing] Tavily (${queries.length} queries): ${((Date.now() - tSearch) / 1000).toFixed(1)}s → ${rawResults.length} | total ${since()}`,
    );
  } else if (searchProvider === 'rss') {
    rawResults = await searchRss();
    console.log(
      `[timing] Google News RSS (${queries.length} queries): ${((Date.now() - tSearch) / 1000).toFixed(1)}s → ${rawResults.length} | total ${since()}`,
    );
  } else {
    const [tav, rss] = await Promise.all([searchTavily(), searchRss()]);
    const seen = new Set(tav.map((r) => r.url));
    rawResults = [...tav, ...rss.filter((r) => !seen.has(r.url))].slice(0, MERGE_CAP);
    console.log(
      `[timing] fan-out Tavily(${tav.length})+RSS(${rss.length})→${rawResults.length}/cap${MERGE_CAP}: ${((Date.now() - tSearch) / 1000).toFixed(1)}s | total ${since()}`,
    );
  }

  // --- Dedup entre entregas: remove URLs que o usuário já recebeu nas edições
  //     recentes ANTES do LLM ver (assim ele escolhe alternativas frescas em vez
  //     de re-selecionar a mesma matéria que continua relevante). Melhor menos
  //     itens novos que repetir o de ontem. ---
  if (opts.excludeUrls && opts.excludeUrls.size > 0) {
    const before = rawResults.length;
    rawResults = rawResults.filter((r) => !opts.excludeUrls!.has(r.url));
    const removed = before - rawResults.length;
    if (removed > 0) {
      console.log(`[curate] dedup: ${removed} resultado(s) já enviado(s) removido(s) (${rawResults.length} restantes)`);
    }
  }

  if (rawResults.length === 0) {
    // Sem resultados — retorna briefing vazio (delivery vira skipped_empty).
    return {
      briefing: { data_referencia: janela.todayISO, itens: [] },
      meta: {
        provider: 'tavily+none',
        model: '-',
        elapsedSeconds: (Date.now() - t0) / 1000,
        usage: emptyUsage(),
        cost: calculateCost('', emptyUsage()),
        searchQueries: queries,
        searchResultCount: 0,
      },
    };
  }

  // --- Passo 1.5: enriquecer com texto completo (raw_content) pra corpo denso.
  //     A busca news+domínios (perfis pt) NÃO retorna raw_content (quirk do
  //     Tavily), só snippet — então extraímos sob demanda os TOP candidatos por
  //     score (rawResults já vem ordenado por score desc) que vieram SEM texto.
  //     en/es e o fallback global já trazem raw_content de graça na busca, então
  //     não pagamos /extract por eles. Limita a itemsMax+5 pra bound de custo
  //     (~0,2 crédito/URL): o LLM seleciona dos mais bem ranqueados de qualquer
  //     forma. Fail-soft: sem texto, o corpo cai pro snippet. ---
  // Extração só nos itens com URL REAL e sem texto ainda. Links-redirect do Google
  // News (RSS) o /extract do Tavily não resolve — ficam de fora (corpo no snippet;
  // Tier 1.5 resolverá o redirect). No modo 'rss' puro, pula tudo.
  const extractCandidates =
    process.env.SKIP_EXTRACT === '1' || searchProvider === 'rss'
      ? []
      : rawResults
          .filter((r) => !r.rawContent && !r.url.includes('news.google.com'))
          .slice(0, janela.itemsMax + 5)
          .map((r) => r.url);
  if (extractCandidates.length > 0) {
    const tExtract = Date.now();
    const extracted = await tavilyExtract(extractCandidates);
    let enriched = 0;
    for (const r of rawResults) {
      const raw = extracted.get(r.url);
      if (raw && !r.rawContent) {
        r.rawContent = raw;
        enriched++;
      }
    }
    console.log(
      `[timing] Tavily extract (${extractCandidates.length} URLs → ${enriched} ok): ${((Date.now() - tExtract) / 1000).toFixed(1)}s | total ${since()}`,
    );
  }

  // --- Passo 2: curadoria via LLM (sem web search). DeepSeek escolhe dos
  //     resultados crus; validamos SÓ os selecionados depois (mais rápido). ---
  const provider = await getProvider(
    process.env.CURATE_LLM_PROVIDER ?? process.env.LLM_PROVIDER,
  );
  const { system, user } = buildCurateFromResultsPrompt(profile, rawResults, locale);
  const tCurate = Date.now();
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: false,
    maxTokens: 8192,
    jsonMode: true,
  });
  console.log(
    `[timing] DeepSeek curate (${provider.model}): ${((Date.now() - tCurate) / 1000).toFixed(1)}s | out=${result.usage.outputTokens}tok | total ${since()}`,
  );
  const elapsedSeconds = (Date.now() - t0) / 1000;
  if (!result.text.trim()) {
    throw new Error('curate: resposta vazia do modelo');
  }
  const briefing = extractJson<Briefing>(result.text);

  // --- Sanitiza o corpo: tira qualquer URL/link que o LLM tenha enfiado no texto
  //     (o link vai num botão separado no template). Trava à prova de LLM. ---
  for (const item of briefing.itens ?? []) {
    if (item?.corpo) item.corpo = sanitizeCorpo(item.corpo);
  }

  // --- Resolução por ÍNDICE (anti-alucinação): o LLM escolhe pelo número [N] do
  //     resultado (id), não copiando URL — isso elimina o erro de copiar URLs
  //     longas (redirects do Google News/RSS) que antes caíam como "alucinadas".
  //     O código resolve id → resultado real e preenche url/fonte/data dali
  //     (ground truth). Item com id inválido é descartado. ---
  const beforeCount = briefing.itens.length;
  briefing.itens = briefing.itens.filter((item) => {
    const id = (item as { id?: number }).id;
    const src =
      typeof id === 'number' && id >= 1 && id <= rawResults.length ? rawResults[id - 1] : undefined;
    if (!src) {
      console.warn(`[curate] item descartado (id inválido: ${JSON.stringify(id)}): "${item.titulo}"`);
      return false;
    }
    item.url = src.url;
    if (src.sourceName) item.fonte = src.sourceName; // fonte real (ex: <source> do RSS)
    if (src.publishedDate) item.data_publicacao = src.publishedDate; // data ground-truth
    delete (item as { id?: number }).id;
    return true;
  });
  const hallucinatedUrlsDropped = beforeCount - briefing.itens.length;

  // --- Dedup DENTRO do briefing: o LLM às vezes repete a mesma matéria (URL
  //     idêntica) ou a mesma notícia por fontes diferentes (título quase igual).
  //     Remove duplicatas mantendo a 1ª. (Era o bug do "artigo repetido".) ---
  const beforeDedup = briefing.itens.length;
  briefing.itens = dedupeItems(briefing.itens);
  const dupDropped = beforeDedup - briefing.itens.length;
  if (dupDropped > 0) {
    console.warn(`[curate] ${dupDropped} item(s) duplicado(s) removido(s) (mesma URL/título no mesmo briefing)`);
  }

  // (A data ground-truth da fonte já foi aplicada na resolução por id acima.
  // Quando a fonte não tem data, mantém a que o LLM inferiu — não anulamos.)

  // --- Frescor: corte estrito (preferência) + degradação graciosa ---
  const fresh0 = filterByFreshness(briefing.itens, janela.cutoffISO);
  const undated = fresh0.undated;
  const { datedFresh, trulyStale, reabsorbed } = reabsorbFromGrace(
    fresh0.datedFresh,
    fresh0.staleDropped,
    { cutoffISO: janela.cutoffISO, cutoffGraceISO: janela.cutoffGraceISO, itemsMin: janela.itemsMin },
  );
  if (reabsorbed.length > 0) {
    console.log(
      `[curate] frescor: ${reabsorbed.length} item(s) reabsorvido(s) da folga (poucos recentes; estrito ${janela.cutoffISO}, folga até ${janela.cutoffGraceISO})`,
    );
  }
  if (trulyStale.length > 0) {
    console.warn(`[curate] ${trulyStale.length} item(s) descartado(s) por frescor (cutoff ${janela.cutoffISO}):`);
    for (const d of trulyStale) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
  }

  // Itens datados-frescos são preferidos; os sem data entram só como PREENCHIMENTO
  // até atingir itemsMin (evita ensaio atemporal dominar a edição, mas mantém
  // recall em dia fraco). Em dia cheio (datados >= itemsMin), os sem data caem.
  //
  // Ordem de exibição: principais por recência, preenchimento-por-área (relevância
  // "Baixa") por último. Sem isso o frescor era keep/drop binário e um item antigo
  // com score alto aparecia acima de uma notícia de hoje. Os sem-data ficam no fim.
  const freshItems = sortForDisplay(datedFresh);
  let undatedKept = 0;
  if (freshItems.length < janela.itemsMin && undated.length > 0) {
    undatedKept = Math.min(janela.itemsMin - freshItems.length, undated.length);
    freshItems.push(...undated.slice(0, undatedKept));
  }
  const undatedDropped = undated.length - undatedKept;
  if (undatedDropped > 0) {
    console.warn(`[curate] ${undatedDropped} item(s) sem data descartado(s) (já havia ${datedFresh.length} datados, itemsMin=${janela.itemsMin})`);
  }

  // --- Validação LENIENTE só dos selecionados (~7, não 32) ---
  // Tavily já garante URL real; só descartamos link genuinamente morto (404/410/
  // DNS/recusado). 403/401/timeout = mantém (site bloqueia bot mas abre no browser).
  const tValidate = Date.now();
  const { kept, deadDropped } = await validateSelectedLeniently(freshItems);
  console.log(
    `[timing] validação leniente (${freshItems.length} links): ${((Date.now() - tValidate) / 1000).toFixed(1)}s | total ${since()}`,
  );
  if (deadDropped.length > 0) {
    console.warn(`[curate] ${deadDropped.length} item(s) descartado(s) por link morto:`);
    for (const d of deadDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason} (${d.item.url})`);
    }
  }

  briefing.itens = kept.map((item) => ({ ...item, urlStatus: 'verified' as const }));

  const cost = calculateCost(provider.model, result.usage);
  console.log(
    `[curate] final: ${briefing.itens.length} item(s) | search→${rawResults.length}, IA selecionou→${beforeCount}, alucinadas→${hallucinatedUrlsDropped}, dup→${dupDropped}, stale→${trulyStale.length}, reabsorvidos→${reabsorbed.length}, sem-data-dropados→${undatedDropped}, link-morto→${deadDropped.length}`,
  );

  return {
    briefing,
    meta: {
      provider: `tavily+${provider.name}`,
      model: provider.model,
      elapsedSeconds,
      usage: result.usage,
      cost,
      searchQueries: queries,
      searchResultCount: rawResults.length,
      ...(hallucinatedUrlsDropped > 0 ? { hallucinatedUrlsDropped } : {}),
    },
  };
}

function emptyUsage(): PipelineUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    toolTokens: 0,
    totalTokens: 0,
    groundingRequests: 0,
  };
}

/**
 * Classifica itens por frescor em três baldes. Roda ANTES da validação de URL.
 *
 *   - data válida (YYYY-MM-DD) dentro da janela → `datedFresh` (preferidos).
 *   - data válida e < cutoffISO → `staleDropped` (antigo confirmado, descartado).
 *   - data ausente/inválida → `undated`. NÃO é descartado aqui, mas também não é
 *     "fresco datado": o chamador o usa só como PREENCHIMENTO quando faltam
 *     datados (evita ensaio atemporal sem data dominar a edição → sensação de
 *     notícia velha), mantendo recall em dia fraco.
 */
export function filterByFreshness(
  items: BriefingItem[],
  cutoffISO: string,
): { datedFresh: BriefingItem[]; undated: BriefingItem[]; staleDropped: DroppedItem[] } {
  const datedFresh: BriefingItem[] = [];
  const undated: BriefingItem[] = [];
  const staleDropped: DroppedItem[] = [];

  for (const item of items) {
    const date = item.data_publicacao;
    // Sem data ou formato inesperado → balde "undated" (preenchimento).
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      undated.push(item);
      continue;
    }
    // Comparação ISO string funciona porque YYYY-MM-DD ordena corretamente.
    if (date < cutoffISO) {
      staleDropped.push({ item, reason: `antigo (publicado em ${date}, cutoff ${cutoffISO})` });
      continue;
    }
    datedFresh.push(item);
  }

  return { datedFresh, undated, staleDropped };
}

/**
 * Degradação graciosa do frescor. O `cutoffISO` (estrito) é a PREFERÊNCIA; se os
 * itens recentes não chegam a `itemsMin`, reabsorve os descartados que estão na
 * janela de folga (entre `cutoffGraceISO` e `cutoffISO`), mais novos primeiro, até
 * o mínimo. Evita email vazio em dia magro sem afrouxar o frescor em dia cheio.
 * Quando `cutoffGraceISO == cutoffISO` (cadências espaçadas) ou já há itens
 * suficientes, não reabsorve nada. Pura: não muta as entradas.
 */
export function reabsorbFromGrace(
  datedFresh: BriefingItem[],
  staleDropped: DroppedItem[],
  opts: { cutoffISO: string; cutoffGraceISO: string; itemsMin: number },
): { datedFresh: BriefingItem[]; trulyStale: DroppedItem[]; reabsorbed: BriefingItem[] } {
  if (datedFresh.length >= opts.itemsMin || opts.cutoffGraceISO >= opts.cutoffISO) {
    return { datedFresh, trulyStale: staleDropped, reabsorbed: [] };
  }
  const reabsorbivel = staleDropped
    .filter((d) => d.item.data_publicacao >= opts.cutoffGraceISO)
    .sort((a, b) => b.item.data_publicacao.localeCompare(a.item.data_publicacao));
  const reabsorbed = reabsorbivel.slice(0, opts.itemsMin - datedFresh.length).map((d) => d.item);
  const set = new Set(reabsorbed);
  return {
    datedFresh: [...datedFresh, ...reabsorbed],
    trulyStale: staleDropped.filter((d) => !set.has(d.item)),
    reabsorbed,
  };
}

/**
 * Ordena itens do mais novo pro mais antigo (preferência por recência).
 * `data_publicacao` é YYYY-MM-DD → comparação lexicográfica = cronológica.
 * Pura/determinística: itens sem data ou malformados afundam pro fim (string
 * vazia/inválida perde no localeCompare). Não muta a entrada.
 */
export function sortByRecencyDesc<T extends { data_publicacao: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) =>
    (b.data_publicacao ?? '').localeCompare(a.data_publicacao ?? ''),
  );
}

/**
 * Ordena os itens pra exibição: principais primeiro (relevância Alta/Média),
 * preenchimento-por-área (relevância "Baixa") POR ÚLTIMO — cada grupo ordenado
 * por recência. O preenchimento entra só quando faltam itens dos tópicos pra
 * chegar ao mínimo (são da área ampla do usuário, coerentes mas secundários).
 */
export function sortForDisplay(itens: BriefingItem[]): BriefingItem[] {
  const main = sortByRecencyDesc(itens.filter((i) => i.relevancia !== 'Baixa'));
  const fill = sortByRecencyDesc(itens.filter((i) => i.relevancia === 'Baixa'));
  return [...main, ...fill];
}

/**
 * Remove qualquer URL/link do corpo. O link é renderizado pelo template num
 * botão separado — o LLM às vezes ainda anexa "Link: https://..." ou a URL solta
 * no fim do texto (apesar da regra no prompt). Trava à prova de LLM: tira linhas
 * rótulo (Link:/URL:/Fonte: http…) + URLs cruas, e limpa as quebras sobrando.
 */
export function sanitizeCorpo(corpo: string): string {
  if (!corpo) return '';
  return corpo
    .replace(/^\s*(link|url|fonte(\s+original)?)\s*:\s*https?:\/\/\S+\s*$/gim, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/^\s*(link|url|fonte)\s*:\s*$/gim, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Monta o email a partir do briefing. NÃO chama LLM — o conteúdo (assunto, intro,
 * corpos na voz final) já veio do generateBriefing. Aqui só renderizamos o
 * template HTML em código (instantâneo, consistente).
 */
export async function generateEmail(
  profile: Profile,
  briefing: Briefing,
  briefingId?: string | null,
): Promise<{ email: EmailOutput; meta: PipelineMeta }> {
  const locale = normalizeLocale(profile.idioma);
  const html = renderEmailHtml(briefing, locale, { briefingId });
  const assuntoFallback = { pt: 'Seu resumo de hoje', en: 'Your briefing today', es: 'Tu resumen de hoy' }[locale];
  const assunto = briefing.assunto?.trim() || assuntoFallback;
  return {
    email: { assunto, html },
    meta: {
      provider: 'template',
      model: '-',
      elapsedSeconds: 0,
      usage: emptyUsage(),
      cost: calculateCost('', emptyUsage()),
    },
  };
}
