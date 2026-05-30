import type { MapStore, RawRoadWay, RoadEdge, HexRoadPath, RoadTierStyle, RoadGeomOverride, ActiveTool, RoadV3TierGeom } from '../mapStore'
import { TIER_HIGHWAYS, HIGHWAY_TO_TIER, roadEdgeCanonicalKey, DEFAULT_ROAD_TIER_STYLES, DEFAULT_ROAD_GEOM, DEFAULT_ROAD_V3_TIER_GEOM } from '../mapStore'

export type RoadsSlice = {
  rawRoadWays: RawRoadWay[]
  osmHexPaths: HexRoadPath[]
  osmHighlightTier: 0 | 1 | 2 | null
  osmSpotlightMode: boolean
  osmSpotlightRadius: number
  osmSpotlightTiers: [boolean, boolean, boolean, boolean]
  roadEdges: RoadEdge[]
  roadControlOverrides: Record<string, [number, number]>
  roadsDisplayMode: 'raw' | 'per_hex'
  roadsVisibleTiers: [boolean, boolean, boolean]
  roadsStatus: 'idle' | 'loading' | 'error' | 'done'
  roadsError: string | null
  settlementRoadsStatus: 'idle' | 'loading' | 'error' | 'done'
  settlementRoadsError: string | null
  roadPaintMode: boolean
  roadPaintBrush: 0 | 1 | 2
  roadPaintEraser: boolean
  roadNodeEditMode: boolean
  roadWiggleAmp: number
  roadWiggleFreq: number
  roadSmoothing: number
  roadPathSmoothing: number
  roadChainOverrides: Record<string, [number, number][]>
  roadTierStyles: [RoadTierStyle, RoadTierStyle, RoadTierStyle]
  roadTierGeometry: [RoadGeomOverride | null, RoadGeomOverride | null, RoadGeomOverride | null]
  fetchRoads: () => Promise<void>
  fetchSettlementRoads: () => Promise<void>
  setOsmHighlightTier: (tier: 0 | 1 | 2 | null) => void
  applyOsmTier: (tier: 0 | 1 | 2) => void
  setOsmSpotlightMode: (v: boolean) => void
  setOsmSpotlightRadius: (v: number) => void
  setOsmSpotlightTiers: (tiers: [boolean, boolean, boolean, boolean]) => void
  setRoadsDisplayMode: (mode: 'raw' | 'per_hex') => void
  setRoadsVisibleTiers: (tiers: [boolean, boolean, boolean]) => void
  clearRoads: () => void
  clearManualRoads: () => void
  addRoadEdge: (q1: number, r1: number, q2: number, r2: number, tier: 0 | 1 | 2) => void
  removeRoadHexEdges: (q: number, r: number, tier: 0 | 1 | 2) => void
  removeAllRoadHexEdges: (q: number, r: number) => void
  removeRoadEdgeAllTiers: (q1: number, r1: number, q2: number, r2: number) => void
  setRoadPaintBrush: (v: 0 | 1 | 2) => void
  setRoadPaintEraser: (v: boolean) => void
  setRoadNodeEditMode: (v: boolean) => void
  roadSnapBindings: Record<string, string>
  setRoadControlOverride: (key: string, pos: [number, number]) => void
  deleteRoadControlOverride: (key: string) => void
  setRoadSnapBinding: (jtKey: string, emKey: string) => void
  deleteRoadSnapBinding: (jtKey: string) => void
  setRoadWiggleAmp: (v: number) => void
  setRoadWiggleFreq: (v: number) => void
  setRoadSmoothing: (v: number) => void
  setRoadPathSmoothing: (v: number) => void
  setRoadChainOverride: (id: string, pts: [number, number][]) => void
  deleteRoadChainOverride: (id: string) => void
  clearRoadChainOverrides: () => void
  setRoadTierStyle: (tier: 0 | 1 | 2, update: Partial<RoadTierStyle>) => void
  setRoadTierGeometry: (tier: 0 | 1 | 2, update: Partial<RoadGeomOverride>) => void
  clearRoadTierGeometry: (tier: 0 | 1 | 2) => void
  roadSegmentProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }>
  roadHopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }>
  roadDensityMinChain: number
  setRoadDensityMinChain: (v: number) => void
  showRawOsmRoads: boolean
  setShowRawOsmRoads: (v: boolean) => void
  roadSelectMode: boolean
  selectedRoadSegmentKeys: string[]
  selectedRoadHopKey: string | null
  setRoadSelectMode: (v: boolean) => void
  toggleRoadSegmentSelection: (key: string) => void
  setSelectedRoadSegmentKeys: (keys: string[]) => void
  setRoadSegmentProp: (key: string, prop: { wiggleAmp?: number; wiggleFreq?: number }) => void
  clearRoadSegmentProp: (key: string) => void
  setRoadHopProp: (key: string, prop: { wiggleAmp?: number; wiggleFreq?: number }) => void
  clearRoadHopProp: (key: string) => void
  setSelectedRoadHopKey: (key: string | null) => void
  roadWiggleDragging: boolean
  setRoadWiggleDragging: (v: boolean) => void
  roadRenderVersion: 'v2' | 'v3'
  roadV3TierGeom: [RoadV3TierGeom, RoadV3TierGeom, RoadV3TierGeom]
  setRoadRenderVersion: (v: 'v2' | 'v3') => void
  setRoadV3TierGeom: (tier: 0 | 1 | 2, update: Partial<RoadV3TierGeom>) => void
  resetRoadV3TierGeom: (tier: 0 | 1 | 2) => void
  motorwayHexes: [number, number][]
  motorwayHexesStatus: 'idle' | 'loading' | 'error' | 'done'
  motorwayHexesError: string | null
  motorwayHexesFast: boolean
  setMotorwayHexesFast: (v: boolean) => void
  fetchMotorwayHexes: () => Promise<void>
  applyMotorwayHexes: () => void
  clearMotorwayHexes: () => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createRoadsSlice = (set: Set, get: () => MapStore): RoadsSlice => ({
  rawRoadWays: [],
  osmHexPaths: [],
  osmHighlightTier: null,
  osmSpotlightMode: false,
  osmSpotlightRadius: 3,
  osmSpotlightTiers: [true, true, true, true] as [boolean, boolean, boolean, boolean],
  roadEdges: [],
  roadControlOverrides: {},
  roadsDisplayMode: 'per_hex',
  roadsVisibleTiers: [true, true, true],
  roadsStatus: 'idle',
  roadsError: null,
  settlementRoadsStatus: 'idle',
  settlementRoadsError: null,
  roadPaintMode: false,
  roadPaintBrush: 1,
  roadPaintEraser: false,
  roadNodeEditMode: false,
  roadWiggleAmp: DEFAULT_ROAD_GEOM.wiggleAmp,
  roadWiggleFreq: DEFAULT_ROAD_GEOM.wiggleFreq,
  roadSmoothing: DEFAULT_ROAD_GEOM.smoothing,
  roadPathSmoothing: DEFAULT_ROAD_GEOM.pathSmoothing,
  roadChainOverrides: {},
  roadSnapBindings: {},
  roadTierStyles: [...DEFAULT_ROAD_TIER_STYLES] as [RoadTierStyle, RoadTierStyle, RoadTierStyle],
  roadTierGeometry: [null, null, null],
  roadSegmentProps: {},
  roadHopProps: {},
  roadDensityMinChain: 1,
  showRawOsmRoads: false,
  roadSelectMode: false,
  selectedRoadSegmentKeys: [],
  selectedRoadHopKey: null,
  motorwayHexes: [],
  motorwayHexesStatus: 'idle',
  motorwayHexesError: null,
  motorwayHexesFast: true,

  clearRoads: () => set(s => ({
    rawRoadWays: [], osmHexPaths: [], osmHighlightTier: null, osmSpotlightMode: false, osmSpotlightTiers: [true, true, true, true] as [boolean, boolean, boolean, boolean],
    roadEdges: [], roadsVisibleTiers: [true, true, true], roadsStatus: 'idle', roadsError: null,
    roadPaintMode: false, roadPaintEraser: false, roadNodeEditMode: false, roadSnapBindings: {},
    activeTool: (s.activeTool.type === 'road' || s.activeTool.type === 'node-edit') ? { type: 'none' } as ActiveTool : s.activeTool,
  })),
  clearManualRoads: () => { get().pushUndoSnapshot(); set((s) => ({ roadEdges: s.roadEdges.filter((e) => !e.manual) })) },
  setOsmHighlightTier: (tier) => set({ osmHighlightTier: tier }),
  setOsmSpotlightMode: (v) => set({ osmSpotlightMode: v }),
  setOsmSpotlightRadius: (v) => set({ osmSpotlightRadius: v }),
  setOsmSpotlightTiers: (tiers) => set({ osmSpotlightTiers: tiers }),
  applyOsmTier: (tier) => {
    get().pushUndoSnapshot()
    const { osmHexPaths, roadEdges } = get()
    const existingPairs = new Set<string>()
    for (const e of roadEdges) {
      const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
      existingPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
    const edgeSet = new Set<string>()
    const newEdges: RoadEdge[] = []
    for (const path of osmHexPaths) {
      if ((HIGHWAY_TO_TIER[path.highway] ?? 2) !== tier) continue
      for (let i = 0; i < path.hexes.length - 1; i++) {
        const [q1, r1] = path.hexes[i]
        const [q2, r2] = path.hexes[i + 1]
        const dq = q2 - q1, dr = r2 - r1
        const adj = (dq === 1 && dr === 0) || (dq === -1 && dr === 0) ||
                    (dq === 0 && dr === 1) || (dq === 0 && dr === -1) ||
                    (dq === 1 && dr === -1) || (dq === -1 && dr === 1)
        if (!adj) continue
        const a = `${q1},${r1}`, b = `${q2},${r2}`
        const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
        if (existingPairs.has(pairKey)) continue
        const key = roadEdgeCanonicalKey(q1, r1, q2, r2, tier)
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          newEdges.push({ q1, r1, q2, r2, tier })
        }
      }
    }
    if (newEdges.length > 0) set(s => ({ roadEdges: [...s.roadEdges, ...newEdges] }))
  },
  setRoadsDisplayMode: (mode) => set({ roadsDisplayMode: mode }),
  setRoadsVisibleTiers: (tiers) => set({ roadsVisibleTiers: tiers }),
  setRoadDensityMinChain: (v) => set({ roadDensityMinChain: v }),
  setShowRawOsmRoads: (v) => set({ showRawOsmRoads: v }),

  fetchRoads: async () => {
    const { generatedMetadata, hexOrientation } = get()
    if (!generatedMetadata) return

    set({ roadsStatus: 'loading', roadsError: null })

    const highway_types = TIER_HIGHWAYS.flat()

    try {
      const resp = await fetch('/api/generate/roads', {
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
          highway_types,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()

      set({ rawRoadWays: data.raw_ways, osmHexPaths: data.hex_paths, roadChainOverrides: {}, roadSnapBindings: {}, roadsStatus: 'done' })
    } catch (e) {
      set({ roadsStatus: 'error', roadsError: String(e) })
    }
  },

  fetchSettlementRoads: async () => {
    const { generatedMetadata, hexOrientation, settlements } = get()
    if (!generatedMetadata) return

    const includedSettlements = settlements
      .filter((s) => s.included)
      .map((s) => ({ lat: s.lat, lon: s.lon, name: s.name }))
    if (includedSettlements.length < 2) return

    const highway_types = [...TIER_HIGHWAYS[0], ...TIER_HIGHWAYS[1]]

    set({ settlementRoadsStatus: 'loading', settlementRoadsError: null })

    try {
      const resp = await fetch('/api/generate/settlement-roads', {
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
          settlements: includedSettlements,
          highway_types,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()

      const edgeSet = new Set<string>()
      const roadEdges: RoadEdge[] = []
      for (const rh of data.road_hexes as RoadHex[]) {
        const tier = (HIGHWAY_TO_TIER[rh.highway] ?? 2) as 0 | 1 | 2
        for (const conn of rh.connections) {
          const key = roadEdgeCanonicalKey(rh.q, rh.r, conn.q, conn.r, tier)
          if (!edgeSet.has(key)) {
            edgeSet.add(key)
            roadEdges.push({ q1: rh.q, r1: rh.r, q2: conn.q, r2: conn.r, tier })
          }
        }
      }
      set({ rawRoadWays: data.raw_ways, roadEdges, roadChainOverrides: {}, roadSnapBindings: {}, settlementRoadsStatus: 'done' })
    } catch (e) {
      set({ settlementRoadsStatus: 'error', settlementRoadsError: String(e) })
    }
  },

  setRoadNodeEditMode: (v) => set({ roadNodeEditMode: v, ...(v ? { roadPaintMode: false, railPaintMode: false, terrainPaintMode: false } : {}) }),
  deleteRoadControlOverride: (key) => set(s => {
    const { [key]: _a, ...restOverrides } = s.roadControlOverrides
    const { [key]: _b, ...restBindings } = s.roadSnapBindings
    return { roadControlOverrides: restOverrides, roadSnapBindings: restBindings }
  }),
  setRoadSnapBinding: (jtKey, emKey) => set(s => ({ roadSnapBindings: { ...s.roadSnapBindings, [jtKey]: emKey } })),
  deleteRoadSnapBinding: (jtKey) => set(s => { const { [jtKey]: _, ...rest } = s.roadSnapBindings; return { roadSnapBindings: rest } }),
  setRoadWiggleAmp: (v) => set({ roadWiggleAmp: v }),
  setRoadWiggleFreq: (v) => set({ roadWiggleFreq: v }),
  setRoadSmoothing: (v) => set({ roadSmoothing: v }),
  setRoadPathSmoothing: (v) => set({ roadPathSmoothing: v }),
  setRoadChainOverride: (id, pts) => set(s => ({ roadChainOverrides: { ...s.roadChainOverrides, [id]: pts } })),
  deleteRoadChainOverride: (id) => set(s => { const { [id]: _, ...rest } = s.roadChainOverrides; return { roadChainOverrides: rest } }),
  clearRoadChainOverrides: () => set({ roadChainOverrides: {} }),
  setRoadPaintBrush: (v) => set({ roadPaintBrush: v }),
  setRoadPaintEraser: (v) => set({ roadPaintEraser: v }),
  setRoadControlOverride: (key, pos) => set(s => ({ roadControlOverrides: { ...s.roadControlOverrides, [key]: pos } })),

  addRoadEdge: (q1, r1, q2, r2, tier) => {
    const { roadEdges } = get()
    const newKey = roadEdgeCanonicalKey(q1, r1, q2, r2, tier)
    const pairKey = (e: RoadEdge) => {
      const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
      return a < b ? `${a}|${b}` : `${b}|${a}`
    }
    const thisPair = (() => { const a = `${q1},${r1}`, b = `${q2},${r2}`; return a < b ? `${a}|${b}` : `${b}|${a}` })()
    const filtered = roadEdges.filter((e) => pairKey(e) !== thisPair)
    if (filtered.some((e) => roadEdgeCanonicalKey(e.q1, e.r1, e.q2, e.r2, e.tier) === newKey)) return
    set({ roadEdges: [...filtered, { q1, r1, q2, r2, tier, manual: true }] })
  },

  removeRoadHexEdges: (q, r, tier) => {
    const { roadEdges } = get()
    set({ roadEdges: roadEdges.filter((e) => !(e.tier === tier && ((e.q1 === q && e.r1 === r) || (e.q2 === q && e.r2 === r)))) })
  },

  removeAllRoadHexEdges: (q, r) => {
    const { roadEdges } = get()
    set({ roadEdges: roadEdges.filter((e) => !((e.q1 === q && e.r1 === r) || (e.q2 === q && e.r2 === r))) })
  },

  removeRoadEdgeAllTiers: (q1, r1, q2, r2) => {
    const { roadEdges } = get()
    set({ roadEdges: roadEdges.filter((e) => !((e.q1 === q1 && e.r1 === r1 && e.q2 === q2 && e.r2 === r2) || (e.q1 === q2 && e.r1 === r2 && e.q2 === q1 && e.r2 === r1))) })
  },

  setRoadTierStyle: (tier, update) => set((state) => {
    const styles = [...state.roadTierStyles] as [RoadTierStyle, RoadTierStyle, RoadTierStyle]
    styles[tier] = { ...styles[tier], ...update }
    return { roadTierStyles: styles }
  }),

  setRoadTierGeometry: (tier, update) => set((state) => {
    const geoms = [...state.roadTierGeometry] as [RoadGeomOverride | null, RoadGeomOverride | null, RoadGeomOverride | null]
    const existing = geoms[tier] ?? {
      wiggleAmp: state.roadWiggleAmp,
      wiggleFreq: state.roadWiggleFreq,
      pathSmoothing: state.roadPathSmoothing,
      smoothing: state.roadSmoothing,
    }
    geoms[tier] = { ...existing, ...update }
    return { roadTierGeometry: geoms }
  }),

  clearRoadTierGeometry: (tier) => set((state) => {
    const geoms = [...state.roadTierGeometry] as [RoadGeomOverride | null, RoadGeomOverride | null, RoadGeomOverride | null]
    geoms[tier] = null
    return { roadTierGeometry: geoms }
  }),

  setRoadSelectMode: (v) => set({ roadSelectMode: v, selectedRoadSegmentKeys: [], selectedRoadHopKey: null }),
  setSelectedRoadSegmentKeys: (keys) => set({ selectedRoadSegmentKeys: keys }),
  toggleRoadSegmentSelection: (key) => set(s => ({
    selectedRoadSegmentKeys: s.selectedRoadSegmentKeys.includes(key)
      ? s.selectedRoadSegmentKeys.filter(k => k !== key)
      : [...s.selectedRoadSegmentKeys, key]
  })),
  setRoadSegmentProp: (key, prop) => set(s => ({ roadSegmentProps: { ...s.roadSegmentProps, [key]: { ...(s.roadSegmentProps[key] ?? {}), ...prop } } })),
  clearRoadSegmentProp: (key) => set(s => { const { [key]: _, ...rest } = s.roadSegmentProps; return { roadSegmentProps: rest } }),
  setRoadHopProp: (key, prop) => set(s => ({ roadHopProps: { ...s.roadHopProps, [key]: { ...(s.roadHopProps[key] ?? {}), ...prop } } })),
  clearRoadHopProp: (key) => set(s => { const { [key]: _, ...rest } = s.roadHopProps; return { roadHopProps: rest } }),
  setSelectedRoadHopKey: (key) => set({ selectedRoadHopKey: key }),
  roadWiggleDragging: false,
  setRoadWiggleDragging: (v) => set({ roadWiggleDragging: v }),
  roadRenderVersion: 'v2',
  roadV3TierGeom: [...DEFAULT_ROAD_V3_TIER_GEOM] as [RoadV3TierGeom, RoadV3TierGeom, RoadV3TierGeom],
  setRoadRenderVersion: (v) => set({ roadRenderVersion: v }),
  setRoadV3TierGeom: (tier, update) => set(state => {
    const geoms = [...state.roadV3TierGeom] as [RoadV3TierGeom, RoadV3TierGeom, RoadV3TierGeom]
    geoms[tier] = { ...geoms[tier], ...update }
    return { roadV3TierGeom: geoms }
  }),
  resetRoadV3TierGeom: (tier) => set(state => {
    const geoms = [...state.roadV3TierGeom] as [RoadV3TierGeom, RoadV3TierGeom, RoadV3TierGeom]
    geoms[tier] = { ...DEFAULT_ROAD_V3_TIER_GEOM[tier] }
    return { roadV3TierGeom: geoms }
  }),

  clearMotorwayHexes: () => set({ motorwayHexes: [], motorwayHexesStatus: 'idle', motorwayHexesError: null }),
  setMotorwayHexesFast: (v) => set({ motorwayHexesFast: v }),

  fetchMotorwayHexes: async () => {
    const { generatedMetadata, hexOrientation, motorwayHexesFast } = get()
    if (!generatedMetadata) return
    set({ motorwayHexesStatus: 'loading', motorwayHexesError: null })
    try {
      const resp = await fetch('/api/generate/motorway-hexes', {
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
          fast: motorwayHexesFast,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      set({ motorwayHexes: data.hexes, motorwayHexesStatus: 'done' })
    } catch (e) {
      set({ motorwayHexesStatus: 'error', motorwayHexesError: String(e) })
    }
  },

  applyMotorwayHexes: () => {
    const { motorwayHexes, roadEdges } = get()
    if (motorwayHexes.length === 0) return
    get().pushUndoSnapshot()
    const hexSet = new Set(motorwayHexes.map(([q, r]) => `${q},${r}`))
    const existingPairs = new Set<string>()
    for (const e of roadEdges) {
      const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
      existingPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
    const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
    const edgeSet = new Set<string>()
    const newEdges: RoadEdge[] = []
    for (const [q, r] of motorwayHexes) {
      for (const [dq, dr] of dirs) {
        const nq = q + dq, nr = r + dr
        if (!hexSet.has(`${nq},${nr}`)) continue
        const a = `${q},${r}`, b = `${nq},${nr}`
        const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
        if (existingPairs.has(pairKey) || edgeSet.has(pairKey)) continue
        edgeSet.add(pairKey)
        newEdges.push({ q1: q, r1: r, q2: nq, r2: nr, tier: 0 })
      }
    }
    if (newEdges.length > 0) set(s => ({ roadEdges: [...s.roadEdges, ...newEdges] }))
  },
})
