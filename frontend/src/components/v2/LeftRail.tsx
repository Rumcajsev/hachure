import { useState } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { useMapStore } from '../../store/mapStore'
import { TerrainSidebarV3 } from './TerrainSidebarV3'
import { RoadsSidebarV3 } from './RoadsSidebarV3'
import { RiversSidebarV3 } from './RiversSidebarV3'
import { SettlementsSidebarV3 } from './SettlementsSidebarV3'
import { OverlaysSidebarV3 } from './OverlaysSidebarV3'
import { DisplaySidebarV3 } from './DisplaySidebarV3'

export type RailPanel = 'terrain' | 'roads' | 'rivers' | 'settlements' | 'overlays' | 'display'
export type RailTool = 'hand' | 'select'

const RAIL_W = 44

// ── Icons ─────────────────────────────────────────────────────────────────────

const ICON_HAND = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5.5V2.5a1 1 0 0 1 2 0v3" />
    <path d="M6 5V2a1 1 0 0 1 2 0v3.5" />
    <path d="M8 5.2V3.5a1 1 0 0 1 2 0V7c0 2-1.5 3.5-3.5 3.5S3 9 3 7V5.5a1 1 0 0 1 2 0V6" />
  </svg>
)

const ICON_SELECT = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 2 L2 9 L4.5 7 L6 10.5 L7.5 9.8 L6 6.5 L9 6.5 Z" />
  </svg>
)

const ICON_TERRAIN = (
  <svg width="15" height="15" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6,1 10.2,3.5 10.2,8.5 6,11 1.8,8.5 1.8,3.5" />
  </svg>
)

const ICON_ROADS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <path d="M3 11 L5 1" />
    <path d="M9 11 L7 1" />
    <line x1="4.5" y1="8.5" x2="7.5" y2="8.5" strokeDasharray="1.2 1.2" />
    <line x1="5" y1="5.5" x2="7" y2="5.5" strokeDasharray="1.2 1.2" />
  </svg>
)

const ICON_RIVERS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <path d="M1 4 C3 4 3 2 5 2 C7 2 7 4 9 4 C11 4 11 3 11 3" />
    <path d="M1 8 C3 8 4 6 6 7 C8 8 9 7 11 7" strokeWidth="0.9" opacity="0.6" />
  </svg>
)

const ICON_SETTLEMENTS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="6" width="4" height="5" />
    <path d="M1 6 L3 3.5 L5 6" />
    <rect x="7" y="4" width="4" height="7" />
    <path d="M7 4 L9 1.5 L11 4" />
    <line x1="8.5" y1="7.5" x2="8.5" y2="11" />
  </svg>
)

const ICON_OVERLAYS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6,1.5 7.5,4.5 11,5 8.5,7.5 9,11 6,9.5 3,11 3.5,7.5 1,5 4.5,4.5" />
  </svg>
)

const ICON_SETTINGS = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="1.8" />
    <path d="M6 1.5 L6 2.5" />
    <path d="M6 9.5 L6 10.5" />
    <path d="M1.5 6 L2.5 6" />
    <path d="M9.5 6 L10.5 6" />
    <path d="M3.05 3.05 L3.75 3.75" />
    <path d="M8.25 8.25 L8.95 8.95" />
    <path d="M8.95 3.05 L8.25 3.75" />
    <path d="M3.75 8.25 L3.05 8.95" />
  </svg>
)

const TOOLS: { id: RailTool; label: string; icon: React.ReactNode }[] = [
  { id: 'hand',   label: 'Pan',    icon: ICON_HAND   },
  { id: 'select', label: 'Select', icon: ICON_SELECT },
]

