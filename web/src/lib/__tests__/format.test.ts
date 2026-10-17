import { describe, expect, it } from 'vitest';
import { initials, relTime } from '../format';

describe('relTime', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  it('rounds to the largest sensible unit', () => {
    expect(relTime(now - 10_000, now)).toBe('just now');
    expect(relTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relTime(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2d ago');
  });
  it('returns nothing for an unreadable date and never goes negative for the future', () => {
    expect(relTime('not a date', now)).toBe('');
    expect(relTime(undefined, now)).toBe('');
    expect(relTime(now + 60_000, now)).toBe('just now');
  });
});
describe('initials', () => {
  it('uses at most two letters and falls back for empty names', () => {
    expect(initials('alex jordan doe')).toBe('AJ');
    expect(initials('  ')).toBe('·');
    expect(initials()).toBe('·');
  });
});
