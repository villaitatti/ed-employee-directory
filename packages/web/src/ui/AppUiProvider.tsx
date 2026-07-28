import type { ReactNode } from 'react';
import { Button, createTheme, Input, MantineProvider, Pill, Switch, type MantineColorsTuple } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/it';
import { useTranslation } from 'react-i18next';

dayjs.extend(customParseFormat);

/**
 * Stable class hooks for the app stylesheet. Mantine's own `.mantine-Input-input`
 * style classes are internal and can be renamed in any release, so app.css targets
 * these instead — the officially supported way to reach into a component's parts.
 * `Input` covers every text-like control (TextInput, Select, MultiSelect,
 * DateInput) because they all render through it.
 */
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
    Input: Input.extend({
      classNames: { wrapper: 'app-input-wrapper', input: 'app-input', section: 'app-input-section' },
    }),
    Pill: Pill.extend({ classNames: { root: 'app-pill' } }),
    Switch: Switch.extend({ classNames: { label: 'app-switch-label' } }),
    Button: Button.extend({ classNames: { root: 'app-button' } }),
  },
});

export function AppUiProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'it';

  return (
    <MantineProvider theme={theme} env={import.meta.env.MODE === 'test' ? 'test' : 'default'}>
      <DatesProvider settings={{ locale, firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        <ModalsProvider>{children}</ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
