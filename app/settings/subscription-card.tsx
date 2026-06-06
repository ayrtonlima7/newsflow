'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCheckoutSession,
  createPortalSession,
  redeemCompCode,
} from './subscription-actions';
import { useT, useLocale } from '../_i18n/provider';
import { INTL_LOCALE } from '@/src/lib/i18n';
import type { GateResult } from '@/src/lib/subscription';

interface Props {
  /** Estado do gating (subscribed / manual / free / past_due / canceled). */
  gateState: GateResult['state'];
  plan: 'mensal' | 'anual' | null;
  currentPeriodEnd: string | null;
  /** true quando cancelou mas ainda tem acesso até o fim do período. */
  cancelAtPeriodEnd?: boolean;
  /** Fim do período de teste (ISO). Se no futuro, está em trial. */
  trialEnd?: string | null;
  justSubscribed?: boolean;
}

export function SubscriptionCard({
  gateState,
  plan,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  trialEnd,
  justSubscribed,
}: Props) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [coupon, setCoupon] = useState('');

  const priceMonthly = t('sub.priceMonthly');
  const priceAnnual = t('sub.priceAnnual');
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { dateStyle: 'long' });

  function goCheckout(p: 'mensal' | 'anual') {
    setError(null);
    startTransition(async () => {
      const res = await createCheckoutSession(p);
      if (res.url) window.location.href = res.url;
      else setError(res.error ?? 'erro ao iniciar checkout');
    });
  }

  function goPortal() {
    setError(null);
    startTransition(async () => {
      const res = await createPortalSession();
      if (res.url) window.location.href = res.url;
      else setError(res.error ?? 'erro ao abrir portal');
    });
  }

  function goRedeem() {
    setError(null);
    startTransition(async () => {
      const res = await redeemCompCode(coupon);
      if (res.ok) {
        setCoupon('');
        setShowCoupon(false);
        router.refresh();
      } else {
        setError(res.error ?? 'erro ao resgatar cupom');
      }
    });
  }

  // --- Assinante ativo (inclui trial e "cancelado mas vigente") ---
  if (gateState === 'subscribed') {
    const planLabel = plan === 'anual' ? t('sub.planAnnual') : t('sub.planMonthly');
    const planPrice = plan === 'anual' ? priceAnnual : priceMonthly;
    const isTrial = !!trialEnd && new Date(trialEnd).getTime() > Date.now();
    const canceling = !!cancelAtPeriodEnd;
    const periodDate = currentPeriodEnd
      ? fmtDate(currentPeriodEnd)
      : trialEnd
        ? fmtDate(trialEnd)
        : null;

    const tone = canceling
      ? { border: 'border-amber-300', bg: 'bg-amber-50', title: 'text-amber-900', sub: 'text-amber-700', btn: 'border-amber-300 text-amber-800 hover:border-amber-500' }
      : isTrial
        ? { border: 'border-sky-300', bg: 'bg-sky-50', title: 'text-sky-900', sub: 'text-sky-700', btn: 'border-sky-300 text-sky-800 hover:border-sky-500' }
        : { border: 'border-emerald-300', bg: 'bg-emerald-50', title: 'text-emerald-900', sub: 'text-emerald-700', btn: 'border-emerald-300 text-emerald-800 hover:border-emerald-500' };

    let title: string;
    let subline: string | null = null;
    if (canceling && isTrial) {
      title = t('sub.titleTrialCanceling', { plan: planLabel });
      subline = periodDate ? t('sub.lineTrialCanceling', { date: periodDate }) : null;
    } else if (canceling) {
      title = t('sub.titleCanceling', { plan: planLabel });
      subline = periodDate ? t('sub.lineCanceling', { date: periodDate }) : null;
    } else if (isTrial) {
      title = t('sub.titleTrial', { plan: planLabel });
      subline = periodDate ? t('sub.lineTrial', { date: periodDate, price: planPrice }) : null;
    } else {
      title = t('sub.titleActive', { plan: planLabel });
      subline = periodDate ? t('sub.lineActive', { date: periodDate }) : null;
    }

    return (
      <div className={`rounded-lg border p-5 ${tone.border} ${tone.bg}`}>
        {justSubscribed && (
          <p className={`mb-2 text-sm font-medium ${tone.title}`}>
            {isTrial ? t('sub.trialActivated') : t('sub.confirmed')}
          </p>
        )}
        <p className={`text-sm font-medium ${tone.title}`}>{title}</p>
        {subline && <p className={`mt-1 text-xs ${tone.sub}`}>{subline}</p>}
        <button
          type="button"
          onClick={goPortal}
          disabled={pending}
          className={`mt-3 rounded-md border bg-white px-4 py-2 text-sm transition disabled:opacity-50 ${tone.btn}`}
        >
          {pending ? t('sub.opening') : canceling ? t('sub.reactivate') : t('sub.manage')}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  // --- Acesso de cortesia (manual / beta) ---
  if (gateState === 'manual') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
        <p className="text-sm font-medium text-emerald-900">{t('sub.manualTitle')}</p>
        <p className="mt-1 text-xs text-emerald-700">{t('sub.manualBody')}</p>
      </div>
    );
  }

  // --- Past due → atualizar pagamento ---
  if (gateState === 'past_due') {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <p className="text-sm font-medium">{t('sub.pastDueTitle')}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">{t('sub.pastDueBody')}</p>
        <button
          type="button"
          onClick={goPortal}
          disabled={pending}
          className="mt-3 rounded-md bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t('sub.opening') : t('sub.updatePayment')}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  // --- Free (nunca assinou) ou canceled → mostra planos com mês grátis ---
  const headline = gateState === 'canceled' ? t('sub.canceledHeadline') : t('sub.startHeadline');
  const subtitle = gateState === 'canceled' ? t('sub.canceledSub') : t('sub.startSub');

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
      <p className="text-sm font-medium">{headline}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{subtitle}</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => goCheckout('mensal')}
          disabled={pending}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-sm transition hover:border-[var(--color-fg)] disabled:opacity-50"
        >
          <span className="block font-medium">{t('sub.planMonthly')}</span>
          <span className="text-xs text-[var(--color-muted)]">{t('sub.btnSubTrial', { price: priceMonthly })}</span>
        </button>
        <button
          type="button"
          onClick={() => goCheckout('anual')}
          disabled={pending}
          className="flex-1 rounded-md border-2 border-[var(--color-fg)] bg-[var(--color-fg)] px-4 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <span className="block font-medium">{t('sub.btnAnnual')}</span>
          <span className="text-xs opacity-80">{t('sub.btnSubTrial', { price: priceAnnual })}</span>
        </button>
      </div>

      {/* Cupom de cortesia (beta) */}
      <div className="mt-3">
        {!showCoupon ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowCoupon(true);
            }}
            className="text-xs text-[var(--color-muted)] underline hover:text-[var(--color-fg)]"
          >
            {t('sub.haveCoupon')}
          </button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder={t('sub.couponPlaceholder')}
              autoCapitalize="characters"
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm uppercase placeholder:normal-case placeholder:text-[var(--color-muted)] focus:border-[var(--color-fg)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && coupon.trim() && !pending) goRedeem();
              }}
            />
            <button
              type="button"
              onClick={goRedeem}
              disabled={pending || !coupon.trim()}
              className="rounded-md border border-[var(--color-fg)] bg-white px-4 py-2 text-sm transition hover:bg-[var(--color-fg)] hover:text-white disabled:opacity-50"
            >
              {pending ? t('sub.redeeming') : t('sub.redeem')}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
