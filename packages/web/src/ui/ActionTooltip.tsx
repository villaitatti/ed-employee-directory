import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A tooltip on a control that is otherwise unexplained — an icon-only button,
 * mostly.
 *
 * Not the native `title` attribute: that one is browser-styled, waits a full
 * second before it appears, and cannot be made to match the rest of the chrome.
 * The trigger keeps its own `aria-label`, because the tooltip supplies a
 * description rather than a name.
 */
export function ActionTooltip({
  label,
  side = 'top',
  children,
}: {
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** The control the tooltip describes; rendered as the trigger itself. */
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
