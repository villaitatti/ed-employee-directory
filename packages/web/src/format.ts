import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { DATE_INPUT_DISPLAY_FORMAT } from './ui/DateField.js';

const tableDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const parsed = dayjs(value, 'YYYY-MM-DD', true);
  return parsed.isValid() ? parsed.locale(locale).format(DATE_INPUT_DISPLAY_FORMAT) : value;
}

/** The date locale, resolved the same way everywhere: Italian unless English. */
export function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'it';
}

export function formatTableDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : tableDateTimeFormatter.format(date);
}
