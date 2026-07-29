import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
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
            <AlertDialogContent>
              <AlertDialogHeader>
                {/* An irreversible action gets a second signal before the words
                    are read at all. The reversible confirmations do not, so the
                    two never look alike at a glance. */}
                {request.destructive ? (
                  <AlertDialogMedia className="bg-destructive/10 text-destructive">
                    <TriangleAlert aria-hidden="true" />
                  </AlertDialogMedia>
                ) : null}
                <AlertDialogTitle>{request.title}</AlertDialogTitle>
                <AlertDialogDescription>{request.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{request.cancelLabel}</AlertDialogCancel>
                <AlertDialogAction
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
