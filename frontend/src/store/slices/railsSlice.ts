import type { MapStore, RawRailWay, RailEdge, HexRailPath, RailStyle, RailGeomOverride, ActiveTool } from '../mapStore'
import { railEdgeCanonicalKey, DEFAULT_RAIL_STYLE } from '../mapStore'

export type RailsSlice = {
  rawRailWays: RawRailWay[]
  osmRailHexPaths: HexRailPath[]
  osmRailHighlight: boolean
  railEdges: RailEdge[]
  railsFetchTypes: string[]
  railsStatus: 'idle' | 'loading' | 'error' | 'done'
  railsError: string | null
  railPaintMode: boolean
  railPaintEraser: boolean
  railStyle: RailStyle
  // Node edit
  railNodeEditMode: boolean
  railControlOverrides: Record<string, [number, number]>
  railSnapBindings: Record<string, string>
  // Wiggle / smoothing
  railWiggleAmp: number
  railWiggleFreq: number
  railSmoothing: number
  railPathSmoothing: number
  railGeomOverride: RailGeomOverride | null
  railWiggleDragging: boolean
  railChainOverrides: Record<string, [number, number][]>
  // Segment select
  railSelectMode: boolean
  selectedRailSegmentKeys: string[]
  selectedRailHopKey: string | null
  railSegmentProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }>
  railHopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }>
  // Actions
  setOsmRailHighlight: (v: boolean) => void
  fetchRails: () => Promise<void>
  applyOsmRails: () => void
  setRailsFetchTypes: (types: string[]) => void
  clearRails: () => void
  addRailEdge: (q1: number, r1: number, q2: number, r2: number) => void
  removeRailEdge: (q1: number, r1: number, q2: number, r2: number) => void
  batchAddRailEdges: (edges: { q1: number; r1: number; q2: number; r2: number }[]) => void
  batchRemoveRailEdges: (edges: { q1: number; r1: number; q2: number; r2: number }[]) => void
  removeRailHexEdges: (q: number, r: number) => void
  setRailPaintEraser: (v: boolean) => void
  setRailStyle: (update: Partial<RailStyle>) => void
  setRailNodeEditMode: (v: boolean) => void
  setRailControlOverride: (key: string, pos: [number, number]) => void
  deleteRailControlOverride: (key: string) => void
  setRailSnapBinding: (jtKey: string, emKey: string) => void
  deleteRailSnapBinding: (jtKey: string) => void
  setRailWiggleAmp: (v: number) => void
  setRailWiggleFreq: (v: number) => void
  setRailSmoothing: (v: number) => void
  setRailPathSmoothing: (v: number) => void
  setRailGeomOverride: (update: Partial<RailGeomOverride>) => void
  clearRailGeomOverride: () => void
  setRailWiggleDragging: (v: boolean) => void
  setRailChainOverride: (id: string, pts: [number, number][]) => void
  deleteRailChainOverride: (id: string) => void
  clearRailChainOverrides: () => void
  setRailSelectMode: (v: boolean) => void
  setSelectedRailSegmentKeys: (keys: string[]) => void
  toggleRailSegmentSelection: (key: string) => void
  setSelectedRailHopKey: (key: string | null) => void
  setRailSegmentProp: (key: string, prop: { wiggleAmp?: number; wiggleFreq?: number }) => void
  clearRailSegmentProp: (key: string) => void
  setRailHopProp: (key: string, prop: { wiggleAmp?: number; wiggleFreq?: number }) => void
  clearRailHopProp: (key: string) => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createRailsSlice = (set: Set, get: () => MapStore): RailsSlice => ({
  rawRailWays: [],
  osmRailHexPaths: [],
  osmRailHighlight: false,
  railEdges: [],
  railsFetchTypes: ['rail'],
  railsStatus: 'idle',
  railsError: null,
  railPaintMode: false,
  railPaintEraser: false,
  railStyle: { ...DEFAULT_RAIL_STYLE },
  railNodeEditMode: false,
  railControlOverrides: {},
  railSnapBindings: {},
  railWiggleAmp: 0,
  railWiggleFreq: 2.5,
  railSmoothing: 10,
  railPathSmoothing: 0,
  railGeomOverride: null,
  railWiggleDragging: false,
  railChainOverrides: {},
  railSelectMode: false,
  selectedRailSegmentKeys: [],
  selectedRailHopKey: null,
  railSegmentProps: {},
  railHopProps: {},

  setOsmRailHighlight: (v) => set({ osmRailHighlight: v }),

  clearRails: () => set(s => ({
    rawRailWays: [], osmRailHexPaths: [], osmRailHighlight: false,
    railEdges: [], railsStatus: 'idle', railsError: null,
    railPaintMode: false, railPaintEraser: false,
    railNodeEditMode: false, railControlOverrides: {}, railSnapBindings: {},
    railChainOverrides: {}, railSelectMode: false,
    selectedRailSegmentKeys: [], selectedRailHopKey: null,
    activeTool: (s.activeTool.type === 'rail' || s.activeTool.type === 'rail-node-edit' || s.activeTool.type === 'rail-select')
      ? { type: 'none' } as ActiveTool : s.activeTool,
  })),
  setRailsFetchTypes: (types) => set({ railsFetchTypes: types }),
  setRailPaintEraser: (v) => set({ railPaintEraser: v }),
  setRailStyle: (update) => set((state) => ({ railStyle: { ...state.railStyle, ...update } })),

  setRailNodeEditMode: (v) => set({ railNodeEditMode: v, ...(v ? { railPaintMode: false, roadPaintMode: false, terrainPaintMode: false } : {}) }),
  setRailControlOverride: (key, pos) => set(s => ({ railControlOverrides: { ...s.railControlOverrides, [key]: pos } })),
  deleteRailControlOverride: (key) => set(s => { const { [key]: _, ...rest } = s.railControlOverrides; return { railControlOverrides: rest } }),
  setRailSnapBinding: (jtKey, emKey) => set(s => ({ railSnapBindings: { ...s.railSnapBindings, [jtKey]: emKey } })),
  deleteRailSnapBinding: (jtKey) => set(s => { const { [jtKey]: _, ...rest } = s.railSnapBindings; return { railSnapBindings: rest } }),
  setRailWiggleAmp: (v) => set({ railWiggleAmp: v }),
  setRailWiggleFreq: (v) => set({ railWiggleFreq: v }),
  setRailSmoothing: (v) => set({ railSmoothing: v }),
  setRailPathSmoothing: (v) => set({ railPathSmoothing: v }),
  setRailGeomOverride: (update) => set(s => {
    const existing = s.railGeomOverride ?? {
      wiggleAmp: s.railWiggleAmp,
      wiggleFreq: s.railWiggleFreq,
      pathSmoothing: s.railPathSmoothing,
      smoothing: s.railSmoothing,
    }
    return { railGeomOverride: { ...existing, ...update } }
  }),
  clearRailGeomOverride: () => set({ railGeomOverride: null }),
  setRailWiggleDragging: (v) => set({ railWiggleDragging: v }),
  setRailChainOverride: (id, pts) => set(s => ({ railChainOverrides: { ...s.railChainOverrides, [id]: pts } })),
  deleteRailChainOverride: (id) => set(s => { const { [id]: _, ...rest } = s.railChainOverrides; return { railChainOverrides: rest } }),
  clearRailChainOverrides: () => set({ railChainOverrides: {} }),
  setRailSelectMode: (v) => set({ railSelectMode: v, selectedRailSegmentKeys: [], selectedRailHopKey: null }),
  setSelectedRailSegmentKeys: (keys) => set({ selectedRailSegmentKeys: keys }),
  toggleRailSegmentSelection: (key) => set(s => ({
    selectedRailSegmentKeys: s.selectedRailSegmentKeys.includes(key)
      ? s.selectedRailSegmentKeys.filter(k => k !== key)
      : [...s.selectedRailSegmentKeys, key],
  })),
  setSelectedRailHopKey: (key) => set({ selectedRailHopKey: key }),
  setRailSegmentProp: (key, prop) => set(s => ({ railSegmentProps: { ...s.railSegmentProps, [key]: { ...(s.railSegmentProps[key] ?? {}), ...prop } } })),
  clearRailSegmentProp: (key) => set(s => { const { [key]: _, ...rest } = s.railSegmentProps; return { railSegmentProps: rest } }),
  setRailHopProp: (key, prop) => set(s => ({ railHopProps: { ...s.railHopProps, [key]: { ...(s.railHopProps[key] ?? {}), ...prop } } })),
  clearRailHopProp: (key) => set(s => { const { [key]: _, ...rest } = s.railHopProps; return { railHopProps: rest } }),

  fetchRails: async () => {
    const { generatedMetadata, hexOrientation, railsFetchTypes } = get()
    if (!generatedMetadata) return
    set({ railsStatus: 'loading', railsError: null })
    try {
      const resp = await fetch('/api/generate/rails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_lon: generatedMetadata.center[0],
          center_lat: generatedMetadata.center[1],
          bearing: generatedMetadata.bearing,
          width_m: generatedMetadata.scale_m_per_mm * generatedMetadata.paper_mm[0],
          height_m: generatedMetadata.scale_m_per_mm * generatedMetadata.paper_mm[1],
          hex_orientation: hexOrientation,
          R_m: generatedMetadata.outer_radius_m,
          rail_types: railsFetchTypes,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      set({ rawRailWays: data.raw_ways, osmRailHexPaths: data.hex_paths ?? [], railsStatus: 'done' })
    } catch (e) {
      set({ railsStatus: 'error', railsError: String(e) })
    }
  },

  applyOsmRails: () => {
    get().pushUndoSnapshot()
    const { osmRailHexPaths, railEdges } = get()
    const existingPairs = new Set<string>()
    for (const e of railEdges) {
      const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
      existingPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
    const edgeSet = new Set<string>()
    const newEdges: RailEdge[] = []
    for (const path of osmRailHexPaths) {
      for (let i = 0; i < path.hexes.length - 1; i++) {
        const [q1, r1] = path.hexes[i], [q2, r2] = path.hexes[i + 1]
        const dq = q2 - q1, dr = r2 - r1
        const adj = (dq === 1 && dr === 0) || (dq === -1 && dr === 0) ||
                    (dq === 0 && dr === 1) || (dq === 0 && dr === -1) ||
                    (dq === 1 && dr === -1) || (dq === -1 && dr === 1)
        if (!adj) continue
        const a = `${q1},${r1}`, b = `${q2},${r2}`
        const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
        if (existingPairs.has(pairKey)) continue
        const key = railEdgeCanonicalKey(q1, r1, q2, r2)
        if (!edgeSet.has(key)) { edgeSet.add(key); newEdges.push({ q1, r1, q2, r2 }) }
      }
    }
    if (newEdges.length > 0) set(s => ({ railEdges: [...s.railEdges, ...newEdges] }))
  },

  addRailEdge: (q1, r1, q2, r2) => {
    const { railEdges } = get()
    const key = railEdgeCanonicalKey(q1, r1, q2, r2)
    if (railEdges.some((e) => railEdgeCanonicalKey(e.q1, e.r1, e.q2, e.r2) === key)) return
    set({ railEdges: [...railEdges, { q1, r1, q2, r2, manual: true }] })
  },
  batchAddRailEdges: (edges) => {
    if (edges.length === 0) return
    const existingKeys = new Set(get().railEdges.map(e => railEdgeCanonicalKey(e.q1, e.r1, e.q2, e.r2)))
    const toAdd = edges.filter(({ q1, r1, q2, r2 }) => !existingKeys.has(railEdgeCanonicalKey(q1, r1, q2, r2)))
    if (toAdd.length === 0) return
    set(s => ({ railEdges: [...s.railEdges, ...toAdd.map(({ q1, r1, q2, r2 }) => ({ q1, r1, q2, r2, manual: true as const }))] }))
  },
  batchRemoveRailEdges: (edges) => {
    if (edges.length === 0) return
    const removeKeys = new Set(edges.map(({ q1, r1, q2, r2 }) => railEdgeCanonicalKey(q1, r1, q2, r2)))
    set(s => ({ railEdges: s.railEdges.filter(e => !removeKeys.has(railEdgeCanonicalKey(e.q1, e.r1, e.q2, e.r2))) }))
  },

  removeRailEdge: (q1, r1, q2, r2) => {
    const key = railEdgeCanonicalKey(q1, r1, q2, r2)
    set(s => ({ railEdges: s.railEdges.filter(e => railEdgeCanonicalKey(e.q1, e.r1, e.q2, e.r2) !== key) }))
  },

  removeRailHexEdges: (q, r) => {
    set(s => ({ railEdges: s.railEdges.filter(e => !((e.q1 === q && e.r1 === r) || (e.q2 === q && e.r2 === r))) }))
  },
})
