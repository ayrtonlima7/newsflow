import { getProvider, extractJson } from './providers';
import { buildCuratePrompt, buildRetryCuratePrompt } from '../prompts/curate';
import { buildEmailPrompt } from '../prompts/email';
import { calculateCost } from './pricing';
import { validateBriefingUrls, type DroppedItem, type DegradedItem } from './url-validation';
import { recoverUrlsFromGrounding } from './url-recovery';
import type { Profile, Briefing, BriefingItem, EmailOutput } from './types';
import { frequenciaParaJanela } from './types';

// Limite absoluto pra triggar retry: se o email final ficar abaixo disso,
// vale a pena gastar mais tokens pra encher. Acima disso, aceita o resultado.
const MIN_VALID_ITEMS = 3;

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
  degradedItems?: DegradedItem[];
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

  // Recovery: substituir URLs alucinadas pelas URLs reais das citations do grounding.
  // Roda ANTES de todos os outros filtros — afinal, URL correta muda o resultado da validação.
  const { recoveredItems, stats: recoveryStats } = await recoverUrlsFromGrounding(
    briefing.itens,
    result.citations ?? [],
  );
  briefing.itens = recoveredItems;
  if (recoveryStats.recovered > 0) {
    console.log(
      `[curate] ${recoveryStats.recovered}/${briefing.itens.length} URL(s) recuperada(s) via grounding citations`,
    );
    for (const item of recoveredItems) {
      if (item.urlOriginal) {
        console.log(`  ↳ "${item.titulo}":`);
        console.log(`     antes: ${item.urlOriginal}`);
        console.log(`     agora: ${item.url}`);
      }
    }
  }

  // Primeiro filtro: frescor. Descarta itens fora da janela de tempo OU sem data
  // (antes mesmo de validar URLs — não vale gastar requests HTTP em conteúdo velho).
  const janela = frequenciaParaJanela(profile.frequencia);
  const {
    freshItems,
    staleDropped,
  } = filterByFreshness(briefing.itens, janela.cutoffISO);
  if (staleDropped.length > 0) {
    console.warn(
      `[curate] ${staleDropped.length}/${briefing.itens.length} item(s) descartado(s) por frescor (cutoff: ${janela.cutoffISO}):`,
    );
    for (const d of staleDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason} (data: ${d.item.data_publicacao || 'AUSENTE'})`);
    }
  }

  const { validItems, droppedItems, degradedItems } = await validateBriefingUrls(freshItems);
  if (droppedItems.length > 0) {
    console.warn(
      `[curate] ${droppedItems.length}/${briefing.itens.length} item(s) descartado(s) por URL inválida:`,
    );
    for (const d of droppedItems) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason} (${d.item.url})`);
    }
  }
  if (degradedItems.length > 0) {
    console.warn(
      `[curate] ${degradedItems.length}/${briefing.itens.length} item(s) com URL degradada (fallback/source-only):`,
    );
    for (const d of degradedItems) {
      console.warn(
        `  ~ "${d.item.titulo}" → status=${d.item.urlStatus} | ${d.reason} | usando ${d.item.url}`,
      );
    }
  }

  // Aggregate accumulators (cost/usage somam retry; itens são merge)
  const accValid: typeof validItems = [...validItems];
  const accDropped: typeof droppedItems = [...staleDropped, ...droppedItems];
  const accDegraded: typeof degradedItems = [...degradedItems];
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
      accDegraded.push(...retryResult.newDegradedItems);
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
      ...(accDegraded.length > 0 ? { degradedItems: accDegraded } : {}),
      ...(retryRan ? { retryRan: true } : {}),
    },
  };
}

/**
 * Filtra itens por frescor — descarta os que estão fora da janela ou sem data.
 * Roda ANTES da validação de URL (não vale gastar requests HTTP em conteúdo velho).
 *
 * Critérios pra descarte:
 *   - data_publicacao ausente ou inválida
 *   - data_publicacao < cutoffISO (mais antiga que o limite máximo)
 */
