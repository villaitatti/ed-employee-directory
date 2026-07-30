import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * A switch with its caption, which is how every switch in this app appears.
 *
 * The two are wired both ways on purpose. `aria-labelledby` gives the switch its
 * accessible name — Base UI renders the control as a `<span role="switch">`, and
 * a `<label>` cannot name one of those — while `htmlFor` points at the hidden
 * input beside it, so clicking the caption still toggles.
 */
export function SwitchField({
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
      <Switch
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