const PANELS: { id: RailPanel; label: string; icon: React.ReactNode }[] = [
  { id: 'terrain',     label: 'Terrain',     icon: ICON_TERRAIN     },
  { id: 'roads',       label: 'Roads',       icon: ICON_ROADS       },
  { id: 'rivers',      label: 'Rivers',      icon: ICON_RIVERS      },
  { id: 'settlements', label: 'Settlements', icon: ICON_SETTLEMENTS },
  { id: 'overlays',    label: 'Overlays',    icon: ICON_OVERLAYS    },
  { id: 'display',     label: 'Settings',    icon: ICON_SETTINGS    },
]

// ── RailBtn ───────────────────────────────────────────────────────────────────

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
        borderRadius: 4,
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

// ── LeftRail ──────────────────────────────────────────────────────────────────

export function LeftRail() {
  const t = useTheme()
  const { activeTool: storeActiveTool, setActiveTool: storeSetActiveTool } = useMapStore()
  const [activePanel, setActivePanel] = useState<RailPanel | null>(null)

  const activeRailTool: RailTool | null =
    storeActiveTool.type === 'none' ? 'hand'
    : storeActiveTool.type === 'select' ? 'select'
    : null

  const handleToolClick = (id: RailTool) => {
    if (id === 'hand') storeSetActiveTool({ type: 'none' })
    else if (id === 'select') storeSetActiveTool({ type: 'select' })
  }

  const toolOwnerPanel: RailPanel | null = (() => {
    const tt = storeActiveTool.type
    if (tt === 'terrain' || tt === 'elevation' || tt === 'blob-mask' || tt === 'hex-mask' || tt === 'hex-disable') return 'terrain'
    if (tt === 'road' || tt === 'node-edit' || tt === 'road-select' || tt === 'rail' || tt === 'rail-node-edit' || tt === 'rail-select') return 'roads'
    if (tt === 'river-paint' || tt === 'river-select' || tt === 'river-node-edit') return 'rivers'
    if (tt === 'urban' || tt === 'label-drag' || tt === 'label-follow') return 'settlements'
    if (tt === 'highlight-paint' || tt === 'highlight-erase' || tt === 'highlight-erase-any' || tt === 'icon-place' || tt === 'icon-erase' || tt === 'icon-erase-any' || tt === 'label-place' || tt === 'label-erase') return 'overlays'
    return null
  })()

  const handlePanelClick = (id: RailPanel) => {
    storeSetActiveTool({ type: 'none' })
    setActivePanel(prev => prev === id ? null : id)
  }

  const flyout = activePanel === 'terrain'     ? <TerrainSidebarV3 />
    : activePanel === 'roads'       ? <RoadsSidebarV3 />
    : activePanel === 'rivers'      ? <RiversSidebarV3 />
    : activePanel === 'settlements' ? <SettlementsSidebarV3 />
    : activePanel === 'overlays'    ? <OverlaysSidebarV3 />
    : activePanel === 'display'     ? <DisplaySidebarV3 />
    : null

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Icon rail */}
      <div style={{
        width: RAIL_W,
        height: '100%',
        flexShrink: 0,
        background: t.surface,
        borderRight: activePanel ? `1px solid ${t.line}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 6,
        gap: 1,
      }}>
        {/* Tool buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', padding: '0 5px' }}>
          {TOOLS.map(({ id, label, icon }) => (
            <RailBtn
              key={id}
              label={label}
              icon={icon}
              active={activeRailTool === id}
              onClick={() => handleToolClick(id)}
            />
          ))}
        </div>

        {/* Divider */}
        <div style={{
          width: 24,
          height: 1,
          background: t.line,
          margin: '4px 0',
          flexShrink: 0,
        }} />

        {/* Panel buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', padding: '0 5px' }}>
          {PANELS.map(({ id, label, icon }) => (
            <RailBtn
              key={id}
              label={label}
              icon={icon}
              active={activePanel === id || toolOwnerPanel === id}
              onClick={() => handlePanelClick(id)}
            />
          ))}
        </div>
      </div>

      {/* Flyout panel */}
      {activePanel && flyout}
    </div>
  )
}
