'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCheckoutSession,
  createPortalSession,
  redeemCompCode,
} from './subscription-actions';
import type { GateResult } from '@/src/lib/subscription';

interface Props {
  /** Estado do gating (subscribed / free / past_due / canceled). */
  gateState: GateResult['state'];
  plan: 'mensal' | 'anual' | null;
  currentPeriodEnd: string | null;
  /** true quando cancelou mas ainda tem acesso até o fim do período. */
  cancelAtPeriodEnd?: boolean;
  /** Fim do período de teste (ISO). Se no futuro, está em trial. */
  trialEnd?: string | null;
  justSubscribed?: boolean;
}

const PRICE_MENSAL = 'R$ 19,90/mês';
const PRICE_ANUAL = 'R$ 199/ano';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { dateStyle: 'long' });
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [coupon, setCoupon] = useState('');

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
    const planLabel = plan === 'anual' ? 'Anual' : 'Mensal';
    const isTrial = !!trialEnd && new Date(trialEnd).getTime() > Date.now();
    const canceling = !!cancelAtPeriodEnd;
    // Durante o trial, current_period_end == trial_end (data da 1ª cobrança).
    const periodDate = currentPeriodEnd
      ? fmtDate(currentPeriodEnd)
      : trialEnd
        ? fmtDate(trialEnd)
        : null;

    // Cor: âmbar se cancelando; azul se em trial; verde se pago ativo.
    const tone = canceling
      ? { border: 'border-amber-300', bg: 'bg-amber-50', title: 'text-amber-900', sub: 'text-amber-700', btn: 'border-amber-300 text-amber-800 hover:border-amber-500' }
      : isTrial
        ? { border: 'border-sky-300', bg: 'bg-sky-50', title: 'text-sky-900', sub: 'text-sky-700', btn: 'border-sky-300 text-sky-800 hover:border-sky-500' }
        : { border: 'border-emerald-300', bg: 'bg-emerald-50', title: 'text-emerald-900', sub: 'text-emerald-700', btn: 'border-emerald-300 text-emerald-800 hover:border-emerald-500' };

    let title: string;
    let subline: string | null = null;
    if (canceling && isTrial) {
      title = `Teste grátis — plano ${planLabel} (cancelamento agendado)`;
      subline = periodDate
        ? `Acesso até ${periodDate}. Você não será cobrado. Reative antes pra continuar.`
        : null;
    } else if (canceling) {
      title = `Plano ${planLabel} ativo (cancelamento agendado)`;
      subline = periodDate
        ? `Acesso até ${periodDate}. Depois não renova — você pode reativar a qualquer momento antes.`
        : null;
    } else if (isTrial) {
      title = `Teste grátis ativo — plano ${planLabel}`;
      subline = periodDate
        ? `Grátis até ${periodDate}. A primeira cobrança (${planLabel === 'Anual' ? PRICE_ANUAL : PRICE_MENSAL}) acontece nessa data. Cancele antes e não paga nada.`
        : null;
    } else {
      title = `Plano ${planLabel} ativo`;
      subline = periodDate ? `Renova em ${periodDate}.` : null;
    }

    return (
      <div className={`rounded-lg border p-5 ${tone.border} ${tone.bg}`}>
        {justSubscribed && (
          <p className={`mb-2 text-sm font-medium ${tone.title}`}>
            {isTrial ? '🎉 Mês grátis ativado!' : '🎉 Assinatura confirmada!'}
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
          {pending ? 'Abrindo…' : canceling ? 'Reativar / gerenciar' : 'Gerenciar assinatura'}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  // --- Acesso de cortesia (manual / beta) ---
  if (gateState === 'manual') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
        <p className="text-sm font-medium text-emerald-900">Acesso de cortesia ativo 🎁</p>
        <p className="mt-1 text-xs text-emerald-700">
          Você está no beta com acesso liberado — sem cobrança. Recebe sua curadoria
          normalmente na frequência escolhida.
        </p>
      </div>
    );
  }

  // --- Past due → atualizar pagamento ---
  if (gateState === 'past_due') {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <p className="text-sm font-medium">⚠️ Pagamento pendente</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Não conseguimos cobrar sua assinatura. Atualize o pagamento pra continuar recebendo.
        </p>
        <button
          type="button"
          onClick={goPortal}
          disabled={pending}
          className="mt-3 rounded-md bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Abrindo…' : 'Atualizar pagamento'}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  // --- Free (nunca assinou) ou canceled → mostra planos com mês grátis ---
  const headline =
    gateState === 'canceled'
      ? 'Sua assinatura foi cancelada'
      : 'Comece com 30 dias grátis';
  const subtitle =
    gateState === 'canceled'
      ? 'Reative quando quiser pra voltar a receber sua curadoria.'
      : 'Escolha um plano. Você só é cobrado depois de 30 dias e pode cancelar quando quiser — sem cobrança se cancelar antes.';

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
          <span className="block font-medium">Mensal</span>
          <span className="text-xs text-[var(--color-muted)]">{PRICE_MENSAL} · 30 dias grátis</span>
        </button>
        <button
          type="button"
          onClick={() => goCheckout('anual')}
          disabled={pending}
          className="flex-1 rounded-md border-2 border-[var(--color-fg)] bg-[var(--color-fg)] px-4 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <span className="block font-medium">Anual · 2 meses grátis</span>
          <span className="text-xs opacity-80">{PRICE_ANUAL} · 30 dias grátis</span>
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
            Tenho um cupom de cortesia
          </button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="Digite seu cupom"
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
              {pending ? 'Resgatando…' : 'Resgatar'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
