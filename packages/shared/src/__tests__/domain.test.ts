import { describe, expect, it } from 'vitest';
import {
  calculateRetirementDate,
  employeeWriteSchema,
  importCommitSchema,
  normalizeDepartmentName,
  parseFteInput,
  resolveRetirementDate,
  retirementPolicySchema,
  settingsSchema,
  validateStatusDates,
} from '../index.js';

describe('employee domain rules', () => {
  it('calculates retirement date as birth date plus 67 years and 3 months', () => {
    expect(calculateRetirementDate('1980-01-15')).toBe('2047-04-15');
  });

  it('honours a custom retirement policy when one is supplied', () => {
    // e.g. the law changes to 68 years, 0 months.
    expect(calculateRetirementDate('1980-01-15', { years: 68, months: 0 })).toBe('2048-01-15');
    expect(calculateRetirementDate('1980-01-15', { years: 67, months: 6 })).toBe('2047-07-15');
  });

  it('resolveRetirementDate uses the supplied policy for the calculated date', () => {
    expect(
      resolveRetirementDate({ birthDate: '1980-01-15', policy: { years: 68, months: 0 } })
    ).toEqual({ retirementDate: '2048-01-15', retirementDateOverridden: false });
  });

  it('clamps day overflow when a custom policy shifts into a shorter month', () => {
    // 1960-08-31 + 67y2m => 2027-10-31 (no clamp); + 67y3m => 2027-11-30 (clamps).
    expect(calculateRetirementDate('1960-08-31', { years: 67, months: 2 })).toBe('2027-10-31');
    expect(calculateRetirementDate('1960-08-31', { years: 67, months: 3 })).toBe('2027-11-30');
  });

  it('a reset override under a custom policy recalculates against that policy', () => {
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        currentRetirementDate: '2047-05-01',
        currentRetirementDateOverridden: true,
        resetOverride: true,
        policy: { years: 68, months: 0 },
      })
    ).toEqual({ retirementDate: '2048-01-15', retirementDateOverridden: false });
  });

  it('preserves a confirmed retirement date even when a new policy is supplied', () => {
    // Invariant the PUT /settings route relies on: it filters out overridden
    // employees, so a supplied policy must NOT overwrite a standing override.
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        currentRetirementDate: '2047-05-01',
        currentRetirementDateOverridden: true,
        policy: { years: 68, months: 0 },
      })
    ).toEqual({ retirementDate: '2047-05-01', retirementDateOverridden: true });
  });

  it('clamps leap-day retirement calculations to the last valid day', () => {
    expect(calculateRetirementDate('1960-11-30')).toBe('2028-02-29');
  });

  it('rolls the year forward when the +3 month offset crosses December', () => {
    // November + 3 months => February of the next year.
    expect(calculateRetirementDate('1960-11-15')).toBe('2028-02-15');
    expect(calculateRetirementDate('1960-12-15')).toBe('2028-03-15');
  });

  it('clamps a 31-day source day into a shorter target month', () => {
    // 1960-07-31 + 67y3m => 2027-10-31 (October has 31 days, no clamp).
    expect(calculateRetirementDate('1960-07-31')).toBe('2027-10-31');
    // 1960-08-31 + 67y3m => 2027-11-30 (November has 30 days, clamps).
    expect(calculateRetirementDate('1960-08-31')).toBe('2027-11-30');
  });

  it('accepts Italian comma and dot FTE decimals', () => {
    expect(parseFteInput('0,5')).toBe(0.5);
    expect(parseFteInput('0.75')).toBe(0.75);
    expect(parseFteInput(1)).toBe(1);
  });

  it('rejects empty, zero, and over-full-time FTE values', () => {
    expect(() => parseFteInput('')).toThrow();
    expect(() => parseFteInput('0')).toThrow();
    expect(() => parseFteInput('1,2')).toThrow();
  });

  it('rejects FTE with more than 3 decimal places (Decimal(4,3) column)', () => {
    // 0.0004 would silently round to 0.000 in the DB, violating the positive guarantee.
    expect(() => parseFteInput('0.0004')).toThrow();
    expect(() => parseFteInput('0.1234')).toThrow();
    expect(parseFteInput('0.125')).toBe(0.125);
  });

  it('tracks a confirmed retirement date until reset', () => {
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        requestedRetirementDate: '2047-05-01',
      })
    ).toEqual({ retirementDate: '2047-05-01', retirementDateOverridden: true });

    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        requestedRetirementDate: '2047-05-01',
        resetOverride: true,
      })
    ).toEqual({ retirementDate: '2047-04-15', retirementDateOverridden: false });
  });

  it('marks a calculated retirement date as confirmed when requested', () => {
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        requestedRetirementDate: '2047-04-15',
        confirmRetirementDate: true,
      })
    ).toEqual({ retirementDate: '2047-04-15', retirementDateOverridden: true });
  });

  it('preserves an existing confirmed retirement date when no new retirement date is supplied', () => {
    // Mirrors a CSV import UPDATE that omits the retirement column.
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        currentRetirementDate: '2047-05-01',
        currentRetirementDateOverridden: true,
      })
    ).toEqual({ retirementDate: '2047-05-01', retirementDateOverridden: true });
  });

  it('recalculates when no override existed and none was supplied', () => {
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        currentRetirementDate: '2047-04-15',
        currentRetirementDateOverridden: false,
      })
    ).toEqual({ retirementDate: '2047-04-15', retirementDateOverridden: false });
  });

  it('drops an existing override when reset is requested', () => {
    expect(
      resolveRetirementDate({
        birthDate: '1980-01-15',
        currentRetirementDate: '2047-05-01',
        currentRetirementDateOverridden: true,
        resetOverride: true,
      })
    ).toEqual({ retirementDate: '2047-04-15', retirementDateOverridden: false });
  });

  it('validates status-specific dates', () => {
    expect(validateStatusDates({ status: 'ATTIVO', hireDate: null })).toContain(
      'Active employees require a hire date.'
    );
    expect(validateStatusDates({ status: 'CESSATO', terminationDate: null })).toContain(
      'Terminated employees require a termination date.'
    );
    expect(
      validateStatusDates({
        status: 'CESSATO',
        hireDate: '2024-01-01',
        terminationDate: '2023-12-31',
      })
    ).toContain('Termination date cannot be before hire date.');
  });

  it('accepts valid status-date combinations without errors', () => {
    expect(validateStatusDates({ status: 'ATTIVO', hireDate: '2024-01-01' })).toEqual([]);
    expect(
      validateStatusDates({
        status: 'CESSATO',
        hireDate: '2024-01-01',
        terminationDate: '2024-01-01',
      })
    ).toEqual([]);
    // DA_ASSUMERE requires neither hire nor termination date.
    expect(validateStatusDates({ status: 'DA_ASSUMERE' })).toEqual([]);
  });

  it('normalizes department names for uniqueness', () => {
    expect(normalizeDepartmentName('  Admin   Finance  ')).toBe('admin finance');
  });

  it('rejects impossible calendar dates at the schema boundary', () => {
    const result = employeeWriteSchema.safeParse({
      employeeNumber: 1001,
      firstName: 'Ada',
      lastName: 'Lovelace',
      departmentId: 'dept_1',
      birthDate: '2024-02-31',
      hireDate: '2024-01-01',
      terminationDate: null,
      retirementDate: null,
      fte: '0,5',
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      tfr: 'I_TATTI',
      status: 'ATTIVO',
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate selected import rows', () => {
    const result = importCommitSchema.safeParse({ selectedRows: [2, 3, 2] });

    expect(result.success).toBe(false);
  });
});

