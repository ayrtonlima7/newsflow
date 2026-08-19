'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { getQuestions, isQuestionShown, type QuestionId } from './questions';
import { StepCard } from './step-card';
import { ConfirmCard } from './confirm-card';
import { generateTopicSuggestions } from './actions';
import { useTopicSuggestions } from './use-topic-suggestions';
import { useT, useLocale } from '../_i18n/provider';
import { track } from '@/src/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/src/lib/analytics/events';
import type { Profile } from '@/src/lib/types';

type Answers = {
  nome: string;
  tema: string[];
  contexto: string[];
  descricao_livre: string;
  objetivo: string[];
  topicos: string[];
  referencias: string[];
  formatos: string[];
  ignorar: string[];
  frequencia: string;
  horario: string;
};

const empty: Answers = {
  nome: '',
  tema: [],
  contexto: [],
  descricao_livre: '',
  objetivo: [],
  topicos: [],
  referencias: [],
  formatos: [],
  ignorar: [],
  frequencia: '',
  horario: '',
};

export function OnboardingWizard({ userEmail }: { userEmail: string }) {
  const t = useT();
  const locale = useLocale();
  const questions = useMemo(() => getQuestions(locale), [locale]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(empty);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  // Sugestões + cota de regeneração (mesmo hook usado em /settings).
  // `setTopics` alimenta a geração AUTOMÁTICA do wizard (que não gasta cota).
  const {
    topics: dynamicTopics,
    setTopics: setDynamicTopics,
    regenerating,
    blocked: regenBlocked,
    note: regenNote,
    regenerate,
  } = useTopicSuggestions();
  const [, startTransition] = useTransition();

  // Total de perguntas visíveis (varia com a pergunta condicional)
  const visibleQuestions = questions.filter((q) =>
    isQuestionShown(q, answers as Record<QuestionId, string | string[]>),
  );
  const isConfirm = step >= questions.length;
  const currentQuestion = isConfirm ? null : questions[step];

  // Se o step atual cair em pergunta condicional não visível, pula automaticamente
  // (raro mas pode acontecer se user voltar e mudar contexto)
  if (currentQuestion && !isQuestionShown(currentQuestion, answers as Record<QuestionId, string | string[]>)) {
    // próximo render avança
    setTimeout(() => {
      const nextVisible = findNextVisible(step + 1, answers);
      if (nextVisible !== null) setStep(nextVisible);
      else setStep(questions.length);
    }, 0);
  }

  const currentValue = currentQuestion
    ? (answers as Record<string, string | string[]>)[currentQuestion.id]
    : '';

  // --- Analytics do funil ---
  // Abriu o wizard (uma vez por montagem).
  useEffect(() => {
    track(ANALYTICS_EVENTS.ONBOARDING_STARTED);
  }, []);

  // Chegou em CADA pergunta — keyado por question_id (não por índice, porque há
  // perguntas condicionais). É isto que desenha a curva de drop-off por
  // pergunta. Não dispara na tela de confirmação (currentQuestion === null).
  const currentQuestionId = currentQuestion?.id;
  useEffect(() => {
    if (!currentQuestionId) return;
    const idx = visibleQuestions.findIndex((q) => q.id === currentQuestionId);
    if (idx < 0) return;
    track(ANALYTICS_EVENTS.ONBOARDING_STEP, {
      question_id: currentQuestionId,
      position: idx + 1,
      total_visible: visibleQuestions.length,
    });
    // só re-dispara quando MUDA de pergunta; visibleQuestions muda de identidade
    // a cada render, então fica fora das deps de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId]);

  function updateAnswer(value: string | string[]) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  }

  function canAdvance(): boolean {
    if (!currentQuestion) return true;
    if (!currentQuestion.required) return true;
    const v = (answers as Record<string, string | string[]>)[currentQuestion.id];
    if (currentQuestion.type === 'multi') {
      const min = currentQuestion.minSelections ?? 1;
      return Array.isArray(v) && v.length >= min;
    }
    return typeof v === 'string' && v.trim().length > 0;
  }

  function findNextVisible(fromIndex: number, ans: Answers): number | null {
    for (let i = fromIndex; i < questions.length; i++) {
      if (isQuestionShown(questions[i], ans as Record<QuestionId, string | string[]>)) {
        return i;
      }
    }
    return null;
  }

  function findPrevVisible(fromIndex: number, ans: Answers): number | null {
    for (let i = fromIndex; i >= 0; i--) {
      if (isQuestionShown(questions[i], ans as Record<QuestionId, string | string[]>)) {
        return i;
      }
    }
    return null;
  }

  async function next() {
    if (!canAdvance()) return;

    const nextVisible = findNextVisible(step + 1, answers);
    const nextQuestion = nextVisible !== null ? questions[nextVisible] : null;

    // Pra pergunta dinâmica (topicos), TRANSITA primeiro e dispara LLM em
    // paralelo. Assim o usuário vê a tela nova com loading inline em vez de
    // ficar parado no botão travado.
    if (
      nextQuestion?.id === 'topicos' &&
      nextQuestion.type === 'multi' &&
      nextQuestion.dynamic &&
      dynamicTopics.length === 0
    ) {
      setStep(nextVisible!);
      setLoadingTopics(true);
      setTopicsError(null);
      startTransition(async () => {
        const { topics, error } = await generateTopicSuggestions({
          nome: answers.nome,
          tema: answers.tema,
          contexto: answers.contexto,
          descricao_livre: answers.descricao_livre,
          objetivo: answers.objetivo,
          referencias: answers.referencias,
          formatos: answers.formatos,
          ignorar: answers.ignorar,
        });
        if (error) setTopicsError(error);
        setDynamicTopics(topics);
        setLoadingTopics(false);
      });
      return;
    }

    if (nextVisible !== null) setStep(nextVisible);
    else setStep(questions.length);
  }

  function prev() {
    const prevVisible = findPrevVisible(step - 1, answers);
    if (prevVisible !== null) setStep(prevVisible);
  }

  function jumpToStart() {
    setStep(0);
  }

  if (isConfirm) {
    const profile: Profile = {
      nome: answers.nome,
      tema: answers.tema,
      contexto: answers.contexto,
      descricao_livre: answers.descricao_livre,
      objetivo: answers.objetivo,
      topicos: answers.topicos,
      referencias: answers.referencias,
      formatos: answers.formatos,
      ignorar: answers.ignorar,
      frequencia: answers.frequencia,
      horario: answers.horario || '8h',
    };
    return <ConfirmCard profile={profile} onEdit={jumpToStart} />;
  }

  // Numeração visível: posição da pergunta atual entre as visíveis
  const visibleIndex = visibleQuestions.findIndex((q) => q.id === currentQuestion!.id);
  const visibleTotal = visibleQuestions.length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>{t('onb.progress', { n: visibleIndex + 1, total: visibleTotal })}</span>
        <span>{userEmail}</span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          className="h-full bg-[var(--color-accent)] transition-all"
          style={{ width: `${((visibleIndex + 1) / visibleTotal) * 100}%` }}
        />
      </div>

      <StepCard
        question={currentQuestion!}
        value={currentValue}
        onChange={updateAnswer}
        loading={loadingTopics && currentQuestion!.id === 'topicos'}
        dynamicChips={dynamicTopics}
        {...(currentQuestion!.id === 'topicos'
          ? {
              onRegenerate: () =>
                regenerate({
                  nome: answers.nome,
                  tema: answers.tema,
                  contexto: answers.contexto,
                  descricao_livre: answers.descricao_livre,
                  objetivo: answers.objetivo,
                  referencias: answers.referencias,
                  formatos: answers.formatos,
                  ignorar: answers.ignorar,
                }),
              regenerating,
              regenerateBlocked: regenBlocked,
              regenerateNote: regenNote,
            }
          : {})}
      />

      {topicsError && currentQuestion!.id === 'topicos' && (
        <p className="text-sm text-amber-700">
          {topicsError}. {t('onb.topicsErrorSuffix')}
        </p>
      )}

      <div className="flex justify-between gap-2 pt-4">
        <button
          type="button"
          onClick={prev}
          disabled={step === 0 || loadingTopics}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm transition hover:border-[var(--color-fg)] disabled:opacity-40"
        >
          {t('onb.back')}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canAdvance() || loadingTopics}
          className="rounded-md bg-[var(--color-accent)] px-6 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
        >
          {visibleIndex === visibleTotal - 1 ? t('onb.review') : t('onb.next')}
        </button>
      </div>
    </div>
  );
}
