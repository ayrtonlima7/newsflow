import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';
import { SettingsForm } from './settings-form';
import { SampleCard } from './sample-card';
import { SubscriptionCard } from './subscription-card';
import { DeliveryEmailCard } from './delivery-email-card';
import { canDeliver, type SubscriptionStatus } from '@/src/lib/subscription';
import { getLocale } from '../_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';
import type { ProfileUpdateInput } from './actions';

// O pipeline (curate + email + send) pode levar ~60s. Server actions desta rota herdam.
export const maxDuration = 60;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; sub?: string }>;
}) {
  const { welcome, sub } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/settings');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) redirect('/onboarding');

  const isAdmin = !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL;

  // Estado de assinatura pro card (Stripe é a fonte da verdade)
  const gate = canDeliver(
    (profile.subscription_status ?? 'free') as SubscriptionStatus,
  );

  const dict = getDictionary(await getLocale());
  const t = (k: string) => translate(dict, k);

  const initial: ProfileUpdateInput = {
    nome: profile.nome ?? '',
    tema: profile.tema ?? [],
    contexto: profile.contexto ?? [],
    descricao_livre: profile.descricao_livre ?? '',
    objetivo: profile.objetivo ?? [],
    topicos: profile.topicos ?? [],
    referencias: profile.referencias ?? [],
    formatos: profile.formatos ?? [],
    ignorar: profile.ignorar ?? [],
    frequencia: profile.frequencia ?? '',
    horario: profile.horario ?? '08:00',
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-[var(--color-muted)]">{user.email}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
          <p className="text-sm text-[var(--color-muted)]">{t('settings.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-md border border-[var(--color-fg)] bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90"
            >
              {t('settings.admin')}
            </Link>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm hover:border-[var(--color-fg)]"
            >
              {t('settings.signOut')}
            </button>
          </form>
        </div>
      </div>

      {welcome && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {gate.allowed ? t('settings.welcomeAllowed') : t('settings.welcomeFree')}
        </div>
      )}

      <SubscriptionCard
        gateState={gate.state}
        plan={profile.plan ?? null}
        currentPeriodEnd={profile.current_period_end ?? null}
        cancelAtPeriodEnd={profile.cancel_at_period_end ?? false}
        trialEnd={profile.trial_end ?? null}
        justSubscribed={sub === 'success'}
      />

      <DeliveryEmailCard
        authEmail={user.email ?? ''}
        deliveryEmail={profile.delivery_email ?? null}
      />

      {/* Amostra só pra quem está liberado (assinante/trial). Free vê o card de
          assinatura acima — o "test drive" do produto é o trial de 30 dias. */}
      {gate.allowed && (
        <SampleCard
          userEmail={profile.delivery_email || user.email || ''}
          lastDeliveredAt={profile.last_delivered_at}
        />
      )}

      <SettingsForm initial={initial} isActive={profile.is_active} />
    </main>
  );
}
