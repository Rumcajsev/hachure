import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div style={{
        height: '100vh', width: '100vw',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#1a1410', color: '#e8d5b0',
        fontFamily: 'ui-monospace, monospace',
        padding: 40, boxSizing: 'border-box',
        gap: 24,
      }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#cc4400', textTransform: 'uppercase' }}>
          RENDER ERROR
        </div>
        <div style={{ fontSize: 18, color: '#e8d5b0', maxWidth: 640, textAlign: 'center', lineHeight: 1.4 }}>
          {error.message || String(error)}
        </div>
        <pre style={{
          maxWidth: 720, maxHeight: 280, overflow: 'auto',
          background: '#0e0b08', border: '1px solid #3a2e20',
          padding: '14px 18px', borderRadius: 4,
          fontSize: 11, lineHeight: 1.6, color: '#b09070',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {info?.componentStack ?? error.stack}
        </pre>
        {this.props.onReset && (
          <button
            onClick={() => { this.setState({ error: null, info: null }); this.props.onReset?.() }}
            style={{
              padding: '10px 24px',
              background: '#cc4400', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontFamily: 'ui-monospace, monospace', fontSize: 11,
              letterSpacing: 1, textTransform: 'uppercase',
            }}
          >
            ← BACK TO HOME
          </button>
        )}
      </div>
    )
  }
}
