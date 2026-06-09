import { useTheme } from '../../context/ThemeContext'
import { TerrainSidebarV3 } from '../v2/TerrainSidebarV3'
import { DisplaySidebarV3 } from '../v2/DisplaySidebarV3'
import { FeaturesSidebarV3 } from '../v2/FeaturesSidebarV3'
import { OverlaysSidebarV3 } from '../v2/OverlaysSidebarV3'
import type { V3Panel } from './IconRail'

export const RIGHT_PANEL_W = 240

interface RightPanelProps {
  panel: V3Panel
  onClose: () => void
}

const PANEL_TITLES: Record<V3Panel, string> = {
  terrain: 'Terrain settings',
  roads: 'Roads settings',
  rivers: 'Rivers settings',
  settlements: 'Settlements settings',
  highlights: 'Highlights settings',
  overlays: 'Overlays settings',
  display: 'Display settings',
}

export function RightPanel({ panel, onClose }: RightPanelProps) {
  const t = useTheme()

  return (
    <div style={{
      width: RIGHT_PANEL_W,
      height: '100%',
      flexShrink: 0,
      background: t.surface,
      borderLeft: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: `1px solid ${t.line2}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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
          {PANEL_TITLES[panel]}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: t.inkFaint,
            padding: 2,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16">
            <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content — existing sidebar components slotted in */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PanelContent panel={panel} />
      </div>
    </div>
  )
}

function PanelContent({ panel }: { panel: V3Panel }) {
  switch (panel) {
    case 'terrain':     return <TerrainSidebarV3 />
    case 'display':     return <DisplaySidebarV3 />
    case 'roads':
    case 'rivers':
    case 'settlements':
    case 'highlights':  return <FeaturesSidebarV3 />
    case 'overlays':    return <OverlaysSidebarV3 />
    default:            return null
  }
}
