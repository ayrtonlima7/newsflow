import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

import { createAdminClient } from '../../lib/supabase/admin';
import { getStripe } from '../../lib/stripe/client';
import { isFreeMode } from '../lib/subscription';

/**
 * Reconcilia a COBRANÇA no Stripe com a flag FREE_MODE.
 *
 * Por que é um comando separado (e não automático no gate):
 *  - Mexer em dinheiro não deve entrar no caminho crítico da entrega de email:
 *    uma falha da API do Stripe não pode derrubar a curadoria de ninguém.
 *  - Virar a flag é um deploy deliberado; rodar isto na sequência é explícito,
 *    auditável e re-executável.
 *
 * IDEMPOTENTE: usa `profiles.billing_paused_at` como marca. Rodar duas vezes
 * não pausa duas vezes nem cobra ninguém a mais.
 *
 *   FREE_MODE on  → pausa a cobrança (pause_collection: void) dos assinantes vivos
 *   FREE_MODE off → retoma a cobrança de quem estava pausado
 *
 * Uso:
 *   npm run sync-billing -- --dry    (mostra o que faria, sem tocar no Stripe)
 *   npm run sync-billing             (aplica)
 */

interface Row {
  user_id: string;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  billing_paused_at: string | null;
  free_forever: boolean | null;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const freeMode = isFreeMode();
  const supabase = createAdminClient();

  console.log('='.repeat(70));
  console.log(`sync-billing | FREE_MODE=${freeMode ? 'ON (pausar)' : 'OFF (retomar)'}${dry ? ' | DRY RUN' : ''}`);
  console.log('='.repeat(70));

  const { data: rows, error } = await supabase
    .from('profiles')
    .select('user_id, stripe_subscription_id, subscription_status, billing_paused_at, free_forever')
    .not('stripe_subscription_id', 'is', null);
  if (error) {
    console.error('erro ao ler profiles:', error.message);
    process.exit(1);
  }

  const profiles = (rows ?? []) as Row[];
  // Só assinatura VIVA é pausável/retomável — 'canceled' não tem o que reter.
  const live = (s: string | null) => s === 'active' || s === 'past_due';

  const toPause = profiles.filter((p) => freeMode && live(p.subscription_status) && !p.billing_paused_at);
  const toResume = profiles.filter((p) => !freeMode && p.billing_paused_at);
  const untouched = profiles.length - toPause.length - toResume.length;

  console.log(`\nperfis com assinatura no Stripe: ${profiles.length}`);
  console.log(`  a PAUSAR:  ${toPause.length}`);
  console.log(`  a RETOMAR: ${toResume.length}`);
  console.log(`  já no estado certo: ${untouched}\n`);

  if (toPause.length === 0 && toResume.length === 0) {
    console.log('nada a fazer — cobrança já está coerente com a flag. ✅');
    return;
  }

  // Só instancia o Stripe pra valer quando NÃO é dry run: o dry precisa rodar em
  // qualquer ambiente (inclusive local, sem STRIPE_SECRET_KEY) — é o ensaio que
  // você faz ANTES de apontar pro ambiente que tem a chave.
  const stripe = dry ? null : getStripe();
  let ok = 0;
  let fail = 0;

  for (const p of toPause) {
    const label = `${p.user_id.slice(0, 8)} sub=${p.stripe_subscription_id}`;
    if (dry) {
      console.log(`  [dry] PAUSARIA ${label}`);
      continue;
    }
    try {
      // behavior 'void': não gera fatura a cobrar durante a pausa.
      await stripe!.subscriptions.update(p.stripe_subscription_id!, {
        pause_collection: { behavior: 'void' },
      });
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ billing_paused_at: new Date().toISOString() })
        .eq('user_id', p.user_id);
      if (upErr) throw new Error(`marca local: ${upErr.message}`);
      console.log(`  ✅ pausado ${label}`);
      ok++;
    } catch (e) {
      console.error(`  ❌ FALHA ao pausar ${label}: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }

  for (const p of toResume) {
    const label = `${p.user_id.slice(0, 8)} sub=${p.stripe_subscription_id}`;
    if (dry) {
      console.log(`  [dry] RETOMARIA ${label}`);
      continue;
    }
    try {
      await stripe!.subscriptions.update(p.stripe_subscription_id!, {
        pause_collection: null,
      });
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ billing_paused_at: null })
        .eq('user_id', p.user_id);
      if (upErr) throw new Error(`marca local: ${upErr.message}`);
      console.log(`  ✅ retomado ${label}`);
      ok++;
    } catch (e) {
      console.error(`  ❌ FALHA ao retomar ${label}: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }

  if (!dry) {
    console.log(`\nresultado: ${ok} ok, ${fail} falha(s)`);
    if (fail > 0) {
      console.log('⚠️ rode de novo — o comando é idempotente e só age no que ficou pendente.');
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('erro:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
