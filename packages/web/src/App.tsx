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
import {
  ActionIcon,
  Button,
  Checkbox,
  FileInput,
  MultiSelect,
  Pill,
  Select,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { DateInput as MantineDateInput } from '@mantine/dates';
import { modals, useModals } from '@mantine/modals';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  fieldLabels,
  firstErrorField,
  noServerErrors,
  orderedErrorFields,
  validateEmployeeDraft,
  type FieldErrors,
  type ServerErrors,
} from './employee-validation.js';
import { notifyError, notifySuccess, notifyValidation } from './ui/feedback.js';
import type { Translate } from './i18n/types.js';
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

const tableDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

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

function parseDateOnlyToUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatTableDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = parseDateOnlyToUtc(value);
  return date ? tableDateFormatter.format(date) : value;
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

function formatAuditValue(key: string, value: unknown, t: Translate): string {
  if (value === null || value === undefined || value === '') return '-';
  if (dateFields.has(key) && typeof value === 'string') return formatTableDate(value);
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

function auditChanges(entry: AuditLog, t: Translate) {
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
      before: formatAuditValue(key, before, t),
      after: formatAuditValue(key, after, t),
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
  return text ? <p className="eyebrow">{text}</p> : null;
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

/** Visible, retryable banner for a failed data load — otherwise query failures
 *  (including an expired session) render as a silently empty table. */
function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const described = describeError(error, t);
  // A failed *read* has a different next step from a failed write: the catalogue
  // description covers the codes that speak for themselves (expired session,
  // deleted record), and the retry hint covers the rest.
  const hint = described.reassure ? t('copy.loadErrorHint') : described.description;
  return (
    <div className="data-error" role="alert">
      <span>
        <strong>{described.title}</strong>
        {hint ? <span className="data-error-hint">{hint}</span> : null}
      </span>
      <button type="button" className="button ghost" onClick={onRetry}>
        {t('actions.retry')}
      </button>
    </div>
  );
}

function openConfirmation({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  modals.openConfirmModal({
    title,
    centered: true,
    radius: 'lg',
    overlayProps: { backgroundOpacity: 0.55, blur: 4 },
    transitionProps: { transition: 'pop', duration: 160 },
    children: <Text size="sm">{message}</Text>,
    labels: { confirm: confirmLabel, cancel: cancelLabel },
    ...(destructive ? { confirmProps: { color: 'red' } } : {}),
    onConfirm,
  });
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
 * While a Mantine confirmation is layered on top (discard changes, un-confirming a
 * retirement date) that confirmation owns the keyboard and this hook stands down.
 * Without the guard the two fight: Mantine closes the confirmation on Escape from a
 * window capture-phase listener and this hook — bubbling afterwards — immediately
 * re-opens it, so Escape can never dismiss it; and on Tab this hook pulls focus out
 * of the confirmation's focus trap and back into the form behind it. Reading the
 * stack depth off Mantine's context is what makes the guard reliable: the reducer
 * dispatch has not been committed yet while the closing event is still bubbling, so
 * the last rendered value still reports the confirmation as open.
 */
function useModalDialog(requestClose: () => void) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const layeredModalCount = useModals().modals.length;
  const layeredModalCountRef = useRef(layeredModalCount);
  layeredModalCountRef.current = layeredModalCount;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    if (dialog && !dialog.contains(document.activeElement)) {
      (focusable()[0] ?? dialog).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (layeredModalCountRef.current > 0) return;
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
    return <div className="app-loading">ED</div>;
  }

  if (!auth.isAuthenticated) {
    // Auto-redirect is in flight on a clean visit — show the splash, not the
    // sign-in screen, to avoid a flash of the manual button before navigation.
    if (!blockRedirect) {
      return <div className="app-loading">ED</div>;
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
      <main className="signin-screen">
        <img className="brand-logo" src="/itatti-logo.png" alt="I Tatti" />
        <div>
          <OptionalEyebrow text={t('copy.productEyebrow')} />
          <h1>ED - Employee Directory</h1>
          <p>{t('copy.subtitle')}</p>
          {auth.error ? (
            <p className="signin-error" role="alert">
              {t('copy.signInError')}
            </p>
          ) : loginFailed ? (
            <p className="signin-error" role="alert">
              {t('copy.signInUnavailable')}
            </p>
          ) : null}
          <button className="button primary" onClick={signIn}>
            {t('actions.signIn')}
          </button>
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
          breathe and a way out that isn't waiting: hence the wider panel (see
          .ed-toast) and the close button. Errors also override the duration —
          see notifyError. */}
      <Toaster richColors closeButton position="top-right" toastOptions={{ className: 'ed-toast' }} />
      <div className="app-shell">
        <header className="topbar">
          <div className="identity">
            <img className="brand-logo" src="/itatti-logo.png" alt="I Tatti" />
            <div>
              <OptionalEyebrow text={t('copy.productEyebrow')} />
              <h1>ED - Employee Directory</h1>
            </div>
          </div>
          <div className="topbar-actions">
            {/* Mantine tooltips rather than `title`: the native one is
                browser-styled, appears after a second-long delay, and can't be
                made to match the rest of the chrome. `aria-label` carries the
                accessible name that `title` used to supply — the sign-out button
                is icon-only and would otherwise be unnamed. */}
            <Tooltip label={t('actions.language')} withArrow position="bottom">
              <button
                className="icon-button"
                type="button"
                onClick={toggleLanguage}
                aria-label={t('actions.language')}
              >
                <Languages size={18} />
                <span>{i18n.language.toUpperCase()}</span>
              </button>
            </Tooltip>
            <Tooltip label={t('actions.signOut')} withArrow position="bottom">
              <button
                className="icon-button"
                type="button"
                onClick={auth.logout}
                aria-label={t('actions.signOut')}
              >
                <LogOut size={18} />
              </button>
            </Tooltip>
          </div>
        </header>
        <div className="workbench">
          <nav className="sidebar" aria-label={t('nav.primary')}>
            <NavLink to="/employees">
              <UsersRound size={18} />
              {t('nav.employees')}
            </NavLink>
            <NavLink to="/departments">
              <Building2 size={18} />
              {t('nav.departments')}
            </NavLink>
            <NavLink to="/import">
              <Upload size={18} />
              {t('nav.import')}
            </NavLink>
            <NavLink to="/audit">
              <History size={18} />
              {t('nav.audit')}
            </NavLink>
            <NavLink to="/settings">
              <Settings size={18} />
              {t('nav.settings')}
            </NavLink>
            <div className="sidebar-version" aria-label={`Version ${__APP_VERSION__}`}>
              v{__APP_VERSION__}
            </div>
          </nav>
          <main className="content">
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
    openConfirmation({
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
    <section className="page-grid employees-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.employees')}</p>
          <h2>{t('copy.subtitle')}</h2>
        </div>
        <div className="action-row">
          <button className="button secondary" type="button" onClick={exportEmployees}>
            <Download size={16} />
            {t('actions.export')}
          </button>
          <button className="button primary" type="button" onClick={() => setDraft(emptyEmployeeDraft)}>
            <Plus size={16} />
            {t('actions.createEmployee')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
            placeholder={t('fields.search')}
          />
        </label>
        <Select
          className="toolbar-select"
          value={filters.status || null}
          onChange={(value) => setFilters((current) => ({ ...current, status: value ?? '' }))}
          aria-label={t('fields.status')}
          placeholder={t('fields.status')}
          data={EMPLOYEE_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) }))}
          searchable
          clearable
          openOnFocus
          nothingFoundMessage={t('copy.noOptionsFound')}
          comboboxProps={{ withinPortal: true, zIndex: 1200, transitionProps: { transition: 'pop', duration: 120 } }}
        />
        <Select
          className="toolbar-select"
          value={filters.departmentId || null}
          onChange={(value) => setFilters((current) => ({ ...current, departmentId: value ?? '' }))}
          aria-label={t('fields.department')}
          placeholder={t('fields.department')}
          data={(departments.data ?? []).map((department) => ({ value: department.id, label: department.name }))}
          searchable
          clearable
          openOnFocus
          nothingFoundMessage={t('copy.noOptionsFound')}
          comboboxProps={{ withinPortal: true, zIndex: 1200, transitionProps: { transition: 'pop', duration: 120 } }}
        />
      </div>

      <div className="data-surface">
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
                  <span className={`status-pill status-${employee.status.toLowerCase()}`}>{t(`status.${employee.status}`)}</span>
                </td>
                <td>{employee.fte}</td>
                <td>{t(`tfr.${employee.tfr}`)}</td>
                <td>{employee.weeklySchedule.total.display}</td>
                <td>{approvalSummary(employee, t)}</td>
                <td>{formatTableDate(employee.retirementDate)}</td>
                <td className="row-actions">
                  <button className="text-button" type="button" onClick={() => setDraft(toEmployeeDraft(employee))}>
                    {t('actions.edit')}
                  </button>
                  <Tooltip label={t('actions.delete')} withArrow position="left">
                    <button
                      className="icon-danger"
                      type="button"
                      onClick={() => confirmDeleteEmployee(employee)}
                      disabled={deleteEmployee.isPending}
                      aria-label={t('actions.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.isError ? <QueryError error={employees.error} onRetry={() => void employees.refetch()} /> : null}
        {!employees.isLoading && !employees.isError && employees.data?.length === 0 ? (
          <p className="empty-state">{t('copy.emptyEmployees')}</p>
        ) : null}
      </div>

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
    </section>
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
      openConfirmation({
        title: t('copy.confirmationTitle'),
        message: t('copy.confirmUnconfirmRetirement', {
          date: formatTableDate(draft.retirementDate),
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
    openConfirmation({
      title: t('copy.confirmationTitle'),
      message: t('copy.discardChanges'),
      confirmLabel: t('actions.discard'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: onCancel,
    });
  }, [isDirty, onCancel, t]);

  const dialogRef = useModalDialog(requestClose);
  const comboboxProps = {
    withinPortal: true,
    zIndex: 1200,
    transitionProps: { transition: 'pop' as const, duration: 120 },
  };

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
   * The input only takes a boolean: Mantine renders the red border and sets
   * `aria-invalid`, while the message stays in the Field's own slot so it looks
   * the same next to the plain `<input>`s elsewhere in the app. Screen readers
   * get it from the message's `role="alert"` and from the summary above the form
   * — Mantine computes `aria-describedby` from its own internals and drops any
   * value passed in, so per-field descriptions are not available to us here.
   */
  const fieldProps = (field: string) => ({ name: field, error: errorFor(field) });
  const inputProps = (field: string) => ({ error: Boolean(errorFor(field)) });

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
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        className="modal-dialog employee-form-dialog"
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
        <header className="modal-header employee-form-header">
          <div className="modal-title-group">
            <span className="modal-title-icon" aria-hidden="true">
              <UserRoundPlus size={23} />
            </span>
            <div className="modal-title-copy">
              <p className="modal-eyebrow">{t('copy.employeeRecord')}</p>
              <h3>{draft.id ? `${draft.lastName} ${draft.firstName}` : t('actions.createEmployee')}</h3>
              <p className="modal-description">{t('copy.employeeFormSubtitle')}</p>
            </div>
          </div>
          <ActionIcon
            className="employee-modal-close"
            variant="subtle"
            color="gray"
            size="lg"
            radius="md"
            onClick={requestClose}
            aria-label={t('actions.close')}
          >
            <X size={18} />
          </ActionIcon>
        </header>

        <div className="modal-body employee-form-body">
          {/* A toast is gone in ten seconds and a red field six sections down is
              invisible from here. This is the durable list: it stays until the
              form is clean, and each entry jumps to the input it names. */}
          {invalidFields.length > 0 ? (
            <div className="form-error-summary" role="alert">
              <span className="form-error-summary-icon" aria-hidden="true">
                <TriangleAlert size={18} />
              </span>
              <div>
                <strong>
                  {t('validation.summaryHeading', { count: invalidFields.length })}
                </strong>
                <ul>
                  {invalidFields.map((field) => (
                    <li key={field}>
                      <button
                        type="button"
                        onClick={() => focusField(field)}
                        aria-label={t('validation.jumpToField', {
                          field: t(FIELD_LABEL_KEYS[field] ?? field),
                        })}
                      >
                        {t(FIELD_LABEL_KEYS[field] ?? field)}
                      </button>
                      <span>{fieldErrors[field]}</span>
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
            <div className="form-grid employee-identity-grid">
              <Field
                className="employee-field-compact employee-identity-number"
                icon={<Hash />}
                label={t('fields.employeeNumber')}
                required
                {...fieldProps('employeeNumber')}
              >
                <TextInput
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
                className="employee-identity-name"
                icon={<UserRound />}
                label={t('fields.firstName')}
                required
                {...fieldProps('firstName')}
              >
                <TextInput
                  required
                  {...inputProps('firstName')}
                  aria-label={t('fields.firstName')}
                  value={draft.firstName}
                  onChange={(event) => setName('firstName', event.currentTarget.value)}
                />
              </Field>
              <Field
                className="employee-identity-name"
                icon={<UserRound />}
                label={t('fields.lastName')}
                required
                {...fieldProps('lastName')}
              >
                <TextInput
                  required
                  {...inputProps('lastName')}
                  aria-label={t('fields.lastName')}
                  value={draft.lastName}
                  onChange={(event) => setName('lastName', event.currentTarget.value)}
                />
              </Field>
              <Field
                className="employee-identity-birthdate"
                icon={<CalendarDays />}
                label={t('fields.birthDate')}
                required
                {...fieldProps('birthDate')}
              >
                <DateInput
                  required
                  {...inputProps('birthDate')}
                  ariaLabel={t('fields.birthDate')}
                  value={draft.birthDate}
                  onChange={(value) => set('birthDate', value)}
                />
              </Field>
              <Field
                className={[
                  'employee-identity-email',
                  workEmailShimmer && 'field-shimmer',
                ]
                  .filter(Boolean)
                  .join(' ')}
                icon={<Mail />}
                label={t('fields.workEmail')}
                hint={t('copy.workEmailHint')}
                required
                {...fieldProps('workEmail')}
              >
                <TextInput
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
                className="employee-identity-language"
                icon={<Languages />}
                label={t('fields.preferredLanguage')}
                hint={t('copy.preferredLanguageHint')}
              >
                <Select
                  aria-label={t('fields.preferredLanguage')}
                  value={draft.preferredLanguage}
                  onChange={(value) => value && set('preferredLanguage', value as Language)}
                  data={LANGUAGES.map((option) => ({ value: option, label: t(`language.${option}`) }))}
                  allowDeselect={false}
                  comboboxProps={comboboxProps}
                />
              </Field>
              <Field
                className="employee-identity-department"
                icon={<Building2 />}
                label={t('fields.department')}
                required
                {...fieldProps('departmentId')}
              >
                <Select
                  required
                  {...inputProps('departmentId')}
                  aria-label={t('fields.department')}
                  placeholder={t('fields.select')}
                  value={draft.departmentId || null}
                  onChange={(value) => set('departmentId', value ?? '')}
                  data={departments.map((department) => ({ value: department.id, label: department.name }))}
                  searchable
                  clearable
                  openOnFocus
                  nothingFoundMessage={t('copy.noOptionsFound')}
                  comboboxProps={comboboxProps}
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
            <div className="form-grid employee-employment-grid">
              <Field label={t('fields.status')}>
                <Select
                  aria-label={t('fields.status')}
                  value={draft.status}
                  onChange={(value) => value && setStatus(value as EmployeeStatus)}
                  data={EMPLOYEE_STATUSES.map((option) => ({ value: option, label: t(`status.${option}`) }))}
                  searchable
                  openOnFocus
                  allowDeselect={false}
                  nothingFoundMessage={t('copy.noOptionsFound')}
                  comboboxProps={comboboxProps}
                />
              </Field>
              <Field
                icon={<CalendarDays />}
                label={t('fields.hireDate')}
                hint={t('copy.hireDateHint')}
                required={draft.status === 'ATTIVO'}
                {...fieldProps('hireDate')}
              >
                <DateInput
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
                  <DateInput
                    {...inputProps('terminationDate')}
                    ariaLabel={t('fields.terminationDate')}
                    value={draft.terminationDate}
                    onChange={(value) => set('terminationDate', value)}
                  />
                </Field>
              ) : null}
              <Field
                className="employee-field-compact"
                icon={<Gauge />}
                label={t('fields.fte')}
                hint={t('copy.fteHint')}
                required
                {...fieldProps('fte')}
              >
                <TextInput
                  required
                  inputMode="decimal"
                  {...inputProps('fte')}
                  aria-label={t('fields.fte')}
                  value={draft.fte}
                  onChange={(event) => set('fte', event.currentTarget.value)}
                />
              </Field>
              <Field
                className="employee-retirement-field"
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
                <div className="retirement-control">
                  <DateInput
                    ariaLabel={t('fields.retirementDate')}
                    required={draft.retirementDateOverridden}
                    {...inputProps('retirementDate')}
                    disabled={!draft.retirementDateOverridden}
                    value={retirementDateValue}
                    onChange={(value) => set('retirementDate', value)}
                  />
                  <Switch
                    checked={draft.retirementDateOverridden}
                    onChange={(event) => toggleRetirementOverride(event.currentTarget.checked)}
                    label={t('actions.confirmRetirementDate')}
                    color="indigo"
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
            <div className="form-grid employee-classification-grid">
              <Field label={t('fields.contractType')}>
                <Select
                  aria-label={t('fields.contractType')}
                  value={draft.contractType}
                  onChange={(value) => value && set('contractType', value as ContractType)}
                  data={CONTRACT_TYPES.map((option) => ({ value: option, label: t(`contractType.${option}`) }))}
                  searchable
                  openOnFocus
                  allowDeselect={false}
                  nothingFoundMessage={t('copy.noOptionsFound')}
                  comboboxProps={comboboxProps}
                />
              </Field>
              {draft.contractType === 'CONTRATTO_USA' && (
                <Field label={t('fields.usaCategory')}>
                  <Select
                    aria-label={t('fields.usaCategory')}
                    value={draft.usaCategory}
                    onChange={(value) => value && set('usaCategory', value as UsaCategory)}
                    data={USA_CATEGORIES.map((option) => ({ value: option, label: t(`usaCategory.${option}`) }))}
                    searchable
                    openOnFocus
                    allowDeselect={false}
                    nothingFoundMessage={t('copy.noOptionsFound')}
                    comboboxProps={comboboxProps}
                  />
                </Field>
              )}
              {draft.contractType !== 'CONTRATTO_USA' && (
                <Field label={t('fields.tfr')}>
                  <Select
                    aria-label={t('fields.tfr')}
                    value={draft.tfr}
                    onChange={(value) => value && set('tfr', value as TfrOption)}
                    data={TFR_OPTIONS.map((option) => ({ value: option, label: t(`tfr.${option}`) }))}
                    searchable
                    openOnFocus
                    allowDeselect={false}
                    nothingFoundMessage={t('copy.noOptionsFound')}
                    comboboxProps={comboboxProps}
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
            <div className="form-grid employee-approval-grid">
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
            <div className="approval-switch approval-capabilities">
              <Switch
                checked={draft.canBeResponsible}
                onChange={(event) => set('canBeResponsible', event.currentTarget.checked)}
                label={t('fields.canBeResponsible')}
                color="indigo"
              />
              <Switch
                checked={draft.canBeSubstituteResponsible}
                onChange={(event) => set('canBeSubstituteResponsible', event.currentTarget.checked)}
                label={t('fields.canBeSubstituteResponsible')}
                color="indigo"
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
            <div className="weekday-grid">
              {WEEKDAY_KEYS.map((key) => (
                <Field
                  key={key}
                  label={t(`weekday.${key}`)}
                  required
                  {...fieldProps(`weekly.${key}`)}
                >
                  <TextInput
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
            <p className={showWeeklyWarning ? 'form-warning' : 'form-note'} data-field="weeklySchedule">
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
              <p className="field-error" role="alert">
                {errorFor('weeklySchedule')}
              </p>
            ) : null}
          </EmployeeFormSection>
        </div>

        <footer className="modal-footer employee-form-footer">
          <p className="modal-footer-note">
            <span aria-hidden="true">*</span> {t('copy.requiredFields')}
          </p>
          <div className="modal-actions">
            <Button variant="default" type="button" onClick={requestClose}>
            {t('actions.cancel')}
            </Button>
            {/* `filled` is Mantine's default, but stating it makes the element carry
                data-variant="filled" — which app.css needs to give this button the
                brand blue and drop shadow the rest of the app's primary buttons use. */}
            <Button variant="filled" type="submit" loading={isSaving} leftSection={<Save size={17} />}>
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
    openConfirmation({
      title: t('copy.confirmationTitle'),
      message: t('copy.confirmDeleteDepartment', { name: department.name }),
      confirmLabel: t('actions.delete'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: () => deleteDepartment.mutate(department),
    });
  };

  return (
    <section className="page-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.departments')}</p>
          <h2>{t('copy.departmentsSubtitle')}</h2>
        </div>
        <div className="action-row">
          <button className="button primary" type="button" onClick={() => setDraft(emptyDepartmentDraft)}>
            <Plus size={16} />
            {t('actions.createDepartment')}
          </button>
        </div>
      </div>
      <div className="data-surface">
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
                <td className="row-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setDraft({ id: department.id, name: department.name })}
                  >
                    {t('actions.edit')}
                  </button>
                  <Tooltip label={t('actions.delete')} withArrow position="left">
                    <button
                      className="icon-danger"
                      type="button"
                      onClick={() => confirmDeleteDepartment(department)}
                      disabled={deleteDepartment.isPending}
                      aria-label={t('actions.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {departments.isError ? (
          <QueryError error={departments.error} onRetry={() => void departments.refetch()} />
        ) : null}
        {!departments.isLoading && !departments.isError && departments.data?.length === 0 ? (
          <p className="empty-state">{t('copy.emptyDepartments')}</p>
        ) : null}
      </div>

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
    </section>
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
    openConfirmation({
      title: t('copy.confirmationTitle'),
      message: t('copy.discardChanges'),
      confirmLabel: t('actions.discard'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: onCancel,
    });
  }, [isDirty, onCancel, t]);

  const dialogRef = useModalDialog(requestClose);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        className="modal-dialog"
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
        <header className="modal-header">
          <div>
            <p className="eyebrow">{t('nav.departments')}</p>
            <h3>{draft.id ? draft.name : t('actions.createDepartment')}</h3>
          </div>
          <button className="modal-close" type="button" onClick={requestClose} aria-label={t('actions.close')}>
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <fieldset className="form-section">
            <legend>{t('sections.identity')}</legend>
            <div className="form-grid">
              <Field label={t('fields.department')} required name="name" error={nameError} full>
                <input
                  required
                  autoFocus
                  // Named explicitly: the wrapping label now also contains the
                  // required marker and the error text, which would otherwise be
                  // read out as part of this input's name.
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

        <footer className="modal-footer">
          <button className="button ghost" type="button" onClick={requestClose}>
            {t('actions.cancel')}
          </button>
          <button className="button primary" type="submit" disabled={isSaving}>
            <Save size={16} />
            {t('actions.save')}
          </button>
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
    <section className="page-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.import')}</p>
          <h2>{t('copy.importInstructions')}</h2>
        </div>
      </div>
      <form
        className="toolbar import-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          previewImport.mutate();
        }}
      >
        {/* A bare <input type="file"> renders the browser's own control, which
            says "Choose File / No file chosen" in the *browser's* language on an
            otherwise Italian page, and ignores the app's styling entirely. */}
        <FileInput
          className="import-file-input"
          aria-label={t('copy.excelFileLabel')}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          placeholder={t('copy.excelFilePlaceholder')}
          value={file}
          onChange={chooseFile}
          clearable
          leftSection={<Upload size={16} />}
        />
        <button className="button primary" type="submit" disabled={!file || previewImport.isPending}>
          <FileCheck2 size={16} />
          {t('actions.preview')}
        </button>
      </form>
      {preview ? (
        <div className="data-surface">
          <div className="table-topline">
            <strong>{t('copy.rowsCount', { count: preview.rows.length })}</strong>
            <button
              className="button primary"
              type="button"
              onClick={() => commitImport.mutate()}
              disabled={selectedRows.length === 0 || commitImport.isPending}
            >
              <ClipboardList size={16} />
              {t('actions.commit')}
            </button>
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
                <tr key={row.rowNumber} className={row.errors.length ? 'row-error' : undefined}>
                  <td>
                    <Checkbox
                      aria-label={`${t('fields.select')} ${row.rowNumber}`}
                      disabled={row.errors.length > 0}
                      checked={selectedRows.includes(row.rowNumber)}
                      onChange={(event) => {
                        setSelectedRows((current) =>
                          event.currentTarget.checked
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
        </div>
      ) : null}
    </section>
  );
}

function AuditPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const debouncedEmployeeNumber = useDebounced(employeeNumber);
  const audit = useQuery({
    queryKey: ['audit', debouncedEmployeeNumber],
    queryFn: () => api.auditLogs(debouncedEmployeeNumber || undefined),
  });

  return (
    <section className="page-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.audit')}</p>
          <h2>{t('audit.title')}</h2>
        </div>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} placeholder={t('fields.employeeNumber')} />
        </label>
      </div>
      <div className="data-surface">
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
              const changes = auditChanges(entry, t);
              const employee = auditEmployeeLabel(entry);
              return (
                <tr key={entry.id}>
                  <td>{formatTableDateTime(entry.createdAt)}</td>
                  <td>{entry.actorEmail ?? entry.actorSub}</td>
                  <td>
                    {employee ? (
                      <span className="audit-employee">
                        {employee.name ? <span>{employee.name}</span> : null}
                        {employee.number ? <span className="muted-text">{employee.number}</span> : null}
                      </span>
                    ) : (
                      <span className="muted-text">-</span>
                    )}
                  </td>
                  <td>{t(`entityType.${entry.entityType}`)}</td>
                  <td>{t(`auditAction.${entry.action}`)}</td>
                  <td>
                    {changes.length > 0 ? (
                      <div className="audit-changes">
                        {changes.map((change) => (
                          <div className="audit-change" key={change.key}>
                            <span className="audit-field">{change.label}</span>
                            <span className="audit-value" title={t('audit.oldValue')}>
                              {change.before}
                            </span>
                            <span className="audit-arrow">-&gt;</span>
                            <span className="audit-value" title={t('audit.newValue')}>
                              {change.after}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="muted-text">{t('audit.noFieldChanges')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {audit.isError ? <QueryError error={audit.error} onRetry={() => void audit.refetch()} /> : null}
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
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
   */
  const policyErrors = (): FieldErrors => {
    const errors: FieldErrors = {};
    const yearsValue = Number(years);
    const monthsValue = Number(months);
    if (!years.trim() || !Number.isInteger(yearsValue)) {
      errors['years'] = t('validation.required');
    } else if (yearsValue < RETIREMENT_YEARS_MIN || yearsValue > RETIREMENT_YEARS_MAX) {
      errors['years'] = t('validation.range', { min: RETIREMENT_YEARS_MIN, max: RETIREMENT_YEARS_MAX });
    }
    if (!months.trim() || !Number.isInteger(monthsValue)) {
      errors['months'] = t('validation.required');
    } else if (monthsValue < RETIREMENT_MONTHS_MIN || monthsValue > RETIREMENT_MONTHS_MAX) {
      errors['months'] = t('validation.range', { min: RETIREMENT_MONTHS_MIN, max: RETIREMENT_MONTHS_MAX });
    }
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
    <section className="page-grid settings-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.settings')}</p>
          <h2>{t('settings.title')}</h2>
        </div>
      </div>

      {settings.isError ? <QueryError error={settings.error} onRetry={() => void settings.refetch()} /> : null}
      {loaded?.malformed ? (
        <p className="form-warning" role="alert">
          {t('settings.corruptWarning')}
        </p>
      ) : null}

      <form
        className="settings-card"
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
          openConfirmation({
            title: t('copy.confirmationTitle'),
            message: t('settings.confirmRecalc', { years, months }),
            confirmLabel: t('actions.confirm'),
            cancelLabel: t('actions.cancel'),
            onConfirm: () => savePolicy.mutate(),
          });
        }}
      >
        <p className="settings-description">{t('settings.description')}</p>

        <div className="settings-fields">
          <Field label={t('settings.years')} required name="years" error={shownErrors['years']}>
            {/* Deliberately not type="number": that adds the browser's spinner
                arrows (styled differently in every browser) and makes a stray
                scroll-wheel silently change a value that recalculates every
                employee's retirement date. The range is enforced by
                `policyErrors`, in the operator's language. */}
            <input
              required
              type="text"
              inputMode="numeric"
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
            <input
              required
              type="text"
              inputMode="numeric"
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

        <p className="settings-meta">
          {loaded?.updatedAt
            ? `${t('settings.lastUpdated')}: ${formatTableDateTime(loaded.updatedAt)}`
            : t('settings.neverUpdated')}
        </p>
        <p className="settings-note">{t('settings.recalcNote')}</p>

        <div className="action-row">
          <button className="button primary" type="submit" disabled={savePolicy.isPending}>
            <Save size={16} />
            {t('actions.save')}
          </button>
        </div>
      </form>
    </section>
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

function employeeOptionLabel(option: EmployeeOption): string {
  return `${option.lastName} ${option.firstName} (${option.employeeNumber})`;
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
      className={['form-section', 'employee-form-section', errorCount > 0 && 'section-has-errors']
        .filter(Boolean)
        .join(' ')}
    >
      <legend className="visually-hidden">{title}</legend>
      <div className="employee-section-heading">
        <span className="employee-section-number" aria-hidden="true">
          {number}
        </span>
        <span className="employee-section-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        {/* Scrolling past a collapsed-looking section shouldn't hide the fact
            that something in it still needs attention. */}
        {errorCount > 0 ? (
          <span className="section-error-badge">
            <TriangleAlert size={13} aria-hidden="true" />
            {t('validation.sectionErrors', { count: errorCount })}
          </span>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}

function EmployeeMultiSelect({
  label,
  options,
  labelOptions,
  value,
  onChange,
  error,
}: {
  label: string;
  /** Selectable options for the dropdown (already filtered for eligibility). */
  options: EmployeeOption[];
  /** Broader pool used only to label already-selected chips (e.g. an approver
   * who has since lost eligibility and is no longer in `options`). */
  labelOptions: EmployeeOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Draws the red border; the message lives on the surrounding Field. */
  error?: boolean;
}) {
  const { t } = useTranslation();
  const labelById = new Map(labelOptions.map((option) => [option.id, option]));
  const data = options.map((option) => ({ value: option.id, label: employeeOptionLabel(option) }));

  // Preserve selected values that are no longer eligible so they remain visible
  // and removable. Once removed, they disappear from the available data and
  // cannot be selected again.
  const ineligibleIds = new Set<string>();
  value.forEach((id) => {
    if (data.some((option) => option.value === id)) return;
    const option = labelById.get(id);
    ineligibleIds.add(id);
    data.push({
      value: id,
      label: option ? employeeOptionLabel(option) : t('copy.ineligibleApprover'),
    });
  });

  return (
    <MultiSelect
      className="employee-multi-select"
      aria-label={label}
      error={error ?? false}
      placeholder={t('actions.addApprover')}
      value={value}
      onChange={onChange}
      data={data}
      searchable
      clearable
      openOnFocus
      hidePickedOptions
      nothingFoundMessage={t('copy.noOptionsFound')}
      comboboxProps={{ withinPortal: true, zIndex: 1200, transitionProps: { transition: 'pop', duration: 120 } }}
      renderPill={({ option, onRemove }) => (
        <Pill
          // Approvers kept only because they are already assigned read as a
          // problem to fix, not as a normal selection.
          className={ineligibleIds.has(String(option.value)) ? 'employee-pill-invalid' : undefined}
          withRemoveButton
          onRemove={() => onRemove?.()}
          removeButtonProps={{
            'aria-label': `${t('actions.remove')} ${option.label}`,
            'aria-hidden': false,
          }}
        >
          {option.label}
        </Pill>
      )}
    />
  );
}

const DATE_INPUT_DISPLAY_FORMAT = 'DD MMMM YYYY';

/** Day-first formats only — never fall back to browser Date (US month-first). */
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

function parseEmployeeDateInput(input: string, locale: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const format of DATE_INPUT_PARSE_FORMATS) {
    const parsed = dayjs(trimmed, format, locale, true);
    if (parsed.isValid()) return parsed.format('YYYY-MM-DD');
  }

  return null;
}

function DateInput({
  ariaLabel,
  value,
  onChange,
  required,
  disabled,
  error,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Draws the red border. The message itself lives on the surrounding Field. */
  error?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'it';

  return (
    <MantineDateInput
      aria-label={ariaLabel}
      required={required ?? false}
      disabled={disabled ?? false}
      error={error ?? false}
      value={value || null}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      valueFormat={DATE_INPUT_DISPLAY_FORMAT}
      dateParser={(input) => parseEmployeeDateInput(input, locale)}
      placeholder={t('fields.datePlaceholder')}
      leftSection={<CalendarDays size={16} />}
      clearable={!disabled}
      // Keep clear via the X button, but don't clear when clicking the
      // already-selected day (e.g. after typing 01/12/2000 and confirming it).
      allowDeselect={false}
      popoverProps={{
        withinPortal: true,
        zIndex: 1200,
        transitionProps: { transition: 'pop', duration: 120 },
      }}
    />
  );
}

function Field({
  label,
  icon,
  children,
  full,
  className,
  required,
  hint,
  error,
  name,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
  className?: string;
  required?: boolean;
  hint?: string;
  /** When set, the field is styled as invalid and shows this instead of the hint. */
  error?: string | undefined;
  /** Field key, so a failed save can scroll to and focus this input. */
  name?: string;
}) {
  return (
    <label
      className={['field', full && 'field-full', error && 'field-invalid', className]
        .filter(Boolean)
        .join(' ')}
      {...(name ? { 'data-field': name } : {})}
    >
      <span className="field-label">
        {icon ? (
          <span className="field-label-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label}
        {required ? (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      {children}
      {/* The error replaces the hint rather than stacking under it: with both
          visible the instruction and the complaint compete, and the row grows
          enough to push the next field out of view. `role="alert"` so a screen
          reader hears it when it appears after a rejected save; the id is what a
          native input's `aria-describedby` points at (Mantine's own inputs
          overwrite that attribute, so they rely on the alert instead). */}
      {error ? (
        <span className="field-error" role="alert" {...(name ? { id: fieldErrorId(name) } : {})}>
          <TriangleAlert size={13} aria-hidden="true" />
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export default function App() {
  return <Shell />;
}
