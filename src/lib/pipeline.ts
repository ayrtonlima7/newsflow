import { getProvider, extractJson } from './providers';
import { buildCuratePrompt } from '../prompts/curate';
import { buildEmailPrompt } from '../prompts/email';
import { calculateCost } from './pricing';
import { validateBriefingUrls, type DroppedItem } from './url-validation';
import type { Profile, Briefing, EmailOutput } from './types';

export interface PipelineUsage {
  inputTokens: number;
  outputTokens: number;
  toolTokens: number;
  totalTokens: number;
  groundingRequests: number;
}

export interface PipelineMeta {
  provider: string;
  model: string;
  elapsedSeconds: number;
  usage: PipelineUsage;
  cost: ReturnType<typeof calculateCost>;
  citations?: { url: string; title?: string }[];
  droppedItems?: DroppedItem[];
}

export async function generateBriefing(
  profile: Profile,
): Promise<{ briefing: Briefing; meta: PipelineMeta }> {
  const provider = await getProvider();
  if (!provider.supportsWebSearch) {
    throw new Error(
      `Provider "${provider.name}" não suporta busca web nativa. Use LLM_PROVIDER=gemini para curadoria.`,
    );
  }
  const { system, user } = buildCuratePrompt(profile);
  const t0 = Date.now();
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: true,
    maxTokens: 4096,
  });
  const elapsedSeconds = (Date.now() - t0) / 1000;
  if (!result.text.trim()) {
    throw new Error('curate: resposta vazia do modelo (tokens esgotados em raciocínio?)');
  }
  const briefing = extractJson<Briefing>(result.text);

  const { validItems, droppedItems } = await validateBriefingUrls(briefing.itens);
  if (droppedItems.length > 0) {
    console.warn(
      `[curate] ${droppedItems.length}/${briefing.itens.length} item(s) descartado(s) por URL inválida:`,
    );
    for (const d of droppedItems) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason} (${d.item.url})`);
    }
  }
  briefing.itens = validItems;

  const cost = calculateCost(provider.model, result.usage);
  return {
    briefing,
    meta: {
      provider: provider.name,
      model: provider.model,
      elapsedSeconds,
      usage: result.usage,
      cost,
      citations: result.citations,
      droppedItems,
    },
  };
}

export async function generateEmail(
  profile: Profile,
  briefing: Briefing,
): Promise<{ email: EmailOutput; meta: PipelineMeta }> {
  const provider = await getProvider();
  const { system, user } = buildEmailPrompt(profile, briefing);
  const t0 = Date.now();
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: false,
    maxTokens: 16384,
    jsonMode: true,
  });
  const elapsedSeconds = (Date.now() - t0) / 1000;
  if (!result.text.trim()) {
    throw new Error('email: resposta vazia do modelo');
  }
  const email = extractJson<EmailOutput>(result.text);
  const cost = calculateCost(provider.model, result.usage);
  return {
    email,
    meta: {
      provider: provider.name,
      model: provider.model,
      elapsedSeconds,
      usage: result.usage,
      cost,
    },
  };
}
