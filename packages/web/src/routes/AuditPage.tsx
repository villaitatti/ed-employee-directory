import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { WEEKDAY_KEYS, type AuditLog } from '@itatti/shared';
import { employeeFullName } from '../employee-draft.js';
import { formatDate, formatDateTime, useDateLocale } from '../format.js';
import { useApi, useDebounced } from '../hooks.js';
import type { Translate } from '../i18n/types.js';
import { QueryError } from '../ui/QueryError.js';
import {
  DataSurface,
  EmptyState,
  PageHeading,
  PageSection,
  SearchField,
  TableSkeleton,
  Toolbar,
} from '../ui/layout.js';

/** Kept next to the header row it counts, so the skeleton can't drift out of step. */
const AUDIT_COLUMN_COUNT = 5;

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
  approvalRoles: 'sections.approvers',
  retirementPolicy: 'settings.title',
  // Consequences the server records alongside a change, not fields anyone typed.
  recalculatedEmployees: 'audit.recalculatedEmployees',
  committedRows: 'audit.committedRows',
};

/**
 * Plumbing, not decisions. `normalizedName` is the slug the uniqueness check
 * compares on, and nobody chose it — showing "biblioteca -> giardini" underneath
 * the rename the operator actually made is noise that reads like a second change.
 */
const auditIgnoredFields = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'department',
  'normalizedName',
]);
const dateFields = new Set(['birthDate', 'hireDate', 'terminationDate', 'retirementDate']);

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
  // "(vuoto)" rather than a dash: a hyphen in a before-column could be a value.
  if (value === null || value === undefined || value === '') return t('audit.emptyValue');
  if (dateFields.has(key) && typeof value === 'string') return formatDate(value, locale);
  if (key === 'status' && typeof value === 'string') return t(`status.${value}`);
  if (key === 'contractType' && typeof value === 'string') return t(`contractType.${value}`);
  if (key === 'usaCategory' && typeof value === 'string') return t(`usaCategory.${value}`);
  if (key === 'tfr' && typeof value === 'string') return t(`tfr.${value}`);
  if (key === 'preferredLanguage' && typeof value === 'string') return t(`language.${value}`);
  if (key === 'retirementPolicy' && isRecord(value)) {
    // Was "67y 3m", which is a developer's shorthand for a legal threshold.
    return t('audit.retirementPolicyValue', { years: value.years ?? 0, months: value.months ?? 0 });
  }
  // Sì/No, not true/false. Nobody outside a codebase reads a boolean.
  if (typeof value === 'boolean') return t(value ? 'copy.yes' : 'copy.no');
  // Anything still an object here is a shape nobody taught this page to read. It
  // is better to say so than to print its JSON at an operator — the object-valued
  // fields that actually occur (approvers, the weekly schedule) are expanded into
  // their own rows before they reach this function.
  if (typeof value === 'object') return t('audit.unreadableValue');
  return String(value);
}

