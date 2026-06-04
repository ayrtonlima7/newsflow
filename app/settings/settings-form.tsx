'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { questions, type QuestionId } from '@/app/onboarding/questions';
import { StepCard } from '@/app/onboarding/step-card';
import { updateProfile, setActive, type ProfileUpdateInput } from './actions';

interface Props {
  initial: ProfileUpdateInput;
  isActive: boolean;
}

type Feedback = { kind: 'saved'; text?: string } | { kind: 'error'; text: string };

export function SettingsForm({ initial, isActive: initialActive }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileUpdateInput>(initial);
  const [active, setActiveState] = useState(initialActive);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);

  function update<K extends keyof ProfileUpdateInput>(key: K, value: ProfileUpdateInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateProfile(values);
      if (!res.ok) {
        setFeedback({ kind: 'error', text: res.error ?? 'erro ao salvar' });
        return;
      }
      setFeedback({ kind: 'saved' });
      router.refresh();
    });
  }

  function handleReset() {
    setValues(initial);
    setFeedback(null);
  }

  function handleTogglePause() {
    const next = !active;
    setActiveState(next);
    startTransition(async () => {
      const res = await setActive(next);
      if (!res.ok) {
        setActiveState(!next);
        setFeedback({ kind: 'error', text: res.error ?? 'erro ao alterar status' });
        return;
      }
      router.refresh();
    });
  }

  // Em /settings mostramos TODAS as perguntas (inclusive a condicional),
  // pra o usuário editar livremente. A condicional só esconde no onboarding.
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-white p-5">
        <div>
          <p className="text-sm font-medium">
            {active ? 'Recebendo emails' : 'Entregas pausadas'}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {active
              ? 'Os emails seguem sua frequência configurada.'
              : 'Você não receberá novos emails até reativar.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={pending}
          className={cn(
            'shrink-0 rounded-md px-4 py-2 text-sm transition disabled:opacity-50',
            active
              ? 'border border-[var(--color-border)] bg-white hover:border-[var(--color-fg)]'
              : 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90',
          )}
        >
          {active ? 'Pausar' : 'Reativar'}
        </button>
      </div>

      {questions.map((q) => {
        const id = q.id as QuestionId;
        return (
          <div
            key={id}
            className="rounded-lg border border-[var(--color-border)] bg-white p-6"
          >
            <StepCard
              question={q}
              value={values[id] as string | string[]}
              onChange={(v) => update(id, v as ProfileUpdateInput[typeof id])}
            />
          </div>
        );
      })}

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {feedback?.kind === 'saved' && (
            <span className="text-emerald-700">✓ Salvo!</span>
          )}
          {feedback?.kind === 'error' && (
            <span className="text-red-700">{feedback.text}</span>
          )}
          {!feedback && isDirty && (
            <span className="text-[var(--color-muted)]">Alterações não salvas</span>
          )}
          {!feedback && !isDirty && (
            <span className="text-[var(--color-muted)]">Sem alterações</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || pending}
            className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm transition hover:border-[var(--color-fg)] disabled:opacity-40"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || pending}
            className="rounded-md bg-[var(--color-accent)] px-6 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
          >
            {pending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
