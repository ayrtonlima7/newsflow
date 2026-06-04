/**
 * Busca web via Tavily. Substitui o googleSearch nativo do Gemini no curate.
 *
 * Por que Tavily: retorna resultados REAIS (URL + data + snippet) já ranqueados
 * pra consumo por LLM. Isso resolve dois problemas de uma vez:
 *   1. Alucinação de URL — os links vêm do índice da Tavily, não do LLM.
 *   2. Frescor — `topic: news` + `days` filtram por data publicada.
 */

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const SEARCH_TIMEOUT_MS = 15000;

export interface SearchResult {
  title: string;
  url: string;
  /** Snippet/conteúdo retornado pela Tavily. */
  content: string;
  /** Score de relevância (0-1) da Tavily. */
  score: number;
  /** Data de publicação YYYY-MM-DD, quando disponível (topic=news). */
  publishedDate?: string;
}

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyRawResult[];
}

export interface TavilySearchOptions {
  /** Quantos dias atrás buscar (topic=news). Casa com a janela de frescor. */
  days?: number;
  /** Máximo de resultados por query. */
  maxResults?: number;
  /** "news" (com published_date) ou "general". Default: news. */
  topic?: 'news' | 'general';
}

/** Normaliza published_date da Tavily (pode vir ISO completo) pra YYYY-MM-DD. */
function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

/** Executa UMA busca na Tavily. Retorna [] em caso de erro (fail-soft). */
export async function tavilySearch(
  query: string,
  opts: TavilySearchOptions = {},
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[tavily] TAVILY_API_KEY ausente — busca pulada');
    return [];
  }

  const { days = 7, maxResults = 8, topic = 'news' } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      query,
      topic,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    };
    // `days` só é válido pra topic=news
    if (topic === 'news') body.days = days;

    const res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[tavily] HTTP ${res.status} pra query "${query}": ${text.slice(0, 200)}`);
      return [];
    }

    const data = (await res.json()) as TavilyResponse;
    const results = data.results ?? [];

    return results
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: r.title!.trim(),
        url: r.url!.trim(),
        content: (r.content ?? '').trim(),
        score: typeof r.score === 'number' ? r.score : 0,
        publishedDate: normalizeDate(r.published_date),
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tavily] erro na query "${query}": ${msg}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Roda várias buscas (uma por query) em paralelo, agrega e deduplica por URL.
 * Mantém o resultado de maior score quando há URL duplicada.
 */
export async function tavilySearchMany(
  queries: string[],
  opts: TavilySearchOptions = {},
): Promise<SearchResult[]> {
  const all = await Promise.all(queries.map((q) => tavilySearch(q, opts)));

  const byUrl = new Map<string, SearchResult>();
  for (const list of all) {
    for (const r of list) {
      const existing = byUrl.get(r.url);
      if (!existing || r.score > existing.score) {
        byUrl.set(r.url, r);
      }
    }
  }

  // Ordena por score desc
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}
