import { buildRailChains, type RailBaseData } from './railChains'

export type RailNetworkParams = {
  smoothing: number
  pathSmoothing: number
  overrides: Record<string, [number, number]>
}

function defaultParams(): RailNetworkParams {
  return { smoothing: 10, pathSmoothing: 0, overrides: {} }
}

export class RailNetwork {
  private rawEdges: { q1: number; r1: number; q2: number; r2: number }[] = []
  private hexIdx = new Map<string, { center: [number, number] }>()
  private params: RailNetworkParams = defaultParams()
  private _dirty = true
  private _cachedBaseData: RailBaseData | null = null

  setHexIdx(hexIdx: Map<string, { center: [number, number] }>): void {
    this.hexIdx = hexIdx
    this._dirty = true
  }

  setParams(params: Partial<RailNetworkParams>): void {
    this.params = { ...this.params, ...params }
    this._dirty = true
  }

  markDirty(): void {
    this._dirty = true
  }

  rebuildAll(edges: { q1: number; r1: number; q2: number; r2: number }[]): void {
    this.rawEdges = [...edges]
    this._dirty = true
  }

  addEdge(q1: number, r1: number, q2: number, r2: number): void {
    for (const e of this.rawEdges) {
      if ((e.q1 === q1 && e.r1 === r1 && e.q2 === q2 && e.r2 === r2) ||
          (e.q1 === q2 && e.r1 === r2 && e.q2 === q1 && e.r2 === r1)) return
    }
    this.rawEdges.push({ q1, r1, q2, r2 })
    this._dirty = true
  }

  removeEdge(q1: number, r1: number, q2: number, r2: number): void {
    const before = this.rawEdges.length
    this.rawEdges = this.rawEdges.filter(e =>
      !((e.q1 === q1 && e.r1 === r1 && e.q2 === q2 && e.r2 === r2) ||
        (e.q1 === q2 && e.r1 === r2 && e.q2 === q1 && e.r2 === r1))
    )
    if (this.rawEdges.length !== before) this._dirty = true
  }

  isEdgesEqual(edges: { q1: number; r1: number; q2: number; r2: number }[]): boolean {
    if (edges.length !== this.rawEdges.length) return false
    const toKey = (e: { q1: number; r1: number; q2: number; r2: number }) => {
      const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
      return k1 < k2 ? `${k1}||${k2}` : `${k2}||${k1}`
    }
    const mine = new Set(this.rawEdges.map(toKey))
    return edges.every(e => mine.has(toKey(e)))
  }

  getBaseData(
    roadEdges: { q1: number; r1: number; q2: number; r2: number }[],
    roadEdgeMidpoints: Map<string, [number, number]>,
    roadJunctionPositions: Map<string, [number, number]>,
  ): RailBaseData {
    if (!this._dirty && this._cachedBaseData) return this._cachedBaseData
    this._cachedBaseData = buildRailChains(
      this.rawEdges, roadEdges, this.hexIdx,
      roadEdgeMidpoints, roadJunctionPositions,
      this.params.overrides, 0, 0,
      this.params.smoothing, {}, {}, 2,
      this.params.pathSmoothing,
    )
    this._dirty = false
    return this._cachedBaseData
  }
}
