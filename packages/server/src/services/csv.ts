import type { EmployeeWriteInput } from '@itatti/shared';

/**
 * Pure CSV parsing/formatting helpers for the employee import/export flow.
 * Kept free of Prisma/env imports so they can be unit-tested in isolation.
 */

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .replace(/[^a-z0-9]+/g, ' ');
}

export function readFirst(row: Record<string, string>, aliases: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(key))) {
      return value.trim();
    }
  }
  return '';
}

export function parseNullableDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (italian) {
    const [, day = '', month = '', year = ''] = italian;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Parses the "Retirement Date Confirmed" column. Recognizes Italian/English
 * truthy tokens; everything else (including blank) is false. Returns false when
 * the column is absent so a CSV without it recalculates rather than freezing.
 */
const TRUTHY_TOKENS = ['true', 'si', 'yes', 'y', 'x', '1', 'vero'];
const FALSY_TOKENS = ['false', 'no', 'n', '0', 'falso'];

export function parseBoolean(value: string): boolean {
  return TRUTHY_TOKENS.includes(normalizeHeader(value));
}

/**
 * Parses an optional boolean column. Returns undefined when the cell is blank
 * OR holds an unrecognized token (e.g. 'n/a', '-'), so noise data is treated as
 * "not specified" and leaves the existing value untouched rather than silently
 * flipping it to false.
 */
export function parseOptionalBoolean(value: string): boolean | undefined {
  const normalized = normalizeHeader(value);
  if (!normalized) return undefined;
  if (TRUTHY_TOKENS.includes(normalized)) return true;
  if (FALSY_TOKENS.includes(normalized)) return false;
  return undefined;
}

export function parseEmployeeNumberList(value: string): { values: number[]; errors: string[] } {
  const trimmed = value.trim();
  if (!trimmed) return { values: [], errors: [] };

  const values: number[] = [];
  const errors: string[] = [];
  // Accept comma as well as semicolon/newline: exports use '; ', but operators
  // hand-editing the file naturally reach for commas. Both round-trip cleanly.
  for (const token of trimmed.split(/[;,\n]+/)) {
    const normalized = token.trim();
    if (!normalized) continue;
    const employeeNumber = Number(normalized);
    if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) {
      errors.push(`Invalid Employee Number in approver list: ${normalized}.`);
      continue;
    }
    values.push(employeeNumber);
  }

  const duplicates = [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
  for (const duplicate of duplicates) {
    errors.push(`Employee Number ${duplicate} appears more than once in the same approver list.`);
  }

  return { values, errors };
}

export function parseUsaCategory(value: string): EmployeeWriteInput['usaCategory'] | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === 'exempt') return 'EXEMPT';
  if (normalized === 'non exempt' || normalized === 'non exempted' || normalized === 'non exempt usa') {
    return 'NON_EXEMPT';
  }
  if (normalized === 'other' || normalized === 'altro') return 'OTHER';
  return undefined;
}

export function parseContractType(value: string): EmployeeWriteInput['contractType'] | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === 'indeterminato' || normalized === 'permanent') return 'INDETERMINATO';
  if (normalized === 'determinato' || normalized === 'fixed term') return 'DETERMINATO';
  if (normalized === 'contratto usa' || normalized === 'us contract') return 'CONTRATTO_USA';
  if (normalized === 'collaboratore' || normalized === 'collaborator') return 'COLLABORATORE';
  return undefined;
}

export function parseTfr(value: string): EmployeeWriteInput['tfr'] | string | undefined {
  const normalized = normalizeHeader(value);
  if (!normalized) return undefined;
  if (normalized === 'i tatti' || normalized === 'itatti') return 'I_TATTI';
  if (normalized === 'fondo pensione') return 'FONDO_PENSIONE';
  return value;
}

export function parseStatus(value: string): EmployeeWriteInput['status'] | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === 'attivo' || normalized === 'active') return 'ATTIVO';
  if (normalized === 'cessato' || normalized === 'terminated') return 'CESSATO';
  if (normalized === 'da assumere' || normalized === 'to be hired') return 'DA_ASSUMERE';
  return undefined;
}

export function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // is treated as a formula by Excel/Sheets. Prefix with a single quote so the
  // cell is rendered as literal text.
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}
