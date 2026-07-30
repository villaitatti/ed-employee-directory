import { CircleAlert, Download, FileCheck2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportPreview, ImportPreviewRow } from '@itatti/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { employeeFullName } from '../employee-draft.js';
import { useApi, useDepartments } from '../hooks.js';
import { FilePicker } from '../ui/FilePicker.js';
import { notifyError, notifySuccess, notifyValidation } from './feedback.js';
import { DataSurface, StatusPill } from './layout.js';

/**
 * Importing employees from Excel, as a dialog rather than a page.
 *
 * It used to be a fifth entry in the sidebar called "Importa Excel", which said
 * neither what it imported nor that it imports *into* the directory — and it sat at
 * the same level as the four things this app is actually about. It belongs to the
 * employee list, so it opens from the employee list.
 *
 * Two steps, and the first one is the one that was missing: the operator is told
 * what the file has to look like and handed a workbook that already looks like it,
 * instead of being shown a file picker and left to guess. Nothing is written until
 * the preview is confirmed.
 */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSelectedRows([]);
  };

  // Discard any previous preview when the operator picks a different file, so
  // Commit can never submit the earlier file's batch.
  const chooseFile = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setSelectedRows([]);
  };

  const downloadTemplate = async () => {
    try {
      const blob = await api.importTemplateExcel();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ed-modello-dipendenti.xlsx';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      notifySuccess(t('import.templateDownloaded'), t('import.templateDownloadedBody'));
    } catch (error) {
      notifyError(error, t);
    }
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
      reset();
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => notifyError(error, t, { unsaved: true }),
  });

  const rowsWithErrors = preview?.rows.filter((row) => row.errors.length > 0).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Starting over rather than reopening onto a stale preview of a file the
        // operator may have since edited.
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100vh-3rem)] gap-5 overflow-y-auto sm:max-w-[min(96vw,72rem)]">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.description')}</DialogDescription>
        </DialogHeader>

        {/* Step one: what the file must look like, and a file that already does. */}
        <section className="grid gap-3 rounded-xl border border-line bg-surface-raised p-4">
          <h3 className="m-0 text-[0.95rem] font-bold text-ink">{t('import.step1Title')}</h3>
          <ol className="m-0 grid list-decimal gap-1 ps-5 text-[0.85rem] text-ink-soft">
            <li>{t('import.step1Download')}</li>
            <li>{t('import.step1Fill')}</li>
            <li>{t('import.step1Departments')}</li>
          </ol>
          <div>
            <Button type="button" variant="outline" className="text-brand" onClick={() => void downloadTemplate()}>
              <Download size={16} />
              {t('import.downloadTemplate')}
            </Button>
          </div>
        </section>

        {/* Step two: hand it back. */}
        <form
          className="grid gap-3 rounded-xl border border-line bg-surface-raised p-4"
          onSubmit={(event) => {
            event.preventDefault();
            previewImport.mutate();
          }}
        >
          <h3 className="m-0 text-[0.95rem] font-bold text-ink">{t('import.step2Title')}</h3>
          <p className="m-0 text-[0.85rem] text-ink-soft">{t('import.step2Hint')}</p>
          <div className="grid items-center gap-3 desktop:grid-cols-[minmax(16rem,1fr)_auto]">
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
          </div>
        </form>

        {preview ? (
          <section className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="m-0 text-[0.95rem] font-bold text-ink">{t('import.step3Title')}</h3>
              <p className="m-0 text-[0.82rem] text-ink-soft">
                {t('import.selectedCount', { count: selectedRows.length, total: preview.rows.length })}
              </p>
            </div>
            {rowsWithErrors > 0 ? (
              <p
                role="alert"
                className="m-0 flex items-start gap-2 rounded-lg border border-[color-mix(in_oklch,var(--danger),transparent_60%)] bg-[color-mix(in_oklch,var(--danger),var(--surface)_93%)] p-3 text-[0.84rem] font-semibold text-danger"
              >
                <CircleAlert size={17} className="mt-px shrink-0" aria-hidden="true" />
                {t('import.rowsWithErrors', { count: rowsWithErrors })}
              </p>
            ) : null}
            <DataSurface className="max-h-[22rem]">
              <table>
                <thead>
                  <tr>
                    <th aria-label={t('fields.select')} />
                    <th>{t('fields.row')}</th>
                    <th>{t('fields.employeeNumber')}</th>
                    <th>{t('fields.fullName')}</th>
                    <th>{t('fields.department')}</th>
                    <th>{t('import.outcome')}</th>
                    <th>{t('import.problem')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <ImportRow
                      key={row.rowNumber}
                      row={row}
                      departmentName={
                        row.normalized?.departmentId
                          ? departmentNameById.get(row.normalized.departmentId) ?? row.normalized.departmentId
                          : ''
                      }
                      checked={selectedRows.includes(row.rowNumber)}
                      onCheckedChange={(checked) =>
                        setSelectedRows((current) =>
                          checked
                            ? [...current, row.rowNumber]
                            : current.filter((rowNumber) => rowNumber !== row.rowNumber)
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </DataSurface>
          </section>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => commitImport.mutate()}
            // Disabled until there is something to write: with no preview there is
            // no batch, and with nothing ticked there is nothing to write from it.
            disabled={!preview || selectedRows.length === 0 || commitImport.isPending}
          >
            <Upload size={16} />
            {t('import.commit', { count: selectedRows.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One row of the preview.
 *
 * The outcome column used to print the raw enum — `CREATE`, `UPDATE`, `SKIP` — and
 * the errors column joined the server's sentences together with no separator. Both
 * now read as what will happen to that line.
 */
function ImportRow({
  row,
  departmentName,
  checked,
  onCheckedChange,
}: {
  row: ImportPreviewRow;
  departmentName: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const blocked = row.errors.length > 0;

  return (
    <tr className={blocked ? 'bg-[color-mix(in_oklch,var(--danger),var(--surface)_95%)]' : undefined}>
      <td>
        <Checkbox
          aria-label={t('import.selectRow', { row: row.rowNumber })}
          disabled={blocked}
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </td>
      <td className="tabular-nums">{row.rowNumber}</td>
      <td className="tabular-nums">{row.normalized?.employeeNumber}</td>
      <td>{row.normalized ? employeeFullName(row.normalized) : ''}</td>
      <td>{departmentName}</td>
      <td>
        {/* `proposedAction` is null when the row could not be read far enough to
            know whether it would create or update anybody. */}
        {blocked || !row.proposedAction ? (
          <StatusPill status="IMPORT_BLOCKED">{t('import.outcomeBlocked')}</StatusPill>
        ) : (
          <StatusPill status={`IMPORT_${row.proposedAction}`}>{t(`import.outcome${row.proposedAction}`)}</StatusPill>
        )}
      </td>
      <td>
        {blocked ? (
          <ul className="m-0 grid list-none gap-1 p-0 text-[0.82rem] font-semibold text-danger">
            {row.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <span className="text-ink-muted">-</span>
        )}
      </td>
    </tr>
  );
}
