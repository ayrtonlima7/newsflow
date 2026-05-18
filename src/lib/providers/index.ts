import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

export type Message = { role: 'user' | 'assistant'; content: string };

export interface CompleteOptions {
  system?: string;
  messages: Message[];
  webSearch?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface Citation {
  url: string;
  title?: string;
}

export interface CompleteResult {
  text: string;
  citations: Citation[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    toolTokens: number;
    totalTokens: number;
    groundingRequests: number;
  };
  raw: unknown;
}

export interface LLMProvider {
  name: 'anthropic' | 'gemini' | 'deepseek';
  model: string;
  supportsWebSearch: boolean;
  complete(opts: CompleteOptions): Promise<CompleteResult>;
}

export async function getProvider(name?: string): Promise<LLMProvider> {
  const choice = (name ?? process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  switch (choice) {
    case 'anthropic':
      throw new Error(
        'Provider "anthropic" foi removido das dependências (você usa o plano Team separadamente). ' +
          'Para reativar: npm i @anthropic-ai/sdk e restaurar src/lib/providers/anthropic.ts.',
      );
    case 'gemini': {
      const { createGeminiProvider } = await import('./gemini');
      return createGeminiProvider();
    }
    case 'deepseek': {
      const { createDeepSeekProvider } = await import('./deepseek');
      return createDeepSeekProvider();
    }
    default:
      throw new Error(
        `LLM_PROVIDER desconhecido: "${choice}". Valores válidos: anthropic, gemini, deepseek.`,
      );
  }
}

export function extractJson<T = unknown>(text: string): T {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  const firstBrace = s.indexOf('{');
  const firstBracket = s.indexOf('[');
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start === -1) {
    throw new Error(`Resposta não contém JSON:\n${text.slice(0, 500)}`);
  }
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const jsonStr = s.slice(start, i + 1);
        return JSON.parse(jsonStr) as T;
      }
    }
  }
  throw new Error(`JSON não fechado corretamente na resposta:\n${text.slice(0, 500)}`);
}
