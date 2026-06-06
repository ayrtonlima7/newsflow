/**
 * Regras de acesso (gating) do NewsFlow.
 *
 * Modelo de negócio:
 *  - Trial de 30 dias NATIVO do Stripe (trial_period_days no checkout, cartão
 *    exigido na frente). Durante o trial a subscription fica 'trialing', que o
 *    webhook mapeia pra 'active' → o usuário recebe normalmente.
 *  - Após o trial, cobrança automática (mensal R$19,90 ou anual R$199).
 *  - Cancelar a qualquer momento: usufrui até o fim do período já pago/em teste
 *    (Stripe mantém 'active' até lá; ver cancel_at_period_end).
 *
 * O Stripe é a ÚNICA fonte da verdade do pagamento — não há mais trial por
 * contagem de emails no app. Só recebe quem está 'active' (inclui trialing) ou
 * 'manual' (cortesia de beta via cupom). 'free' = nunca assinou.
 */

export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled' | 'manual';

export interface GateResult {
  allowed: boolean;
  /** Motivo legível quando bloqueado (pra log/UI). */
  reason: string;
  /** Estado pra UI decidir o que mostrar. */
  state: 'subscribed' | 'manual' | 'free' | 'past_due' | 'canceled';
}

/** Tem acesso liberado? (pagante via Stripe OU cortesia manual). */
export function isPaid(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'manual';
}

/**
 * Decide se o usuário pode receber um email AGORA, só pelo status.
 * - active (inclui trialing) → pode.
 * - manual (cortesia de beta) → pode, sem Stripe/cobrança.
 * - free (nunca assinou) → bloqueado, precisa começar o mês grátis.
 * - past_due / canceled → bloqueado.
 */
export function canDeliver(status: SubscriptionStatus): GateResult {
  switch (status) {
    case 'active':
      return { allowed: true, reason: 'assinante ativo', state: 'subscribed' };
    case 'manual':
      return { allowed: true, reason: 'acesso de cortesia (manual)', state: 'manual' };
    case 'past_due':
      return { allowed: false, reason: 'pagamento pendente (past_due)', state: 'past_due' };
    case 'canceled':
      return { allowed: false, reason: 'assinatura cancelada', state: 'canceled' };
    case 'free':
    default:
      return { allowed: false, reason: 'sem assinatura ativa', state: 'free' };
  }
}
