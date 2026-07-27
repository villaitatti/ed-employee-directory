import type { ReactNode } from 'react';
import { Button, createTheme, Input, MantineProvider, Pill, Switch } from '@mantine/core';
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
const theme = createTheme({
  fontFamily: 'Aptos, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  primaryColor: 'indigo',
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
