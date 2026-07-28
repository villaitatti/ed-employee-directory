import { fieldLabels } from '../employee-validation.js';
import type { Translate } from '../i18n/types.js';
import { ApiError } from './client.js';

/**
 * A failure rendered for a human: what went wrong, what to do about it, and which
 * form fields to highlight.
 *
 * The server speaks in codes and English sentences; this is the single place that
 * turns one into the other so every toast, banner, and field marker in the app
 * says the same thing in the same language. Anything the catalogue doesn't know
 * still gets a usable title (the server's own sentence) rather than "Errore".
 */
export type FriendlyError = {
  title: string;
  /** The next action the operator should take. Always present when we know the code. */
  description: string | undefined;
  /** Draft field key → localized message, for inline highlighting. */
  fieldErrors: Record<string, string>;
  /**
   * True when the failure leaves the outcome ambiguous (the request may never
   * have reached the server, or blew up inside it) and a write caller should
   * spell out that nothing was saved. A rejected *value* is unambiguous, so
   * those don't set it.
   */
  reassure: boolean;
};


/**
 * Which form field each error code points at. Codes absent from this map are not
 * attributable to one input and are reported in the toast only.
 */
const FIELD_BY_CODE: Record<string, string> = {
  RESPONSABILE_REQUIRED: 'responsabileIds',
  SOSTITUTO_RESPONSABILE_REQUIRED: 'substituteResponsabileIds',
  APPROVER_NOT_RESPONSABILE_ELIGIBLE: 'responsabileIds',
  APPROVER_NOT_SUBSTITUTE_ELIGIBLE: 'substituteResponsabileIds',
};

/** Duplicate-constraint field names (from the server) → draft field keys. */
const DUPLICATE_FIELD_KEYS: Record<string, string> = {
  employeeNumber: 'employeeNumber',
  workEmail: 'workEmail',
  departmentName: 'name',
};

/**
 * Top-level keys Zod can report. Nested paths collapse to their parent in
 * `flatten()`, so `approvalRoleIds.responsabileIds` arrives as `approvalRoleIds` —
 * mapped here to the field the operator can actually see and change.
 */
const VALIDATION_FIELD_KEYS: Record<string, string> = {
  employeeNumber: 'employeeNumber',
  firstName: 'firstName',
  lastName: 'lastName',
  workEmail: 'workEmail',
  departmentId: 'departmentId',
  birthDate: 'birthDate',
  hireDate: 'hireDate',
  terminationDate: 'terminationDate',
  retirementDate: 'retirementDate',
  fte: 'fte',
  weeklySchedule: 'weeklySchedule',
  approvalRoleIds: 'responsabileIds',
  name: 'name',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Zod's `flatten()` payload, as it survives the JSON round trip. */
function validationFieldErrors(details: unknown): string[] {
  if (!isRecord(details)) return [];
  const fieldErrors = details['fieldErrors'];
  if (!isRecord(fieldErrors)) return [];
  return Object.keys(fieldErrors).filter((key) => Array.isArray(fieldErrors[key]) && key in VALIDATION_FIELD_KEYS);
}

/**
 * A request that never reached the server (offline, DNS, CORS, aborted): `fetch`
 * rejects with a TypeError rather than resolving to a response, so there is no
 * status or code to key on.
 */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

/**
 * Builds the human-facing description of a failure. Resolution order: the error
 * code, then the HTTP status class, then the server's own sentence — so a code
 * added on the server before the catalogue catches up still degrades to something
 * readable instead of a bare "Error".
 */
export function describeError(error: unknown, t: Translate): FriendlyError {
  if (isNetworkFailure(error)) {
    return {
      title: t('errors.NETWORK.title'),
      description: t('errors.NETWORK.body'),
      fieldErrors: {},
      reassure: true,
    };
  }

  if (!(error instanceof ApiError)) {
    return {
      title: error instanceof Error && error.message ? error.message : t('errors.UNKNOWN.title'),
      description: t('errors.UNKNOWN.body'),
      fieldErrors: {},
      reassure: true,
    };
  }

  const params = isRecord(error.details) ? error.details : {};

  if (error.code === 'VALIDATION_ERROR') {
    const fields = validationFieldErrors(error.details);
    const fieldErrors = Object.fromEntries(
      fields.map((field) => [VALIDATION_FIELD_KEYS[field]!, t('errors.fieldRejected')])
    );
    const labels = fieldLabels(fields, t);
    return {
      title: t('errors.VALIDATION_ERROR.title'),
      description: labels
        ? t('errors.VALIDATION_ERROR.bodyWithFields', { fields: labels })
        : t('errors.VALIDATION_ERROR.body'),
      fieldErrors,
      reassure: false,
    };
  }

  if (error.code === 'DUPLICATE_VALUE') {
    const field = typeof params['field'] === 'string' ? params['field'] : undefined;
    const key = field ? DUPLICATE_FIELD_KEYS[field] : undefined;
    if (field && key) {
      return {
        title: t(`errors.DUPLICATE_VALUE.${field}.title`),
        description: t(`errors.DUPLICATE_VALUE.${field}.body`),
        fieldErrors: { [key]: t(`errors.DUPLICATE_VALUE.${field}.field`) },
        reassure: false,
      };
    }
    return {
      title: t('errors.DUPLICATE_VALUE.title'),
      description: t('errors.DUPLICATE_VALUE.body'),
      fieldErrors: {},
      reassure: false,
    };
  }

  // Authentication and authorization outrank the code, but they are *different
  // problems with different remedies* and must not be collapsed. A 401 means the
  // token expired, and signing in again fixes it. A 403 means the account lacks
  // the staff role — signing in again changes nothing, and telling someone to try
  // it sends them round a loop instead of to whoever can grant the role.
  if (error.status === 401) {
    return {
      title: t('errors.UNAUTHORIZED.title'),
      description: t('errors.UNAUTHORIZED.body'),
      fieldErrors: {},
      reassure: true,
    };
  }
  if (error.status === 403) {
    return {
      title: t('errors.FORBIDDEN.title'),
      description: t('errors.FORBIDDEN.body'),
      fieldErrors: {},
      reassure: true,
    };
  }

  const code = error.code ?? '';
  const titleKey = `errors.${code}.title`;
  const translated = code ? t(titleKey, params) : titleKey;
  if (code && translated !== titleKey) {
    const field = FIELD_BY_CODE[code];
    const body = t(`errors.${code}.body`, params);
    return {
      title: translated,
      description: body,
      fieldErrors: field ? { [field]: translated } : {},
      reassure: error.status >= 500,
    };
  }

  // Unknown code: the server's sentence is still more informative than a generic
  // apology, so lead with it and add the status-appropriate next step.
  const fallbackKey = error.status >= 500 ? 'errors.SERVER.body' : 'errors.UNKNOWN.body';
  return {
    title: error.message || t('errors.UNKNOWN.title'),
    description: t(fallbackKey),
    fieldErrors: {},
    reassure: true,
  };
}
