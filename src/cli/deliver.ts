import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

import { createAdminClient } from '../../lib/supabase/admin';
import { runDeliveryPipeline } from '../lib/delivery';
import type { Profile } from '../lib/types';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');
  const positional = args.filter((a) => !a.startsWith('--'));
  const target = positional[0];

  if (!target) {
    console.error('uso: npm run deliver -- <email|user_id> [--dry]');
    process.exit(1);
  }

  const supabase = createAdminClient();

  let userId: string;
  let userEmail: string;

  if (target.includes('@')) {
    // procurar pelo email
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      console.error('falha ao listar users:', error.message);
      process.exit(1);
    }
    const user = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (!user || !user.email) {
      console.error(`usuário com email "${target}" não encontrado`);
      process.exit(1);
    }
    userId = user.id;
    userEmail = user.email;
  } else {
    userId = target;
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user?.email) {
      console.error('usuário não encontrado:', error?.message);
      process.exit(1);
    }
    userEmail = data.user.email;
  }

  const { data: profileRow, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (pErr || !profileRow) {
    console.error('perfil não encontrado:', pErr?.message ?? 'sem registro');
    process.exit(1);
  }

  const profile: Profile = {
    area: profileRow.area,
    cargo: profileRow.cargo,
    topicos: profileRow.topicos,
    topicos_busca: profileRow.topicos_busca ?? undefined,
    ignorar: profileRow.ignorar,
    frequencia: profileRow.frequencia,
    horario: profileRow.horario,
    tom: profileRow.tom,
    fontes_prioritarias: profileRow.fontes_prioritarias,
    descricoes_livres: profileRow.descricoes_livres ?? {},
  };

  console.log(`[deliver] user=${userEmail} dry=${dryRun}`);
  console.log(`[deliver] perfil: ${profile.area} / ${profile.cargo}`);
  console.log(`[deliver] tópicos: ${profile.topicos.join(', ')}`);

  const result = await runDeliveryPipeline(
    { userId, email: userEmail, profile },
    { dryRun },
  );

  console.log(`\n[deliver] status=${result.status}`);
  if (result.itemsCount !== undefined) console.log(`[deliver] itens=${result.itemsCount}`);
  if (result.resendId) console.log(`[deliver] resend_id=${result.resendId}`);
  if (result.deliveryId) console.log(`[deliver] delivery_id=${result.deliveryId}`);
  console.log(`[deliver] custo total: R$ ${result.costBrl.toFixed(4)}`);
  console.log(`[deliver] tempo: ${result.elapsedSeconds.toFixed(1)}s`);
  if (result.error) console.error(`[deliver] erro: ${result.error}`);

  process.exit(result.status === 'failed' ? 1 : 0);
}

main().catch((err) => {
  console.error('[deliver] erro fatal:', err);
  process.exit(1);
});
