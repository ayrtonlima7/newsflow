/**
 * Catálogo de eventos do funil — FONTE DA VERDADE.
 *
 * Este é o módulo que você edita quando muda a demanda do teste: adicionar um
 * evento aqui (nome + shape do payload) é tudo que precisa pra ele virar
 * type-safe em `track()`. Os pontos de instrumentação no app importam destas
 * constantes — nunca passe strings cruas pra `track()`.
 *
 * Convenção de nomes: snake_case, verbo no passado quando é uma ação concluída
 * (`onboarding_completed`) ou substantivo do momento (`paywall_view`). Mantenha
 * curto e estável — renomear um evento quebra o histórico no PostHog.
 *
 * O funil que estes eventos desenham (topo → fundo):
 *   $pageview (automático)            ← visita (inclui landing)
 *   signup_started                    ← clicou em entrar (Google/email)
 *   onboarding_started                ← abriu o wizard
 *   onboarding_step                   ← chegou em CADA pergunta (drop-off real)
 *   onboarding_completed              ← salvou o perfil
 *   paywall_view                      ← viu os planos
 *   checkout_started                  ← clicou em assinar (antes do Stripe)
 *   subscribed                        ← assinatura criada (server, via webhook)
 */

export const ANALYTICS_EVENTS = {
  SIGNUP_STARTED: 'signup_started',
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP: 'onboarding_step',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  PAYWALL_VIEW: 'paywall_view',
  CHECKOUT_STARTED: 'checkout_started',
  SUBSCRIBED: 'subscribed',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Shape do payload de cada evento. Chave = string literal do evento (o VALOR em
 * ANALYTICS_EVENTS, não a chave). `track()` usa este mapa pra exigir o payload
 * certo em cada evento.
 */
export interface EventPayloads {
  signup_started: { method: 'google' | 'email' };
  onboarding_started: Record<string, never>;
  /** Rastreado por `question_id` (não por índice) porque há perguntas
   *  condicionais — o número do passo varia entre usuários. */
  onboarding_step: {
    question_id: string;
    position: number; // 1-based, entre as perguntas VISÍVEIS
    total_visible: number;
  };
  onboarding_completed: { frequencia: string; n_topicos: number };
  paywall_view: { gate_state: string };
  checkout_started: { plan: 'mensal' | 'anual' };
  subscribed: { plan: 'mensal' | 'anual' | null };
}

/** Properties de pessoa (setadas no identify) — úteis pra cruzar com o Supabase. */
export interface PersonProperties {
  email?: string;
}
