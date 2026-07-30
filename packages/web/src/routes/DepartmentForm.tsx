import { Save, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldErrorId, type ServerErrors } from '../employee-validation.js';
import { Eyebrow } from '../ui/layout.js';
import { Field } from '../ui/Field.js';
import { useConfirmation } from '../ui/confirmation.js';
import { useModalDialog } from '../ui/useModalDialog.js';
import { notifyValidation } from '../ui/feedback.js';

export type DepartmentDraft = {
  id?: string;
  name: string;
};

export const emptyDepartmentDraft: DepartmentDraft = {
  name: '',
};

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
  const confirm = useConfirmation();
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
    confirm({
      title: t('copy.discardChangesTitle'),
      message: t('copy.discardChanges'),
      confirmLabel: t('actions.discard'),
      cancelLabel: t('actions.cancel'),
      destructive: true,
      onConfirm: onCancel,
    });
  }, [confirm, isDirty, onCancel, t]);

  const dialogRef = useModalDialog(requestClose);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklch,var(--ink),transparent_55%)] p-3 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 desktop:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-[44rem] flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_oklch(0.2_0.02_250/0.08),0_24px_60px_-20px_oklch(0.2_0.04_250/0.4)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 desktop:max-h-[calc(100vh-3rem)]"
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
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-raised px-6 py-6 desktop:px-8">
          <div>
            <Eyebrow>{t('nav.departments')}</Eyebrow>
            <h3 className="m-0 text-xl leading-tight font-bold">
              {draft.id ? draft.name : t('actions.createDepartment')}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="flex-none text-ink-muted"
            type="button"
            onClick={requestClose}
            aria-label={t('actions.close')}
          >
            <X size={18} />
          </Button>
        </header>

        <div className="grid gap-8 overflow-y-auto px-6 py-8 desktop:px-8">
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-4 block w-full border-b border-line pb-2 text-[0.74rem] font-extrabold tracking-wider text-ink-soft uppercase">
              {t('sections.identity')}
            </legend>
            <div className="grid grid-cols-1 gap-6">
              <Field label={t('fields.department')} required name="name" error={nameError} full>
                <Input
                  required
                  autoFocus
                  // Named explicitly: the caption beside this input is not a
                  // `<label>` element, because most fields here wrap a combobox
                  // or a date picker rather than a plain input.
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

        <footer className="flex items-center justify-end gap-3 border-t border-line bg-surface-raised px-6 py-4 desktop:px-8">
          <Button variant="outline" className="text-ink-soft" type="button" onClick={requestClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            <Save size={16} />
            {t('actions.save')}
          </Button>
        </footer>
      </form>
    </div>
  );
}

// Exported for tests: the import flow's file picker and row-error table.
