'use client';

import { useState, useTransition } from 'react';
import { questions } from './questions';
import { StepCard } from './step-card';
import { ConfirmCard } from './confirm-card';
import { generateTopicSuggestions } from './actions';
import type { Profile } from '@/src/lib/types';

type Answers = {
  area: string;
  cargo: string;
  topicos: string[];
  ignorar: string[];
  frequencia: string;
  horario: string;
  tom: string;
  fontes_prioritarias: string[];
};

const empty: Answers = {
  area: '',
  cargo: '',
  topicos: [],
  ignorar: [],
  frequencia: '',
  horario: '',
  tom: '',
  fontes_prioritarias: [],
};

export function OnboardingWizard({ userEmail }: { userEmail: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(empty);
  const [dynamicTopics, setDynamicTopics] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isConfirm = step === questions.length;
  const currentQuestion = isConfirm ? null : questions[step];
  const currentValue = currentQuestion ? (answers as Record<string, string | string[]>)[currentQuestion.id] : '';

  function updateAnswer(value: string | string[]) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  }

  function canAdvance(): boolean {
    if (!currentQuestion) return true;
    const v = (answers as Record<string, string | string[]>)[currentQuestion.id];
    if (currentQuestion.type === 'multi') {
      const min = currentQuestion.minSelections ?? 0;
      return Array.isArray(v) && v.length >= min;
    }
    return typeof v === 'string' && v.trim().length > 0;
  }

  async function next() {
    if (!canAdvance()) return;

    // Antes de mostrar a pergunta 3 (índice 2), gerar tópicos dinâmicos
    if (step === 1 && dynamicTopics.length === 0) {
      setLoadingTopics(true);
      setTopicsError(null);
      startTransition(async () => {
        const { topics, error } = await generateTopicSuggestions(answers.area, answers.cargo);
        if (error) setTopicsError(error);
        setDynamicTopics(topics);
        setLoadingTopics(false);
        setStep(step + 1);
      });
      return;
    }

    setStep(step + 1);
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  function jumpToStart() {
    setStep(0);
  }

  if (isConfirm) {
    const profile: Profile = {
      ...answers,
      descricoes_livres: {},
    };
    return <ConfirmCard profile={profile} onEdit={jumpToStart} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>
          Pergunta {step + 1} de {questions.length}
        </span>
        <span>{userEmail}</span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full bg-[var(--color-fg)] transition-all"
          style={{ width: `${((step + 1) / questions.length) * 100}%` }}
        />
      </div>

      <StepCard
        question={currentQuestion!}
        value={currentValue}
        onChange={updateAnswer}
        loading={loadingTopics && step === 2}
        dynamicChips={dynamicTopics}
      />

      {topicsError && step === 2 && (
        <p className="text-sm text-amber-700">
          {topicsError}. Você ainda pode adicionar tópicos manualmente abaixo.
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
          {step === questions.length - 1 ? 'Revisar' : 'Próxima'}
        </button>
      </div>
    </div>
  );
}
