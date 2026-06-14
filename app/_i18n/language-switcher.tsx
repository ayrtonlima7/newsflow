'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLocale } from './actions';
import { useLocale } from './provider';
import { LOCALES, LOCALE_LABEL, type Locale } from '@/src/lib/i18n';

const FLAG: Record<Locale, string> = { pt: '🇧🇷', en: '🇺🇸', es: '🇪🇸' };

/**
 * Seletor de idioma global — renderizado no layout raiz, aparece em TODA página
 * (landing, login, onboarding, settings). Funciona pré-login (cookie) e logado
 * (cookie + profile). Um <select> nativo: compacto e acessível em qualquer tela.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const current = useLocale();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const loc = e.target.value;
    startTransition(async () => {
      await setLocale(loc);
      router.refresh();
    });
  }

  return (
    <select
      value={current}
      onChange={onChange}
      disabled={pending}
      aria-label="Idioma / Language / Idioma"
      className="cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-2 py-1 text-xs shadow-sm backdrop-blur transition hover:border-[var(--color-fg)] disabled:opacity-50"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {FLAG[l]} {LOCALE_LABEL[l]}
        </option>
      ))}
    </select>
  );
}
