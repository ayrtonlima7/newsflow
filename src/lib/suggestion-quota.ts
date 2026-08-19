/**
 * Cota diária de regeneração de sugestões de tópicos.
 *
 * Por que existe: cada regeneração é uma chamada de LLM (custo real). O usuário
 * pode pedir sugestões novas se as primeiras não serviram, mas com teto por dia.
 *
 * O contador vive numa tabela auxiliar com RLS ligada e SEM policies (só o
 * service-role acessa) — igual `email_verifications`. Se ficasse em `profiles`,
 * que o dono lê/escreve via RLS, o usuário poderia zerar a própria cota. Também
 * não pode ficar em `profiles` por um motivo prático: durante o ONBOARDING o
 * perfil ainda não existe.
 */

/** Regenerações explícitas permitidas por dia. */
export const SUGGESTIONS_DAILY_LIMIT = 2;

export interface QuotaRow {
  used_date: string | null;
  used_count: number | null;
}

export interface QuotaDecision {
  /** Pode gerar agora? */
  allowed: boolean;
  /** Valor a gravar em used_count (só relevante quando allowed). */
  nextCount: number;
  /** Quantas sobram DEPOIS desta geração (0 quando bloqueado). */
  remaining: number;
}

/**
 * Decide se a próxima regeneração é permitida — pura e determinística.
 *
 * `row` null (primeira vez) ou de outro dia → o contador zera. Mesmo dia →
 * compara com o limite.
 */
export function decideQuota(
  row: QuotaRow | null,
  today: string,
  limit: number = SUGGESTIONS_DAILY_LIMIT,
): QuotaDecision {
  const sameDay = !!row?.used_date && row.used_date === today;
  const used = sameDay ? (row?.used_count ?? 0) : 0;

  if (used >= limit) {
    return { allowed: false, nextCount: used, remaining: 0 };
  }
  const nextCount = used + 1;
  return { allowed: true, nextCount, remaining: Math.max(0, limit - nextCount) };
}

/**
 * Data-calendário de São Paulo (YYYY-MM-DD). O produto é BR-centrado — usar UTC
 * faria a cota virar às 21h locais, o que confunde o usuário.
 */
export function spToday(now: Date = new Date()): string {
  const SP_OFFSET_HOURS = -3;
  return new Date(now.getTime() + SP_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}
