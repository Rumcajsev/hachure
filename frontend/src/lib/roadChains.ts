/** Road chain building.
 *
 * Builds chains with a single global walk over all edges, so cross-tier
 * junctions are handled correctly and two tiers sharing the same hex never
 * produce overlapping geometry.
 */

import { catmullRom, chaikin } from './geometry'
import { wiggleChain } from './noise'

export function edgeCpKey(k1: string, k2: string): string {
  return `em|${k1 < k2 ? k1 : k2}|${k1 < k2 ? k2 : k1}`
}

function roadVKey(v: [number, number]): string {
  return `${Math.round(v[0] / 1e-5)},${Math.round(v[1] / 1e-5)}`
}
export function roadHopKey(v0: [number, number], v1: [number, number]): string {
  const k0 = roadVKey(v0), k1 = roadVKey(v1)
  return k0 < k1 ? `${k0}||${k1}` : `${k1}||${k0}`
}

export function juncCpKey(k: string): string {
  return `ja|${k}`
}

export function spineSideCpKey(k: string, nk: string): string {
  return `jt|${k}|${nk}`
}


export type RoadChain = {
  tier: 0 | 1 | 2
  chain: [number, number][]
  baseChain?: [number, number][]
  id: string
  hopKeys?: string[]
  hopRanges?: [number, number][]
  hopTiers?: (0 | 1 | 2)[]
  isLoop?: boolean
}

export type RoadBaseData = {
  chains: RoadChain[]
  junctions: { pos: [number, number]; tier: 0 | 1 | 2 }[]
  controlPoints: { key: string; pos: [number, number]; chainId?: string; chainIdx?: number }[]
  interHexDist: number
}

export type RoadTierGeomMap = Record<number, { wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number; smoothing?: number; centerPull?: number }>

