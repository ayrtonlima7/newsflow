'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Question } from './questions';

interface Props {
  question: Question;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  loading?: boolean;
  dynamicChips?: string[];
}

export function StepCard({ question, value, onChange, loading, dynamicChips }: Props) {
  const chips = question.type === 'multi' && question.dynamic ? (dynamicChips ?? []) : question.chips;
  const isMulti = question.type === 'multi';
  const selected = isMulti ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? value : '';

  const [freeText, setFreeText] = useState('');

  // Limpa o campo livre quando muda de pergunta
  useEffect(() => {
    setFreeText('');
  }, [question.id]);

  function toggleChip(chip: string) {
    if (isMulti) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(chip) ? arr.filter((c) => c !== chip) : [...arr, chip]);
    } else {
      onChange(chip);
    }
  }

  function addFreeText() {
    const text = freeText.trim();
    if (!text) return;
    if (isMulti) {
      const arr = Array.isArray(value) ? value : [];
      if (!arr.includes(text)) onChange([...arr, text]);
    } else {
      onChange(text);
    }
    setFreeText('');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{question.question}</h2>
        {question.helper && (
          <p className="text-sm text-[var(--color-muted)]">{question.helper}</p>
        )}
      </div>

      {loading ? (
        <div className="rounded-md bg-white border border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">
          ✨ Gerando sugestões personalizadas para você…
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const isSelected = isMulti
              ? Array.isArray(value) && value.includes(chip)
              : value === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip(chip)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition',
                  isSelected
                    ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-white'
                    : 'border-[var(--color-border)] bg-white hover:border-[var(--color-fg)]',
                )}
              >
                {chip}
              </button>
            );
          })}
          {isMulti &&
            Array.isArray(value) &&
            value
              .filter((v) => !chips.includes(v))
              .map((custom) => (
                <button
                  key={custom}
                  type="button"
                  onClick={() => toggleChip(custom)}
                  className="rounded-full border border-[var(--color-fg)] bg-[var(--color-fg)] text-white px-4 py-2 text-sm transition"
                >
                  {custom} ✕
                </button>
              ))}
        </div>
      )}

      {question.allowFree && !loading && (
        <div className="flex gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFreeText();
              }
            }}
            placeholder={isMulti ? 'Adicionar outro…' : 'Outro: descreva'}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm outline-none transition focus:border-[var(--color-fg)]"
          />
          <button
            type="button"
            onClick={addFreeText}
            disabled={!freeText.trim()}
            className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm transition hover:border-[var(--color-fg)] disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
