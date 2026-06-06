import { getProvider, extractJson } from './providers';
import { buildCurateFromResultsPrompt, buildSearchQueries } from '../prompts/curate';
import { calculateCost } from './pricing';
import { validateSelectedLeniently, type DroppedItem } from './url-validation';
import { tavilySearchMany } from './search';
import { renderEmailHtml } from './email-template';
import type { Profile, Briefing, BriefingItem, EmailOutput } from './types';
import { frequenciaParaJanela } from './types';
import { normalizeLocale, type Locale } from './i18n';

/** Domínios de qualidade por idioma. O índice `news` da Tavily é global/inglês
 *  por padrão — pra usuários pt isso devolve esporte/notícia dos EUA em vez de
 *  conteúdo BR. Restringir a fontes locais (include_domains) resolve. en/es
 *  ficam globais por ora (sem lista). */
const DOMAINS_BY_LOCALE: Partial<Record<Locale, string[]>> = {
  pt: [
    // Notícia geral
    'g1.globo.com', 'oglobo.globo.com', 'uol.com.br', 'folha.uol.com.br',
    'estadao.com.br', 'cnnbrasil.com.br', 'terra.com.br', 'metropoles.com',
    'r7.com', 'band.uol.com.br', 'cartacapital.com.br', 'gazetadopovo.com.br',
    'poder360.com.br', 'agenciabrasil.ebc.com.br', 'brasil.elpais.com',
    // Esporte
    'ge.globo.com', 'lance.com.br', 'espn.com.br', 'trivela.com.br',
    // Economia / negócios
    'valor.globo.com', 'exame.com', 'infomoney.com.br', 'braziljournal.com',
    'neofeed.com.br', 'moneytimes.com.br',
    // Tecnologia
    'tecmundo.com.br', 'canaltech.com.br', 'olhardigital.com.br',
    'tecnoblog.net', 'meiobit.com', 'mobiletime.com.br',
    // Ciência / saúde / cultura
    'veja.abril.com.br', 'super.abril.com.br', 'saude.abril.com.br',
    'revistagalileu.globo.com', 'omelete.com.br',
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

/**
 * Gera o briefing em 2 passos:
 *   1. Tavily busca conteúdo REAL e fresco (URLs verdadeiras + datas).
 *   2. DeepSeek (CURATE_LLM_PROVIDER) seleciona e escreve resumos densos —
 *      só pode usar URLs da lista, então não há alucinação de link.
 */
export async function generateBriefing(
  profile: Profile,
): Promise<{ briefing: Briefing; meta: PipelineMeta }> {
  const janela = frequenciaParaJanela(profile.frequencia);
  const locale = normalizeLocale(profile.idioma);
  const t0 = Date.now();
  const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  // --- Passo 1: busca real via Tavily ---
  const queries = buildSearchQueries(profile);
  if (queries.length === 0) {
    throw new Error('curate: nenhuma query de busca derivada do perfil');
  }
  const tTavily = Date.now();
  const rawResults = await tavilySearchMany(queries, {
    days: janela.janelaDias,
    maxResults: 8,
    topic: 'news',
    includeDomains: DOMAINS_BY_LOCALE[locale],
  });
  console.log(
    `[timing] Tavily (${queries.length} queries): ${((Date.now() - tTavily) / 1000).toFixed(1)}s → ${rawResults.length} resultados | total ${since()}`,
  );

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

  // --- Frescor: backstop usando a data que o modelo extraiu ---
  const { freshItems, staleDropped } = filterByFreshness(briefing.itens, janela.cutoffISO);
  if (staleDropped.length > 0) {
    console.warn(`[curate] ${staleDropped.length} item(s) descartado(s) por frescor (cutoff ${janela.cutoffISO}):`);
    for (const d of staleDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
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
    `[curate] final: ${briefing.itens.length} item(s) | search→${rawResults.length}, IA selecionou→${beforeCount}, alucinadas→${hallucinatedUrlsDropped}, stale→${staleDropped.length}, link-morto→${deadDropped.length}`,
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
 * Filtra itens por frescor — descarta os que estão fora da janela ou sem data.
 * Roda ANTES da validação de URL (não vale gastar requests HTTP em conteúdo velho).
 *
 * Critérios pra descarte:
 *   - data_publicacao ausente ou inválida
 *   - data_publicacao < cutoffISO (mais antiga que o limite máximo)
 */
function filterByFreshness(
  items: BriefingItem[],
  cutoffISO: string,
): { freshItems: BriefingItem[]; staleDropped: DroppedItem[] } {
  const freshItems: BriefingItem[] = [];
  const staleDropped: DroppedItem[] = [];

  for (const item of items) {
    const date = item.data_publicacao;
    if (!date || typeof date !== 'string') {
      staleDropped.push({ item, reason: 'sem data_publicacao' });
      continue;
    }
    // Validação básica de formato YYYY-MM-DD (não checagem rigorosa)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      staleDropped.push({ item, reason: `data inválida: "${date}"` });
      continue;
    }
    // Comparação ISO string funciona porque YYYY-MM-DD ordena corretamente
    if (date < cutoffISO) {
      staleDropped.push({ item, reason: `antigo (publicado em ${date}, cutoff ${cutoffISO})` });
      continue;
    }
    freshItems.push(item);
  }

  return { freshItems, staleDropped };
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
