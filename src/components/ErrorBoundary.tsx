import { Component, type ReactNode } from 'react';
import { webUrl } from '../lib/runtime';

/**
 * The last line of defence.
 *
 * On the web, a render error is a refresh away from gone. In a shipped app it is
 * a white screen the user cannot hot-reload out of, and their only move is to
 * delete the app. This catches the error, shows something human, and offers the
 * two escapes that actually work: reload the view, or go back to a known-good
 * route.
 *
 * It is deliberately plain. It must not depend on anything that could be the
 * thing that broke, so no design tokens, no shared components, no data. Inline
 * styles only.
 */
interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Left as console for now. When error reporting is added (Sentry et al.),
    // this is the one line that forwards to it.
    console.error('[dealstudio] uncaught render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#f5f6f8', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          maxWidth: 380, width: '100%', background: '#fff', borderRadius: 16,
          border: '1px solid #edf0f3', padding: 28, textAlign: 'center',
          boxShadow: '0 8px 28px -6px rgba(12,16,34,0.14)',
        }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#191f1d', margin: '0 0 6px' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: 13, color: '#7f8c85', margin: '0 0 20px', lineHeight: 1.5 }}>
            This screen hit an error. Reloading usually clears it. If it keeps happening, head back
            to the dashboard.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                height: 40, padding: '0 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#fff', background: '#0030cd',
              }}
            >
              Reload
            </button>
            <button
              onClick={() => { window.location.href = webUrl('/admin'); }}
              style={{
                height: 40, padding: '0 18px', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#191f1d', background: '#f5f6f8',
                border: '1px solid #edf0f3',
              }}
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
