import { describe, expect, it } from 'vitest';
import { employeeWriteSchema } from '@itatti/shared';

describe('employee write schema', () => {
  it('accepts a valid Italian admin payload', () => {
    const parsed = employeeWriteSchema.parse({
      employeeNumber: 1001,
      firstName: 'Ada',
      lastName: 'Lovelace',
      departmentId: 'dept_1',
      birthDate: '1980-01-15',
      hireDate: '2024-01-01',
      terminationDate: null,
      retirementDate: null,
      fte: '0,5',
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      tfr: 'I_TATTI',
      status: 'ATTIVO',
    });

    expect(parsed.fte).toBe(0.5);
  });
});
