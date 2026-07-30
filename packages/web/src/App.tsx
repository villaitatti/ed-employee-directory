import { Building2, History, Languages, LogOut, Settings, Upload, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { useEdAuth, wasSignedOut } from './auth/AuthProvider.js';
import { AuditPage } from './routes/AuditPage.js';
import { DepartmentsPage } from './routes/DepartmentsPage.js';
import { EmployeesPage } from './routes/EmployeesPage.js';
import { ImportPage } from './routes/ImportPage.js';
import { SettingsPage } from './routes/SettingsPage.js';
import { ActionTooltip } from './ui/ActionTooltip.js';
import { Eyebrow } from './ui/layout.js';
import './styles/app.css';

function OptionalEyebrow({ text }: { text: string }) {
  return text ? <Eyebrow>{text}</Eyebrow> : null;
}

function AppSplash() {
  return <div className="grid min-h-screen place-items-center text-2xl font-extrabold text-brand">ED</div>;
}

/**
 * A primary-navigation link. Below the tablet breakpoint the sidebar is a strip of
 * icons: the label collapses to nothing visible but stays in the accessible name.
 */
function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      // `text-[0px]`, not `text-[0]`: Tailwind cannot tell a bare `0` from a
      // colour and silently emits nothing, which left the labels at full size
      // inside a 4.75rem strip. The unit is what makes it a font size.
      className="flex min-h-10 items-center justify-center gap-3 rounded-lg p-0 text-[0px] font-bold text-ink-soft no-underline [&.active]:bg-[color-mix(in_oklch,var(--brand),white_90%)] [&.active]:text-brand [&_svg]:size-5 tablet:justify-start tablet:px-3 tablet:text-[0.92rem] tablet:[&_svg]:size-[18px]"
    >
      {icon}
      {label}
    </NavLink>
  );
}

