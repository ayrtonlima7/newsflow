import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, planFromPriceId } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SubscriptionStatus } from '@/src/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mapeia o status do Stripe pro nosso enum interno. */
function mapStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
    case 'incomplete':
    case 'paused':
      return 'canceled';
    default:
      return 'canceled';
  }
}

/** Atualiza o profile a partir de uma subscription do Stripe. */
async function syncSubscription(sub: Stripe.Subscription) {
  const admin = createAdminClient();

  // Acha o usuário: metadata.user_id (setado no checkout) ou pelo customer_id.
  const userId = sub.metadata?.user_id;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const priceId = sub.items.data[0]?.price?.id;
  const plan = planFromPriceId(priceId);
  const status = mapStatus(sub.status);
  const periodEnd = sub.items.data[0]?.current_period_end
    ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
    : null;

  // Cancelamento agendado: o Stripe pode sinalizar de DUAS formas dependendo da
  // versão/portal — (a) a flag booleana cancel_at_period_end=true, OU (b) um
  // timestamp cancel_at (= fim do período) com a flag ainda false. Cobrimos as
  // duas: há cancelamento pendente se qualquer sinal estiver presente E a
  // subscription ainda não cancelou de fato (status != canceled).
  const cancelPending =
    status !== 'canceled' &&
    (sub.cancel_at_period_end === true || sub.cancel_at != null);

  // Período de teste: trial_end no futuro = usuário em trial (status 'trialing'
  // no Stripe, mapeado pra 'active' acima). Guardamos pra UI mostrar
  // "teste grátis até DATA". Limpa (null) quando o trial acaba/converte.
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

  const patch = {
    stripe_subscription_id: sub.id,
    subscription_status: status,
    plan,
    current_period_end: periodEnd,
    // Guardamos pra mostrar "acesso até DATA (não renova)" em vez de "renova em DATA".
    cancel_at_period_end: cancelPending,
    trial_end: trialEnd,
  };

  // Guarda: acesso de cortesia (manual) NÃO é dirigido pelo Stripe. Se o perfil
  // já é 'manual', ignora o evento — evita que um subscription.deleted/updated
  // tardio (de uma assinatura antiga cancelada) revogue a cortesia silenciosamente.
  const [filterCol, filterVal] = userId
    ? (['user_id', userId] as const)
    : (['stripe_customer_id', customerId] as const);
  const { data: current } = await admin
    .from('profiles')
    .select('subscription_status')
    .eq(filterCol, filterVal)
    .maybeSingle();
  if (current?.subscription_status === 'manual') {
    console.log(`[stripe webhook] perfil ${filterVal} é cortesia (manual) — evento ${sub.id} ignorado`);
    return;
  }

  await admin.from('profiles').update(patch).eq(filterCol, filterVal);

  console.log(
    `[stripe webhook] sync sub ${sub.id}: status=${status} plan=${plan} cancelPending=${cancelPending} trialEnd=${trialEnd ?? '-'} user=${userId ?? customerId}`,
  );
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET ausente' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'sem assinatura' }, { status: 400 });

  const body = await req.text(); // raw body é obrigatório pra verificar a assinatura
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe webhook] assinatura inválida:', msg);
    return NextResponse.json({ error: `assinatura inválida: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      // Outros eventos (invoice.paid, etc.) são cobertos pelo subscription.updated.
      default:
        // ignora silenciosamente
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stripe webhook] erro ao processar ${event.type}:`, msg);
    // Retorna 500 pra o Stripe re-tentar
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
