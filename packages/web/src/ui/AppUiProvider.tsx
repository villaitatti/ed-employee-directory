import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmationProvider } from './confirmation.js';

// The dayjs setup that used to sit here — the day-first parser and the Italian
// locale — now lives in `format.ts`, next to the functions that need it, so those
// functions work when imported directly rather than only once this has rendered.

/**
 * The cross-cutting UI context: tooltips and the one confirmation dialog.
 *
 * There is no theme object here any more. The design tokens live in `app.css`,
 * where the components read them straight out of CSS custom properties — which
 * is why the ten-stop brand palette this file used to carry could go. It existed
 * only because Mantine wrote a filled button's background as an inline
 * `--button-bg` that no stylesheet could override, so the library's blue had to
 * be restated in the library's own terms and kept in step with `--brand` by hand.
 */
export function AppUiProvider({ children }: { children: ReactNode }) {
  return (
    // `delay={0}`: every tooltip here names an icon-only control, and a second of
    // hesitation before saying what a button does is the exact failing that ruled
    // out the native `title` attribute.
    <TooltipProvider delay={0}>
      <ConfirmationProvider>{children}</ConfirmationProvider>
    </TooltipProvider>
  );
}
