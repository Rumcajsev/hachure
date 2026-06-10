import { useTheme } from '../../context/ThemeContext'
import type { V3Tool } from './IconRail'

export const POPOUT_W = 180

const TOOL_LABELS: Record<string, string> = {
  terrain:     'Terrain',
  roads:       'Roads',
  rivers:      'Rivers',
  settlements: 'Settlements',
  highlights:  'Highlights',
  display:     'Display',
}

interface PopoutStripProps {
  tool: V3Tool
  onOpenSettings: () => void
  settingsOpen: boolean
}

export function PopoutStrip({ tool, onOpenSettings, settingsOpen }: PopoutStripProps) {
  const t = useTheme()

  return (
    <div style={{
      width: POPOUT_W,
      height: '100%',
      flexShrink: 0,
      background: t.surface,
      border: `1px solid ${t.line}`,
      borderLeft: 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '9px 12px 7px',
        borderBottom: `1px solid ${t.line2}`,
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: t.mono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: 0.5,
          color: t.ink,
        }}>
          {TOOL_LABELS[tool] ?? tool}
        </div>
      </div>

      {/* Tool-specific actions + mode switcher */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <ToolActions tool={tool} />
      </div>

      {/* Style settings toggle */}
      <div style={{ borderTop: `1px solid ${t.line2}`, flexShrink: 0 }}>
        <button
          onClick={onOpenSettings}
          style={{
            width: '100%',
            padding: '7px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: settingsOpen ? t.rustTint : 'transparent',
            border: 'none',
            borderTop: `1px solid ${t.line2}`,
            cursor: 'pointer',
            fontFamily: t.sans,
            fontSize: 12,
            color: settingsOpen ? t.rust : t.ink2,
            textAlign: 'left',
          }}
        >
          <span>Style settings</span>
          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint }}>›</span>
        </button>
      </div>
    </div>
  )
}

function ToolActions({ tool }: { tool: V3Tool }) {
  const t = useTheme()

  const placeholder = (text: string) => (
    <div style={{ padding: '6px 14px', fontFamily: t.sans, fontSize: 11, color: t.inkFaint, lineHeight: 1.5 }}>
      {text}
    </div>
  )

  switch (tool) {
    case 'terrain':     return placeholder('Generate · Paint · Classify')
    case 'roads':       return placeholder('Fetch Roads')
    case 'rivers':      return placeholder('Fetch Rivers')
    case 'settlements': return placeholder('Fetch Settlements')
    case 'highlights':  return placeholder('Draw · Erase')
    case 'display':     return placeholder('Display options')
    default:            return null
  }
}
