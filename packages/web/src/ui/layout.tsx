import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  /** A sentence saying what the page is for, where the title alone won't do it. */
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-6 min-[900px]:flex-row min-[900px]:items-start">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="m-0 max-w-[62ch] text-[1.15rem] font-semibold text-ink">{title}</h2>
        {description ? <p className="m-0 mt-1 max-w-[70ch] text-[0.85rem] text-ink-soft">{description}</p> : null}
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

export type SortDirection = 'asc' | 'desc';

/**
 * A column heading you can order the table by.
 *
 * `aria-sort` on the cell is what tells a screen reader which column the table
 * is ordered by and which way; the arrow says the same thing to everyone else,
 * and stays visible-but-faint on the other columns so it is discoverable that
 * they can be sorted at all.
 */
export function SortableHeader({
  label,
  sorted,
  direction,
  onSort,
}: {
  label: string;
  /** Whether the table is currently ordered by this column. */
  sorted: boolean;
  direction: SortDirection;
  onSort: () => void;
}) {
  const Arrow = !sorted ? ChevronsUpDown : direction === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th aria-sort={sorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="p-0!">
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'group/sort flex w-full cursor-pointer items-center gap-1 px-[0.85rem] py-3 text-left',
          'text-xs font-bold text-ink-soft uppercase hover:text-brand',
          sorted && 'text-brand'
        )}
      >
        {label}
        <Arrow
          aria-hidden="true"
          className={cn('size-3.5 shrink-0', sorted ? 'opacity-100' : 'opacity-30 group-hover/sort:opacity-70')}
        />
      </button>
    </th>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="m-0 p-8 text-ink-muted">{children}</p>;
}

/**
 * Placeholder rows in the shape of the table that is coming.
 *
 * Before this, a loading table rendered its headings above an empty `<tbody>` and
 * nothing else — the empty-state message is deliberately suppressed while the
 * query is in flight, so "still loading" and "nothing here" looked identical, and
 * the first looked like a page that had failed.
 *
 * Rendered as the `<tbody>` itself so the browser's table layout still applies and
 * the columns land where the real ones will. The cells are `aria-hidden` and the
 * announcement is left to one live region, because fifty grey rectangles are not
 * fifty pieces of news.
 */
export function TableSkeleton({
  columns,
  rows = 5,
  label,
}: {
  columns: number;
  rows?: number;
  /** What is loading, for the screen reader that gets no grey boxes. */
  label: string;
}) {
  return (
    <tbody data-slot="table-skeleton">
      <tr>
        <td colSpan={columns} className="border-0! p-0!">
          <span role="status" className="sr-only">
            {label}
          </span>
        </td>
      </tr>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              {/* Widths cycle rather than randomise: a stable pattern reads as a
                  table of text, and a random one would change on every render. */}
              <Skeleton className={cn('h-4', SKELETON_WIDTHS[(row + column) % SKELETON_WIDTHS.length])} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

const SKELETON_WIDTHS = ['w-full', 'w-3/4', 'w-1/2', 'w-5/6', 'w-2/3'];

/**
 * How many records the table below is showing, with the breakdown that makes the
 * number mean something.
 *
 * A live region: on the directory this sits above a table the toolbar filters, and
 * "how many did that leave?" is the question a filter raises. Sighted operators
 * read the answer off the line; everyone else is told it changed.
 */
export function RecordCount({
  total,
  breakdown,
  isLoading,
}: {
  total: string;
  /** Optional detail — status pills on the directory, nothing on smaller tables. */
  breakdown?: ReactNode;
  isLoading?: boolean;
}) {
  if (isLoading) return <Skeleton className="h-5 w-48" />;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.82rem] text-ink-soft">
      <span className="font-bold text-ink">{total}</span>
      {breakdown}
    </div>
  );
}

/** Employment status, as a coloured pill wide enough that the column doesn't jitter. */
const STATUS_PILL_CLASSES: Record<string, string> = {
  ATTIVO: 'text-[oklch(0.31_0.08_146)] bg-[oklch(0.92_0.06_146)]',
  CESSATO: 'text-[oklch(0.37_0.09_25)] bg-[oklch(0.94_0.045_25)]',
  DA_ASSUMERE: 'text-[oklch(0.35_0.08_251)] bg-[oklch(0.92_0.045_251)]',
  // What a row of an Excel import will do. Green for a new record and blue for a
  // change to one that exists, matching the reading the status column already
  // teaches; red where the row cannot be used at all.
  IMPORT_CREATE: 'text-[oklch(0.31_0.08_146)] bg-[oklch(0.92_0.06_146)]',
  IMPORT_UPDATE: 'text-[oklch(0.35_0.08_251)] bg-[oklch(0.92_0.045_251)]',
  IMPORT_BLOCKED: 'text-[oklch(0.37_0.09_25)] bg-[oklch(0.94_0.045_25)]',
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
