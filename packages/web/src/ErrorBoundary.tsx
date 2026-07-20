import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort boundary so a render-time exception shows a recoverable message
 * instead of a blank white screen. Kept intentionally simple and free of i18n /
 * hooks so it can render even if the app tree failed to mount.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error', error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="app-error" role="alert">
          <h1>Something went wrong</h1>
          <p>The application hit an unexpected error. Reload the page to continue.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
