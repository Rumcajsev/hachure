import type { MapStore } from '../mapStore'

/** Fixed palette, mirrors the reference prototype. Not user-configurable (yet). */
export const P2P_TERRAIN_TYPES = ['fields', 'light_forest', 'heavy_forest', 'swamp'] as const
export type P2pTerrainType = typeof P2P_TERRAIN_TYPES[number]

export interface P2pTerrainSlice {
  /** Sparse paint grid: cell key (format owned by the paint tool) -> terrain type. Unpainted cells are empty/clear. */
  p2pPaintLayer: Record<string, P2pTerrainType>
  p2pBrush: P2pTerrainType | 'eraser' | 'off'
  p2pMaxRegionSizeCm2: number
  p2pRiverSplitRegions: boolean

  setP2pBrush: (v: P2pTerrainType | 'eraser' | 'off') => void
  batchPaintP2pTerrain: (cells: { key: string; terrain: P2pTerrainType }[]) => void
  batchEraseP2pTerrain: (keys: string[]) => void
  setP2pMaxRegionSizeCm2: (v: number) => void
  setP2pRiverSplitRegions: (v: boolean) => void
  clearP2pTerrainPaint: () => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createP2pTerrainSlice = (set: Set, _get: () => MapStore): P2pTerrainSlice => ({
  p2pPaintLayer: {},
  p2pBrush: 'off',
  p2pMaxRegionSizeCm2: 60,
  p2pRiverSplitRegions: true,

  setP2pBrush: (v) => set({ p2pBrush: v }),

  batchPaintP2pTerrain: (cells) => set((s) => {
    if (!cells.length) return {}
    const next = { ...s.p2pPaintLayer }
    for (const { key, terrain } of cells) next[key] = terrain
    return { p2pPaintLayer: next }
  }),

  batchEraseP2pTerrain: (keys) => set((s) => {
    if (!keys.length) return {}
    const next = { ...s.p2pPaintLayer }
    for (const k of keys) delete next[k]
    return { p2pPaintLayer: next }
  }),

  setP2pMaxRegionSizeCm2: (v) => set({ p2pMaxRegionSizeCm2: v }),
  setP2pRiverSplitRegions: (v) => set({ p2pRiverSplitRegions: v }),

  clearP2pTerrainPaint: () => set({ p2pPaintLayer: {} }),
})
