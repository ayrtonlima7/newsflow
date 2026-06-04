import type { BriefingItem, UrlStatus } from './types';
import type { SearchResult } from './search';

export interface DroppedItem {
  item: BriefingItem;
  reason: string;
}

export interface DegradedItem {
  item: BriefingItem;
  reason: string;
}

export interface ValidationReport {
  /** Itens que passaram a validação (verified, fallback ou source-only). Já com `urlStatus` setado. */
  validItems: BriefingItem[];
  /** Itens descartados — URL malformada, placeholder, plataforma específica confirmou que não existe, ou nada funcionou. */
  droppedItems: DroppedItem[];
  /** Itens que sobreviveram mas com degradação (fallback ou source-only). Útil pra log e meta. */
  degradedItems: DegradedItem[];
}

const PLACEHOLDER_PATTERN =
  /\b(your[_-]?video[_-]?id|your[_-]?id|example\.com|placeholder|TODO|FIXME|\.\.\.+|\[ID\])\b/i;

// UA de browser real — sites como AOL/grandes portais recusam UAs de bot.
// Validar com UA real reduz falso-positivo (passa na validação mas não abre).
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { method: 'HEAD' | 'GET' },
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface UrlCheckResult {
  /** false = drop. true = manter (talvez degradado). */
  ok: boolean;
  /** Status final. Só faz sentido quando ok=true. */
  status: UrlStatus;
  /** URL final a usar no email. Pode ser igual à original, parent ou origin. */
  finalUrl: string;
  /** Motivo da degradação ou descarte (pra log). */
  reason: string;
}

/** Tenta a URL exata. Para Reddit/YouTube/HN, usa API content-aware. */
async function checkExact(
  parsed: URL,
): Promise<{ ok: boolean; reason: string }> {
  const url = parsed.toString();
  const host = parsed.host.toLowerCase().replace(/^www\./, '');

  if (host === 'reddit.com' || host === 'old.reddit.com' || host === 'new.reddit.com') {
    return validateReddit(url);
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    return validateYoutube(url);
  }
  if (host === 'news.ycombinator.com') {
    return validateHackerNews(parsed);
  }
  return validateGeneric(url);
}

/** Detecta se host é plataforma de conteúdo específico (Reddit, YouTube, HN).
 *  Pra esses, falha = drop direto (post inexistente = alucinação confirmada). */
function isContentSpecificHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return (
    h === 'reddit.com' ||
    h === 'old.reddit.com' ||
    h === 'new.reddit.com' ||
    h === 'youtube.com' ||
    h === 'm.youtube.com' ||
    h === 'youtu.be' ||
    h === 'news.ycombinator.com'
  );
}

function getParentUrl(parsed: URL): string | null {
  const segs = parsed.pathname.split('/').filter(Boolean);
  if (segs.length <= 1) return null; // já é raiz ou só 1 nível
  segs.pop();
  return `${parsed.origin}/${segs.join('/')}/`;
}

async function checkUrlGracefully(url: string): Promise<UrlCheckResult> {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, status: 'verified', finalUrl: '', reason: 'URL vazia' };
  }
  if (PLACEHOLDER_PATTERN.test(url)) {
    return { ok: false, status: 'verified', finalUrl: '', reason: 'URL contém placeholder/template' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 'verified', finalUrl: '', reason: 'URL malformada' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 'verified', finalUrl: '', reason: `protocolo inválido: ${parsed.protocol}` };
  }

  // 1. Tenta URL exata
  const exactResult = await checkExact(parsed);
  if (exactResult.ok) {
    return { ok: true, status: 'verified', finalUrl: url, reason: '' };
  }

  // Pra plataformas específicas (Reddit/YouTube/HN), se a API negou existência:
  // o item foi alucinado, não tem como degradar. Drop direto.
  if (isContentSpecificHost(parsed.host)) {
    return {
      ok: false,
      status: 'verified',
      finalUrl: '',
      reason: `${parsed.host}: ${exactResult.reason} (alucinação confirmada pela API)`,
    };
  }

  // 2. Tenta parent URL (degrada pra fallback)
  const parentUrl = getParentUrl(parsed);
  if (parentUrl && parentUrl !== `${parsed.origin}/`) {
    try {
      const parentParsed = new URL(parentUrl);
      const parentResult = await checkExact(parentParsed);
      if (parentResult.ok) {
        return {
          ok: true,
          status: 'fallback',
          finalUrl: parentUrl,
          reason: `URL específica falhou (${exactResult.reason}); usando parent`,
        };
      }
    } catch {
      // ignora, vai pro próximo nível
    }
  }

  // 3. Tenta a origem (degrada pra source-only)
  const originUrl = `${parsed.origin}/`;
  try {
    const originParsed = new URL(originUrl);
    const originResult = await checkExact(originParsed);
    if (originResult.ok) {
      return {
        ok: true,
        status: 'source-only',
        finalUrl: originUrl,
        reason: `URL e parent falharam (${exactResult.reason}); usando origin como source-only`,
      };
    }
  } catch {
    // ignora
  }

  // 4. Tudo falhou — drop
  return {
    ok: false,
    status: 'verified',
    finalUrl: '',
    reason: `nada resolveu: ${exactResult.reason}`,
  };
}

