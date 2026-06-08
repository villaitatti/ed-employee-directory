import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from './i18n/config.js';

// The vitest harness forces VITE_DEV_SKIP_AUTH=true, so the real EdAuthProvider
// always yields an authenticated demo user and the unauthenticated branches in
// Shell() are unreachable through renderWithProviders. We mock the auth hook
// directly to drive every state without touching @auth0/auth0-react. We also
// control wasSignedOut(), which Shell uses to decide whether to auto-redirect.
const login = vi.fn(async () => undefined);
let signedOut = false;

// A fresh baseline so every test starts from a known auth state. beforeEach
// re-applies this wholesale, keeping tests order-independent as the suite grows.
const baselineAuth: {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: { name?: string; email?: string } | undefined;
  error: Error | undefined;
  getAccessToken: () => Promise<string | null>;
  login: () => Promise<void>;
  logout: () => void;
} = {
  isLoading: false,
  isAuthenticated: false,
  user: undefined,
  error: undefined,
  getAccessToken: async () => null,
  login,
  logout: () => undefined,
};
const auth = { ...baselineAuth };

vi.mock('./auth/AuthProvider.js', () => ({
  useEdAuth: () => auth,
  wasSignedOut: () => signedOut,
  clearSignedOut: () => {
    signedOut = false;
  },
}));

// Import after the mock is registered.
const { default: App } = await import('./App.js');

function renderApp() {
  // The authenticated shell mounts pages that use react-query, so App needs a
  // QueryClient. Retries off keeps the (stubbed) failing fetches deterministic.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe('Shell auth redirect', () => {
  beforeEach(() => {
    login.mockClear();
    login.mockImplementation(async () => undefined);
    signedOut = false;
    Object.assign(auth, baselineAuth);
    // Quiet the page-level queries that mount once authenticated.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":[]}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the minimal loading splash while Auth0 is checking the session', () => {
    auth.isLoading = true;
    renderApp();
    expect(screen.getByText('ED')).toBeInTheDocument();
    // No redirect while still loading.
    expect(login).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated visitor to Auth0 and shows the splash', async () => {
    renderApp();
    expect(screen.getByText('ED')).toBeInTheDocument();
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    // The redirecting splash, not the manual sign-in screen.
    expect(screen.queryByRole('button', { name: /Auth0/i })).not.toBeInTheDocument();
  });

  it('does NOT redirect an authenticated user and renders the app shell', async () => {
    auth.isAuthenticated = true;
    auth.user = { name: 'Dev staff-IT', email: 'dev.staff-it@example.test' };
    renderApp();

    // The full shell renders (topbar heading), not the bare 'ED' splash.
    expect(await screen.findByRole('heading', { name: /Employee Directory/i })).toBeInTheDocument();
    // An authenticated user must never be bounced to Auth0.
    expect(login).not.toHaveBeenCalled();
  });

  it('does NOT auto-redirect after an explicit logout — shows the manual sign-in screen', () => {
    // Regression guard: auth.logout() returns the browser to origin. Without
    // the signed-out flag the effect would immediately re-login, making
    // sign-out impossible. The flag must short-circuit the auto-redirect.
    signedOut = true;
    renderApp();

    expect(screen.getByRole('button', { name: /Auth0/i })).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('does NOT loop on an Auth0 error — shows the sign-in screen with an error message', () => {
    // Regression guard: a failed Auth0 round-trip (consent denied, access_denied,
    // callback/MFA error) leaves the user unauthenticated. Auto-redirecting again
    // loops forever, so the effect must back off and surface a manual retry.
    auth.error = new Error('access_denied');
    renderApp();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Auth0/i })).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('clicking sign-in after logout re-enters Auth0', async () => {
    signedOut = true;
    renderApp();

    const button = screen.getByRole('button', { name: /Auth0/i });
    button.click();
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  });

  it('surfaces a retry when loginWithRedirect rejects, then leaves the user on the splash no longer', async () => {
    // loginWithRedirect can reject before navigation (bad config, network).
    // void-ing it would strand the user on the splash forever; instead the
    // catch must flip to the manual sign-in screen with an "unavailable" notice.
    login.mockRejectedValueOnce(new Error('network down'));
    renderApp();

    // Auto-redirect attempt fires once, rejects, and the screen falls back.
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Auth0/i })).toBeInTheDocument();
  });

  it('fires the redirect once on the loading -> unauthenticated transition, even as login identity changes', async () => {
    // AuthBridge recreates login() on every render, so the effect's dependency
    // identity changes each time. Wrap the spy in a fresh arrow on every render
    // to reproduce that; the useRef guard must still fire login exactly once.
    const freshLogin = () => {
      auth.login = async () => {
        login();
      };
    };
    auth.isLoading = true;
    freshLogin();
    const { rerender } = renderApp();
    // While loading, no redirect.
    expect(login).not.toHaveBeenCalled();

    const rerenderApp = () => {
      freshLogin();
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <I18nextProvider i18n={i18n}>
            <MemoryRouter>
              <App />
            </MemoryRouter>
          </I18nextProvider>
        </QueryClientProvider>
      );
    };

    // Auth0 finishes its session check: still unauthenticated -> redirect fires.
    auth.isLoading = false;
    rerenderApp();
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));

    // A second render with a new login identity must NOT fire a second redirect.
    rerenderApp();
    expect(login).toHaveBeenCalledTimes(1);
  });
});
