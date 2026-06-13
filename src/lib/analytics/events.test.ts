import { describe, it, expect } from 'vitest';
import { ANALYTICS_EVENTS } from './events';

/**
 * O catálogo é a fonte da verdade do funil. Estes testes são guard-rails
 * baratos: nomes de evento são load-bearing (renomear/duplicar quebra o
 * histórico no PostHog e funde métricas distintas). O resto do módulo é
 * side-effecting (dispara pra rede) e não é testável de forma pura.
 */
describe('ANALYTICS_EVENTS', () => {
  const values = Object.values(ANALYTICS_EVENTS);

  it('não tem nomes de evento duplicados', () => {
    expect(new Set(values).size).toBe(values.length);
  });

  it('usa snake_case minúsculo (estável entre client e server)', () => {
    for (const v of values) {
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('cobre as etapas-chave do funil', () => {
    expect(values).toContain('signup_started');
    expect(values).toContain('onboarding_started');
    expect(values).toContain('onboarding_step');
    expect(values).toContain('onboarding_completed');
    expect(values).toContain('paywall_view');
    expect(values).toContain('checkout_started');
    expect(values).toContain('subscribed');
  });
});
