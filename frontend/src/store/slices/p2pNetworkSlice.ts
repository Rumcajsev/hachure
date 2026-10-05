import type { MapStore } from '../mapStore'
import { generateP2pNetwork, makeP2pBoardProjection, type P2pPlaceInput } from '../../lib/p2pNetwork'
import { pageGridTotalMm, mapResolutionMpx } from '../mapStore'

export type P2pTownTier = 0 | 1 | 2

/** Raw fetched river, as returned by /api/generate/rivers in non-hex mode (no edges). */
export interface P2pRawRiver {
  name: string
  type: string
  coords: [number, number][]
  segments: [number, number][][]
  width_multiplier: number
}

export interface P2pTown {
  id: string
  lon: number
  lat: number
  name: string
  population: number
  tier: P2pTownTier
  supply: boolean
  /** 'filler' = a virtual crossroads inserted to break up an over-long edge, not a real settlement. */
  kind: 'place' | 'filler'
  isCustom?: boolean
}

/** Shape matches roadChains.ts's RoadEdgeInput exactly — no adapter needed to feed buildRoadChains. */
export interface P2pEdge {
  a: string
  b: string
  tier: 0 | 1 | 2
  points?: [number, number][]
}

export interface P2pNetworkSlice {
  p2pTowns: P2pTown[]
  p2pEdges: P2pEdge[]
  /** Live, editor-adjustable copy — distinct from setupSlice's p2pMinNodeDistCm/p2pMaxNodeDistCm,
   *  which only seed the very first generation. Regenerating the network reads these. */
  p2pNetworkMinDistCm: number
  p2pNetworkMaxDistCm: number
  p2pMaxNodes: number
  p2pSupplyCount: number
  p2pPruneFactor: number
  p2pCurviness: number
  p2pNetworkStatus: 'idle' | 'loading' | 'error' | 'done'
  p2pNetworkError: string | null
  /** Raw fetch results, kept so the network can be regenerated (new min/max distance,
   *  supply count, pruning, curviness) without re-fetching from Overpass. */
  p2pRawPlaces: P2pPlaceInput[]
  p2pRawRivers: P2pRawRiver[]
  /** Board dimensions fixed at first generation — same role generatedMetadata plays for hex mode. */
  p2pWidthKm: number
  p2pHeightKm: number