/** Names in an approver list — "Susan Bates (110)", comma-joined — or "(nessuno)". */
function formatApproverList(value: unknown, t: Translate): string {
  if (!Array.isArray(value) || value.length === 0) return t('audit.noneValue');
  return value
    .map((entry) => {
      if (!isRecord(entry)) return '';
      const name = employeeFullName(entry as { firstName?: string; lastName?: string });
      // The matricola is what tells two people with one name apart. Without it,
      // swapping a Responsabile for a namesake formats to the same text on both
      // sides, and the role filter below reports the change as no change at all.
      const number = typeof entry.employeeNumber === 'number' ? `(${entry.employeeNumber})` : '';
      return [name, number].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

type AuditChange = { key: string; label: string; before: string; after: string };

/**
 * The approver change, as three plain rows rather than one JSON blob.
 *
 * This is the field that made the page unreadable: `approvalRoles` is a nested
 * object, so the generic formatter stringified it, and a change of one
 * Responsabile printed six hundred characters of database ids, department records
 * and normalized slugs. What an operator needs is "Responsabile: (nessuno) ->
 * Susan Bates", one line per role, and only for the roles that moved.
 */
function approvalRoleChanges(before: unknown, after: unknown, t: Translate): AuditChange[] {
  const roles = [
    { key: 'responsabili', label: 'fields.responsabili' },
    { key: 'substituteResponsabili', label: 'fields.substituteResponsabili' },
    { key: 'preApprovers', label: 'fields.preApprovers' },
  ];
  const beforeRoles = isRecord(before) ? before : {};
  const afterRoles = isRecord(after) ? after : {};

  return roles
    .map((role) => ({
      key: `approvalRoles.${role.key}`,
      label: t(role.label),
      before: formatApproverList(beforeRoles[role.key], t),
      after: formatApproverList(afterRoles[role.key], t),
    }))
    // Sound only because the formatted text carries the matricola: names alone
    // can compare equal across two different people.
    .filter((change) => change.before !== change.after);
}

/**
 * The weekly schedule, as one row per weekday that moved.
 *
 * Same problem as the approvers: the serialized schedule is an object of objects,
 * so it used to arrive as JSON. Naming the day and showing the sessantesimi is
 * what the operator typed in the first place.
 */
function weeklyScheduleChanges(before: unknown, after: unknown, t: Translate): AuditChange[] {
  const beforeDays = isRecord(before) ? before : {};
  const afterDays = isRecord(after) ? after : {};
  const display = (day: unknown) => (isRecord(day) && typeof day.display === 'string' ? day.display : '');

  return WEEKDAY_KEYS.map((day) => ({
    key: `weeklySchedule.${day}`,
    label: t(`weekdayFull.${day}`),
    before: display(beforeDays[day]) || t('audit.emptyValue'),
    after: display(afterDays[day]) || t('audit.emptyValue'),
  })).filter((change) => change.before !== change.after);
}

function auditFieldLabel(key: string, t: Translate): string {
  return t(auditFieldTranslationKeys[key] ?? key);
}

function auditChanges(entry: AuditLog, t: Translate, locale: string): AuditChange[] {
  if (entry.action !== 'UPDATE' || !isRecord(entry.before) || !isRecord(entry.after)) return [];
  const before = entry.before as Record<string, unknown>;
  const after = entry.after as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  return [...keys]
    .filter((key) => !auditIgnoredFields.has(key))
    .map((key) => ({
      key,
      before: comparableAuditValue(key, before),
      after: comparableAuditValue(key, after),
    }))
    .filter((change) => JSON.stringify(change.before) !== JSON.stringify(change.after))
    .flatMap((change): AuditChange[] => {
      // The two nested fields get expanded into a row each rather than serialized.
      if (change.key === 'approvalRoles') return approvalRoleChanges(change.before, change.after, t);
      if (change.key === 'weeklySchedule') return weeklyScheduleChanges(change.before, change.after, t);
      return [
        {
          key: change.key,
          label: auditFieldLabel(change.key, t),
          before: formatAuditValue(change.key, change.before, t, locale),
          after: formatAuditValue(change.key, change.after, t, locale),
        },
      ];
    });
}

/**
 * What a row means when there is no before-and-after to show.
 *
 * A creation used to report "Nessuna modifica ai campi" — no field changes — which
 * is the opposite of what happened: every field was set. A deletion said the same.
 * Saying plainly what the operation was beats a diff that does not apply.
 */
function auditSummary(entry: AuditLog, t: Translate): string {
  if (entry.action === 'CREATE') return t('audit.summaryCreated');
  if (entry.action === 'DELETE') return t('audit.summaryDeleted');
  if (entry.action === 'IMPORT_COMMIT') {
    const rows = isRecord(entry.after) && typeof entry.after.committedRows === 'number' ? entry.after.committedRows : 0;
    return t('audit.summaryImported', { count: rows });
  }
  // An UPDATE that changed nothing an operator can see — a re-save of the same
  // values, or a field this page deliberately ignores.
  return t('audit.noFieldChanges');
}

/**
 * What the row is about, in one column.
 *
 * This replaces an "Entità" column — a word out of a data model, not an office —
 * sitting next to a "Dipendente" column that was a dash for every row that was not
 * about an employee. A rename of the Biblioteca department therefore said
 * "Dipartimento" and never said *which*. Now the kind of record labels the name of
 * the record, and every row names its subject.
 */
function auditSubject(entry: AuditLog, t: Translate): { kind: string; name: string; detail: string } {
  const snapshot = isRecord(entry.after) ? entry.after : isRecord(entry.before) ? entry.before : null;
  const kind = t(`entityType.${entry.entityType}`);

  if (entry.entityType === 'EMPLOYEE') {
    const firstName = typeof snapshot?.firstName === 'string' ? snapshot.firstName : '';
    const lastName = typeof snapshot?.lastName === 'string' ? snapshot.lastName : '';
    const number =
      typeof entry.employeeNumber === 'number'
        ? entry.employeeNumber
        : typeof snapshot?.employeeNumber === 'number'
          ? snapshot.employeeNumber
          : null;
    return {
      kind,
      name: employeeFullName({ firstName, lastName }),
      detail: number === null ? '' : t('audit.employeeNumberDetail', { number }),
    };
  }

  if (entry.entityType === 'DEPARTMENT') {
    return { kind, name: typeof snapshot?.name === 'string' ? snapshot.name : '', detail: '' };
  }

  // A setting has no name of its own, so the thing it governs is the name.
  if (entry.entityType === 'SETTING') return { kind, name: t('settings.title'), detail: '' };

  return { kind, name: '', detail: '' };
}

export function AuditPage() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const api = useApi();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const audit = useQuery({
    queryKey: ['audit', debouncedSearch],
    queryFn: () => api.auditLogs(debouncedSearch || undefined),
  });

  return (
    <PageSection>
      <PageHeading
        eyebrow={t('nav.audit')}
        title={t('audit.title')}
        // Somebody opening this page for the first time should not have to infer
        // what it is from the shape of the table.
        description={t('audit.description')}
      />
      <Toolbar>
        <SearchField
          value={search}
          onChange={setSearch}
          // A name is what an operator has in mind — "what happened to Susan?" —
          // and this box used to take a matricola and nothing else.
          placeholder={t('audit.searchPlaceholder')}
        />
      </Toolbar>
      <DataSurface>
        <table>
          <thead>
            <tr>
              <th>{t('audit.when')}</th>
              <th>{t('audit.who')}</th>
              <th>{t('audit.what')}</th>
              <th>{t('audit.action')}</th>
              <th>{t('audit.changes')}</th>
            </tr>
          </thead>
          {audit.isLoading ? (
            <TableSkeleton columns={AUDIT_COLUMN_COUNT} label={t('copy.loadingAudit')} />
          ) : (
          <tbody>
            {audit.data?.map((entry) => {
              const changes = auditChanges(entry, t, dateLocale);
              const subject = auditSubject(entry, t);
              return (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap">{formatDateTime(entry.createdAt, dateLocale)}</td>
                  <td className="[overflow-wrap:anywhere]">{entry.actorEmail ?? entry.actorSub}</td>
                  <td>
                    <span className="grid min-w-40 gap-[0.1rem]">
                      {/* The kind labels the name rather than occupying a column of
                          its own, so a department row finally says which one. */}
                      <span className="text-[0.7rem] font-bold tracking-wide text-ink-muted uppercase">
                        {subject.kind}
                      </span>
                      {subject.name ? <span>{subject.name}</span> : null}
                      {subject.detail ? <span className="text-ink-muted">{subject.detail}</span> : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{t(`auditAction.${entry.action}`)}</td>
                  <td>
                    {changes.length > 0 ? (
                      <div className="grid min-w-96 gap-2">
                        {changes.map((change) => (
                          <div
                            className="grid grid-cols-[minmax(8rem,12rem)_minmax(7rem,1fr)_auto_minmax(7rem,1fr)] items-start gap-2"
                            key={change.key}
                          >
                            <span className="font-extrabold text-ink-soft">{change.label}</span>
                            {/* Which side is which was a `title` tooltip, which
                                is browser-styled, slow, and — being hover-only —
                                said nothing to anyone not using a mouse. The
                                column order carries it visually; this carries it
                                everywhere else. */}
                            <span className="[overflow-wrap:anywhere] text-ink-muted line-through decoration-1">
                              <span className="sr-only">{t('audit.oldValue')}: </span>
                              {change.before}
                            </span>
                            <span className="font-extrabold text-ink-muted" aria-hidden="true">
                              →
                            </span>
                            <span className="[overflow-wrap:anywhere] font-semibold">
                              <span className="sr-only">{t('audit.newValue')}: </span>
                              {change.after}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-muted">{auditSummary(entry, t)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          )}
        </table>
        {audit.isError ? <QueryError error={audit.error} onRetry={() => void audit.refetch()} /> : null}
        {/* An empty table with no sentence in it reads as a page that broke.
            Worded from the debounced term — the one the rows actually answer —
            so a half-typed search is never blamed for an emptiness it hasn't
            caused yet. */}
        {!audit.isLoading && !audit.isError && audit.data?.length === 0 ? (
          <EmptyState>
            {t(debouncedSearch ? 'audit.emptyForSearch' : 'audit.empty', { search: debouncedSearch })}
          </EmptyState>
        ) : null}
      </DataSurface>
    </PageSection>
  );
}
