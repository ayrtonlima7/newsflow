import { describe, it, expect } from 'vitest';
import { isReasonerModel, resolveDeriveModels, normalizeDomain } from './domain-derivation';

describe('isReasonerModel', () => {
  it('detecta reasoners (não suportam JSON mode)', () => {
    expect(isReasonerModel('deepseek-reasoner')).toBe(true);
    expect(isReasonerModel('DeepSeek-R1')).toBe(true);
  });
  it('trata os demais como não-reasoner (suportam JSON mode)', () => {
    expect(isReasonerModel('deepseek-chat')).toBe(false);
    expect(isReasonerModel('deepseek-v4-flash')).toBe(false);
  });
});

describe('resolveDeriveModels', () => {
  it('tenta o configurado e cai pro fallback deepseek-chat', () => {
    expect(resolveDeriveModels('deepseek-reasoner')).toEqual([
      'deepseek-reasoner',
      'deepseek-chat',
    ]);
    expect(resolveDeriveModels('deepseek-v4-flash')).toEqual([
      'deepseek-v4-flash',
      'deepseek-chat',
    ]);
  });
  it('não duplica quando o configurado já é o fallback', () => {
    expect(resolveDeriveModels('deepseek-chat')).toEqual(['deepseek-chat']);
  });
});

describe('normalizeDomain', () => {
  it('minúscula + remove espaços (cura typos do LLM)', () => {
    expect(normalizeDomain('agencia Brasil.ebc.com.br')).toBe('agenciabrasil.ebc.com.br');
    expect(normalizeDomain('  G1.Globo.com ')).toBe('g1.globo.com');
  });
  it('mantém domínio já normalizado intacto', () => {
    expect(normalizeDomain('ge.globo.com')).toBe('ge.globo.com');
  });
});
