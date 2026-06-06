import { getLocale } from './_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';

export default async function HomePage() {
  const dict = getDictionary(await getLocale());
  const t = (k: string) => translate(dict, k);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-muted)]">
          {t('landing.eyebrow')}
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          {t('landing.title')}
        </h1>
        <p className="text-lg leading-relaxed text-[var(--color-muted)]">
          {t('landing.subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href="/onboarding"
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90"
        >
          {t('landing.ctaCreate')}
        </a>
        <a
          href="/login"
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-6 py-3 text-sm font-medium transition hover:bg-white"
        >
          {t('landing.ctaLogin')}
        </a>
      </div>
    </main>
  );
}
