import { getProvider, extractJson } from './providers';
import { buildCurateFromResultsPrompt, buildSearchQueries } from '../prompts/curate';
import { calculateCost } from './pricing';
import { validateSelectedLeniently, type DroppedItem } from './url-validation';
import { tavilySearchMany } from './search';
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

  // --- Passo 1: busca real via Tavily ---
  const queries = buildSearchQueries(profile, locale);
  if (queries.length === 0) {
    throw new Error('curate: nenhuma query de busca derivada do perfil');
  }
  const tTavily = Date.now();
  let rawResults = await tavilySearchMany(queries, {
    days: janela.janelaDias,
    maxResults: 8,
    topic: 'news',
    includeDomains: resolveDomains(profile, locale),
  });
  console.log(
    `[timing] Tavily (${queries.length} queries): ${((Date.now() - tTavily) / 1000).toFixed(1)}s → ${rawResults.length} resultados | total ${since()}`,
  );

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

  // --- Garantia anti-alucinação: só aceita itens com URL presente nos resultados ---
  const allowedUrls = new Set(rawResults.map((r) => r.url));
  const beforeCount = briefing.itens.length;
  briefing.itens = briefing.itens.filter((item) => {
    if (allowedUrls.has(item.url)) return true;
    console.warn(`[curate] item descartado (URL inventada, fora dos resultados): "${item.titulo}" → ${item.url}`);
    return false;
  });
  const hallucinatedUrlsDropped = beforeCount - briefing.itens.length;

  // --- Cross-validação de datas contra os resultados Tavily (ground truth) ---
  // Quando o Tavily tem published_date, ELA é a verdade — sobrescreve a data que
  // o LLM extraiu (que pode estar errada). Quando o Tavily NÃO tem data, deixamos
  // como está: NÃO anulamos nem descartamos. O item veio de uma busca de NOTÍCIA
  // limitada por `days` (Tavily já restringiu por janela), e dropar por "sem data"
  // eliminava justamente as matérias frescas sem carimbo — era a causa do briefing
  // vir quase vazio. (Itens genuinamente antigos costumam VIR com data no Tavily e
  // caem no corte de frescor abaixo.)
  const tavilyDateByUrl = new Map(
    rawResults.filter((r) => r.publishedDate).map((r) => [r.url, r.publishedDate as string]),
  );
  for (const item of briefing.itens) {
    const realDate = tavilyDateByUrl.get(item.url);
    if (realDate && item.data_publicacao !== realDate) {
      console.warn(
        `[curate] data corrigida (LLM: "${item.data_publicacao}" → Tavily: "${realDate}"): "${item.titulo}"`,
      );
      item.data_publicacao = realDate;
    }
  }

  // --- Frescor: backstop usando a data que o modelo extraiu ---
  const { datedFresh, undated, staleDropped } = filterByFreshness(briefing.itens, janela.cutoffISO);
  if (staleDropped.length > 0) {
    console.warn(`[curate] ${staleDropped.length} item(s) descartado(s) por frescor (cutoff ${janela.cutoffISO}):`);
    for (const d of staleDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
  }

  // Itens datados-frescos são preferidos; os sem data entram só como PREENCHIMENTO
  // até atingir itemsMin (evita ensaio atemporal dominar a edição, mas mantém
  // recall em dia fraco). Em dia cheio (datados >= itemsMin), os sem data caem.
  const freshItems = [...datedFresh];
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
    `[curate] final: ${briefing.itens.length} item(s) | search→${rawResults.length}, IA selecionou→${beforeCount}, alucinadas→${hallucinatedUrlsDropped}, stale→${staleDropped.length}, sem-data-dropados→${undatedDropped}, link-morto→${deadDropped.length}`,
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
 * Monta o email a partir do briefing. NÃO chama LLM — o conteúdo (assunto, intro,
 * corpos na voz final) já veio do generateBriefing. Aqui só renderizamos o
 * template HTML em código (instantâneo, consistente).
 */
export async function generateEmail(
  profile: Profile,
  briefing: Briefing,
): Promise<{ email: EmailOutput; meta: PipelineMeta }> {
  const locale = normalizeLocale(profile.idioma);
  const html = renderEmailHtml(briefing, locale);
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
