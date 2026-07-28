/**
 * The house convention for a work address: first initial + surname, at the
 * institute domain. Andrea Caselli becomes acaselli@itatti.harvard.edu.
 *
 * This lives in the web package on purpose. The server must never derive an
 * address — a guessed value written by an API or an import would reach the
 * database with nobody having read it, and both mail routing and the Ferie
 * portal's identity key depend on it being right. Here it is only a suggestion:
 * it appears in a field the operator can see and correct before saving, so a
 * person still authors the value.
 */

export const WORK_EMAIL_DOMAIN = 'itatti.harvard.edu';

/**
 * Folds a name to the ASCII letters an address can carry: strips accents (Rossì
 * becomes rossi) and drops spaces, apostrophes and anything else outside
 * [a-z0-9-], so "D'Angelo" and "De Luca" yield dangelo and deluca rather than an
 * address the mail server would reject.
 */
function asciiFold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Returns the conventional address for a name, or an empty string when either
 * part is missing or folds away to nothing (a name written entirely in a
 * non-Latin script, say). Callers treat an empty result as "no suggestion" and
 * leave the field alone rather than writing a malformed address.
 *
 * A double first name follows the same rule as any other — Maria Teresa Rossi
 * gives mrossi. Anyone the convention does not fit is edited by hand.
 */
export function deriveWorkEmail(firstName: string, lastName: string): string {
  const first = asciiFold(firstName);
  const last = asciiFold(lastName);
  if (!first || !last) return '';
  return `${first.slice(0, 1)}${last}@${WORK_EMAIL_DOMAIN}`;
}
