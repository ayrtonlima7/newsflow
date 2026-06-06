import Stripe from 'stripe';

// Cliente Stripe server-side. Usa STRIPE_SECRET_KEY (sk_test_ em test mode,
// sk_live_ em produção). NUNCA expor ao browser.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY ausente');
  _stripe = new Stripe(key, {
    // Deixa o SDK usar a versão de API fixada na própria lib (evita mismatch).
    typescript: true,
  });
  return _stripe;
}

/** Mapeia o price ID (do Stripe) pro nome do plano. */
export function planFromPriceId(priceId: string | undefined): 'mensal' | 'anual' | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_MENSAL) return 'mensal';
  if (priceId === process.env.STRIPE_PRICE_ANUAL) return 'anual';
  return null;
}
