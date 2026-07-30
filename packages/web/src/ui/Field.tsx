import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldErrorId } from '../employee-validation.js';

/**
 * A labelled control with one slot below it for either its standing instruction
 * or its complaint — never both. With both visible the hint and the error compete
 * for the same glance, and the row grows enough to push the next field out of view.
 *
 * `data-invalid` is the single hook the whole invalid presentation hangs off: the
 * tint behind the field, the red heavier label, the icon colour. The control keeps
 * its own `aria-label` (the visible label here is not a `<label>` element, because
 * some of these controls are comboboxes and date pickers rather than inputs), and
 * `role="alert"` plus the summary above the form are what announce the message.
 */
export function Field({
  label,
  icon,
  children,
  full,
  className,
  required,
  hint,
  error,
  name,
  shimmer,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  full?: boolean;
  className?: string;
  required?: boolean;
  hint?: string;
  /** When set, the field is styled as invalid and shows this instead of the hint. */
  error?: string | undefined;
  /** Field key, so a failed save can scroll to and focus this input. */
  name?: string;
  /** Sweeps a highlight across a value the form just filled in for you. */
  shimmer?: boolean;
}) {
  return (
    <div
      role="group"
      data-slot="field"
      {...(name ? { 'data-field': name } : {})}
      {...(error ? { 'data-invalid': 'true' } : {})}
      className={cn(
        'group/field grid content-start gap-2 transition-[background,box-shadow] duration-150',
        // A background tint rather than a border, so the grid doesn't reflow when
        // an error appears or clears. The matching shadow bleeds the tint past the
        // field's own box without taking up any space.
        'data-invalid:rounded-lg data-invalid:bg-[color-mix(in_oklch,var(--danger),transparent_96%)] data-invalid:shadow-[0_0_0_0.5rem_color-mix(in_oklch,var(--danger),transparent_96%)]',
        full && 'col-span-full',
        className
      )}
    >
      <span
        data-slot="field-label"
        className={cn(
          'inline-flex min-h-5 items-center gap-2 text-[0.79rem] font-extrabold text-ink-soft',
          'group-focus-within/field:text-brand',
          // Colour alone can't carry the state (contrast, colour blindness): the
          // icon on the message below and this weight change say it too.
          'group-data-invalid/field:font-black group-data-invalid/field:text-danger'
        )}
      >
        {icon ? (
          <span
            data-slot="field-label-icon"
            aria-hidden="true"
            className={cn(
              'inline-flex items-center justify-center text-[color-mix(in_oklch,var(--brand),var(--ink-soft)_22%)] transition-[color,transform] duration-150',
              'group-focus-within/field:-translate-y-px group-focus-within/field:text-brand',
              'group-data-invalid/field:text-danger',
              '[&_svg]:size-[1.05rem] [&_svg]:[stroke-width:2.15]'
            )}
          >
            {icon}
          </span>
        ) : null}
        {label}
        {required ? (
          <span data-slot="field-required" aria-hidden="true" className="text-[0.9rem] leading-none font-extrabold text-danger">
            *
          </span>
        ) : null}
      </span>

      {shimmer === undefined ? (
        children
      ) : (
        // Purely decorative, and never in the way: the overlay takes no pointer
        // events, so the field stays editable while the sweep plays.
        //
        // The wrapper is permanent for any field that opts into the shimmer, and
        // only its classes toggle. Mounting it just for the sweep moved the
        // control to a different spot in the tree when the sweep ended, and React
        // answers that with a remount — which drops the operator's focus mid-word
        // if they started correcting the suggested value within its one second.
        <span
          className={cn(
            'relative block',
            shimmer &&
              "overflow-hidden rounded-[9px] motion-safe:after:pointer-events-none motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:animate-field-shimmer motion-safe:after:bg-[linear-gradient(90deg,transparent_0%,color-mix(in_oklch,var(--brand),transparent_86%)_50%,transparent_100%)] motion-safe:after:content-['']"
          )}
        >
          {children}
        </span>
      )}

      {error ? (
        <span
          data-slot="field-error"
          role="alert"
          {...(name ? { id: fieldErrorId(name) } : {})}
          className="m-0 flex max-w-[42rem] items-start gap-[0.3rem] text-[0.78rem] leading-[1.45] font-[650] text-danger"
        >
          <TriangleAlert size={13} aria-hidden="true" className="mt-[0.12rem] flex-none" />
          {error}
        </span>
      ) : hint ? (
        <span
          data-slot="field-description"
          className="block max-w-[42rem] text-[0.78rem] leading-[1.45] font-medium text-ink-muted"
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
