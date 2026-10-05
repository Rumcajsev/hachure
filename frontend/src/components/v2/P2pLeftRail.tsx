import { useTheme } from '../../context/ThemeContext'
import { useMapStore } from '../../store/mapStore'
import { P2P_TERRAIN_TYPES, type P2pTerrainType } from '../../store/slices/p2pTerrainSlice'
import { DEFAULT_P2P_TERRAIN_STYLES } from '../../lib/drawP2pTerrain'
import { BrushRow, StripShell } from './sidebar'

const TERRAIN_LABELS: Record<P2pTerrainType, string> = {
  fields: 'Fields',
  light_forest: 'Light Forest',
  heavy_forest: 'Heavy Forest',
  swamp: 'Swamp',
}

/** Minimal placeholder sidebar for p2p mode — just the terrain brush for now.
 *  Phase 7 replaces this with full Network/Terrain/Rivers panels. */
export function P2pLeftRail() {
  const t = useTheme()
  const { p2pBrush, setP2pBrush } = useMapStore()

  const selectBrush = (v: P2pTerrainType | 'eraser') => {
    setP2pBrush(p2pBrush === v ? 'off' : v)
  }

  return (
    <StripShell>
      <div style={{ padding: '10px 12px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
        Terrain Brush
      </div>
      {P2P_TERRAIN_TYPES.map(terrain => (
        <BrushRow
          key={terrain}
          label={TERRAIN_LABELS[terrain]}
          color={DEFAULT_P2P_TERRAIN_STYLES[terrain].color}
          active={p2pBrush === terrain}
          onSelect={() => selectBrush(terrain)}
        />
      ))}
      <BrushRow
        label="Eraser"
        color="#cc4444"
        active={p2pBrush === 'eraser'}
        onSelect={() => selectBrush('eraser')}
      />
    </StripShell>
  )
}
