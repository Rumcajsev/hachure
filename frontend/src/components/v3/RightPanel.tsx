import { useTheme } from '../../context/ThemeContext'
import { TerrainSidebarV3 } from '../v2/TerrainSidebarV3'
import { DisplaySidebarV3 } from '../v2/DisplaySidebarV3'
import { FeaturesSidebarV3 } from '../v2/FeaturesSidebarV3'
import { OverlaysSidebarV3 } from '../v2/OverlaysSidebarV3'
import type { V3Tool } from './IconRail'

export const RIGHT_PANEL_W = 280

const PANEL_TITLES: Record<string, string> = {
  terrain:     'Terrain settings',
  roads:       'Roads settings',
  rivers:      'Rivers settings',
  settlements: 'Settlements settings',
  highlights:  'Highlights settings',
  display:     'Display settings',
}

interface RightPanelProps {
  panel: V3Tool
  onClose: () => void
}

export function RightPanel({ panel, onClose }: RightPanelProps) {
  const t = useTheme()

  return (
    <div style={{
      width: RIGHT_PANEL_W,
      height: '100%',
      flexShrink: 0,
      background: t.surface,
      border: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '9px 12px 7px',
        borderBottom: `1px solid ${t.line2}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        background: t.surface,
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: t.mono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: 0.5,
          color: t.ink,
        }}>
          {PANEL_TITLES[panel] ?? panel}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: t.inkFaint,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Content — existing v2 sidebar components slotted in */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PanelContent panel={panel} />
      </div>
    </div>
  )
}

function PanelContent({ panel }: { panel: V3Tool }) {
  switch (panel) {
    case 'terrain':     return <TerrainSidebarV3 />
    case 'display':     return <DisplaySidebarV3 />
    case 'roads':
    case 'rivers':
    case 'settlements':
    case 'highlights':  return <FeaturesSidebarV3 />
    default:            return <OverlaysSidebarV3 />
  }
}
