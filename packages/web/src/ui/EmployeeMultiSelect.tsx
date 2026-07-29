import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EmployeeOption } from '@itatti/shared';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

export function employeeOptionLabel(option: EmployeeOption): string {
  return `${option.firstName} ${option.lastName} (${option.employeeNumber})`;
}

/**
 * The approver pickers: several people, chosen from a filtered list.
 *
 * The one thing this does that a stock multi-select does not is keep an approver
 * who has *since* lost eligibility. They are no longer offered in the list, but
 * they are still on the record and the save will be rejected until they are taken
 * off it — so the chip stays, marked as the problem it is, with its remove button
 * as the way out. Silently dropping them from the payload would look like the form
 * agreeing with itself while the server disagreed.
 */
export function EmployeeMultiSelect({
  label,
  options,
  labelOptions,
  value,
  onChange,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  /** Accessible name for the text input inside the chips box. */
  label: string;
  /** Selectable options for the dropdown (already filtered for eligibility). */
  options: EmployeeOption[];
  /** Broader pool used only to label already-selected chips. */
  labelOptions: EmployeeOption[];
  value: string[];
  onChange: (value: string[]) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);

  const eligibleIds = new Set(options.map((option) => option.id));
  const labelById = new Map(labelOptions.map((option) => [option.id, employeeOptionLabel(option)]));
  const labelFor = (id: string) => labelById.get(id) ?? t('copy.ineligibleApprover');

  // Picked people leave the list: the chips above already say they are chosen,
  // and a list that repeats them is a list of things not to click.
  const selectable = options.map((option) => option.id).filter((id) => !value.includes(id));

  return (
    <Combobox
      multiple
      items={selectable}
      value={value}
      onValueChange={(next: string[]) => onChange(next)}
      itemToStringLabel={labelFor}
      openOnInputClick
    >
      <ComboboxChips ref={anchorRef}>
        {value.map((id) => (
          <ComboboxChip
            key={id}
            aria-label={labelFor(id)}
            removeLabel={`${t('actions.remove')} ${labelFor(id)}`}
            {...(eligibleIds.has(id) ? {} : { 'data-ineligible': 'true' })}
            className="data-[ineligible=true]:bg-[color-mix(in_oklch,var(--warning-ink),var(--surface)_88%)] data-[ineligible=true]:text-warning data-[ineligible=true]:ring-1 data-[ineligible=true]:ring-warning/60"
          >
            {labelFor(id)}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          aria-label={label}
          {...(invalid ? { 'aria-invalid': true } : {})}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          placeholder={value.length === 0 ? t('actions.addApprover') : undefined}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxEmpty>{t('copy.noOptionsFound')}</ComboboxEmpty>
        <ComboboxList>
          {(id: string) => (
            <ComboboxItem key={id} value={id}>
              {labelFor(id)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
