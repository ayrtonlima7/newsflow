import { getProvider, extractJson } from './providers';
import { buildCuratePrompt, buildRetryCuratePrompt } from '../prompts/curate';
import { buildEmailPrompt } from '../prompts/email';
import { calculateCost } from './pricing';
import { validateBriefingUrls, type DroppedItem } from './url-validation';
import type { Profile, Briefing, EmailOutput } from './types';

const MIN_VALID_ITEMS = 3;
const TARGET_MIN = 4;
const TARGET_MAX = 7;

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
  retryRan?: boolean;
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
    maxTokens: 8192,
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

  // Aggregate accumulators (cost/usage somam retry; itens são merge)
  const accValid: typeof validItems = [...validItems];
  const accDropped: typeof droppedItems = [...droppedItems];
  let accUsage = { ...result.usage };
  let accElapsedSeconds = elapsedSeconds;
  let retryRan = false;

  // Retry pass: só se poucos válidos sobreviveram E houve descartes (evita loop quando o modelo simplesmente retornou pouco)
  if (validItems.length < MIN_VALID_ITEMS && droppedItems.length > 0) {
    console.warn(
      `[curate] só ${validItems.length} item(s) válido(s) (alvo: ${MIN_VALID_ITEMS}+). Executando retry pass…`,
    );
    const retryResult = await retryCurate(profile, accValid, accDropped);
    retryRan = true;
    if (retryResult) {
      accValid.push(...retryResult.newValidItems);
      accDropped.push(...retryResult.newDroppedItems);
      accUsage = sumUsage(accUsage, retryResult.usage);
      accElapsedSeconds += retryResult.elapsedSeconds;
      console.warn(
        `[curate] retry: +${retryResult.newValidItems.length} válido(s), +${retryResult.newDroppedItems.length} descartado(s). Total agora: ${accValid.length} item(s).`,
      );
    } else {
      console.warn('[curate] retry pass não conseguiu executar (provider sem web search?)');
    }
  }

  briefing.itens = accValid;

  const cost = calculateCost(provider.model, accUsage);
  return {
    briefing,
    meta: {
      provider: provider.name,
      model: provider.model,
      elapsedSeconds: accElapsedSeconds,
      usage: accUsage,
      cost,
      citations: result.citations,
      droppedItems: accDropped,
      ...(retryRan ? { retryRan: true } : {}),
    },
  };
}

function sumUsage(a: PipelineUsage, b: PipelineUsage): PipelineUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    toolTokens: a.toolTokens + b.toolTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    groundingRequests: a.groundingRequests + b.groundingRequests,
  };
}

async function retryCurate(
  profile: Profile,
  validItems: Briefing['itens'],
  droppedItems: DroppedItem[],
): Promise<{
  newValidItems: Briefing['itens'];
  newDroppedItems: DroppedItem[];
  usage: PipelineUsage;
  elapsedSeconds: number;
} | null> {
  const provider = await getProvider();
  if (!provider.supportsWebSearch) return null;

  const { system, user } = buildRetryCuratePrompt(profile, {
    validItems,
    brokenItems: droppedItems.map((d) => ({
      titulo: d.item.titulo,
      url: d.item.url,
      reason: d.reason,
    })),
    targetMin: TARGET_MIN,
    targetMax: TARGET_MAX,
  });

  const t0 = Date.now();
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: true,
    maxTokens: 8192,
  });
  const elapsedSeconds = (Date.now() - t0) / 1000;

  if (!result.text.trim()) {
    console.warn('[curate.retry] resposta vazia');
    return { newValidItems: [], newDroppedItems: [], usage: result.usage, elapsedSeconds };
  }

  let retryBriefing: Briefing;
  try {
    retryBriefing = extractJson<Briefing>(result.text);
  } catch (err) {
    console.warn('[curate.retry] falha ao parsear JSON:', err);
    return { newValidItems: [], newDroppedItems: [], usage: result.usage, elapsedSeconds };
  }

  // Filtra URLs já presentes no primeiro pass (válidas ou descartadas) — modelo pode ter ignorado instrução
  const seen = new Set<string>([
    ...validItems.map((v) => v.url),
    ...droppedItems.map((d) => d.item.url),
  ]);
  const candidates = retryBriefing.itens.filter((i) => !seen.has(i.url));
  if (candidates.length < retryBriefing.itens.length) {
    console.warn(
      `[curate.retry] modelo retornou ${retryBriefing.itens.length - candidates.length} item(s) repetido(s) — descartados`,
    );
  }

  const { validItems: retryValid, droppedItems: retryDropped } =
    await validateBriefingUrls(candidates);
  if (retryDropped.length > 0) {
    console.warn(`[curate.retry] validação derrubou ${retryDropped.length}/${candidates.length}:`);
    for (const d of retryDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
  }

  return {
    newValidItems: retryValid,
    newDroppedItems: retryDropped,
    usage: result.usage,
    elapsedSeconds,
  };
}

export async function generateEmail(
  profile: Profile,
  briefing: Briefing,
): Promise<{ email: EmailOutput; meta: PipelineMeta }> {
  // Permite usar um provider mais barato pro email (sem busca web).
  // Ex: LLM_PROVIDER=gemini + EMAIL_LLM_PROVIDER=deepseek
  const provider = await getProvider(process.env.EMAIL_LLM_PROVIDER);
  const { system, user } = buildEmailPrompt(profile, briefing);
  const t0 = Date.now();
  const result = await provider.complete({
    system,
    messages: [{ role: 'user', content: user }],
    webSearch: false,
    maxTokens: 8192,
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
