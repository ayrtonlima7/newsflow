import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getLocale } from './_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';
import { LoginForm } from './login/login-form';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Já logado → vai direto pro app (settings é o hub). Quem não tem perfil
  // ainda cai em /onboarding por lá.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/settings');

  const dict = getDictionary(await getLocale());
  const t = (k: string) => translate(dict, k);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-muted)]">
          {t('landing.eyebrow')}
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          {t('landing.title')}
        </h1>
        <p className="text-base leading-relaxed text-[var(--color-muted)]">
          {t('landing.subtitle')}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">{t('login.errorTitle')}</p>
          <p className="text-red-600/80">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">{t('landing.authNote')}</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
