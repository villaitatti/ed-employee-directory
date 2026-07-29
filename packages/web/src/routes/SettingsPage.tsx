import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RETIREMENT_MONTHS_MAX,
  RETIREMENT_MONTHS_MIN,
  RETIREMENT_YEARS_MAX,
  RETIREMENT_YEARS_MIN,
} from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldErrorId, isDecimalInteger, type FieldErrors } from '../employee-validation.js';
import { formatTableDateTime } from '../format.js';
import { useApi } from '../hooks.js';
import { Field } from '../ui/Field.js';
import { QueryError } from '../ui/QueryError.js';
import { useConfirmation } from '../ui/confirmation.js';
import { notifyError, notifySuccess, notifyValidation } from '../ui/feedback.js';
import { PageHeading, PageSection } from '../ui/layout.js';

export function SettingsPage() {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const api = useApi();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  const [years, setYears] = useState('');
  const [months, setMonths] = useState('');
  const [edited, setEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loaded = settings.data;

  /**
   * The same bounds the API enforces, phrased for the person typing. Without this
   * the only feedback for "70 years" is a 400 whose body reads "The request did
   * not pass validation."
   *
   * The grammar is checked before the conversion, not after: dropping the native
   * `type="number"` (for its spinners and scroll-wheel hazard) also dropped the
   * browser's refusal to accept `0x40`, which `Number()` reads as a perfectly
   * in-range 64 and would recalculate every employee's retirement date from.
   */
  const policyErrors = (): FieldErrors => {
    const bounded = (raw: string, min: number, max: number): string | undefined => {
      const value = raw.trim();
      if (!value) return t('validation.required');
      if (!isDecimalInteger(value)) return t('validation.range', { min, max });
      const parsed = Number(value);
      return parsed < min || parsed > max ? t('validation.range', { min, max }) : undefined;
    };
    const errors: FieldErrors = {};
    const yearsError = bounded(years, RETIREMENT_YEARS_MIN, RETIREMENT_YEARS_MAX);
    const monthsError = bounded(months, RETIREMENT_MONTHS_MIN, RETIREMENT_MONTHS_MAX);
    if (yearsError) errors['years'] = yearsError;
    if (monthsError) errors['months'] = monthsError;
    return errors;
  };
  const shownErrors = submitted ? policyErrors() : {};

  // Seed the inputs once the setting loads, unless the user is already editing.
  useEffect(() => {
    if (loaded && !edited) {
      setYears(String(loaded.retirementPolicy.years));
      setMonths(String(loaded.retirementPolicy.months));
    }
  }, [loaded, edited]);

  const savePolicy = useMutation({
    mutationFn: async () =>
      api.updateRetirementPolicy({ years: Number(years), months: Number(months) }),
    onSuccess: (result) => {
      setEdited(false);
      const count = result.recalculatedEmployees;
      notifySuccess(
        t('settings.recalcDone'),
        count === 0 ? t('settings.recalcDoneNone') : t('settings.recalcDoneBody', { count })
      );
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => notifyError(error, t, { unsaved: true }),
  });

  return (
    <PageSection className="max-w-[44rem]">
      <PageHeading eyebrow={t('nav.settings')} title={t('settings.title')} />

      {settings.isError ? <QueryError error={settings.error} onRetry={() => void settings.refetch()} /> : null}
      {loaded?.malformed ? (
        <p className="m-0 text-[0.82rem] font-bold text-warning" role="alert">
          {t('settings.corruptWarning')}
        </p>
      ) : null}

      <form
        className="grid gap-6 rounded-xl border border-line bg-surface p-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          const errors = policyErrors();
          if (Object.keys(errors).length > 0) {
            notifyValidation(
              t('validation.summaryTitle'),
              t('validation.summaryBody', {
                count: Object.keys(errors).length,
                fields: Object.keys(errors)
                  .map((field) => t(`settings.${field}`))
                  .join(', '),
              })
            );
            return;
          }
          // Table-wide write: confirm before recalculating every non-confirmed
          // employee's projected retirement date, echoing the values being saved
          // so the operator can catch a typo before it touches every record.
          confirm({
            title: t('copy.confirmationTitle'),
            message: t('settings.confirmRecalc', { years, months }),
            confirmLabel: t('actions.confirm'),
            cancelLabel: t('actions.cancel'),
            onConfirm: () => savePolicy.mutate(),
          });
        }}
      >
        <p className="m-0 max-w-[60ch] text-ink-soft">{t('settings.description')}</p>

        <div className="grid grid-cols-[repeat(2,minmax(7rem,12rem))] gap-6">
          <Field label={t('settings.years')} required name="years" error={shownErrors['years']}>
            {/* Deliberately not type="number": that adds the browser's spinner
                arrows (styled differently in every browser) and makes a stray
                scroll-wheel silently change a value that recalculates every
                employee's retirement date. The range is enforced by
                `policyErrors`, in the operator's language. */}
            <Input
              required
              type="text"
              inputMode="numeric"
              className="tabular-nums"
              aria-label={t('settings.years')}
              aria-invalid={Boolean(shownErrors['years'])}
              {...(shownErrors['years'] ? { 'aria-describedby': fieldErrorId('years') } : {})}
              value={years}
              onChange={(e) => {
                setEdited(true);
                setYears(e.target.value);
              }}
            />
          </Field>
          <Field label={t('settings.months')} required name="months" error={shownErrors['months']}>
            {/* Deliberately not type="number": that adds the browser's spinner
                arrows (styled differently in every browser) and makes a stray
                scroll-wheel silently change a value that recalculates every
                employee's retirement date. The range is enforced by
                `policyErrors`, in the operator's language. */}
            <Input
              required
              type="text"
              inputMode="numeric"
              className="tabular-nums"
              aria-label={t('settings.months')}
              aria-invalid={Boolean(shownErrors['months'])}
              {...(shownErrors['months'] ? { 'aria-describedby': fieldErrorId('months') } : {})}
              value={months}
              onChange={(e) => {
                setEdited(true);
                setMonths(e.target.value);
              }}
            />
          </Field>
        </div>

        <p className="m-0 text-[0.82rem] font-bold text-ink-muted">
          {loaded?.updatedAt
            ? `${t('settings.lastUpdated')}: ${formatTableDateTime(loaded.updatedAt)}`
            : t('settings.neverUpdated')}
        </p>
        <p className="m-0 rounded-lg bg-surface-raised p-4 text-[0.85rem] leading-relaxed text-ink-soft">
          {t('settings.recalcNote')}
        </p>

        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={savePolicy.isPending}>
            <Save size={16} />
            {t('actions.save')}
          </Button>
        </div>
      </form>
    </PageSection>
  );
}
