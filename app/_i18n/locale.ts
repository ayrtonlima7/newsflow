import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  normalizeLocale,
  type Locale,
} from '@/src/lib/i18n';

/**
 * Locale pra renderizar a UI (server-side). Ordem: cookie nf_locale (escolha
 * explícita ou default setado pelo middleware) > Accept-Language > default.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (fromCookie) return normalizeLocale(fromCookie);
  const h = await headers();
  return localeFromAcceptLanguage(h.get('accept-language'));
}
