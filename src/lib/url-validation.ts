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

  try {
    const head = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (head.status >= 200 && head.status < 400) return { ok: true };
    // Alguns servidores não suportam HEAD (405) ou bloqueiam (403). Tenta GET parcial.
    if (head.status === 405 || head.status === 403 || head.status === 501) {
      return await validateWithGet(url);
    }
    return { ok: false, reason: `HTTP ${head.status}` };
  } catch (err) {
    // Se HEAD falhou por rede/timeout, tenta GET antes de descartar.
    return await validateWithGet(url, err);
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
