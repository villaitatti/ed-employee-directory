import { WEEKDAY_KEYS, isValidDateString, parseFteInput, parseSessantesimiInput, validateStatusDates } from '@itatti/shared';
import type { EmployeeDraft } from './App.js';
import type { Translate } from './i18n/types.js';

/**
 * Field key → localized message. Keys match the draft's own field names so a
 * component can look its error up directly; weekday hours are namespaced under
 * `weekly.<day>` and the approval roles under their role id list.
 */
export type FieldErrors = Record<string, string>;


/**
 * Field key → the translation key of its visible label. Used to name fields in
 * error summaries, so a toast can say "check Hire Date" using the exact wording
 * printed above the input.
 */
export const FIELD_LABEL_KEYS: Record<string, string> = {
  employeeNumber: 'fields.employeeNumber',
  firstName: 'fields.firstName',
  lastName: 'fields.lastName',
  workEmail: 'fields.workEmail',
  departmentId: 'fields.department',
  name: 'fields.department',
  birthDate: 'fields.birthDate',
  hireDate: 'fields.hireDate',
  terminationDate: 'fields.terminationDate',
  retirementDate: 'fields.retirementDate',
  fte: 'fields.fte',
  responsabileIds: 'fields.responsabili',
  substituteResponsabileIds: 'fields.substituteResponsabili',
  weeklySchedule: 'sections.weeklySchedule',
  approvalRoleIds: 'sections.approvalWorkflow',
  ...Object.fromEntries(WEEKDAY_KEYS.map((key) => [`weekly.${key}`, `weekday.${key}`])),
};

/**
 * Which section of the employee form owns each field, so a long scrolling dialog
 * can show where the remaining problems are without the operator hunting for them.
 */
export const FIELD_SECTIONS: Record<string, string> = {
  employeeNumber: 'identity',
  firstName: 'identity',
  lastName: 'identity',
  birthDate: 'identity',
  workEmail: 'identity',
  departmentId: 'identity',
  hireDate: 'employment',
  terminationDate: 'employment',
  fte: 'employment',
  retirementDate: 'employment',
  responsabileIds: 'approval',
  substituteResponsabileIds: 'approval',
  weeklySchedule: 'weekly',
  ...Object.fromEntries(WEEKDAY_KEYS.map((key) => [`weekly.${key}`, 'weekly'])),
};

/** DOM id of a field's error message, shared by the renderer and `aria-describedby`. */
export function fieldErrorId(field: string): string {
  return `field-error-${field.replace(/\W/g, '-')}`;
}

/** Human-readable, comma-separated list of the fields that need attention. */
export function fieldLabels(fields: readonly string[], t: Translate): string {
  return fields
    .map((field) => (FIELD_LABEL_KEYS[field] ? t(FIELD_LABEL_KEYS[field]!) : field))
    .join(', ');
}

/** Ordered as the form renders, so "focus the first error" lands where the eye does. */
export const FIELD_ORDER = [
  'employeeNumber',
  'firstName',
  'lastName',
  'birthDate',
  'workEmail',
  'departmentId',
  'hireDate',
  'terminationDate',
  'fte',
  'retirementDate',
  'responsabileIds',
  'substituteResponsabileIds',
  ...WEEKDAY_KEYS.map((key) => `weekly.${key}`),
  'weeklySchedule',
] as const;

/**
 * Validates a draft against the same rules the API enforces, in the operator's
 * language.
 *
 * Duplicating the server's rules here is deliberate: the server is still the
 * authority (it re-checks everything and owns the uniqueness rules a browser
 * can't see), but a round trip that comes back with an untranslated sentence and
 * no indication of *which* input to fix is a poor way to learn you left the hire
 * date blank. Anything this misses is caught server-side and mapped back onto the
 * same field keys by `describeError`.
 */
export function validateEmployeeDraft(
  draft: EmployeeDraft,
  options: { responsabileRequired: boolean; substituteRequired: boolean },
  t: Translate
): FieldErrors {
  const errors: FieldErrors = {};

  const employeeNumber = Number(draft.employeeNumber.trim());
  if (!draft.employeeNumber.trim()) {
    errors['employeeNumber'] = t('validation.required');
  } else if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) {
    errors['employeeNumber'] = t('validation.employeeNumber');
  }

  if (!draft.firstName.trim()) errors['firstName'] = t('validation.required');
  if (!draft.lastName.trim()) errors['lastName'] = t('validation.required');

  const workEmail = draft.workEmail.trim();
  if (!workEmail) {
    errors['workEmail'] = t('validation.required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
    errors['workEmail'] = t('validation.workEmail');
  }

  if (!draft.departmentId) errors['departmentId'] = t('validation.requiredSelect');

  if (!draft.birthDate) {
    errors['birthDate'] = t('validation.requiredDate');
  } else if (!isValidDateString(draft.birthDate)) {
    errors['birthDate'] = t('validation.invalidDate');
  }

  // The hire/termination interplay is the server's rule verbatim, keyed by the
  // field it blames so the message lands on the input the operator must change.
  for (const issue of validateStatusDates({
    status: draft.status,
    hireDate: draft.hireDate || null,
    terminationDate: draft.terminationDate || null,
  })) {
    errors[issue.field] ??= t(`validation.${issue.code}`);
  }

  if (!draft.fte.trim()) {
    errors['fte'] = t('validation.required');
  } else {
    try {
      parseFteInput(draft.fte);
    } catch {
      errors['fte'] = t('validation.fte');
    }
  }

  if (draft.retirementDateOverridden && !draft.retirementDate) {
    errors['retirementDate'] = t('validation.retirementDateConfirmed');
  }

  // Both halves of the server's "an active employee needs approvers" rule. The
  // substitute half used to be missing here, so a form that looked complete was
  // still rejected on save with SOSTITUTO_RESPONSABILE_REQUIRED.
  if (options.responsabileRequired && draft.approvalRoleIds.responsabileIds.length === 0) {
    errors['responsabileIds'] = t('copy.responsabileRequired');
  }
  if (options.substituteRequired && draft.approvalRoleIds.substituteResponsabileIds.length === 0) {
    errors['substituteResponsabileIds'] = t('copy.substituteRequired');
  }

  for (const key of WEEKDAY_KEYS) {
    const value = draft.weeklySchedule[key];
    if (!value.trim()) {
      errors[`weekly.${key}`] = t('validation.required');
      continue;
    }
    try {
      parseSessantesimiInput(value);
    } catch {
      errors[`weekly.${key}`] = t('validation.weeklyHours');
    }
  }

  return errors;
}

/** The fields carrying an error, in the order the form renders them. */
export function orderedErrorFields(errors: FieldErrors): string[] {
  const known = FIELD_ORDER.filter((field) => errors[field]);
  const rest = Object.keys(errors).filter((field) => !FIELD_ORDER.includes(field as never));
  return [...known, ...rest];
}

/** The first field in render order that has an error, for focus and scrolling. */
export function firstErrorField(errors: FieldErrors): string | undefined {
  return orderedErrorFields(errors)[0];
}
