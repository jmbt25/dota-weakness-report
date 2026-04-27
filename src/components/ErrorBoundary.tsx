import { Component, type ReactNode } from 'react'

/**
 * Top-level error boundary. Without this, an exception inside any
 * descendant unmounts the whole React root in React 18, which paints the
 * page as the body's bg-void color — the "everything went black"
 * symptom. Better to render the error inline so the user (and we) can
 * see what blew up.
 */
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'relative',
            zIndex: 9999,
            maxWidth: 720,
            margin: '80px auto',
            padding: 24,
            background: '#12151f',
            border: '1px solid #E94560',
            borderRadius: 8,
            color: '#ECE6D6',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: 24,
              letterSpacing: '0.16em',
              color: '#E94560',
              marginBottom: 12,
            }}
          >
            SOMETHING BROKE
          </div>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{this.state.error.name}:</strong> {this.state.error.message}
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 11,
              opacity: 0.8,
              maxHeight: 320,
              overflow: 'auto',
              margin: 0,
            }}
          >
            {this.state.error.stack ?? '(no stack)'}
          </pre>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              if (typeof window !== 'undefined') window.location.reload()
            }}
            style={{
              marginTop: 16,
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid #E94560',
              color: '#E94560',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              letterSpacing: '0.16em',
              cursor: 'pointer',
            }}
          >
            RELOAD
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
