import { describe, it, expect } from 'vitest';
import { frequenciaParaJanela } from './types';

// GRACE_DIAS aplicada em frequenciaParaJanela (janela = base + folga).
const GRACE = 3;

describe('frequenciaParaJanela', () => {
  it('daily → base 1, janela base 1 + folga, 5-10 itens', () => {
    const j = frequenciaParaJanela('daily');
    expect(j.baseDias).toBe(1); // cadência-base = cooldown do "Gerar agora"
    expect(j.janelaDias).toBe(1 + GRACE);
    expect(j.itemsMin).toBe(5);
    expect(j.itemsMax).toBe(10);
  });
  it('every3days → base 3, janela base 3 + folga, 7-15 itens', () => {
    const j = frequenciaParaJanela('every3days');
    expect(j.baseDias).toBe(3);
    expect(j.janelaDias).toBe(3 + GRACE);
    expect(j.itemsMin).toBe(7);
    expect(j.itemsMax).toBe(15);
  });
  it('weekly → base 7, janela base 7 + folga, 10-15 itens', () => {
    const j = frequenciaParaJanela('weekly');
    expect(j.baseDias).toBe(7);
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
