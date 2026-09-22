import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../context/ThemeContext'
import { useHoverInfo } from '../hooks/useHoverInfo'
import { OPTION_INFO } from '../content/optionInfo'

const GAP = 10
const WIDTH = 220
const VIEWPORT_MARGIN = 8

// ── OptionInfoTooltip ─────────────────────────────────────────────────────────
// Portaled to document.body so it always renders above scroll-clipped flyout
// panels, positioned to the right of `anchor` (flips left / clamps vertically
// if that would run off-screen).

function OptionInfoTooltip({ id, anchor }: { id: string; anchor: HTMLElement }) {
  const t = useTheme()
  const entry = OPTION_INFO[id]
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const rect = anchor.getBoundingClientRect()
    const estimatedHeight = entry?.image ? 220 : 90

    let left = rect.right + GAP
    if (left + WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = rect.left - GAP - WIDTH
    }

    let top = rect.top
    if (top + estimatedHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - estimatedHeight)
    }

    setPos({ top, left })
  }, [anchor, entry])

  if (!entry || !pos) return null

  return createPortal(
    <div style={{
      position: 'fixed', top: pos.top, left: pos.left, width: WIDTH,
      background: t.surface, border: `1px solid ${t.line}`, borderRadius: 4,
      boxShadow: t.shadowFlyout, zIndex: 1000, padding: 10,
      display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none',
    }}>
      {entry.image && (
        <div style={{
          width: '100%', height: 120, borderRadius: 3, overflow: 'hidden',
          background: t.paper2, border: `1px solid ${t.line2}`, flexShrink: 0,
        }}>
          <img src={entry.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ fontFamily: t.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: t.ink }}>
        {entry.title}
      </div>
      <div style={{ fontFamily: t.sans, fontSize: 11, lineHeight: 1.45, color: t.inkMute }}>
        {entry.description}
      </div>
    </div>,
    document.body,
  )
}

// ── HoverInfo ─────────────────────────────────────────────────────────────────
// Wrap any existing row/button to attach a long-hover preview tooltip, without
// touching that component's internals: <HoverInfo id="roads.roadShape"><TriggerRow .../></HoverInfo>
// No-ops (zero-cost, renders nothing extra) until `id` has an OPTION_INFO entry.

export function HoverInfo({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { open, close, triggerProps } = useHoverInfo(id)

  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open, close])

  return (
    <div ref={ref} {...triggerProps}>
      {children}
      {open && ref.current && <OptionInfoTooltip id={id} anchor={ref.current} />}
    </div>
  )
}
