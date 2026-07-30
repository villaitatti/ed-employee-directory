import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * A numbered, titled panel inside a long form.
 *
 * The number is what makes the dialog navigable when it is six panels tall, and
 * it doubles as the animation order — the panels arrive in sequence rather than
 * all at once.
 */
export function FormSection({
  number,
  icon,
  title,
  description,
  children,
  errorCount = 0,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  /** Problems inside this section, badged on the heading. */
  errorCount?: number;
}) {
  const { t } = useTranslation();
  return (
    <fieldset
      {...(errorCount > 0 ? { 'data-has-errors': 'true' } : {})}
      // The stagger is per-section rather than an nth-child rule, now that the
      // sections are drawn by a component that knows its own number.
      style={{ animationDelay: `${(Number(number) - 1) * 35}ms` }}
      className={cn(
        'group/section m-0 min-w-0 rounded-[14px] border border-[color-mix(in_oklch,var(--line),var(--brand)_7%)] bg-surface p-4 tablet:p-6',
        'shadow-[0_1px_3px_oklch(0.2_0.02_250/0.045)] transition-[border-color,box-shadow] duration-150',
        'focus-within:border-[color-mix(in_oklch,var(--brand),var(--line)_58%)]',
        'focus-within:shadow-[0_1px_3px_oklch(0.2_0.02_250/0.04),0_8px_28px_color-mix(in_oklch,var(--brand),transparent_92%)]',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300'
      )}
    >
      <legend className="sr-only">{title}</legend>
      {/* The badge gets a track of its own only when there is one to place: an
          always-present empty column would leave its grid gap behind. */}
      <div
        className={cn(
          'mb-6 grid items-center gap-3 border-b border-[color-mix(in_oklch,var(--line),transparent_24%)] pb-4',
          errorCount > 0
            ? 'grid-cols-[1.8rem_minmax(0,1fr)_auto] tablet:grid-cols-[2rem_2rem_minmax(0,1fr)_auto]'
            : 'grid-cols-[1.8rem_minmax(0,1fr)] tablet:grid-cols-[2rem_2rem_minmax(0,1fr)]'
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--brand),var(--surface)_90%)] text-[0.68rem] font-black tracking-wide tabular-nums text-brand"
        >
          {number}
        </span>
        <span
          aria-hidden="true"
          className="hidden size-8 items-center justify-center rounded-full bg-surface-raised text-[color-mix(in_oklch,var(--brand),var(--ink-soft)_18%)] transition-[color,transform] duration-150 group-focus-within/section:-translate-y-px group-focus-within/section:text-brand tablet:inline-flex [&_svg]:size-[1.1rem] [&_svg]:[stroke-width:2.15]"
        >
          {icon}
        </span>
        <div>
          <h4 className="m-0 text-[0.96rem] leading-tight text-ink">{title}</h4>
          <p className="m-0 mt-[0.15rem] text-[0.78rem] leading-snug text-ink-muted">{description}</p>
        </div>
        {/* Scrolling past a collapsed-looking section shouldn't hide the fact
            that something in it still needs attention. */}
        {errorCount > 0 ? (
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--danger),var(--surface)_88%)] px-2 py-[0.15rem] text-[0.72rem] font-extrabold whitespace-nowrap text-danger">
            <TriangleAlert size={13} aria-hidden="true" />
            {t('validation.sectionErrors', { count: errorCount })}
          </span>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}
