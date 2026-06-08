import type { MapStore, RiverStyleConfig, RiverTierStyle, RiverTier, RiverEdge, OsmRiverWay } from '../mapStore'
import { DEFAULT_RIVER_STYLE, DEFAULT_CANAL_STYLE, DEFAULT_RIVER_TIER_STYLES, waterwayTypeToTier } from '../mapStore'

export type RiversSlice = {
  osmRiverWays: OsmRiverWay[]
  riversOsmStatus: 'idle' | 'loading' | 'error' | 'done'
  riversOsmError: string | null
  hoveredOsmRiverIdx: number | null
  appliedOsmRiverIndices: number[]
  fetchRivers: () => Promise<void>
  toggleOsmRiver: (idx: number) => void
  setHoveredOsmRiverIdx: (idx: number | null) => void
  clearOsmRivers: () => void
  riverEdges: RiverEdge[]
  canalEdges: RiverEdge[]
  showRiverLabels: boolean
  riverLabelColor: string
  riverSegmentProps: Record<string, { width?: number; taper?: number; taperRange?: [number, number]; wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number }>
  canalSegmentProps: Record<string, { width?: number; taper?: number; taperRange?: [number, number] }>
  riverSelectMode: boolean
  canalSelectMode: boolean
  selectedSegmentKeys: string[]
  selectedCanalSegmentKeys: string[]
  riverTierStyles: [RiverTierStyle, RiverTierStyle, RiverTierStyle]
  riverStyle: RiverStyleConfig   // legacy, kept for migration
  canalStyle: RiverStyleConfig
  riverEditMode: boolean
  riverPaintTier: RiverTier
  canalEditMode: boolean
  riverWidthScale: number        // legacy, kept for migration
  canalWidthScale: number
  // riverFlowStyle: number  — defined but never wired to canvas or UI
  riverCurveSteps: number
  riverWobble: number
  riverDetail: number
  // riverWiggliness: number  — defined but never wired to canvas or UI
  riverWiggleFreq: number
  riverWiggleAmp: number
  riverSmoothing: number
  riverPathSmoothing: number
  riverNodeEditMode: boolean
  riverChainOverrides: Record<string, [number, number][]>
  riverHopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number; width?: number; taper?: number }>
  selectedHopKey: string | null
  setRiverChainOverride: (segKey: string, pts: [number, number][]) => void
  deleteRiverChainOverride: (segKey: string) => void
  clearRiverChainOverrides: () => void
  setRiverHopProp: (hopKey: string, prop: { wiggleAmp?: number; wiggleFreq?: number; width?: number; taper?: number }) => void
  clearRiverHopProp: (hopKey: string) => void
  setSelectedHopKey: (key: string | null) => void
  setShowRiverLabels: (v: boolean) => void
  setRiverLabelColor: (v: string) => void
  toggleRiverEdge: (q1: number, r1: number, q2: number, r2: number) => void
  setRiverEdges: (edges: { q1: number; r1: number; q2: number; r2: number }[]) => void
  setRiverSelectMode: (v: boolean) => void
  setSelectedSegmentKeys: (keys: string[]) => void
  toggleSegmentSelection: (key: string) => void
  setRiverSegmentProp: (key: string, prop: { width?: number; taper?: number; taperRange?: [number, number]; wiggleAmp?: number; wiggleFreq?: number }) => void
  setRiverSegmentPropMany: (keys: string[], prop: { width?: number; taper?: number; taperRange?: [number, number]; wiggleAmp?: number; wiggleFreq?: number }) => void
  clearRiverSegmentProp: (key: string) => void
  clearRiverSegmentPropMany: (keys: string[]) => void
  setRiverTierStyle: (tier: RiverTier, s: Partial<RiverTierStyle>) => void
  setRiverStyle: (s: Partial<RiverStyleConfig>) => void   // legacy
  toggleCanalEdge: (q1: number, r1: number, q2: number, r2: number) => void
  setCanalSelectMode: (v: boolean) => void
  setSelectedCanalSegmentKeys: (keys: string[]) => void
  toggleCanalSegmentSelection: (key: string) => void
  setCanalSegmentProp: (key: string, prop: { width?: number; taper?: number; taperRange?: [number, number] }) => void
  setCanalSegmentPropMany: (keys: string[], prop: { width?: number; taper?: number; taperRange?: [number, number] }) => void
  clearCanalSegmentProp: (key: string) => void
  clearCanalSegmentPropMany: (keys: string[]) => void
  setCanalStyle: (s: Partial<RiverStyleConfig>) => void
  setCanalWidthScale: (v: number) => void
  setRiverWidthScale: (v: number) => void
  // setRiverFlowStyle: (v: number) => void  — detached
  setRiverCurveSteps: (v: number) => void
  setRiverWobble: (v: number) => void
  setRiverDetail: (v: number) => void
  // setRiverWiggliness: (v: number) => void  — detached
  setRiverWiggleFreq: (v: number) => void
  setRiverWiggleAmp: (v: number) => void
  setRiverSmoothing: (v: number) => void
  setRiverPathSmoothing: (v: number) => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

