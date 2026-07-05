/**
 * RoadNetwork — incremental road chain builder.
 *
 * Maintains an adjacency graph and a per-segment geometry cache. When edges are
 * added or removed, only the 1–3 segments whose topology actually changed are
 * recomputed. All other segment geometries stay cached and untouched.
 *
 * Produces the same RoadBaseData shape as buildRoadChains so the rest of the
 * pipeline (drawRoadsRails, rail snapping, buildings, settlements) is unchanged.
 */

import { catmullRom, chaikin } from './geometry'
import { wiggleChain } from './noise'
import {
  type RoadBaseData, type RoadChain, type RoadTierGeomMap,
  edgeCpKey, roadHopKey, juncCpKey, spineSideCpKey,
} from './roadChains'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetworkParams = {
  smoothing: number
  pathSmoothing: number
  centerPull: number
  overrides: Record<string, [number, number]>
  chainOverrides: Record<string, [number, number][]>
  snapBindings: Record<string, string>
  tierGeom?: RoadTierGeomMap
}

type JunctionData = {
  pos: [number, number]
  tier: 0 | 1 | 2
  spineNeighbors: [string, string] | null
  armTerminals: Map<string, [number, number]>   // `${juncKey}|${nbrKey}` → terminal pos
  sideTerminals: Map<string, [number, number]>  // `${juncKey}|${spineArm}` → terminal pos
}

