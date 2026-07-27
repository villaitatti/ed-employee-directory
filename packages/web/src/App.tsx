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
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { ActionIcon, Button, Checkbox, MultiSelect, Pill, Select, Switch, Text, TextInput } from '@mantine/core';
import { DateInput as MantineDateInput } from '@mantine/dates';
import { modals, useModals } from '@mantine/modals';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import {
  CONTRACT_TYPES,
  DEFAULT_RETIREMENT_POLICY,
  DEFAULT_WEEKLY_SCHEDULE_MINUTES,
  EMPLOYEE_STATUSES,
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
  type TfrOption,
  type UsaCategory,
  type WeekdayKey,
} from '@itatti/shared';
import { createApiClient } from './api/client.js';
import { useEdAuth, wasSignedOut } from './auth/AuthProvider.js';
import './styles/app.css';

type Translate = (key: string) => string;

export type EmployeeDraft = {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
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
  const message = error instanceof Error && error.message ? error.message : t('copy.loadError');
  return (
    <div className="data-error" role="alert">
      <span>{message}</span>
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
      <Toaster richColors position="top-right" />
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
            <button className="icon-button" type="button" onClick={toggleLanguage} title={t('actions.language')}>
              <Languages size={18} />
              <span>{i18n.language.toUpperCase()}</span>
            </button>
            <button className="icon-button" type="button" onClick={auth.logout} title={t('actions.signOut')}>
              <LogOut size={18} />
            </button>
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
      const weeklySchedule = parseDraftWeeklySchedule(input.weeklySchedule);
      if (!weeklySchedule) throw new Error(t('copy.invalidWeeklySchedule'));
      const payload = {
        employeeNumber: Number(input.employeeNumber),
        firstName: input.firstName,
        lastName: input.lastName,
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
    onSuccess: () => {
      setDraft(null);
      toast.success(t('copy.saved'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
  });

  const deleteEmployee = useMutation({
    mutationFn: api.deleteEmployee,
    onSuccess: () => {
      toast.success(t('copy.deleted'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
  });

  const confirmDeleteEmployee = (employee: Employee) => {
    if (deleteEmployee.isPending) return;
    openConfirmation({
      title: t('copy.confirmationTitle'),
      message: t('copy.confirmDeleteEmployee'),
      confirmLabel: t('actions.delete'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: () => deleteEmployee.mutate(employee.id),
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('copy.error'));
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
                  <button
                    className="icon-danger"
                    type="button"
                    onClick={() => confirmDeleteEmployee(employee)}
                    disabled={deleteEmployee.isPending}
                    title={t('actions.delete')}
                    aria-label={t('actions.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
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
          onCancel={() => setDraft(null)}
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
  onCancel,
  onChange,
  onSave,
  isSaving,
}: {
  draft: EmployeeDraft;
  departments: Department[];
  employeeOptions: EmployeeOption[];
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

  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };
  const setWeeklySchedule = (key: WeekdayKey, value: string) => {
    onChange({ ...draft, weeklySchedule: { ...draft.weeklySchedule, [key]: value } });
  };
  const setApprovalRoleIds = (key: keyof EmployeeDraft['approvalRoleIds'], value: string[]) => {
    onChange({ ...draft, approvalRoleIds: { ...draft.approvalRoleIds, [key]: value } });
  };
  const setStatus = (status: EmployeeStatus) => {
    // New active employees have no cessation date yet — clear any leftover value
    // from briefly selecting Cessato during create.
    if (isCreate && status === 'ATTIVO') {
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
        message: t('copy.confirmUnconfirmRetirement'),
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
  const responsabileRequired = draft.status === 'ATTIVO' && responsabileOptions.length > 0;
  const missingResponsabile = responsabileRequired && draft.approvalRoleIds.responsabileIds.length === 0;
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
        onSubmit={(event) => {
          event.preventDefault();
          // The Responsabile field renders its own inline requirement hint; block
          // the save so the server's RESPONSABILE_REQUIRED rule can't reject it.
          if (missingResponsabile) {
            toast.error(t('copy.responsabileRequired'));
            return;
          }
          onSave();
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
          <EmployeeFormSection
            number="01"
            icon={<ContactRound />}
            title={t('sections.identity')}
            description={t('copy.identitySectionHint')}
          >
            <div className="form-grid employee-identity-grid">
              <Field
                className="employee-field-compact"
                icon={<Hash />}
                label={t('fields.employeeNumber')}
                required
              >
                <TextInput
                  required
                  autoFocus
                  data-autofocus
                  inputMode="numeric"
                  aria-label={t('fields.employeeNumber')}
                  value={draft.employeeNumber}
                  onChange={(event) => set('employeeNumber', event.currentTarget.value)}
                />
              </Field>
              <Field icon={<Building2 />} label={t('fields.department')} required>
                <Select
                  required
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
              <Field icon={<UserRound />} label={t('fields.firstName')} required>
                <TextInput
                  required
                  aria-label={t('fields.firstName')}
                  value={draft.firstName}
                  onChange={(event) => set('firstName', event.currentTarget.value)}
                />
              </Field>
              <Field icon={<UserRound />} label={t('fields.lastName')} required>
                <TextInput
                  required
                  aria-label={t('fields.lastName')}
                  value={draft.lastName}
                  onChange={(event) => set('lastName', event.currentTarget.value)}
                />
              </Field>
              <Field icon={<CalendarDays />} label={t('fields.birthDate')} required>
                <DateInput
                  required
                  ariaLabel={t('fields.birthDate')}
                  value={draft.birthDate}
                  onChange={(value) => set('birthDate', value)}
                />
              </Field>
            </div>
          </EmployeeFormSection>

          <EmployeeFormSection
            number="02"
            icon={<BriefcaseBusiness />}
            title={t('sections.employment')}
            description={t('copy.employmentSectionHint')}
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
              <Field icon={<CalendarDays />} label={t('fields.hireDate')}>
                <DateInput
                  ariaLabel={t('fields.hireDate')}
                  value={draft.hireDate}
                  onChange={(value) => set('hireDate', value)}
                />
              </Field>
              {showTerminationDate ? (
                <Field icon={<CalendarDays />} label={t('fields.terminationDate')}>
                  <DateInput
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
              >
                <TextInput
                  required
                  inputMode="decimal"
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
              >
                <div className="retirement-control">
                  <DateInput
                    ariaLabel={t('fields.retirementDate')}
                    required={draft.retirementDateOverridden}
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
                {...(missingResponsabile ? { hint: t('copy.responsabileRequired') } : {})}
              >
                <EmployeeMultiSelect
                  label={t('fields.responsabili')}
                  options={responsabileOptions}
                  labelOptions={employeeOptions}
                  value={draft.approvalRoleIds.responsabileIds}
                  onChange={(value) => setApprovalRoleIds('responsabileIds', value)}
                />
              </Field>
              <Field label={t('fields.substituteResponsabili')}>
                <EmployeeMultiSelect
                  label={t('fields.substituteResponsabili')}
                  options={substituteOptions}
                  labelOptions={employeeOptions}
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
          >
            <div className="weekday-grid">
              {WEEKDAY_KEYS.map((key) => (
                <Field key={key} label={t(`weekday.${key}`)} required>
                  <TextInput
                    required
                    inputMode="decimal"
                    aria-label={t(`weekday.${key}`)}
                    value={draft.weeklySchedule[key]}
                    onChange={(event) => setWeeklySchedule(key, event.currentTarget.value)}
                  />
                </Field>
              ))}
            </div>
            <p className={showWeeklyWarning ? 'form-warning' : 'form-note'}>
              {weeklyTotal === null
                ? t('copy.invalidWeeklySchedule')
                : showWeeklyWarning && expectedWeeklyMinutes !== null
                  ? t('copy.weeklyScheduleMismatch', {
                      total: formatSessantesimiMinutes(weeklyTotal),
                      expected: formatSessantesimiMinutes(expectedWeeklyMinutes),
                    })
                  : t('copy.weeklyScheduleTotal', { total: formatSessantesimiMinutes(weeklyTotal) })}
            </p>
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
            <Button type="submit" loading={isSaving} leftSection={<Save size={17} />}>
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
  const saveDepartment = useMutation({
    mutationFn: async (input: DepartmentDraft) =>
      input.id ? api.updateDepartment(input.id, { name: input.name }) : api.createDepartment({ name: input.name }),
    onSuccess: () => {
      setDraft(null);
      toast.success(t('copy.saved'));
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
  });
  const deleteDepartment = useMutation({
    mutationFn: api.deleteDepartment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(t('copy.deleted'));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
  });

  const confirmDeleteDepartment = (department: Department) => {
    if (deleteDepartment.isPending) return;
    openConfirmation({
      title: t('copy.confirmationTitle'),
      message: t('copy.confirmDeleteDepartment'),
      confirmLabel: t('actions.delete'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: () => deleteDepartment.mutate(department.id),
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
                  <button
                    className="icon-danger"
                    type="button"
                    onClick={() => confirmDeleteDepartment(department)}
                    disabled={deleteDepartment.isPending}
                    title={t('actions.delete')}
                    aria-label={t('actions.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
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
          onCancel={() => setDraft(null)}
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
  onCancel,
  onChange,
  onSave,
  isSaving,
}: {
  draft: DepartmentDraft;
  onCancel: () => void;
  onChange: (draft: DepartmentDraft) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();

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
        onSubmit={(event) => {
          event.preventDefault();
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
              <Field label={t('fields.department')} full>
                <input
                  required
                  autoFocus
                  value={draft.name}
                  onChange={(e) => onChange({ ...draft, name: e.target.value })}
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

function ImportPage() {
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
      if (!file) throw new Error(t('copy.excelFileRequired'));
      return api.previewImport(file);
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedRows(data.rows.filter((row) => row.selected).map((row) => row.rowNumber));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
  });
  const commitImport = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error(t('copy.previewRequired'));
      return api.commitImport(preview.batchId, selectedRows);
    },
    onSuccess: (result) => {
      toast.success(t('copy.rowsCommitted', { count: result.data.committed.length }));
      setPreview(null);
      setSelectedRows([]);
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
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
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
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

  const loaded = settings.data;

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
      toast.success(t('settings.recalcDone', { count: result.recalculatedEmployees }));
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('copy.error')),
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
        onSubmit={(event) => {
          event.preventDefault();
          // Table-wide write: confirm before recalculating every non-confirmed
          // employee's projected retirement date.
          openConfirmation({
            title: t('copy.confirmationTitle'),
            message: t('settings.confirmRecalc'),
            confirmLabel: t('actions.confirm'),
            cancelLabel: t('actions.cancel'),
            onConfirm: () => savePolicy.mutate(),
          });
        }}
      >
        <p className="settings-description">{t('settings.description')}</p>

        <div className="settings-fields">
          <Field label={t('settings.years')}>
            <input
              required
              type="number"
              inputMode="numeric"
              min={RETIREMENT_YEARS_MIN}
              max={RETIREMENT_YEARS_MAX}
              value={years}
              onChange={(e) => {
                setEdited(true);
                setYears(e.target.value);
              }}
            />
          </Field>
          <Field label={t('settings.months')}>
            <input
              required
              type="number"
              inputMode="numeric"
              min={RETIREMENT_MONTHS_MIN}
              max={RETIREMENT_MONTHS_MAX}
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
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="form-section employee-form-section">
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
}: {
  label: string;
  /** Selectable options for the dropdown (already filtered for eligibility). */
  options: EmployeeOption[];
  /** Broader pool used only to label already-selected chips (e.g. an approver
   * who has since lost eligibility and is no longer in `options`). */
  labelOptions: EmployeeOption[];
  value: string[];
  onChange: (value: string[]) => void;
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
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'it';

  return (
    <MantineDateInput
      aria-label={ariaLabel}
      required={required ?? false}
      disabled={disabled ?? false}
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
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
  className?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className={['field', full && 'field-full', className].filter(Boolean).join(' ')}>
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
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export default function App() {
  return <Shell />;
}
