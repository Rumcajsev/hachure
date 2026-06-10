import { useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

export type V3Tool =
  | 'hand'
  | 'select'
  | 'terrain'
  | 'roads'
  | 'rivers'
  | 'settlements'
  | 'highlights'
  | 'display'

// Tools that open a popout strip when activated
export const TOOLS_WITH_POPOUT: V3Tool[] = [
  'terrain', 'roads', 'rivers', 'settlements', 'highlights', 'display',
]

export const RAIL_W = 44

// ── Icons — minimal strokes, viewBox 0 0 12 12, matching V2 SVG style ─────────

const ICON_HAND = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6V2.5a1 1 0 0 1 2 0V6" />
    <path d="M6 4.5a1 1 0 0 1 2 0V6" />
    <path d="M8 5a1 1 0 0 1 2 0v1.5C10 9 8.5 11 6 11c-2 0-3.5-1.5-3.5-3.5V6.5a1 1 0 0 1 2 0" />
  </svg>
)

const ICON_SELECT = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 2l7 3.5-3 1L4.5 10 2 2z" />
  </svg>
)

const ICON_TERRAIN = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2.5 C10 3 10 4 9.5 4.5 L5 9 L3 9 L3 7 L7.5 2.5 C8 2 9 2 9.5 2.5Z" />
    <path d="M7.5 4.5 L8.5 3.5" />
    <path d="M2 10 L10 10" />
  </svg>
)

const ICON_ROADS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <path d="M2 10 Q4 6 6 2" />
    <path d="M10 10 Q8 6 6 2" />
    <line x1="3.5" y1="7.5" x2="8.5" y2="7.5" />
    <line x1="4.5" y1="5" x2="7.5" y2="5" />
  </svg>
)

const ICON_RIVERS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <path d="M1 4 C3 4 3 2 5 2 C7 2 7 4 9 4 C11 4 11 3 11 3" />
    <path d="M1 8 C3 8 4 6 6 7 C8 8 9 7 11 7" strokeWidth="0.9" opacity="0.6" />
  </svg>
)

const ICON_SETTLEMENTS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="6" cy="5" r="0.8" fill="currentColor" stroke="none" />
    <line x1="6" y1="7.5" x2="6" y2="10" />
    <line x1="4" y1="10" x2="8" y2="10" />
  </svg>
)

const ICON_HIGHLIGHTS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6,1.5 7.5,4.5 11,5 8.5,7.5 9,11 6,9.5 3,11 3.5,7.5 1,5 4.5,4.5" />
  </svg>
)

const ICON_DISPLAY = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <line x1="1" y1="3" x2="11" y2="3" />
    <line x1="1" y1="6" x2="11" y2="6" />
    <line x1="1" y1="9" x2="11" y2="9" />
    <circle cx="4" cy="3" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="5" cy="9" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const ICON_SETUP = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <circle cx="6" cy="6" r="2" />
    <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M9.5 2.5l-1 1M3.5 8.5l-1 1" />
  </svg>
)

const TOOLS: { id: V3Tool; label: string; icon: React.ReactNode }[] = [
  { id: 'hand',        label: 'Hand',        icon: ICON_HAND        },
  { id: 'select',      label: 'Select',      icon: ICON_SELECT      },
  { id: 'terrain',     label: 'Terrain',     icon: ICON_TERRAIN     },
  { id: 'roads',       label: 'Roads',       icon: ICON_ROADS       },
  { id: 'rivers',      label: 'Rivers',      icon: ICON_RIVERS      },
  { id: 'settlements', label: 'Settlements', icon: ICON_SETTLEMENTS },
  { id: 'highlights',  label: 'Highlights',  icon: ICON_HIGHLIGHTS  },
  { id: 'display',     label: 'Display',     icon: ICON_DISPLAY     },
]

interface IconRailProps {
  active: V3Tool | null
  onSelect: (tool: V3Tool) => void
  onSetup: () => void
}

export function IconRail({ active, onSelect, onSetup }: IconRailProps) {
  const t = useTheme()

  return (
    <div style={{
      width: RAIL_W,
      height: '100%',
      flexShrink: 0,
      background: t.surface,
      border: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 6,
      paddingBottom: 6,
    }}>
      {/* Main tools */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', padding: '0 5px' }}>
        {TOOLS.map(({ id, label, icon }) => (
          <RailBtn
            key={id}
            label={label}
            icon={icon}
            active={active === id}
            onClick={() => onSelect(id)}
          />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Setup at bottom */}
      <div style={{ width: '100%', padding: '0 5px', borderTop: `1px solid ${t.line2}`, paddingTop: 6, marginTop: 6 }}>
        <RailBtn
          label="Setup"
          icon={ICON_SETUP}
          active={false}
          onClick={onSetup}
        />
      </div>
    </div>
  )
}

function RailBtn({ label, icon, active, onClick }: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  const t = useTheme()
  const [hov, setHov] = useState(false)

  return (
    <button
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        cursor: 'pointer',
        background: active ? t.ink : hov ? t.paper2 : 'transparent',
        color: active ? t.surface : hov ? t.ink : t.inkFaint,
        transition: 'background 0.1s, color 0.1s',
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  )
}
