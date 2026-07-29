import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { AuditLog } from '@itatti/shared';
import { formatDate, formatDateTime, useDateLocale } from '../format.js';
import { useApi, useDebounced } from '../hooks.js';
import type { Translate } from '../i18n/types.js';
import { QueryError } from '../ui/QueryError.js';
import { DataSurface, PageHeading, PageSection, SearchField, Toolbar } from '../ui/layout.js';

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

export function AuditPage() {
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
                  <td>{formatDateTime(entry.createdAt, dateLocale)}</td>
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
                            {/* Which side is which was a `title` tooltip, which
                                is browser-styled, slow, and — being hover-only —
                                said nothing to anyone not using a mouse. The
                                column order carries it visually; this carries it
                                everywhere else. */}
                            <span className="[overflow-wrap:anywhere]">
                              <span className="sr-only">{t('audit.oldValue')}: </span>
                              {change.before}
                            </span>
                            <span className="font-extrabold text-ink-muted" aria-hidden="true">
                              -&gt;
                            </span>
                            <span className="[overflow-wrap:anywhere]">
                              <span className="sr-only">{t('audit.newValue')}: </span>
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
