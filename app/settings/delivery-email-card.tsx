'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestDeliveryEmailChange, confirmDeliveryEmail } from './actions';

interface Props {
  /** Email da conta (auth) — usado quando não há email de entrega definido. */
  authEmail: string;
  /** Email de entrega atual confirmado (null = usa o da conta). */
  deliveryEmail: string | null;
}

export function DeliveryEmailCard({ authEmail, deliveryEmail }: Props) {
  const router = useRouter();
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
        setFeedback({ ok: true, text: '✓ Voltou a usar o email da conta.' });
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
        setFeedback({ ok: true, text: '✓ Email de entrega confirmado!' });
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
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
      <p className="text-sm font-medium">Email de entrega</p>

      {step === 'input' ? (
        <>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Sua curadoria é enviada para{' '}
            <span className="font-medium text-[var(--color-fg)]">{current}</span>
            {usingAccount ? ' (email da sua conta).' : '.'} Quer receber em outro endereço?
            A gente manda um código pra confirmar. Deixe vazio para usar o email da conta.
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
              className="rounded-md bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? 'Enviando…' : value.trim() ? 'Verificar' : 'Salvar'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Enviamos um código de 6 dígitos para{' '}
            <span className="font-medium text-[var(--color-fg)]">{pendingEmail}</span>. Digite
            abaixo pra confirmar. (Cheque o spam se não chegar.)
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
              className="rounded-md bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? 'Confirmando…' : 'Confirmar'}
            </button>
          </div>

          <button
            type="button"
            onClick={cancelCode}
            disabled={pending}
            className="mt-2 text-xs text-[var(--color-muted)] underline hover:text-[var(--color-fg)] disabled:opacity-50"
          >
            Cancelar
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
