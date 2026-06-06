'use client';

import { createContext, useContext } from 'react';
import { translate, type Dictionary } from '@/src/lib/messages';
import { DEFAULT_LOCALE, type Locale } from '@/src/lib/i18n';

interface I18nValue {
  locale: Locale;
  dict: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, dict }}>{children}</I18nContext.Provider>;
}

/** Hook de tradução pra client components: t('chave', { var }). */
export function useT() {
  const ctx = useContext(I18nContext);
  const dict = ctx?.dict ?? {};
  return (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars);
}

export function useLocale(): Locale {
  return useContext(I18nContext)?.locale ?? DEFAULT_LOCALE;
}
