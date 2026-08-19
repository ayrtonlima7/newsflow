import { describe, it, expect } from 'vitest';
import { decideQuota, spToday, SUGGESTIONS_DAILY_LIMIT } from './suggestion-quota';

describe('decideQuota', () => {
  const today = '2026-08-19';

  it('primeira vez (sem registro) → permite e sobra limite-1', () => {
    const d = decideQuota(null, today);
    expect(d.allowed).toBe(true);
    expect(d.nextCount).toBe(1);
    expect(d.remaining).toBe(SUGGESTIONS_DAILY_LIMIT - 1);
  });

  it('registro de OUTRO dia → zera o contador', () => {
    const d = decideQuota({ used_date: '2026-08-18', used_count: 2 }, today);
    expect(d.allowed).toBe(true);
    expect(d.nextCount).toBe(1);
  });

  it('mesmo dia, 1 uso → permite a segunda e zera o saldo', () => {
    const d = decideQuota({ used_date: today, used_count: 1 }, today);
    expect(d.allowed).toBe(true);
    expect(d.nextCount).toBe(2);
    expect(d.remaining).toBe(0);
  });

  it('mesmo dia, no limite → BLOQUEIA', () => {
    const d = decideQuota({ used_date: today, used_count: SUGGESTIONS_DAILY_LIMIT }, today);
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
  });

  it('acima do limite (dado inconsistente) → bloqueia, não estoura', () => {
    const d = decideQuota({ used_date: today, used_count: 99 }, today);
    expect(d.allowed).toBe(false);
  });

  it('respeita limite customizado', () => {
    expect(decideQuota({ used_date: today, used_count: 4 }, today, 5).allowed).toBe(true);
    expect(decideQuota({ used_date: today, used_count: 5 }, today, 5).allowed).toBe(false);
  });

  it('tolera used_count null', () => {
    const d = decideQuota({ used_date: today, used_count: null }, today);
    expect(d.allowed).toBe(true);
    expect(d.nextCount).toBe(1);
  });
});

describe('spToday', () => {
  it('usa data-calendário de São Paulo (UTC-3), não UTC', () => {
    // 19/ago 01:00 UTC = 18/ago 22:00 em SP → ainda dia 18 pro usuário
    expect(spToday(new Date('2026-08-19T01:00:00Z'))).toBe('2026-08-18');
  });

  it('meio-dia UTC cai no mesmo dia em SP', () => {
    expect(spToday(new Date('2026-08-19T12:00:00Z'))).toBe('2026-08-19');
  });
});
