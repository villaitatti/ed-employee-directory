import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from './api/client.js';
import { EdAuthProvider } from './auth/AuthProvider.js';
import { RootErrorBoundary } from './ErrorBoundary.js';
import { AppUiProvider } from './ui/AppUiProvider.js';
import './i18n/config.js';
import App from './App.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors (401/403/404/validation) — retrying only
      // delays the visible error. Retry other failures (network/5xx) once.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
      staleTime: 15_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppUiProvider>
      <RootErrorBoundary>
        <EdAuthProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </EdAuthProvider>
      </RootErrorBoundary>
    </AppUiProvider>
  </React.StrictMode>
);
