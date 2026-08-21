import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './settings-form';
import { SampleCard } from './sample-card';
import { SubscriptionCard } from './subscription-card';
import { DeliveryEmailCard } from './delivery-email-card';
import { ContactCard } from './contact-card';
import { IdentifyUser } from '../_analytics/identify-user';
import { canDeliver, isFreeMode, type SubscriptionStatus } from '@/src/lib/subscription';
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

  // "Antecipar curadoria" é one-shot: só vale pra PRIMEIRA edição, enquanto o
  // usuário nunca recebeu nada. Depois da primeira (por este botão OU pelo cron),
  // o card desaparece — a partir daí a cadência normal manda. Contamos deliveries
  // 'sent' porque é o sinal inequívoco de "já recebeu" (last_delivered_at e
  // sample_cooldown_until servem a outros propósitos: idempotência do cron e
  // cooldown, respectivamente).
  const { count: sentCount } = await supabase
    .from('deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'sent');
  const neverDelivered = (sentCount ?? 0) === 0;

  const isAdmin = !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL;

  // Estado de acesso pro card. Com FREE_MODE ligado o produto é grátis: o gate
  // libera todo mundo e a UI não mostra NENHUM indicativo de pagamento.
  const freeMode = isFreeMode();
  const gate = canDeliver({
    status: (profile.subscription_status ?? 'free') as SubscriptionStatus,
    freeForever: profile.free_forever ?? false,
    freeMode,
  });

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
      <IdentifyUser userId={user.id} email={user.email ?? undefined} />
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
              className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-accent-fg)] transition hover:opacity-90"
            >
              {t('settings.admin')}
            </Link>
          )}
          {/* "Sair" agora vive no chrome global (app/layout.tsx) — disponível em
              toda página autenticada, não só aqui. */}
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
        freeMode={freeMode}
      />

      <DeliveryEmailCard
        authEmail={user.email ?? ''}
        deliveryEmail={profile.delivery_email ?? null}
      />

      {/* Amostra só pra quem está liberado (assinante/trial) E ainda não recebeu
          nenhuma edição — é o "antecipar a primeira curadoria". Free vê o card de
          assinatura acima; quem já recebeu segue só na cadência do perfil. */}
      {gate.allowed && neverDelivered && (
        <SampleCard userEmail={profile.delivery_email || user.email || ''} />
      )}

      <SettingsForm initial={initial} isActive={profile.is_active} />

      {/* Ouvidoria — formulário de contato que envia via Resend (issue #33). */}
      <ContactCard />
    </main>
  );
}
