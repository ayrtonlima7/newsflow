import { describe, it, expect } from 'vitest';
import { canDeliver, isPaid, type SubscriptionStatus } from './subscription';

const STATUSES: SubscriptionStatus[] = ['free', 'active', 'past_due', 'canceled', 'manual'];

describe('canDeliver — FREE_MODE OFF (modelo pago)', () => {
  it('active e manual liberam a entrega', () => {
    expect(canDeliver({ status: 'active', freeMode: false })).toMatchObject({ allowed: true, state: 'subscribed' });
    expect(canDeliver({ status: 'manual', freeMode: false })).toMatchObject({ allowed: true, state: 'manual' });
  });

  it('free, past_due e canceled bloqueiam', () => {
    expect(canDeliver({ status: 'free', freeMode: false })).toMatchObject({ allowed: false, state: 'free' });
    expect(canDeliver({ status: 'past_due', freeMode: false })).toMatchObject({ allowed: false, state: 'past_due' });
    expect(canDeliver({ status: 'canceled', freeMode: false })).toMatchObject({ allowed: false, state: 'canceled' });
  });

  it('não concede vitalício a ninguém', () => {
    for (const status of STATUSES) {
      expect(canDeliver({ status, freeMode: false }).shouldGrantLifetime).toBeFalsy();
    }
  });

  it('mantém compatibilidade com a chamada só-status (comportamento histórico)', () => {
    expect(canDeliver('active').allowed).toBe(true);
    expect(canDeliver('free').allowed).toBe(false);
    expect(canDeliver('free').state).toBe('free');
  });
});

describe('canDeliver — FREE_MODE ON (produto grátis)', () => {
  it('libera TODO mundo, qualquer status', () => {
    for (const status of STATUSES) {
      expect(canDeliver({ status, freeMode: true }).allowed).toBe(true);
    }
  });

  it('quem NÃO é assinante vivo ganha vitalício', () => {
    for (const status of ['free', 'canceled'] as SubscriptionStatus[]) {
      const r = canDeliver({ status, freeMode: true });
      expect(r.shouldGrantLifetime).toBe(true);
      expect(r.state).toBe('free_era');
    }
  });

  it('assinante vivo (active/past_due) fica FROZEN e NÃO ganha vitalício', () => {
    for (const status of ['active', 'past_due'] as SubscriptionStatus[]) {
      const r = canDeliver({ status, freeMode: true });
      expect(r.allowed).toBe(true);
      expect(r.state).toBe('frozen');
      expect(r.shouldGrantLifetime).toBeFalsy();
    }
  });

  it('cortesia manual continua manual (não vira era-grátis)', () => {
    const r = canDeliver({ status: 'manual', freeMode: true });
    expect(r.state).toBe('manual');
    expect(r.shouldGrantLifetime).toBeFalsy();
  });
});

describe('free_forever — o vitalício é o coração da regra', () => {
  it('vence a flag OFF: quem entrou grátis CONTINUA recebendo depois', () => {
    for (const status of STATUSES) {
      const r = canDeliver({ status, freeForever: true, freeMode: false });
      expect(r.allowed).toBe(true);
      expect(r.state).toBe('free_era');
    }
  });

  it('não re-concede vitalício a quem já tem (evita escrita repetida)', () => {
    const r = canDeliver({ status: 'free', freeForever: true, freeMode: true });
    expect(r.shouldGrantLifetime).toBeFalsy();
  });

  it('vitalício vence até assinatura cancelada/past_due', () => {
    expect(canDeliver({ status: 'canceled', freeForever: true }).allowed).toBe(true);
    expect(canDeliver({ status: 'past_due', freeForever: true }).allowed).toBe(true);
  });
});

describe('ciclo completo do requisito (flag ON → OFF → ON)', () => {
  it('usuário novo da era grátis: recebe on, é estampado, e segue recebendo off', () => {
    // 1. entra com a flag ON, sem assinatura
    const first = canDeliver({ status: 'free', freeForever: false, freeMode: true });
    expect(first.allowed).toBe(true);
    expect(first.shouldGrantLifetime).toBe(true);

    // 2. o pipeline estampa free_forever → flag volta pra OFF
    const later = canDeliver({ status: 'free', freeForever: true, freeMode: false });
    expect(later.allowed).toBe(true); // vitalício: continua recebendo
  });

  it('assinante pagante: congela on, volta a valer a assinatura off', () => {
    const frozen = canDeliver({ status: 'active', freeMode: true });
    expect(frozen.state).toBe('frozen');
    expect(frozen.shouldGrantLifetime).toBeFalsy(); // NÃO virou vitalício

    const back = canDeliver({ status: 'active', freeMode: false });
    expect(back.state).toBe('subscribed'); // assinatura volta a contar
  });
});

describe('isPaid', () => {
  it('active e manual são pagos; o resto não', () => {
    expect(isPaid('active')).toBe(true);
    expect(isPaid('manual')).toBe(true);
    expect(isPaid('free')).toBe(false);
    expect(isPaid('past_due')).toBe(false);
    expect(isPaid('canceled')).toBe(false);
  });
});
