import { FULL_TIME_WEEKLY_MINUTES, WEEKDAY_KEYS, type EmployeeStatus, type WeekdayKey } from './constants.js';

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

/**
 * The statutory retirement age, expressed as a number of years and months added
 * to an employee's birth date. Configurable by staff (e.g. the CFO) because the
 * Italian pension age changes by law; {@link DEFAULT_RETIREMENT_POLICY} is the
 * value in force when this directory was built (67 years, 3 months).
 */
export type RetirementPolicy = {
  years: number;
  months: number;
};

export const DEFAULT_RETIREMENT_POLICY: RetirementPolicy = { years: 67, months: 3 };

export function calculateRetirementDate(
  birthDate: string,
  policy: RetirementPolicy = DEFAULT_RETIREMENT_POLICY
): DateString {
  return addYearsAndMonths(birthDate, policy.years, policy.months);
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

export type WeeklyScheduleMinutes = Record<WeekdayKey, number>;

export const DEFAULT_WEEKLY_SCHEDULE_MINUTES: WeeklyScheduleMinutes = {
  monday: 450,
  tuesday: 450,
  wednesday: 450,
  thursday: 450,
  friday: 450,
};

export function parseSessantesimiInput(input: string | number): number {
  if (typeof input === 'number') {
    if (Number.isInteger(input) && input >= 0 && input <= 24 * 60) return input;
    throw new Error('Hours must be whole minutes between 0 and 1440.');
  }

  const normalized = input.trim();
  const match = /^(\d{1,2})(?:,([0-5]\d))?$/.exec(normalized);
  if (!match) {
    throw new Error('Hours must use the H,MM sessantesimi format, for example 7,30.');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? '00');
  const total = hours * 60 + minutes;
  if (total > 24 * 60) {
    throw new Error('Hours must be between 0,00 and 24,00.');
  }
  return total;
}

export function formatSessantesimiMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60 * WEEKDAY_KEYS.length) {
    throw new Error('Minutes must be a non-negative whole number.');
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours},${String(remainder).padStart(2, '0')}`;
}

export function weeklyScheduleTotalMinutes(schedule: WeeklyScheduleMinutes): number {
  return WEEKDAY_KEYS.reduce((total, key) => total + schedule[key], 0);
}

export function expectedWeeklyMinutesForFte(fte: number): number {
  return Math.round(fte * FULL_TIME_WEEKLY_MINUTES);
}

export function normalizeDepartmentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it-IT');
}

/**
 * Canonical form of a work email. The database enforces uniqueness on the stored
 * value, so both the write schema and the import's duplicate check must fold case
 * identically — hence one shared helper rather than two matching expressions.
 * Uses the invariant locale: an Italian lowercase mapping would be wrong for an
 * address, which is ASCII by the time it reaches here.
 */
export function normalizeWorkEmail(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

/**
 * A cross-field date rule, tagged with the form field the operator has to fix.
 * The field travels with the message so a rejected save can highlight the input
 * instead of only naming it in a sentence.
 */
export type StatusDateError = {
  field: 'hireDate' | 'terminationDate';
  code: 'HIRE_DATE_REQUIRED' | 'TERMINATION_DATE_REQUIRED' | 'TERMINATION_BEFORE_HIRE';
  message: string;
};

export function validateStatusDates(input: StatusDateInput): StatusDateError[] {
  const errors: StatusDateError[] = [];
  if (input.status === 'ATTIVO' && !input.hireDate) {
    errors.push({
      field: 'hireDate',
      code: 'HIRE_DATE_REQUIRED',
      message: 'Active employees require a hire date.',
    });
  }
  if (input.status === 'CESSATO' && !input.terminationDate) {
    errors.push({
      field: 'terminationDate',
      code: 'TERMINATION_DATE_REQUIRED',
      message: 'Terminated employees require a termination date.',
    });
  }
  if (input.hireDate && input.terminationDate && input.terminationDate < input.hireDate) {
    errors.push({
      field: 'terminationDate',
      code: 'TERMINATION_BEFORE_HIRE',
      message: 'Termination date cannot be before hire date.',
    });
  }
  return errors;
}

export function resolveRetirementDate(input: {
  birthDate: string;
  currentRetirementDate?: string | null | undefined;
  currentRetirementDateOverridden?: boolean | undefined;
  requestedRetirementDate?: string | null | undefined;
  resetOverride?: boolean | undefined;
  confirmRetirementDate?: boolean | undefined;
  policy?: RetirementPolicy | undefined;
}): { retirementDate: DateString; retirementDateOverridden: boolean } {
  const calculated = calculateRetirementDate(input.birthDate, input.policy);

  if (input.resetOverride) {
    return { retirementDate: calculated, retirementDateOverridden: false };
  }

  if (input.confirmRetirementDate) {
    const confirmedDate = input.requestedRetirementDate ?? input.currentRetirementDate ?? calculated;
    parseDateOnly(confirmedDate);
    return { retirementDate: confirmedDate as DateString, retirementDateOverridden: true };
  }

  if (!input.requestedRetirementDate) {
    // No new retirement date supplied. Preserve a previously-confirmed date
    // rather than silently recalculating — otherwise an import (or form save)
    // that omits the retirement column wipes the approved government date.
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
