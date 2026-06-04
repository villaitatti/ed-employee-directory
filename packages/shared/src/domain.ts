import type { EmployeeStatus } from './constants.js';

export type DateString = `${number}-${number}-${number}`;

export type StatusDateInput = {
  status: EmployeeStatus;
  hireDate?: string | null | undefined;
  terminationDate?: string | null | undefined;
};

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

export function isValidDateString(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatDateOnly(date: Date): DateString {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as DateString;
}

export function addYearsAndMonths(dateString: string, years: number, months: number): DateString {
  const base = parseDateOnly(dateString);
  const sourceDay = base.getUTCDate();
  const totalMonths = base.getUTCMonth() + months;
  const targetYear = base.getUTCFullYear() + years + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const targetDay = Math.min(sourceDay, lastDayOfMonth(targetYear, targetMonth));

  return formatDateOnly(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
}

export function calculateRetirementDate(birthDate: string): DateString {
  return addYearsAndMonths(birthDate, 67, 3);
}

export function parseFteInput(input: string | number): number {
  const normalized = typeof input === 'number' ? String(input) : input.trim().replace(',', '.');
  // Cap at 3 decimal places: the DB column is Decimal(4,3), so a 4th decimal
  // (e.g. 0.0004) would silently round to 0.000 and violate the positive guarantee.
  if (!/^(0|1)(\.\d{1,3})?$/.test(normalized)) {
    throw new Error('FTE must be a decimal between 0 and 1 with at most 3 decimal places.');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error('FTE must be greater than 0 and less than or equal to 1.');
  }

  return value;
}

export function normalizeDepartmentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it-IT');
}

export function validateStatusDates(input: StatusDateInput): string[] {
  const errors: string[] = [];
  if (input.status === 'ATTIVO' && !input.hireDate) {
    errors.push('Active employees require a hire date.');
  }
  if (input.status === 'CESSATO' && !input.terminationDate) {
    errors.push('Terminated employees require a termination date.');
  }
  if (input.hireDate && input.terminationDate && input.terminationDate < input.hireDate) {
    errors.push('Termination date cannot be before hire date.');
  }
  return errors;
}

export function resolveRetirementDate(input: {
  birthDate: string;
  currentRetirementDate?: string | null | undefined;
  currentRetirementDateOverridden?: boolean | undefined;
  requestedRetirementDate?: string | null | undefined;
  resetOverride?: boolean | undefined;
}): { retirementDate: DateString; retirementDateOverridden: boolean } {
  const calculated = calculateRetirementDate(input.birthDate);

  if (input.resetOverride) {
    return { retirementDate: calculated, retirementDateOverridden: false };
  }

  if (!input.requestedRetirementDate) {
    // No new retirement date supplied. Preserve a previously-set manual override
    // rather than silently recalculating — otherwise an import (or form save)
    // that omits the retirement column wipes the operator's manual value.
    if (input.currentRetirementDateOverridden && input.currentRetirementDate) {
      parseDateOnly(input.currentRetirementDate);
      return {
        retirementDate: input.currentRetirementDate as DateString,
        retirementDateOverridden: true,
      };
    }
    return { retirementDate: calculated, retirementDateOverridden: false };
  }

  if (input.requestedRetirementDate !== calculated) {
    parseDateOnly(input.requestedRetirementDate);
    return {
      retirementDate: input.requestedRetirementDate as DateString,
      retirementDateOverridden: true,
    };
  }

  return { retirementDate: calculated, retirementDateOverridden: false };
}
