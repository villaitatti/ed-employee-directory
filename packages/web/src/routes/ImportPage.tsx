import { ClipboardList, FileCheck2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportPreview } from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useApi, useDepartments } from '../hooks.js';
import { FilePicker } from '../ui/FilePicker.js';
import { notifyError, notifySuccess, notifyValidation } from '../ui/feedback.js';
import { DataSurface, PageHeading, PageSection } from '../ui/layout.js';

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
