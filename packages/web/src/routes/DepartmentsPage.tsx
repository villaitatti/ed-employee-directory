import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Department } from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { noServerErrors, type ServerErrors } from '../employee-validation.js';
import { formatDateTime, useDateLocale } from '../format.js';
import { useApi, useDepartments } from '../hooks.js';
import { ActionTooltip } from '../ui/ActionTooltip.js';
import { QueryError } from '../ui/QueryError.js';
import { useConfirmation } from '../ui/confirmation.js';
import { notifyError, notifySuccess } from '../ui/feedback.js';
import { DataSurface, EmptyState, PageHeading, PageSection } from '../ui/layout.js';
import { DepartmentForm, emptyDepartmentDraft, type DepartmentDraft } from './DepartmentForm.js';

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
