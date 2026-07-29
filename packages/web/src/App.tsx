import {
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Clock3,
  ContactRound,
  Download,
  FileCheck2,
  Gauge,
  Hash,
  History,
  Languages,
  Loader2,
  LogOut,
  Mail,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import {
  CONTRACT_TYPES,
  DEFAULT_RETIREMENT_POLICY,
  DEFAULT_WEEKLY_SCHEDULE_MINUTES,
  EMPLOYEE_STATUSES,
  LANGUAGES,
  WEEKDAY_KEYS,
  calculateRetirementDate,
  expectedWeeklyMinutesForFte,
  formatSessantesimiMinutes,
  isValidDateString,
  parseFteInput,
  parseSessantesimiInput,
  RETIREMENT_MONTHS_MAX,
  RETIREMENT_MONTHS_MIN,
  RETIREMENT_YEARS_MAX,
  RETIREMENT_YEARS_MIN,
  TFR_OPTIONS,
  USA_CATEGORIES,
  type AuditLog,
  type ContractType,
  type Department,
  type Employee,
  type EmployeeOption,
  type EmployeeStatus,
  type ImportPreview,
  type Language,
  type TfrOption,
  type UsaCategory,
  type WeekdayKey,
} from '@itatti/shared';
import { createApiClient } from './api/client.js';
import { describeError } from './api/error-messages.js';
import {
  FIELD_LABEL_KEYS,
  FIELD_SECTIONS,
  fieldErrorId,
  isDecimalInteger,
  fieldLabels,
  firstErrorField,
  noServerErrors,
  orderedErrorFields,
  validateEmployeeDraft,
  type FieldErrors,
  type ServerErrors,
} from './employee-validation.js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ActionTooltip } from './ui/ActionTooltip.js';
import { ComboboxField } from './ui/ComboboxField.js';
import { DATE_INPUT_DISPLAY_FORMAT, DateField } from './ui/DateField.js';
import { EmployeeMultiSelect } from './ui/EmployeeMultiSelect.js';
import { Field } from './ui/Field.js';
import { FilePicker } from './ui/FilePicker.js';
import { SelectField } from './ui/SelectField.js';
import { SwitchField } from './ui/SwitchField.js';
import { QueryError } from './ui/QueryError.js';
import {
  DataSurface,
  EmptyState,
  Eyebrow,
  PageHeading,
  PageSection,
  SearchField,
  StatusPill,
  Toolbar,
} from './ui/layout.js';
import { useConfirmation, useConfirmationOpen } from './ui/confirmation.js';
import { notifyError, notifySuccess, notifyValidation } from './ui/feedback.js';
import type { Translate } from './i18n/types.js';
import { cn } from '@/lib/utils';
import { deriveWorkEmail } from './work-email.js';
import { useEdAuth, wasSignedOut } from './auth/AuthProvider.js';
import './styles/app.css';

export type EmployeeDraft = {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  preferredLanguage: Language;
  departmentId: string;
  birthDate: string;
  hireDate: string;
  terminationDate: string;
  retirementDate: string;
  retirementDateOverridden: boolean;
  fte: string;
  usaCategory: UsaCategory;
  contractType: ContractType;
  tfr: TfrOption;
  status: EmployeeStatus;
  canBeResponsible: boolean;
  canBeSubstituteResponsible: boolean;
  weeklySchedule: Record<WeekdayKey, string>;
  approvalRoleIds: {
    preApproverIds: string[];
    responsabileIds: string[];
    substituteResponsabileIds: string[];
  };
};

const tableDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const auditFieldTranslationKeys: Record<string, string> = {
  employeeNumber: 'fields.employeeNumber',
  firstName: 'fields.firstName',
  lastName: 'fields.lastName',
  workEmail: 'fields.workEmail',
  preferredLanguage: 'fields.preferredLanguage',
  departmentId: 'fields.department',
  name: 'fields.department',
  birthDate: 'fields.birthDate',
  hireDate: 'fields.hireDate',
  terminationDate: 'fields.terminationDate',
  retirementDate: 'fields.retirementDate',
  retirementDateOverridden: 'fields.retirementDateOverridden',
  fte: 'fields.fte',
  usaCategory: 'fields.usaCategory',
  contractType: 'fields.contractType',
  tfr: 'fields.tfr',
  status: 'fields.status',
  canBeResponsible: 'fields.canBeResponsible',
  canBeSubstituteResponsible: 'fields.canBeSubstituteResponsible',
  weeklySchedule: 'sections.weeklySchedule',
  approvalRoles: 'sections.approvalWorkflow',
  retirementPolicy: 'settings.title',
};

const auditIgnoredFields = new Set(['id', 'createdAt', 'updatedAt', 'department']);
const dateFields = new Set(['birthDate', 'hireDate', 'terminationDate', 'retirementDate']);

/**
 * A date, written the one way this app writes dates: localized, `DD MMMM YYYY`.
 *
 * The tables used to have a format of their own — fixed en-GB `30 Jun 2050`,
 * chosen for column width — which meant an Italian operator read one spelling in
 * the directory and a different one in the field they were about to edit, and an
 * English operator got English either way. One convention, everywhere.
 */
function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const parsed = dayjs(value, 'YYYY-MM-DD', true);
  return parsed.isValid() ? parsed.locale(locale).format(DATE_INPUT_DISPLAY_FORMAT) : value;
}

/** The date locale, resolved the same way everywhere: Italian unless English. */
function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'it';
}

function formatTableDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : tableDateTimeFormatter.format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function comparableAuditValue(key: string, snapshot: Record<string, unknown>): unknown {
  if (key === 'departmentId' && isRecord(snapshot.department) && typeof snapshot.department.name === 'string') {
    return snapshot.department.name;
  }
  return snapshot[key];
}

