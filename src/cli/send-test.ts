import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const to = process.env.TEST_EMAIL_TO;

  if (!apiKey) throw new Error('RESEND_API_KEY ausente no .env.local');
  if (!from) throw new Error('RESEND_FROM ausente no .env.local');
  if (!to) throw new Error('TEST_EMAIL_TO ausente no .env.local');

  const dir = resolve(ROOT, 'output/emails/latest');
  const subjectPath = resolve(dir, 'subject.txt');
  const htmlPath = resolve(dir, 'email.html');

  if (!existsSync(subjectPath) || !existsSync(htmlPath)) {
    console.error(`Email não encontrado em ${dir}. Rode "npm run email" primeiro.`);
    process.exit(1);
  }

  const subject = (await readFile(subjectPath, 'utf8')).trim();
  const html = await readFile(htmlPath, 'utf8');

  console.log(`[send-test] from=${from} to=${to}`);
  console.log(`[send-test] assunto: ${subject}`);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    console.error('[send-test] erro do Resend:', error);
    process.exit(1);
  }
  console.log(`[send-test] enviado. id=${data?.id}`);
}

main().catch((err) => {
  console.error('[send-test] erro:', err);
  process.exit(1);
});
