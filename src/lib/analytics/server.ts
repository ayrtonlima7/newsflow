/**
 * Capture de eventos SERVER-SIDE (PostHog), via HTTP — sem dependência extra
 * (não usa posthog-node). Usado pra eventos que só existem no servidor, como
 * `subscribed` (disparado pelo webhook do Stripe).
 *
 * Reusa a MESMA chave pública do client (`NEXT_PUBLIC_POSTHOG_KEY`) e, o mais
 * importante, o MESMO `distinct_id` = `user.id` do Supabase. Assim o evento de
 * servidor cai na mesma pessoa do funil client-side (identify usa o user.id).
 *
 * No-op quando não configurado. Nunca lança — telemetria não quebra o webhook.
 */

import type { AnalyticsEventName, EventPayloads } from './events';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

/**
 * Dispara um evento atribuído a `distinctId` (= user.id do Supabase).
 * `await` opcional — falha de telemetria é engolida.
 */
export async function trackServer<E extends AnalyticsEventName>(
  distinctId: string,
  event: E,
  properties: EventPayloads[E],
): Promise<void> {
  if (!KEY || !distinctId) return;
  try {
    await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'newsflow-server' },
      }),
      // não bloqueia o webhook se o PostHog estiver lento
      cache: 'no-store',
    });
  } catch {
    // ignora — telemetria nunca derruba o webhook
  }
}
