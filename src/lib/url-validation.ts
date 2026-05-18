import type { BriefingItem } from './types';

export interface DroppedItem {
  item: BriefingItem;
  reason: string;
}

export interface ValidationReport {
  validItems: BriefingItem[];
  droppedItems: DroppedItem[];
}

const PLACEHOLDER_PATTERN =
  /\b(your[_-]?video[_-]?id|your[_-]?id|example\.com|placeholder|TODO|FIXME|\.\.\.+|\[ID\])\b/i;

const USER_AGENT =
  'Mozilla/5.0 (compatible; NewsFlowBot/1.0; +https://newsflow.ai/bot)';

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

export async function validateUrl(url: string): Promise<{ ok: boolean; reason?: string }> {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, reason: 'URL vazia' };
  }
  if (PLACEHOLDER_PATTERN.test(url)) {
    return { ok: false, reason: `URL contém placeholder/template` };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'URL malformada' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `protocolo inválido: ${parsed.protocol}` };
  }

  // Validadores content-aware: sites que retornam 200 mesmo pra conteúdo
  // inexistente precisam de checagem via API específica.
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

async function validateGeneric(url: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const head = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (head.status >= 200 && head.status < 400) return { ok: true };
    if (head.status === 405 || head.status === 403 || head.status === 501) {
      return await validateWithGet(url);
    }
    return { ok: false, reason: `HTTP ${head.status}` };
  } catch (err) {
    return await validateWithGet(url, err);
  }
}

async function validateReddit(url: string): Promise<{ ok: boolean; reason?: string }> {
  // Post: /r/<sub>/comments/<id>[/<slug>/]
  // Subreddit: /r/<sub>/   |   User: /user/<name>/
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
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `Reddit check falhou: ${msg}` };
    }
  }
  // Não é URL de post — usa checagem genérica
  return validateGeneric(url);
}

async function validateYoutube(url: string): Promise<{ ok: boolean; reason?: string }> {
  // YouTube oEmbed retorna 401/404 pra vídeo inexistente, 200 com JSON pra existente.
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetchWithTimeout(oembed, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 404) {
      return { ok: false, reason: 'YouTube vídeo não existe ou é privado' };
    }
    return { ok: false, reason: `YouTube oEmbed HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `YouTube check falhou: ${msg}` };
  }
}

async function validateHackerNews(parsed: URL): Promise<{ ok: boolean; reason?: string }> {
  // Post: news.ycombinator.com/item?id=<id>
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
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `HN check falhou: ${msg}` };
  }
}

async function validateWithGet(
  url: string,
  prevErr?: unknown,
): Promise<{ ok: boolean; reason?: string }> {
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
    if (res.status >= 200 && res.status < 400) return { ok: true };
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

export async function validateBriefingUrls(items: BriefingItem[]): Promise<ValidationReport> {
  const checks = await Promise.all(items.map((i) => validateUrl(i.url)));
  const validItems: BriefingItem[] = [];
  const droppedItems: DroppedItem[] = [];
  items.forEach((item, idx) => {
    const c = checks[idx];
    if (c.ok) validItems.push(item);
    else droppedItems.push({ item, reason: c.reason ?? 'desconhecido' });
  });
  return { validItems, droppedItems };
}
