import type { ReactNode } from 'react';
import { createTheme, MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/it';
import { useTranslation } from 'react-i18next';

dayjs.extend(customParseFormat);

const theme = createTheme({
  fontFamily: 'Aptos, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  primaryColor: 'indigo',
  primaryShade: 8,
  defaultRadius: 'md',
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
