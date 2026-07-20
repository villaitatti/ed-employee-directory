import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

type EdUser = {
  name: string | undefined;
  email: string | undefined;
};

type EdAuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: EdUser | undefined;
  error: Error | undefined;
  getAccessToken: () => Promise<string | null>;
  login: () => Promise<void>;
  logout: () => void;
};

const EdAuthContext = createContext<EdAuthContextValue | null>(null);

// Per-tab marker that the user deliberately signed out. Auth0 logout returns
// the browser to window.location.origin; without this flag the app would see
// the unauthenticated state on reload and immediately bounce the user back to
// Auth0, making sign-out impossible. sessionStorage scopes it to this tab and
// clears when the tab closes — the right lifetime for "I just logged out here".
const SIGNED_OUT_KEY = 'ed:signed-out';

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Private modes / sandboxed iframes can throw on access.
    return null;
  }
}

export function wasSignedOut(): boolean {
  return safeSession()?.getItem(SIGNED_OUT_KEY) === 'true';
}

export function clearSignedOut(): void {
  safeSession()?.removeItem(SIGNED_OUT_KEY);
}

function markSignedOut(): void {
  safeSession()?.setItem(SIGNED_OUT_KEY, 'true');
}

function envValue(key: string): string {
  return import.meta.env[key] ?? '';
}

function currentReturnTo(): string {
  return window.location.pathname + window.location.search;
}

function AuthBridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, error, getAccessTokenSilently, loginWithRedirect, logout } = useAuth0();

  const getAccessToken = useCallback(() => getAccessTokenSilently(), [getAccessTokenSilently]);
  const login = useCallback(async () => {
    clearSignedOut();
    // Preserve the deep link so a visitor sent to Auth0 from e.g. /audit lands
    // back on /audit rather than the default landing route.
    await loginWithRedirect({ appState: { returnTo: currentReturnTo() } });
  }, [loginWithRedirect]);
  const doLogout = useCallback(() => {
    markSignedOut();
    logout({ logoutParams: { returnTo: window.location.origin } });
  }, [logout]);

  // Memoize so consumers (and useApi's memoized client) don't rebuild on every
  // parent render.
  const value = useMemo<EdAuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated,
      user: user ? { name: user.name, email: user.email } : undefined,
      error,
      getAccessToken,
      login,
      logout: doLogout,
    }),
    [isLoading, isAuthenticated, user, error, getAccessToken, login, doLogout]
  );

  return <EdAuthContext.Provider value={value}>{children}</EdAuthContext.Provider>;
}

export function EdAuthProvider({ children }: { children: ReactNode }) {
  if (envValue('VITE_DEV_SKIP_AUTH') === 'true') {
    const value: EdAuthContextValue = {
      isLoading: false,
      isAuthenticated: true,
      user: { name: 'Dev staff-IT', email: 'dev.staff-it@example.test' },
      error: undefined,
      getAccessToken: async () => null,
      login: async () => undefined,
      logout: () => undefined,
    };
    return <EdAuthContext.Provider value={value}>{children}</EdAuthContext.Provider>;
  }

  return (
    <Auth0Provider
      domain={envValue('VITE_AUTH0_DOMAIN')}
      clientId={envValue('VITE_AUTH0_CLIENT_ID')}
      authorizationParams={{
        redirect_uri: envValue('VITE_AUTH0_CALLBACK_URL') || window.location.origin,
        audience: envValue('VITE_AUTH0_AUDIENCE'),
      }}
      cacheLocation="localstorage"
      onRedirectCallback={(appState) => {
        // Restore the pre-login deep link captured in login()'s appState.
        const returnTo = appState?.returnTo;
        window.history.replaceState(
          {},
          '',
          typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : window.location.pathname
        );
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </Auth0Provider>
  );
}

export function useEdAuth() {
  const context = useContext(EdAuthContext);
  if (!context) throw new Error('useEdAuth must be used inside EdAuthProvider.');
  return context;
}
