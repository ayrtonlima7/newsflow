import { GoogleGenAI } from '@google/genai';
import type { CompleteOptions, CompleteResult, LLMProvider, Citation } from './index';

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (!status || !RETRY_STATUSES.has(status) || attempt === maxAttempts) {
        throw err;
      }
      const waitMs = 2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
      console.error(
        `[gemini] erro ${status}, tentando de novo em ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempt}/${maxAttempts - 1})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

export function createGeminiProvider(): LLMProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY ausente no .env.local');
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
  const client = new GoogleGenAI({ apiKey });

  return {
    name: 'gemini',
    model,
    supportsWebSearch: true,
    async complete(opts: CompleteOptions): Promise<CompleteResult> {
      const contents = opts.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await withRetry(() =>
        client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: opts.system,
            maxOutputTokens: opts.maxTokens ?? 4096,
            temperature: opts.temperature,
            tools: opts.webSearch ? [{ googleSearch: {} }] : undefined,
            responseMimeType: opts.jsonMode && !opts.webSearch ? 'application/json' : undefined,
          },
        }),
      );

      const text = response.text ?? '';
      const citations: Citation[] = [];
      const candidates = (response as unknown as {
        candidates?: Array<{
          groundingMetadata?: {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          };
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      }).candidates;
      const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          citations.push({ url: chunk.web.uri, title: chunk.web.title });
        }
      }

      const usageMeta = (response as unknown as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          toolUsePromptTokenCount?: number;
          totalTokenCount?: number;
        };
      }).usageMetadata;
      const inputTokens = usageMeta?.promptTokenCount ?? 0;
      const outputTokens = usageMeta?.candidatesTokenCount ?? 0;
      const totalTokens = usageMeta?.totalTokenCount ?? inputTokens + outputTokens;
      const reportedToolTokens = usageMeta?.toolUsePromptTokenCount ?? 0;
      const derivedToolTokens = Math.max(0, totalTokens - inputTokens - outputTokens);
      const toolTokens = reportedToolTokens || derivedToolTokens;

      return {
        text: text.trim(),
        citations,
        usage: {
          inputTokens,
          outputTokens,
          toolTokens,
          totalTokens,
          groundingRequests: opts.webSearch ? 1 : 0,
        },
        raw: response,
      };
    },
  };
}