type SegProp = { width?: number; taper?: number; taperRange?: [number, number]; wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number }

const edgeKey = (q1: number, r1: number, q2: number, r2: number) => {
  const s1 = `${q1},${r1}`, s2 = `${q2},${r2}`
  return s1 < s2 ? `${s1}|${s2}` : `${s2}|${s1}`
}

function makeSegmentActions(
  propsKey: 'riverSegmentProps' | 'canalSegmentProps',
  selKey: 'selectedSegmentKeys' | 'selectedCanalSegmentKeys',
  set: Set,
  get: () => MapStore,
) {
  return {
    setSelectedKeys: (keys: string[]) => set({ [selKey]: keys } as Partial<MapStore>),
    toggleSelection: (key: string) => {
      const selected = get()[selKey]
      const next = selected.includes(key)
        ? selected.filter(k => k !== key)
        : [...selected, key]
      set({ [selKey]: next } as Partial<MapStore>)
    },
    setProp: (key: string, prop: SegProp) => {
      const props = get()[propsKey]
      set({ [propsKey]: { ...props, [key]: { ...(props[key] ?? {}), ...prop } } } as Partial<MapStore>)
    },
    setPropMany: (keys: string[], prop: SegProp) => {
      const props = get()[propsKey]
      const next = { ...props }
      for (const key of keys) next[key] = { ...(next[key] ?? {}), ...prop }
      set({ [propsKey]: next } as Partial<MapStore>)
    },
    clearProp: (key: string) => {
      const props = get()[propsKey]
      const next = { ...props }
      delete next[key]
      set({ [propsKey]: next } as Partial<MapStore>)
    },
    clearPropMany: (keys: string[]) => {
      const props = get()[propsKey]
      const next = { ...props }
      for (const key of keys) delete next[key]
      set({ [propsKey]: next } as Partial<MapStore>)
    },
  }
}

