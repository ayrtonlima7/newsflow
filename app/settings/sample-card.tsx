'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendSampleNow, type SampleResult } from './actions';
import { useT } from '../_i18n/provider';

interface Props {
  userEmail: string;
}

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Card "antecipar a primeira curadoria". É ONE-SHOT: quem renderiza (settings/page)
 * só monta este card enquanto o usuário nunca recebeu nenhuma edição. Depois da
 * primeira entrega (por aqui ou pelo cron) o card não aparece mais — por isso aqui
 * não há mais lógica de cooldown/contagem regressiva.
 */
export function SampleCard({ userEmail }: Props) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SampleResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await sendSampleNow();
      setResult(res);
      if (res.ok) {
        router.refresh();
      }
    });
  }

  const buttonLabel = pending ? t('sample.generating') : t('sample.send');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('sample.title')}</p>
            <p className="text-xs text-[var(--color-muted)] max-w-md">
              {t('sample.body', { email: userEmail })}
              {IS_DEV && ' (Em dev, o preview aparece abaixo após gerar.)'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            className="shrink-0 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        </div>

        {pending && (
          <p className="mt-3 text-xs text-[var(--color-muted)]">{t('sample.working')}</p>
        )}

        {result?.ok && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {t('sample.sentOk')}
            {IS_DEV ? ' Preview abaixo.' : ''}
          </div>
        )}

        {result && !result.ok && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {result.alreadyDelivered ? t('sample.alreadyDelivered') : result.error}
          </div>
        )}
      </div>

      {/* Preview do email gerado — só em dev */}
      {IS_DEV && result?.ok && result.deliveryId && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-800">
              ⚙️ Preview (modo dev)
            </p>
            <a
              href={`/api/dev/preview/${result.deliveryId}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-amber-800 underline hover:text-amber-900"
            >
              Abrir em nova aba ↗
            </a>
          </div>
          <iframe
            src={`/api/dev/preview/${result.deliveryId}`}
            title="Preview do email"
            className="h-[600px] w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
          />
        </div>
      )}
    </div>
  );
}
