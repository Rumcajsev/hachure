/** Road chain building V3.
 *
 * Clean three-stage pipeline — all stages operate on sparse waypoints so the
 * curve-fitting (Catmull-Rom) does all of the work in a single pass:
 *
 *   walk → path straightening → intra-segment variation → Catmull-Rom
 *
 * Per-tier geometry (all four params independent per tier, no global fallback):
 *   cornerRoundness    0–1   How strongly direction changes are rounded (CR step density)
 *   pathStraightness   0–1   How much waypoints are pulled toward the direct line
 *   segmentVariation   0–1   Amplitude of organic intra-segment noise (fraction of hex dist)
 *   variationCharacter 0–3   Number of noise inflection points inserted per segment
 */

import { catmullRom } from './geometry'
import { hashStr, seededRng } from './noise'
import { edgeCpKey, juncCpKey, spineSideCpKey } from './roadChains'

export type RoadV3TierGeom = {
  cornerRoundness: number
  pathStraightness: number
  segmentVariation: number
  variationCharacter: number
}

export type RoadBaseDataV3 = {
  chains: { tier: 0 | 1 | 2; chain: [number, number][]; id: string }[]
  junctions: { pos: [number, number]; tier: 0 | 1 | 2 }[]
  controlPoints: { key: string; pos: [number, number] }[]
  interHexDist: number
}

