import { Download, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EMPLOYEE_STATUSES, type Employee } from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { noServerErrors, type ServerErrors } from '../employee-validation.js';
import {
  emptyEmployeeDraft,
  employeeFullName,
  parseDraftWeeklySchedule,
  toEmployeeDraft,
  type EmployeeDraft,
} from '../employee-draft.js';
import { formatDate, useDateLocale } from '../format.js';
import { useApi, useDebounced, useDepartments } from '../hooks.js';
import { ApprovalWorkflow, hasIncompleteApproval } from '../ui/ApprovalWorkflow.js';
import { CheckboxField } from '../ui/CheckboxField.js';
import { ActionTooltip } from '../ui/ActionTooltip.js';
import { ComboboxField } from '../ui/ComboboxField.js';
import { QueryError } from '../ui/QueryError.js';
import { useConfirmation } from '../ui/confirmation.js';
import { notifyError, notifySuccess } from '../ui/feedback.js';
import {
  DataSurface,
  EmptyState,
  PageHeading,
  PageSection,
  SearchField,
  SortableHeader,
  StatusPill,
  Toolbar,
  type SortDirection,
} from '../ui/layout.js';
import { EmployeeForm } from './EmployeeForm.js';

/**
 * What each sortable column compares on, which is not always what it displays:
 * the weekly total sorts on minutes rather than "37,30", and the name sorts on
 * the surname even though it reads forename-first. Dates are `YYYY-MM-DD`, so
 * comparing them as text is comparing them as dates.
 */
const SORT_VALUES = {
  employeeNumber: (employee: Employee) => employee.employeeNumber,
  name: (employee: Employee) => `${employee.lastName} ${employee.firstName}`,
  department: (employee: Employee) => employee.department?.name ?? '',
  status: (employee: Employee) => employee.status,
  fte: (employee: Employee) => employee.fte,
  tfr: (employee: Employee) => employee.tfr,
  weeklyTotal: (employee: Employee) => employee.weeklySchedule.total.minutes,
  retirementDate: (employee: Employee) => employee.retirementDate,
} satisfies Record<string, (employee: Employee) => string | number>;

type SortKey = keyof typeof SORT_VALUES;

function compareEmployees(left: Employee, right: Employee, key: SortKey): number {
  const a = SORT_VALUES[key](left);
  const b = SORT_VALUES[key](right);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  // `localeCompare` so Àbate sorts next to Abate rather than after Zurlo.
  return String(a).localeCompare(String(b));
}

export function EmployeesPage() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const confirm = useConfirmation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ q: '', status: '', departmentId: '' });
  // Not a server filter like the other three: the workflow rule is about what is
  // *missing*, which the API has no query for, and every matching row is already
  // here to check.
  const [onlyIncompleteApproval, setOnlyIncompleteApproval] = useState(false);
  // Surname-ascending to begin with, which is the order the API returns and the
  // order a directory is read in. Sorting is done here rather than by the server
  // because the table already holds every matching row — `allEmployees` follows
  // the cursor to the end — so a round trip would only add latency.
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });
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

  const rows = useMemo(() => {
    const matching = (employees.data ?? []).filter(
      (employee) => !onlyIncompleteApproval || hasIncompleteApproval(employee)
    );
    const sorted = matching.sort((left, right) => compareEmployees(left, right, sort.key));
    return sort.direction === 'asc' ? sorted : sorted.reverse();
  }, [employees.data, sort, onlyIncompleteApproval]);

  /** Clicking the column you are already sorted by turns it around. */
  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  const sortableHeader = (key: SortKey, label: string) => (
    <SortableHeader
      label={label}
      sorted={sort.key === key}
      direction={sort.direction}
      onSort={() => sortBy(key)}
    />
  );

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
      // Name the record being destroyed, in the question itself: on a table of
      // similar rows, "delete this employee?" is not enough to catch a misclick
      // before it is irreversible.
      title: t('copy.confirmDeleteEmployeeTitle', { name: employeeFullName(employee) }),
      message: t('copy.confirmDeleteEmployee', { employeeNumber: employee.employeeNumber }),
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

      <Toolbar className="desktop:grid-cols-[minmax(14rem,1fr)_minmax(9rem,12rem)_minmax(10rem,15rem)_auto]">
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
        <CheckboxField
          label={t('fields.onlyIncompleteApproval')}
          checked={onlyIncompleteApproval}
          onCheckedChange={setOnlyIncompleteApproval}
        />
      </Toolbar>

      <DataSurface>
        <table>
          <thead>
            <tr>
              {sortableHeader('employeeNumber', t('fields.employeeNumber'))}
              {sortableHeader('name', t('fields.fullName'))}
              {sortableHeader('department', t('fields.department'))}
              {sortableHeader('status', t('fields.status'))}
              {sortableHeader('fte', t('fields.fte'))}
              {sortableHeader('tfr', t('fields.tfr'))}
              {sortableHeader('weeklyTotal', t('fields.weeklyTotal'))}
              {/* Not sortable: a column of names has no order worth asking for. */}
              <th>{t('fields.approvalWorkflow')}</th>
              {sortableHeader('retirementDate', t('fields.retirementDate'))}
              <th aria-label={t('fields.actions')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.employeeNumber}</td>
                <td>{employeeFullName(employee)}</td>
                <td>{employee.department?.name}</td>
                <td>
                  <StatusPill status={employee.status}>{t(`status.${employee.status}`)}</StatusPill>
                </td>
                <td>{employee.fte}</td>
                <td>{t(`tfr.${employee.tfr}`)}</td>
                <td>{employee.weeklySchedule.total.display}</td>
                <td>
                  <ApprovalWorkflow employee={employee} />
                </td>
                <td>
                  {employee.retirementDate ? (
                    <div className="grid gap-0.5">
                      <span>{formatDate(employee.retirementDate, dateLocale)}</span>
                      {/* A projected date moves when the birth date or the
                          retirement age does; a confirmed one was chosen and
                          stays. Same column, so the difference has to be on the
                          row rather than left to whoever opens the card. */}
                      <span className="text-[0.72rem] text-ink-muted">
                        {t(
                          employee.retirementDateOverridden
                            ? 'copy.retirementConfirmed'
                            : 'copy.retirementProjected'
                        )}
                      </span>
                    </div>
                  ) : null}
                </td>
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
        {/* Counted on the rows actually shown, not on what the API returned:
            the workflow filter narrows the list here, and a blank table with no
            explanation reads as a page that failed to load. */}
        {!employees.isLoading && !employees.isError && rows.length === 0 ? (
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
