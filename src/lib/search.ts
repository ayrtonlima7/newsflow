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
  /** Texto completo extraído da página (include_raw_content). Mais "sujo" que o
   *  `content` (que é resumo NLP), mas é a matéria-prima pro corpo denso. Vem de
   *  graça na busca (não custa crédito extra) — mas nem todo site preenche
   *  (paywall/bloqueio → undefined). */
  rawContent?: string;
}

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
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
  /** Restringe a busca a estes domínios. Usado pra enviesar por país/idioma
   *  (ex: domínios brasileiros pra usuários pt) — o índice news da Tavily é
   *  global/inglês por padrão e devolve lixo pra temas locais. */
  includeDomains?: string[];
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

  const { days = 7, maxResults = 8, topic = 'news', includeDomains } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      query,
      topic,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: false,
      // Texto completo da página vem junto SEM custo extra de crédito (o custo é
      // só do search_depth). Alimenta o corpo denso; o `content` (resumo NLP)
      // continua sendo o sinal limpo pra seleção. Nem todo site preenche.
      include_raw_content: true,
    };
    // `days` só é válido pra topic=news
    if (topic === 'news') body.days = days;
    if (includeDomains && includeDomains.length > 0) body.include_domains = includeDomains;

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
        rawContent: (r.raw_content ?? '').trim() || undefined,
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

const TAVILY_EXTRACT_ENDPOINT = 'https://api.tavily.com/extract';
const EXTRACT_TIMEOUT_MS = 15000;

/**
 * Extrai o texto completo de uma lista de URLs via endpoint /extract da Tavily.
 *
 * Por quê: a busca `topic:news` + `include_domains` (usada pra perfis pt) NÃO
 * retorna `raw_content` (quirk do Tavily) — só metadados + snippet. O /extract
 * recupera o texto real sob demanda. Custo: 0,2 crédito por URL (basic), só cobra
 * extração bem-sucedida. Aceita até 20 URLs por chamada — fazemos em lotes de 20.
 *
 * Fail-soft: erro/timeout devolve o que já deu certo (Map vazio no pior caso) —
 * o corpo cai pro snippet, nunca derruba a curadoria.
 */
export async function tavilyExtract(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || urls.length === 0) return out;

  const BATCH = 20;
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
    try {
      const res = await fetch(TAVILY_EXTRACT_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ urls: batch, extract_depth: 'basic', include_images: false }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`[tavily-extract] HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }
      const data = (await res.json()) as {
        results?: Array<{ url?: string; raw_content?: string }>;
      };
      for (const r of data.results ?? []) {
        const content = (r.raw_content ?? '').trim();
        if (r.url && content) out.set(r.url.trim(), content);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tavily-extract] erro no lote: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}
