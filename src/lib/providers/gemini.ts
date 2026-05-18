import { GoogleGenAI } from '@google/genai';
import type { CompleteOptions, CompleteResult, LLMProvider, Citation } from './index.ts';

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

      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature,
          tools: opts.webSearch ? [{ googleSearch: {} }] : undefined,
        },
      });

      const text = response.text ?? '';
      const citations: Citation[] = [];
      const candidates = (response as unknown as {
        candidates?: Array<{
          groundingMetadata?: {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          };
        }>;
      }).candidates;
      const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          citations.push({ url: chunk.web.uri, title: chunk.web.title });
        }
      }

      return { text: text.trim(), citations, raw: response };
    },
  };
}
