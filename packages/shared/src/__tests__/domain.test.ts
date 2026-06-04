import { describe, expect, it } from 'vitest';
import {
  calculateRetirementDate,
  employeeWriteSchema,
  importCommitSchema,
  normalizeDepartmentName,
  parseFteInput,
  resolveRetirementDate,
  validateStatusDates,
} from '../index.js';

describe('employee domain rules', () => {
  it('calculates retirement date as birth date plus 67 years and 3 months', () => {
    expect(calculateRetirementDate('1980-01-15')).toBe('2047-04-15');
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

  it('tracks a manual retirement override until reset', () => {
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

  it('preserves an existing manual override when no new retirement date is supplied', () => {
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
      status: 'ATTIVO',
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate selected import rows', () => {
    const result = importCommitSchema.safeParse({ selectedRows: [2, 3, 2] });

    expect(result.success).toBe(false);
  });
});
