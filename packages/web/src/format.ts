import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { DATE_INPUT_DISPLAY_FORMAT } from './ui/DateField.js';

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