export function buildRoadChainsV3(
  roadEdges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[],
  hexIdx: Map<string, { center: [number, number] }>,
  overrides: Record<string, [number, number]>,
  tierGeom: [RoadV3TierGeom, RoadV3TierGeom, RoadV3TierGeom],
): RoadBaseDataV3 {
  if (roadEdges.length === 0) return { chains: [], junctions: [], controlPoints: [], interHexDist: 0 }

  // Measure average inter-hex distance for scaling amplitude
  let interHexDist = 0, hexScaleSamples = 0
  for (const e of roadEdges.slice(0, 8)) {
    const h1 = hexIdx.get(`${e.q1},${e.r1}`), h2 = hexIdx.get(`${e.q2},${e.r2}`)
    if (h1 && h2) {
      interHexDist += Math.hypot(h2.center[0] - h1.center[0], h2.center[1] - h1.center[1])
      hexScaleSamples++
    }
  }
  interHexDist = hexScaleSamples > 0 ? interHexDist / hexScaleSamples : 0

  // Global adjacency over all edges, tier-independent
  const adj = new Map<string, string[]>()
  for (const e of roadEdges) {
    const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
    if (!adj.has(k1)) adj.set(k1, [])
    if (!adj.has(k2)) adj.set(k2, [])
    if (!adj.get(k1)!.includes(k2)) adj.get(k1)!.push(k2)
    if (!adj.get(k2)!.includes(k1)) adj.get(k2)!.push(k1)
  }

  // Minimum tier per edge (most important tier wins)
  const edgeMinTier = new Map<string, 0 | 1 | 2>()
  for (const e of roadEdges) {
    const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
    const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
    const existing = edgeMinTier.get(ek)
    if (existing === undefined || e.tier < existing) edgeMinTier.set(ek, e.tier)
  }

  const isJunction = (k: string) => (adj.get(k)?.length ?? 0) > 2

  // Junction centre positions: average of mid-edge positions on most-important-tier arms
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

  for (const [ok, pos] of Object.entries(overrides)) {
    if (ok.startsWith('ja|')) junctionPositions.set(ok.slice(3), pos)
  }

  // Staggered spine junction model — finds the most collinear pair of neighbours as the
  // through-road "spine", assigns branches to sides, maps each arm to its terminal point.
  const spineNeighbors = new Map<string, [string, string]>()
  const armToTerminal = new Map<string, [number, number]>()
  const sideTerminals = new Map<string, [number, number]>()

  for (const [k] of adj) {
    const neighbors = [...(adj.get(k) ?? [])]
    if (neighbors.length <= 2) continue
    const h = hexIdx.get(k); if (!h) continue
    const jc = junctionPositions.get(k) ?? h.center

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
    if (!bestPair) continue
    spineNeighbors.set(k, bestPair)

    const hA = hexIdx.get(bestPair[0]), hB = hexIdx.get(bestPair[1])
    if (!hA || !hB) continue

    const sdx = hA.center[0] - h.center[0], sdy = hA.center[1] - h.center[1]
    const sLen = Math.hypot(sdx, sdy)
    const snx = sLen > 1e-6 ? sdx / sLen : 1, sny = sLen > 1e-6 ? sdy / sLen : 0

    const branches = neighbors.filter(n => n !== bestPair![0] && n !== bestPair![1]).sort()
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

    const termA: [number, number] = overrides[spineSideCpKey(k, bestPair[0])] ?? [jc[0], jc[1]]
    const termB: [number, number] = overrides[spineSideCpKey(k, bestPair[1])] ?? [jc[0], jc[1]]

    armToTerminal.set(`${k}|${bestPair[0]}`, termA)
    armToTerminal.set(`${k}|${bestPair[1]}`, termB)
    for (const bn of sideA) armToTerminal.set(`${k}|${bn}`, overrides[spineSideCpKey(k, bn)] ?? termA)
    for (const bn of sideB) armToTerminal.set(`${k}|${bn}`, overrides[spineSideCpKey(k, bn)] ?? termB)
    for (const bn of branches) {
      if (!sideA.has(bn) && !sideB.has(bn))
        armToTerminal.set(`${k}|${bn}`, overrides[spineSideCpKey(k, bn)] ?? termA)
    }

    sideTerminals.set(`${k}|${bestPair[0]}`, termA)
    sideTerminals.set(`${k}|${bestPair[1]}`, termB)
  }

  const chains: RoadBaseDataV3['chains'] = []
  const junctionMap = new Map<string, { pos: [number, number]; tier: 0 | 1 | 2 }>()
  const controlPoints: { key: string; pos: [number, number] }[] = []
  const visitedPairs = new Set<string>()

  // Non-spine junctions get a plain dot
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

  // Walk one chain from startKey, collecting sparse waypoints.
  // Returns waypoints, which ones are pinned (must not move in straightening), and
  // per-waypoint raw edge keys for noise seeding.
  const walk = (startKey: string): {
    pts: [number, number][]
    endKey: string
    pinned: boolean[]
    edgeKeys: (string | null)[]  // canonical em| key (for control points)
    rawSegKeys: (string | null)[] // raw "a|b" key (for noise seeding)
    ptsTiers: (0 | 1 | 2 | null)[]
  } => {
    const h0 = hexIdx.get(startKey)
    if (!h0) return { pts: [], endKey: startKey, pinned: [], edgeKeys: [], rawSegKeys: [], ptsTiers: [] }
    const startDeg = (adj.get(startKey) ?? []).length
    const pts: [number, number][] = []
    const pinned: boolean[] = []
    const edgeKeys: (string | null)[] = []
    const rawSegKeys: (string | null)[] = []
    const ptsTiers: (0 | 1 | 2 | null)[] = []
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
          pts.push(jPos(startKey, h0, next))
          pinned.push(true); edgeKeys.push(null); rawSegKeys.push(null); ptsTiers.push(null)
        }
      }

      const ep = cur < next ? `${cur}|${next}` : `${next}|${cur}`
      visitedPairs.add(ep)

      const h1 = hexIdx.get(cur), h2 = hexIdx.get(next)
      if (h1 && h2) {
        const ek = edgeCpKey(cur, next)
        const rawEk = cur < next ? `${cur}|${next}` : `${next}|${cur}`
        const isOverridden = !!overrides[ek]
        const mid: [number, number] = isOverridden
          ? overrides[ek]
          : [(h1.center[0] + h2.center[0]) / 2, (h1.center[1] + h2.center[1]) / 2]
        pts.push(mid)
        pinned.push(isOverridden)
        edgeKeys.push(ek)
        rawSegKeys.push(rawEk)
        ptsTiers.push(edgeMinTier.get(rawEk) ?? 2)
      }

      prevKey = cur
      cur = next
      const curDeg = (adj.get(cur) ?? []).length
      if (curDeg === 1) {
        const he = hexIdx.get(cur)
        if (he) { pts.push(he.center); pinned.push(true); edgeKeys.push(null); rawSegKeys.push(null); ptsTiers.push(null) }
        break
      }
      if (isJunction(cur)) {
        const hj = hexIdx.get(cur)
        if (hj) { pts.push(jPos(cur, hj, prevKey)); pinned.push(true); edgeKeys.push(null); rawSegKeys.push(null); ptsTiers.push(null) }
        break
      }
    }

    return { pts, endKey: cur, pinned, edgeKeys, rawSegKeys, ptsTiers }
  }

  const pushChain = (startKey: string) => {
    const { pts, endKey, pinned, edgeKeys, rawSegKeys, ptsTiers } = walk(startKey)
    if (pts.length < 2) return

    // Determine chain tier from minimum tier across all hops
    let chainTier: 0 | 1 | 2 = 2
    for (const t of ptsTiers) {
      if (t !== null && t < chainTier) chainTier = t
    }
    const geom = tierGeom[chainTier]

    const a = startKey < endKey ? startKey : endKey
    const b = startKey < endKey ? endKey : startKey
    const id = `v3|${chainTier}|${a}|${b}`

    // Emit em| control points so the node-edit tool can drag hex-edge midpoints
    for (let i = 0; i < edgeKeys.length; i++) {
      const ek = edgeKeys[i]
      if (ek !== null) controlPoints.push({ key: ek, pos: pts[i] })
    }

    // ── Stage 1: Path straightening ────────────────────────────────────────────
    // Blend each free interior waypoint toward the direct line between the chain's
    // two anchor points. Pinned points (junctions, overridden midpoints) stay put.
    const straightened = pts.slice() as [number, number][]
    if (geom.pathStraightness > 0 && pts.length > 2) {
      const p0 = pts[0], pN = pts[pts.length - 1]
      const N = pts.length - 1
      for (let i = 1; i < pts.length - 1; i++) {
        if (pinned[i]) continue
        const t = i / N
        const sx = p0[0] + (pN[0] - p0[0]) * t
        const sy = p0[1] + (pN[1] - p0[1]) * t
        const s = geom.pathStraightness
        straightened[i] = [
          pts[i][0] + s * (sx - pts[i][0]),
          pts[i][1] + s * (sy - pts[i][1]),
        ]
      }
    }

    // ── Stage 2: Entry overshoot + intra-segment variation ────────────────────
    // For each segment A → B:
    //   1. Insert a post-entry guide point: A + entry_dir * d
    //      This keeps the road travelling in its entry direction for a short
    //      distance inside the hex before curving. The bend happens in the hex
    //      interior, not right at the boundary.
    //   2. Insert intra-segment noise points (displaced perpendicularly, faded
    //      to zero at endpoints so entry/exit positions are not affected).
    //   3. Insert a pre-exit guide point: B - entry_dir * d
    //      This ensures the road arrives at the exit edge already aligned with
    //      the segment direction, making the approach clean.
    const noisePts = Math.round(Math.max(0, geom.variationCharacter))
    const noiseAmp = geom.segmentVariation * interHexDist
    const overshootDist = geom.entryOvershoot * interHexDist
    const augmented: [number, number][] = []

    for (let i = 0; i < straightened.length; i++) {
      augmented.push(straightened[i])

      if (i < straightened.length - 1) {
        const A = straightened[i], B = straightened[i + 1]
        const dx = B[0] - A[0], dy = B[1] - A[1]
        const len = Math.hypot(dx, dy)
        if (len < 1e-6) continue

        const ux = dx / len, uy = dy / len      // entry direction unit vector
        const perpX = -uy, perpY = ux            // perpendicular for noise

        // Cap overshoot so the two guide points never overlap each other
        const d = Math.min(overshootDist, len * 0.4)

        // Post-entry guide — fires after every waypoint, giving straight departure
        if (d > 1e-10) {
          augmented.push([A[0] + ux * d, A[1] + uy * d])
        }

        // Intra-segment noise points (between the two guide points)
        if (noisePts > 0 && noiseAmp > 1e-10) {
          const segSeed = `${rawSegKeys[i] ?? ''}:${rawSegKeys[i + 1] ?? ''}:${i}`
          for (let j = 0; j < noisePts; j++) {
            const t = (j + 1) / (noisePts + 1)
            const fade = Math.sin(Math.PI * t)
            const rng = seededRng(hashStr(segSeed + '|' + j))
            const noise = rng() * 2 - 1
            augmented.push([
              A[0] + dx * t + perpX * noise * fade * noiseAmp,
              A[1] + dy * t + perpY * noise * fade * noiseAmp,
            ])
          }
        }

        // Pre-exit guide — only for free (non-pinned) destinations so the road
        // still arrives exactly at junctions and dead-ends
        if (d > 1e-10 && !pinned[i + 1]) {
          augmented.push([B[0] - ux * d, B[1] - uy * d])
        }
      }
    }

    // ── Stage 3: Corner rounding via Catmull-Rom ───────────────────────────────
    // Catmull-Rom both smooths through the augmented waypoints (rounding the
    // corners at hex-edge crossings) and densifies the chain in one pass.
    // At cornerRoundness = 0 we skip it entirely: the output is a plain polyline.
    let chain: [number, number][]
    if (geom.cornerRoundness < 0.01 || augmented.length < 2) {
      chain = augmented
    } else {
      const steps = Math.max(2, Math.round(geom.cornerRoundness * 20))
      chain = catmullRom(augmented, steps)
    }

    chains.push({ tier: chainTier, chain, id })
  }

  // Walk order mirrors V2: dead ends first to establish chain directions,
  // then junction arms, then any remaining unvisited loops.
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

  // Short stub chain connecting the two side terminals of a spine junction.
  // Keeps the junction visually connected when the two terminals coincide (default).
  for (const [k, spinePair] of spineNeighbors) {
    const termA = sideTerminals.get(`${k}|${spinePair[0]}`)
    const termB = sideTerminals.get(`${k}|${spinePair[1]}`)
    if (!termA || !termB) continue
    if (Math.hypot(termA[0] - termB[0], termA[1] - termB[1]) < 1e-9) continue
    const ekA = k < spinePair[0] ? `${k}|${spinePair[0]}` : `${spinePair[0]}|${k}`
    const ekB = k < spinePair[1] ? `${k}|${spinePair[1]}` : `${spinePair[1]}|${k}`
    const stubTier = Math.min(edgeMinTier.get(ekA) ?? 2, edgeMinTier.get(ekB) ?? 2) as 0 | 1 | 2
    chains.push({ tier: stubTier, chain: [termA, termB], id: `stub|${k}` })
  }

  // Junction dots and draggable control points for spine junctions
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
  }

  for (const [k, entry] of junctionMap) {
    if (!k.includes('|')) controlPoints.push({ key: juncCpKey(k), pos: entry.pos })
  }

  return { chains, junctions: Array.from(junctionMap.values()), controlPoints, interHexDist }
}
