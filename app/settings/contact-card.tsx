'use client';

import { useState, useTransition } from 'react';
import { sendFeedback } from './actions';
import { useT } from '../_i18n/provider';

/** Ouvidoria (issue #33): textarea + enviar. Manda a mensagem pra equipe via
 *  Resend (server action), puxando email/nome do login+perfil — sem pedir de
 *  novo. */
export function ContactCard() {
  const t = useT();
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  function submit() {
    if (!message.trim() || pending) return;
    setStatus('idle');
    startTransition(async () => {
      const res = await sendFeedback(message);
      if (res.ok) {
        setStatus('ok');
        setMessage('');
      } else {
        setStatus('error');
      }
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm font-medium">{t('settings.contactTitle')}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{t('settings.contactBody')}</p>

      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (status !== 'idle') setStatus('idle');
        }}
        placeholder={t('settings.contactPlaceholder')}
        maxLength={2000}
        rows={4}
        className="mt-3 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)]"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs">
          {status === 'ok' && (
            <span className="text-[var(--color-accent)]">{t('settings.contactOk')}</span>
          )}
          {status === 'error' && (
            <span className="text-red-500">{t('settings.contactError')}</span>
          )}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !message.trim()}
          className="shrink-0 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? t('settings.contactSending') : t('settings.contactSend')}
        </button>
      </div>
    </div>
  );
}
