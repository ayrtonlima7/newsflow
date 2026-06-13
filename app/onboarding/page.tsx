import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './wizard';
import { IdentifyUser } from '../_analytics/identify-user';
import { getLocale } from '../_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/onboarding');

  // Se já tem perfil, manda para settings (onde pode editar)
  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) redirect('/settings');

  const dict = getDictionary(await getLocale());
  const t = (k: string) => translate(dict, k);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <IdentifyUser userId={user.id} email={user.email ?? undefined} />
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-muted)]">
          NewsFlow AI
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{t('onb.pageTitle')}</h1>
        <p className="text-[var(--color-muted)]">{t('onb.pageSubtitle')}</p>
      </div>
      <OnboardingWizard userEmail={user.email ?? ''} />
    </main>
  );
}
