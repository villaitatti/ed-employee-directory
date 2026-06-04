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