function Shell() {
  const { t, i18n } = useTranslation();
  const auth = useEdAuth();
  const redirecting = useRef(false);
  const [loginFailed, setLoginFailed] = useState(false);

  // No landing page on a clean first visit: once Auth0 finishes its session
  // check, send an unauthenticated visitor straight to the Auth0 Universal
  // Login. But DON'T auto-redirect when there's nothing to redirect to safely:
  //   - auth.error: the Auth0 round-trip failed (consent denied, access_denied,
  //     callback/MFA error). Redirecting again just loops forever.
  //   - wasSignedOut(): the user deliberately logged out and Auth0 returned to
  //     origin; auto-redirecting would make sign-out impossible.
  //   - loginFailed: loginWithRedirect() itself rejected (bad config, network).
  // In those cases we fall through to the sign-in screen, which is the manual
  // off-ramp. The ref guards against firing the redirect more than once per
  // mount (StrictMode double-invoke); the conditions above guard the reload
  // loops the ref cannot see.
  const blockRedirect = Boolean(auth.error) || loginFailed || wasSignedOut();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !blockRedirect && !redirecting.current) {
      redirecting.current = true;
      auth.login().catch(() => {
        // Surface a manual retry instead of stranding the user on the splash.
        redirecting.current = false;
        setLoginFailed(true);
      });
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.login, blockRedirect]);

  if (auth.isLoading) {
    return <AppSplash />;
  }

  if (!auth.isAuthenticated) {
    // Auto-redirect is in flight on a clean visit — show the splash, not the
    // sign-in screen, to avoid a flash of the manual button before navigation.
    if (!blockRedirect) {
      return <AppSplash />;
    }

    const signIn = () => {
      setLoginFailed(false);
      redirecting.current = true;
      void auth.login().catch(() => {
        redirecting.current = false;
        setLoginFailed(true);
      });
    };

    return (
      <main className="mx-auto grid min-h-screen max-w-[72rem] grid-cols-1 items-center gap-12 p-8 desktop:grid-cols-[minmax(12rem,20rem)_minmax(18rem,42rem)] desktop:p-12">
        <img className="h-auto w-32 max-w-[32vw] object-contain" src="/itatti-logo.png" alt="I Tatti" />
        <div className="grid justify-items-start gap-4">
          <div>
            <OptionalEyebrow text={t('copy.productEyebrow')} />
            <h1 className="m-0 text-[2rem] leading-[1.1]">ED - Employee Directory</h1>
          </div>
          <p className="m-0 max-w-[58ch] text-ink-soft">{t('copy.subtitle')}</p>
          {auth.error ? (
            <p className="m-0 font-semibold text-danger" role="alert">
              {t('copy.signInError')}
            </p>
          ) : loginFailed ? (
            <p className="m-0 font-semibold text-danger" role="alert">
              {t('copy.signInUnavailable')}
            </p>
          ) : null}
          <Button onClick={signIn}>{t('actions.signIn')}</Button>
        </div>
      </main>
    );
  }

  const toggleLanguage = () => {
    void i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it');
  };

  return (
    <>
      {/* Toasts carry a title plus a "what to do next" line, so they need room to
          breathe and a way out that isn't waiting: hence the wider-than-default
          panel and the close button. Errors also override the duration — see
          notifyError. */}
      <Toaster
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          className: 'w-100 [&_[data-description]]:leading-relaxed [&_[data-description]]:opacity-90',
        }}
      />
      <div className="grid h-screen min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header className="relative z-10 flex flex-col items-stretch justify-between gap-4 border-b border-line bg-surface p-4 desktop:min-h-[4.75rem] desktop:flex-row desktop:items-center desktop:px-8 desktop:py-0">
          <div className="flex min-w-0 items-center gap-4">
            <img className="h-auto w-28 max-w-[32vw] object-contain" src="/itatti-logo.png" alt="I Tatti" />
            <div>
              <OptionalEyebrow text={t('copy.productEyebrow')} />
              <h1 className="m-0 text-[1.1rem] leading-[1.15]">ED - Employee Directory</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* `aria-label` carries the accessible name — the sign-out button is
                icon-only and would otherwise be unnamed. See ActionTooltip for
                why these are not native `title` tooltips. */}
            <ActionTooltip label={t('actions.language')} side="bottom">
              <Button
                variant="outline"
                size="sm"
                className="text-ink-soft"
                type="button"
                onClick={toggleLanguage}
                aria-label={t('actions.language')}
              >
                <Languages size={18} />
                <span>{i18n.language.toUpperCase()}</span>
              </Button>
            </ActionTooltip>
            <ActionTooltip label={t('actions.signOut')} side="bottom">
              <Button
                variant="outline"
                size="icon-sm"
                className="text-ink-soft"
                type="button"
                onClick={auth.logout}
                aria-label={t('actions.signOut')}
              >
                <LogOut size={18} />
              </Button>
            </ActionTooltip>
          </div>
        </header>
        <div className="grid h-full min-h-0 grid-cols-[4.75rem_minmax(0,1fr)] items-stretch tablet:grid-cols-[13.5rem_minmax(0,1fr)] desktop:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface-raised p-3 tablet:px-4 tablet:py-6"
            aria-label={t('nav.primary')}
          >
            <NavItem to="/employees" icon={<UsersRound size={18} />} label={t('nav.employees')} />
            <NavItem to="/departments" icon={<Building2 size={18} />} label={t('nav.departments')} />
            <NavItem to="/import" icon={<Upload size={18} />} label={t('nav.import')} />
            <NavItem to="/audit" icon={<History size={18} />} label={t('nav.audit')} />
            <NavItem to="/settings" icon={<Settings size={18} />} label={t('nav.settings')} />
            <div
              className="mt-auto pt-4 text-center text-[0.76rem] font-extrabold text-ink-muted [writing-mode:vertical-rl] tablet:px-3 tablet:text-left tablet:[writing-mode:horizontal-tb]"
              aria-label={`Version ${__APP_VERSION__}`}
            >
              v{__APP_VERSION__}
            </div>
          </nav>
          <main className="h-full min-h-0 min-w-0 overflow-auto p-4 desktop:p-8">
            <Routes>
              <Route path="/" element={<Navigate to="/employees" replace />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return <Shell />;
}
