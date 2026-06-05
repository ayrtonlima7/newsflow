import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBriefing } from '../lib/pipeline';
import { formatCost } from '../lib/pricing';
import type { Profile } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Gera um briefing via pipeline real (Tavily busca + DeepSeek cura). Salva JSON.
async function main() {
  const profilePath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(ROOT, 'fixtures/profile.json');

  if (!existsSync(profilePath)) {
    console.error(`Perfil não encontrado em: ${profilePath}`);
    console.error('Copie fixtures/profile.example.json para fixtures/profile.json e ajuste.');
    process.exit(1);
  }

  const profile: Profile = JSON.parse(await readFile(profilePath, 'utf8'));

  console.log(
    `[curate] perfil: ${profile.nome || '(sem nome)'} — ${(profile.tema ?? []).join(', ')} (${profile.contexto || '?'})`,
  );
  console.log(`[curate] tópicos: ${(profile.topicos ?? []).join(', ')}`);

  const { briefing, meta } = await generateBriefing(profile);

  console.log(`[curate] ${formatCost(meta.usage, meta.cost, meta.model)}`);

  const stamp = timestamp();
  const outPath = resolve(ROOT, 'output/briefings', `${stamp}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ meta, briefing }, null, 2));

  const latestPath = resolve(ROOT, 'output/briefings/latest.json');
  await writeFile(latestPath, JSON.stringify(briefing, null, 2));

  console.log(`\n[curate] assunto: ${briefing.assunto ?? '(sem assunto)'}`);
  console.log(`[curate] ${briefing.itens.length} itens selecionados:`);
  for (const item of briefing.itens) {
    console.log(`  • [${item.relevancia}] ${item.titulo} (${item.fonte})`);
  }
  console.log(`\n[curate] salvo em: ${outPath}`);
  console.log(`[curate] também copiado para: output/briefings/latest.json`);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

main().catch((err) => {
  console.error('[curate] erro:', err);
  process.exit(1);
});