function formatAuditValue(key: string, value: unknown, t: Translate, locale: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (dateFields.has(key) && typeof value === 'string') return formatDate(value, locale);
  if (key === 'status' && typeof value === 'string') return t(`status.${value}`);
  if (key === 'contractType' && typeof value === 'string') return t(`contractType.${value}`);
  if (key === 'usaCategory' && typeof value === 'string') return t(`usaCategory.${value}`);
  if (key === 'tfr' && typeof value === 'string') return t(`tfr.${value}`);
  if (key === 'preferredLanguage' && typeof value === 'string') return t(`language.${value}`);
  if (key === 'retirementPolicy' && isRecord(value)) {
    return `${value.years ?? '-'}y ${value.months ?? '-'}m`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function auditFieldLabel(key: string, t: Translate): string {
  return t(auditFieldTranslationKeys[key] ?? key);
}

function auditChanges(entry: AuditLog, t: Translate, locale: string) {
  if (entry.action !== 'UPDATE' || !isRecord(entry.before) || !isRecord(entry.after)) return [];
  const keys = new Set([...Object.keys(entry.before), ...Object.keys(entry.after)]);
  return [...keys]
    .filter((key) => !auditIgnoredFields.has(key))
    .map((key) => ({
      key,
      before: comparableAuditValue(key, entry.before as Record<string, unknown>),
      after: comparableAuditValue(key, entry.after as Record<string, unknown>),
    }))
    .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after))
    .map(({ key, before, after }) => ({
      key,
      label: auditFieldLabel(key, t),
      before: formatAuditValue(key, before, t, locale),
      after: formatAuditValue(key, after, t, locale),
    }));
}

function auditEmployeeLabel(entry: AuditLog): { name: string; number: string } | null {
  const snapshot = isRecord(entry.after) ? entry.after : isRecord(entry.before) ? entry.before : null;
  const firstName = typeof snapshot?.firstName === 'string' ? snapshot.firstName : '';
  const lastName = typeof snapshot?.lastName === 'string' ? snapshot.lastName : '';
  const name = `${firstName} ${lastName}`.trim();
  const number =
    typeof entry.employeeNumber === 'number'
      ? String(entry.employeeNumber)
      : typeof snapshot?.employeeNumber === 'number'
        ? String(snapshot.employeeNumber)
        : '';

  if (!name && !number) return null;
  return { name, number };
}

function OptionalEyebrow({ text }: { text: string }) {
  return text ? <Eyebrow>{text}</Eyebrow> : null;
}

export const emptyEmployeeDraft: EmployeeDraft = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  workEmail: '',
  preferredLanguage: 'IT',
  departmentId: '',
  birthDate: '',
  hireDate: '',
  terminationDate: '',
  retirementDate: '',
  retirementDateOverridden: false,
  fte: '1',
  usaCategory: 'EXEMPT',
  contractType: 'INDETERMINATO',
  tfr: 'I_TATTI',
  status: 'ATTIVO',
  canBeResponsible: false,
  canBeSubstituteResponsible: false,
  weeklySchedule: {
    monday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.monday),
    tuesday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.tuesday),
    wednesday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.wednesday),
    thursday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.thursday),
    friday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.friday),
  },
  approvalRoleIds: {
    preApproverIds: [],
    responsabileIds: [],
    substituteResponsabileIds: [],
  },
};

function toEmployeeDraft(employee: Employee): EmployeeDraft {
  return {
    id: employee.id,
    employeeNumber: String(employee.employeeNumber),
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    preferredLanguage: employee.preferredLanguage,
    departmentId: employee.departmentId,
    birthDate: employee.birthDate,
    hireDate: employee.hireDate ?? '',
    terminationDate: employee.terminationDate ?? '',
    retirementDate: employee.retirementDate,
    retirementDateOverridden: employee.retirementDateOverridden,
    fte: String(employee.fte).replace('.', ','),
    usaCategory: employee.usaCategory,
    contractType: employee.contractType,
    tfr: employee.tfr,
    status: employee.status,
    canBeResponsible: employee.canBeResponsible,
    canBeSubstituteResponsible: employee.canBeSubstituteResponsible,
    weeklySchedule: {
      monday: employee.weeklySchedule.monday.display,
      tuesday: employee.weeklySchedule.tuesday.display,
      wednesday: employee.weeklySchedule.wednesday.display,
      thursday: employee.weeklySchedule.thursday.display,
      friday: employee.weeklySchedule.friday.display,
    },
    approvalRoleIds: {
      preApproverIds: employee.approvalRoles.preApprovers.map((approver) => approver.id),
      responsabileIds: employee.approvalRoles.responsabili.map((approver) => approver.id),
      substituteResponsabileIds: employee.approvalRoles.substituteResponsabili.map((approver) => approver.id),
    },
  };
}

/**
 * Serialized form of a draft for unsaved-changes detection. `retirementDate` is
 * only submitted while the override is on — otherwise the server recalculates it
 * — so a date parked there with the switch off cannot change what gets saved and
 * must not trigger the discard prompt.
 */
function employeeDirtyFingerprint(draft: EmployeeDraft): string {
  return JSON.stringify(draft.retirementDateOverridden ? draft : { ...draft, retirementDate: '' });
}

/** "Surname Forename", the order the directory table and dialog titles use. */
function employeeFullName(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  return `${employee.lastName} ${employee.firstName}`.trim();
}

function approvalSummary(employee: Employee, t: Translate): string {
  if (employee.status !== 'ATTIVO') return '-';
  const responsabili = employee.approvalRoles.responsabili.length;
  const substitutes = employee.approvalRoles.substituteResponsabili.length;
  if (responsabili > 0 && substitutes > 0) return `R ${responsabili} / S ${substitutes}`;
  return t('copy.incompleteApproval');
}

function useApi() {
  const auth = useEdAuth();
  return useMemo(() => createApiClient(auth.getAccessToken), [auth]);
}