async function validateGeneric(url: string): Promise<{ ok: boolean; reason: string }> {
  try {
    const head = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (head.status >= 200 && head.status < 400) return { ok: true, reason: '' };
    if (head.status === 405 || head.status === 403 || head.status === 501) {
      return await validateWithGet(url);
    }
    return { ok: false, reason: `HTTP ${head.status}` };
  } catch (err) {
    return await validateWithGet(url, err);
  }
}

async function validateWithGet(
  url: string,
  prevErr?: unknown,
): Promise<{ ok: boolean; reason: string }> {
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,*/*',
        range: 'bytes=0-2048',
      },
    });
    if (res.status >= 200 && res.status < 400) return { ok: true, reason: '' };
    return { ok: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const prev = prevErr instanceof Error ? prevErr.message : prevErr ? String(prevErr) : null;
    return {
      ok: false,
      reason: prev ? `inacessível (HEAD: ${prev}; GET: ${msg})` : `inacessível: ${msg}`,
    };
  }
}

async function validateReddit(url: string): Promise<{ ok: boolean; reason: string }> {
  const postMatch = url.match(/reddit\.com\/r\/([^/?#]+)\/comments\/([^/?#]+)/i);
  if (postMatch) {
    const [, sub, id] = postMatch;
    try {
      const apiUrl = `https://www.reddit.com/r/${sub}/comments/${id}.json?limit=1&raw_json=1`;
      const res = await fetchWithTimeout(apiUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      });
      if (!res.ok) return { ok: false, reason: `Reddit API HTTP ${res.status}` };
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, reason: 'Reddit post não encontrado (resposta vazia)' };
      }
      const listing = data[0] as { data?: { children?: unknown[] } };
      const children = listing?.data?.children;
      if (!Array.isArray(children) || children.length === 0) {
        return { ok: false, reason: 'Reddit post não existe (listing vazio)' };
      }
      return { ok: true, reason: '' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `Reddit check falhou: ${msg}` };
    }
  }
  return validateGeneric(url);
}

async function validateYoutube(url: string): Promise<{ ok: boolean; reason: string }> {
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetchWithTimeout(oembed, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (res.status === 200) return { ok: true, reason: '' };
    if (res.status === 401 || res.status === 404) {
      return { ok: false, reason: 'YouTube vídeo não existe ou é privado' };
    }
    return { ok: false, reason: `YouTube oEmbed HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `YouTube check falhou: ${msg}` };
  }
}

async function validateHackerNews(parsed: URL): Promise<{ ok: boolean; reason: string }> {
  const id = parsed.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return validateGeneric(parsed.toString());
  }
  try {
    const apiUrl = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
    const res = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, reason: `HN API HTTP ${res.status}` };
    const data = (await res.json()) as unknown;
    if (data === null) return { ok: false, reason: 'HN item não existe' };
    return { ok: true, reason: '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `HN check falhou: ${msg}` };
  }
}

/**
 * Filtra resultados da Tavily deixando só os que ABREM de verdade num browser.
 * Usado ANTES de mandar pro LLM curar — assim o modelo só escolhe URLs que
 * funcionam, e não precisamos de degradação (com 32 resultados, dá pra ser
 * exigente e descartar os quebrados).
 *
 * Faz HEAD com UA de browser; se 405/403/501, tenta GET parcial. Qualquer
 * 2xx/3xx = ok. Resto = descarta.
 */
export async function filterReachableResults(
  results: SearchResult[],
): Promise<{ reachable: SearchResult[]; droppedCount: number }> {
  const checks = await Promise.all(
    results.map(async (r) => {
      if (PLACEHOLDER_PATTERN.test(r.url)) return false;
      try {
        const parsed = new URL(r.url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        const check = await validateGeneric(r.url);
        return check.ok;
      } catch {
        return false;
      }
    }),
  );

  const reachable = results.filter((_, i) => checks[i]);
  return { reachable, droppedCount: results.length - reachable.length };
}

export async function validateBriefingUrls(items: BriefingItem[]): Promise<ValidationReport> {
  const checks = await Promise.all(items.map((i) => checkUrlGracefully(i.url)));

  const validItems: BriefingItem[] = [];
  const droppedItems: DroppedItem[] = [];
  const degradedItems: DegradedItem[] = [];

  items.forEach((item, idx) => {
    const c = checks[idx];
    if (!c.ok) {
      droppedItems.push({ item, reason: c.reason || 'desconhecido' });
      return;
    }

    // Aprovado, mas com possível degradação
    const enriched: BriefingItem = {
      ...item,
      url: c.finalUrl,
      urlStatus: c.status,
      ...(c.status !== 'verified' ? { urlOriginal: item.url } : {}),
    };

    validItems.push(enriched);

    if (c.status !== 'verified') {
      degradedItems.push({ item: enriched, reason: c.reason });
    }
  });

  return { validItems, droppedItems, degradedItems };
}
