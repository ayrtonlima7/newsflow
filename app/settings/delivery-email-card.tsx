'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestDeliveryEmailChange, confirmDeliveryEmail } from './actions';
import { useT } from '../_i18n/provider';

interface Props {
  /** Email da conta (auth) — usado quando não há email de entrega definido. */
  authEmail: string;
  /** Email de entrega atual confirmado (null = usa o da conta). */
  deliveryEmail: string | null;
}

export function DeliveryEmailCard({ authEmail, deliveryEmail }: Props) {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [value, setValue] = useState(deliveryEmail ?? '');
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const current = deliveryEmail || authEmail;
  const usingAccount = !deliveryEmail;
  const dirty = value.trim().toLowerCase() !== (deliveryEmail ?? '').toLowerCase();

  function requestChange() {
    setFeedback(null);
    startTransition(async () => {
      const res = await requestDeliveryEmailChange(value);
      if (res.status === 'cleared') {
        setFeedback({ ok: true, text: t('demail.cleared') });
        router.refresh();
      } else if (res.status === 'code_sent') {
        setPendingEmail(res.email);
        setCode('');
        setStep('code');
      } else {
        setFeedback({ ok: false, text: res.error });
      }
    });
  }

  function confirm() {
    setFeedback(null);
    startTransition(async () => {
      const res = await confirmDeliveryEmail(code);
      if (res.ok) {
        setStep('input');
        setFeedback({ ok: true, text: t('demail.confirmed') });
        router.refresh();
      } else {
        setFeedback({ ok: false, text: res.error ?? 'erro ao confirmar' });
      }
    });
  }

  function cancelCode() {
    setStep('input');
    setCode('');
    setValue(deliveryEmail ?? '');
    setFeedback(null);
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm font-medium">{t('demail.title')}</p>

      {step === 'input' ? (
        <>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {t(usingAccount ? 'demail.leadAccount' : 'demail.leadCustom', { current })}
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setFeedback(null);
              }}
              placeholder={authEmail}
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-fg)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dirty && !pending) requestChange();
              }}
            />
            <button
              type="button"
              onClick={requestChange}
              disabled={pending || !dirty}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? t('demail.sending') : value.trim() ? t('demail.verify') : t('demail.save')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {t('demail.codeSent', { email: pendingEmail })}
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setFeedback(null);
              }}
              placeholder="000000"
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm tracking-[0.4em] outline-none transition focus:border-[var(--color-fg)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.length === 6 && !pending) confirm();
              }}
            />
            <button
              type="button"
              onClick={confirm}
              disabled={pending || code.length !== 6}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? t('demail.confirming') : t('demail.confirm')}
            </button>
          </div>

          <button
            type="button"
            onClick={cancelCode}
            disabled={pending}
            className="mt-2 text-xs text-[var(--color-muted)] underline hover:text-[var(--color-fg)] disabled:opacity-50"
          >
            {t('demail.cancel')}
          </button>
        </>
      )}

      {feedback && (
        <p className={`mt-2 text-sm ${feedback.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
