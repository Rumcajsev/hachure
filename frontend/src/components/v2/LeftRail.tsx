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
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
)

const ICON_SELECT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
  </svg>
)

// Lucide-set icons (ISC license), restyled at 1.75 stroke to match the rail's hairline weight.

const ICON_TERRAIN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
  </svg>
)

const ICON_ROADS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v4" />
    <path d="M12 5V3" />
    <path d="M12 9v3" />
    <path d="M2.077 18.449A2 2 0 0 0 4 21h16a2 2 0 0 0 1.924-2.55l-4-14A2 2 0 0 0 16 3H8a2 2 0 0 0-1.924 1.45z" />
  </svg>
)

const ICON_RIVERS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" />
    <path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" />
    <path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />
  </svg>
)

const ICON_SETTLEMENTS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12.681 4.24.834-.715a1.45 1.45 0 0 1 1.88 0l5.09 4.364A1.45 1.45 0 0 1 21 9v6.546a1.45 1.45 0 0 1-1 1.381" />
    <path d="M15.485 11.889A1.45 1.45 0 0 1 16 13v6.546A1.454 1.454 0 0 1 14.546 21H4.364a1.454 1.454 0 0 1-1.454-1.454V13a1.45 1.45 0 0 1 .515-1.111l5.09-4.364a1.45 1.45 0 0 1 1.88 0z" />
    <path d="M7.41 20.546v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4" />
  </svg>
)

const ICON_OVERLAYS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
    <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
    <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
  </svg>
)

const ICON_SETTINGS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
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
    <div style={{ display: 'flex', height: '100%', alignItems: 'flex-start' }}>
      {/* Icon rail */}
      <div style={{
        width: RAIL_W,
        flexShrink: 0,
        background: t.surface,
        borderRight: activePanel ? `1px solid ${t.line}` : 'none',
        boxShadow: t.shadowFlyout,
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
