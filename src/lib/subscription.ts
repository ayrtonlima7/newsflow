/**
 * Regras de acesso (gating) do NewsFlow.
 *
 * Modelo de negócio com DOIS modos, alternados pela flag `FREE_MODE`:
 *
 * ── FREE_MODE OFF (default, modelo pago) ────────────────────────────────────
 *  - Trial de 30 dias NATIVO do Stripe (cartão exigido na frente). Durante o
 *    trial a subscription fica 'trialing', que o webhook mapeia pra 'active'.
 *  - Depois do trial, cobrança automática (mensal R$19,90 ou anual R$199).
 *  - Só recebe quem está 'active' (inclui trialing) ou 'manual' (cortesia).
 *
 * ── FREE_MODE ON (produto 100% grátis) ──────────────────────────────────────
 *  - Qualquer um entra, faz onboarding e recebe. Sem paywall, sem checkout.
 *  - Quem exerce o acesso nesse período ganha `free_forever` = VITALÍCIO: se a
 *    flag voltar pra OFF, ele continua recebendo e editando o perfil normalmente.
 *  - Quem JÁ era assinante pagante NÃO ganha vitalício — a cobrança dele é
 *    PAUSADA no Stripe (estado 'frozen') e retomada quando a flag voltar pra OFF.
 *    Ver `npm run sync-billing`.
 *
 * O Stripe segue sendo a fonte da verdade do pagamento; a flag e o
 * `free_forever` são camadas ACIMA dele.
 */

export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled' | 'manual';

/** Estados que a UI usa pra decidir o que mostrar. */
export type GateState =
  | 'subscribed'
  | 'manual'
  | 'free'
  | 'past_due'
  | 'canceled'
  /** Acesso liberado pelo modo grátis (ou vitalício herdado dele). */
  | 'free_era'
  /** Assinante pagante com a cobrança pausada porque o produto está grátis. */
  | 'frozen';

export interface GateResult {
  allowed: boolean;
  /** Motivo legível quando bloqueado (pra log/UI). */
  reason: string;
  /** Estado pra UI decidir o que mostrar. */
  state: GateState;
  /** true quando este acesso deve estampar `free_forever` no perfil (vitalício
   *  da era grátis). Quem chama é responsável por persistir — ver delivery.ts. */
  shouldGrantLifetime?: boolean;
}

export interface AccessInput {
  status: SubscriptionStatus;
  /** Já tem vitalício concedido na era grátis. */
  freeForever?: boolean;
  /** Flag global do modo grátis (ver isFreeMode). */
  freeMode?: boolean;
}

/** Status que representam uma assinatura VIVA no Stripe (pausável/retomável).
 *  'canceled' não conta: não há o que retomar. */
function hasLiveSubscription(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'past_due';
}

/** Tem acesso liberado? (pagante, cortesia, ou grátis/vitalício). */
export function isPaid(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'manual';
}

/**
 * Decide se o usuário pode receber um email AGORA. Pura e determinística.
 *
 * Ordem de precedência (importa):
 *  1. `free_forever` — vitalício vence tudo, INDEPENDENTE da flag. É o que
 *     garante que virar a flag pra OFF não tira o acesso de quem entrou grátis.
 *  2. 'manual' — cortesia de beta (cupom), também independe da flag.
 *  3. FREE_MODE ON — libera todo mundo. Assinante vivo vira 'frozen' (não ganha
 *     vitalício, cobrança pausada); o resto ganha vitalício.
 *  4. FREE_MODE OFF — regra de assinatura normal.
 */
export function canDeliver(input: SubscriptionStatus | AccessInput): GateResult {
  // Compat: aceita só o status (chamadas antigas) ou o objeto completo.
  const { status, freeForever = false, freeMode = false } =
    typeof input === 'string' ? { status: input } as AccessInput : input;

  // 1. Vitalício da era grátis — nunca revogado.
  if (freeForever) {
    return { allowed: true, reason: 'acesso vitalício (era grátis)', state: 'free_era' };
  }

  // 2. Cortesia manual (cupom de beta).
  if (status === 'manual') {
    return { allowed: true, reason: 'acesso de cortesia (manual)', state: 'manual' };
  }

  // 3. Produto grátis pra todos.
  if (freeMode) {
    if (hasLiveSubscription(status)) {
      // Assinante pagante: acesso liberado, cobrança pausada, SEM vitalício —
      // ele volta a pagar quando a flag desligar.
      return {
        allowed: true,
        reason: 'modo grátis ativo — assinatura pausada',
        state: 'frozen',
      };
    }
    return {
      allowed: true,
      reason: 'modo grátis ativo',
      state: 'free_era',
      shouldGrantLifetime: true,
    };
  }

  // 4. Modelo pago (comportamento histórico).
  switch (status) {
    case 'active':
      return { allowed: true, reason: 'assinante ativo', state: 'subscribed' };
    case 'past_due':
      return { allowed: false, reason: 'pagamento pendente (past_due)', state: 'past_due' };
    case 'canceled':
      return { allowed: false, reason: 'assinatura cancelada', state: 'canceled' };
    case 'free':
    default:
      return { allowed: false, reason: 'sem assinatura ativa', state: 'free' };
  }
}

/**
 * Flag global do modo grátis. SERVER-ONLY (lê env var) — nunca chame de client
 * component; passe o valor por prop.
 *
 * Env var em vez de registro no banco de propósito: virar o modelo de negócio
 * exige um deploy deliberado (não vira por acidente) e não custa uma leitura de
 * rede em toda requisição.
 */
export function isFreeMode(): boolean {
  const v = process.env.FREE_MODE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}
