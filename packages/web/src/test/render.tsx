import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { EdAuthProvider } from '../auth/AuthProvider.js';
import i18n from '../i18n/config.js';
import { AppUiProvider } from '../ui/AppUiProvider.js';

/**
 * Renders a component inside the same provider stack as the real app:
 * auth (DEV_SKIP_AUTH demo user in tests), react-query, router, and i18n.
 * Each call gets a fresh QueryClient with retries off for deterministic tests.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <EdAuthProvider>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <AppUiProvider>
              <MemoryRouter>{children}</MemoryRouter>
            </AppUiProvider>
          </I18nextProvider>
        </QueryClientProvider>
      </EdAuthProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
