import type { BriefingItem } from './types';
import type { Citation } from './providers';

/** Limiar de similaridade de título pra considerar match.
 *  0.5 = leniente o suficiente pra tolerar paráfrase do modelo, restrito o
 *  suficiente pra não confundir artigos diferentes. */
const TITLE_SIMILARITY_THRESHOLD = 0.5;

const RESOLVE_TIMEOUT_MS = 5000;
const USER_AGENT = 'Mozilla/5.0 (compatible; NewsFlowBot/1.0)';

export interface RecoveryStats {
  /** Quantos itens tiveram URL substituída por uma citation. */
  recovered: number;
  /** Quantos itens ficaram com URL original (sem match nas citations). */
  unchanged: number;
}

export interface RecoveryResult {
  recoveredItems: BriefingItem[];
  stats: RecoveryStats;
}

/** Normaliza string pra comparação: lowercase, remove acentos, remove pontuação. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ');
}

/** Tokeniza string em conjunto de palavras significativas (3+ chars). */
function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/** Similaridade Jaccard entre 2 títulos (interseção / união de tokens). */
function titleSimilarity(a: string, b: string): number {
  const aT = tokens(a);
  const bT = tokens(b);
  if (aT.size === 0 || bT.size === 0) return 0;
  const intersect = new Set([...aT].filter((t) => bT.has(t)));
  const union = new Set([...aT, ...bT]);
  return intersect.size / union.size;
}

/** Mesmo host (ignora www. e portas). */
function sameDomain(url1: string, url2: string): boolean {
  try {
    const h1 = new URL(url1).hostname.toLowerCase().replace(/^www\./, '');
    const h2 = new URL(url2).hostname.toLowerCase().replace(/^www\./, '');
    return h1 === h2;
  } catch {
    return false;
  }
}

/** Segue redirects pra obter a URL canônica. Útil pras citations do Vertex AI
 *  que vêm como redirect URLs (`vertexaisearch.cloud.google.com/...`). */
async function resolveCitationUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT },
    });
    return res.url; // URL final depois de seguir todos os redirects
  } catch {
    return url; // fallback pra original se falhar
  } finally {
    clearTimeout(timer);
  }
}

/** Encontra a citation com maior similaridade de título e mesmo domínio. */
function findBestMatch(item: BriefingItem, citations: Citation[]): Citation | null {
  let best: { citation: Citation; score: number } | null = null;

  for (const c of citations) {
    if (!c.title) continue;
    if (!sameDomain(item.url, c.url)) continue;

    const score = titleSimilarity(item.titulo, c.title);
    if (score >= TITLE_SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { citation: c, score };
    }
  }

  return best?.citation ?? null;
}

/**
 * Recupera URLs reais dos resultados de busca (grounding) quando o modelo
 * gerou URLs alucinadas mas o conteúdo é fiel.
 *
 * Estratégia: pra cada item do briefing, casa por título + domínio contra
 * as citations. Se achar match com similaridade ≥ 0.5, substitui a URL pela
 * URL canônica da citation (após resolver redirects do Vertex AI).
 *
 * Casos típicos que isso resolve:
 *  - Modelo viu artigo em /post/slug mas escreveu /esports/slug (chute de padrão)
 *  - Modelo paraphraseou levemente o título mas o conteúdo é fiel
 *  - URL com path errado mas mesmo domínio
 */
export async function recoverUrlsFromGrounding(
  items: BriefingItem[],
  citations: Citation[],
): Promise<RecoveryResult> {
  if (citations.length === 0 || items.length === 0) {
    return {
      recoveredItems: items,
      stats: { recovered: 0, unchanged: items.length },
    };
  }

  // Resolve TODAS as citation URLs em paralelo (HEAD seguindo redirects).
  // Custo: ~N HEAD requests, ~500ms total na média.
  const resolved = await Promise.all(
    citations.map(async (c) => ({
      ...c,
      url: await resolveCitationUrl(c.url),
    })),
  );

  let recovered = 0;
  const recoveredItems = items.map((item) => {
    const match = findBestMatch(item, resolved);
    if (match && match.url !== item.url) {
      recovered++;
      return {
        ...item,
        url: match.url,
        urlOriginal: item.url,
      };
    }
    return item;
  });

  return {
    recoveredItems,
    stats: { recovered, unchanged: items.length - recovered },
  };
}
