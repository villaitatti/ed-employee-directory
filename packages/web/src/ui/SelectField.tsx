import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type SelectOption = { value: string; label: string };

/**
 * A single choice from a closed, short list — a status, a contract type, a
 * language. Deliberately a listbox rather than a searchable combobox: with three
 * options a text input to filter them is a step, not a shortcut, and Base UI's
 * Select already jumps to an option when you type its first letters.
 *
 * There is no clearing it. Every list this renders has a meaningful default, and
 * re-clicking the current option must not blank the field.
 */
export function SelectField({
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
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string | undefined;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') onChange(next);
      }}
    >
      <SelectTrigger
        aria-label={label}
        {...(invalid ? { 'aria-invalid': true } : {})}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        className={cn('w-full', className)}
      >
        <SelectValue placeholder={placeholder}>
          {(current) => options.find((option) => option.value === current)?.label ?? placeholder ?? ''}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
