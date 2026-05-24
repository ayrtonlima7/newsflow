'use client';

import { useState, useTransition } from 'react';
import { sendSampleNow, type SampleResult } from './actions';

export function SampleCard({ userEmail }: { userEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SampleResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await sendSampleNow();
      setResult(res);
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Receber um email de exemplo agora</p>
          <p className="text-xs text-[var(--color-muted)] max-w-md">
            Pra ver como o produto entrega antes do horário agendado. A geração + envio leva
            ~1-2 minutos. Vai pro {userEmail}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="shrink-0 rounded-md bg-[var(--color-fg)] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Gerando…' : 'Enviar agora'}
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