function useDepartments(api: ReturnType<typeof createApiClient>) {
  return useQuery({ queryKey: ['departments'], queryFn: api.departments });
}

/** Debounce a rapidly-changing value so keystrokes don't fire a query each. */
function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

const FOCUSABLE_SELECTOR =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal-dialog behavior for an overlay form: locks body scroll, closes on
 * Escape, traps Tab focus inside the dialog, and restores focus to the trigger
 * element on close. Returns a ref to attach to the dialog element. Initial focus
 * is left to an `autoFocus` field when present; otherwise the first focusable is
 * focused.
 *
 * While a confirmation is layered on top (discard changes, un-confirming a
 * retirement date) that confirmation owns the keyboard and this hook stands down.
 * Without the guard the two fight: the confirmation closes itself on Escape from
 * its own document listener and this hook — running in the same event — would
 * immediately re-open it, so Escape could never dismiss it; and on Tab this hook
 * would pull focus out of the confirmation's focus trap and back into the form
 * behind it. Reading the flag off the provider is what makes the guard reliable:
 * React has not re-rendered yet while the closing event is still in flight, so
 * the last rendered value still reports the confirmation as open.
 */
function useModalDialog(requestClose: () => void) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const confirmationOpen = useConfirmationOpen();
  const confirmationOpenRef = useRef(confirmationOpen);
  confirmationOpenRef.current = confirmationOpen;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    if (dialog && !dialog.contains(document.activeElement)) {
      (focusable()[0] ?? dialog).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmationOpenRef.current) return;
      if (event.key === 'Escape') {
        requestCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, []);
  return dialogRef;
}

/** The holding screen while Auth0 decides whether there is a session. */
function AppSplash() {
  return <div className="grid min-h-screen place-items-center text-2xl font-extrabold text-brand">ED</div>;
}

/**
 * A primary-navigation link. Below the tablet breakpoint the sidebar is a strip of
 * icons: the label collapses to nothing visible but stays in the accessible name.
 */
function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className="flex min-h-10 items-center justify-center gap-3 rounded-lg p-0 text-[0] font-bold text-ink-soft no-underline [&.active]:bg-[color-mix(in_oklch,var(--brand),white_90%)] [&.active]:text-brand [&_svg]:size-5 tablet:justify-start tablet:px-3 tablet:text-[0.92rem] tablet:[&_svg]:size-[18px]"
    >
      {icon}
      {label}
    </NavLink>
  );
}

function Shell() {
  const { t, i18n } = useTranslation();
  const auth = useEdAuth();
  const redirecting = useRef(false);
  const [loginFailed, setLoginFailed] = useState(false);

  // No landing page on a clean first visit: once Auth0 finishes its session
  // check, send an unauthenticated visitor straight to the Auth0 Universal
  // Login. But DON'T auto-redirect when there's nothing to redirect to safely:
  //   - auth.error: the Auth0 round-trip failed (consent denied, access_denied,
  //     callback/MFA error). Redirecting again just loops forever.
  //   - wasSignedOut(): the user deliberately logged out and Auth0 returned to
  //     origin; auto-redirecting would make sign-out impossible.
  //   - loginFailed: loginWithRedirect() itself rejected (bad config, network).
  // In those cases we fall through to the sign-in screen, which is the manual
  // off-ramp. The ref guards against firing the redirect more than once per
  // mount (StrictMode double-invoke); the conditions above guard the reload
  // loops the ref cannot see.
  const blockRedirect = Boolean(auth.error) || loginFailed || wasSignedOut();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !blockRedirect && !redirecting.current) {
      redirecting.current = true;
      auth.login().catch(() => {
        // Surface a manual retry instead of stranding the user on the splash.
        redirecting.current = false;
        setLoginFailed(true);
      });
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.login, blockRedirect]);

  if (auth.isLoading) {
    return <AppSplash />;
  }

  if (!auth.isAuthenticated) {
    // Auto-redirect is in flight on a clean visit — show the splash, not the
    // sign-in screen, to avoid a flash of the manual button before navigation.
    if (!blockRedirect) {
      return <AppSplash />;
    }

    const signIn = () => {
      setLoginFailed(false);
      redirecting.current = true;
      void auth.login().catch(() => {
        redirecting.current = false;
        setLoginFailed(true);
      });
    };

    return (
      <main className="mx-auto grid min-h-screen max-w-[72rem] grid-cols-1 items-center gap-12 p-8 desktop:grid-cols-[minmax(12rem,20rem)_minmax(18rem,42rem)] desktop:p-12">
        <img className="h-auto w-32 max-w-[32vw] object-contain" src="/itatti-logo.png" alt="I Tatti" />
        <div className="grid justify-items-start gap-4">
          <div>
            <OptionalEyebrow text={t('copy.productEyebrow')} />
            <h1 className="m-0 text-[2rem] leading-[1.1]">ED - Employee Directory</h1>
          </div>
          <p className="m-0 max-w-[58ch] text-ink-soft">{t('copy.subtitle')}</p>
          {auth.error ? (
            <p className="m-0 font-semibold text-danger" role="alert">
              {t('copy.signInError')}
            </p>
          ) : loginFailed ? (
            <p className="m-0 font-semibold text-danger" role="alert">
              {t('copy.signInUnavailable')}
            </p>
          ) : null}
          <Button onClick={signIn}>{t('actions.signIn')}</Button>
        </div>
      </main>
    );
  }

  const toggleLanguage = () => {
    void i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it');
  };

  return (
    <>
      {/* Toasts carry a title plus a "what to do next" line, so they need room to
          breathe and a way out that isn't waiting: hence the wider-than-default
          panel and the close button. Errors also override the duration — see
          notifyError. */}
      <Toaster
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          className: 'w-100 [&_[data-description]]:leading-relaxed [&_[data-description]]:opacity-90',
        }}
      />
      <div className="grid h-screen min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header className="relative z-10 flex flex-col items-stretch justify-between gap-4 border-b border-line bg-surface p-4 desktop:min-h-[4.75rem] desktop:flex-row desktop:items-center desktop:px-8 desktop:py-0">
          <div className="flex min-w-0 items-center gap-4">
            <img className="h-auto w-28 max-w-[32vw] object-contain" src="/itatti-logo.png" alt="I Tatti" />
            <div>
              <OptionalEyebrow text={t('copy.productEyebrow')} />
              <h1 className="m-0 text-[1.1rem] leading-[1.15]">ED - Employee Directory</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* `aria-label` carries the accessible name — the sign-out button is
                icon-only and would otherwise be unnamed. See ActionTooltip for
                why these are not native `title` tooltips. */}
            <ActionTooltip label={t('actions.language')} side="bottom">
              <Button
                variant="outline"
                size="sm"
                className="text-ink-soft"
                type="button"
                onClick={toggleLanguage}
                aria-label={t('actions.language')}
              >
                <Languages size={18} />
                <span>{i18n.language.toUpperCase()}</span>
              </Button>
            </ActionTooltip>
            <ActionTooltip label={t('actions.signOut')} side="bottom">
              <Button
                variant="outline"
                size="icon-sm"
                className="text-ink-soft"
                type="button"
                onClick={auth.logout}
                aria-label={t('actions.signOut')}
              >
                <LogOut size={18} />
              </Button>
            </ActionTooltip>
          </div>
        </header>
        <div className="grid h-full min-h-0 grid-cols-[4.75rem_minmax(0,1fr)] items-stretch tablet:grid-cols-[13.5rem_minmax(0,1fr)] desktop:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface-raised p-3 tablet:px-4 tablet:py-6"
            aria-label={t('nav.primary')}
          >
            <NavItem to="/employees" icon={<UsersRound size={18} />} label={t('nav.employees')} />
            <NavItem to="/departments" icon={<Building2 size={18} />} label={t('nav.departments')} />
            <NavItem to="/import" icon={<Upload size={18} />} label={t('nav.import')} />
            <NavItem to="/audit" icon={<History size={18} />} label={t('nav.audit')} />
            <NavItem to="/settings" icon={<Settings size={18} />} label={t('nav.settings')} />
            <div
              className="mt-auto pt-4 text-center text-[0.76rem] font-extrabold text-ink-muted [writing-mode:vertical-rl] tablet:px-3 tablet:text-left tablet:[writing-mode:horizontal-tb]"
              aria-label={`Version ${__APP_VERSION__}`}
            >
              v{__APP_VERSION__}
            </div>
          </nav>
          <main className="h-full min-h-0 min-w-0 overflow-auto p-4 desktop:p-8">
            <Routes>
              <Route path="/" element={<Navigate to="/employees" replace />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}

