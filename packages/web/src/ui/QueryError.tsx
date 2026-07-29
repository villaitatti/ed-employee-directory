import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { describeError } from '../api/error-messages.js';

/**
 * Visible, retryable banner for a failed data load — otherwise query failures
 * (including an expired session) render as a silently empty table.
 */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const described = describeError(error, t);
  // A failed *read* has a different next step from a failed write: the catalogue
  // description covers the codes that speak for themselves (expired session,
  // deleted record), and the retry hint covers the rest.
  const hint = described.reassure ? t('copy.loadErrorHint') : described.description;
  return (
    <div
      role="alert"
      className="m-4 flex items-center justify-between gap-4 rounded-[10px] border border-[color-mix(in_oklch,var(--danger),transparent_65%)] bg-[color-mix(in_oklch,var(--danger),var(--surface)_92%)] p-4 text-[0.85rem] font-bold text-danger"
    >
      <span className="grid gap-1">
        <strong>{described.title}</strong>
        {hint ? <span className="text-xs font-normal text-ink-soft">{hint}</span> : null}
      </span>
      <Button type="button" variant="outline" className="text-ink-soft" onClick={onRetry}>
        {t('actions.retry')}
      </Button>
    </div>
  );
}
