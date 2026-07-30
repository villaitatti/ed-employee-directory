import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Department, DepartmentEmployeeCounts, DepartmentMember } from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { employeeFullName } from '../employee-draft.js';
import { noServerErrors, type ServerErrors } from '../employee-validation.js';
import { formatDateTime, useDateLocale } from '../format.js';
import { useApi, useDepartments } from '../hooks.js';
import { ActionTooltip } from '../ui/ActionTooltip.js';
import { QueryError } from '../ui/QueryError.js';
import { useConfirmation } from '../ui/confirmation.js';
import { notifyError, notifySuccess } from '../ui/feedback.js';
import { DataSurface, EmptyState, PageHeading, PageSection, RecordCount, TableSkeleton } from '../ui/layout.js';
import { DepartmentForm, emptyDepartmentDraft, type DepartmentDraft } from './DepartmentForm.js';

/** Kept next to the header row it counts, so the skeleton can't drift out of step. */
const DEPARTMENT_COLUMN_COUNT = 4;

/**
 * How many people are in a department, and — on hover — which people.
 *
 * The names are the point. A hover that restated the number it was covering ("3"
 * → "Attivo 3") told the operator nothing they had not just read; "who is in
 * Amministrazione?" is the actual question a headcount raises, and answering it
 * used to mean going to the directory and filtering by department.
 *
 * Ordered by surname, written forename-first — the convention everywhere in this
 * app. Status is tagged only on the people who are not Attivo: on a list that is
 * mostly current staff, marking every ordinary row "Attivo" is noise, while a
 * name that is *not* current is exactly what needs saying.
 *
 * The list is also rendered `sr-only` in the cell. A tooltip is reachable by
 * pointer and by keyboard focus, but neither is a thing a screen reader user does
 * to a table cell while reading down a column, so the detail is in the cell's text
 * rather than only in the popup.
 */
function DepartmentHeadcount({
  counts,
  employees,
}: {
  counts: DepartmentEmployeeCounts;
  employees: DepartmentMember[];
}) {
  const { t } = useTranslation();

  if (counts.total === 0) {
    return <span className="text-ink-muted">{t('copy.departmentEmployeesEmpty')}</span>;
  }

  /** A name, plus the status when it is not the unremarkable one. */
  const describe = (employee: DepartmentMember) =>
    employee.status === 'ATTIVO'
      ? employeeFullName(employee)
      : `${employeeFullName(employee)} (${t(`status.${employee.status}`)})`;

  // A tooltip is not a table. Past a dozen names the popup becomes taller than the
  // row it belongs to, so the tail is summarised and the directory — which filters
  // by department — is the place to read the whole list.
  const shown = employees.slice(0, DEPARTMENT_MEMBERS_SHOWN);
  const hidden = employees.length - shown.length;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // A span rather than a button: it triggers nothing, and a button that
          // does nothing when pressed is a worse promise than a focusable label.
          <span tabIndex={0} className="cursor-help tabular-nums underline decoration-dotted underline-offset-4">
            {counts.total}
            <span className="sr-only">
              {' — '}
              {shown.map(describe).join(', ')}
              {hidden > 0 ? `, ${t('copy.departmentMembersMore', { count: hidden })}` : ''}
            </span>
          </span>
        }
      />
      {/* Above, not beside: the column is narrow, so a right-hand popup covers both
          the number it explains and the neighbouring cell. */}
      <TooltipContent side="top" className="items-stretch">
        <span className="grid gap-0.5 text-left">
          {shown.map((employee) => (
            <span key={employee.id}>{describe(employee)}</span>
          ))}
          {hidden > 0 ? (
            <span className="opacity-70">{t('copy.departmentMembersMore', { count: hidden })}</span>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Enough to recognise a department by; the directory is where the full list lives. */
const DEPARTMENT_MEMBERS_SHOWN = 12;

export function DepartmentsPage() {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const dateLocale = useDateLocale();
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
      title: t('copy.confirmDeleteDepartmentTitle', { name: department.name }),
      message: t('copy.confirmDeleteDepartment'),
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
      <RecordCount
        isLoading={departments.isLoading}
        total={t('copy.departmentCount', { count: departments.data?.length ?? 0 })}
      />

      <DataSurface>
        <table>
          <thead>
            <tr>
              <th>{t('fields.department')}</th>
              <th>{t('copy.departmentEmployees')}</th>
              <th>{t('fields.updated')}</th>
              <th aria-label={t('fields.actions')} />
            </tr>
          </thead>
          {departments.isLoading ? (
            <TableSkeleton columns={DEPARTMENT_COLUMN_COUNT} label={t('copy.loadingDepartments')} />
          ) : (
          <tbody>
            {departments.data?.map((department) => (
              <tr key={department.id}>
                <td>{department.name}</td>
                <td>
                  <DepartmentHeadcount counts={department.employeeCounts} employees={department.employees} />
                </td>
                <td>{formatDateTime(department.updatedAt, dateLocale)}</td>
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
          )}
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
