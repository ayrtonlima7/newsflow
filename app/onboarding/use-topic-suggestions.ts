'use client';

import { useState } from 'react';
import { regenerateTopicSuggestions, type TopicSuggestionsContext } from './actions';
import { useT } from '../_i18n/provider';
import { SUGGESTIONS_DAILY_LIMIT } from '@/src/lib/suggestion-quota';

/**
 * Estado compartilhado das sugestões de tópicos (chips dinâmicos + cota).
 *
 * Existe pra o onboarding e o /settings terem comportamento IDÊNTICO sem
 * duplicar a máquina de estado (gerando / bloqueado / aviso de saldo).
 */
export function useTopicSuggestions(initial: string[] = []) {
  const t = useT();
  const [topics, setTopics] = useState<string[]>(initial);
  const [regenerating, setRegenerating] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const limitNote = () =>
    t('topics.limitReached', { n: SUGGESTIONS_DAILY_LIMIT });

  async function regenerate(ctx: TopicSuggestionsContext) {
    setRegenerating(true);
    setNote(null);
    try {
      const res = await regenerateTopicSuggestions(ctx);

      if (res.limitReached) {
        setBlocked(true);
        setNote(limitNote());
        return;
      }
      if (res.error && res.topics.length === 0) {
        setNote(res.error);
        return;
      }

      setTopics(res.topics);

      // `remaining` só vem quando a cota foi realmente apurada (migration
      // aplicada). Sem ela, não inventamos saldo — apenas não mostramos aviso.
      if (res.remaining !== undefined) {
        if (res.remaining <= 0) {
          setBlocked(true);
          setNote(limitNote());
        } else {
          setNote(
            res.remaining === 1
              ? t('topics.remaining', { n: res.remaining })
              : t('topics.remainingPlural', { n: res.remaining }),
          );
        }
      }
    } finally {
      setRegenerating(false);
    }
  }

  return { topics, setTopics, regenerating, blocked, note, regenerate };
}
