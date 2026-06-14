'use client';

import { useEffect, useState } from 'react';
import { track } from '@/src/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/src/lib/analytics/events';

/** Barra de compartilhamento da notícia pública (issue #6): Web Share API no
 *  celular, WhatsApp e copiar link. Também registra a visualização da página
 *  compartilhada (topo do funil de aquisição orgânica). */
export function ShareBar({
  title,
  shareLabel,
  copyLabel,
  copiedLabel,
}: {
  title: string;
  shareLabel: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  // Conta a visita da página compartilhada uma vez.
  useEffect(() => {
    track(ANALYTICS_EVENTS.SHARED_ITEM_VIEWED);
  }, []);

  function currentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : '';
  }

  async function nativeShare() {
    const url = currentUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* usuário cancelou */
      }
    } else {
      void copyLink();
    }
  }

  function whatsapp() {
    const url = encodeURIComponent(`${title} — ${currentUrl()}`);
    window.open(`https://wa.me/?text=${url}`, '_blank', 'noopener');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-fg)] transition hover:border-[var(--color-fg)]';

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-5">
      <button type="button" onClick={nativeShare} className={btn}>
        ↗ {shareLabel}
      </button>
      <button type="button" onClick={whatsapp} className={btn}>
        WhatsApp
      </button>
      <button type="button" onClick={copyLink} className={btn}>
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
