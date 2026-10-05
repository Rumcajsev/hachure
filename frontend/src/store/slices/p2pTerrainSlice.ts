import type { MapStore } from '../mapStore'
import { BLOB_PRESETS, type BlobPresetId } from '../blobPresets'

/** Fixed palette, mirrors the reference prototype. Not user-configurable (yet). */
export const P2P_TERRAIN_TYPES = ['fields', 'light_forest', 'heavy_forest', 'swamp'] as const
export type P2pTerrainType = typeof P2P_TERRAIN_TYPES[number]

/** The values P2pViewCanvas's drawP2pTerrain() call was hardcoded to before these
 *  became adjustable — kept as the defaults so turning the controls on changes nothing
 *  until a value is actually touched. */
export const DEFAULT_P2P_BLOB = {
  smooth: 2,
  offset: 0,
  bump: 0.15,
  sweepFreq: 2.5,
  lobeFreq: 1.2,
  lobeAmp: 0.4,
  lobeThreshold: 0.6,
  lobeDirection: 1 as const,
  topoStyle: 0,
}

export interface P2pTerrainSlice {
  /** Sparse paint grid: cell key (format owned by the paint tool) -> terrain type. Unpainted cells are empty/clear. */
  p2pPaintLayer: Record<string, P2pTerrainType>
  p2pBrush: P2pTerrainType | 'eraser' | 'off'
  p2pMaxRegionSizeCm2: number
  p2pRiverSplitRegions: boolean

  // Blob shape — same parameters/pipeline as hex mode's "Default Shape" (shapeTerrainBlobs),
  // applied uniformly to all 4 p2p terrain types (no per-type override yet).
  p2pBlobSmooth: number
  p2pBlobOffset: number
  p2pBlobBump: number
  p2pBlobSweepFreq: number
  p2pBlobLobeFreq: number
  p2pBlobLobeAmp: number
  p2pBlobLobeThreshold: number
  p2pBlobLobeDirection: 1 | -1
  p2pBlobTopoStyle: number
  p2pBlobOutlineEnabled: boolean
  p2pBlobOutlineColor: string
  p2pBlobOutlineWidth: number

  setP2pBrush: (v: P2pTerrainType | 'eraser' | 'off') => void
  batchPaintP2pTerrain: (cells: { key: string; terrain: P2pTerrainType }[]) => void
  batchEraseP2pTerrain: (keys: string[]) => void
  setP2pMaxRegionSizeCm2: (v: number) => void
  setP2pRiverSplitRegions: (v: boolean) => void
  clearP2pTerrainPaint: () => void

  setP2pBlobSmooth: (v: number) => void
  setP2pBlobOffset: (v: number) => void
  setP2pBlobBump: (v: number) => void
  setP2pBlobSweepFreq: (v: number) => void
  setP2pBlobLobeFreq: (v: number) => void
  setP2pBlobLobeAmp: (v: number) => void
  setP2pBlobLobeThreshold: (v: number) => void
  setP2pBlobLobeDirection: (v: 1 | -1) => void
  setP2pBlobTopoStyle: (v: number) => void
  setP2pBlobOutlineEnabled: (v: boolean) => void
  setP2pBlobOutlineColor: (v: string) => void
  setP2pBlobOutlineWidth: (v: number) => void
  applyP2pBlobPreset: (id: BlobPresetId) => void
  resetP2pBlobShape: () => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createP2pTerrainSlice = (set: Set, _get: () => MapStore): P2pTerrainSlice => ({
  p2pPaintLayer: {},
  p2pBrush: 'off',
  p2pMaxRegionSizeCm2: 60,
  p2pRiverSplitRegions: true,

  p2pBlobSmooth: DEFAULT_P2P_BLOB.smooth,
  p2pBlobOffset: DEFAULT_P2P_BLOB.offset,
  p2pBlobBump: DEFAULT_P2P_BLOB.bump,
  p2pBlobSweepFreq: DEFAULT_P2P_BLOB.sweepFreq,
  p2pBlobLobeFreq: DEFAULT_P2P_BLOB.lobeFreq,
  p2pBlobLobeAmp: DEFAULT_P2P_BLOB.lobeAmp,
  p2pBlobLobeThreshold: DEFAULT_P2P_BLOB.lobeThreshold,
  p2pBlobLobeDirection: DEFAULT_P2P_BLOB.lobeDirection,
  p2pBlobTopoStyle: DEFAULT_P2P_BLOB.topoStyle,
  p2pBlobOutlineEnabled: false,
  p2pBlobOutlineColor: '#000000',
  p2pBlobOutlineWidth: 1,

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

  setP2pBlobSmooth: (v) => set({ p2pBlobSmooth: v }),
  setP2pBlobOffset: (v) => set({ p2pBlobOffset: v }),
  setP2pBlobBump: (v) => set({ p2pBlobBump: v }),
  setP2pBlobSweepFreq: (v) => set({ p2pBlobSweepFreq: v }),
  setP2pBlobLobeFreq: (v) => set({ p2pBlobLobeFreq: v }),
  setP2pBlobLobeAmp: (v) => set({ p2pBlobLobeAmp: v }),
  setP2pBlobLobeThreshold: (v) => set({ p2pBlobLobeThreshold: v }),
  setP2pBlobLobeDirection: (v) => set({ p2pBlobLobeDirection: v }),
  setP2pBlobTopoStyle: (v) => set({ p2pBlobTopoStyle: v }),
  setP2pBlobOutlineEnabled: (v) => set({ p2pBlobOutlineEnabled: v }),
  setP2pBlobOutlineColor: (v) => set({ p2pBlobOutlineColor: v }),
  setP2pBlobOutlineWidth: (v) => set({ p2pBlobOutlineWidth: v }),

  applyP2pBlobPreset: (id) => {
    const values = BLOB_PRESETS[id].values
    set({
      p2pBlobSmooth: values.smooth,
      p2pBlobOffset: values.offset,
      p2pBlobBump: values.bump,
      p2pBlobSweepFreq: values.sweepFreq,
      p2pBlobLobeFreq: values.lobeFreq,
      p2pBlobLobeAmp: values.lobeAmp,
      p2pBlobLobeThreshold: values.lobeThreshold,
      p2pBlobLobeDirection: values.lobeDirection,
    })
  },

  resetP2pBlobShape: () => set({
    p2pBlobSmooth: DEFAULT_P2P_BLOB.smooth,
    p2pBlobOffset: DEFAULT_P2P_BLOB.offset,
    p2pBlobBump: DEFAULT_P2P_BLOB.bump,
    p2pBlobSweepFreq: DEFAULT_P2P_BLOB.sweepFreq,
    p2pBlobLobeFreq: DEFAULT_P2P_BLOB.lobeFreq,
    p2pBlobLobeAmp: DEFAULT_P2P_BLOB.lobeAmp,
    p2pBlobLobeThreshold: DEFAULT_P2P_BLOB.lobeThreshold,
    p2pBlobLobeDirection: DEFAULT_P2P_BLOB.lobeDirection,
    p2pBlobTopoStyle: DEFAULT_P2P_BLOB.topoStyle,
  }),
})