export function buildRoadChains(
  roadEdges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[],
  hexIdx: Map<string, { center: [number, number] }>,
  overrides: Record<string, [number, number]>,
  wiggleAmpFactor = 0,
  wiggleFreqFactor = 2.5,
  smoothing = 10,
  pathSmoothing = 0,
  chainOverrides: Record<string, [number, number][]> = {},
  segProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  hopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  snapBindings: Record<string, string> = {},
  chaikinPasses = 2,
  tierGeom?: RoadTierGeomMap,
  centerPull = 0,
): RoadBaseData {
  if (roadEdges.length === 0) return { chains: [], junctions: [], controlPoints: [], interHexDist: 0 }

  const effectiveOverrides: Record<string, [number, number]> = { ...overrides }
  for (const [jtKey, emKey] of Object.entries(snapBindings)) {
    const parts = emKey.split('|')
    if (parts.length !== 3) continue
    const h1 = hexIdx.get(parts[1]), h2 = hexIdx.get(parts[2])
    if (!h1 || !h2) continue
    effectiveOverrides[jtKey] = (overrides[emKey] as [number, number] | undefined) ??
      [(h1.center[0] + h2.center[0]) / 2, (h1.center[1] + h2.center[1]) / 2]
  }

  let interHexDist = 0, hexScaleSamples = 0
  for (const e of roadEdges.slice(0, 8)) {
    const h1 = hexIdx.get(`${e.q1},${e.r1}`), h2 = hexIdx.get(`${e.q2},${e.r2}`)
    if (h1 && h2) { interHexDist += Math.hypot(h2.center[0] - h1.center[0], h2.center[1] - h1.center[1]); hexScaleSamples++ }
  }
  interHexDist = hexScaleSamples > 0 ? interHexDist / hexScaleSamples : 0

  // Build global adjacency over ALL edges regardless of tier.
  const adj = new Map<string, string[]>()
  for (const e of roadEdges) {
    const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
    if (!adj.has(k1)) adj.set(k1, [])
    if (!adj.has(k2)) adj.set(k2, [])
    if (!adj.get(k1)!.includes(k2)) adj.get(k1)!.push(k2)
    if (!adj.get(k2)!.includes(k1)) adj.get(k2)!.push(k1)
  }

  // Per-edge minimum tier (most important tier wins).
  const edgeMinTier = new Map<string, 0 | 1 | 2>()
  for (const e of roadEdges) {
    const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
    const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
    const existing = edgeMinTier.get(ek)
    if (existing === undefined || e.tier < existing) edgeMinTier.set(ek, e.tier)
  }

  const isJunction = (k: string) => (adj.get(k)?.length ?? 0) > 2

  // Junction centre positions (averaged midpoints of the most-important-tier arms).
  const junctionPositions = new Map<string, [number, number]>()
  for (const [k] of adj) {
    if (!isJunction(k)) continue
    const h = hexIdx.get(k); if (!h) continue
    let minTier: 0 | 1 | 2 = 2
    for (const nk of adj.get(k) ?? []) {
      const ek = k < nk ? `${k}|${nk}` : `${nk}|${k}`
      const t = edgeMinTier.get(ek)
      if (t !== undefined && t < minTier) minTier = t
    }
    let sumX = 0, sumY = 0, count = 0
    for (const nk of adj.get(k) ?? []) {
      const ek = k < nk ? `${k}|${nk}` : `${nk}|${k}`
      if (edgeMinTier.get(ek) !== minTier) continue
      const hn = hexIdx.get(nk); if (!hn) continue
      sumX += (h.center[0] + hn.center[0]) / 2
      sumY += (h.center[1] + hn.center[1]) / 2
      count++
    }
    junctionPositions.set(k, count > 0 ? [sumX / count, sumY / count] : [h.center[0], h.center[1]])
  }

  for (const [ok, pos] of Object.entries(effectiveOverrides)) {
    if (ok.startsWith('ja|')) junctionPositions.set(ok.slice(3), pos)
  }

  // Pass A: find the most-collinear neighbour pair (spine) for each junction hex.
  const spineNeighbors = new Map<string, [string, string]>()
  for (const [k] of adj) {
    const neighbors = [...(adj.get(k) ?? [])]
    if (neighbors.length <= 2) continue
    const h = hexIdx.get(k); if (!h) continue
    let bestPair: [string, string] | null = null
    let bestDot = 1
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const ni = hexIdx.get(neighbors[i]), nj = hexIdx.get(neighbors[j])
        if (!ni || !nj) continue
        const dx1 = ni.center[0] - h.center[0], dy1 = ni.center[1] - h.center[1]
        const dx2 = nj.center[0] - h.center[0], dy2 = nj.center[1] - h.center[1]
        const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2)
        if (len1 < 1e-6 || len2 < 1e-6) continue
        const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2)
        if (dot < bestDot) { bestDot = dot; bestPair = [neighbors[i], neighbors[j]] }
      }
    }
    if (bestPair) spineNeighbors.set(k, bestPair)
  }

  // Apply centerPull to junction positions.
  // centerPull=0 → junction sits at the midpoint of the two spine border crossings,
  //   i.e. exactly where the spine road naturally passes — same logic as a regular
  //   non-junction hex at centerPull=0. The spine road flows straight through and
  //   branch arms connect to that point.
  // centerPull=1 → junction stays at the averaged-midpoint position (original behaviour).
  if (centerPull < 1) {
    for (const [k, spinePair] of spineNeighbors) {
      if (effectiveOverrides[`ja|${k}`]) continue
      const basePos = junctionPositions.get(k); if (!basePos) continue
      const h = hexIdx.get(k); if (!h) continue
      const hA = hexIdx.get(spinePair[0]), hB = hexIdx.get(spinePair[1])
      if (!hA || !hB) continue
      const midAx = (h.center[0] + hA.center[0]) / 2, midAy = (h.center[1] + hA.center[1]) / 2
      const midBx = (h.center[0] + hB.center[0]) / 2, midBy = (h.center[1] + hB.center[1]) / 2
      const targetX = (midAx + midBx) / 2, targetY = (midAy + midBy) / 2
      junctionPositions.set(k, [
        targetX + centerPull * (basePos[0] - targetX),
        targetY + centerPull * (basePos[1] - targetY),
      ])
    }
  }

  // Pass B: compute arm terminals using the (possibly adjusted) junction positions.
  const armToTerminal = new Map<string, [number, number]>()
  const sideTerminals = new Map<string, [number, number]>()
  for (const [k, bestPair] of spineNeighbors) {
    const h = hexIdx.get(k); if (!h) continue
    const jc = junctionPositions.get(k) ?? h.center
    const hA = hexIdx.get(bestPair[0]), hB = hexIdx.get(bestPair[1])
    if (!hA || !hB) continue

    const sdx = hA.center[0] - h.center[0], sdy = hA.center[1] - h.center[1]
    const sLen = Math.hypot(sdx, sdy)
    const snx = sLen > 1e-6 ? sdx / sLen : 1, sny = sLen > 1e-6 ? sdy / sLen : 0

    const neighbors = [...(adj.get(k) ?? [])]
    const branches = neighbors.filter(n => n !== bestPair[0] && n !== bestPair[1]).sort()
    const sideA = new Set<string>(), sideB = new Set<string>()
    let tieIdx = 0
    for (const bn of branches) {
      const hn = hexIdx.get(bn); if (!hn) continue
      const bx = hn.center[0] - h.center[0], by = hn.center[1] - h.center[1]
      const cross = bx * sny - by * snx
      if (cross > 1e-9) sideA.add(bn)
      else if (cross < -1e-9) sideB.add(bn)
      else { (tieIdx++ % 2 === 0 ? sideA : sideB).add(bn) }
    }

    const offset = 0
    const defaultA: [number, number] = [jc[0] + snx * offset, jc[1] + sny * offset]
    const defaultB: [number, number] = [jc[0] - snx * offset, jc[1] - sny * offset]
    const termA: [number, number] = effectiveOverrides[spineSideCpKey(k, bestPair[0])] ?? defaultA
    const termB: [number, number] = effectiveOverrides[spineSideCpKey(k, bestPair[1])] ?? defaultB

    armToTerminal.set(`${k}|${bestPair[0]}`, termA)
    armToTerminal.set(`${k}|${bestPair[1]}`, termB)
    for (const bn of sideA) armToTerminal.set(`${k}|${bn}`, effectiveOverrides[spineSideCpKey(k, bn)] ?? termA)
    for (const bn of sideB) armToTerminal.set(`${k}|${bn}`, effectiveOverrides[spineSideCpKey(k, bn)] ?? termB)
    for (const bn of branches) {
      if (!sideA.has(bn) && !sideB.has(bn)) armToTerminal.set(`${k}|${bn}`, effectiveOverrides[spineSideCpKey(k, bn)] ?? termA)
    }

    sideTerminals.set(`${k}|${bestPair[0]}`, termA)
    sideTerminals.set(`${k}|${bestPair[1]}`, termB)
  }

  const wiggleAmplitude = wiggleAmpFactor * interHexDist
  const wiggleFreq = interHexDist > 0 ? wiggleFreqFactor / interHexDist : 0

  const chains: RoadChain[] = []
  const junctionMap = new Map<string, { pos: [number, number]; tier: 0 | 1 | 2 }>()
  const controlPoints: { key: string; pos: [number, number]; chainId?: string; chainIdx?: number }[] = []
  const visitedPairs = new Set<string>()
  const seenEdges = new Set<string>()

  // Emit junction dots for non-spine junctions.
  for (const [k] of adj) {
    if (isJunction(k) && !spineNeighbors.has(k)) {
      const h = hexIdx.get(k)
      if (h) {
        const pos = junctionPositions.get(k) ?? h.center
        let minTier: 0 | 1 | 2 = 2
        for (const nk of adj.get(k) ?? []) {
          const ek = k < nk ? `${k}|${nk}` : `${nk}|${k}`
          const t = edgeMinTier.get(ek)
          if (t !== undefined && t < minTier) minTier = t
        }
        junctionMap.set(k, { pos, tier: minTier })
      }
    }
  }

  const jPos = (k: string, h: { center: [number, number] }, fromNbr?: string): [number, number] => {
    if (fromNbr) {
      const arm = armToTerminal.get(`${k}|${fromNbr}`)
      if (arm) return arm
    }
    return junctionPositions.get(k) ?? h.center
  }

  // Walk: returns waypoints, per-waypoint tier (null for terminals), and end key.
  // ptArrivalHex[i] is the hex key we stepped INTO when pushing edge midpoint i (null for pins).
  const walk = (startKey: string): {
    pts: [number, number][]
    endKey: string
    pinned: boolean[]
    edgeKeys: (string | null)[]
    ptsTiers: (0 | 1 | 2 | null)[]
    ptArrivalHex: (string | null)[]
  } => {
    const h0 = hexIdx.get(startKey)
    if (!h0) return { pts: [], endKey: startKey, pinned: [], edgeKeys: [], ptsTiers: [], ptArrivalHex: [] }
    const startDeg = (adj.get(startKey) ?? []).length
    const pts: [number, number][] = []
    const pinned: boolean[] = []
    const edgeKeys: (string | null)[] = []
    const ptsTiers: (0 | 1 | 2 | null)[] = []
    const ptArrivalHex: (string | null)[] = []
    let firstStep = true
    let prevKey = startKey
    let cur = startKey
    for (;;) {
      const next = (adj.get(cur) ?? []).find(nk => {
        const ep = cur < nk ? `${cur}|${nk}` : `${nk}|${cur}`
        return !visitedPairs.has(ep)
      })
      if (!next) break
      if (firstStep) {
        firstStep = false
        if (startDeg !== 2 || isJunction(startKey)) {
          pts.push(jPos(startKey, h0, next)); pinned.push(true); edgeKeys.push(null); ptsTiers.push(null); ptArrivalHex.push(null)
        }
      }
      const ep = cur < next ? `${cur}|${next}` : `${next}|${cur}`
      visitedPairs.add(ep)
      const h1 = hexIdx.get(cur), h2 = hexIdx.get(next)
      if (h1 && h2) {
        const ek = edgeCpKey(cur, next)
        const isOverridden = !!effectiveOverrides[ek]
        const mid: [number, number] = isOverridden
          ? effectiveOverrides[ek]
          : [(h1.center[0] + h2.center[0]) / 2, (h1.center[1] + h2.center[1]) / 2]
        const rawEk = cur < next ? `${cur}|${next}` : `${next}|${cur}`
        pts.push(mid); pinned.push(isOverridden); edgeKeys.push(ek)
        ptsTiers.push(edgeMinTier.get(rawEk) ?? 2)
        ptArrivalHex.push(next)
        seenEdges.add(ek)
      }
      prevKey = cur
      cur = next
      const curDeg = (adj.get(cur) ?? []).length
      if (curDeg === 1) { const he = hexIdx.get(cur); if (he) { pts.push(he.center); pinned.push(true); edgeKeys.push(null); ptsTiers.push(null); ptArrivalHex.push(null) } break }
      if (isJunction(cur)) { const hj = hexIdx.get(cur); if (hj) { pts.push(jPos(cur, hj, prevKey)); pinned.push(true); edgeKeys.push(null); ptsTiers.push(null); ptArrivalHex.push(null) } break }
    }
    return { pts, endKey: cur, pinned, edgeKeys, ptsTiers, ptArrivalHex }
  }

  const pushChain = (startKey: string) => {
    const { pts, endKey, pinned, edgeKeys, ptsTiers, ptArrivalHex } = walk(startKey)
    if (pts.length < 2) return

    const a = startKey < endKey ? startKey : endKey
    const b = startKey < endKey ? endKey : startKey
    const id = `${a}|${b}`

    const nonNullTiers = ptsTiers.filter(t => t !== null) as (0 | 1 | 2)[]
    const chainTier = nonNullTiers.length > 0 ? Math.min(...nonNullTiers) as 0 | 1 | 2 : 2
    const tg = tierGeom?.[chainTier]
    const effectivePathSmoothing = tg?.pathSmoothing ?? pathSmoothing
    const effectiveSmoothing = tg?.smoothing ?? smoothing
    const effectiveWiggleAmp = tg?.wiggleAmp ?? wiggleAmpFactor
    const effectiveWiggleFreq = tg?.wiggleFreq ?? wiggleFreqFactor
    const effectiveCenterPull = tg?.centerPull ?? centerPull

    const relaxed = pts.slice() as [number, number][]
    const iters = Math.round(effectivePathSmoothing)
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < relaxed.length - 1; i++) {
        if (pinned[i]) continue
        const avgX = (relaxed[i - 1][0] + relaxed[i + 1][0]) / 2
        const avgY = (relaxed[i - 1][1] + relaxed[i + 1][1]) / 2
        relaxed[i] = [
          relaxed[i][0] + 0.1 * (avgX - relaxed[i][0]),
          relaxed[i][1] + 0.1 * (avgY - relaxed[i][1]),
        ]
      }
    }

    // Insert a hex center waypoint between every pair of consecutive edge midpoints.
    // centerPull controls where it sits: 0 = midpoint between the two borders (near-neutral),
    // 1 = exactly at the hex center. Always present so the road segment in each hex
    // consistently passes toward its center.
    const newPts: [number, number][] = []
    const newEdgeKeys: (string | null)[] = []
    const newPtsTiers: (0 | 1 | 2 | null)[] = []
    for (let i = 0; i < relaxed.length; i++) {
      newPts.push(relaxed[i])
      newEdgeKeys.push(edgeKeys[i])
      newPtsTiers.push(ptsTiers[i])
      if (i < relaxed.length - 1 && edgeKeys[i] !== null && edgeKeys[i + 1] !== null) {
        const arrHex = ptArrivalHex[i]
        const hc = arrHex ? hexIdx.get(arrHex) : null
        if (hc && arrHex && !isJunction(arrHex)) {
          const mx = (relaxed[i][0] + relaxed[i + 1][0]) / 2
          const my = (relaxed[i][1] + relaxed[i + 1][1]) / 2
          const cp = effectiveCenterPull
          newPts.push([mx + cp * (hc.center[0] - mx), my + cp * (hc.center[1] - my)])
          newEdgeKeys.push(null)
          newPtsTiers.push(ptsTiers[i])
        }
      }
    }
    const augPts = newPts
    const augEdgeKeys = newEdgeKeys
    const augPtsTiers = newPtsTiers

    // storedHandles incompatible with current topology (always includes hex center waypoints)
    const storedHandles = undefined
    const steps = Math.round(effectiveSmoothing)
    const stepsActual = steps === 0 ? 1 : Math.max(2, steps)
    const chainWiggleAmplitude = effectiveWiggleAmp * interHexDist
    const chainWiggleFreqScaled = interHexDist > 0 ? effectiveWiggleFreq / interHexDist : 0

    for (let i = 0; i < augEdgeKeys.length; i++) {
      const ek = augEdgeKeys[i]
      if (ek !== null) controlPoints.push({
        key: ek, pos: augPts[i], chainId: id,
        chainIdx: storedHandles ? undefined : i * stepsActual,
      })
    }

    let baseChain: [number, number][]
    if (steps === 0) {
      baseChain = storedHandles && storedHandles.length >= 2
        ? [augPts[0], ...storedHandles.slice(1, -1), augPts[augPts.length - 1]]
        : augPts.slice()
    } else if (storedHandles && storedHandles.length >= 2) {
      const pinnedHandles: [number, number][] = [augPts[0], ...storedHandles.slice(1, -1), augPts[augPts.length - 1]]
      baseChain = catmullRom(pinnedHandles, Math.max(2, steps))
    } else {
      baseChain = catmullRom(augPts, Math.max(2, steps))
    }

    const effectiveCtrl = (storedHandles && storedHandles.length >= 2)
      ? [augPts[0], ...storedHandles.slice(1, -1), augPts[augPts.length - 1]] as [number, number][]
      : augPts
    const hopCount = effectiveCtrl.length - 1
    const denseSteps = Math.max(1, steps)
    const hopKeysList: string[] = []
    const hopRanges: [number, number][] = []
    const hopTiers: (0 | 1 | 2)[] = []
    for (let h = 0; h < hopCount; h++) {
      hopKeysList.push(roadHopKey(effectiveCtrl[h], effectiveCtrl[h + 1]))
      hopRanges.push([h * denseSteps, (h + 1) * denseSteps])
      // Assign hop tier from the waypoint tier values: prefer the destination midpoint's
      // tier, fall back to the source midpoint, then default to 2.
      const tA = augPtsTiers[h], tB = augPtsTiers[h + 1]
      hopTiers.push((tA ?? tB ?? 2) as 0 | 1 | 2)
    }

    const sp = segProps[id]
    const hasAnyOverride = sp?.wiggleAmp !== undefined || sp?.wiggleFreq !== undefined ||
      hopKeysList.some(k => hopProps[k]?.wiggleAmp !== undefined || hopProps[k]?.wiggleFreq !== undefined)

    let chain: [number, number][]
    if (!hasAnyOverride) {
      chain = wiggleChain(baseChain, chainWiggleAmplitude, chainWiggleFreqScaled)
    } else {
      const dense = [...baseChain] as [number, number][]
      for (let h = 0; h < hopCount; h++) {
        const [s, e] = hopRanges[h]
        const hp = hopProps[hopKeysList[h]]
        const amp = (hp?.wiggleAmp ?? sp?.wiggleAmp ?? effectiveWiggleAmp) * interHexDist
        const freq = (hp?.wiggleFreq ?? sp?.wiggleFreq ?? effectiveWiggleFreq) / interHexDist
        const slice = baseChain.slice(s, e + 1)
        const wiggled = wiggleChain(slice, amp, freq)
        for (let i = 0; i < wiggled.length; i++) dense[s + i] = wiggled[i]
      }
      chain = dense
    }
    const effectiveAmp = hasAnyOverride
      ? Math.max(...hopKeysList.map((k, h) => {
          const hp = hopProps[k]; const sp2 = segProps[id]
          return (hp?.wiggleAmp ?? sp2?.wiggleAmp ?? effectiveWiggleAmp) * interHexDist
        }))
      : chainWiggleAmplitude
    if (effectiveAmp > 0 && chaikinPasses > 0) chain = chaikin(chain, chaikinPasses, false)

    // Split chain at tier-change boundaries so each sub-chain has a uniform tier.
    // A global walk over mixed-tier edges would otherwise collapse everything to minTier.
    const tierRuns: { tier: 0 | 1 | 2; hopStart: number; hopEnd: number }[] = []
    let runStart = 0
    for (let h = 1; h < hopCount; h++) {
      if (hopTiers[h] !== hopTiers[h - 1]) {
        tierRuns.push({ tier: hopTiers[runStart], hopStart: runStart, hopEnd: h })
        runStart = h
      }
    }
    tierRuns.push({ tier: hopTiers[runStart] ?? 2, hopStart: runStart, hopEnd: hopCount })

    const isLoop = startKey === endKey

    if (tierRuns.length === 1) {
      chains.push({ tier: tierRuns[0].tier, chain, baseChain, id, hopKeys: hopKeysList, hopRanges, hopTiers, isLoop })
    } else {
      for (let ri = 0; ri < tierRuns.length; ri++) {
        const { tier: runTier, hopStart, hopEnd } = tierRuns[ri]
        const subId = ri === 0 ? id : `${id}|t${ri}`
        const ptStart = hopRanges[hopStart][0]
        const ptEnd = hopRanges[hopEnd - 1][1]
        chains.push({
          tier: runTier,
          chain: chain.slice(ptStart, ptEnd + 1),
          baseChain: baseChain.slice(ptStart, ptEnd + 1),
          id: subId,
          hopKeys: hopKeysList.slice(hopStart, hopEnd),
          hopRanges: hopRanges.slice(hopStart, hopEnd).map(([s, e]) => [s - ptStart, e - ptStart] as [number, number]),
          hopTiers: hopTiers.slice(hopStart, hopEnd),
        })
      }
    }
  }

  // Single global walk — no per-tier split.
  for (const [k, nbs] of adj) { if (nbs.length === 1) pushChain(k) }
  for (const [k, nbs] of adj) {
    if (isJunction(k)) {
      for (const nk of nbs) {
        const ep = k < nk ? `${k}|${nk}` : `${nk}|${k}`
        if (!visitedPairs.has(ep)) pushChain(k)
      }
    }
  }
  for (const [k, nbs] of adj) {
    for (const nk of nbs) {
      const ep = k < nk ? `${k}|${nk}` : `${nk}|${k}`
      if (!visitedPairs.has(ep)) pushChain(k)
    }
  }

  // Stub chains for spine junctions.
  for (const [k, spinePair] of spineNeighbors) {
    const allDissolved = [...(adj.get(k) ?? [])].every(nk => !!effectiveOverrides[spineSideCpKey(k, nk)])
    if (allDissolved) continue
    const termA = sideTerminals.get(`${k}|${spinePair[0]}`)
    const termB = sideTerminals.get(`${k}|${spinePair[1]}`)
    if (!termA || !termB) continue
    if (Math.hypot(termA[0] - termB[0], termA[1] - termB[1]) < 1e-9) continue
    const ekA = k < spinePair[0] ? `${k}|${spinePair[0]}` : `${spinePair[0]}|${k}`
    const ekB = k < spinePair[1] ? `${k}|${spinePair[1]}` : `${spinePair[1]}|${k}`
    const stubTier = Math.min(edgeMinTier.get(ekA) ?? 2, edgeMinTier.get(ekB) ?? 2) as 0 | 1 | 2
    chains.push({ tier: stubTier, chain: [termA, termB], id: `stub|${k}` })
  }

  // Junction control points and dots for spine junctions.
  const emittedJuncCps = new Set<string>()
  for (const [k, spinePair] of spineNeighbors) {
    const h = hexIdx.get(k)
    let minTier: 0 | 1 | 2 = 2
    for (const nk of adj.get(k) ?? []) {
      const ek = k < nk ? `${k}|${nk}` : `${nk}|${k}`
      const t = edgeMinTier.get(ek)
      if (t !== undefined && t < minTier) minTier = t
    }
    if (h) controlPoints.push({ key: juncCpKey(k), pos: junctionPositions.get(k) ?? h.center })
    for (const spineNk of spinePair) {
      const term = sideTerminals.get(`${k}|${spineNk}`)
      if (!term) continue
      const cpKey = spineSideCpKey(k, spineNk)
      if (emittedJuncCps.has(cpKey)) continue
      emittedJuncCps.add(cpKey)
      junctionMap.set(cpKey, { pos: term, tier: minTier })
      controlPoints.push({ key: cpKey, pos: term })
    }
    for (const nk of adj.get(k) ?? []) {
      if (spinePair.includes(nk)) continue
      const cpKey = spineSideCpKey(k, nk)
      if (!effectiveOverrides[cpKey]) continue
      if (emittedJuncCps.has(cpKey)) continue
      emittedJuncCps.add(cpKey)
      const pos = armToTerminal.get(`${k}|${nk}`) ?? hexIdx.get(k)?.center ?? [0, 0] as [number, number]
      junctionMap.set(cpKey, { pos, tier: minTier })
      controlPoints.push({ key: cpKey, pos })
    }
  }

  for (const [k, entry] of junctionMap) {
    if (!k.includes('|')) controlPoints.push({ key: juncCpKey(k), pos: entry.pos })
  }

  // Snap-split: identical logic to V1 but uses wiggleAmplitude/wiggleFreq from above.
  if (Object.keys(snapBindings).length > 0) {
    const splitChainIds = new Set<string>()
    for (const emKey of Object.values(snapBindings)) {
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
        { tier: c.tier, chain: wiggleChain(baseA, wiggleAmplitude, wiggleFreq), baseChain: baseA, id: `${c.id}|sA` },
        { tier: c.tier, chain: wiggleChain(baseB, wiggleAmplitude, wiggleFreq), baseChain: baseB, id: `${c.id}|sB` },
      )
    }
  }

  return { chains, junctions: Array.from(junctionMap.values()), controlPoints, interHexDist }
}

