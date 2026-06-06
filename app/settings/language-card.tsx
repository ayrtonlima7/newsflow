'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateIdioma } from './actions';
import { LOCALES, LOCALE_LABEL, normalizeLocale, type Locale } from '@/src/lib/i18n';

const FLAG: Record<Locale, string> = { pt: '🇧🇷', en: '🇺🇸', es: '🇪🇸' };

export function LanguageCard({ idioma }: { idioma: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = normalizeLocale(idioma);

  function pick(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      const res = await updateIdioma(locale);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
      <p className="text-sm font-medium">Idioma</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Define o idioma da sua curadoria e dos emails. (A interface do site será traduzida em breve.)
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {LOCALES.map((loc) => {
          const active = loc === current;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => pick(loc)}
              disabled={pending}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition disabled:opacity-50 ${
                active
                  ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-white'
                  : 'border-[var(--color-border)] bg-white hover:border-[var(--color-fg)]'
              }`}
            >
              <span aria-hidden="true">{FLAG[loc]}</span>
              {LOCALE_LABEL[loc]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
