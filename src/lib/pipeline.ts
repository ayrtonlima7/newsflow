import { getProvider, extractJson } from './providers';
import { buildCurateFromResultsPrompt, buildSearchQueries } from '../prompts/curate';
import { buildEmailPrompt } from '../prompts/email';
import { calculateCost } from './pricing';
import { filterReachableResults, type DroppedItem } from './url-validation';
import { tavilySearchMany } from './search';
import type { Profile, Briefing, BriefingItem, EmailOutput } from './types';
import { frequenciaParaJanela } from './types';

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
  reachableResultCount?: number;
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
  const t0 = Date.now();

  // --- Passo 1: busca real via Tavily ---
  const queries = buildSearchQueries(profile);
  if (queries.length === 0) {
    throw new Error('curate: nenhuma query de busca derivada do perfil');
  }
  const rawResults = await tavilySearchMany(queries, {
    days: janela.janelaDias,
    maxResults: 8,
    topic: 'news',
  });
  console.log(
    `[curate] Tavily: ${queries.length} query(s) → ${rawResults.length} resultado(s) único(s)`,
  );

  // --- Passo 1.5: valida que os links ABREM (UA de browser) ANTES de curar ---
  // Com abundância de resultados, descartamos os quebrados em vez de degradar.
  // Assim o LLM só escolhe URLs que funcionam de verdade.
  const { reachable: searchResults, droppedCount: unreachableDropped } =
    await filterReachableResults(rawResults);
  if (unreachableDropped > 0) {
    console.log(
      `[curate] validação de links: ${unreachableDropped}/${rawResults.length} descartado(s) por não abrir; ${searchResults.length} ok`,
    );
  }

  if (searchResults.length === 0) {
    // Sem resultados acessíveis — retorna briefing vazio (delivery vira skipped_empty).
    return {
      briefing: { data_referencia: janela.todayISO, itens: [] },
      meta: {
        provider: 'tavily+none',
        model: '-',
        elapsedSeconds: (Date.now() - t0) / 1000,
        usage: emptyUsage(),
        cost: calculateCost('', emptyUsage()),
        searchQueries: queries,
        searchResultCount: rawResults.length,
        reachableResultCount: 0,
      },
    };
  }

  // --- Passo 2: curadoria via LLM (sem web search) ---
  const provider = await getProvider(
    process.env.CURATE_LLM_PROVIDER ?? process.env.LLM_PROVIDER,
  );
  const { system, user } = buildCurateFromResultsPrompt(profile, searchResults);
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: false,
    maxTokens: 8192,
    jsonMode: true,
  });
  const elapsedSeconds = (Date.now() - t0) / 1000;
  if (!result.text.trim()) {
    throw new Error('curate: resposta vazia do modelo');
  }
  const briefing = extractJson<Briefing>(result.text);

  // --- Garantia anti-alucinação: só aceita itens com URL presente nos resultados ---
  const allowedUrls = new Set(searchResults.map((r) => r.url));
  const beforeCount = briefing.itens.length;
  briefing.itens = briefing.itens.filter((item) => {
    if (allowedUrls.has(item.url)) return true;
    console.warn(`[curate] item descartado (URL inventada, fora dos resultados): "${item.titulo}" → ${item.url}`);
    return false;
  });
  const hallucinatedUrlsDropped = beforeCount - briefing.itens.length;

  // --- Frescor: backstop usando a data que o modelo extraiu ---
  // (URLs já foram validadas ANTES da curadoria, então não há validação HTTP aqui.
  //  Todos os itens vêm de resultados que abrem de verdade.)
  const { freshItems, staleDropped } = filterByFreshness(briefing.itens, janela.cutoffISO);
  if (staleDropped.length > 0) {
    console.warn(`[curate] ${staleDropped.length} item(s) descartado(s) por frescor (cutoff ${janela.cutoffISO}):`);
    for (const d of staleDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
  }

  // Marca todos como verified (já validados upfront) pra o email renderizar link normal
  briefing.itens = freshItems.map((item) => ({ ...item, urlStatus: 'verified' as const }));

  const cost = calculateCost(provider.model, result.usage);
  console.log(
    `[curate] final: ${briefing.itens.length} item(s) | search→${rawResults.length}, reachable→${searchResults.length}, IA selecionou→${beforeCount}, alucinadas→${hallucinatedUrlsDropped}, stale→${staleDropped.length}`,
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
      reachableResultCount: searchResults.length,
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

export async function generateEmail(
  profile: Profile,
  briefing: Briefing,
): Promise<{ email: EmailOutput; meta: PipelineMeta }> {
  // Provider do email (default = LLM_PROVIDER).
  const provider = await getProvider(
    process.env.EMAIL_LLM_PROVIDER ?? process.env.LLM_PROVIDER,
  );
  const { system, user } = buildEmailPrompt(profile, briefing);
  const t0 = Date.now();
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: false,
    maxTokens: 8192,
    jsonMode: true,
  });
  const elapsedSeconds = (Date.now() - t0) / 1000;
  if (!result.text.trim()) {
    throw new Error('email: resposta vazia do modelo');
  }
  const email = extractJson<EmailOutput>(result.text);
  const cost = calculateCost(provider.model, result.usage);
  return {
    email,
    meta: {
      provider: provider.name,
      model: provider.model,
      elapsedSeconds,
      usage: result.usage,
      cost,
    },
  };
}
