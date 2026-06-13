/**
 * Helpers de tracking CLIENT-SIDE (PostHog).
 *
 * Tudo aqui é **no-op quando o analytics não está configurado** (sem
 * `NEXT_PUBLIC_POSTHOG_KEY`). Isso é de propósito: o código entra em produção
 * "dark" e só passa a coletar quando você cria a conta no PostHog e seta a env
 * — sem precisar mexer no código de novo. Ver docs/ANALYTICS.md.
 *
 * A inicialização do PostHog (init + pageview automático) vive no
 * AnalyticsProvider (app/_analytics/). Aqui só disparamos eventos/identify,
 * sempre dentro de try/catch pra que um erro de telemetria NUNCA quebre o app.
 */

import posthog from 'posthog-js';
import type {
  AnalyticsEventName,
  EventPayloads,
  PersonProperties,
} from './events';

/** Analytics está ligado? (client + env presente) */
export function isAnalyticsEnabled(): boolean {
  return (
    typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY
  );
}

/**
 * Dispara um evento do funil. Type-safe: o payload é exigido conforme o mapa
 * EventPayloads do evento escolhido.
 *
 *   track(ANALYTICS_EVENTS.CHECKOUT_STARTED, { plan: 'mensal' })
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  // Eventos sem payload (Record<string, never>) ficam opcionais; os demais
  // exigem o objeto certo.
  ...args: EventPayloads[E] extends Record<string, never>
    ? [props?: undefined]
    : [props: EventPayloads[E]]
): void {
  if (!isAnalyticsEnabled()) return;
  try {
    posthog.capture(event, args[0]);
  } catch {
    // telemetria nunca derruba o app
  }
}

/**
 * Liga a sessão anônima (landing) ao usuário autenticado. CRÍTICO: sem isso o
 * funil "quebra" no login (PostHog trataria pré e pós-login como duas pessoas).
 * Deve rodar uma vez assim que o usuário está autenticado (ver IdentifyUser).
 */
export function identifyUser(
  distinctId: string,
  props?: PersonProperties,
): void {
  if (!isAnalyticsEnabled() || !distinctId) return;
  try {
    posthog.identify(distinctId, props as Record<string, unknown> | undefined);
  } catch {
    // ignora
  }
}

/** Limpa a identidade (logout) — evita misturar usuários no mesmo browser. */
export function resetUser(): void {
  if (!isAnalyticsEnabled()) return;
  try {
    posthog.reset();
  } catch {
    // ignora
  }
}
