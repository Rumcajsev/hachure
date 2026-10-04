import type { MapStore } from '../mapStore'

export type P2pTownTier = 0 | 1 | 2

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

export const createP2pNetworkSlice = (set: Set, _get: () => MapStore): P2pNetworkSlice => ({
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