function filterByFreshness(
  items: BriefingItem[],
  cutoffISO: string,
): { freshItems: BriefingItem[]; staleDropped: DroppedItem[] } {
  const freshItems: BriefingItem[] = [];
  const staleDropped: DroppedItem[] = [];

  for (const item of items) {
    const date = item.data_publicacao;
    if (!date || typeof date !== 'string') {
      staleDropped.push({ item, reason: 'sem data_publicacao' });
      continue;
    }
    // Validação básica de formato YYYY-MM-DD (não checagem rigorosa)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      staleDropped.push({ item, reason: `data inválida: "${date}"` });
      continue;
    }
    // Comparação ISO string funciona porque YYYY-MM-DD ordena corretamente
    if (date < cutoffISO) {
      staleDropped.push({ item, reason: `antigo (publicado em ${date}, cutoff ${cutoffISO})` });
      continue;
    }
    freshItems.push(item);
  }

  return { freshItems, staleDropped };
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
  newDegradedItems: DegradedItem[];
  usage: PipelineUsage;
  elapsedSeconds: number;
} | null> {
  const provider = await getProvider();
  if (!provider.supportsWebSearch) return null;

  const retryTargetJanela = frequenciaParaJanela(profile.frequencia);
  const { system, user } = buildRetryCuratePrompt(profile, {
    validItems,
    brokenItems: droppedItems.map((d) => ({
      titulo: d.item.titulo,
      url: d.item.url,
      reason: d.reason,
    })),
    targetMin: retryTargetJanela.itemsMin,
    targetMax: retryTargetJanela.itemsMax,
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
    return {
      newValidItems: [],
      newDroppedItems: [],
      newDegradedItems: [],
      usage: result.usage,
      elapsedSeconds,
    };
  }

  let retryBriefing: Briefing;
  try {
    retryBriefing = extractJson<Briefing>(result.text);
  } catch (err) {
    console.warn('[curate.retry] falha ao parsear JSON:', err);
    return {
      newValidItems: [],
      newDroppedItems: [],
      newDegradedItems: [],
      usage: result.usage,
      elapsedSeconds,
    };
  }

  // Recovery via grounding citations no retry também
  const { recoveredItems: retryRecovered, stats: retryRecoveryStats } =
    await recoverUrlsFromGrounding(retryBriefing.itens, result.citations ?? []);
  if (retryRecoveryStats.recovered > 0) {
    console.log(
      `[curate.retry] ${retryRecoveryStats.recovered} URL(s) recuperada(s) via grounding`,
    );
  }

  // Filtra URLs já presentes no primeiro pass (válidas ou descartadas)
  const seen = new Set<string>([
    ...validItems.map((v) => v.url),
    ...droppedItems.map((d) => d.item.url),
  ]);
  const candidates = retryRecovered.filter((i) => !seen.has(i.url));
  if (candidates.length < retryRecovered.length) {
    console.warn(
      `[curate.retry] modelo retornou ${retryRecovered.length - candidates.length} item(s) repetido(s) — descartados`,
    );
  }

  // Filtro de frescor no retry também
  const retryJanela = frequenciaParaJanela(profile.frequencia);
  const { freshItems: retryFresh, staleDropped: retryStale } = filterByFreshness(
    candidates,
    retryJanela.cutoffISO,
  );
  if (retryStale.length > 0) {
    console.warn(`[curate.retry] ${retryStale.length} item(s) descartado(s) por frescor:`);
    for (const d of retryStale) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
  }

  const {
    validItems: retryValid,
    droppedItems: retryDropped,
    degradedItems: retryDegraded,
  } = await validateBriefingUrls(retryFresh);
  if (retryDropped.length > 0) {
    console.warn(`[curate.retry] validação derrubou ${retryDropped.length}/${candidates.length}:`);
    for (const d of retryDropped) {
      console.warn(`  - "${d.item.titulo}" → ${d.reason}`);
    }
  }
  if (retryDegraded.length > 0) {
    console.warn(`[curate.retry] ${retryDegraded.length} item(s) degradado(s) no retry:`);
    for (const d of retryDegraded) {
      console.warn(`  ~ "${d.item.titulo}" → status=${d.item.urlStatus}`);
    }
  }

  return {
    newValidItems: retryValid,
    newDroppedItems: [...retryStale, ...retryDropped],
    newDegradedItems: retryDegraded,
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
