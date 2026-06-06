import type { Locale } from './i18n';

/**
 * Opções canônicas dos 2 campos LOAD-BEARING (lidos por código):
 *   - contexto  → frequenciaParaJanela calibra voz; isQuestionShown mostra descricao_livre
 *   - frequencia → janela/itens/frescor/idempotência
 *
 * O VALOR armazenado é um slug estável e neutro de idioma (ex: 'weekly'); o
 * RÓTULO exibido é traduzido. As funções normalize* toleram tanto o slug novo
 * quanto os rótulos PT legados (linhas de beta antes do backfill) — então nada
 * quebra durante a transição.
 *
 * Os demais campos (tema, objetivo, formatos, ignorar) NÃO precisam disso: são
 * texto livre que só a IA lê (valor = rótulo traduzido, sem slug).
 */

export type ContextoSlug = 'profession' | 'study' | 'hobby' | 'curiosity';
export type FrequenciaSlug = 'daily' | 'every3days' | 'weekly';

export const CONTEXTO_SLUGS: readonly ContextoSlug[] = ['profession', 'study', 'hobby', 'curiosity'];
export const FREQUENCIA_SLUGS: readonly FrequenciaSlug[] = ['daily', 'every3days', 'weekly'];

const CONTEXTO_LABEL: Record<ContextoSlug, Record<Locale, string>> = {
  profession: { pt: 'Profissão', en: 'Profession', es: 'Profesión' },
  study: { pt: 'Estudo', en: 'Study', es: 'Estudio' },
  hobby: { pt: 'Hobby ou paixão', en: 'Hobby or passion', es: 'Hobby o pasión' },
  curiosity: { pt: 'Curiosidade geral', en: 'General curiosity', es: 'Curiosidad general' },
};

const FREQUENCIA_LABEL: Record<FrequenciaSlug, Record<Locale, string>> = {
  daily: { pt: 'Todo dia', en: 'Every day', es: 'Todos los días' },
  every3days: { pt: 'A cada 3 dias', en: 'Every 3 days', es: 'Cada 3 días' },
  weekly: { pt: 'Uma vez por semana', en: 'Once a week', es: 'Una vez por semana' },
};

/** Rótulos PT legados → slug (pra tolerância e backfill). */
const CONTEXTO_LEGACY: Record<string, ContextoSlug> = {
  'profissão': 'profession',
  'profissao': 'profession',
  'estudo': 'study',
  'hobby ou paixão': 'hobby',
  'hobby ou paixao': 'hobby',
  'curiosidade geral': 'curiosity',
};

const FREQUENCIA_LEGACY: Record<string, FrequenciaSlug> = {
  'todo dia': 'daily',
  'a cada 3 dias': 'every3days',
  'uma vez por semana': 'weekly',
};

/** Normaliza um valor de contexto (slug, rótulo PT legado, ou rótulo traduzido) → slug. */
export function normalizeContexto(value: string | null | undefined): ContextoSlug | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if ((CONTEXTO_SLUGS as readonly string[]).includes(v)) return v as ContextoSlug;
  if (CONTEXTO_LEGACY[v]) return CONTEXTO_LEGACY[v];
  // tolera rótulos traduzidos (en/es)
  for (const slug of CONTEXTO_SLUGS) {
    for (const loc of ['pt', 'en', 'es'] as Locale[]) {
      if (CONTEXTO_LABEL[slug][loc].toLowerCase() === v) return slug;
    }
  }
  return null;
}

/** Normaliza um valor de frequência → slug. Tolera slug, PT legado, palavras-chave. */
export function normalizeFrequencia(value: string | null | undefined): FrequenciaSlug {
  if (!value) return 'daily';
  const v = value.trim().toLowerCase();
  if ((FREQUENCIA_SLUGS as readonly string[]).includes(v)) return v as FrequenciaSlug;
  if (FREQUENCIA_LEGACY[v]) return FREQUENCIA_LEGACY[v];
  // heurística por palavra-chave (cobre PT/EN/ES)
  if (v.includes('semana') || v.includes('week') || v.includes('seman')) return 'weekly';
  if (v.includes('3')) return 'every3days';
  return 'daily';
}

export function contextoLabel(value: string | null | undefined, locale: Locale): string {
  const slug = normalizeContexto(value);
  return slug ? CONTEXTO_LABEL[slug][locale] : (value ?? '');
}

export function frequenciaLabel(value: string | null | undefined, locale: Locale): string {
  return FREQUENCIA_LABEL[normalizeFrequencia(value)][locale];
}

/** Opções pra renderizar os chips no onboarding/settings (valor=slug, rótulo traduzido). */
export function contextoOptions(locale: Locale): { value: string; label: string }[] {
  return CONTEXTO_SLUGS.map((s) => ({ value: s, label: CONTEXTO_LABEL[s][locale] }));
}

export function frequenciaOptions(locale: Locale): { value: string; label: string }[] {
  return FREQUENCIA_SLUGS.map((s) => ({ value: s, label: FREQUENCIA_LABEL[s][locale] }));
}
