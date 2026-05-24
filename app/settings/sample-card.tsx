'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendSampleNow, SAMPLE_COOLDOWN_MS, type SampleResult } from './actions';

interface Props {
  userEmail: string;
  lastDeliveredAt: string | null;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

export function SampleCard({ userEmail, lastDeliveredAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SampleResult | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick a cada 1s pra atualizar o countdown enquanto em cooldown
  const lastMs = lastDeliveredAt ? new Date(lastDeliveredAt).getTime() : 0;
  const cooldownRemaining = lastMs ? Math.max(0, lastMs + SAMPLE_COOLDOWN_MS - now) : 0;
  const onCooldown = cooldownRemaining > 0;

  useEffect(() => {
    if (!onCooldown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [onCooldown]);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await sendSampleNow();
      setResult(res);
      if (res.ok) {
        // refresh pra puxar o novo last_delivered_at e ativar o cooldown da UI
        router.refresh();
      }
    });
  }

  const buttonLabel = pending
    ? 'Gerando…'
    : onCooldown
      ? `Aguarde ${formatRemaining(cooldownRemaining)}`
      : 'Enviar agora';

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Receber um email de exemplo agora</p>
          <p className="text-xs text-[var(--color-muted)] max-w-md">
            Pra ver como o produto entrega antes do horário agendado. A geração + envio leva
            ~1-2 minutos. Vai pro {userEmail}. Limite de 1 envio a cada 5 minutos.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending || onCooldown}
          className="shrink-0 rounded-md bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      </div>

      {pending && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          ✨ Buscando conteúdo na web, gerando o email e enviando. Não saia da página.
        </p>
      )}

      {result?.ok && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Email enviado{result.itemsCount ? ` com ${result.itemsCount} item(s)` : ''}. Cheque seu
          inbox (e a pasta de spam na primeira vez).
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
        </div>
      )}
    </div>
  );
}
