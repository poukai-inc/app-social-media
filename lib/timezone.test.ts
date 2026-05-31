import { describe, it, expect } from 'vitest';
import {
  zonedWallTimeToUtc,
  getNextWallTimeInTz,
  getNextOccurrenceInTz,
  getZonedParts,
  safeTimeZone,
} from './timezone';

describe('timezone', () => {
  it('converts NY summer (EDT, UTC-4) wall time to UTC', () => {
    expect(zonedWallTimeToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z'
    );
  });

  it('converts NY winter (EST, UTC-5) wall time to UTC', () => {
    expect(zonedWallTimeToUtc(2026, 1, 1, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-01-01T14:00:00.000Z'
    );
  });

  it('converts Tokyo (UTC+9) wall time to UTC', () => {
    expect(zonedWallTimeToUtc(2026, 7, 1, 9, 0, 'Asia/Tokyo').toISOString()).toBe(
      '2026-07-01T00:00:00.000Z'
    );
  });

  it('round-trips wall-clock parts', () => {
    const d = zonedWallTimeToUtc(2026, 7, 1, 9, 0, 'America/New_York');
    const p = getZonedParts(d, 'America/New_York');
    expect([p.hour, p.minute]).toEqual([9, 0]);
  });

  it('falls back to UTC on invalid/missing timezone', () => {
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone(undefined)).toBe('UTC');
    expect(safeTimeZone('America/New_York')).toBe('America/New_York');
  });

  it('returns the next occurrence strictly in the future', () => {
    const from = new Date('2026-07-01T12:00:00Z'); // Wed 08:00 EDT
    expect(getNextOccurrenceInTz(3, 9, 0, 'America/New_York', from).toISOString()).toBe(
      '2026-07-01T13:00:00.000Z'
    );
    // 07:00 NY today already passed (11:00Z < 12:00Z) → +7 days
    expect(getNextOccurrenceInTz(3, 7, 0, 'America/New_York', from).toISOString()).toBe(
      '2026-07-08T11:00:00.000Z'
    );
  });

  it('rolls the next wall time to tomorrow when today has passed', () => {
    const from = new Date('2026-07-01T20:00:00Z'); // NY 16:00 EDT
    expect(getNextWallTimeInTz(9, 0, 'America/New_York', from).toISOString()).toBe(
      '2026-07-02T13:00:00.000Z'
    );
  });
});
