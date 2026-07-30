import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  ContactRound,
  Gauge,
  Hash,
  Languages,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  CONTRACT_TYPES,
  DEFAULT_RETIREMENT_POLICY,
  EMPLOYEE_STATUSES,
  LANGUAGES,
  TFR_OPTIONS,
  USA_CATEGORIES,
  WEEKDAY_KEYS,
  calculateRetirementDate,
  expectedWeeklyMinutesForFte,
  formatSessantesimiMinutes,
  isValidDateString,
  type ContractType,
  type Department,
  type EmployeeOption,
  type EmployeeStatus,
  type Language,
  type TfrOption,
  type UsaCategory,
  type WeekdayKey,
} from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  FIELD_LABEL_KEYS,
  FIELD_SECTIONS,
  fieldErrorId,
  fieldLabels,
  firstErrorField,
  orderedErrorFields,
  validateEmployeeDraft,
  type FieldErrors,
  type ServerErrors,
} from '../employee-validation.js';
import {
  employeeDirtyFingerprint,
  parseDraftFte,
  parseDraftWeeklySchedule,
  type EmployeeDraft,
} from '../employee-draft.js';
import { formatDate, useDateLocale } from '../format.js';
import { useApi } from '../hooks.js';
import { ComboboxField } from '../ui/ComboboxField.js';
import { DateField } from '../ui/DateField.js';
import { EmployeeMultiSelect } from '../ui/EmployeeMultiSelect.js';
import { Field } from '../ui/Field.js';
import { SelectField } from '../ui/SelectField.js';
import { SwitchField } from '../ui/SwitchField.js';
import { useConfirmation } from '../ui/confirmation.js';
import { FormSection } from '../ui/FormSection.js';
import { useModalDialog } from '../ui/useModalDialog.js';
import { notifyValidation } from '../ui/feedback.js';
import { deriveWorkEmail } from '../work-email.js';

