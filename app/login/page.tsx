import { LoginForm } from './login-form';
import { getLocale } from '../_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const dict = getDictionary(await getLocale());
  const t = (k: string) => translate(dict, k);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <a href="/" className="text-sm text-[var(--color-muted)] hover:underline">
          {t('login.back')}
        </a>
        <h1 className="text-3xl font-semibold tracking-tight">{t('login.title')}</h1>
        <p className="text-[var(--color-muted)]">{t('login.subtitle')}</p>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">{t('login.errorTitle')}</p>
          <p className="text-red-600/80">{error}</p>
        </div>
      )}
      <LoginForm next={next} />
    </main>
  );
}
