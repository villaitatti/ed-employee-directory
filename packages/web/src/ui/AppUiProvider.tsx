import type { ReactNode } from 'react';
import { createTheme, MantineProvider, Pill, type MantineColorsTuple } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/it';
import { TooltipProvider } from '@/components/ui/tooltip';

// The date field parses nine day-first formats explicitly rather than letting
// dayjs guess, which is what this plugin is for; the Italian locale is what
// turns 1990-03-15 into "15 marzo 1990".
dayjs.extend(customParseFormat);

/**
 * The stylesheet's own brand blue, as a Mantine palette.
 *
 * This has to live in the theme rather than in app.css: Mantine writes a filled
 * button's background as an *inline* `--button-bg` custom property, which no
 * stylesheet rule can override. Without this, primary Mantine controls painted
 * themselves from the stock indigo palette while every native
 * `.button.primary` used `--brand`, and the two blues visibly disagreed.
 *
 * Index 8 is exactly `--brand` from app.css; 9 is the hover Mantine derives from
 * it (primaryShade + 1). Keep the two in step if the brand colour changes.
 */
const brand: MantineColorsTuple = [
  'oklch(0.968 0.012 251)',
  'oklch(0.930 0.024 251)',
  'oklch(0.868 0.040 251)',
  'oklch(0.800 0.055 251)',
  'oklch(0.726 0.066 251)',
  'oklch(0.646 0.075 251)',
  'oklch(0.560 0.080 251)',
  'oklch(0.468 0.082 251)',
  'oklch(0.37 0.082 251)',
  'oklch(0.300 0.072 251)',
];

const theme = createTheme({
  fontFamily: 'Aptos, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  colors: { brand },
  primaryColor: 'brand',
  primaryShade: 8,
  defaultRadius: 'md',
  components: {
    Pill: Pill.extend({ classNames: { root: 'app-pill' } }),
  },
});

export function AppUiProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} env={import.meta.env.MODE === 'test' ? 'test' : 'default'}>
      <ModalsProvider>
        {/* `delay={0}`: every tooltip here names an icon-only control, and a
            second of hesitation before saying what a button does is the exact
            failing that ruled out the native `title` attribute. */}
        <TooltipProvider delay={0}>{children}</TooltipProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
