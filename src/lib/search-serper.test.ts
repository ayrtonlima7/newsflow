import { describe, it, expect } from 'vitest';
import { parseSerperDate } from './search-serper';

describe('parseSerperDate', () => {
  const now = new Date('2026-08-12T12:00:00Z');

  it('resolve "hoje" / "today" / "hoy"', () => {
    expect(parseSerperDate('hoje', now)).toBe('2026-08-12');
    expect(parseSerperDate('today', now)).toBe('2026-08-12');
    expect(parseSerperDate('hoy', now)).toBe('2026-08-12');
  });

  it('resolve "ontem" / "yesterday" / "ayer"', () => {
    expect(parseSerperDate('ontem', now)).toBe('2026-08-11');
    expect(parseSerperDate('yesterday', now)).toBe('2026-08-11');
    expect(parseSerperDate('ayer', now)).toBe('2026-08-11');
  });

  it('resolve "há X horas/minutos" (pt)', () => {
    expect(parseSerperDate('há 23 horas', now)).toBe('2026-08-11');
    expect(parseSerperDate('há 1 hora', now)).toBe('2026-08-12');
    expect(parseSerperDate('há 30 minutos', now)).toBe('2026-08-12');
  });

  it('resolve "X dias atrás" (pt)', () => {
    expect(parseSerperDate('1 dia atrás', now)).toBe('2026-08-11');
    expect(parseSerperDate('5 dias atrás', now)).toBe('2026-08-07');
  });

  it('resolve "hace X días/horas" (es)', () => {
    expect(parseSerperDate('hace 2 días', now)).toBe('2026-08-10');
    expect(parseSerperDate('hace 3 horas', now)).toBe('2026-08-12');
  });

  it('resolve "X days/hours ago" (en)', () => {
    expect(parseSerperDate('2 days ago', now)).toBe('2026-08-10');
    expect(parseSerperDate('4 hours ago', now)).toBe('2026-08-12');
  });

  it('resolve semanas/meses/anos', () => {
    expect(parseSerperDate('1 semana atrás', now)).toBe('2026-08-05');
    expect(parseSerperDate('2 weeks ago', now)).toBe('2026-07-29');
  });

  it('cai pra Date.parse em formato absoluto reconhecível', () => {
    expect(parseSerperDate('Aug 10, 2026', now)).toBe('2026-08-10');
  });

  it('retorna undefined pra formato não reconhecido (nunca inventa data)', () => {
    expect(parseSerperDate('algum texto aleatório sem data', now)).toBeUndefined();
  });

  it('retorna undefined pra input vazio/ausente', () => {
    expect(parseSerperDate(undefined, now)).toBeUndefined();
    expect(parseSerperDate('', now)).toBeUndefined();
  });
});
