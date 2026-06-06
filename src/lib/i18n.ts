/**
 * Núcleo de internacionalização. Idioma é por CONTA (profile.idioma) + cookie
 * pré-login; URLs continuam limpas (sem /[locale]/). Idiomas: pt, en, es.
 */

export type Locale = 'pt' | 'en' | 'es';

export const LOCALES: readonly Locale[] = ['pt', 'en', 'es'];
export const DEFAULT_LOCALE: Locale = 'pt';

/** Cookie que guarda o idioma escolhido (fonte de renderização da UI). */
export const LOCALE_COOKIE = 'nf_locale';

export function isLocale(v: unknown): v is Locale {
  return v === 'pt' || v === 'en' || v === 'es';
}

/** Normaliza qualquer string (profile.idioma, tag de idioma) pro nosso Locale. */
export function normalizeLocale(v: string | null | undefined): Locale {
  if (!v) return DEFAULT_LOCALE;
  const s = v.toLowerCase();
  if (s.startsWith('pt')) return 'pt';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('es')) return 'es';
  return DEFAULT_LOCALE;
}

/** Escolhe o melhor locale suportado a partir do header Accept-Language. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag.startsWith('pt')) return 'pt';
    if (tag.startsWith('en')) return 'en';
    if (tag.startsWith('es')) return 'es';
  }
  return DEFAULT_LOCALE;
}

/** Nome do idioma pra instruir o LLM (na própria língua-alvo). */
export const LANGUAGE_NAME: Record<Locale, string> = {
  pt: 'português do Brasil',
  en: 'English',
  es: 'español',
};

/** Valor do atributo lang do HTML. */
export const HTML_LANG: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en',
  es: 'es',
};

/** Rótulo do idioma pra UI (seletor). */
export const LOCALE_LABEL: Record<Locale, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
};
