import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

import { createAdminClient } from '../../lib/supabase/admin';

async function main() {
  const id = process.argv[2];
  const supabase = createAdminClient();

  let row: { id: string; subject: string; status: string; html: string; created_at: string } | null = null;

  if (id) {
    const { data, error } = await supabase
      .from('deliveries')
      .select('id, subject, status, html, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('erro ao buscar delivery:', error.message);
      process.exit(1);
    }
    row = data;
  } else {
    const { data, error } = await supabase
      .from('deliveries')
      .select('id, subject, status, html, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('erro ao buscar último delivery:', error.message);
      process.exit(1);
    }
    row = data;
  }

  if (!row) {
    console.error('nenhum delivery encontrado');
    process.exit(1);
  }
  if (!row.html || !row.html.trim()) {
    console.error(`delivery ${row.id} não tem HTML (status=${row.status})`);
    process.exit(1);
  }

  const dir = resolve(ROOT, 'output/previews');
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `${row.id}.html`);
  await writeFile(file, row.html);

  console.log(`[preview] id:      ${row.id}`);
  console.log(`[preview] assunto: ${row.subject}`);
  console.log(`[preview] status:  ${row.status}`);
  console.log(`[preview] criado:  ${row.created_at}`);
  console.log(`[preview] salvo:   ${file}`);
  console.log(`[preview] abrindo no browser…`);

  // macOS: `open`. Linux: `xdg-open`. Windows: `start`.
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [file], { detached: true, stdio: 'ignore' }).unref();
}

main().catch((err) => {
  console.error('[preview] erro:', err);
  process.exit(1);
});
