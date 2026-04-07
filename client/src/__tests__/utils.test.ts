import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  metersToFeet,
  msToKnots,
  bearingToCardinal,
  headingToCardinal,
  formatSecondsAgo,
} from '../utils';

describe('metersToFeet', () => {
  it('converts 0 m to 0 ft', () => {
    expect(metersToFeet(0)).toBe(0);
  });

  it('converts 1000 m to 3281 ft', () => {
    expect(metersToFeet(1000)).toBe(3281);
  });

  it('converts 3048 m to exactly 10000 ft', () => {
    expect(metersToFeet(3048)).toBe(10000);
  });

  it('rounds to nearest integer', () => {
    expect(metersToFeet(1)).toBe(3); // 3.28084 → 3
  });
});

describe('msToKnots', () => {
  it('converts 0 m/s to 0 knots', () => {
    expect(msToKnots(0)).toBe(0);
  });

  it('converts 100 m/s to 194 knots', () => {
    expect(msToKnots(100)).toBe(194);
  });

  it('rounds to nearest integer', () => {
    // 1 m/s * 1.94384 = 1.94384 → rounds to 2
    expect(msToKnots(1)).toBe(2);
  });
});

describe('bearingToCardinal', () => {
  it.each([
    [0, 'N'],
    [45, 'NE'],
    [90, 'E'],
    [135, 'SE'],
    [180, 'S'],
    [225, 'SW'],
    [270, 'W'],
    [315, 'NW'],
    [360, 'N'],
  ])('%i° → %s', (deg, expected) => {
    expect(bearingToCardinal(deg)).toBe(expected);
  });

  it('rounds to the nearest direction — 22° → N', () => {
    expect(bearingToCardinal(22)).toBe('N'); // Math.round(22/45)=0 → N
  });

  it('rounds to the nearest direction — 23° → NE', () => {
    expect(bearingToCardinal(23)).toBe('NE'); // Math.round(23/45)=1 → NE
  });
});

describe('headingToCardinal', () => {
  it.each([
    [0, 'N'],
    [22.5, 'NNE'],
    [45, 'NE'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
    [315, 'NW'],
    [337.5, 'NNW'],
    [360, 'N'],
  ])('%s° → %s', (deg, expected) => {
    expect(headingToCardinal(deg)).toBe(expected);
  });
});

describe('formatSecondsAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const NOW = new Date('2025-01-01T12:00:00Z').getTime();

  it('returns "just now" for 0 seconds ago', () => {
    expect(formatSecondsAgo(NOW)).toBe('just now');
  });

  it('returns "just now" for 4 seconds ago (< 5s threshold)', () => {
    expect(formatSecondsAgo(NOW - 4000)).toBe('just now');
  });

  it('returns "5s ago" at exactly 5 seconds (boundary)', () => {
    expect(formatSecondsAgo(NOW - 5000)).toBe('5s ago');
  });

  it('returns "30s ago" for 30 seconds', () => {
    expect(formatSecondsAgo(NOW - 30_000)).toBe('30s ago');
  });

  it('returns "59s ago" for 59 seconds', () => {
    expect(formatSecondsAgo(NOW - 59_000)).toBe('59s ago');
  });

  it('returns "1m ago" at exactly 60 seconds (boundary)', () => {
    expect(formatSecondsAgo(NOW - 60_000)).toBe('1m ago');
  });

  it('returns "2m ago" for 120 seconds', () => {
    expect(formatSecondsAgo(NOW - 120_000)).toBe('2m ago');
  });
});
