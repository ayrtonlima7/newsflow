'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Question } from './questions';
import { useT } from '../_i18n/provider';

/** Horas cheias 00:00–23:00 pro picker de horário. */
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

interface Props {
  question: Question;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  loading?: boolean;
  dynamicChips?: string[];
  /** Quando fornecido, mostra o botão de (re)gerar sugestões abaixo dos chips.
   *  Opt-in: só as telas que sabem gerar (onboarding e /settings) passam. */
  onRegenerate?: () => void;
  /** Geração sob demanda em andamento (trava o botão). */
  regenerating?: boolean;
  /** Cota esgotada — desabilita o botão e exibe `regenerateNote`. */
  regenerateBlocked?: boolean;
  /** Aviso curto sob o botão (ex: "resta 1 hoje" ou limite atingido). */
  regenerateNote?: string | null;
}

export function StepCard({
  question,
  value,
  onChange,
  loading,
  dynamicChips,
  onRegenerate,
  regenerating,
  regenerateBlocked,
  regenerateNote,
}: Props) {
  const t = useT();
  const chips =
    question.type === 'multi' && question.dynamic ? (dynamicChips ?? []) : question.chips;
  const isMulti = question.type === 'multi';
  // Rótulo de um valor de chip: traduzido (contexto/frequencia) ou o próprio valor.
  const labelFor = (v: string) => question.optionLabels?.[v] ?? v;

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
          className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        />
      )}

      {/* Caso 2: SINGLE + SEM CHIPS (nome) — input bindado direto */}
      {!question.multiline && isSingleFreeText && (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
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
          onRegenerate={onRegenerate}
          regenerating={regenerating}
          regenerateBlocked={regenerateBlocked}
          regenerateNote={regenerateNote}
        />
      )}

      {/* Caso 4: LOADING genérico (não inputFirst, mas dinâmico) */}
      {!question.multiline && !isSingleFreeText && !question.inputFirst && loading && (
        <div className="rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">
          {t('onb.genLoading')}
        </div>
      )}

      {/* Caso 5: CHIPS-FIRST (tema, contexto, objetivo, formatos, ignorar, frequencia) */}
      {!question.multiline && !loading && !isSingleFreeText && !question.inputFirst && (
        <ChipsFirstLayout
          value={value}
          isMulti={isMulti}
          chips={chips}
          labelFor={labelFor}
          toggleChip={toggleChip}
          onClearSingle={() => onChange('')}
        />
      )}

      {/* Picker de hora — dropdown 00:00–23:00 (horario), além dos chips rápidos */}
      {!question.multiline && !loading && question.timePicker && (
        <select
          value={typeof value === 'string' && HOURS.includes(value) ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        >
          <option value="" disabled>
            {t('onb.otherHour')}
          </option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
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
                question.placeholder ?? (isMulti ? t('onb.addAnother') : t('onb.other'))
              }
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm outline-none transition focus:border-[var(--color-fg)]"
            />
            <button
              type="button"
              onClick={addFreeText}
              disabled={!freeText.trim()}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm transition hover:border-[var(--color-fg)] disabled:opacity-50"
            >
              {t('onb.add')}
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
  labelFor,
  toggleChip,
  onClearSingle,
}: {
  value: string | string[];
  isMulti: boolean;
  chips: string[];
  labelFor: (v: string) => string;
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
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-fg)]',
            )}
          >
            {labelFor(chip)}
          </button>
        );
      })}

      {/* Pill customizada pra single quando o valor não está nos chips */}
      {singleCustom && (
        <button
          type="button"
          onClick={onClearSingle}
          className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] px-4 py-2 text-sm transition hover:opacity-90"
        >
          {labelFor(singleCustom)} ✕
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
              className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] px-4 py-2 text-sm transition"
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
  onRegenerate,
  regenerating,
  regenerateBlocked,
  regenerateNote,
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
  onRegenerate?: () => void;
  regenerating?: boolean;
  regenerateBlocked?: boolean;
  regenerateNote?: string | null;
}) {
  const t = useT();
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
          placeholder={question.placeholder ?? t('onb.typeEnter')}
          className="flex-1 rounded-md border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        />
        <button
          type="button"
          onClick={addFreeText}
          disabled={!freeText.trim()}
          className="rounded-md bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-50"
        >
          {t('onb.add')}
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
              className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent-fg)] transition hover:opacity-90"
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
            className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent-fg)] transition hover:opacity-90"
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
            <span>{t('onb.combining')}</span>
          </div>
          {/* Skeleton pills pra dar peso visual durante o load */}
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className="h-7 w-24 animate-pulse rounded-full bg-[var(--color-border)]"
                style={{ width: `${60 + ((i * 17) % 60)}px` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sugestões discretas, com prefixo "+" (só quando não tá carregando) */}
      {!loading && remainingChips.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs text-[var(--color-muted)]">{t('onb.noIdeas')}</p>
          <div className="flex flex-wrap gap-1.5">
            {remainingChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip(chip)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]"
              >
                + {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* (Re)gerar sugestões — só quando a tela sabe gerar (onboarding/settings).
          Rótulo muda: sem chips ainda = "ver sugestões"; com chips = "gerar outras". */}
      {onRegenerate && !loading && (
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating || regenerateBlocked}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-fg)] transition hover:border-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {regenerating && <SpinnerIcon />}
            {regenerating
              ? t('topics.regenerating')
              : chips.length === 0
                ? t('topics.suggest')
                : t('topics.regenerate')}
          </button>
          {regenerateNote && (
            <p className="text-xs text-[var(--color-muted)]">{regenerateNote}</p>
          )}
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