export const createRiversSlice = (set: Set, get: () => MapStore): RiversSlice => {
  const river = makeSegmentActions('riverSegmentProps', 'selectedSegmentKeys', set, get)
  const canal = makeSegmentActions('canalSegmentProps', 'selectedCanalSegmentKeys', set, get)

  return {
    osmRiverWays: [],
    riversOsmStatus: 'idle',
    riversOsmError: null,
    hoveredOsmRiverIdx: null,
    appliedOsmRiverIndices: [],

    riverEdges: [],
    canalEdges: [],
    showRiverLabels: true,
    riverLabelColor: '#2a5a8a',
    riverEditMode: false,
    riverPaintTier: 1 as RiverTier,
    canalEditMode: false,
    riverSegmentProps: {},
    canalSegmentProps: {},
    riverSelectMode: false,
    canalSelectMode: false,
    selectedSegmentKeys: [],
    selectedCanalSegmentKeys: [],
    riverTierStyles: DEFAULT_RIVER_TIER_STYLES.map(s => ({ ...s, effect: { ...s.effect } })) as [RiverTierStyle, RiverTierStyle, RiverTierStyle],
    riverStyle: { ...DEFAULT_RIVER_STYLE },   // legacy
    canalStyle: { ...DEFAULT_CANAL_STYLE },
    riverWidthScale: 1.0,   // legacy
    canalWidthScale: 0.45,
    // riverFlowStyle / riverWiggliness — detached
    riverCurveSteps: 3,
    riverWobble: 0,
    riverDetail: 0,
    riverWiggleFreq: 2.5,
    riverWiggleAmp: 0.25,
    riverSmoothing: 10,
    riverPathSmoothing: 0,
    riverNodeEditMode: false,
    riverChainOverrides: {},
    riverHopProps: {},
    selectedHopKey: null,

    setHoveredOsmRiverIdx: (idx) => set({ hoveredOsmRiverIdx: idx }),
    clearOsmRivers: () => set({ osmRiverWays: [], riversOsmStatus: 'idle', riversOsmError: null, hoveredOsmRiverIdx: null, appliedOsmRiverIndices: [] }),

    fetchRivers: async () => {
      const { generatedMetadata, hexOrientation } = get()
      if (!generatedMetadata) return
      set({ riversOsmStatus: 'loading', riversOsmError: null })
      try {
        const resp = await fetch('/api/generate/rivers', {
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
            hex_size_km: generatedMetadata.hex_size_km,
            types: ['river', 'stream', 'drain', 'canal'],
          }),
        })
        if (!resp.ok) throw new Error(await resp.text())
        const data = await resp.json()
        set({ osmRiverWays: data.rivers ?? [], riversOsmStatus: 'done' })
      } catch (e) {
        set({ riversOsmStatus: 'error', riversOsmError: String(e) })
      }
    },

    toggleOsmRiver: (idx) => {
      const { osmRiverWays, appliedOsmRiverIndices, riverEdges, canalEdges, riverSegmentProps, canalSegmentProps } = get()
      const way = osmRiverWays[idx]
      if (!way) return
      get().pushUndoSnapshot()

      const isRiver = way.type !== 'canal'
      const edgesKey = isRiver ? 'riverEdges' : 'canalEdges'
      const propsKey = isRiver ? 'riverSegmentProps' : 'canalSegmentProps'
      const existingEdges = isRiver ? riverEdges : canalEdges
      const existingProps = isRiver ? riverSegmentProps : canalSegmentProps

      const wayEdgeKeys = new Set<string>()
      for (const e of way.edges) {
        const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
        wayEdgeKeys.add(a < b ? `${a}|${b}` : `${b}|${a}`)
      }

      if (appliedOsmRiverIndices.includes(idx)) {
        const newEdges = existingEdges.filter(e => {
          const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
          return !wayEdgeKeys.has(a < b ? `${a}|${b}` : `${b}|${a}`)
        })
        const newProps = { ...existingProps }
        for (const k of wayEdgeKeys) delete newProps[k]
        set({
          [edgesKey]: newEdges,
          [propsKey]: newProps,
          appliedOsmRiverIndices: appliedOsmRiverIndices.filter(i => i !== idx),
        } as Partial<MapStore>)
      } else {
        const existingPairs = new Set(existingEdges.map(e => {
          const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
          return a < b ? `${a}|${b}` : `${b}|${a}`
        }))
        const tier = isRiver ? waterwayTypeToTier(way.type) : undefined
        const newEdges: RiverEdge[] = []
        const newProps: Record<string, { width: number }> = {}
        const edgeSet = new Set<string>()
        for (const e of way.edges) {
          const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
          const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
          if (existingPairs.has(pairKey) || edgeSet.has(pairKey)) continue
          edgeSet.add(pairKey)
          newEdges.push({ ...e, ...(tier !== undefined ? { tier } : {}) })
          newProps[pairKey] = { width: way.width_multiplier }
        }
        set(s => ({
          [edgesKey]: [...(s[edgesKey] as typeof newEdges), ...newEdges],
          [propsKey]: { ...(s[propsKey] as Record<string, { width: number }>), ...newProps },
          appliedOsmRiverIndices: [...s.appliedOsmRiverIndices, idx],
        }))
      }
    },

    setShowRiverLabels: (v) => set({ showRiverLabels: v }),
    setRiverLabelColor: (v) => set({ riverLabelColor: v }),
    setRiverSelectMode: (v) => set({ riverSelectMode: v, selectedSegmentKeys: [] }),
    setSelectedSegmentKeys: river.setSelectedKeys,
    toggleSegmentSelection: river.toggleSelection,
    setRiverSegmentProp: river.setProp,
    setRiverSegmentPropMany: river.setPropMany,
    clearRiverSegmentProp: river.clearProp,
    clearRiverSegmentPropMany: river.clearPropMany,
    setRiverTierStyle: (tier, s) => set(st => {
      const styles = [...st.riverTierStyles] as [RiverTierStyle, RiverTierStyle, RiverTierStyle]
      styles[tier] = { ...styles[tier], ...s }
      return { riverTierStyles: styles }
    }),
    setRiverStyle: (s) => set(st => ({ riverStyle: { ...st.riverStyle, ...s } })),

    toggleRiverEdge: (q1, r1, q2, r2) => {
      get().pushUndoSnapshot()
      const { riverEdges, riverPaintTier } = get()
      const k = edgeKey(q1, r1, q2, r2)
      const idx = riverEdges.findIndex(e => edgeKey(e.q1, e.r1, e.q2, e.r2) === k)
      set({ riverEdges: idx >= 0 ? riverEdges.filter((_, i) => i !== idx) : [...riverEdges, { q1, r1, q2, r2, tier: riverPaintTier }] })
    },
    setRiverEdges: (edges) => set({ riverEdges: edges }),

    toggleCanalEdge: (q1, r1, q2, r2) => {
      get().pushUndoSnapshot()
      const { canalEdges } = get()
      const k = edgeKey(q1, r1, q2, r2)
      const idx = canalEdges.findIndex(e => edgeKey(e.q1, e.r1, e.q2, e.r2) === k)
      set({ canalEdges: idx >= 0 ? canalEdges.filter((_, i) => i !== idx) : [...canalEdges, { q1, r1, q2, r2 }] })
    },
    setCanalSelectMode: (v) => set({ canalSelectMode: v, selectedCanalSegmentKeys: [] }),
    setSelectedCanalSegmentKeys: canal.setSelectedKeys,
    toggleCanalSegmentSelection: canal.toggleSelection,
    setCanalSegmentProp: canal.setProp,
    setCanalSegmentPropMany: canal.setPropMany,
    clearCanalSegmentProp: canal.clearProp,
    clearCanalSegmentPropMany: canal.clearPropMany,
    setCanalStyle: (s) => set(st => ({ canalStyle: { ...st.canalStyle, ...s } })),
    setCanalWidthScale: (v) => set({ canalWidthScale: v }),
    setRiverWidthScale: (v) => set({ riverWidthScale: v }),
    // setRiverFlowStyle / setRiverWiggliness — detached
    setRiverCurveSteps: (v) => set({ riverCurveSteps: v }),
    setRiverWobble: (v) => set({ riverWobble: v }),
    setRiverDetail: (v) => set({ riverDetail: v }),
    setRiverWiggleFreq: (v) => set({ riverWiggleFreq: v }),
    setRiverWiggleAmp: (v) => set({ riverWiggleAmp: v }),
    setRiverSmoothing: (v) => set({ riverSmoothing: v }),
    setRiverPathSmoothing: (v) => set({ riverPathSmoothing: v }),
    setRiverChainOverride: (segKey, pts) => set(s => ({ riverChainOverrides: { ...s.riverChainOverrides, [segKey]: pts } })),
    deleteRiverChainOverride: (segKey) => set(s => { const { [segKey]: _, ...rest } = s.riverChainOverrides; return { riverChainOverrides: rest } }),
    clearRiverChainOverrides: () => set({ riverChainOverrides: {} }),
    setRiverHopProp: (hopKey, prop) => set(s => ({ riverHopProps: { ...s.riverHopProps, [hopKey]: { ...(s.riverHopProps[hopKey] ?? {}), ...prop } } })),
    clearRiverHopProp: (hopKey) => set(s => { const { [hopKey]: _, ...rest } = s.riverHopProps; return { riverHopProps: rest } }),
    setSelectedHopKey: (key) => set({ selectedHopKey: key }),
  }
}
