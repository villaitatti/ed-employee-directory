import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/it';
import { useTranslation } from 'react-i18next';

// Set up where it is used. This lived in AppUiProvider, which meant the module
// that owns every date convention in the app depended on a component having been
// rendered first: import `formatDate` on its own and you got English month names
// and a parser that guessed at `1/5/1990`. The plugins are idempotent and the
// consumers — this file and DateField, which imports from it — now cannot load
// without them.
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * The clock this app tells the time by.
 *
 * Every timestamp is stored as a UTC instant and serialized with a `Z`, so the
 * instant is never in doubt — but rendering it used to mean "whatever time zone
 * the reader's laptop is set to". In an office in Florence that is right by
 * accident, and wrong the moment someone opens the audit log from Cambridge: a
 * change made at 14:41 reads 08:41, with nothing on screen to say which it is, and
 * two people looking at the same row disagree about when it happened. An audit log
 * is the one table that cannot afford that.
 *
 * Pinned to the IANA zone rather than a fixed +01:00 offset, which is what makes
 * the switch to and from ora legale correct without anybody touching this: the
 * zone database knows that 2026-10-25 02:00 is when Florence goes back to CET, and
 * a hardcoded offset would be an hour wrong for seven months of the year.
 */
export const OFFICE_TIME_ZONE = 'Europe/Rome';

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
 * A timestamp: the same date, plus the time it happened, on the office clock in
 * Florence — see {@link OFFICE_TIME_ZONE}, and note that this is deliberately *not*
 * the reader's own zone. 24-hour, because this is an Italian office and `2:52 pm`
 * is not how anyone here writes it.
 */
export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const parsed = dayjs(value);
  if (!parsed.isValid()) return value;
  return parsed.tz(OFFICE_TIME_ZONE).locale(locale).format(`${DATE_INPUT_DISPLAY_FORMAT}, HH:mm`);
}

/** The date locale, resolved the same way everywhere: Italian unless English. */
export function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'it';
}
