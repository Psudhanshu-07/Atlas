import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for render-time crashes: instead of a white screen the
 * user gets a recoverable state (retry in place or reload). Wrapped around the
 * whole app in main.tsx so no view can escape it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced in the browser console for debugging; no user data is sent anywhere.
    console.error("[FATAL] render error:", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-state" role="alert" style={{ margin: "15vh auto", maxWidth: 520 }}>
        <div className="error-body" style={{ textAlign: "left" }}>
          <h4>Something went wrong in the interface</h4>
          <p>
            The view crashed while rendering. You can retry it — your data is safe on the
            server — or reload the page.
          </p>
          <p className="form-help-text" style={{ marginTop: 8 }}>
            {error.message}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary" onClick={this.reset}>
            Retry
          </button>
          <button className="btn ghost" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
