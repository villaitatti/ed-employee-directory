import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RETIREMENT_POLICY } from '@itatti/shared';
import { getRetirementPolicy, getRetirementSetting, RETIREMENT_POLICY_KEY } from '../services/settings.js';

type Reader = Parameters<typeof getRetirementPolicy>[0];

/** Minimal stand-in for the Prisma `setting` delegate the service reads from. */
function fakeReader(row: { value: unknown; updatedAt: Date } | null) {
  const findUnique = vi.fn(async () => row);
  const reader = { setting: { findUnique } } as unknown as Reader & {
    setting: { findUnique: typeof findUnique };
  };
  return reader;
}

describe('getRetirementPolicy', () => {
  it('returns the stored policy when one is set', async () => {
    const reader = fakeReader({ value: { years: 68, months: 0 }, updatedAt: new Date('2026-06-05T00:00:00.000Z') });
    expect(await getRetirementPolicy(reader)).toEqual({ years: 68, months: 0 });
  });

  it('falls back to the statutory default when unset', async () => {
    expect(await getRetirementPolicy(fakeReader(null))).toEqual(DEFAULT_RETIREMENT_POLICY);
  });

  it('falls back to the default when the stored value is malformed', async () => {
    // A row with a non-policy JSON blob must not crash the calculation path.
    const reader = fakeReader({ value: { years: 'oops' }, updatedAt: new Date() });
    expect(await getRetirementPolicy(reader)).toEqual(DEFAULT_RETIREMENT_POLICY);
  });

  it('queries by the retirement-policy key', async () => {
    const reader = fakeReader(null);
    await getRetirementPolicy(reader);
    expect(reader.setting.findUnique).toHaveBeenCalledWith({ where: { key: RETIREMENT_POLICY_KEY } });
  });
});

describe('getRetirementSetting', () => {
  it('returns the policy and an ISO updatedAt timestamp when set', async () => {
    const updatedAt = new Date('2026-06-05T09:24:08.832Z');
    const reader = fakeReader({ value: { years: 67, months: 3 }, updatedAt });
    expect(await getRetirementSetting(reader)).toEqual({
      retirementPolicy: { years: 67, months: 3 },
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('returns a null updatedAt and the default policy when unset', async () => {
    expect(await getRetirementSetting(fakeReader(null))).toEqual({
      retirementPolicy: DEFAULT_RETIREMENT_POLICY,
      updatedAt: null,
    });
  });
});
