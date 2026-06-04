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
  const chips =
    question.type === 'multi' && question.dynamic ? (dynamicChips ?? []) : question.chips;
  const isMulti = question.type === 'multi';

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

  // Detecta o caso "single + sem chips + texto livre" — usado pelo `nome`.
  // Esse caso usa input bindado direto ao value (sem padrão de "adicionar pill").
  const isSingleFreeText =
    !isMulti && question.chips.length === 0 && question.allowFree && !question.multiline;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{question.question}</h2>
        {question.helper && (
          <p className="text-sm text-[var(--color-muted)]">{question.helper}</p>
        )}
      </div>

      {/* Caso 1: TEXTAREA (descricao_livre) */}
      {question.multiline && (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          rows={4}
          className="w-full resize-none rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        />
      )}

      {/* Caso 2: SINGLE + SEM CHIPS (nome) — input bindado direto */}
      {!question.multiline && isSingleFreeText && (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        />
      )}

      {/* Caso 3: INPUT FIRST (topicos, referencias — Variação B).
          Loading inline: input fica ativo, sugestões mostram skeleton. */}
      {!question.multiline && !isSingleFreeText && question.inputFirst && (
        <InputFirstLayout
          question={question}
          value={value}
          isMulti={isMulti}
          chips={chips}
          freeText={freeText}
          setFreeText={setFreeText}
          addFreeText={addFreeText}
          toggleChip={toggleChip}
          onClearSingle={() => onChange('')}
          loading={loading}
        />
      )}

      {/* Caso 4: LOADING genérico (não inputFirst, mas dinâmico) */}
      {!question.multiline && !isSingleFreeText && !question.inputFirst && loading && (
        <div className="rounded-md bg-white border border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">
          ✨ Gerando sugestões personalizadas para você…
        </div>
      )}

      {/* Caso 5: CHIPS-FIRST (tema, contexto, objetivo, formatos, ignorar, frequencia) */}
      {!question.multiline && !loading && !isSingleFreeText && !question.inputFirst && (
        <ChipsFirstLayout
          value={value}
          isMulti={isMulti}
          chips={chips}
          toggleChip={toggleChip}
          onClearSingle={() => onChange('')}
        />
      )}

      {/* Free-text complementar — só pra chips-first com allowFree.
          Casos: tema (multi), objetivo (single), ignorar (multi). */}
      {!question.multiline &&
        !question.inputFirst &&
        !isSingleFreeText &&
        question.allowFree &&
        !loading && (
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
              placeholder={
                question.placeholder ?? (isMulti ? 'Adicionar outro…' : 'Outro: descreva')
              }
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

/** Layout padrão: chips em destaque. Mostra valor selecionado destacado e
 *  pills customizadas (free-text fora dos chips) também destacadas. */
function ChipsFirstLayout({
  value,
  isMulti,
  chips,
  toggleChip,
  onClearSingle,
}: {
  value: string | string[];
  isMulti: boolean;
  chips: string[];
  toggleChip: (chip: string) => void;
  onClearSingle: () => void;
}) {
  // Pra single: valor custom (não-presente nos chips) — mostra como pill removível
  const singleCustom =
    !isMulti && typeof value === 'string' && value && !chips.includes(value)
      ? value
      : null;

  return (
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

      {/* Pill customizada pra single quando o valor não está nos chips */}
      {singleCustom && (
        <button
          type="button"
          onClick={onClearSingle}
          className="rounded-full border border-[var(--color-fg)] bg-[var(--color-fg)] text-white px-4 py-2 text-sm transition hover:opacity-90"
        >
          {singleCustom} ✕
        </button>
      )}

      {/* Pills customizadas pra multi */}
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
  );
}

/** Variação B: input livre em destaque, chips abaixo como sugestões discretas.
 *  Suporta também single (com pill custom removível), multi (com pills removíveis),
 *  e loading state inline (mostra spinner no lugar das sugestões). */
function InputFirstLayout({
  question,
  value,
  isMulti,
  chips,
  freeText,
  setFreeText,
  addFreeText,
  toggleChip,
  onClearSingle,
  loading,
}: {
  question: Question;
  value: string | string[];
  isMulti: boolean;
  chips: string[];
  freeText: string;
  setFreeText: (s: string) => void;
  addFreeText: () => void;
  toggleChip: (chip: string) => void;
  onClearSingle: () => void;
  loading?: boolean;
}) {
  const selected = isMulti ? (Array.isArray(value) ? value : []) : [];
  const singleVal = !isMulti && typeof value === 'string' && value ? value : null;
  const remainingChips = chips.filter(
    (c) => !selected.includes(c) && c !== singleVal,
  );

  return (
    <div className="space-y-4">
      {/* Input principal — protagonista. Continua disponível mesmo durante loading. */}
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
          placeholder={question.placeholder ?? 'Digite e pressione Enter'}
          className="flex-1 rounded-md border-2 border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        />
        <button
          type="button"
          onClick={addFreeText}
          disabled={!freeText.trim()}
          className="rounded-md bg-[var(--color-fg)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      {/* Pills selecionadas (multi) */}
      {isMulti && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleChip(item)}
              className="rounded-full border border-[var(--color-fg)] bg-[var(--color-fg)] px-3 py-1.5 text-sm text-white transition hover:opacity-90"
            >
              {item} ✕
            </button>
          ))}
        </div>
      )}

      {/* Pill única (single) */}
      {singleVal && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onClearSingle}
            className="rounded-full border border-[var(--color-fg)] bg-[var(--color-fg)] px-3 py-1.5 text-sm text-white transition hover:opacity-90"
          >
            {singleVal} ✕
          </button>
        </div>
      )}

      {/* Loading inline pras sugestões (a IA tá pensando). Input fica ativo. */}
      {loading && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <SpinnerIcon />
            <span>
              ✨ Combinando suas respostas e buscando sugestões pra você… (pode levar
              ~15s)
            </span>
          </div>
          {/* Skeleton pills pra dar peso visual durante o load */}
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className="h-7 w-24 animate-pulse rounded-full bg-stone-200"
                style={{ width: `${60 + ((i * 17) % 60)}px` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sugestões discretas, com prefixo "+" (só quando não tá carregando) */}
      {!loading && remainingChips.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs text-[var(--color-muted)]">
            Sem ideias? Aqui vão sugestões pra você:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {remainingChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip(chip)}
                className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]"
              >
                + {chip}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-[var(--color-muted)]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
