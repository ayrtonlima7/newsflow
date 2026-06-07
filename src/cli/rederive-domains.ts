import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

import { createAdminClient } from '../../lib/supabase/admin';
import { deriveDomains } from '../lib/domain-derivation';
import type { Profile } from '../lib/types';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');
  const positional = args.filter((a) => !a.startsWith('--'));
  const targetEmail = positional[0];

  const supabase = createAdminClient();

  // Resolve user_id quando um email específico é passado
  let targetUserId: string | undefined;
  if (targetEmail) {
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) {
      console.error('falha ao listar users:', usersErr.message);
      process.exit(1);
    }
    const user = usersData.users.find(
      (u) => u.email?.toLowerCase() === targetEmail.toLowerCase(),
    );
    if (!user) {
      console.error(`usuário com email "${targetEmail}" não encontrado`);
      process.exit(1);
    }
    targetUserId = user.id;
  }

  // Busca perfis pt. Se targetUserId estiver definido, filtra por ele.
  let query = supabase
    .from('profiles')
    .select('*')
    .or('idioma.eq.pt,idioma.is.null');
  if (targetUserId) {
    query = query.eq('user_id', targetUserId);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('falha ao buscar perfis:', error.message);
    process.exit(1);
  }

  // Filtra só os que precisam (dominios_busca null ou vazio), a menos que um
  // email específico tenha sido passado — nesse caso re-deriva sempre.
  const candidates = (rows ?? []).filter((row) => {
    if (targetUserId) return true;
    const d = row.dominios_busca;
    return d === null || (Array.isArray(d) && d.length === 0);
  });

  if (candidates.length === 0) {
    console.log('nenhum perfil precisa de re-derivação.');
    process.exit(0);
  }

  console.log(`[rederive] ${candidates.length} perfil(s) para processar${dryRun ? ' (dry run)' : ''}\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const profile: Profile = {
      nome: row.nome ?? '',
      tema: row.tema ?? [],
      contexto: row.contexto ?? [],
      descricao_livre: row.descricao_livre ?? '',
      objetivo: row.objetivo ?? [],
      topicos: row.topicos ?? [],
      topicos_busca: row.topicos_busca ?? undefined,
      dominios_busca: row.dominios_busca ?? undefined,
      referencias: row.referencias ?? [],
      formatos: row.formatos ?? [],
      ignorar: row.ignorar ?? [],
      frequencia: row.frequencia ?? '',
      horario: row.horario ?? '8h',
      delivery_email: row.delivery_email ?? undefined,
      idioma: row.idioma ?? 'pt',
    };

    const label = `${row.nome || '(sem nome)'} (${row.user_id})`;
    console.log(`[rederive] ${label} — derivando...`);

    try {
      const domains = await deriveDomains(profile);
      if (!domains) {
        console.warn(`[rederive] ${label} — deriveDomains retornou null (estática)`);
        skipped++;
        continue;
      }

      console.log(`[rederive] ${label} — ${domains.length} domínios`);

      if (dryRun) {
        console.log(`  → ${domains.join(', ')}`);
        continue;
      }

      const { error: upErr } = await supabase
        .from('profiles')
        .update({ dominios_busca: domains })
        .eq('user_id', row.user_id);

      if (upErr) {
        console.error(`[rederive] ${label} — erro ao gravar:`, upErr.message);
        failed++;
      } else {
        updated++;
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[rederive] ${label} — erro:`, m);
      failed++;
    }
  }

  console.log(
    `\n[rederive] concluído: ${updated} atualizado(s), ${skipped} skipped, ${failed} falha(s)`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[rederive] erro fatal:', err);
  process.exit(1);
});
