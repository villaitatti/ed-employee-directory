import { useEffect, useRef } from 'react';
import { useConfirmationOpen } from './confirmation.js';

const FOCUSABLE_SELECTOR =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal-dialog behavior for an overlay form: locks body scroll, closes on
 * Escape, traps Tab focus inside the dialog, and restores focus to the trigger
 * element on close. Returns a ref to attach to the dialog element. Initial focus
 * is left to an `autoFocus` field when present; otherwise the first focusable is
 * focused.
 *
 * While a confirmation is layered on top (discard changes, un-confirming a
 * retirement date) that confirmation owns the keyboard and this hook stands down.
 * Without the guard the two fight: the confirmation closes itself on Escape from
 * its own document listener and this hook — running in the same event — would
 * immediately re-open it, so Escape could never dismiss it; and on Tab this hook
 * would pull focus out of the confirmation's focus trap and back into the form
 * behind it. Reading the flag off the provider is what makes the guard reliable:
 * React has not re-rendered yet while the closing event is still in flight, so
 * the last rendered value still reports the confirmation as open.
 */
export function useModalDialog(requestClose: () => void) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const confirmationOpen = useConfirmationOpen();
  const confirmationOpenRef = useRef(confirmationOpen);
  confirmationOpenRef.current = confirmationOpen;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    if (dialog && !dialog.contains(document.activeElement)) {
      (focusable()[0] ?? dialog).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmationOpenRef.current) return;
      if (event.key === 'Escape') {
        requestCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, []);
  return dialogRef;
}

/** The holding screen while Auth0 decides whether there is a session. */
