import { useTranslation } from 'react-i18next';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import type { SelectOption } from './SelectField.js';

/**
 * A single choice from a list that can grow — the department, the directory
 * filters. Searchable and clearable, which is the difference from
 * {@link SelectField}: these lists are long enough that typing beats scrolling,
 * and "no filter" is a legitimate answer for the ones in the toolbar.
 */
export function ComboboxField({
  label,
  value,
  onChange,
  options,
  placeholder,
  invalid,
  describedBy,
  className,
}: {
  /** Accessible name; these controls sit under a caption that is not a `<label>`. */
  label: string;
  /** The selected option's value, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next: SelectOption | null) => onChange(next?.value ?? '')}
      itemToStringLabel={(option: SelectOption) => option.label}
      isItemEqualToValue={(a: SelectOption, b: SelectOption) => a.value === b.value}
      openOnInputClick
    >
      <ComboboxInput
        aria-label={label}
        {...(invalid ? { 'aria-invalid': true } : {})}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        placeholder={placeholder}
        showClear={Boolean(selected)}
        className={cn('w-full', className)}
      />
      <ComboboxContent>
        <ComboboxEmpty>{t('copy.noOptionsFound')}</ComboboxEmpty>
        <ComboboxList>
          {(option: SelectOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
