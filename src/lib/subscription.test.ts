import { describe, it, expect } from 'vitest';
import { canDeliver, isPaid } from './subscription';

describe('canDeliver', () => {
  it('active e manual liberam a entrega', () => {
    expect(canDeliver('active')).toMatchObject({ allowed: true, state: 'subscribed' });
    expect(canDeliver('manual')).toMatchObject({ allowed: true, state: 'manual' });
  });
  it('free, past_due e canceled bloqueiam', () => {
    expect(canDeliver('free')).toMatchObject({ allowed: false, state: 'free' });
    expect(canDeliver('past_due')).toMatchObject({ allowed: false, state: 'past_due' });
    expect(canDeliver('canceled')).toMatchObject({ allowed: false, state: 'canceled' });
  });
});

describe('isPaid', () => {
  it('true pra active e manual (acesso liberado)', () => {
    expect(isPaid('active')).toBe(true);
    expect(isPaid('manual')).toBe(true);
  });
  it('false pra free, past_due e canceled', () => {
    expect(isPaid('free')).toBe(false);
    expect(isPaid('past_due')).toBe(false);
    expect(isPaid('canceled')).toBe(false);
  });
});
