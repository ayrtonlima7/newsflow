/**
 * Busca via Serper (Google News). Fonte PRINCIPAL de busca (substitui o Tavily
 * nesse papel) — decisão tomada após teste comparativo real (12/ago/2026): nas
 * queries reais de um usuário broad (IA/eng. software), o Tavily devolveu 0%
 * dos resultados com data (0/23 itens) enquanto o Serper devolveu ~100% (24/24,
 * exceto 1 query sem match). O Serper também devolve URL REAL (não redirect do
 * Google como o RSS) — confirmado que o `/extract` do Tavily funciona nessas
 * URLs (5/5 extraídos), o que destrava corpo denso pra qualquer fonte, não só
 * pra quem o Tavily já indexava. Implementa o MESMO contrato `SearchResult[]`
 * do restante do pipeline (anti-alucinação, dedup, frescor, validação).
 *
 * Tavily não é removido: mantém o `/extract` (search.ts) e vira fallback de
 * resiliência se Serper+RSS vierem muito pouco (ver pipeline.ts).
 */

import type { Locale } from './i18n';
import type { SearchResult } from './search';

const SERPER_NEWS_ENDPOINT = 'https://google.serper.dev/news';
const SEARCH_TIMEOUT_MS = 15000;

/** Região/idioma do Google por locale (gl = país, hl = idioma). */
const LOCALE_PARAMS: Record<Locale, { gl: string; hl: string }> = {
  pt: { gl: 'br', hl: 'pt-br' },
  en: { gl: 'us', hl: 'en' },
  es: { gl: 'mx', hl: 'es' },
};

export interface SerperSearchOptions {
  /** Janela de recência em dias → mapeada pro operador `tbs` do Google. */
  days?: number;
  /** Máximo de itens por query. */
  maxResults?: number;
}

interface SerperNewsItem {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  source?: string;
  position?: number;
}

interface SerperNewsResponse {
  news?: SerperNewsItem[];
}

/**
 * Converte a data relativa do Serper ("há 23 horas", "2 dias atrás", "hace 3
 * días", "3 days ago", "ontem"/"yesterday"/"ayer") pra YYYY-MM-DD. Suporta
 * pt/en/es (os 3 idiomas do produto — Serper responde no idioma do `hl`).
 * `now` é injetável pra teste. Retorna undefined se não reconhecer o formato
 * (cai pro fallback de `Date.parse` pra datas absolutas; se nada bater, undefined
 * — o item vira "sem-data" no pipeline, nunca inventamos).
 */
export function parseSerperDate(raw: string | undefined, now: Date = new Date()): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();

  if (/^(hoje|today|hoy)$/.test(s)) return now.toISOString().slice(0, 10);
  if (/^(ontem|yesterday|ayer)$/.test(s)) {
    return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  }

  const UNIT_MS: Record<string, number> = {
    minuto: 60_000, minutos: 60_000, minute: 60_000, minutes: 60_000,
    hora: 3_600_000, horas: 3_600_000, hour: 3_600_000, hours: 3_600_000,
    dia: 86_400_000, dias: 86_400_000, día: 86_400_000, días: 86_400_000, day: 86_400_000, days: 86_400_000,
    semana: 604_800_000, semanas: 604_800_000, week: 604_800_000, weeks: 604_800_000,
    mes: 2_592_000_000, meses: 2_592_000_000, mês: 2_592_000_000, month: 2_592_000_000, months: 2_592_000_000,
    ano: 31_536_000_000, anos: 31_536_000_000, año: 31_536_000_000, años: 31_536_000_000,
    year: 31_536_000_000, years: 31_536_000_000,
  };

  // pt "há X unidade(s)" | es "hace X unidad(es)" | en/pt "X unidade(s) atrás/ago"
  const m =
    s.match(/^h[áa]\s+(\d+)\s+([a-zçãéêíóõú]+)/i) ??
    s.match(/^hace\s+(\d+)\s+([a-zñáéíóú]+)/i) ??
    s.match(/^(\d+)\s+([a-zà-ú]+)\s+atr[áa]s$/i) ??
    s.match(/^(\d+)\s+([a-z]+)\s+ago$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const ms = UNIT_MS[m[2]];
    if (ms) return new Date(now.getTime() - n * ms).toISOString().slice(0, 10);
  }

  // Fallback: data absoluta (formato raro, ex: "12 Aug 2026").
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return undefined;
}

/** Anexa o operador de recência do Google (`tbs=qdr:X`). */
function daysToTbs(days: number): string {
  if (days <= 1) return 'qdr:d';
  if (days <= 7) return 'qdr:w';
  if (days <= 31) return 'qdr:m';
  return 'qdr:y';
}

/** Uma busca no Serper (endpoint /news). Retorna [] em erro (fail-soft). */
export async function serperSearch(
  query: string,
  opts: SerperSearchOptions = {},
  locale: Locale = 'pt',
): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn('[serper] SERPER_API_KEY ausente — busca pulada');
    return [];
  }
  const { days = 7, maxResults = 10 } = opts;
  const { gl, hl } = LOCALE_PARAMS[locale];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(SERPER_NEWS_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'X-API-KEY': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ q: query, gl, hl, tbs: daysToTbs(days), num: maxResults }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[serper] HTTP ${res.status} pra query "${query}": ${text.slice(0, 200)}`);
      return [];
    }
    const data = (await res.json()) as SerperNewsResponse;
    const items = data.news ?? [];
    const now = new Date();

    return items
      .filter((it) => it.link && it.title)
      .map((it, i) => ({
        title: it.title!.trim(),
        url: it.link!.trim(),
        content: (it.snippet ?? '').trim(),
        // Sem score nativo — posição inversa (1º resultado = mais relevante).
        score: 1 - (it.position ?? i) / (maxResults + 1),
        publishedDate: parseSerperDate(it.date, now),
        sourceName: it.source?.trim(),
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[serper] erro na query "${query}": ${msg}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Roda várias buscas em paralelo, agrega e deduplica por URL (mantém o de maior
 * score). Ordena por score desc — mesmo formato de `tavilySearchMany`.
 */
export async function serperSearchMany(
  queries: string[],
  opts: SerperSearchOptions = {},
  locale: Locale = 'pt',
): Promise<SearchResult[]> {
  const all = await Promise.all(queries.map((q) => serperSearch(q, opts, locale)));

  const byUrl = new Map<string, SearchResult>();
  for (const list of all) {
    for (const r of list) {
      const existing = byUrl.get(r.url);
      if (!existing || r.score > existing.score) byUrl.set(r.url, r);
    }
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}