  /** Fetches settlements + rivers for the current viewport and runs the first generation. */
  generateP2pMap: () => Promise<void>
  /** Reruns town-selection/graph-building/routing against already-fetched data — no fetch. */
  regenerateP2pNetwork: () => void
  setP2pTowns: (towns: P2pTown[]) => void
  setP2pEdges: (edges: P2pEdge[]) => void
  addP2pTown: (town: P2pTown) => void
  moveP2pTown: (id: string, lon: number, lat: number) => void
  removeP2pTown: (id: string) => void
  batchSetP2pEdges: (edges: P2pEdge[]) => void
  setP2pEdgeTier: (a: string, b: string, tier: 0 | 1 | 2) => void
  removeP2pEdge: (a: string, b: string) => void
  setP2pNetworkMinDistCm: (v: number) => void
  setP2pNetworkMaxDistCm: (v: number) => void
  setP2pMaxNodes: (v: number) => void
  setP2pSupplyCount: (v: number) => void
  setP2pPruneFactor: (v: number) => void
  setP2pCurviness: (v: number) => void
  clearP2pNetwork: () => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export const createP2pNetworkSlice = (set: Set, get: () => MapStore): P2pNetworkSlice => ({
  p2pTowns: [],
  p2pEdges: [],
  p2pNetworkMinDistCm: 5,
  p2pNetworkMaxDistCm: 10,
  p2pMaxNodes: 400,
  p2pSupplyCount: 3,
  p2pPruneFactor: 1.0,
  p2pCurviness: 50,
  p2pNetworkStatus: 'idle',
  p2pNetworkError: null,
  p2pRawPlaces: [],
  p2pRawRivers: [],
  p2pWidthKm: 0,
  p2pHeightKm: 0,

  generateP2pMap: async () => {
    const { paperSize, orientation, pageGrid, bearing, center, zoom, framePixelWidth } = get()
    if (framePixelWidth === 0) return

    const [cwMm, chMm] = pageGridTotalMm(pageGrid)
    const res = mapResolutionMpx(center[1], zoom)
    const widthM = framePixelWidth * res
    const heightM = widthM * (chMm / cwMm)
    const widthKm = widthM / 1000, heightKm = heightM / 1000

    set({ p2pNetworkStatus: 'loading', p2pNetworkError: null })

    try {
      const [settlementsResp, riversResp] = await Promise.all([
        fetch('/api/generate/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            center_lon: center[0], center_lat: center[1], bearing,
            width_m: widthM, height_m: heightM,
            paper_size: paperSize, orientation,
            limit: 200, types: ['city', 'town', 'village', 'hamlet'],
          }),
        }),
        fetch('/api/generate/rivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            center_lon: center[0], center_lat: center[1], bearing,
            width_m: widthM, height_m: heightM,
            types: ['river', 'canal'], limit: 20,
          }),
        }),
      ])
      if (!settlementsResp.ok) throw new Error(await settlementsResp.text())
      if (!riversResp.ok) throw new Error(await riversResp.text())
      const settlementsData = await settlementsResp.json()
      const riversData = await riversResp.json()

      const rawPlaces: P2pPlaceInput[] = (settlementsData.settlements ?? []).map((s: { lon: number; lat: number; name: string; population: number }) => ({
        lon: s.lon, lat: s.lat, name: s.name, population: s.population || 100,
      }))
      const rawRivers: P2pRawRiver[] = riversData.rivers ?? []

      set({ p2pRawPlaces: rawPlaces, p2pRawRivers: rawRivers, p2pWidthKm: widthKm, p2pHeightKm: heightKm })
      get().regenerateP2pNetwork()
      set({ p2pNetworkStatus: 'done', step: 'terrain' })
    } catch (e) {
      set({ p2pNetworkStatus: 'error', p2pNetworkError: String(e) })
    }
  },

  regenerateP2pNetwork: () => {
    const {
      p2pRawPlaces, p2pRawRivers, p2pWidthKm, p2pHeightKm, center, bearing, pageGrid,
      p2pNetworkMinDistCm, p2pNetworkMaxDistCm, p2pMaxNodes, p2pSupplyCount, p2pPruneFactor, p2pCurviness,
    } = get()
    if (p2pWidthKm === 0 || p2pHeightKm === 0) return

    const [cwMm] = pageGridTotalMm(pageGrid)
    const kmPerCm = p2pWidthKm / (cwMm / 10)
    const { toLocal, toGeo } = makeP2pBoardProjection(center[0], center[1], bearing, p2pWidthKm, p2pHeightKm)

    const { towns, edges } = generateP2pNetwork(
      p2pRawPlaces,
      p2pRawRivers.map(r => ({ pieces: r.segments })),
      {
        widthKm: p2pWidthKm, heightKm: p2pHeightKm, kmPerCm,
        minNodeDistCm: p2pNetworkMinDistCm, maxNodeDistCm: p2pNetworkMaxDistCm, maxNodes: p2pMaxNodes,
        supplyCount: p2pSupplyCount, pruneFactor: p2pPruneFactor, curviness: p2pCurviness,
        routeAroundRivers: true, riverCrossPenaltyKm: 15,
        topTownCount: 5, villagePct: 35, seed: 1,
      },
      toLocal, toGeo,
    )
    set({ p2pTowns: towns, p2pEdges: edges })
  },

  setP2pTowns: (towns) => set({ p2pTowns: towns }),
  setP2pEdges: (edges) => set({ p2pEdges: edges }),

  addP2pTown: (town) => set((s) => ({ p2pTowns: [...s.p2pTowns, town] })),

  moveP2pTown: (id, lon, lat) => set((s) => ({
    p2pTowns: s.p2pTowns.map(t => t.id === id ? { ...t, lon, lat } : t),
  })),

  removeP2pTown: (id) => set((s) => ({
    p2pTowns: s.p2pTowns.filter(t => t.id !== id),
    p2pEdges: s.p2pEdges.filter(e => e.a !== id && e.b !== id),
  })),

  batchSetP2pEdges: (edges) => set((s) => {
    const byKey = new Map(s.p2pEdges.map(e => [edgeKey(e.a, e.b), e]))
    for (const e of edges) byKey.set(edgeKey(e.a, e.b), e)
    return { p2pEdges: [...byKey.values()] }
  }),

  setP2pEdgeTier: (a, b, tier) => set((s) => ({
    p2pEdges: s.p2pEdges.map(e => edgeKey(e.a, e.b) === edgeKey(a, b) ? { ...e, tier } : e),
  })),

  removeP2pEdge: (a, b) => set((s) => ({
    p2pEdges: s.p2pEdges.filter(e => edgeKey(e.a, e.b) !== edgeKey(a, b)),
  })),

  setP2pNetworkMinDistCm: (v) => set({ p2pNetworkMinDistCm: v }),
  setP2pNetworkMaxDistCm: (v) => set({ p2pNetworkMaxDistCm: v }),
  setP2pMaxNodes: (v) => set({ p2pMaxNodes: v }),
  setP2pSupplyCount: (v) => set({ p2pSupplyCount: v }),
  setP2pPruneFactor: (v) => set({ p2pPruneFactor: v }),
  setP2pCurviness: (v) => set({ p2pCurviness: v }),

  clearP2pNetwork: () => set({
    p2pTowns: [], p2pEdges: [], p2pNetworkStatus: 'idle', p2pNetworkError: null,
  }),
})
