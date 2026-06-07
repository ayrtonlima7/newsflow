import { describe, it, expect } from 'vitest';
import { frequenciaParaJanela } from './types';

// GRACE_DIAS aplicada em frequenciaParaJanela (janela = base + folga).
const GRACE = 2;

describe('frequenciaParaJanela', () => {
  it('daily → janela base 1 + folga, 5-8 itens', () => {
    const j = frequenciaParaJanela('daily');
    expect(j.janelaDias).toBe(1 + GRACE);
    expect(j.itemsMin).toBe(5);
    expect(j.itemsMax).toBe(8);
  });
  it('every3days → janela base 3 + folga, 7-10 itens', () => {
    const j = frequenciaParaJanela('every3days');
    expect(j.janelaDias).toBe(3 + GRACE);
    expect(j.itemsMin).toBe(7);
    expect(j.itemsMax).toBe(10);
  });
  it('weekly → janela base 7 + folga, 10-15 itens', () => {
    const j = frequenciaParaJanela('weekly');
    expect(j.janelaDias).toBe(7 + GRACE);
    expect(j.itemsMin).toBe(10);
    expect(j.itemsMax).toBe(15);
  });
  it('tolera rótulos PT legados (linhas pré-backfill)', () => {
    expect(frequenciaParaJanela('Todo dia').janelaDias).toBe(1 + GRACE);
    expect(frequenciaParaJanela('Uma vez por semana').janelaDias).toBe(7 + GRACE);
  });
  it('cutoff em YYYY-MM-DD e anterior a hoje', () => {
    const j = frequenciaParaJanela('weekly');
    expect(j.cutoffISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.cutoffISO < j.todayISO).toBe(true);
  });
  it('cutoff = hoje − janelaDias (a folga afrouxa o corte)', () => {
    const j = frequenciaParaJanela('daily');
    const expected = new Date(Date.now() - j.janelaDias * 86400000)
      .toISOString()
      .split('T')[0];
    expect(j.cutoffISO).toBe(expected);
  });
});
