import { toast } from 'sonner';
import { describeError, type FriendlyError } from '../api/error-messages.js';
import type { Translate } from '../i18n/types.js';


/**
 * Errors stay up long enough to read a two-line explanation and act on it — the
 * 4s default is fine for "Saved" but not for "here is which field to fix". They
 * are also dismissible, so a long message never has to be waited out.
 */
const ERROR_DURATION_MS = 10_000;

/**
 * Reports a failed request as a toast and hands back the same description the
 * caller needs to highlight fields. One call site per mutation keeps the toast and
 * the inline field markers from ever disagreeing about what went wrong.
 */
export function notifyError(
  error: unknown,
  t: Translate,
  /**
   * Set on writes whose outcome the message doesn't already make obvious (a
   * network drop, a 500). "No changes were saved" is the first thing an operator
   * needs after a failed save; for a rejected value it is redundant, so the
   * catalogue leaves it out of those bodies and it is prefixed here instead.
   */
  options: { unsaved?: boolean } = {}
): FriendlyError {
  const described = describeError(error, t);
  const reassurance = options.unsaved && described.reassure ? t('errors.nothingSaved') : '';
  const description = [reassurance, described.description].filter(Boolean).join(' ');
  toast.error(described.title, {
    ...(description ? { description } : {}),
    duration: ERROR_DURATION_MS,
    closeButton: true,
  });
  return described;
}

/** Confirms a completed action, naming the record it applied to. */
export function notifySuccess(title: string, description?: string): void {
  toast.success(title, { ...(description ? { description } : {}) });
}

/**
 * Reports a form that was blocked before it was sent. Distinct from
 * {@link notifyError} because there is no request and no code to translate — just
 * the list of fields the operator has to revisit, which the form has also marked
 * inline.
 */
export function notifyValidation(title: string, description: string): void {
  toast.error(title, { description, duration: ERROR_DURATION_MS, closeButton: true });
}
