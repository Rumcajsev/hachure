import { useTheme } from '../../context/ThemeContext'
import type { V3Panel } from './IconRail'

export const POPOUT_W = 180

interface PopoutStripProps {
  panel: V3Panel
  onOpenSettings: () => void
  settingsOpen: boolean
}

const PANEL_LABELS: Record<V3Panel, string> = {
  terrain: 'Terrain',
  roads: 'Roads',
  rivers: 'Rivers',
  settlements: 'Settlements',
  highlights: 'Highlights',
  overlays: 'Overlays',
  display: 'Display',
}

export function PopoutStrip({ panel, onOpenSettings, settingsOpen }: PopoutStripProps) {
  const t = useTheme()

  return (
    <div style={{
      width: POPOUT_W,
      height: '100%',
      flexShrink: 0,
      background: t.surface,
      borderRight: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: `1px solid ${t.line2}`,
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: t.mono,
          fontSize: 9,
          letterSpacing: 1,
          textTransform: 'uppercase',
          fontWeight: 700,
          color: t.inkFaint,
        }}>
          {PANEL_LABELS[panel]}
        </div>
      </div>

      {/* Actions area — generate button + mode switcher */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <PanelActions panel={panel} />
      </div>

      {/* Settings toggle at the bottom */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${t.line2}`, flexShrink: 0 }}>
        <button
          onClick={onOpenSettings}
          style={{
            width: '100%',
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: settingsOpen ? t.paper2 : 'transparent',
            border: `1px solid ${settingsOpen ? t.line : 'transparent'}`,
            borderRadius: 5,
            cursor: 'pointer',
            color: t.ink2,
            fontFamily: t.mono,
            fontSize: 9,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l-1.4 1.4M4.5 11.5l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Style settings
        </button>
      </div>
    </div>
  )
}

function PanelActions({ panel }: { panel: V3Panel }) {
  const t = useTheme()

  const placeholder = (text: string) => (
    <div style={{ padding: '6px 12px', fontFamily: t.mono, fontSize: 10, color: t.inkFaint }}>
      {text}
    </div>
  )

  // Each panel will eventually wire its generate button and mode switcher here.
  // For now, the existing sidebar content is surfaced via the right panel settings area.
  switch (panel) {
    case 'terrain':      return placeholder('Generate · Paint · Classify')
    case 'roads':        return placeholder('Fetch Roads')
    case 'rivers':       return placeholder('Fetch Rivers')
    case 'settlements':  return placeholder('Fetch Settlements')
    case 'highlights':   return placeholder('Draw · Erase')
    case 'overlays':     return placeholder('Image · Grid overlay')
    case 'display':      return placeholder('Display options')
    default:             return null
  }
}
