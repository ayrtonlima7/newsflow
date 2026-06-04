import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

import { createAdminClient } from '../../lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();

  console.log('[reset] listando usuários…');
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error('falha ao listar users:', error.message);
    process.exit(1);
  }

  const users = data.users;
  if (users.length === 0) {
    console.log('[reset] banco já está vazio. Nada a fazer.');
    return;
  }

  console.log(`[reset] encontrei ${users.length} usuário(s). Apagando…\n`);

  let success = 0;
  let failed = 0;

  for (const user of users) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error(`  ✗ ${user.email ?? user.id}: ${delErr.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${user.email ?? user.id}`);
      success++;
    }
  }

  console.log(`\n[reset] resumo: ${success} apagados, ${failed} falhas.`);

  // Sanity check — todas as tabelas devem estar vazias
  const [profilesRes, briefingsRes, deliveriesRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('briefings').select('*', { count: 'exact', head: true }),
    supabase.from('deliveries').select('*', { count: 'exact', head: true }),
  ]);

  console.log('\n[reset] estado final do banco:');
  console.log(`  auth.users (deletados):  ${success}`);
  console.log(`  public.profiles:         ${profilesRes.count ?? 0}`);
  console.log(`  public.briefings:        ${briefingsRes.count ?? 0}`);
  console.log(`  public.deliveries:       ${deliveriesRes.count ?? 0}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[reset] erro fatal:', err);
  process.exit(1);
});
