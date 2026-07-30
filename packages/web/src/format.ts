import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

/** How a date is written back to the operator: `15 marzo 1990`, in their language. */
export const DATE_INPUT_DISPLAY_FORMAT = 'DD MMMM YYYY';

/**
 * Day-first formats only — never fall back to browser `Date`, which reads a bare
 * `1/5/1990` as 5 January. Nothing here is ambiguous: `1/5/1990` is 1 May, always.
 *
 * Deliberately not natural-language parsing ("next friday", "in 3 weeks"), which
 * shadcn's own date-picker example reaches for. A birth date and a hire date are
 * transcribed from a document; a parser that guesses is a parser that can be wrong
 * without anyone noticing.
 */
const DATE_INPUT_PARSE_FORMATS = [
  DATE_INPUT_DISPLAY_FORMAT,
  'D MMMM YYYY',
  'DD/MM/YYYY',
  'D/M/YYYY',
  'DD-MM-YYYY',
  'D-M-YYYY',
  'DD.MM.YYYY',
  'D.M.YYYY',
  'YYYY-MM-DD',
] as const;

export function parseEmployeeDateInput(input: string, locale: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const format of DATE_INPUT_PARSE_FORMATS) {
    const parsed = dayjs(trimmed, format, locale, true);
    if (parsed.isValid()) return parsed.format('YYYY-MM-DD');
  }

  return null;
}

/**
 * A date, written the one way this app writes dates: localized, `DD MMMM YYYY`.
 *
 * The tables used to have a format of their own — fixed en-GB `30 Jun 2050`,
 * chosen for column width — which meant an Italian operator read one spelling in
 * the directory and a different one in the field they were about to edit, and an
 * English operator got English either way. One convention, everywhere.
 */
export function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const parsed = dayjs(value, 'YYYY-MM-DD', true);
  return parsed.isValid() ? parsed.locale(locale).format(DATE_INPUT_DISPLAY_FORMAT) : value;
}

/**
 * A timestamp: the same date, plus the time it happened, in the reader's own
 * time zone. 24-hour, because this is an Italian office and `2:52 pm` is not how
 * anyone here writes it.
 */
export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.locale(locale).format(`${DATE_INPUT_DISPLAY_FORMAT}, HH:mm`) : value;
}

/** The date locale, resolved the same way everywhere: Italian unless English. */
export function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'it';
}
