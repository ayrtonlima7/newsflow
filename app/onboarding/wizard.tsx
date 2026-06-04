'use client';

import { useState, useTransition } from 'react';
import { questions, isQuestionShown, type QuestionId } from './questions';
import { StepCard } from './step-card';
import { ConfirmCard } from './confirm-card';
import { generateTopicSuggestions } from './actions';
import type { Profile } from '@/src/lib/types';

type Answers = {
  nome: string;
  tema: string[];
  contexto: string;
  descricao_livre: string;
  objetivo: string;
  topicos: string[];
  referencias: string[];
  formatos: string[];
  ignorar: string[];
  frequencia: string;
};

const empty: Answers = {
  nome: '',
  tema: [],
  contexto: '',
  descricao_livre: '',
  objetivo: '',
  topicos: [],
  referencias: [],
  formatos: [],
  ignorar: [],
  frequencia: '',
};

export function OnboardingWizard({ userEmail }: { userEmail: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(empty);
  const [dynamicTopics, setDynamicTopics] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
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

    // Trigger LLM topic suggestions ANTES de mostrar a pergunta `topicos`
    if (
      nextQuestion?.id === 'topicos' &&
      nextQuestion.type === 'multi' &&
      nextQuestion.dynamic &&
      dynamicTopics.length === 0
    ) {
      setLoadingTopics(true);
      setTopicsError(null);
      startTransition(async () => {
        const { topics, error } = await generateTopicSuggestions({
          nome: answers.nome,
          tema: answers.tema,
          contexto: answers.contexto,
          descricao_livre: answers.descricao_livre,
          objetivo: answers.objetivo,
        });
        if (error) setTopicsError(error);
        setDynamicTopics(topics);
        setLoadingTopics(false);
        setStep(nextVisible!);
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
      horario: '8h',
    };
    return <ConfirmCard profile={profile} onEdit={jumpToStart} />;
  }

  // Numeração visível: posição da pergunta atual entre as visíveis
  const visibleIndex = visibleQuestions.findIndex((q) => q.id === currentQuestion!.id);
  const visibleTotal = visibleQuestions.length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>
          Pergunta {visibleIndex + 1} de {visibleTotal}
        </span>
        <span>{userEmail}</span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full bg-[var(--color-fg)] transition-all"
          style={{ width: `${((visibleIndex + 1) / visibleTotal) * 100}%` }}
        />
      </div>

      <StepCard
        question={currentQuestion!}
        value={currentValue}
        onChange={updateAnswer}
        loading={loadingTopics && currentQuestion!.id === 'topicos'}
        dynamicChips={dynamicTopics}
      />

      {topicsError && currentQuestion!.id === 'topicos' && (
        <p className="text-sm text-amber-700">
          {topicsError}. Você ainda pode adicionar tópicos manualmente.
        </p>
      )}

      <div className="flex justify-between gap-2 pt-4">
        <button
          type="button"
          onClick={prev}
          disabled={step === 0 || loadingTopics}
          className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm transition hover:border-[var(--color-fg)] disabled:opacity-40"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canAdvance() || loadingTopics}
          className="rounded-md bg-[var(--color-accent)] px-6 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
        >
          {visibleIndex === visibleTotal - 1 ? 'Revisar' : 'Próxima'}
        </button>
      </div>
    </div>
  );
}
