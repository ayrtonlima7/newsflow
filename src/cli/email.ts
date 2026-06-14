import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEmailHtml } from '../lib/email-template';
import type { Briefing } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Monta o HTML do email a partir de um briefing já curado (sem LLM — o conteúdo
// na voz final já veio do curate). Útil pra inspecionar o template localmente.
async function main() {
  const briefingPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(ROOT, 'output/briefings/latest.json');

  if (!existsSync(briefingPath)) {
    console.error(`Briefing não encontrado em: ${briefingPath}. Rode "npm run curate" primeiro.`);
    process.exit(1);
  }

  const briefing: Briefing = JSON.parse(await readFile(briefingPath, 'utf8'));

  if (briefing.itens.length === 0) {
    console.log('[email] briefing vazio — nenhum email a gerar.');
    process.exit(0);
  }

  // Tema opcional pra preview: `npm run email -- briefing.json dark`. Sem isso,
  // cai no env EMAIL_THEME → 'light' (produção).
  const theme = process.argv.includes('dark')
    ? 'dark'
    : process.argv.includes('light')
      ? 'light'
      : undefined;

  // Locale opcional (chrome do email: datas, "Ler na fonte", rodapé):
  // `npm run email -- briefing.json light en`. Default 'pt'.
  const locale = process.argv.includes('en')
    ? 'en'
    : process.argv.includes('es')
      ? 'es'
      : 'pt';

  const assunto = briefing.assunto?.trim() || 'Seu resumo de hoje';
  const html = renderEmailHtml(briefing, locale, theme ? { theme } : {});

  const latestDir = resolve(ROOT, 'output/emails/latest');
  await mkdir(latestDir, { recursive: true });
  await writeFile(resolve(latestDir, 'subject.txt'), assunto);
  await writeFile(resolve(latestDir, 'email.html'), html);

  console.log(`[email] Assunto: ${assunto}`);
  console.log(`[email] ${briefing.itens.length} itens → HTML montado via template (sem LLM)`);
  console.log(`[email] salvo em: output/emails/latest/email.html`);
  console.log(`[email] abra no browser: open output/emails/latest/email.html`);
}

main().catch((err) => {
  console.error('[email] erro:', err);
  process.exit(1);
});
