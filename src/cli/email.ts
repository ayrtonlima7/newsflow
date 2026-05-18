import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProvider, extractJson } from '../lib/providers/index.ts';
import { buildEmailPrompt } from '../prompts/email.ts';
import type { Briefing, EmailOutput, Profile } from '../lib/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

async function main() {
  const profilePath = resolve(ROOT, 'fixtures/profile.json');
  const briefingPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(ROOT, 'output/briefings/latest.json');

  if (!existsSync(profilePath)) {
    console.error(`Perfil não encontrado em: ${profilePath}`);
    process.exit(1);
  }
  if (!existsSync(briefingPath)) {
    console.error(`Briefing não encontrado em: ${briefingPath}. Rode "npm run curate" primeiro.`);
    process.exit(1);
  }

  const profile: Profile = JSON.parse(await readFile(profilePath, 'utf8'));
  const briefing: Briefing = JSON.parse(await readFile(briefingPath, 'utf8'));

  if (briefing.itens.length === 0) {
    console.log('[email] briefing vazio — nenhum email a gerar (conforme spec do Prompt 2).');
    process.exit(0);
  }

  const provider = await getProvider();
  const { system, user } = buildEmailPrompt(profile, briefing);

  console.log(`[email] provider=${provider.name} model=${provider.model}`);
  console.log(`[email] ${briefing.itens.length} itens no briefing → gerando email…`);
  const t0 = Date.now();

  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: false,
    maxTokens: 4096,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[email] resposta recebida em ${elapsed}s`);

  const email = extractJson<EmailOutput>(result.text);

  const stamp = timestamp();
  const dir = resolve(ROOT, 'output/emails', `${stamp}-${provider.name}`);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'subject.txt'), email.assunto);
  await writeFile(resolve(dir, 'email.html'), email.html);
  await writeFile(
    resolve(dir, 'meta.json'),
    JSON.stringify(
      {
        provider: provider.name,
        model: provider.model,
        timestamp: new Date().toISOString(),
        elapsed_seconds: Number(elapsed),
        briefing_path: briefingPath,
      },
      null,
      2,
    ),
  );

  const latestDir = resolve(ROOT, 'output/emails/latest');
  await mkdir(latestDir, { recursive: true });
  await writeFile(resolve(latestDir, 'subject.txt'), email.assunto);
  await writeFile(resolve(latestDir, 'email.html'), email.html);

  console.log(`\n[email] Assunto: ${email.assunto}`);
  console.log(`[email] HTML salvo em: ${dir}/email.html`);
  console.log(`[email] também copiado para: output/emails/latest/email.html`);
  console.log(`[email] abra no browser: open ${dir}/email.html`);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

main().catch((err) => {
  console.error('[email] erro:', err);
  process.exit(1);
});