export function EmployeeForm({
  draft,
  departments,
  employeeOptions,
  serverErrors,
  onCancel,
  onChange,
  onSave,
  isSaving,
}: {
  draft: EmployeeDraft;
  departments: Department[];
  employeeOptions: EmployeeOption[];
  /** Field errors the last save came back with; merged with the local ones. */
  serverErrors?: ServerErrors;
  onCancel: () => void;
  onChange: (draft: EmployeeDraft) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const dateLocale = useDateLocale();
  const api = useApi();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const retirementPolicy = settings.data?.retirementPolicy ?? DEFAULT_RETIREMENT_POLICY;
  const isCreate = !draft.id;
  const showTerminationDate = !isCreate || draft.status !== 'ATTIVO';
  const projectedRetirementDate =
    draft.birthDate && isValidDateString(draft.birthDate)
      ? calculateRetirementDate(draft.birthDate, retirementPolicy)
      : '';
  const retirementDateValue = draft.retirementDateOverridden
    ? draft.retirementDate
    : projectedRetirementDate;

  /**
   * A server verdict is about the value that was submitted ("this address is
   * already taken"), so editing that field makes it obsolete. Fields touched
   * since the rejection stop showing it; a fresh rejection resets the set.
   */
  const [editedSinceRejection, setEditedSinceRejection] = useState<ReadonlySet<string>>(new Set());
  // Keyed on the rejection *count*, not on the payload or the object identity.
  // Identity would reset the set on every render for a caller passing a fresh
  // literal; payload equality would fail to reset when the operator edits a
  // duplicate value, changes it back, and saves again — that second verdict is
  // byte-identical to the first, so the field would stay silently unmarked.
  useEffect(() => setEditedSinceRejection(new Set()), [serverErrors?.rejectionId]);
  const markEdited = (...fields: string[]) =>
    setEditedSinceRejection((current) => new Set([...current, ...fields]));

  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => {
    markEdited(String(key));
    onChange({ ...draft, [key]: value });
  };

  // The address is suggested from the name, never imposed: once the operator has
  // typed in the field — or when editing someone who already has one — the
  // suggestion stops, so a manual correction for a double-barrelled surname or an
  // address that predates the convention is never overwritten.
  const [workEmailAuthored, setWorkEmailAuthored] = useState(() => Boolean(draft.workEmail));
  const [workEmailShimmer, setWorkEmailShimmer] = useState(false);
  const workEmailShimmerTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(workEmailShimmerTimer.current), []);

  /**
   * Fills the address in as the name is typed. Done here rather than in an effect
   * on the derived value: applying the suggestion immediately makes the condition
   * that triggered it false again, so an effect would clear its own shimmer timer
   * on the very next render.
   */
  const setName = (key: 'firstName' | 'lastName', value: string) => {
    markEdited(key);
    const next = { ...draft, [key]: value };
    const suggestion = deriveWorkEmail(next.firstName, next.lastName);
    if (!workEmailAuthored && suggestion && suggestion !== next.workEmail) {
      // The suggestion rewrites the address, so a rejection about it is obsolete too.
      markEdited('workEmail');
      next.workEmail = suggestion;
      setWorkEmailShimmer(true);
      // Deriving the address is instantaneous, so the shimmer is paced for the eye
      // rather than for the work: long enough to notice the field filled itself.
      window.clearTimeout(workEmailShimmerTimer.current);
      workEmailShimmerTimer.current = window.setTimeout(() => setWorkEmailShimmer(false), 1_000);
    }
    onChange(next);
  };
  const setWeeklySchedule = (key: WeekdayKey, value: string) => {
    markEdited(`weekly.${key}`, 'weeklySchedule');
    onChange({ ...draft, weeklySchedule: { ...draft.weeklySchedule, [key]: value } });
  };
  const setApprovalRoleIds = (key: keyof EmployeeDraft['approvalRoleIds'], value: string[]) => {
    markEdited(key);
    onChange({ ...draft, approvalRoleIds: { ...draft.approvalRoleIds, [key]: value } });
  };
  const setStatus = (status: EmployeeStatus) => {
    // New active employees have no cessation date yet — clear any leftover value
    // from briefly selecting Cessato during create.
    if (isCreate && status === 'ATTIVO') {
      markEdited('status', 'terminationDate');
      onChange({ ...draft, status, terminationDate: '' });
      return;
    }
    set('status', status);
  };
  const toggleRetirementOverride = (checked: boolean) => {
    // Switching the override on has to seed the field, because from here on the
    // input edits `draft.retirementDate` directly instead of showing the
    // projection. Switching it off leaves the stored date untouched: it is no
    // longer submitted (see the save payload) and the input falls back to the
    // projection, so keeping it means flipping the switch back on restores the
    // date the user had confirmed rather than silently replacing it.
    if (checked) {
      onChange({
        ...draft,
        retirementDateOverridden: true,
        retirementDate: draft.retirementDate || projectedRetirementDate,
      });
      return;
    }
    // Unchecking recalculates the date from the birth date on save — warn before
    // discarding a date that was previously confirmed.
    if (draft.retirementDateOverridden && draft.retirementDate) {
      confirm({
        title: t('copy.confirmUnconfirmRetirementTitle'),
        message: t('copy.confirmUnconfirmRetirement', {
          date: formatDate(draft.retirementDate, dateLocale),
        }),
        confirmLabel: t('actions.confirm'),
        cancelLabel: t('actions.cancel'),
        onConfirm: () => set('retirementDateOverridden', false),
      });
      return;
    }
    set('retirementDateOverridden', false);
  };

  const approverOptions = employeeOptions.filter((option) => option.id !== draft.id);
  // The line-manager dropdowns only offer people flagged with the matching role
  // capability (set in the Role capabilities section on each person's own card).
  const responsabileOptions = approverOptions.filter((option) => option.canBeResponsible);
  const substituteOptions = approverOptions.filter((option) => option.canBeSubstituteResponsible);
  // Active employees must have a Responsabile — except while bootstrapping, when
  // nobody is flagged as Responsabile-eligible yet and there is no one to pick.
  // Both requirements follow the server's bootstrap exception: enforced only once
  // somebody else is eligible to be picked for the role.
  const responsabileRequired = draft.status === 'ATTIVO' && responsabileOptions.length > 0;
  const substituteRequired = draft.status === 'ATTIVO' && substituteOptions.length > 0;
  const weeklyScheduleMinutes = parseDraftWeeklySchedule(draft.weeklySchedule);
  const weeklyTotal = weeklyScheduleMinutes
    ? WEEKDAY_KEYS.reduce((total, key) => total + weeklyScheduleMinutes[key], 0)
    : null;
  const fte = parseDraftFte(draft.fte);
  const expectedWeeklyMinutes = fte === null ? null : expectedWeeklyMinutesForFte(fte);
  const showWeeklyWarning =
    weeklyTotal !== null && expectedWeeklyMinutes !== null && weeklyTotal !== expectedWeeklyMinutes;

  const initialDraft = useRef(draft);
  const isDirty = employeeDirtyFingerprint(draft) !== employeeDirtyFingerprint(initialDraft.current);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      onCancel();
      return;
    }
    confirm({
      title: t('copy.discardChangesTitle'),
      message: t('copy.discardChanges'),
      confirmLabel: t('actions.discard'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: onCancel,
    });
  }, [confirm, isDirty, onCancel, t]);

  const dialogRef = useModalDialog(requestClose);

  /**
   * Errors are silent until the first save attempt, then live: marking every
   * empty field red the moment a blank form opens is noise, but once the operator
   * has been told what is wrong, the marks have to clear as they fix each one.
   */
  const [submitted, setSubmitted] = useState(false);
  const localErrors = submitted
    ? validateEmployeeDraft(draft, { responsabileRequired, substituteRequired }, t)
    : {};
  // A server verdict outlives the local re-check (uniqueness is something only the
  // server knows) until its field is edited, but a local error about the same
  // field is the more specific of the two and wins.
  const fieldErrors: FieldErrors = {
    ...Object.fromEntries(
      Object.entries(serverErrors?.fields ?? {}).filter(([field]) => !editedSinceRejection.has(field))
    ),
    ...localErrors,
  };
  const errorFor = (field: string) => fieldErrors[field];
  const invalidFields = orderedErrorFields(fieldErrors);

  /**
   * Wiring a field and its input to the same error, in one place. Keeping the two
   * halves together is what stops an input from turning red while its message
   * lives on a different field — the kind of drift 14 hand-written pairs invite.
   *
   * The control gets the red border and `aria-invalid`; the message itself stays
   * in the Field's own slot, and the control points at it. Mantine used to
   * compute `aria-describedby` from its own internals and drop anything passed
   * in, so per-field descriptions were unavailable and the message relied on
   * `role="alert"` alone. On plain inputs they can be wired properly.
   */
  const fieldProps = (field: string) => ({ name: field, error: errorFor(field) });
  const inputProps = (field: string) =>
    errorFor(field)
      ? ({ 'aria-invalid': true, 'aria-describedby': fieldErrorId(field) } as const)
      : ({} as const);

  /** Puts the caret in the first field the operator has to fix. */
  const focusField = (field: string) => {
    const dialog = dialogRef.current;
    const target = dialog?.querySelector<HTMLElement>(`[data-field="${field}"] input, [data-field="${field}"] button`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  };

  /** How many problems sit in each section, for the badge on its heading. */
  const sectionErrorCount = (section: string) =>
    invalidFields.filter((field) => FIELD_SECTIONS[field] === section).length;

  const handleSubmit = () => {
    setSubmitted(true);
    const errors = validateEmployeeDraft(draft, { responsabileRequired, substituteRequired }, t);
    const fields = Object.keys(errors);
    if (fields.length > 0) {
      notifyValidation(
        t('validation.summaryTitle'),
        t('validation.summaryBody', {
          count: fields.length,
          fields: fieldLabels(orderedErrorFields(errors), t),
        })
      );
      const first = firstErrorField(errors);
      if (first) focusField(first);
      return;
    }
    onSave();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklch,var(--ink),transparent_55%)] p-3 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 desktop:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          'flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_oklch(0.2_0.02_250/0.08),0_24px_60px_-20px_oklch(0.2_0.04_250/0.4)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 desktop:max-h-[calc(100vh-3rem)]',
          'w-[min(96vw,92rem)] max-w-[92rem] border-[color-mix(in_oklch,var(--line),var(--brand)_10%)]',
          'shadow-[0_1px_2px_oklch(0.2_0.02_250/0.08),0_34px_90px_-28px_oklch(0.2_0.05_250/0.5)]',
          'desktop:max-h-[calc(100vh-2rem)] desktop:rounded-[20px]'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? `${draft.firstName} ${draft.lastName}` : t('actions.createEmployee')}
        // Native constraint validation is suppressed in favour of our own: the
        // browser's bubble speaks the *browser's* language, points at one field
        // at a time, and can't express the cross-field rules (hire date required
        // when Active, and so on). The `required` attributes stay for a11y.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--brand),transparent_91%),transparent_45%),color-mix(in_oklch,var(--surface-raised),var(--surface)_38%)] px-6 py-6 desktop:px-9">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-[linear-gradient(145deg,color-mix(in_oklch,var(--brand),white_8%),var(--brand))] text-brand-ink shadow-[0_8px_20px_color-mix(in_oklch,var(--brand),transparent_76%)] tablet:size-12"
            >
              <UserRoundPlus size={23} />
            </span>
            <div className="grid min-w-0 gap-[0.2rem]">
              <p className="m-0 text-[0.68rem] leading-tight font-black tracking-[0.07em] text-brand uppercase">
                {t('copy.employeeRecord')}
              </p>
              <h3 className="m-0 text-xl leading-tight font-bold">
                {draft.id ? `${draft.firstName} ${draft.lastName}` : t('actions.createEmployee')}
              </h3>
              <p className="m-0 hidden max-w-[58ch] text-[0.82rem] leading-snug text-ink-muted tablet:block">
                {t('copy.employeeFormSubtitle')}
              </p>
            </div>
          </div>
          <Button
            className="flex-none text-ink-muted transition-transform hover:rotate-3 hover:scale-105 active:scale-95"
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={requestClose}
            aria-label={t('actions.close')}
          >
            <X size={18} />
          </Button>
        </header>

        <div className="grid gap-6 overflow-y-auto bg-[color-mix(in_oklch,var(--surface-raised),var(--surface)_48%)] p-4 [scrollbar-gutter:stable] tablet:px-9 tablet:py-7">
          {/* A toast is gone in ten seconds and a red field six sections down is
              invisible from here. This is the durable list: it stays until the
              form is clean, and each entry jumps to the input it names. */}
          {invalidFields.length > 0 ? (
            <div
              data-slot="form-error-summary"
              role="alert"
              className="mb-6 flex gap-3 rounded-xl border border-[color-mix(in_oklch,var(--danger),transparent_60%)] bg-[color-mix(in_oklch,var(--danger),var(--surface)_93%)] p-4"
            >
              <span className="inline-flex text-danger" aria-hidden="true">
                <TriangleAlert size={18} />
              </span>
              <div>
                <strong className="mb-2 block text-[0.84rem] font-extrabold text-danger">
                  {t('validation.summaryHeading', { count: invalidFields.length })}
                </strong>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {invalidFields.map((field) => (
                    <li key={field} className="flex flex-wrap gap-1.5 text-[0.79rem] leading-snug">
                      {/* The field name is the affordance: clicking it scrolls to
                          and focuses the input, so a six-section form never needs
                          to be hunted through. */}
                      <button
                        type="button"
                        onClick={() => focusField(field)}
                        className="cursor-pointer border-0 bg-none p-0 font-[inherit] font-extrabold text-danger underline underline-offset-2 hover:decoration-2"
                        aria-label={t('validation.jumpToField', {
                          field: t(FIELD_LABEL_KEYS[field] ?? field),
                        })}
                      >
                        {t(FIELD_LABEL_KEYS[field] ?? field)}
                      </button>
                      <span className="text-ink-soft">{fieldErrors[field]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <FormSection
            number="01"
            icon={<ContactRound />}
            title={t('sections.identity')}
            description={t('copy.identitySectionHint')}
            errorCount={sectionErrorCount('identity')}
          >
            <div className="grid grid-cols-1 gap-6 desktop:gap-x-6 desktop:grid-cols-[repeat(12,minmax(0,1fr))]">
              <Field
                className="desktop:col-span-2 desktop:[&_input]:max-w-40"
                icon={<Hash />}
                label={t('fields.employeeNumber')}
                required
                {...fieldProps('employeeNumber')}
              >
                <Input
                  required
                  autoFocus
                  data-autofocus
                  inputMode="numeric"
                  {...inputProps('employeeNumber')}
                  aria-label={t('fields.employeeNumber')}
                  value={draft.employeeNumber}
                  onChange={(event) => set('employeeNumber', event.currentTarget.value)}
                />
              </Field>
              <Field
                className="desktop:col-span-3"
                icon={<UserRound />}
                label={t('fields.firstName')}
                required
                {...fieldProps('firstName')}
              >
                <Input
                  required
                  {...inputProps('firstName')}
                  aria-label={t('fields.firstName')}
                  value={draft.firstName}
                  onChange={(event) => setName('firstName', event.currentTarget.value)}
                />
              </Field>
              <Field
                className="desktop:col-span-3"
                icon={<UserRound />}
                label={t('fields.lastName')}
                required
                {...fieldProps('lastName')}
              >
                <Input
                  required
                  {...inputProps('lastName')}
                  aria-label={t('fields.lastName')}
                  value={draft.lastName}
                  onChange={(event) => setName('lastName', event.currentTarget.value)}
                />
              </Field>
              <Field
                className="desktop:col-span-4"
                icon={<CalendarDays />}
                label={t('fields.birthDate')}
                required
                {...fieldProps('birthDate')}
              >
                <DateField
                  required
                  {...inputProps('birthDate')}
                  ariaLabel={t('fields.birthDate')}
                  value={draft.birthDate}
                  onChange={(value) => set('birthDate', value)}
                />
              </Field>
              <Field
                className="desktop:col-span-5"
                shimmer={workEmailShimmer}
                icon={<Mail />}
                label={t('fields.workEmail')}
                hint={t('copy.workEmailHint')}
                required
                {...fieldProps('workEmail')}
              >
                <Input
                  required
                  type="email"
                  inputMode="email"
                  {...inputProps('workEmail')}
                  aria-label={t('fields.workEmail')}
                  value={draft.workEmail}
                  onChange={(event) => {
                    setWorkEmailAuthored(true);
                    set('workEmail', event.currentTarget.value);
                  }}
                />
              </Field>
              <Field
                className="desktop:col-span-3"
                icon={<Languages />}
                label={t('fields.preferredLanguage')}
                hint={t('copy.preferredLanguageHint')}
              >
                <SelectField
                  label={t('fields.preferredLanguage')}
                  value={draft.preferredLanguage}
                  onChange={(value) => set('preferredLanguage', value as Language)}
                  options={LANGUAGES.map((option) => ({ value: option, label: t(`language.${option}`) }))}
                />
              </Field>
              <Field
                className="desktop:col-span-4"
                icon={<Building2 />}
                label={t('fields.department')}
                required
                {...fieldProps('departmentId')}
              >
                <ComboboxField
                  label={t('fields.department')}
                  placeholder={t('fields.select')}
                  value={draft.departmentId}
                  onChange={(value) => set('departmentId', value)}
                  options={departments.map((department) => ({ value: department.id, label: department.name }))}
                  {...inputProps('departmentId')}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            number="02"
            icon={<BriefcaseBusiness />}
            title={t('sections.employment')}
            description={t('copy.employmentSectionHint')}
            errorCount={sectionErrorCount('employment')}
          >
            <div className="grid grid-cols-1 gap-6 desktop:gap-x-6 desktop:grid-cols-[repeat(4,minmax(10rem,1fr))]">
              <Field label={t('fields.status')}>
                <SelectField
                  label={t('fields.status')}
                  value={draft.status}
                  onChange={(value) => setStatus(value as EmployeeStatus)}
                  options={EMPLOYEE_STATUSES.map((option) => ({ value: option, label: t(`status.${option}`) }))}
                />
              </Field>
              <Field
                icon={<CalendarDays />}
                label={t('fields.hireDate')}
                hint={t('copy.hireDateHint')}
                required={draft.status === 'ATTIVO'}
                {...fieldProps('hireDate')}
              >
                <DateField
                  {...inputProps('hireDate')}
                  ariaLabel={t('fields.hireDate')}
                  value={draft.hireDate}
                  onChange={(value) => set('hireDate', value)}
                />
              </Field>
              {showTerminationDate ? (
                <Field
                  icon={<CalendarDays />}
                  label={t('fields.terminationDate')}
                  hint={t('copy.terminationDateHint')}
                  required={draft.status === 'CESSATO'}
                  {...fieldProps('terminationDate')}
                >
                  <DateField
                    {...inputProps('terminationDate')}
                    ariaLabel={t('fields.terminationDate')}
                    value={draft.terminationDate}
                    onChange={(value) => set('terminationDate', value)}
                  />
                </Field>
              ) : null}
              <Field
                className="desktop:[&_input]:max-w-40"
                icon={<Gauge />}
                label={t('fields.fte')}
                hint={t('copy.fteHint')}
                required
                {...fieldProps('fte')}
              >
                <Input
                  required
                  inputMode="decimal"
                  {...inputProps('fte')}
                  aria-label={t('fields.fte')}
                  value={draft.fte}
                  onChange={(event) => set('fte', event.currentTarget.value)}
                />
              </Field>
              <Field
                icon={<CalendarDays />}
                label={t('fields.retirementDate')}
                hint={t('copy.retirementDateHint', {
                  years: retirementPolicy.years,
                  months: retirementPolicy.months,
                })}
                required={draft.retirementDateOverridden}
                full
                {...fieldProps('retirementDate')}
              >
                <div className="grid grid-cols-1 items-center gap-6 desktop:grid-cols-[minmax(14rem,19rem)_minmax(15rem,max-content)]">
                  <DateField
                    ariaLabel={t('fields.retirementDate')}
                    required={draft.retirementDateOverridden}
                    {...inputProps('retirementDate')}
                    disabled={!draft.retirementDateOverridden}
                    value={retirementDateValue}
                    onChange={(value) => set('retirementDate', value)}
                  />
                  <SwitchField
                    checked={draft.retirementDateOverridden}
                    onCheckedChange={toggleRetirementOverride}
                    label={t('actions.confirmRetirementDate')}
                  />
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection
            number="03"
            icon={<BadgeCheck />}
            title={t('sections.classification')}
            description={t('copy.classificationSectionHint')}
          >
            <div className="grid grid-cols-1 gap-6 desktop:gap-x-6 desktop:grid-cols-[repeat(3,minmax(11rem,1fr))]">
              <Field label={t('fields.contractType')}>
                <SelectField
                  label={t('fields.contractType')}
                  value={draft.contractType}
                  onChange={(value) => set('contractType', value as ContractType)}
                  options={CONTRACT_TYPES.map((option) => ({ value: option, label: t(`contractType.${option}`) }))}
                />
              </Field>
              {draft.contractType === 'CONTRATTO_USA' && (
                <Field label={t('fields.usaCategory')}>
                  <SelectField
                    label={t('fields.usaCategory')}
                    value={draft.usaCategory}
                    onChange={(value) => set('usaCategory', value as UsaCategory)}
                    options={USA_CATEGORIES.map((option) => ({ value: option, label: t(`usaCategory.${option}`) }))}
                  />
                </Field>
              )}
              {draft.contractType !== 'CONTRATTO_USA' && (
                <Field label={t('fields.tfr')}>
                  <SelectField
                    label={t('fields.tfr')}
                    value={draft.tfr}
                    onChange={(value) => set('tfr', value as TfrOption)}
                    options={TFR_OPTIONS.map((option) => ({ value: option, label: t(`tfr.${option}`) }))}
                  />
                </Field>
              )}
            </div>
          </FormSection>

          <FormSection
            number="04"
            icon={<ClipboardList />}
            title={t('sections.approvalWorkflow')}
            description={t('copy.approvalSectionHint')}
            errorCount={sectionErrorCount('approval')}
          >
            <div className="grid grid-cols-1 gap-6 desktop:gap-x-6 desktop:grid-cols-[repeat(3,minmax(11rem,1fr))]">
              <Field label={t('fields.preApprovers')}>
                <EmployeeMultiSelect
                  label={t('fields.preApprovers')}
                  options={approverOptions}
                  labelOptions={employeeOptions}
                  value={draft.approvalRoleIds.preApproverIds}
                  onChange={(value) => setApprovalRoleIds('preApproverIds', value)}
                />
              </Field>
              <Field
                label={t('fields.responsabili')}
                required={responsabileRequired}
                // Two different jobs, so two different sentences: before a save
                // attempt this is a standing instruction like every other field's
                // hint, and only afterwards does it become a red complaint. Using
                // the same words for both is what made the grey one read as an
                // unhighlighted error.
                {...(responsabileRequired ? { hint: t('copy.responsabileHint') } : {})}
                {...fieldProps('responsabileIds')}
              >
                <EmployeeMultiSelect
                  label={t('fields.responsabili')}
                  options={responsabileOptions}
                  labelOptions={employeeOptions}
                  {...inputProps('responsabileIds')}
                  value={draft.approvalRoleIds.responsabileIds}
                  onChange={(value) => setApprovalRoleIds('responsabileIds', value)}
                />
              </Field>
              <Field
                label={t('fields.substituteResponsabili')}
                required={substituteRequired}
                {...(substituteRequired ? { hint: t('copy.substituteHint') } : {})}
                {...fieldProps('substituteResponsabileIds')}
              >
                <EmployeeMultiSelect
                  label={t('fields.substituteResponsabili')}
                  options={substituteOptions}
                  labelOptions={employeeOptions}
                  {...inputProps('substituteResponsabileIds')}
                  value={draft.approvalRoleIds.substituteResponsabileIds}
                  onChange={(value) => setApprovalRoleIds('substituteResponsabileIds', value)}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            number="05"
            icon={<ShieldCheck />}
            title={t('sections.roleCapabilities')}
            description={t('copy.roleCapabilitiesSectionHint')}
          >
            <div className="grid justify-items-start gap-3 rounded-[10px] bg-surface-raised p-4">
              <SwitchField
                checked={draft.canBeResponsible}
                onCheckedChange={(checked) => set('canBeResponsible', checked)}
                label={t('fields.canBeResponsible')}
              />
              <SwitchField
                checked={draft.canBeSubstituteResponsible}
                onCheckedChange={(checked) => set('canBeSubstituteResponsible', checked)}
                label={t('fields.canBeSubstituteResponsible')}
              />
            </div>
          </FormSection>

          <FormSection
            number="06"
            icon={<Clock3 />}
            title={t('sections.weeklySchedule')}
            description={t('copy.weeklySectionHint')}
            errorCount={sectionErrorCount('weekly')}
          >
            <div className="grid grid-cols-2 gap-4 [&_input]:tabular-nums desktop:grid-cols-[repeat(5,minmax(4.5rem,1fr))]">
              {WEEKDAY_KEYS.map((key) => (
                <Field
                  key={key}
                  label={t(`weekday.${key}`)}
                  required
                  {...fieldProps(`weekly.${key}`)}
                >
                  <Input
                    required
                    inputMode="decimal"
                    {...inputProps(`weekly.${key}`)}
                    aria-label={t(`weekday.${key}`)}
                    value={draft.weeklySchedule[key]}
                    onChange={(event) => setWeeklySchedule(key, event.currentTarget.value)}
                  />
                </Field>
              ))}
            </div>
            <p
              className={cn(
                'mt-3 mb-0 text-[0.82rem] font-bold',
                showWeeklyWarning ? 'text-warning' : 'text-ink-muted'
              )}
              data-field="weeklySchedule"
            >
              {weeklyTotal === null
                ? t('copy.invalidWeeklySchedule')
                : showWeeklyWarning && expectedWeeklyMinutes !== null
                  ? t('copy.weeklyScheduleMismatch', {
                      total: formatSessantesimiMinutes(weeklyTotal),
                      expected: formatSessantesimiMinutes(expectedWeeklyMinutes),
                    })
                  : t('copy.weeklyScheduleTotal', { total: formatSessantesimiMinutes(weeklyTotal) })}
            </p>
            {errorFor('weeklySchedule') ? (
              <p className="mt-2 mb-0 text-[0.78rem] leading-snug font-[650] text-danger" role="alert">
                {errorFor('weeklySchedule')}
              </p>
            ) : null}
          </FormSection>
        </div>

        <footer className="flex items-center justify-between gap-6 border-t border-line bg-surface-raised px-4 py-4 desktop:px-9">
          <p className="m-0 hidden text-xs text-ink-muted desktop:block">
            <span aria-hidden="true" className="font-black text-danger">
              *
            </span>{' '}
            {t('copy.requiredFields')}
          </p>
          <div className="flex w-full items-center gap-3 [&>*]:w-full tablet:w-auto tablet:[&>*]:w-auto">
            <Button
              variant="outline"
              size="lg"
              type="button"
              className="transition-transform hover:not-disabled:-translate-y-px"
              onClick={requestClose}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              size="lg"
              type="submit"
              className="shadow-[0_5px_14px_color-mix(in_oklch,var(--brand),transparent_80%)] transition-[transform,box-shadow] hover:not-disabled:-translate-y-px"
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save size={17} aria-hidden="true" />
              )}
              {t('actions.save')}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