describe('retirementPolicySchema', () => {
  it('accepts a valid policy and coerces numeric strings from form inputs', () => {
    // The Settings page sends string values from <input type="number">.
    expect(retirementPolicySchema.parse({ years: '67', months: '3' })).toEqual({
      years: 67,
      months: 3,
    });
    expect(retirementPolicySchema.parse({ years: 68, months: 0 })).toEqual({
      years: 68,
      months: 0,
    });
  });

  it('enforces the statutory year bounds (50-80)', () => {
    expect(retirementPolicySchema.safeParse({ years: 49, months: 0 }).success).toBe(false);
    expect(retirementPolicySchema.safeParse({ years: 81, months: 0 }).success).toBe(false);
    expect(retirementPolicySchema.safeParse({ years: 50, months: 0 }).success).toBe(true);
    expect(retirementPolicySchema.safeParse({ years: 80, months: 11 }).success).toBe(true);
  });

  it('enforces the month bounds (0-11)', () => {
    expect(retirementPolicySchema.safeParse({ years: 67, months: -1 }).success).toBe(false);
    expect(retirementPolicySchema.safeParse({ years: 67, months: 12 }).success).toBe(false);
  });

  it('rejects non-integer years and months', () => {
    expect(retirementPolicySchema.safeParse({ years: 67.5, months: 0 }).success).toBe(false);
    expect(retirementPolicySchema.safeParse({ years: 67, months: 3.2 }).success).toBe(false);
  });
});

describe('settingsSchema', () => {
  it('accepts a settings payload with a null updatedAt (never changed)', () => {
    expect(
      settingsSchema.parse({
        retirementPolicy: { years: 67, months: 3 },
        updatedAt: null,
      })
    ).toEqual({ retirementPolicy: { years: 67, months: 3 }, updatedAt: null });
  });

  it('accepts an ISO updatedAt timestamp', () => {
    const result = settingsSchema.safeParse({
      retirementPolicy: { years: 68, months: 0 },
      updatedAt: '2026-06-04T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer retirement policy', () => {
    expect(
      settingsSchema.safeParse({
        retirementPolicy: { years: 67.5, months: 3 },
        updatedAt: null,
      }).success
    ).toBe(false);
  });
});
