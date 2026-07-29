import { Download, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import type { Translate } from '../i18n/types.js';
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
  StatusPill,
  Toolbar,
} from '../ui/layout.js';
import { EmployeeForm } from './EmployeeForm.js';

function approvalSummary(employee: Employee, t: Translate): string {
  if (employee.status !== 'ATTIVO') return '-';
  const responsabili = employee.approvalRoles.responsabili.length;
  const substitutes = employee.approvalRoles.substituteResponsabili.length;
  if (responsabili > 0 && substitutes > 0) return `R ${responsabili} / S ${substitutes}`;
  return t('copy.incompleteApproval');
}

export function EmployeesPage() {
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
