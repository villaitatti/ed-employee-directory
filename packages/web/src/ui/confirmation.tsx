import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleHelp, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Paints the confirm button as a warning; for anything irreversible. */
  destructive?: boolean;
};

/**
 * Split in two so `confirm` never changes identity: the call sites hold it in
 * `useCallback` deps, and a handler that is rebuilt every time a dialog opens
 * would churn every one of them.
 */
const ConfirmContext = createContext<((request: ConfirmationRequest) => void) | null>(null);
const ConfirmationOpenContext = createContext(false);

/**
 * One confirmation dialog for the whole app, opened by calling a function.
 *
 * The dialog itself is declarative, which is the shape shadcn ships and the
 * shape React wants; the six places that ask for a confirmation are event
 * handlers deciding, mid-flow, whether to go on. This wrapper is the seam
 * between the two, and it exists so those handlers keep reading as what they
 * are — "delete this, once you have checked" — instead of being turned inside
 * out into open/closed state each.
 */
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const confirm = useCallback((next: ConfirmationRequest) => setRequest(next), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      <ConfirmationOpenContext.Provider value={request !== null}>
        {children}
        <AlertDialog
          open={request !== null}
          onOpenChange={(open) => {
            if (!open) setRequest(null);
          }}
        >
          {request ? (
            // `size="sm"` is what centres the header and pairs the buttons into
            // equal halves; the width comes back up because these messages name
            // the record and say what happens to it, which is longer than the
            // one line the narrow size assumes.
            <AlertDialogContent size="sm" className="gap-5 p-6 data-[size=sm]:max-w-md">
              <AlertDialogHeader className="gap-2">
                {/* The mark carries the answer before the words are read: a red
                    warning for what cannot be undone, a neutral question for
                    what can. */}
                <AlertDialogMedia
                  className={cn(
                    'mb-1 size-14 rounded-full',
                    request.destructive ? 'bg-destructive/10 text-destructive' : 'bg-muted text-ink-soft'
                  )}
                >
                  {request.destructive ? (
                    <TriangleAlert className="size-7" aria-hidden="true" />
                  ) : (
                    <CircleHelp className="size-7" aria-hidden="true" />
                  )}
                </AlertDialogMedia>
                <AlertDialogTitle className="text-lg font-bold">{request.title}</AlertDialogTitle>
                <AlertDialogDescription className="text-balance">{request.message}</AlertDialogDescription>
              </AlertDialogHeader>
              {/* Flat, not the registry's separated footer bar: with the dialog
                  centred, a grey strip under it cuts the composition in half. */}
              <AlertDialogFooter className="mx-0 mb-0 grid grid-cols-2 gap-3 border-t-0 bg-transparent p-0">
                <AlertDialogCancel size="lg">{request.cancelLabel}</AlertDialogCancel>
                <AlertDialogAction
                  size="lg"
                  // Solid red, not the registry's tinted `destructive` variant.
                  // That one reads as a quiet secondary next to an outlined
                  // Cancel; the button that deletes a record should be the one
                  // thing on the dialog you cannot mistake for anything else.
                  {...(request.destructive
                    ? {
                        className:
                          'bg-destructive text-white hover:bg-[color-mix(in_oklch,var(--destructive),black_8%)] focus-visible:border-destructive focus-visible:ring-destructive/40',
                      }
                    : {})}
                  onClick={() => {
                    setRequest(null);
                    request.onConfirm();
                  }}
                >
                  {request.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          ) : null}
        </AlertDialog>
      </ConfirmationOpenContext.Provider>
    </ConfirmContext.Provider>
  );
}

/** Asks the operator before going ahead. Stable across renders. */
export function useConfirmation(): (request: ConfirmationRequest) => void {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirmation must be used inside a ConfirmationProvider');
  return confirm;
}

/**
 * Whether a confirmation is currently layered over everything else.
 *
 * The overlay forms run their own Escape and Tab handling, and it has to stand
 * down while a confirmation owns the keyboard — see `useModalDialog`.
 */
export function useConfirmationOpen(): boolean {
  return useContext(ConfirmationOpenContext);
}
