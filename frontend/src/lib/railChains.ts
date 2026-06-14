/** Rail chain building. */

import { catmullRom, chaikin } from './geometry'
import { seededRandom, wiggleChain } from './noise'
import { edgeCpKey, juncCpKey } from './roadChains'

export type RailBaseData = {
  chains: {
    chain: [number, number][]
    baseChain: [number, number][]
    id: string
    isShared: boolean
    isLoop: boolean
    hopKeys: string[]
    hopRanges: [number, number][]
  }[]
  controlPoints: { key: string; pos: [number, number] }[]
  interHexDist: number
}

export function buildRailChains(
  railEdges: { q1: number; r1: number; q2: number; r2: number }[],
  roadEdges: { q1: number; r1: number; q2: number; r2: number }[],
  hexIdx: Map<string, { center: [number, number] }>,
  roadEdgeMidpoints: Map<string, [number, number]>,
  roadJunctionPositions: Map<string, [number, number]>,
  overrides: Record<string, [number, number]> = {},
  wiggleAmpFactor = 0,
  wiggleFreqFactor = 2.5,
  smoothing = 10,
  segProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  hopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  chaikinPasses = 2,
  pathSmoothing = 0,
): RailBaseData {
  if (railEdges.length === 0) return { chains: [], controlPoints: [], interHexDist: 0 }

  let interHexDist = 0, hexScaleSamples = 0
  for (const e of railEdges.slice(0, 8)) {
    const h1 = hexIdx.get(`${e.q1},${e.r1}`), h2 = hexIdx.get(`${e.q2},${e.r2}`)
    if (h1 && h2) { interHexDist += Math.hypot(h2.center[0] - h1.center[0], h2.center[1] - h1.center[1]); hexScaleSamples++ }
  }
  interHexDist = hexScaleSamples > 0 ? interHexDist / hexScaleSamples : 0
  const hexScale = interHexDist * 0.28

  const roadPairSet = new Set<string>()
  for (const e of roadEdges) {
    const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
    roadPairSet.add(a < b ? `${a}|${b}` : `${b}|${a}`)
  }

  const adj = new Map<string, string[]>()
  for (const e of railEdges) {
    const k1 = `${e.q1},${e.r1}`, k2 = `${e.q2},${e.r2}`
    if (!adj.has(k1)) adj.set(k1, [])
    if (!adj.has(k2)) adj.set(k2, [])
    if (!adj.get(k1)!.includes(k2)) adj.get(k1)!.push(k2)
    if (!adj.get(k2)!.includes(k1)) adj.get(k2)!.push(k1)
  }

  const isJunction = (k: string) => (adj.get(k) ?? []).length > 2

  const junctionPositions = new Map<string, [number, number]>()
  for (const [k] of adj) {
    if (!isJunction(k)) continue
    const h = hexIdx.get(k); if (!h) continue
    const jaOverride = overrides[juncCpKey(k)]
    if (jaOverride) { junctionPositions.set(k, jaOverride); continue }
    const roadJP = roadJunctionPositions.get(k)
    if (roadJP) { junctionPositions.set(k, roadJP); continue }
    const [q, r] = k.split(',').map(Number)
    const angle = seededRandom(q, r, 7) * Math.PI * 2
    const radius = hexScale * 0.15
    const ox = Math.cos(angle) * radius, oy = Math.sin(angle) * radius
    let valid = true
    for (const nk of adj.get(k) ?? []) {
      const hn = hexIdx.get(nk); if (!hn) continue
      const ax = h.center[0] - (h.center[0] + hn.center[0]) / 2
      const ay = h.center[1] - (h.center[1] + hn.center[1]) / 2
      if (ox * ax + oy * ay < -0.4 * Math.hypot(ax, ay) * Math.hypot(ox, oy)) { valid = false; break }
    }
    junctionPositions.set(k, valid ? [h.center[0] + ox, h.center[1] + oy] : h.center)
  }
  const jPos = (k: string): [number, number] => {
    const jp = junctionPositions.get(k)
    if (jp) return jp
    const h = hexIdx.get(k)
    return h ? h.center : [0, 0]
  }

  const visitedPairs = new Set<string>()
  const wiggleAmplitude = wiggleAmpFactor * interHexDist
  const wiggleFreq = interHexDist > 0 ? wiggleFreqFactor / interHexDist : 0

  const chains: RailBaseData['chains'] = []
  const controlPoints: { key: string; pos: [number, number] }[] = []

  const walk = (startKey: string) => {
    const h0 = hexIdx.get(startKey)
    if (!h0) return
    const startDeg = (adj.get(startKey) ?? []).length
    const pts: [number, number][] = []
    const pinned: boolean[] = []
    const edgeKeys: (string | null)[] = []
    let sharedCount = 0, segCount = 0

    if (startDeg !== 2 || isJunction(startKey)) { pts.push(jPos(startKey)); pinned.push(true); edgeKeys.push(null) }
    let cur = startKey
    for (;;) {
      const next = (adj.get(cur) ?? []).find(nk => {
        const ep = cur < nk ? `${cur}|${nk}` : `${nk}|${cur}`
        return !visitedPairs.has(ep)
      })
      if (!next) break
      const ep = cur < next ? `${cur}|${next}` : `${next}|${cur}`
      visitedPairs.add(ep)
      const h1 = hexIdx.get(cur), h2 = hexIdx.get(next)
      if (h1 && h2) {
        const ek = edgeCpKey(cur, next)
        const emOverride = overrides[ek] as [number, number] | undefined
        const roadMid = !emOverride && roadPairSet.has(ep) ? roadEdgeMidpoints.get(ek) : undefined
        let mid: [number, number]
        if (emOverride) {
          mid = emOverride
        } else if (roadMid) {
          mid = roadMid
        } else {
          const mx = (h1.center[0] + h2.center[0]) / 2, my = (h1.center[1] + h2.center[1]) / 2
          const dx = h2.center[0] - h1.center[0], dy = h2.center[1] - h1.center[1]
          const len = Math.hypot(dx, dy)
          const [qa, ra] = (cur < next ? cur : next).split(',').map(Number)
          const [qb, rb] = (cur < next ? next : cur).split(',').map(Number)
          const perp = (seededRandom(qa + qb, ra + rb, 6) - 0.5) * hexScale * 0.5
          mid = len > 1e-6 ? [mx + (-dy / len) * perp, my + (dx / len) * perp] : [mx, my]
        }
        pts.push(mid); pinned.push(!!emOverride); edgeKeys.push(ek)
        if (roadPairSet.has(ep)) sharedCount++
        segCount++
      }
      cur = next
      const curDeg = (adj.get(cur) ?? []).length
      if (curDeg === 1) { const he = hexIdx.get(cur); if (he) { pts.push(he.center); pinned.push(true); edgeKeys.push(null) } break }
      if (isJunction(cur)) { pts.push(jPos(cur)); pinned.push(true); edgeKeys.push(null); break }
      const roadJP = roadJunctionPositions.get(cur)
      if (roadJP) { pts.push(roadJP); pinned.push(true); edgeKeys.push(null) }
    }

    const isLoop = cur === startKey && pts.length >= 3
    if (isLoop) { pts.push(pts[0]); pinned.push(true); edgeKeys.push(null) }
    if (pts.length < 2) return

    const isShared = segCount > 0 && sharedCount > segCount / 2

    const a = startKey < cur ? startKey : cur
    const b = startKey < cur ? cur : startKey
    const id = isLoop ? `rail|loop|${startKey}` : `rail|${a}|${b}`

    // Emit em| control points
    for (let i = 0; i < edgeKeys.length; i++) {
      const ek = edgeKeys[i]
      if (ek !== null) controlPoints.push({ key: ek, pos: pts[i] })
    }

    // Path smoothing
    const relaxed = pts.slice() as [number, number][]
    const iters = pathSmoothing > 0 ? Math.round(pathSmoothing) : Math.round(smoothing * 0.3)
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < relaxed.length - 1; i++) {
        if (pinned[i]) continue
        relaxed[i] = [
          relaxed[i][0] + 0.1 * ((relaxed[i - 1][0] + relaxed[i + 1][0]) / 2 - relaxed[i][0]),
          relaxed[i][1] + 0.1 * ((relaxed[i - 1][1] + relaxed[i + 1][1]) / 2 - relaxed[i][1]),
        ]
      }
    }

    const steps = Math.max(2, Math.round(smoothing))
    const baseChain = catmullRom(relaxed, steps)

    const hopCount = relaxed.length - 1
    const hopKeys: string[] = []
    const hopRanges: [number, number][] = []
    for (let h = 0; h < hopCount; h++) {
      hopKeys.push(roadHopKey(relaxed[h], relaxed[h + 1]))
      hopRanges.push([h * steps, (h + 1) * steps])
    }

    const sp = segProps[id]
    const hasAnyOverride = sp?.wiggleAmp !== undefined || sp?.wiggleFreq !== undefined ||
      hopKeys.some(k => hopProps[k]?.wiggleAmp !== undefined || hopProps[k]?.wiggleFreq !== undefined)

    let chain: [number, number][]
    if (!hasAnyOverride) {
      chain = wiggleChain(baseChain, wiggleAmplitude, wiggleFreq)
    } else {
      const dense = [...baseChain] as [number, number][]
      for (let h = 0; h < hopCount; h++) {
        const [s, e] = hopRanges[h]
        const hp = hopProps[hopKeys[h]]
        const amp = (hp?.wiggleAmp ?? sp?.wiggleAmp ?? wiggleAmpFactor) * interHexDist
        const freq = (hp?.wiggleFreq ?? sp?.wiggleFreq ?? wiggleFreqFactor) / (interHexDist || 1)
        const slice = baseChain.slice(s, e + 1)
        const wiggled = wiggleChain(slice, amp, freq)
        for (let i = 0; i < wiggled.length; i++) dense[s + i] = wiggled[i]
      }
      chain = dense
    }
    if (wiggleAmplitude > 0 && chaikinPasses > 0) chain = chaikin(chain, chaikinPasses, false)

    chains.push({ chain, baseChain, id, isShared, isLoop, hopKeys, hopRanges })
  }

  for (const [k, nbs] of adj) { if (nbs.length === 1) walk(k) }
  for (const [k, nbs] of adj) {
    if (isJunction(k)) {
      for (const nk of nbs) {
        const ep = k < nk ? `${k}|${nk}` : `${nk}|${k}`
        if (!visitedPairs.has(ep)) walk(k)
      }
    }
  }
  for (const [k, nbs] of adj) {
    for (const nk of nbs) {
      const ep = k < nk ? `${k}|${nk}` : `${nk}|${k}`
      if (!visitedPairs.has(ep)) walk(k)
    }
  }

  // Junction control points
  for (const [k, pos] of junctionPositions) {
    controlPoints.push({ key: juncCpKey(k), pos })
  }

  return { chains, controlPoints, interHexDist }
}

