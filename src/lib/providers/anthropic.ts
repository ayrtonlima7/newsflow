import Anthropic from '@anthropic-ai/sdk';
import type { CompleteOptions, CompleteResult, LLMProvider, Citation } from './index.ts';

export function createAnthropicProvider(): LLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente no .env.local');
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey });

  return {
    name: 'anthropic',
    model,
    supportsWebSearch: true,
    async complete(opts: CompleteOptions): Promise<CompleteResult> {
      const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature,
        system: opts.system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: opts.webSearch
          ? ([
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 5,
              },
            ] as unknown as Anthropic.Messages.ToolUnion[])
          : undefined,
      });

      const textParts: string[] = [];
      const citations: Citation[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
          const blockCitations = (block as unknown as { citations?: Array<{ url?: string; title?: string }> }).citations;
          if (Array.isArray(blockCitations)) {
            for (const c of blockCitations) {
              if (c.url) citations.push({ url: c.url, title: c.title });
            }
          }
        }
      }

      return { text: textParts.join('\n').trim(), citations, raw: response };
    },
  };
}
