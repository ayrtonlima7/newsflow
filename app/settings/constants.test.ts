import { describe, it, expect } from 'vitest';
import { formatCooldown } from './constants';

describe('formatCooldown', () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('só minutos', () => {
    expect(formatCooldown(10 * MIN)).toBe('10m');
  });
  it('horas + minutos', () => {
    expect(formatCooldown(2 * HOUR + 10 * MIN)).toBe('2h 10m');
  });
  it('dias + horas (cooldown de frequência, ex: 3 dias)', () => {
    expect(formatCooldown(3 * DAY)).toBe('3d 0h');
    expect(formatCooldown(2 * DAY + 5 * HOUR)).toBe('2d 5h');
  });
  it('nunca negativo', () => {
    expect(formatCooldown(-1000)).toBe('0m');
  });
});
