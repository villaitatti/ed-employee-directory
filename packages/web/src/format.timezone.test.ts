import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The machine is deliberately put in the wrong time zone before `format.ts` is
 * loaded. If timestamps were ever rendered in the reader's local zone again, every
 * assertion here would be five or six hours out — which is the whole point: on a
 * developer's laptop in Florence a local-time bug is invisible.
 */
const originalTz = process.env.TZ;
process.env.TZ = 'America/New_York';

const { formatDateTime, formatDate, OFFICE_TIME_ZONE } = await import('./format.js');

beforeAll(() => {
  // Sanity check that the override took, so this file can never pass vacuously.
  expect(new Date('2026-07-30T12:41:00.000Z').getHours()).toBe(8);
});

afterAll(() => {
  process.env.TZ = originalTz;
});

describe('timestamps are always on the Florence clock', () => {
  it('reads a UTC instant as Italian summer time, not the reader’s zone', () => {
    // 12:41 UTC on 30 July is 14:41 in Florence (CEST, +2) and 08:41 in New York.
    expect(formatDateTime('2026-07-30T12:41:00.000Z', 'it')).toBe('30 luglio 2026, 14:41');
  });

  it('reads a UTC instant as Italian winter time', () => {
    // 12:41 UTC on 30 November is 13:41 in Florence (CET, +1). The same input hour
    // as the summer case, an hour earlier on the clock — which is what makes this
    // a real daylight-saving test rather than a fixed-offset one.
    expect(formatDateTime('2026-11-30T12:41:00.000Z', 'it')).toBe('30 novembre 2026, 13:41');
  });

  it('gets both sides of the ora legale switch right', () => {
    // Italy goes back to CET at 03:00 local on Sunday 25 October 2026, i.e. 01:00
    // UTC. One minute either side of that instant.
    expect(formatDateTime('2026-10-25T00:59:00.000Z', 'it')).toBe('25 ottobre 2026, 02:59');
    expect(formatDateTime('2026-10-25T01:01:00.000Z', 'it')).toBe('25 ottobre 2026, 02:01');

    // And forward again at 02:00 local on Sunday 29 March 2026 (01:00 UTC).
    expect(formatDateTime('2026-03-29T00:59:00.000Z', 'it')).toBe('29 marzo 2026, 01:59');
    expect(formatDateTime('2026-03-29T01:01:00.000Z', 'it')).toBe('29 marzo 2026, 03:01');
  });

  it('keeps a late-evening change on the day Florence thinks it is', () => {
    // 23:30 UTC on 30 July is already the 31st in Florence. A reader in New York
    // would otherwise be told this happened on the 30th, at 19:30.
    expect(formatDateTime('2026-07-30T23:30:00.000Z', 'it')).toBe('31 luglio 2026, 01:30');
  });

  it('leaves date-only values alone, which carry no zone to convert', () => {
    // A birth date is a calendar date, not an instant. Shifting it by a zone offset
    // is how someone born on the 1st ends up displayed as the 30th.
    expect(formatDate('1985-04-12', 'it')).toBe('12 aprile 1985');
    expect(formatDate('2026-01-01', 'it')).toBe('01 gennaio 2026');
  });

  it('names the zone it is pinned to, rather than an offset', () => {
    // A fixed +01:00 would be an hour wrong for the seven months of ora legale.
    expect(OFFICE_TIME_ZONE).toBe('Europe/Rome');
  });
});
