import { describe, it, expect } from 'vitest';
import { normalizeFrequencia, normalizeContexto } from './onboarding-options';

describe('normalizeFrequencia', () => {
  it('aceita os slugs canônicos', () => {
    expect(normalizeFrequencia('daily')).toBe('daily');
    expect(normalizeFrequencia('every3days')).toBe('every3days');
    expect(normalizeFrequencia('weekly')).toBe('weekly');
  });
  it('tolera rótulos PT legados', () => {
    expect(normalizeFrequencia('Todo dia')).toBe('daily');
    expect(normalizeFrequencia('A cada 3 dias')).toBe('every3days');
    expect(normalizeFrequencia('Uma vez por semana')).toBe('weekly');
  });
  it('tolera palavras-chave EN/ES', () => {
    expect(normalizeFrequencia('Once a week')).toBe('weekly');
    expect(normalizeFrequencia('Una vez por semana')).toBe('weekly');
  });
  it('cai em daily quando vazio ou desconhecido', () => {
    expect(normalizeFrequencia('')).toBe('daily');
    expect(normalizeFrequencia(null)).toBe('daily');
    expect(normalizeFrequencia('qualquer coisa')).toBe('daily');
  });
});

describe('normalizeContexto', () => {
  it('aceita slug, rótulo PT legado e rótulo traduzido', () => {
    expect(normalizeContexto('profession')).toBe('profession');
    expect(normalizeContexto('Profissão')).toBe('profession');
    expect(normalizeContexto('Hobby ou paixão')).toBe('hobby');
    expect(normalizeContexto('General curiosity')).toBe('curiosity');
    expect(normalizeContexto('Estudio')).toBe('study');
  });
  it('retorna null pra vazio ou desconhecido', () => {
    expect(normalizeContexto('')).toBeNull();
    expect(normalizeContexto(null)).toBeNull();
    expect(normalizeContexto('xyz')).toBeNull();
  });
});
