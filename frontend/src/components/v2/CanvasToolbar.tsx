/** Floating bottom-center pill that shows options for the currently active tool.
 *  Appears only when an interactive editing tool is active. Stays out of the way otherwise. */

import { useMapStore, TERRAIN_COLORS } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'

const terrainLabel = (t: string) => t.replace(/_/g, ' ')

// ── Primitives ────────────────────────────────────────────────────────────────

function Bar({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      background: t.surface,
      border: `1px solid ${t.line}`,
      boxShadow: t.shadowFlyout,
      borderRadius: 6,
      pointerEvents: 'auto',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {children}
    </div>
  )
}

function Seg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 13px', height: 36, flexShrink: 0 }}>
      {children}
    </div>
  )
}

function Sep() {
  const t = useTheme()
  return <div style={{ width: 1, height: 20, background: t.line, flexShrink: 0 }} />
}

function ToggleBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <button
      onClick={onClick}
      style={{
        height: 36,
        padding: '0 13px',
        display: 'flex', alignItems: 'center', gap: 7,
        background: active ? t.ink : 'none',
        border: 'none',
        cursor: 'pointer',
        color: active ? t.surface : t.ink2,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <span style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.4, color: 'inherit', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function EdgeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6.5h11M6.5 1v11" strokeDasharray="2.5 1.5" />
      <path d="M2 4l2.5 2.5L2 9M11 4L8.5 6.5 11 9" />
    </svg>
  )
}

function BgIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="10" height="10" rx="1.5" strokeDasharray="2.5 1.5" />
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
    </svg>
  )
}

// ── Per-tool sections ─────────────────────────────────────────────────────────

function TerrainPaintBar() {
  const t = useTheme()
  const { activeTool, terrainColors, customTerrains, terrainEdgePaintEnabled, setTerrainEdgePaintEnabled, terrainBackgroundPaintEnabled, setTerrainBackgroundPaintEnabled } = useMapStore()
  if (activeTool.type !== 'terrain') return null

  const brush = activeTool.brush
  const color = terrainColors[brush] ?? TERRAIN_COLORS[brush] ?? '#888'
  const ct = customTerrains?.find((c: { id: string }) => c.id === brush)
  const label = ct ? ct.name : terrainLabel(brush)

  return (
    <Bar>
      {/* Current brush indicator */}
      <Seg>
        <div style={{
          width: 11, height: 11,
          borderRadius: 2,
          background: color,
          border: '1px solid rgba(0,0,0,0.18)',
          flexShrink: 0,
        }} />
        <span style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.4, color: t.ink2, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </Seg>

      <Sep />

      {/* Edge painting toggle */}
      <ToggleBtn active={terrainEdgePaintEnabled} onClick={() => setTerrainEdgePaintEnabled(!terrainEdgePaintEnabled)}>
        <EdgeIcon />
        <Label>Edge paint</Label>
      </ToggleBtn>

      <Sep />

      {/* Background painting toggle */}
      <ToggleBtn active={terrainBackgroundPaintEnabled} onClick={() => setTerrainBackgroundPaintEnabled(!terrainBackgroundPaintEnabled)}>
        <BgIcon />
        <Label>Bg paint</Label>
      </ToggleBtn>
    </Bar>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────

export function CanvasToolbar() {
  const { activeTool } = useMapStore()

  if (activeTool.type === 'terrain') return <TerrainPaintBar />

  return null
}
