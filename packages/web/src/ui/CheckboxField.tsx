import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * A checkbox with its caption. Wired the same way as {@link SwitchField}: Base UI
 * renders the control as a `<span role="checkbox">`, which a `<label>` cannot
 * name, so `aria-labelledby` gives it its accessible name while `htmlFor` points
 * at the hidden input beside it so clicking the caption still toggles.
 */
export function CheckboxField({
  label,
  checked,
  onCheckedChange,
  className,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <Checkbox
        id={id}
        aria-labelledby={`${id}-label`}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
      />
      <label id={`${id}-label`} htmlFor={id} className="cursor-pointer text-sm font-bold text-ink-soft">
        {label}
      </label>
    </div>
  );
}
