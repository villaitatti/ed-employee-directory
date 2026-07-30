import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A file chooser in the app's own language and chrome.
 *
 * A bare `<input type="file">` renders the browser's control, which says
 * "Choose File / No file chosen" in the *browser's* language on an otherwise
 * Italian page and ignores the app's styling entirely. The real input is kept —
 * it is what opens the picker — but hidden behind a button that says what it
 * does and, once a file is chosen, what is chosen.
 */
export function FilePicker({
  label,
  placeholder,
  accept,
  value,
  onChange,
  className,
}: {
  /** Accessible name for the button that opens the picker. */
  label: string;
  placeholder: string;
  accept?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    // The input keeps its own value, so re-picking the same file after clearing
    // would fire no change event unless it is reset too.
    if (inputRef.current) inputRef.current.value = '';
    onChange(null);
  };

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        style={{ display: 'none' }}
        {...(accept ? { accept } : {})}
        onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="outline"
        // Names the control and reports its current state, which the visible text
        // below also does — the button's own text is not the accessible name here.
        aria-label={value ? `${label}: ${value.name}` : label}
        onClick={() => inputRef.current?.click()}
        className="min-w-0 flex-1 justify-start font-medium"
      >
        <Upload size={16} aria-hidden="true" />
        <span className={cn('truncate', !value && 'text-ink-muted')}>{value ? value.name : placeholder}</span>
      </Button>
      {value ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('actions.remove')} onClick={clear}>
          <X size={16} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
