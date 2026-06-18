/**
 * Busca via Google News RSS — fonte alternativa ao Tavily (Tier 1 do plano de
 * fontes próprias). Implementa o MESMO contrato `SearchResult[]`, então o
 * pipeline a jusante (anti-alucinação, dedup, frescor, validação) não muda.
 *
 * Por quê: o índice `topic:news` do Tavily NÃO cobre tópicos hiper-específicos /
 * locais (museu X, plataforma de curso Y) — devolve homepage de portal sem data.
 * O Google News RSS é um feed de BUSCA gratuito que devolve notícias recentes
 * DATADAS por query, com boa cobertura BR (medido: 0 datados no Tavily → 15
 * datados on-topic no Google News pra "exposições no MAR").
 *
 * Limitações conhecidas (Tier 1):
 *  - O `link` é um redirect do Google (news.google.com/rss/articles/...), não a
 *    URL final. Funciona pro clique (redireciona), mas a `fonte` vem da tag
 *    <source> (não do domínio) e o /extract do Tavily não roda nesses links —
 *    então o corpo fica limitado ao snippet (resolver URL + extrair = Tier 1.5).
 *  - `<description>` do Google News é curta (≈ título). Sem score de relevância
 *    (ordenamos por data desc).
 */

import { XMLParser } from 'fast-xml-parser';
import type { Locale } from './i18n';
import type { SearchResult } from './search';

const GNEWS_BASE = 'https://news.google.com/rss/search';
const RSS_TIMEOUT_MS = 12000;

/** Parâmetros de idioma/região do Google News por locale. */
const LOCALE_PARAMS: Record<Locale, { hl: string; gl: string; ceid: string }> = {
  pt: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  es: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
};

export interface RssSearchOptions {
  /** Janela de recência em dias → vira o operador `when:Xd` na query. */
  days?: number;
  /** Máximo de itens por query (o feed costuma trazer ~100; cortamos). */
  maxResults?: number;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** RFC-822 (`Wed, 18 Jun 2026 21:30:00 GMT`) → `YYYY-MM-DD`. */
function toYMD(pubDate?: string): string | undefined {
  if (!pubDate) return undefined;
  const t = Date.parse(pubDate);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString().slice(0, 10);
}

/** Extrai o nome do veículo da tag <source> (string ou {#text}). */
function readSource(src: unknown): string | undefined {
  if (!src) return undefined;
  if (typeof src === 'string') return src.trim() || undefined;
  if (typeof src === 'object' && src !== null && '#text' in src) {
    const t = (src as { '#text'?: unknown })['#text'];
    return typeof t === 'string' ? t.trim() || undefined : undefined;
  }
  return undefined;
}

/** Anexa o operador de recência do Google News (`when:Xd`). Idempotente. */
function withWhen(query: string, days: number): string {
  return /\bwhen:\d+d\b/.test(query) ? query : `${query} when:${days}d`;
}

/** Uma busca no Google News RSS. Retorna [] em erro (fail-soft). */
export async function googleNewsSearch(
  query: string,
  opts: RssSearchOptions = {},
  locale: Locale = 'pt',
): Promise<SearchResult[]> {
  const { days = 7, maxResults = 12 } = opts;
  const { hl, gl, ceid } = LOCALE_PARAMS[locale];
  const url =
    `${GNEWS_BASE}?q=${encodeURIComponent(withWhen(query, days))}` +
    `&hl=${hl}&gl=${gl}&ceid=${ceid}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; NewsFlow/1.0)' },
    });
    if (!res.ok) {
      console.warn(`[gnews] HTTP ${res.status} pra query "${query}"`);
      return [];
    }
    const xml = await res.text();
    const parsed = parser.parse(xml) as {
      rss?: { channel?: { item?: unknown } };
    };
    const rawItems = parsed?.rss?.channel?.item;
    const items: Array<Record<string, unknown>> = Array.isArray(rawItems)
      ? (rawItems as Array<Record<string, unknown>>)
      : rawItems
        ? [rawItems as Record<string, unknown>]
        : [];

    const results: SearchResult[] = [];
    for (const it of items.slice(0, maxResults)) {
      const link = typeof it.link === 'string' ? it.link.trim() : '';
      const rawTitle = typeof it.title === 'string' ? it.title.trim() : '';
      if (!link || !rawTitle) continue;
      const source = readSource(it.source);
      // O título vem "Manchete - Veículo"; remove o sufixo da fonte.
      const title = source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3)).trim()
        : rawTitle;
      const description =
        typeof it.description === 'string' ? stripTags(it.description) : '';
      results.push({
        title,
        url: link,
        content: description,
        score: 0, // Google News RSS não dá score — ordenamos por data.
        publishedDate: toYMD(typeof it.pubDate === 'string' ? it.pubDate : undefined),
        sourceName: source,
      });
    }
    return results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[gnews] erro na query "${query}": ${msg}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Roda várias buscas em paralelo, agrega, deduplica por URL e ordena por data
 * (mais novo primeiro — não há score). Mesmo formato de `tavilySearchMany`.
 */
export async function googleNewsSearchMany(
  queries: string[],
  opts: RssSearchOptions = {},
  locale: Locale = 'pt',
): Promise<SearchResult[]> {
  const all = await Promise.all(queries.map((q) => googleNewsSearch(q, opts, locale)));

  const byUrl = new Map<string, SearchResult>();
  for (const list of all) {
    for (const r of list) {
      if (!byUrl.has(r.url)) byUrl.set(r.url, r);
    }
  }

  return [...byUrl.values()].sort((a, b) =>
    (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''),
  );
}
