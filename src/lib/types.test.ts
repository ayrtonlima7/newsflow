import { describe, it, expect } from 'vitest';
import { frequenciaParaJanela } from './types';

describe('frequenciaParaJanela', () => {
  it('daily → janela 1 dia, 5-8 itens', () => {
    const j = frequenciaParaJanela('daily');
    expect(j.janelaDias).toBe(1);
    expect(j.itemsMin).toBe(5);
    expect(j.itemsMax).toBe(8);
  });
  it('every3days → janela 3 dias, 7-10 itens', () => {
    const j = frequenciaParaJanela('every3days');
    expect(j.janelaDias).toBe(3);
    expect(j.itemsMin).toBe(7);
    expect(j.itemsMax).toBe(10);
  });
  it('weekly → janela 7 dias, 10-15 itens', () => {
    const j = frequenciaParaJanela('weekly');
    expect(j.janelaDias).toBe(7);
    expect(j.itemsMin).toBe(10);
    expect(j.itemsMax).toBe(15);
  });
  it('tolera rótulos PT legados (linhas pré-backfill)', () => {
    expect(frequenciaParaJanela('Todo dia').janelaDias).toBe(1);
    expect(frequenciaParaJanela('Uma vez por semana').janelaDias).toBe(7);
  });
  it('cutoff em YYYY-MM-DD e anterior a hoje', () => {
    const j = frequenciaParaJanela('weekly');
    expect(j.cutoffISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.cutoffISO < j.todayISO).toBe(true);
  });
});