export function applyRailWiggle(
  base: RailBaseData,
  wiggleAmpFactor: number,
  wiggleFreqFactor: number,
  segProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  hopProps: Record<string, { wiggleAmp?: number; wiggleFreq?: number }> = {},
  chaikinPasses = 2,
  railGeomOverride?: { wiggleAmp?: number; wiggleFreq?: number },
): RailBaseData {
  const { interHexDist } = base
  const effectiveAmpFactor = railGeomOverride?.wiggleAmp ?? wiggleAmpFactor
  const effectiveFreqFactor = railGeomOverride?.wiggleFreq ?? wiggleFreqFactor
  const wiggleAmplitude = effectiveAmpFactor * interHexDist
  const wiggleFreq = interHexDist > 0 ? effectiveFreqFactor / interHexDist : 0

  const chains = base.chains.map(c => {
    const { id, baseChain, hopKeys = [], hopRanges = [] } = c
    const sp = segProps[id]
    const hasAnyOverride = (sp?.wiggleAmp !== undefined || sp?.wiggleFreq !== undefined ||
      hopKeys.some(k => hopProps[k]?.wiggleAmp !== undefined || hopProps[k]?.wiggleFreq !== undefined)) &&
      hopKeys.length > 0

    let chain: [number, number][]
    if (!hasAnyOverride) {
      chain = wiggleChain(baseChain, wiggleAmplitude, wiggleFreq)
    } else {
      const dense = [...baseChain] as [number, number][]
      for (let h = 0; h < hopKeys.length; h++) {
        const [s, e] = hopRanges[h]
        const hp = hopProps[hopKeys[h]]
        const amp = (hp?.wiggleAmp ?? sp?.wiggleAmp ?? effectiveAmpFactor) * interHexDist
        const freq = (hp?.wiggleFreq ?? sp?.wiggleFreq ?? effectiveFreqFactor) / (interHexDist || 1)
        const slice = baseChain.slice(s, e + 1)
        const wiggled = wiggleChain(slice, amp, freq)
        for (let i = 0; i < wiggled.length; i++) dense[s + i] = wiggled[i]
      }
      chain = dense
    }
    const effectiveAmp = hasAnyOverride
      ? Math.max(...hopKeys.map(k => {
          const hp = hopProps[k], sp2 = segProps[id]
          return (hp?.wiggleAmp ?? sp2?.wiggleAmp ?? effectiveAmpFactor) * interHexDist
        }))
      : wiggleAmplitude
    if (effectiveAmp > 0 && chaikinPasses > 0) chain = chaikin(chain, chaikinPasses, false)
    return { ...c, chain }
  })
  return { ...base, chains }
}
