import { describe, it, expect } from 'vitest';
import { isReasonerModel, resolveDeriveModels } from './domain-derivation';

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
