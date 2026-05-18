import OpenAI from 'openai';
import type { CompleteOptions, CompleteResult, LLMProvider } from './index.ts';

export function createDeepSeekProvider(): LLMProvider {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY ausente no .env.local');
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

  return {
    name: 'deepseek',
    model,
    supportsWebSearch: false,
    async complete(opts: CompleteOptions): Promise<CompleteResult> {
      if (opts.webSearch) {
        throw new Error(
          'DeepSeek não tem busca web nativa. Use anthropic ou gemini para o Prompt 2, ' +
            'ou injete resultados de busca externos no prompt antes de chamar este provider.',
        );
      }

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (opts.system) messages.push({ role: 'system', content: opts.system });
      for (const m of opts.messages) {
        messages.push({ role: m.role, content: m.content });
      }

      const response = await client.chat.completions.create({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature,
      });

      const text = response.choices[0]?.message?.content ?? '';
      const u = response.usage;
      return {
        text: text.trim(),
        citations: [],
        usage: {
          inputTokens: u?.prompt_tokens ?? 0,
          outputTokens: u?.completion_tokens ?? 0,
          toolTokens: 0,
          totalTokens: u?.total_tokens ?? 0,
          groundingRequests: 0,
        },
        raw: response,
      };
    },
  };
}
