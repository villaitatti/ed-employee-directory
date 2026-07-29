import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** The column every page is laid out in: one stack, centred, capped in width. */
export function PageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mx-auto grid w-full max-w-[88rem] content-start gap-6', className)}>{children}</section>;
}

/** A small grey word above a heading, saying which part of the app this is. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[0.74rem] font-extrabold tracking-wide text-ink-muted uppercase">{children}</p>;
}

export function PageHeading({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-6 min-[900px]:flex-row min-[900px]:items-start">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="m-0 max-w-[62ch] text-[1.15rem] font-semibold text-ink">{title}</h2>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

/** The filter row above a table. Collapses to a single column on narrow screens. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid items-center gap-3 grid-cols-1',
        'min-[900px]:grid-cols-[minmax(16rem,1fr)_minmax(10rem,14rem)_minmax(12rem,18rem)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search size={16} aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
      <Input
        className="pl-9"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

/**
 * The bordered card a table sits in. The cell styling is declared here rather
 * than on every `<th>` and `<td>`: four tables share it, and the alternative is
 * the same twelve utilities repeated across sixty cells.
 */
export function DataSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-auto rounded-lg border border-line bg-surface',
        '[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
        '[&_th]:border-b [&_th]:border-line [&_th]:px-[0.85rem] [&_th]:py-3 [&_th]:text-left [&_th]:align-middle',
        '[&_th]:text-xs [&_th]:font-bold [&_th]:text-ink-soft [&_th]:uppercase',
        '[&_td]:border-b [&_td]:border-line [&_td]:px-[0.85rem] [&_td]:py-3 [&_td]:align-middle [&_td]:text-ink',
        className
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="m-0 p-8 text-ink-muted">{children}</p>;
}

/** Employment status, as a coloured pill wide enough that the column doesn't jitter. */
const STATUS_PILL_CLASSES: Record<string, string> = {
  ATTIVO: 'text-[oklch(0.31_0.08_146)] bg-[oklch(0.92_0.06_146)]',
  CESSATO: 'text-[oklch(0.37_0.09_25)] bg-[oklch(0.94_0.045_25)]',
  DA_ASSUMERE: 'text-[oklch(0.35_0.08_251)] bg-[oklch(0.92_0.045_251)]',
};

export function StatusPill({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-[1.7rem] min-w-[6.4rem] items-center justify-center rounded-full px-2.5 text-xs font-extrabold',
        STATUS_PILL_CLASSES[status]
      )}
    >
      {children}
    </span>
  );
}
