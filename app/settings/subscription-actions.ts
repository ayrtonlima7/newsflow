'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/client';
import { isFreeMode } from '@/src/lib/subscription';

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

/** Garante que o usuário tem um Stripe customer; cria e persiste se faltar. */
async function ensureCustomer(userId: string, email: string): Promise<string> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('user_id', userId);

  return customer.id;
}

/** Cria uma sessão de checkout pra um plano e retorna a URL pra redirecionar. */
export async function createCheckoutSession(
  plan: 'mensal' | 'anual',
): Promise<{ url?: string; error?: string }> {
  // Modo grátis: ninguém deve conseguir pagar por um produto que está aberto.
  // A UI já não oferece checkout, mas server action é endpoint acessível a
  // qualquer logado — a recusa tem que estar aqui também.
  if (isFreeMode()) {
    return { error: 'O NewsFlow está aberto pra todos no momento — não há o que assinar.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'não autenticado' };

  const priceId =
    plan === 'mensal' ? process.env.STRIPE_PRICE_MENSAL : process.env.STRIPE_PRICE_ANUAL;
  if (!priceId) return { error: `price do plano "${plan}" não configurado` };

  try {
    const customerId = await ensureCustomer(user.id, user.email);
    const stripe = getStripe();
    const base = appUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/settings?sub=success`,
      cancel_url: `${base}/settings?sub=cancel`,
      subscription_data: {
        // Garante que o webhook consiga ligar a subscription ao nosso usuário
        metadata: { user_id: user.id },
        // Mês grátis: 30 dias de teste, cartão exigido na frente (default do
        // checkout em mode:'subscription' é payment_method_collection:'always').
        // Cobra automático ao fim do trial; cancelar antes = sem cobrança.
        // ⚠️ Trial fixo = cada checkout dá 30 dias novos. Pra beta tudo bem;
        // se virar problema (cancelar→reassinar pra ganhar trial de novo),
        // checar histórico do customer antes de conceder o trial.
        trial_period_days: 30,
      },
      allow_promotion_codes: true,
    });

    if (!session.url) return { error: 'Stripe não retornou URL de checkout' };
    return { url: session.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[createCheckoutSession] erro:', err);
    return { error: msg };
  }
}

/**
 * Resgata um cupom de cortesia → marca o perfil como 'manual' (acesso liberado
 * sem Stripe/cartão/cobrança). Usado pra liberar amigos no beta.
 */
export async function redeemCompCode(
  rawCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'não autenticado' };

  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: 'digite um cupom' };

  const admin = createAdminClient();

  // Perfil atual: assinante pagante não precisa de cupom; já-manual é idempotente.
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_status, comp_code')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.subscription_status === 'active') {
    return { ok: false, error: 'você já tem uma assinatura ativa.' };
  }
  if (profile?.subscription_status === 'manual' && profile?.comp_code === code) {
    return { ok: true }; // já resgatado, nada a fazer
  }

  // Valida o cupom.
  const { data: comp } = await admin
    .from('comp_codes')
    .select('code, is_active, expires_at, max_redemptions, redeemed_count')
    .eq('code', code)
    .maybeSingle();

  if (!comp || !comp.is_active) return { ok: false, error: 'cupom inválido.' };
  if (comp.expires_at && new Date(comp.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'cupom expirado.' };
  }
  if (comp.max_redemptions != null && comp.redeemed_count >= comp.max_redemptions) {
    return { ok: false, error: 'cupom esgotado.' };
  }

  // Libera o acesso (o mais importante primeiro).
  const { error: upErr } = await admin
    .from('profiles')
    .update({
      subscription_status: 'manual',
      comp_code: code,
      // Limpa qualquer resíduo de Stripe pra UI não confundir.
      plan: null,
      trial_end: null,
      cancel_at_period_end: false,
    })
    .eq('user_id', user.id);
  if (upErr) return { ok: false, error: upErr.message };

  // Contabiliza o resgate (best-effort; corrida com poucos amigos é irrelevante).
  await admin
    .from('comp_codes')
    .update({ redeemed_count: comp.redeemed_count + 1 })
    .eq('code', code);

  revalidatePath('/settings');
  return { ok: true };
}

/** Cria uma sessão do Customer Portal (gerenciar/cancelar assinatura). */
export async function createPortalSession(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'não autenticado' };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return { error: 'sem assinatura pra gerenciar' };
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl()}/settings`,
    });
    return { url: session.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[createPortalSession] erro:', err);
    return { error: msg };
  }
}