function EmployeesPage() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const confirm = useConfirmation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ q: '', status: '', departmentId: '' });
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  // Field errors the *server* raised on the last save. Kept here rather than in
  // the form because only the mutation sees them; the form merges them with its
  // own client-side findings so both kinds highlight identically. `rejectionId`
  // counts rejections rather than describing them — see ServerErrors.
  const [serverErrors, setServerErrors] = useState<ServerErrors>(noServerErrors);
  const departments = useDepartments(api);
  const debouncedQ = useDebounced(filters.q);
  const employeeOptions = useQuery({
    queryKey: ['employee-options'],
    queryFn: () => api.employeeOptions(),
  });
  const employees = useQuery({
    queryKey: ['employees', debouncedQ, filters.status, filters.departmentId],
    queryFn: () =>
      api.allEmployees({
        q: debouncedQ || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
      }),
  });

  const saveEmployee = useMutation({
    mutationFn: async (input: EmployeeDraft) => {
      // The form validates before it calls this, so an unparseable schedule here
      // means a bug rather than operator input — but never send it to the server.
      const weeklySchedule = parseDraftWeeklySchedule(input.weeklySchedule);
      if (!weeklySchedule) throw new Error(t('validation.weeklyHours'));
      const payload = {
        employeeNumber: Number(input.employeeNumber),
        firstName: input.firstName,
        lastName: input.lastName,
        workEmail: input.workEmail,
        preferredLanguage: input.preferredLanguage,
        departmentId: input.departmentId,
        birthDate: input.birthDate,
        hireDate: input.hireDate || null,
        terminationDate: input.terminationDate || null,
        retirementDate: input.retirementDateOverridden ? input.retirementDate || null : null,
        resetRetirementDate: !input.retirementDateOverridden,
        retirementDateOverridden: input.retirementDateOverridden,
        fte: Number(input.fte.replace(',', '.')),
        usaCategory: input.usaCategory,
        contractType: input.contractType,
        tfr: input.tfr,
        status: input.status,
        canBeResponsible: input.canBeResponsible,
        canBeSubstituteResponsible: input.canBeSubstituteResponsible,
        weeklySchedule,
        approvalRoleIds: input.approvalRoleIds,
      };
      return input.id ? api.updateEmployee(input.id, payload) : api.createEmployee(payload);
    },
    onSuccess: (employee, input) => {
      setDraft(null);
      setServerErrors(noServerErrors);
      const name = employeeFullName(employee);
      notifySuccess(
        t(input.id ? 'copy.employeeUpdated' : 'copy.employeeCreated'),
        t(input.id ? 'copy.employeeUpdatedBody' : 'copy.employeeCreatedBody', { name })
      );
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => {
      // The toast says what went wrong; the field map makes the form show *where*.
      // Notified outside the updater: it renders a toast, and React is free to
      // invoke a state updater more than once.
      const { fieldErrors } = notifyError(error, t, { unsaved: true });
      setServerErrors((previous) => ({ fields: fieldErrors, rejectionId: previous.rejectionId + 1 }));
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: (employee: Employee) => api.deleteEmployee(employee.id),
    onSuccess: (_result, employee) => {
      notifySuccess(t('copy.employeeDeleted'), t('copy.employeeDeletedBody', { name: employeeFullName(employee) }));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => notifyError(error, t, { unsaved: true }),
  });

  const confirmDeleteEmployee = (employee: Employee) => {
    if (deleteEmployee.isPending) return;
    confirm({
      title: t('copy.confirmationTitle'),
      // Name the record being destroyed: on a table of similar rows, "this
      // employee" is not enough to catch a misclick before it is irreversible.
      message: t('copy.confirmDeleteEmployee', {
        name: employeeFullName(employee),
        employeeNumber: employee.employeeNumber,
      }),
      confirmLabel: t('actions.delete'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: () => deleteEmployee.mutate(employee),
    });
  };

  const exportEmployees = async () => {
    try {
      const blob = await api.exportEmployeesExcel({
        q: filters.q || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ed-employees.xlsx';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      // A download that starts in the background is otherwise indistinguishable
      // from a button that did nothing.
      notifySuccess(t('copy.exportStarted'), t('copy.exportStartedBody'));
    } catch (error) {
      notifyError(error, t);
    }
  };

  return (
    <PageSection>
      <PageHeading
        eyebrow={t('nav.employees')}
        title={t('copy.subtitle')}
        actions={
          <>
            <Button variant="outline" className="text-brand" type="button" onClick={exportEmployees}>
              <Download size={16} />
              {t('actions.export')}
            </Button>
            <Button type="button" onClick={() => setDraft(emptyEmployeeDraft)}>
              <Plus size={16} />
              {t('actions.createEmployee')}
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchField
          value={filters.q}
          onChange={(q) => setFilters((current) => ({ ...current, q }))}
          placeholder={t('fields.search')}
        />
        {/* Clearable, because "any status" and "any department" are the normal
            state of this toolbar rather than an absence of an answer. */}
        <ComboboxField
          label={t('fields.status')}
          placeholder={t('fields.status')}
          value={filters.status}
          onChange={(status) => setFilters((current) => ({ ...current, status }))}
          options={EMPLOYEE_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) }))}
        />
        <ComboboxField
          label={t('fields.department')}
          placeholder={t('fields.department')}
          value={filters.departmentId}
          onChange={(departmentId) => setFilters((current) => ({ ...current, departmentId }))}
          options={(departments.data ?? []).map((department) => ({
            value: department.id,
            label: department.name,
          }))}
        />
      </Toolbar>

      <DataSurface>
        <table>
          <thead>
            <tr>
              <th>{t('fields.employeeNumber')}</th>
              <th>{t('fields.lastName')}</th>
              <th>{t('fields.firstName')}</th>
              <th>{t('fields.department')}</th>
              <th>{t('fields.status')}</th>
              <th>{t('fields.fte')}</th>
              <th>{t('fields.tfr')}</th>
              <th>{t('fields.weeklyTotal')}</th>
              <th>{t('fields.approvalWorkflow')}</th>
              <th>{t('fields.retirementDate')}</th>
              <th aria-label={t('fields.actions')} />
            </tr>
          </thead>
          <tbody>
            {employees.data?.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.employeeNumber}</td>
                <td>{employee.lastName}</td>
                <td>{employee.firstName}</td>
                <td>{employee.department?.name}</td>
                <td>
                  <StatusPill status={employee.status}>{t(`status.${employee.status}`)}</StatusPill>
                </td>
                <td>{employee.fte}</td>
                <td>{t(`tfr.${employee.tfr}`)}</td>
                <td>{employee.weeklySchedule.total.display}</td>
                <td>{approvalSummary(employee, t)}</td>
                <td>{formatDate(employee.retirementDate, dateLocale)}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand"
                      type="button"
                      onClick={() => setDraft(toEmployeeDraft(employee))}
                    >
                      {t('actions.edit')}
                    </Button>
                    <ActionTooltip label={t('actions.delete')} side="left">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-danger"
                        type="button"
                        onClick={() => confirmDeleteEmployee(employee)}
                        disabled={deleteEmployee.isPending}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </ActionTooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.isError ? <QueryError error={employees.error} onRetry={() => void employees.refetch()} /> : null}
        {!employees.isLoading && !employees.isError && employees.data?.length === 0 ? (
          <EmptyState>{t('copy.emptyEmployees')}</EmptyState>
        ) : null}
      </DataSurface>

      {draft ? (
        <EmployeeForm
          draft={draft}
          departments={departments.data ?? []}
          employeeOptions={employeeOptions.data ?? []}
          serverErrors={serverErrors}
          onCancel={() => {
            setDraft(null);
            setServerErrors(noServerErrors);
          }}
          onChange={setDraft}
          onSave={() => saveEmployee.mutate(draft)}
          isSaving={saveEmployee.isPending}
        />
      ) : null}
    </PageSection>
  );
}

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
        title: t('copy.confirmationTitle'),
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
      title: t('copy.confirmationTitle'),
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
        aria-label={draft.id ? `${draft.lastName} ${draft.firstName}` : t('actions.createEmployee')}
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
                {draft.id ? `${draft.lastName} ${draft.firstName}` : t('actions.createEmployee')}
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

          <EmployeeFormSection
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
          </EmployeeFormSection>

          <EmployeeFormSection
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
          </EmployeeFormSection>

          <EmployeeFormSection
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
          </EmployeeFormSection>

          <EmployeeFormSection
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
          </EmployeeFormSection>

          <EmployeeFormSection
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
          </EmployeeFormSection>

          <EmployeeFormSection
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
          </EmployeeFormSection>
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

export type DepartmentDraft = {
  id?: string;
  name: string;
};

export const emptyDepartmentDraft: DepartmentDraft = {
  name: '',
};

function DepartmentsPage() {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const api = useApi();
  const queryClient = useQueryClient();
  const departments = useDepartments(api);
  const [draft, setDraft] = useState<DepartmentDraft | null>(null);
  const [serverErrors, setServerErrors] = useState<ServerErrors>(noServerErrors);

  const saveDepartment = useMutation({
    mutationFn: async (input: DepartmentDraft) =>
      input.id ? api.updateDepartment(input.id, { name: input.name }) : api.createDepartment({ name: input.name }),
    onSuccess: (department, input) => {
      setDraft(null);
      setServerErrors(noServerErrors);
      notifySuccess(
        t(input.id ? 'copy.departmentUpdated' : 'copy.departmentCreated'),
        t(input.id ? 'copy.departmentUpdatedBody' : 'copy.departmentCreatedBody', { name: department.name })
      );
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error) => {
      const { fieldErrors } = notifyError(error, t, { unsaved: true });
      setServerErrors((previous) => ({ fields: fieldErrors, rejectionId: previous.rejectionId + 1 }));
    },
  });
  const deleteDepartment = useMutation({
    mutationFn: (department: Department) => api.deleteDepartment(department.id),
    onSuccess: (_result, department) => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      notifySuccess(t('copy.departmentDeleted'), t('copy.departmentDeletedBody', { name: department.name }));
    },
    onError: (error) => notifyError(error, t, { unsaved: true }),
  });

  const confirmDeleteDepartment = (department: Department) => {
    if (deleteDepartment.isPending) return;
    confirm({
      title: t('copy.confirmationTitle'),
      message: t('copy.confirmDeleteDepartment', { name: department.name }),
      confirmLabel: t('actions.delete'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: () => deleteDepartment.mutate(department),
    });
  };

  return (
    <PageSection>
      <PageHeading
        eyebrow={t('nav.departments')}
        title={t('copy.departmentsSubtitle')}
        actions={
          <Button type="button" onClick={() => setDraft(emptyDepartmentDraft)}>
            <Plus size={16} />
            {t('actions.createDepartment')}
          </Button>
        }
      />
      <DataSurface>
        <table>
          <thead>
            <tr>
              <th>{t('fields.department')}</th>
              <th>{t('fields.updated')}</th>
              <th aria-label={t('fields.actions')} />
            </tr>
          </thead>
          <tbody>
            {departments.data?.map((department) => (
              <tr key={department.id}>
                <td>{department.name}</td>
                <td>{formatTableDateTime(department.updatedAt)}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand"
                      type="button"
                      onClick={() => setDraft({ id: department.id, name: department.name })}
                    >
                      {t('actions.edit')}
                    </Button>
                    <ActionTooltip label={t('actions.delete')} side="left">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-danger"
                        type="button"
                        onClick={() => confirmDeleteDepartment(department)}
                        disabled={deleteDepartment.isPending}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </ActionTooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {departments.isError ? (
          <QueryError error={departments.error} onRetry={() => void departments.refetch()} />
        ) : null}
        {!departments.isLoading && !departments.isError && departments.data?.length === 0 ? (
          <EmptyState>{t('copy.emptyDepartments')}</EmptyState>
        ) : null}
      </DataSurface>

      {draft ? (
        <DepartmentForm
          draft={draft}
          serverErrors={serverErrors}
          onCancel={() => {
            setDraft(null);
            setServerErrors(noServerErrors);
          }}
          onChange={setDraft}
          onSave={() => saveDepartment.mutate(draft)}
          isSaving={saveDepartment.isPending}
        />
      ) : null}
    </PageSection>
  );
}

export function DepartmentForm({
  draft,
  serverErrors,
  onCancel,
  onChange,
  onSave,
  isSaving,
}: {
  draft: DepartmentDraft;
  /** Field errors the last save came back with (e.g. the name is already taken). */
  serverErrors?: ServerErrors;
  onCancel: () => void;
  onChange: (draft: DepartmentDraft) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const [submitted, setSubmitted] = useState(false);
  // See the employee form: a "name already taken" verdict is about the submitted
  // value, so it clears as soon as the operator types a different one — and comes
  // back on the next rejection, even one carrying the identical message.
  const [nameEdited, setNameEdited] = useState(false);
  const serverNameError = serverErrors?.fields['name'];
  useEffect(() => setNameEdited(false), [serverErrors?.rejectionId]);
  const nameError =
    (submitted && !draft.name.trim() ? t('validation.required') : undefined) ??
    (nameEdited ? undefined : serverNameError);

  const initialDraft = useRef(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft.current);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      onCancel();
      return;
    }
    confirm({
      title: t('copy.confirmationTitle'),
      message: t('copy.discardChanges'),
      confirmLabel: t('actions.discard'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: onCancel,
    });
  }, [confirm, isDirty, onCancel, t]);

  const dialogRef = useModalDialog(requestClose);

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
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-[44rem] flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_oklch(0.2_0.02_250/0.08),0_24px_60px_-20px_oklch(0.2_0.04_250/0.4)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 desktop:max-h-[calc(100vh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? draft.name : t('actions.createDepartment')}
        // Same reasoning as the employee form: our own message, in the app's
        // language, attached to the field. See the note on that form.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!draft.name.trim()) {
            notifyValidation(
              t('validation.summaryTitle'),
              t('validation.summaryBody', { count: 1, fields: t('fields.department') })
            );
            return;
          }
          onSave();
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-raised px-6 py-6 desktop:px-8">
          <div>
            <Eyebrow>{t('nav.departments')}</Eyebrow>
            <h3 className="m-0 text-xl leading-tight font-bold">
              {draft.id ? draft.name : t('actions.createDepartment')}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="flex-none text-ink-muted"
            type="button"
            onClick={requestClose}
            aria-label={t('actions.close')}
          >
            <X size={18} />
          </Button>
        </header>

        <div className="grid gap-8 overflow-y-auto px-6 py-8 desktop:px-8">
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-4 block w-full border-b border-line pb-2 text-[0.74rem] font-extrabold tracking-wider text-ink-soft uppercase">
              {t('sections.identity')}
            </legend>
            <div className="grid grid-cols-1 gap-6">
              <Field label={t('fields.department')} required name="name" error={nameError} full>
                <Input
                  required
                  autoFocus
                  // Named explicitly: the caption beside this input is not a
                  // `<label>` element, because most fields here wrap a combobox
                  // or a date picker rather than a plain input.
                  aria-label={t('fields.department')}
                  aria-invalid={Boolean(nameError)}
                  {...(nameError ? { 'aria-describedby': fieldErrorId('name') } : {})}
                  value={draft.name}
                  onChange={(e) => {
                    setNameEdited(true);
                    onChange({ ...draft, name: e.target.value });
                  }}
                />
              </Field>
            </div>
          </fieldset>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-line bg-surface-raised px-6 py-4 desktop:px-8">
          <Button variant="outline" className="text-ink-soft" type="button" onClick={requestClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            <Save size={16} />
            {t('actions.save')}
          </Button>
        </footer>
      </form>
    </div>
  );
}

// Exported for tests: the import flow's file picker and row-error table.
export function ImportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const departments = useDepartments(api);
  const departmentNameById = useMemo(
    () => new Map((departments.data ?? []).map((department) => [department.id, department.name])),
    [departments.data]
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  // Discard any previous preview when the operator picks a different file, so
  // Commit can never submit the earlier file's batch.
  const chooseFile = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setSelectedRows([]);
  };

  const previewImport = useMutation({
    mutationFn: async () => {
      if (!file) {
        notifyValidation(t('copy.excelFileRequired'), t('copy.excelFileRequiredBody'));
        // Already reported with the file-specific wording; skip the generic
        // error toast onError would otherwise add on top of it.
        return null;
      }
      return api.previewImport(file);
    },
    onSuccess: (data) => {
      if (!data) return;
      setPreview(data);
      setSelectedRows(data.rows.filter((row) => row.selected).map((row) => row.rowNumber));
    },
    onError: (error) => notifyError(error, t),
  });
  const commitImport = useMutation({
    mutationFn: async () => {
      if (!preview) {
        notifyValidation(t('copy.previewRequired'), t('copy.previewRequiredBody'));
        return null;
      }
      return api.commitImport(preview.batchId, selectedRows);
    },
    onSuccess: (result) => {
      if (!result) return;
      const count = result.data.committed.length;
      notifySuccess(
        t('copy.importCommitted'),
        count === 0 ? t('copy.importCommittedNone') : t('copy.importCommittedBody', { count })
      );
      setPreview(null);
      setSelectedRows([]);
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => notifyError(error, t, { unsaved: true }),
  });

  return (
    <PageSection>
      <PageHeading eyebrow={t('nav.import')} title={t('copy.importInstructions')} />
      <form
        className="grid grid-cols-1 items-center justify-start gap-3 desktop:grid-cols-[minmax(16rem,32rem)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          previewImport.mutate();
        }}
      >
        <FilePicker
          label={t('copy.excelFileLabel')}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          placeholder={t('copy.excelFilePlaceholder')}
          value={file}
          onChange={chooseFile}
        />
        <Button type="submit" disabled={!file || previewImport.isPending}>
          <FileCheck2 size={16} />
          {t('actions.preview')}
        </Button>
      </form>
      {preview ? (
        <DataSurface>
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <strong>{t('copy.rowsCount', { count: preview.rows.length })}</strong>
            <Button
              type="button"
              onClick={() => commitImport.mutate()}
              disabled={selectedRows.length === 0 || commitImport.isPending}
            >
              <ClipboardList size={16} />
              {t('actions.commit')}
            </Button>
          </div>
          <table>
            <thead>
              <tr>
                <th aria-label={t('fields.select')} />
                <th>{t('fields.row')}</th>
                <th>{t('fields.employeeNumber')}</th>
                <th>{t('fields.lastName')}</th>
                <th>{t('fields.department')}</th>
                <th>{t('fields.action')}</th>
                <th>{t('fields.errors')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr
                  key={row.rowNumber}
                  className={row.errors.length ? 'bg-warning-surface [&>td]:text-warning' : undefined}
                >
                  <td>
                    <Checkbox
                      aria-label={`${t('fields.select')} ${row.rowNumber}`}
                      disabled={row.errors.length > 0}
                      checked={selectedRows.includes(row.rowNumber)}
                      onCheckedChange={(checked) => {
                        setSelectedRows((current) =>
                          checked
                            ? [...current, row.rowNumber]
                            : current.filter((rowNumber) => rowNumber !== row.rowNumber)
                        );
                      }}
                    />
                  </td>
                  <td>{row.rowNumber}</td>
                  <td>{row.normalized?.employeeNumber}</td>
                  <td>{row.normalized?.lastName}</td>
                  <td>
                    {row.normalized?.departmentId
                      ? departmentNameById.get(row.normalized.departmentId) ?? row.normalized.departmentId
                      : ''}
                  </td>
                  <td>{row.proposedAction}</td>
                  <td>{row.errors.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataSurface>
      ) : null}
    </PageSection>
  );
}

function AuditPage() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const api = useApi();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const debouncedEmployeeNumber = useDebounced(employeeNumber);
  const audit = useQuery({
    queryKey: ['audit', debouncedEmployeeNumber],
    queryFn: () => api.auditLogs(debouncedEmployeeNumber || undefined),
  });

  return (
    <PageSection>
      <PageHeading eyebrow={t('nav.audit')} title={t('audit.title')} />
      <Toolbar>
        <SearchField
          value={employeeNumber}
          onChange={setEmployeeNumber}
          placeholder={t('fields.employeeNumber')}
        />
      </Toolbar>
      <DataSurface>
        <table>
          <thead>
            <tr>
              <th>{t('audit.time')}</th>
              <th>{t('audit.user')}</th>
              <th>{t('audit.employee')}</th>
              <th>{t('audit.entity')}</th>
              <th>{t('audit.action')}</th>
              <th>{t('audit.changes')}</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.map((entry) => {
              const changes = auditChanges(entry, t, dateLocale);
              const employee = auditEmployeeLabel(entry);
              return (
                <tr key={entry.id}>
                  <td>{formatTableDateTime(entry.createdAt)}</td>
                  <td>{entry.actorEmail ?? entry.actorSub}</td>
                  <td>
                    {employee ? (
                      <span className="grid min-w-36 gap-[0.1rem]">
                        {employee.name ? <span>{employee.name}</span> : null}
                        {employee.number ? <span className="text-ink-muted">{employee.number}</span> : null}
                      </span>
                    ) : (
                      <span className="text-ink-muted">-</span>
                    )}
                  </td>
                  <td>{t(`entityType.${entry.entityType}`)}</td>
                  <td>{t(`auditAction.${entry.action}`)}</td>
                  <td>
                    {changes.length > 0 ? (
                      <div className="grid min-w-96 gap-2">
                        {changes.map((change) => (
                          <div
                            className="grid grid-cols-[minmax(8rem,12rem)_minmax(7rem,1fr)_auto_minmax(7rem,1fr)] items-start gap-2"
                            key={change.key}
                          >
                            <span className="font-extrabold text-ink-soft">{change.label}</span>
                            <span className="[overflow-wrap:anywhere]" title={t('audit.oldValue')}>
                              {change.before}
                            </span>
                            <span className="font-extrabold text-ink-muted">-&gt;</span>
                            <span className="[overflow-wrap:anywhere]" title={t('audit.newValue')}>
                              {change.after}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-muted">{t('audit.noFieldChanges')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {audit.isError ? <QueryError error={audit.error} onRetry={() => void audit.refetch()} /> : null}
      </DataSurface>
    </PageSection>
  );
}

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

function parseDraftFte(value: string): number | null {
  try {
    return parseFteInput(value);
  } catch {
    return null;
  }
}

function parseDraftWeeklySchedule(schedule: Record<WeekdayKey, string>): Record<WeekdayKey, number> | null {
  try {
    return {
      monday: parseSessantesimiInput(schedule.monday),
      tuesday: parseSessantesimiInput(schedule.tuesday),
      wednesday: parseSessantesimiInput(schedule.wednesday),
      thursday: parseSessantesimiInput(schedule.thursday),
      friday: parseSessantesimiInput(schedule.friday),
    };
  } catch {
    return null;
  }
}

function EmployeeFormSection({
  number,
  icon,
  title,
  description,
  children,
  errorCount = 0,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Problems inside this section, badged on the heading. */
  errorCount?: number;
}) {
  const { t } = useTranslation();
  return (
    <fieldset
      {...(errorCount > 0 ? { 'data-has-errors': 'true' } : {})}
      // The stagger is per-section rather than an nth-child rule, now that the
      // sections are drawn by a component that knows its own number.
      style={{ animationDelay: `${(Number(number) - 1) * 35}ms` }}
      className={cn(
        'group/section m-0 min-w-0 rounded-[14px] border border-[color-mix(in_oklch,var(--line),var(--brand)_7%)] bg-surface p-4 tablet:p-6',
        'shadow-[0_1px_3px_oklch(0.2_0.02_250/0.045)] transition-[border-color,box-shadow] duration-150',
        'focus-within:border-[color-mix(in_oklch,var(--brand),var(--line)_58%)]',
        'focus-within:shadow-[0_1px_3px_oklch(0.2_0.02_250/0.04),0_8px_28px_color-mix(in_oklch,var(--brand),transparent_92%)]',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300'
      )}
    >
      <legend className="sr-only">{title}</legend>
      {/* The badge gets a track of its own only when there is one to place: an
          always-present empty column would leave its grid gap behind. */}
      <div
        className={cn(
          'mb-6 grid items-center gap-3 border-b border-[color-mix(in_oklch,var(--line),transparent_24%)] pb-4',
          errorCount > 0
            ? 'grid-cols-[1.8rem_minmax(0,1fr)_auto] tablet:grid-cols-[2rem_2rem_minmax(0,1fr)_auto]'
            : 'grid-cols-[1.8rem_minmax(0,1fr)] tablet:grid-cols-[2rem_2rem_minmax(0,1fr)]'
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--brand),var(--surface)_90%)] text-[0.68rem] font-black tracking-wide tabular-nums text-brand"
        >
          {number}
        </span>
        <span
          aria-hidden="true"
          className="hidden size-8 items-center justify-center rounded-full bg-surface-raised text-[color-mix(in_oklch,var(--brand),var(--ink-soft)_18%)] transition-[color,transform] duration-150 group-focus-within/section:-translate-y-px group-focus-within/section:text-brand tablet:inline-flex [&_svg]:size-[1.1rem] [&_svg]:[stroke-width:2.15]"
        >
          {icon}
        </span>
        <div>
          <h4 className="m-0 text-[0.96rem] leading-tight text-ink">{title}</h4>
          <p className="m-0 mt-[0.15rem] text-[0.78rem] leading-snug text-ink-muted">{description}</p>
        </div>
        {/* Scrolling past a collapsed-looking section shouldn't hide the fact
            that something in it still needs attention. */}
        {errorCount > 0 ? (
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--danger),var(--surface)_88%)] px-2 py-[0.15rem] text-[0.72rem] font-extrabold whitespace-nowrap text-danger">
            <TriangleAlert size={13} aria-hidden="true" />
            {t('validation.sectionErrors', { count: errorCount })}
          </span>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}

export default function App() {
  return <Shell />;
}