type SegmentCache = {
  id: string
  hexPath: string[]            // [startBoundary, ...pass-throughs..., endBoundary]
  tier: 0 | 1 | 2
  dirty: boolean
  // Pre-wiggle geometry (null = not yet computed):
  baseChain: [number, number][] | null
  augPts: [number, number][] | null
  hopKeys: string[]
  hopRanges: [number, number][]
  hopTiers: (0 | 1 | 2)[]
  controlPointsLocal: { key: string; pos: [number, number]; chainIdx: number }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pairKey(k1: string, k2: string): string {
  return k1 < k2 ? `${k1}||${k2}` : `${k2}||${k1}`
}

function segId(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function defaultParams(): NetworkParams {
  return { smoothing: 10, pathSmoothing: 0, centerPull: 0, overrides: {}, chainOverrides: {}, snapBindings: {} }
}

// ─── RoadNetwork ──────────────────────────────────────────────────────────────

export class RoadNetwork {
  // Adjacency: hex key → neighbor hex key → minimum tier on that connection
  private adj = new Map<string, Map<string, 0 | 1 | 2>>()
  // All raw edges (for isEdgesEqual and removal tier tracking)
  private rawEdges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[] = []
  // Hexes with degree 1 (dead-ends) or ≥ 3 (junctions)
  private boundaryNodes = new Set<string>()
  // Junction geometry, keyed by hex key
  private junctions = new Map<string, JunctionData>()
  // Segment cache
  private segments = new Map<string, SegmentCache>()
  // Pass-through hex → segment id (only for non-boundary hexes inside a segment)
  private passToSeg = new Map<string, string>()
  // Boundary hex → set of segment ids that start or end there
  private boundaryToSegs = new Map<string, Set<string>>()
  // Canonical pair keys that are already covered by a segment (to avoid double-walking)
  private coveredPairs = new Set<string>()

  private hexIdx = new Map<string, { center: [number, number] }>()
  private params: NetworkParams = defaultParams()
  private interHexDist = 0
  private _cachedBaseData: import('./roadChains').RoadBaseData | null = null
  private _baseDataStale = true
  private _cachedWiggleAmp = 0
  private _cachedWiggleFreq = 0
  private _cachedChaikinPasses = 0

  // ── Public API ──────────────────────────────────────────────────────────────

  setHexIdx(hexIdx: Map<string, { center: [number, number] }>): void {
    this.hexIdx = hexIdx
    this.markAllDirty()
  }

  setParams(params: Partial<NetworkParams>): void {
    this.params = { ...this.params, ...params }
    this.markAllDirty()
  }

  /** Full rebuild from a flat edge list. Used on initial load, undo, and map regeneration. */
  rebuildAll(edges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[]): void {
    this.adj.clear()
    this.rawEdges = [...edges]
    this.boundaryNodes.clear()
    this.junctions.clear()
    this.segments.clear()
    this.passToSeg.clear()
    this.boundaryToSegs.clear()
    this.coveredPairs.clear()
    this.interHexDist = 0
    this._baseDataStale = true

    // Build adjacency (min tier per pair, deduplicated)
    for (const e of edges) {
      const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
      if (!this.adj.has(k1)) this.adj.set(k1, new Map())
      if (!this.adj.has(k2)) this.adj.set(k2, new Map())
      const cur = this.adj.get(k1)!.get(k2)
      if (cur === undefined || e.tier < cur) {
        this.adj.get(k1)!.set(k2, e.tier)
        this.adj.get(k2)!.set(k1, e.tier)
      }
    }

    this.interHexDist = this.computeInterHexDist()

    // Identify boundary nodes
    for (const [k] of this.adj) {
      if (this.isBoundary(k)) this.boundaryNodes.add(k)
    }

    // Compute junction data
    for (const k of this.boundaryNodes) {
      if (this.degree(k) >= 3) this.recomputeJunction(k)
    }

    // Walk all segments
    const visited = new Set<string>()
    for (const k of this.boundaryNodes) {
      if (this.degree(k) === 1) this.walkAndCreate(k, visited)
    }
    for (const k of this.boundaryNodes) {
      if (this.degree(k) >= 3) this.walkAndCreate(k, visited)
    }
    // Cycles (no boundary nodes)
    for (const [k] of this.adj) {
      this.walkAndCreate(k, visited)
    }
  }

  /** Incremental edge addition. Only recomputes affected segments. */
  addEdge(q1: number, r1: number, q2: number, r2: number, tier: 0 | 1 | 2): void {
    const k1 = `${q1},${r1}`, k2 = `${q2},${r2}`

    if (!this.adj.has(k1)) this.adj.set(k1, new Map())
    if (!this.adj.has(k2)) this.adj.set(k2, new Map())

    const oldDeg1 = this.degree(k1)
    const oldDeg2 = this.degree(k2)

    const existingTier = this.adj.get(k1)!.get(k2)

    if (existingTier !== undefined) {
      if (tier === existingTier) return  // no-op: tier unchanged, rawEdges stays stable
      // Replace semantics: swap the tier, don't min
      console.warn('[roads-addEdge] replace', k1, '->', k2, 'tier', existingTier, '->', tier)
      const pk = pairKey(k1, k2)
      this.rawEdges = this.rawEdges.filter(e => pairKey(`${e.q1},${e.r1}`, `${e.q2},${e.r2}`) !== pk)
      this.rawEdges.push({ q1, r1, q2, r2, tier })
      this.adj.get(k1)!.set(k2, tier)
      this.adj.get(k2)!.set(k1, tier)
      this.markEdgeSegmentDirty(k1, k2, tier)
      return
    }
    console.warn('[roads-addEdge] NEW edge', k1, '->', k2, 'tier', tier)

    this.rawEdges.push({ q1, r1, q2, r2, tier })

    // New edge — topology changes
    this.adj.get(k1)!.set(k2, tier)
    this.adj.get(k2)!.set(k1, tier)

    if (this.interHexDist === 0) this.interHexDist = this.computeInterHexDist()

    const toRemove = new Set<string>()
    const toRewalk = new Set<string>()

    this.handleDegreeChange(k1, oldDeg1, this.degree(k1), toRemove, toRewalk)
    this.handleDegreeChange(k2, oldDeg2, this.degree(k2), toRemove, toRewalk)

    for (const id of toRemove) this.removeSegmentById(id)

    if (this.degree(k1) >= 3) this.recomputeJunction(k1)
    if (this.degree(k2) >= 3) this.recomputeJunction(k2)
    for (const node of toRewalk) {
      if (this.degree(node) >= 3) this.recomputeJunction(node)
    }

    const visited = new Set<string>(this.coveredPairs)
    for (const node of toRewalk) {
      if (this.boundaryNodes.has(node)) this.walkAndCreate(node, visited)
    }
    if (this.boundaryNodes.has(k1)) this.walkAndCreate(k1, visited)
    if (this.boundaryNodes.has(k2)) this.walkAndCreate(k2, visited)
    // Handle cycle case
    this.walkAndCreate(k1, visited)
    this.walkAndCreate(k2, visited)
    this._baseDataStale = true
  }

  /** Incremental edge removal. Only recomputes affected segments. */
  removeEdge(q1: number, r1: number, q2: number, r2: number): void {
    const k1 = `${q1},${r1}`, k2 = `${q2},${r2}`
    const pk = pairKey(k1, k2)

    // Remove from rawEdges
    this.rawEdges = this.rawEdges.filter(e => pairKey(`${e.q1},${e.r1}`, `${e.q2},${e.r2}`) !== pk)

    // Check if any raw edges remain for this pair
    let remainingTier: number | undefined
    for (const e of this.rawEdges) {
      if (pairKey(`${e.q1},${e.r1}`, `${e.q2},${e.r2}`) === pk) {
        remainingTier = remainingTier === undefined ? e.tier : Math.min(remainingTier, e.tier)
      }
    }

    if (remainingTier !== undefined) {
      // Edge still exists at different tier — just update adjacency tier
      this.adj.get(k1)?.set(k2, remainingTier as 0 | 1 | 2)
      this.adj.get(k2)?.set(k1, remainingTier as 0 | 1 | 2)
      this.markEdgeSegmentDirty(k1, k2, remainingTier as 0 | 1 | 2)
      return
    }

    if (!this.adj.get(k1)?.has(k2)) return  // already removed

    const oldDeg1 = this.degree(k1)
    const oldDeg2 = this.degree(k2)

    this.adj.get(k1)!.delete(k2)
    this.adj.get(k2)!.delete(k1)
    if (this.adj.get(k1)!.size === 0) this.adj.delete(k1)
    if (this.adj.get(k2)!.size === 0) this.adj.delete(k2)

    const newDeg1 = this.degree(k1)
    const newDeg2 = this.degree(k2)

    const toRemove = new Set<string>()
    const toRewalk = new Set<string>()

    this.handleRemovalDegreeChange(k1, oldDeg1, newDeg1, toRemove, toRewalk)
    this.handleRemovalDegreeChange(k2, oldDeg2, newDeg2, toRemove, toRewalk)

    for (const id of toRemove) this.removeSegmentById(id)

    if (newDeg1 >= 3) this.recomputeJunction(k1)
    if (newDeg2 >= 3) this.recomputeJunction(k2)

    const visited = new Set<string>(this.coveredPairs)
    for (const node of toRewalk) {
      if (this.boundaryNodes.has(node)) this.walkAndCreate(node, visited)
    }
    this._baseDataStale = true
  }

  /**
   * Returns the full RoadBaseData output, identical in shape to buildRoadChains().
   * Computes geometry for any dirty segments before returning.
   */
  getBaseData(
    wiggleAmpFactor = 0,
    wiggleFreqFactor = 0,
    segProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
    hopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
    chaikinPasses = 0,
  ): RoadBaseData {
    if (!this._baseDataStale && this._cachedBaseData
        && wiggleAmpFactor === this._cachedWiggleAmp
        && wiggleFreqFactor === this._cachedWiggleFreq
        && chaikinPasses === this._cachedChaikinPasses) {
      console.warn('[getBaseData] cache HIT chains=', this._cachedBaseData.chains.length, 'tiers=', this._cachedBaseData.chains.map(c => c.tier).join(','))
      return this._cachedBaseData
    }
    console.warn('[getBaseData] MISS stale=', this._baseDataStale, 'dirtySegs=', [...this.segments.values()].filter(s => s.dirty).length)

    for (const seg of this.segments.values()) {
      if (seg.dirty) {
        this.computeSegmentGeometry(seg)
        if (process.env.NODE_ENV === 'development')
          console.warn('[getBaseData] rebuilt seg=', seg.id, 'tier=', seg.tier, 'baseChain=', seg.baseChain?.length ?? 'null', 'hopTiers=', seg.hopTiers.join(','))
      }
    }

    const chains: RoadChain[] = []
    const controlPoints: RoadBaseData['controlPoints'] = []
    const junctionsList: RoadBaseData['junctions'] = []
    const emittedJuncCps = new Set<string>()

    for (const seg of this.segments.values()) {
      if (!seg.baseChain || seg.baseChain.length < 2) {
        if (process.env.NODE_ENV === 'development')
          console.warn('[getBaseData] SKIP seg=', seg.id, 'baseChain=', seg.baseChain?.length ?? 'null', 'dirty=', seg.dirty, 'hexPath=', seg.hexPath.length)
        continue
      }

      const { id, baseChain, hopKeys, hopRanges, hopTiers, tier } = seg
      const tg = this.params.tierGeom?.[tier]
      const effAmpFactor = tg?.wiggleAmp ?? wiggleAmpFactor
      const effFreqFactor = tg?.wiggleFreq ?? wiggleFreqFactor
      const chainAmp = effAmpFactor * this.interHexDist
      const chainFreq = this.interHexDist > 0 ? effFreqFactor / this.interHexDist : 0

      // Control points for this segment
      for (const cp of seg.controlPointsLocal) {
        controlPoints.push({ key: cp.key, pos: cp.pos, chainId: id, chainIdx: cp.chainIdx })
      }

      // Apply wiggle
      const sp = segProps[id]
      const hopCount = hopKeys.length
      const hasOverride = (sp?.wiggleAmp !== undefined || sp?.wiggleFreq !== undefined ||
        hopKeys.some(k => hopProps[k]?.wiggleAmp !== undefined || hopProps[k]?.wiggleFreq !== undefined)) &&
        hopCount > 0

      // Build wiggled chain (pre-Chaikin). hopRanges indices are valid at this level.
      let wiggled: [number, number][]
      if (!hasOverride) {
        wiggled = wiggleChain(baseChain, chainAmp, chainFreq)
      } else {
        const dense = [...baseChain] as [number, number][]
        for (let h = 0; h < hopCount; h++) {
          const [s, e] = hopRanges[h]
          const hp = hopProps[hopKeys[h]]
          const amp = (hp?.wiggleAmp ?? sp?.wiggleAmp ?? effAmpFactor) * this.interHexDist
          const freq = this.interHexDist > 0 ? (hp?.wiggleFreq ?? sp?.wiggleFreq ?? effFreqFactor) / this.interHexDist : 0
          const w = wiggleChain(baseChain.slice(s, e + 1), amp, freq)
          for (let i = 0; i < w.length; i++) dense[s + i] = w[i]
        }
        wiggled = dense
      }

      const effAmp = hasOverride
        ? Math.max(0, ...hopKeys.map(k => {
            const hp = hopProps[k]
            return (hp?.wiggleAmp ?? sp?.wiggleAmp ?? effAmpFactor) * this.interHexDist
          }))
        : chainAmp
      const applyChaikin = effAmp > 0 && chaikinPasses > 0

      const isLoop = seg.hexPath[0] === seg.hexPath[seg.hexPath.length - 1]

      // Emit chains, splitting at tier-change boundaries
      if (hopCount === 0) {
        const chain = applyChaikin ? chaikin(wiggled, chaikinPasses, false) : wiggled
        chains.push({ tier, chain, baseChain, id, hopKeys: [], hopRanges: [], hopTiers: [], isLoop })
        continue
      }

      const tierRuns: { tier: 0 | 1 | 2; hopStart: number; hopEnd: number }[] = []
      let runStart = 0
      for (let h = 1; h < hopCount; h++) {
        if (hopTiers[h] !== hopTiers[h - 1]) {
          tierRuns.push({ tier: hopTiers[runStart] as 0 | 1 | 2, hopStart: runStart, hopEnd: h })
          runStart = h
        }
      }
      tierRuns.push({ tier: (hopTiers[runStart] ?? 2) as 0 | 1 | 2, hopStart: runStart, hopEnd: hopCount })

      if (tierRuns.length === 1) {
        const chain = applyChaikin ? chaikin(wiggled, chaikinPasses, false) : wiggled
        chains.push({ tier: tierRuns[0].tier, chain, baseChain, id, hopKeys, hopRanges, hopTiers, isLoop })
      } else {
        // Slice using pre-Chaikin hopRanges indices, then apply Chaikin per sub-chain.
        // Applying Chaikin to the full chain and then slicing would use wrong indices
        // (Chaikin expands the point count ~4× per 2 passes, invalidating hopRanges offsets).
        for (let ri = 0; ri < tierRuns.length; ri++) {
          const { tier: runTier, hopStart, hopEnd } = tierRuns[ri]
          const subId = ri === 0 ? id : `${id}|t${ri}`
          const ptStart = hopRanges[hopStart][0]
          const ptEnd = hopRanges[hopEnd - 1][1]
          const subWiggled = wiggled.slice(ptStart, ptEnd + 1)
          const chain = applyChaikin ? chaikin(subWiggled, chaikinPasses, false) : subWiggled
          chains.push({
            tier: runTier,
            chain,
            baseChain: baseChain.slice(ptStart, ptEnd + 1),
            id: subId,
            hopKeys: hopKeys.slice(hopStart, hopEnd),
            hopRanges: hopRanges.slice(hopStart, hopEnd).map(([s, e]) => [s - ptStart, e - ptStart] as [number, number]),
            hopTiers: hopTiers.slice(hopStart, hopEnd),
          })
        }
      }
    }

    // Junction control points, stub chains, and dots
    for (const [k, jd] of this.junctions) {
      const h = this.hexIdx.get(k)

      if (jd.spineNeighbors) {
        if (h) controlPoints.push({ key: juncCpKey(k), pos: jd.pos })

        const [spA, spB] = jd.spineNeighbors
        for (const spineNk of [spA, spB]) {
          const term = jd.sideTerminals.get(`${k}|${spineNk}`)
          if (!term) continue
          const cpKey = spineSideCpKey(k, spineNk)
          if (emittedJuncCps.has(cpKey)) continue
          emittedJuncCps.add(cpKey)
          controlPoints.push({ key: cpKey, pos: term })
        }
        for (const nk of (this.adj.get(k)?.keys() ?? [])) {
          if (jd.spineNeighbors.includes(nk)) continue
          const cpKey = spineSideCpKey(k, nk)
          if (!this.params.overrides[cpKey]) continue
          if (emittedJuncCps.has(cpKey)) continue
          emittedJuncCps.add(cpKey)
          const pos = jd.armTerminals.get(`${k}|${nk}`) ?? jd.pos
          controlPoints.push({ key: cpKey, pos })
        }

        // Stub chain for this spine junction
        const termA = jd.sideTerminals.get(`${k}|${spA}`)
        const termB = jd.sideTerminals.get(`${k}|${spB}`)
        if (termA && termB && Math.hypot(termA[0] - termB[0], termA[1] - termB[1]) > 1e-9) {
          const allDissolved = [...(this.adj.get(k)?.keys() ?? [])].every(nk => !!this.params.overrides[spineSideCpKey(k, nk)])
          if (!allDissolved) {
            const ekA = k < spA ? `${k}|${spA}` : `${spA}|${k}`
            const ekB = k < spB ? `${k}|${spB}` : `${spB}|${k}`
            const stubTier = Math.min(
              this.adj.get(k)?.get(spA) ?? 2,
              this.adj.get(k)?.get(spB) ?? 2,
            ) as 0 | 1 | 2
            chains.push({ tier: stubTier, chain: [termA, termB], id: `stub|${k}` })
          }
        }
      } else {
        // Non-spine junction dot
        junctionsList.push({ pos: jd.pos, tier: jd.tier })
        if (h) controlPoints.push({ key: juncCpKey(k), pos: jd.pos })
      }
    }

    // Non-junction control points not yet emitted (for boundary nodes that are just juncCp)
    for (const [k, jd] of this.junctions) {
      const key = juncCpKey(k)
      if (!jd.spineNeighbors && !controlPoints.some(cp => cp.key === key)) {
        controlPoints.push({ key, pos: jd.pos })
      }
    }

    // Snap-split post-processing (matches buildRoadChains snap-split pass)
    if (Object.keys(this.params.snapBindings).length > 0) {
      const splitChainIds = new Set<string>()
      const wigAmp = wiggleAmpFactor * this.interHexDist
      const wigFreq = this.interHexDist > 0 ? wiggleFreqFactor / this.interHexDist : 0
      for (const emKey of Object.values(this.params.snapBindings)) {
        const emCp = controlPoints.find(cp => cp.key === emKey && cp.chainIdx !== undefined)
        if (!emCp || emCp.chainId === undefined || emCp.chainIdx === undefined) continue
        if (splitChainIds.has(emCp.chainId)) continue
        const ci = chains.findIndex(c => c.id === emCp.chainId)
        if (ci < 0) continue
        const c = chains[ci]
        const si = emCp.chainIdx
        const base = c.baseChain ?? c.chain
        if (si <= 0 || si >= base.length - 1) continue
        splitChainIds.add(c.id)
        const baseA = base.slice(0, si + 1)
        const baseB = base.slice(si)
        chains.splice(ci, 1,
          { tier: c.tier, chain: wiggleChain(baseA, wigAmp, wigFreq), baseChain: baseA, id: `${c.id}|sA` },
          { tier: c.tier, chain: wiggleChain(baseB, wigAmp, wigFreq), baseChain: baseB, id: `${c.id}|sB` },
        )
      }
    }

    const result: RoadBaseData = { chains, junctions: junctionsList, controlPoints, interHexDist: this.interHexDist }
    this._cachedBaseData = result
    this._cachedWiggleAmp = wiggleAmpFactor
    this._cachedWiggleFreq = wiggleFreqFactor
    this._cachedChaikinPasses = chaikinPasses
    this._baseDataStale = false
    return result
  }

  /** True if the given edge list is identical to what this network was last built from. */
  isEdgesEqual(edges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[]): boolean {
    if (edges.length !== this.rawEdges.length) {
      console.warn('[roads-eq] FALSE: count mismatch raw=', this.rawEdges.length, 'store=', edges.length)
      return false
    }
    const toKey = (e: typeof edges[0]) => {
      const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
      const [a, b] = k1 < k2 ? [k1, k2] : [k2, k1]
      return `${a}||${b}||${e.tier}`
    }
    const mine = new Set(this.rawEdges.map(toKey))
    const missing = edges.filter(e => !mine.has(toKey(e)))
    if (missing.length > 0) {
      console.warn('[roads-eq] FALSE: missing in rawEdges:', missing.slice(0, 3).map(toKey))
      return false
    }
    return true
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private degree(k: string): number {
    return this.adj.get(k)?.size ?? 0
  }

  private isBoundary(k: string): boolean {
    const d = this.degree(k)
    return d === 1 || d >= 3
  }

  private markAllDirty(): void {
    for (const seg of this.segments.values()) seg.dirty = true
    this._baseDataStale = true
  }

  private computeInterHexDist(): number {
    let dist = 0, samples = 0
    for (const e of this.rawEdges.slice(0, 8)) {
      const h1 = this.hexIdx.get(`${e.q1},${e.r1}`), h2 = this.hexIdx.get(`${e.q2},${e.r2}`)
      if (h1 && h2) { dist += Math.hypot(h2.center[0] - h1.center[0], h2.center[1] - h1.center[1]); samples++ }
    }
    return samples > 0 ? dist / samples : 0
  }

  private recomputeSegTier(seg: SegmentCache): void {
    let minTier: 0 | 1 | 2 = 2
    for (let i = 0; i < seg.hexPath.length - 1; i++) {
      const t = this.adj.get(seg.hexPath[i])?.get(seg.hexPath[i + 1])
      if (t !== undefined && (t as number) < minTier) minTier = t as 0 | 1 | 2
    }
    seg.tier = minTier
  }

  private markEdgeSegmentDirty(k1: string, k2: string, _newTier: 0 | 1 | 2): void {
    this._baseDataStale = true
    const sid = this.passToSeg.get(k1) ?? this.passToSeg.get(k2)
    if (sid) {
      const seg = this.segments.get(sid)
      if (seg) { this.recomputeSegTier(seg); seg.dirty = true }
      return
    }
    for (const id of (this.boundaryToSegs.get(k1) ?? [])) {
      const seg = this.segments.get(id)
      if (!seg) continue
      const idx = seg.hexPath.indexOf(k1)
      if (idx >= 0 && (seg.hexPath[idx + 1] === k2 || seg.hexPath[idx - 1] === k2)) {
        this.recomputeSegTier(seg); seg.dirty = true
        return
      }
    }
  }

  private handleDegreeChange(
    k: string, oldDeg: number, newDeg: number,
    toRemove: Set<string>, toRewalk: Set<string>,
  ): void {
    if (oldDeg === 0) {
      this.boundaryNodes.add(k)
      // Will be walked when the other endpoint is processed
    } else if (oldDeg === 1 && newDeg === 2) {
      // Dead-end → pass-through: segment ending here needs extension
      for (const id of [...(this.boundaryToSegs.get(k) ?? [])]) {
        const seg = this.segments.get(id)
        if (seg) {
          const other = seg.hexPath[0] === k ? seg.hexPath[seg.hexPath.length - 1] : seg.hexPath[0]
          toRewalk.add(other)
          toRemove.add(id)
        }
      }
      this.boundaryNodes.delete(k)
    } else if (oldDeg === 2 && newDeg === 3) {
      // Pass-through → junction: split the segment that runs through k
      const segId = this.passToSeg.get(k)
      if (segId) {
        const seg = this.segments.get(segId)
        if (seg) {
          toRewalk.add(seg.hexPath[0])
          toRewalk.add(seg.hexPath[seg.hexPath.length - 1])
          toRemove.add(segId)
        }
      }
      this.boundaryNodes.add(k)
    } else if (oldDeg >= 3) {
      // Already a junction, gaining a new arm — mark adjacent segments dirty (endpoint terminal shifted)
      for (const id of (this.boundaryToSegs.get(k) ?? [])) {
        const seg = this.segments.get(id)
        if (seg) seg.dirty = true
      }
      toRewalk.add(k)
    }
  }

  private handleRemovalDegreeChange(
    k: string, oldDeg: number, newDeg: number,
    toRemove: Set<string>, toRewalk: Set<string>,
  ): void {
    if (newDeg === 0) {
      // Node fully removed
      for (const id of [...(this.boundaryToSegs.get(k) ?? [])]) toRemove.add(id)
      this.boundaryNodes.delete(k)
      this.junctions.delete(k)
    } else if (oldDeg >= 3 && newDeg === 2) {
      // Junction → pass-through: segments on either side need merging
      for (const id of [...(this.boundaryToSegs.get(k) ?? [])]) {
        const seg = this.segments.get(id)
        if (seg) {
          const other = seg.hexPath[0] === k ? seg.hexPath[seg.hexPath.length - 1] : seg.hexPath[0]
          toRewalk.add(other)
          toRemove.add(id)
        }
      }
      this.boundaryNodes.delete(k)
      this.junctions.delete(k)
    } else if (oldDeg === 2 && newDeg === 1) {
      // Pass-through → dead-end: split
      const segId = this.passToSeg.get(k)
      if (segId) {
        const seg = this.segments.get(segId)
        if (seg) {
          toRewalk.add(seg.hexPath[0])
          toRewalk.add(seg.hexPath[seg.hexPath.length - 1])
          toRemove.add(segId)
        }
      }
      this.boundaryNodes.add(k)
    } else if (oldDeg === 1 && newDeg === 0) {
      for (const id of [...(this.boundaryToSegs.get(k) ?? [])]) toRemove.add(id)
      this.boundaryNodes.delete(k)
    } else if (oldDeg >= 3 && newDeg >= 3) {
      // Still a junction, lost an arm — recompute junction, mark adjacent segments dirty
      this.recomputeJunction(k)
      for (const id of (this.boundaryToSegs.get(k) ?? [])) {
        const seg = this.segments.get(id)
        if (seg) seg.dirty = true
      }
    }
  }

  private removeSegmentById(id: string): void {
    const seg = this.segments.get(id)
    if (!seg) return
    for (let i = 1; i < seg.hexPath.length - 1; i++) this.passToSeg.delete(seg.hexPath[i])
    const s = seg.hexPath[0], e = seg.hexPath[seg.hexPath.length - 1]
    this.boundaryToSegs.get(s)?.delete(id)
    this.boundaryToSegs.get(e)?.delete(id)
    for (let i = 0; i < seg.hexPath.length - 1; i++) {
      this.coveredPairs.delete(pairKey(seg.hexPath[i], seg.hexPath[i + 1]))
    }
    this.segments.delete(id)
  }

  private walkAndCreate(startKey: string, visited: Set<string>): void {
    for (const nextKey of (this.adj.get(startKey)?.keys() ?? [])) {
      const pk = pairKey(startKey, nextKey)
      if (visited.has(pk)) continue

      const hexPath: string[] = [startKey]
      let prev = startKey, cur = nextKey

      while (true) {
        visited.add(pairKey(prev, cur))
        hexPath.push(cur)
        if (this.boundaryNodes.has(cur)) break
        const next = [...(this.adj.get(cur)?.keys() ?? [])].find(nk => !visited.has(pairKey(cur, nk)))
        if (next === undefined) break  // cycle or isolated dead-end
        prev = cur; cur = next
      }

      if (hexPath.length < 2) continue

      const startK = hexPath[0], endK = hexPath[hexPath.length - 1]
      let id = segId(startK, endK)
      // Deduplicate IDs for loops or parallel segments
      let suffix = 0
      while (this.segments.has(id)) id = `${segId(startK, endK)}|dup${suffix++}`

      let tier: 0 | 1 | 2 = 2
      for (let i = 0; i < hexPath.length - 1; i++) {
        const t = this.adj.get(hexPath[i])?.get(hexPath[i + 1])
        if (t !== undefined && t < tier) tier = t as 0 | 1 | 2
      }

      const seg: SegmentCache = {
        id, hexPath, tier, dirty: true,
        baseChain: null, augPts: null,
        hopKeys: [], hopRanges: [], hopTiers: [], controlPointsLocal: [],
      }
      this.segments.set(id, seg)

      for (let i = 1; i < hexPath.length - 1; i++) this.passToSeg.set(hexPath[i], id)
      if (!this.boundaryToSegs.has(startK)) this.boundaryToSegs.set(startK, new Set())
      if (!this.boundaryToSegs.has(endK)) this.boundaryToSegs.set(endK, new Set())
      this.boundaryToSegs.get(startK)!.add(id)
      if (endK !== startK) this.boundaryToSegs.get(endK)!.add(id)
      for (let i = 0; i < hexPath.length - 1; i++) {
        this.coveredPairs.add(pairKey(hexPath[i], hexPath[i + 1]))
      }
    }
  }

  private recomputeJunction(k: string): void {
    const neighbors = [...(this.adj.get(k)?.keys() ?? [])]
    if (neighbors.length < 3) { this.junctions.delete(k); return }

    const h = this.hexIdx.get(k)
    if (!h) { this.junctions.delete(k); return }

    const { overrides, centerPull, tierGeom } = this.params

    // Minimum tier at this junction
    let minTier: 0 | 1 | 2 = 2
    for (const nk of neighbors) {
      const t = this.adj.get(k)?.get(nk) ?? 2
      if (t < minTier) minTier = t as 0 | 1 | 2
    }

    // Junction center position
    const overrideKey = `ja|${k}`
    let pos: [number, number]
    if (overrides[overrideKey]) {
      pos = overrides[overrideKey]
    } else {
      let sumX = 0, sumY = 0, count = 0
      for (const nk of neighbors) {
        if ((this.adj.get(k)?.get(nk) ?? 2) !== minTier) continue
        const hn = this.hexIdx.get(nk); if (!hn) continue
        sumX += (h.center[0] + hn.center[0]) / 2
        sumY += (h.center[1] + hn.center[1]) / 2
        count++
      }
      pos = count > 0 ? [sumX / count, sumY / count] : [h.center[0], h.center[1]]
    }

    // Spine detection (most collinear pair)
    let bestPair: [string, string] | null = null
    let bestDot = 1
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const ni = this.hexIdx.get(neighbors[i]), nj = this.hexIdx.get(neighbors[j])
        if (!ni || !nj) continue
        const dx1 = ni.center[0] - h.center[0], dy1 = ni.center[1] - h.center[1]
        const dx2 = nj.center[0] - h.center[0], dy2 = nj.center[1] - h.center[1]
        const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2)
        if (l1 < 1e-6 || l2 < 1e-6) continue
        const dot = (dx1 * dx2 + dy1 * dy2) / (l1 * l2)
        if (dot < bestDot) { bestDot = dot; bestPair = [neighbors[i], neighbors[j]] }
      }
    }

    const armTerminals = new Map<string, [number, number]>()
    const sideTerminals = new Map<string, [number, number]>()

    if (!bestPair) {
      this.junctions.set(k, { pos, tier: minTier, spineNeighbors: null, armTerminals, sideTerminals })
      return
    }

    // CenterPull adjustment to junction position
    const cp = tierGeom?.[minTier]?.centerPull ?? centerPull
    if (cp < 1 && !overrides[overrideKey]) {
      const hA = this.hexIdx.get(bestPair[0]), hB = this.hexIdx.get(bestPair[1])
      if (hA && hB) {
        const midAx = (h.center[0] + hA.center[0]) / 2, midAy = (h.center[1] + hA.center[1]) / 2
        const midBx = (h.center[0] + hB.center[0]) / 2, midBy = (h.center[1] + hB.center[1]) / 2
        const tx = (midAx + midBx) / 2, ty = (midAy + midBy) / 2
        pos = [tx + cp * (pos[0] - tx), ty + cp * (pos[1] - ty)]
      }
    }

    // Spine direction
    const hA = this.hexIdx.get(bestPair[0])!
    const sdx = hA.center[0] - h.center[0], sdy = hA.center[1] - h.center[1]
    const sLen = Math.hypot(sdx, sdy)
    const snx = sLen > 1e-6 ? sdx / sLen : 1, sny = sLen > 1e-6 ? sdy / sLen : 0

    // Side assignment for branch arms
    const branches = neighbors.filter(n => n !== bestPair![0] && n !== bestPair![1]).sort()
    const sideA = new Set<string>(), sideB = new Set<string>()
    let tieIdx = 0
    for (const bn of branches) {
      const hn = this.hexIdx.get(bn); if (!hn) continue
      const cross = (hn.center[0] - h.center[0]) * sny - (hn.center[1] - h.center[1]) * snx
      if (cross > 1e-9) sideA.add(bn)
      else if (cross < -1e-9) sideB.add(bn)
      else { (tieIdx++ % 2 === 0 ? sideA : sideB).add(bn) }
    }

    const termA: [number, number] = overrides[spineSideCpKey(k, bestPair[0])] ?? [pos[0], pos[1]]
    const termB: [number, number] = overrides[spineSideCpKey(k, bestPair[1])] ?? [pos[0], pos[1]]

    armTerminals.set(`${k}|${bestPair[0]}`, termA)
    armTerminals.set(`${k}|${bestPair[1]}`, termB)
    for (const bn of sideA) armTerminals.set(`${k}|${bn}`, overrides[spineSideCpKey(k, bn)] ?? termA)
    for (const bn of sideB) armTerminals.set(`${k}|${bn}`, overrides[spineSideCpKey(k, bn)] ?? termB)
    for (const bn of branches) {
      if (!sideA.has(bn) && !sideB.has(bn))
        armTerminals.set(`${k}|${bn}`, overrides[spineSideCpKey(k, bn)] ?? termA)
    }
    sideTerminals.set(`${k}|${bestPair[0]}`, termA)
    sideTerminals.set(`${k}|${bestPair[1]}`, termB)

    this.junctions.set(k, { pos, tier: minTier, spineNeighbors: bestPair, armTerminals, sideTerminals })
  }

  private jPos(k: string, fromNbr?: string): [number, number] {
    if (fromNbr) {
      const term = this.junctions.get(k)?.armTerminals.get(`${k}|${fromNbr}`)
      if (term) return term
    }
    return this.junctions.get(k)?.pos ?? this.hexIdx.get(k)?.center ?? [0, 0]
  }

  private computeSegmentGeometry(seg: SegmentCache): void {
    const { hexPath, id } = seg
    if (hexPath.length < 2) { seg.dirty = false; return }

    const { params, hexIdx, interHexDist } = this
    const { smoothing, pathSmoothing, centerPull, overrides, tierGeom } = params
    const tg = tierGeom?.[seg.tier]
    const effPathSmoothing = tg?.pathSmoothing ?? pathSmoothing
    const effSmoothing = tg?.smoothing ?? smoothing
    const effCenterPull = tg?.centerPull ?? centerPull

    const startK = hexPath[0], endK = hexPath[hexPath.length - 1]

    const pts: [number, number][] = []
    const pinned: boolean[] = []
    const edgeKeys: (string | null)[] = []
    const ptsTiers: (0 | 1 | 2 | null)[] = []
    const ptArrivalHex: (string | null)[] = []

    // Start pin (boundary node)
    if (this.boundaryNodes.has(startK)) {
      const h0 = hexIdx.get(startK)
      if (h0) {
        pts.push(this.jPos(startK, hexPath[1]))
        pinned.push(true); edgeKeys.push(null); ptsTiers.push(null); ptArrivalHex.push(null)
      }
    }

    // Edge midpoints
    for (let i = 0; i < hexPath.length - 1; i++) {
      const ak = hexPath[i], bk = hexPath[i + 1]
      const ha = hexIdx.get(ak), hb = hexIdx.get(bk)
      if (!ha || !hb) continue
      const ek = edgeCpKey(ak, bk)
      const isOverridden = !!overrides[ek]
      const mid: [number, number] = isOverridden
        ? overrides[ek]
        : [(ha.center[0] + hb.center[0]) / 2, (ha.center[1] + hb.center[1]) / 2]
      const edgeTier = (this.adj.get(ak)?.get(bk) ?? 2) as 0 | 1 | 2
      pts.push(mid); pinned.push(isOverridden)
      edgeKeys.push(ek); ptsTiers.push(edgeTier); ptArrivalHex.push(bk)
    }

    // End pin (boundary node)
    if (this.boundaryNodes.has(endK)) {
      const hEnd = hexIdx.get(endK)
      if (hEnd) {
        pts.push(this.jPos(endK, hexPath[hexPath.length - 2]))
        pinned.push(true); edgeKeys.push(null); ptsTiers.push(null); ptArrivalHex.push(null)
      }
    }

    if (pts.length < 2) {
      if (process.env.NODE_ENV === 'development')
        console.warn('[seg-geo] EARLY RETURN pts<2 id=', id, 'hexPath=', hexPath.length, 'boundaryStart=', this.boundaryNodes.has(startK), 'boundaryEnd=', this.boundaryNodes.has(endK), 'hexIdxHasStart=', this.hexIdx.has(startK), 'hexIdxHasEnd=', this.hexIdx.has(endK))
      seg.dirty = false; return
    }

    // Path relaxation
    const relaxed = pts.slice() as [number, number][]
    const iters = Math.round(effPathSmoothing)
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < relaxed.length - 1; i++) {
        if (pinned[i]) continue
        const ax = (relaxed[i - 1][0] + relaxed[i + 1][0]) / 2
        const ay = (relaxed[i - 1][1] + relaxed[i + 1][1]) / 2
        relaxed[i] = [relaxed[i][0] + 0.1 * (ax - relaxed[i][0]), relaxed[i][1] + 0.1 * (ay - relaxed[i][1])]
      }
    }

    // Hex center pull — insert intermediate waypoints
    const augPts: [number, number][] = []
    const augEdgeKeys: (string | null)[] = []
    const augPtsTiers: (0 | 1 | 2 | null)[] = []
    for (let i = 0; i < relaxed.length; i++) {
      augPts.push(relaxed[i]); augEdgeKeys.push(edgeKeys[i]); augPtsTiers.push(ptsTiers[i])
      if (i < relaxed.length - 1 && edgeKeys[i] !== null && edgeKeys[i + 1] !== null) {
        const arrHex = ptArrivalHex[i]
        const hc = arrHex ? hexIdx.get(arrHex) : null
        if (hc && arrHex && !this.boundaryNodes.has(arrHex)) {
          const mx = (relaxed[i][0] + relaxed[i + 1][0]) / 2
          const my = (relaxed[i][1] + relaxed[i + 1][1]) / 2
          augPts.push([mx + effCenterPull * (hc.center[0] - mx), my + effCenterPull * (hc.center[1] - my)])
          augEdgeKeys.push(null); augPtsTiers.push(ptsTiers[i])
        }
      }
    }

    // Control points (edge midpoints)
    const steps = Math.round(effSmoothing)
    const stepsActual = steps === 0 ? 1 : Math.max(2, steps)
    const controlPointsLocal: SegmentCache['controlPointsLocal'] = []
    for (let i = 0; i < augEdgeKeys.length; i++) {
      const ek = augEdgeKeys[i]
      if (ek !== null) controlPointsLocal.push({ key: ek, pos: augPts[i], chainIdx: i * stepsActual })
    }

    // Catmull-Rom base chain
    const baseChain: [number, number][] = steps === 0 ? augPts.slice() : catmullRom(augPts, Math.max(2, steps))

    // Hop metadata
    const hopCount = augPts.length - 1
    const denseSteps = Math.max(1, steps)
    const hopKeys: string[] = []
    const hopRanges: [number, number][] = []
    const hopTiers: (0 | 1 | 2)[] = []
    for (let h = 0; h < hopCount; h++) {
      hopKeys.push(roadHopKey(augPts[h], augPts[h + 1]))
      hopRanges.push([h * denseSteps, (h + 1) * denseSteps])
      const tA = augPtsTiers[h], tB = augPtsTiers[h + 1]
      hopTiers.push((tA ?? tB ?? 2) as 0 | 1 | 2)
    }

    seg.augPts = augPts
    seg.baseChain = baseChain
    seg.hopKeys = hopKeys
    seg.hopRanges = hopRanges
    seg.hopTiers = hopTiers
    seg.controlPointsLocal = controlPointsLocal
    seg.dirty = false
  }
}
