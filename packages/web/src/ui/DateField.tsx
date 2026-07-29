import { useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Calendar } from '@/components/ui/calendar';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
 * How far the month and year dropdowns reach.
 *
 * One range for every date field rather than a tailored one each, because these
 * bounds also gate what the grid will navigate to: narrow them per field and a
 * date typed outside the window becomes one the calendar refuses to show. A
 * century back covers any birth date; seventy years forward covers a projected
 * retirement for someone hired today.
 */
const THIS_YEAR = new Date().getFullYear();
const EARLIEST_MONTH = new Date(THIS_YEAR - 100, 0);
const LATEST_MONTH = new Date(THIS_YEAR + 70, 11);

/** `2026-03-02` as a local `Date`, which is what the calendar grid works in. */
function toCalendarDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * A date, typed or picked.
 *
 * The stored value is always `YYYY-MM-DD`; the box shows the localized long form
 * and accepts any of the day-first shapes above. While the field has focus it
 * shows exactly what has been typed — reformatting under the caret is the fastest
 * way to make a text field feel broken — and settles back to the display form on
 * blur, or as soon as a day is picked from the calendar.
 */
export function DateField({
  ariaLabel,
  value,
  onChange,
  required,
  disabled,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Draws the red border. The message itself lives on the surrounding Field. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'it';
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  /** What has been typed, or `null` while the field is showing the stored value. */
  const [typed, setTyped] = useState<string | null>(null);
  /**
   * Whether the next focus on the box should open the calendar.
   *
   * Arriving at an empty field should offer it; being handed the caret back
   * after picking a day should not, or closing the calendar re-opens it on the
   * way out.
   */
  const openOnNextFocus = useRef(true);

  const selected = toCalendarDate(value);
  const display = selected ? dayjs(selected).locale(locale).format(DATE_INPUT_DISPLAY_FORMAT) : '';
  const text = typed ?? display;

  // The grid follows the value: typing `01/12/2000` has to walk the calendar to
  // December 2000, or the date just typed isn't on screen to confirm. Between
  // those jumps the month is the operator's to browse, so it stays in state
  // rather than being derived from the value on every render.
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const lastValue = useRef(value);
  if (lastValue.current !== value) {
    lastValue.current = value;
    if (selected) setMonth(selected);
  }

  const type = (raw: string) => {
    setTyped(raw);
    // An unreadable value is no value: leaving the last good date stored while
    // the box shows something else would submit a date nobody can see.
    onChange(raw.trim() ? (parseEmployeeDateInput(raw, locale) ?? '') : '');
  };

  const pick = (date: Date | undefined) => {
    if (!date) return;
    setTyped(null);
    onChange(dayjs(date).format('YYYY-MM-DD'));
    setOpen(false);
    // Picking a day answers the question, so the caret goes back to the box —
    // but only if it left. Handing focus back is finishing, not arriving, so it
    // must not count as the kind of focus that opens the calendar.
    if (document.activeElement !== inputRef.current) {
      openOnNextFocus.current = false;
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    setTyped(null);
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next, details) => {
        // Typing in the box, or clicking back into it, is not "clicking away
        // from the calendar" — but Base UI counts anything outside the popup as
        // an outside press, and the box is outside the popup.
        if (
          !next &&
          details.reason === 'outside-press' &&
          details.event.target instanceof Node &&
          anchorRef.current?.contains(details.event.target)
        ) {
          return;
        }
        setOpen(next);
      }}
    >
      <InputGroup ref={anchorRef}>
        {/* The calendar icon is the popover's trigger and nothing else: a second,
            decorative one on the leading edge would make the field look like it
            had two of them. */}
        <InputGroupInput
          ref={inputRef}
          // Never `type="date"`: that hands the field to the browser's own widget,
          // which is month-first and speaks the browser's language.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          {...(required ? { required: true } : {})}
          {...(disabled ? { disabled: true } : {})}
          {...(invalid ? { 'aria-invalid': true } : {})}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          className="pl-2.5"
          placeholder={t('fields.datePlaceholder')}
          value={text}
          onChange={(event) => type(event.currentTarget.value)}
          onFocus={() => {
            if (openOnNextFocus.current) setOpen(true);
            openOnNextFocus.current = true;
          }}
          // Focus alone isn't enough to re-offer the calendar: after picking a
          // day the box keeps the caret, so clicking it to choose a different
          // date fires no focus event at all.
          onClick={() => setOpen(true)}
          onBlur={() => setTyped(null)}
        />
        <InputGroupAddon align="inline-end">
          {value && !disabled ? (
            <InputGroupButton size="icon-xs" aria-label={t('actions.clearDate')} onClick={clear}>
              <X aria-hidden="true" />
            </InputGroupButton>
          ) : null}
          <PopoverTrigger
            render={
              <InputGroupButton
                size="icon-xs"
                aria-label={t('actions.openCalendar')}
                {...(disabled ? { disabled: true } : {})}
              />
            }
          >
            <CalendarDays aria-hidden="true" />
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent
        anchor={anchorRef}
        align="start"
        className="w-auto p-0"
        // The calendar is an aid to the text box, not a replacement for it: taking
        // the caret away the moment it opens would stop the operator mid-date.
        initialFocus={false}
      >
        <Calendar
          mode="single"
          // Keeps a re-click on the already-selected day from clearing it, which
          // is what happens right after typing a date and reaching for confirmation.
          required
          selected={selected}
          onSelect={pick}
          month={month}
          onMonthChange={setMonth}
          weekStartsOn={1}
          // A birth date is forty years back. Stepping there a month at a time is
          // not navigation, so the caption is two dropdowns; the arrows stay for
          // the short hops either side of where you land.
          captionLayout="dropdown"
          startMonth={EARLIEST_MONTH}
          endMonth={LATEST_MONTH}
          formatters={{
            formatCaption: (date: Date) => dayjs(date).locale(locale).format('MMMM YYYY'),
            formatWeekdayName: (date: Date) => dayjs(date).locale(locale).format('dd'),
            formatMonthDropdown: (date: Date) => dayjs(date).locale(locale).format('MMMM'),
          }}
          labels={{
            // The whole date, in the operator's language: a day button announced
            // as "1" is useless, and the library's default is English prose.
            labelDayButton: (date: Date) => dayjs(date).locale(locale).format('D MMMM YYYY'),
            labelPrevious: () => t('actions.previousMonth'),
            labelNext: () => t('actions.nextMonth'),
            labelMonthDropdown: () => t('actions.chooseMonth'),
            labelYearDropdown: () => t('actions.chooseYear'),
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