export function applyRoadWiggle(
  baseData: RoadBaseData,
  wiggleAmpFactor: number,
  wiggleFreqFactor: number,
  segProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  hopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  chaikinPasses = 2,
  tierGeom?: RoadTierGeomMap,
): RoadBaseData {
  const { interHexDist } = baseData

  const chains = baseData.chains.map(c => {
    const tg = tierGeom?.[c.tier]
    const effectiveAmpFactor = tg?.wiggleAmp ?? wiggleAmpFactor
    const effectiveFreqFactor = tg?.wiggleFreq ?? wiggleFreqFactor
    const wiggleAmplitude = effectiveAmpFactor * interHexDist
    const wiggleFreq = interHexDist > 0 ? effectiveFreqFactor / interHexDist : 0

    const base = c.baseChain ?? c.chain
    const { id, hopKeys: hopKeysList = [], hopRanges = [] } = c
    const sp = segProps[id]
    const hasAnyOverride = (sp?.wiggleAmp !== undefined || sp?.wiggleFreq !== undefined ||
      hopKeysList.some(k => hopProps[k]?.wiggleAmp !== undefined || hopProps[k]?.wiggleFreq !== undefined)) &&
      hopKeysList.length > 0

    let chain: [number, number][]
    if (!hasAnyOverride) {
      chain = wiggleChain(base, wiggleAmplitude, wiggleFreq)
    } else {
      const dense = [...base] as [number, number][]
      for (let h = 0; h < hopKeysList.length; h++) {
        const [s, e] = hopRanges[h]
        const hp = hopProps[hopKeysList[h]]
        const spg = segProps[id]
        const amp = (hp?.wiggleAmp ?? spg?.wiggleAmp ?? effectiveAmpFactor) * interHexDist
        const freq = (hp?.wiggleFreq ?? spg?.wiggleFreq ?? effectiveFreqFactor) / interHexDist
        const slice = base.slice(s, e + 1)
        const wiggled = wiggleChain(slice, amp, freq)
        for (let i = 0; i < wiggled.length; i++) dense[s + i] = wiggled[i]
      }
      chain = dense
    }
    const effectiveAmp = hasAnyOverride
      ? Math.max(...hopKeysList.map(k => {
          const hp = hopProps[k], sp2 = segProps[id]
          return (hp?.wiggleAmp ?? sp2?.wiggleAmp ?? effectiveAmpFactor) * interHexDist
        }))
      : wiggleAmplitude
    if (effectiveAmp > 0 && chaikinPasses > 0) chain = chaikin(chain, chaikinPasses, false)
    return { ...c, chain }
  })
  return { ...baseData, chains }
}
