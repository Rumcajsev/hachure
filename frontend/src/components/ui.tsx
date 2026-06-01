import type { CSSProperties, ReactNode } from 'react'

// ── FlyoutContainer ───────────────────────────────────────────────────────────

export function FlyoutContainer({
  top,
  children,
  ...rest
}: {
  top: number
  children: ReactNode
  [key: string]: unknown
}) {
  const style: CSSProperties = {
    position: 'fixed',
    top,
    left: 224,
    width: 220,
    background: '#12121e',
    border: '1px solid #1e1f2e',
    borderLeft: '3px solid #4a7a9a',
    borderRadius: 4,
    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
    zIndex: 100,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    color: '#e0e0f0',
    fontSize: 11,
    fontFamily: 'ui-monospace, monospace',
  }
  return <div style={style} {...rest}>{children}</div>
}

// ── FlyoutHeader ──────────────────────────────────────────────────────────────

export function FlyoutHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#a0a0c0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </span>
      <button
        onClick={onClose}
        style={{
          background: 'none', border: 'none', color: '#6a6a8a', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, padding: 0, fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#e0e0f0')}
        onMouseLeave={e => (e.currentTarget.style.color = '#6a6a8a')}
      >
        ×
      </button>
    </div>
  )
}
