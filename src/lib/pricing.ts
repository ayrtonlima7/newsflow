// Pricing em USD por 1M tokens — verifique sempre antes de assumir custos reais.
// Fontes: ai.google.dev/pricing (Gemini), platform.deepseek.com (DeepSeek)
// Última atualização manual: 2026-05

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  inputPer1MLong?: number;
  outputPer1MLong?: number;
  longContextThreshold?: number;
}

const PRICING: Record<string, ModelPricing> = {
  'gemini-2.5-pro': {
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    inputPer1MLong: 2.5,
    outputPer1MLong: 15.0,
    longContextThreshold: 200_000,
  },
  'gemini-2.5-flash': {
    inputPer1M: 0.3,
    outputPer1M: 2.5,
  },
  'gemini-2.5-flash-lite': {
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
  'deepseek-chat': {
    inputPer1M: 0.27,
    outputPer1M: 1.1,
  },
  'deepseek-reasoner': {
    inputPer1M: 0.55,
    outputPer1M: 2.19,
  },
};

// Google Search grounding: $35 por 1k requests após 1.500 grátis/dia.
// Tratamos sempre como custo (pessimista). 1 generateContent grounded = 1 request.
const GROUNDING_REQUEST_PRICE_USD = 35.0 / 1000;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  toolTokens: number;
  totalTokens: number;
  groundingRequests: number;
}

export interface CostBreakdown {
  inputUSD: number;
  outputUSD: number;
  groundingUSD: number;
  totalUSD: number;
  totalBRL: number;
  usdBrlRate: number;
  modelKnown: boolean;
}

export function calculateCost(model: string, usage: Usage): CostBreakdown {
  const pricing = PRICING[model];
  const rate = Number(process.env.USD_BRL_RATE ?? '5.50');

  if (!pricing) {
    return {
      inputUSD: 0,
      outputUSD: 0,
      groundingUSD: usage.groundingRequests * GROUNDING_REQUEST_PRICE_USD,
      totalUSD: 0,
      totalBRL: 0,
      usdBrlRate: rate,
      modelKnown: false,
    };
  }

  const billedInputTokens = usage.inputTokens + usage.toolTokens;

  const isLongContext =
    pricing.longContextThreshold !== undefined &&
    billedInputTokens > pricing.longContextThreshold;

  const inputRate =
    isLongContext && pricing.inputPer1MLong !== undefined
      ? pricing.inputPer1MLong
      : pricing.inputPer1M;
  const outputRate =
    isLongContext && pricing.outputPer1MLong !== undefined
      ? pricing.outputPer1MLong
      : pricing.outputPer1M;

  const inputUSD = (billedInputTokens / 1_000_000) * inputRate;
  const outputUSD = (usage.outputTokens / 1_000_000) * outputRate;
  const groundingUSD = usage.groundingRequests * GROUNDING_REQUEST_PRICE_USD;
  const totalUSD = inputUSD + outputUSD + groundingUSD;

  return {
    inputUSD,
    outputUSD,
    groundingUSD,
    totalUSD,
    totalBRL: totalUSD * rate,
    usdBrlRate: rate,
    modelKnown: true,
  };
}

export function formatCost(usage: Usage, cost: CostBreakdown, model: string): string {
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const billedInput = usage.inputTokens + usage.toolTokens;
  const lines: string[] = [];

  if (usage.toolTokens > 0) {
    lines.push(
      `tokens: ${fmt(usage.inputTokens)} prompt + ${fmt(usage.toolTokens)} tool/grounding + ${fmt(usage.outputTokens)} out = ${fmt(usage.totalTokens)} total`,
    );
  } else {
    lines.push(`tokens: ${fmt(usage.inputTokens)} in + ${fmt(usage.outputTokens)} out = ${fmt(usage.totalTokens)} total`);
  }
  if (usage.groundingRequests > 0) {
    lines.push(`web search: ${usage.groundingRequests} grounded request${usage.groundingRequests > 1 ? 's' : ''} (1.500/dia grátis no Gemini)`);
  }
  if (!cost.modelKnown) {
    lines.push(`custo: ⚠️  pricing desconhecido para o modelo "${model}" — atualize src/lib/pricing.ts`);
    if (cost.groundingUSD > 0) {
      lines.push(`grounding: $${cost.groundingUSD.toFixed(4)} (R$ ${(cost.groundingUSD * cost.usdBrlRate).toFixed(4)})`);
    }
    return lines.join('\n         ');
  }
  const inputLabel = usage.toolTokens > 0 ? `input $${cost.inputUSD.toFixed(4)} (${fmt(billedInput)} tokens)` : `input $${cost.inputUSD.toFixed(4)}`;
  lines.push(
    `custo:  ${inputLabel}  +  output $${cost.outputUSD.toFixed(4)}` +
      (cost.groundingUSD > 0 ? `  +  grounding $${cost.groundingUSD.toFixed(4)}` : ''),
  );
  lines.push(
    `total:  $${cost.totalUSD.toFixed(4)}  ≈  R$ ${cost.totalBRL.toFixed(4)}  (USD/BRL = ${cost.usdBrlRate.toFixed(2)})`,
  );
  return lines.join('\n         ');
}
