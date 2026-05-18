import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProvider, extractJson } from '../lib/providers/index.ts';
import { buildCuratePrompt } from '../prompts/curate.ts';
import type { Briefing, Profile } from '../lib/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

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
  const provider = getProvider();

  if (!provider.supportsWebSearch) {
    console.error(
      `Provider "${provider.name}" não suporta busca web nativa. ` +
        'Use LLM_PROVIDER=anthropic ou LLM_PROVIDER=gemini para a curadoria.',
    );
    process.exit(1);
  }

  const { system, user } = buildCuratePrompt(profile);

  console.log(`[curate] provider=${provider.name} model=${provider.model}`);
  console.log(`[curate] perfil: ${profile.area} / ${profile.cargo} — tópicos: ${profile.topicos.join(', ')}`);
  console.log(`[curate] chamando o modelo com web search habilitado…`);
  const t0 = Date.now();

  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: true,
    maxTokens: 4096,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[curate] resposta recebida em ${elapsed}s, ${result.citations.length} citações`);

  let briefing: Briefing;
  try {
    briefing = extractJson<Briefing>(result.text);
  } catch (err) {
    const rawPath = resolve(ROOT, 'output/briefings', `${timestamp()}-raw.txt`);
    await mkdir(dirname(rawPath), { recursive: true });
    await writeFile(rawPath, result.text);
    console.error(`[curate] falha ao parsear JSON. Resposta crua salva em: ${rawPath}`);
    throw err;
  }

  const stamp = timestamp();
  const outPath = resolve(ROOT, 'output/briefings', `${stamp}-${provider.name}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        meta: {
          provider: provider.name,
          model: provider.model,
          timestamp: new Date().toISOString(),
          elapsed_seconds: Number(elapsed),
          citations: result.citations,
        },
        briefing,
      },
      null,
      2,
    ),
  );

  const latestPath = resolve(ROOT, 'output/briefings/latest.json');
  await writeFile(latestPath, JSON.stringify(briefing, null, 2));

  console.log(`\n[curate] ${briefing.itens.length} itens selecionados:`);
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
