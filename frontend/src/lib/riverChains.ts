/** Shared river-chain utilities.
 *
 *  `riverChainCache` is a mutable singleton written by TerrainViewCanvas
 *  after each drawRivers pass and read by RiversSidebar when computing
 *  group-taper arc-length fractions.  It is intentionally NOT React state —
 *  no re-renders, just a plain reference to the last computed chain data.
 */

import { makePermutation, perlinNoise2D, hashStr, wiggleChain } from './noise'
import { catmullRom } from './geometry'
import type { GeneratedHex } from '../store/mapStore'

export interface RiverChain {
  segKey: string
  vertices: [number, number][]
}

export const riverChainCache: { chains: RiverChain[] } = { chains: [] }

// ---------------------------------------------------------------------------
// Vertex key helpers — must match the tolerance used in TerrainViewCanvas
// ---------------------------------------------------------------------------
const VK_EPS = 0.00015
export function vKey(v: [number, number]): string {
  return `${Math.round(v[0] / (VK_EPS * 0.5))},${Math.round(v[1] / (VK_EPS * 0.5))}`
}

// ---------------------------------------------------------------------------
// Arc-length helpers
// ---------------------------------------------------------------------------
export function arcLength(vertices: [number, number][]): number {
  let len = 0
  for (let i = 1; i < vertices.length; i++)
    len += Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1])
  return len
}

// ---------------------------------------------------------------------------
// Order a subset of chains into a continuous path (best-effort).
// Returns chains in walk order with a `reversed` flag so the caller knows
// which end of each chain is the "upstream" end.
// ---------------------------------------------------------------------------
export interface OrderedChain extends RiverChain {
  reversed: boolean
}

export function orderChains(selectedKeys: string[], allChains: RiverChain[]): OrderedChain[] {
  const keySet = new Set(selectedKeys)
  const chains = allChains.filter(c => keySet.has(c.segKey))
  if (chains.length === 0) return []
  if (chains.length === 1) return [{ ...chains[0], reversed: false }]

  // Per-chain endpoint vertex keys
  const infos = chains.map(c => ({
    chain: c,
    startVk: vKey(c.vertices[0]),
    endVk: vKey(c.vertices[c.vertices.length - 1]),
  }))

  // Build vKey → chain list (each endpoint maps to the chains touching it)
  const vkToChains = new Map<string, typeof infos>()
  for (const info of infos) {
    for (const vk of [info.startVk, info.endVk]) {
      if (!vkToChains.has(vk)) vkToChains.set(vk, [])
      vkToChains.get(vk)!.push(info)
    }
  }

  // Find a degree-1 endpoint to start from (only one chain touches it)
  let startVk: string | null = null
  for (const [vk, cs] of vkToChains)
    if (cs.length === 1) { startVk = vk; break }
  // Fall back to any vertex if the selection forms a closed loop
  if (!startVk) startVk = infos[0].startVk

  // Walk through chains following shared endpoints
  const result: OrderedChain[] = []
  const visited = new Set<string>()
  let curVk = startVk

  while (result.length < chains.length) {
    const touching = vkToChains.get(curVk) ?? []
    const next = touching.find(i => !visited.has(i.chain.segKey))
    if (!next) break
    visited.add(next.chain.segKey)
    const reversed = next.endVk === curVk   // we entered from the end → chain is reversed
    result.push({ ...next.chain, reversed })
    curVk = reversed ? next.startVk : next.endVk
  }

  // If some chains weren't reachable (disconnected selection) append them unordered
  for (const info of infos)
    if (!visited.has(info.chain.segKey))
      result.push({ ...info.chain, reversed: false })

  return result
}

// ---------------------------------------------------------------------------
// River path smoothing and organic wobble
// ---------------------------------------------------------------------------

/** Subdivide → Laplacian-relax smoothing for river paths.
 *  passes=0 → raw hex edges; passes=8 → smooth flowing curve. */
export function riverSmooth(pts: [number, number][], passes: number): [number, number][] {
  if (passes === 0 || pts.length < 2) return pts
  const SUB = 6
  let p: [number, number][] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    for (let k = 1; k <= SUB; k++) {
      const t = k / SUB
      p.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t])
    }
  }
  const iters = passes * passes
  for (let iter = 0; iter < iters; iter++) {
    const q: [number, number][] = [p[0]]
    for (let i = 1; i < p.length - 1; i++) {
      q.push([(p[i - 1][0] + p[i][0] + p[i + 1][0]) / 3,
               (p[i - 1][1] + p[i][1] + p[i + 1][1]) / 3])
    }
    q.push(p[p.length - 1])
    p = q
  }
  return p
}

/** Add two-band organic wobble perpendicular to the path, tapering to zero at endpoints. */
export function applyWobble(
  pts: [number, number][],
  ampBroad: number,
  ampDetail: number,
  R: number,
  segKey: string,
): [number, number][] {
  if (ampBroad < 1e-6 && ampDetail < 1e-6) return pts
  if (pts.length < 3) return pts

  const lens: number[] = [0]
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const totalLen = lens[lens.length - 1]
  if (totalLen < 1e-6) return pts

  const phase = pts[0][0] * 0.137 + pts[0][1] * 0.213
  const fB1 = 1 / (R * 4.5)
  const fB2 = 1 / (R * 3.1)

  const detailPerm = ampDetail > 1e-6 ? makePermutation(hashStr(segKey) & 0xffff) : null
  const detailFreq = 1 / (R * 1.2)

  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p

    const prev = pts[i - 1], next = pts[i + 1]
    const dx = next[0] - prev[0], dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return p
    const nx = -dy / len, ny = dx / len

    const s = lens[i]
    const taper = Math.sin(Math.PI * s / totalLen)

    const broad = ampBroad > 1e-6
      ? ampBroad * (Math.sin(s * fB1 + phase) + 0.6 * Math.sin(s * fB2 + phase * 1.4)) / 1.6 * taper
      : 0
    const detail = detailPerm
      ? ampDetail * perlinNoise2D(s * detailFreq, 0.5, detailPerm) * taper
      : 0

    return [p[0] + nx * (broad + detail), p[1] + ny * (broad + detail)] as [number, number]
  })
}

/** Draw a polyline with linearly-interpolated lineWidth using round-capped per-segment strokes.
 *  hwStart / hwEnd are half-widths at the two endpoints. */
export function drawVariableWidthStroke(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pts: [number, number][],
  hwStart: number,
  hwEnd: number,
  color: string,
  widthMultipliers?: number[],
) {
  if (pts.length < 2) return

  const lens: number[] = [0]
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const totalLen = lens[lens.length - 1]

  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let i = 0; i < pts.length - 1; i++) {
    const tMid = totalLen > 1e-6 ? (lens[i] + lens[i + 1]) * 0.5 / totalLen : 0.5
    let hw = hwStart + (hwEnd - hwStart) * tMid
    if (widthMultipliers) hw *= (widthMultipliers[i] + widthMultipliers[i + 1]) * 0.5
    ctx.beginPath()
    ctx.moveTo(pts[i][0], pts[i][1])
    ctx.lineTo(pts[i + 1][0], pts[i + 1][1])
    ctx.lineWidth = hw * 2
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// Compute taperRange [t0, t1] for each segment in a group.
// t=0 is the narrow end; t=1 is the wide end of the combined ribbon.
// ---------------------------------------------------------------------------
export function computeTaperRanges(
  selectedKeys: string[],
  allChains: RiverChain[],
): Record<string, [number, number]> {
  const ordered = orderChains(selectedKeys, allChains)
  if (ordered.length === 0) return {}

  const lengths = ordered.map(c => arcLength(c.vertices))
  const total = lengths.reduce((a, b) => a + b, 0)

  const ranges: Record<string, [number, number]> = {}
  let cum = 0
  for (let i = 0; i < ordered.length; i++) {
    const t0 = total > 0 ? cum / total : 0
    const t1 = total > 0 ? (cum + lengths[i]) / total : 1
    // If the chain is reversed in the walk, its start is the wide end
    ranges[ordered[i].segKey] = ordered[i].reversed ? [t1, t0] : [t0, t1]
    cum += lengths[i]
  }
  return ranges
}

// ---------------------------------------------------------------------------
// Chain topology building from hex edges
// ---------------------------------------------------------------------------

function findSharedVerts(h1: GeneratedHex, h2: GeneratedHex): [[number, number], [number, number]] | null {
  const shared: [number, number][] = []
  const seen = new Set<string>()
  for (const va of h1.vertices as [number, number][]) {
    for (const vb of h2.vertices as [number, number][]) {
      if (vKey(va) === vKey(vb)) {
        const k = vKey(va)
        if (!seen.has(k)) { seen.add(k); shared.push(va) }
        break
      }
    }
  }
  return shared.length === 2 ? [shared[0], shared[1]] : null
}

/** Build polyline chains from a list of hex-adjacency edges.
 *  Each edge is defined by two adjacent hex coordinates; the shared vertices
 *  become the chain geometry. Chains are traced greedily from degree-1 nodes. */
export function buildRiverChains(
  edges: { q1: number; r1: number; q2: number; r2: number }[],
  hexes: GeneratedHex[],
): RiverChain[] {
  const hexMap = new Map<string, GeneratedHex>()
  for (const h of hexes) hexMap.set(`${h.q},${h.r}`, h)

  const adj = new Map<string, { key: string; coord: [number, number] }[]>()
  const coordOf = new Map<string, [number, number]>()

  for (const edge of edges) {
    const h1 = hexMap.get(`${edge.q1},${edge.r1}`), h2 = hexMap.get(`${edge.q2},${edge.r2}`)
    if (!h1 || !h2) continue
    const shared = findSharedVerts(h1, h2)
    if (!shared) continue
    const [v0, v1] = shared
    const k0 = vKey(v0), k1 = vKey(v1)
    coordOf.set(k0, v0); coordOf.set(k1, v1)
    if (!adj.has(k0)) adj.set(k0, [])
    if (!adj.has(k1)) adj.set(k1, [])
    adj.get(k0)!.push({ key: k1, coord: v1 })
    adj.get(k1)!.push({ key: k0, coord: v0 })
  }

  const degree = new Map<string, number>()
  for (const [k, nbrs] of adj) degree.set(k, nbrs.length)

  const eid = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`
  const visitedEdges = new Set<string>()

  const walkFrom = (startKey: string, dirKey: string): [number, number][] => {
    const chain: [number, number][] = [coordOf.get(startKey)!, coordOf.get(dirKey)!]
    visitedEdges.add(eid(startKey, dirKey))
    let cur = dirKey
    for (;;) {
      if ((degree.get(cur) ?? 0) !== 2) break
      const nbrs = adj.get(cur) ?? []
      const next = nbrs.find(n => !visitedEdges.has(eid(cur, n.key)))
      if (!next) {
        if (nbrs.some(n => n.key === startKey) && chain.length > 2)
          chain.push(coordOf.get(startKey)!)
        break
      }
      visitedEdges.add(eid(cur, next.key))
      chain.push(next.coord)
      cur = next.key
    }
    return chain
  }

  const rawChains: [number, number][][] = []
  for (const [k] of adj) {
    const deg = degree.get(k) ?? 0
    if (deg === 2) continue
    for (const nbr of (adj.get(k) ?? [])) {
      if (visitedEdges.has(eid(k, nbr.key))) continue
      const chain = walkFrom(k, nbr.key)
      if (chain.length >= 2) rawChains.push(chain)
    }
  }
  for (const [k] of adj) {
    for (const nbr of (adj.get(k) ?? [])) {
      if (visitedEdges.has(eid(k, nbr.key))) continue
      const chain = walkFrom(k, nbr.key)
      if (chain.length >= 2) rawChains.push(chain)
    }
  }

  const segKeyOf = (chain: [number, number][]) => {
    const a = vKey(chain[0]), b = vKey(chain[chain.length - 1])
    return a < b ? `${a}||${b}` : `${b}||${a}`
  }

  return rawChains.map(vertices => ({ vertices, segKey: segKeyOf(vertices) }))
}

// ---------------------------------------------------------------------------
// V2 pipeline: hex corner vertices → catmullRom → (wiggle TBD)
// Produces the same segKeys as buildRiverChains so per-segment props still apply.
// ---------------------------------------------------------------------------
export interface RiverChainV2 {
  segKey: string
  chain: [number, number][]
  baseChain: [number, number][]
  hopKeys: string[]
  hopRanges: [number, number][]  // [startIdx, endIdx] in chain for each hop
}

export function hopKey(v0: [number, number], v1: [number, number]): string {
  const k0 = vKey(v0), k1 = vKey(v1)
  return k0 < k1 ? `${k0}||${k1}` : `${k1}||${k0}`
}

type HopProps = { wiggleAmp?: number; wiggleFreq?: number; width?: number; taper?: number }

type SegWiggleProps = Record<string, { wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number }>

export function buildRiverChainsV2(
  edges: { q1: number; r1: number; q2: number; r2: number }[],
  hexes: GeneratedHex[],
  overrides: Record<string, [number, number][]> = {},
  wiggleFreqFactor = 2.5,
  wiggleAmpFactor = 0.25,
  smoothing = 10,
  hopProps: Record<string, HopProps> = {},
  segProps: SegWiggleProps = {},
  pathSmoothing = 0,
): RiverChainV2[] {
  const hexMap = new Map<string, GeneratedHex>()
  for (const h of hexes) hexMap.set(`${h.q},${h.r}`, h)

  const adj = new Map<string, { key: string; coord: [number, number] }[]>()
  const coordOf = new Map<string, [number, number]>()
  const edgeMid = new Map<string, [number, number]>()

  for (const edge of edges) {
    const h1 = hexMap.get(`${edge.q1},${edge.r1}`), h2 = hexMap.get(`${edge.q2},${edge.r2}`)
    if (!h1 || !h2) continue
    const shared = findSharedVerts(h1, h2)
    if (!shared) continue
    const [v0, v1] = shared
    const k0 = vKey(v0), k1 = vKey(v1)
    coordOf.set(k0, v0); coordOf.set(k1, v1)
    if (!adj.has(k0)) adj.set(k0, [])
    if (!adj.has(k1)) adj.set(k1, [])
    adj.get(k0)!.push({ key: k1, coord: v1 })
    adj.get(k1)!.push({ key: k0, coord: v0 })
    const id = k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`
    edgeMid.set(id, [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2])
  }

  const degree = new Map<string, number>()
  for (const [k, nbrs] of adj) degree.set(k, nbrs.length)

  const eid = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`
  const visitedEdges = new Set<string>()

  const walkFrom = (startKey: string, dirKey: string): [number, number][] => {
    const pts: [number, number][] = [coordOf.get(startKey)!, coordOf.get(dirKey)!]
    visitedEdges.add(eid(startKey, dirKey))
    let cur = dirKey
    for (;;) {
      if ((degree.get(cur) ?? 0) !== 2) break
      const nbrs = adj.get(cur) ?? []
      const next = nbrs.find(n => !visitedEdges.has(eid(cur, n.key)))
      if (!next) break
      visitedEdges.add(eid(cur, next.key))
      pts.push(next.coord)
      cur = next.key
    }
    return pts
  }

  const rawSparse: { pts: [number, number][]; segKey: string }[] = []

  for (const [k] of adj) {
    const deg = degree.get(k) ?? 0
    if (deg === 2) continue
    for (const nbr of (adj.get(k) ?? [])) {
      if (visitedEdges.has(eid(k, nbr.key))) continue
      const pts = walkFrom(k, nbr.key)
      if (pts.length >= 2) {
        const a = vKey(pts[0]), b = vKey(pts[pts.length - 1])
        rawSparse.push({ pts, segKey: a < b ? `${a}||${b}` : `${b}||${a}` })
      }
    }
  }
  for (const [k] of adj) {
    for (const nbr of (adj.get(k) ?? [])) {
      if (visitedEdges.has(eid(k, nbr.key))) continue
      const pts = walkFrom(k, nbr.key)
      if (pts.length >= 2) {
        const a = vKey(pts[0]), b = vKey(pts[pts.length - 1])
        rawSparse.push({ pts, segKey: a < b ? `${a}||${b}` : `${b}||${a}` })
      }
    }
  }

  // Measure inter-vertex spacing in the same coordinate system as the vertices.
  let interDist = 0, distSamples = 0
  outer: for (const { pts } of rawSparse) {
    for (let i = 1; i < pts.length; i++) {
      interDist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (++distSamples >= 12) break outer
    }
  }
  interDist = distSamples > 0 ? interDist / distSamples : 1e-4

  // cos(lat) correction so wiggleChain perpendiculars are truly perpendicular on the projected canvas.
  const avgLat = hexes.length > 0 ? hexes.reduce((s, h) => s + h.center[1], 0) / hexes.length : 0
  const cosLat = Math.cos(avgLat * Math.PI / 180)

  const steps = Math.max(2, Math.round(smoothing))
  const globalAmp = wiggleAmpFactor * interDist
  const globalFreq = wiggleFreqFactor / interDist

  return rawSparse.map(({ pts, segKey }) => {
    const ctrlPts = overrides[segKey] ?? pts
    const relaxed = ctrlPts.slice() as [number, number][]
    const laplacianIters = Math.round(segProps[segKey]?.pathSmoothing ?? pathSmoothing)
    for (let it = 0; it < laplacianIters; it++) {
      for (let i = 1; i < relaxed.length - 1; i++) {
        const avgX = (relaxed[i - 1][0] + relaxed[i + 1][0]) / 2
        const avgY = (relaxed[i - 1][1] + relaxed[i + 1][1]) / 2
        relaxed[i] = [
          relaxed[i][0] + 0.1 * (avgX - relaxed[i][0]),
          relaxed[i][1] + 0.1 * (avgY - relaxed[i][1]),
        ]
      }
    }
    const baseChain = catmullRom(relaxed, steps)

    const hopCount = ctrlPts.length - 1
    const hopKeysList: string[] = []
    const hopRanges: [number, number][] = []
    for (let h = 0; h < hopCount; h++) {
      hopKeysList.push(hopKey(ctrlPts[h], ctrlPts[h + 1]))
      hopRanges.push([h * steps, (h + 1) * steps])
    }

    // Apply wiggle: hop overrides > segment overrides > globals
    const sp = segProps[segKey]
    const hasSegWiggle = sp?.wiggleAmp !== undefined || sp?.wiggleFreq !== undefined
    const hasAnyOverride = hasSegWiggle || hopKeysList.some(k => hopProps[k]?.wiggleAmp !== undefined || hopProps[k]?.wiggleFreq !== undefined)
    let chain: [number, number][]
    if (!hasAnyOverride) {
      chain = wiggleChain(baseChain, globalAmp, globalFreq, cosLat)
    } else {
      const dense = [...baseChain] as [number, number][]
      for (let h = 0; h < hopCount; h++) {
        const [s, e] = hopRanges[h]
        const hp = hopProps[hopKeysList[h]]
        const amp = (hp?.wiggleAmp ?? sp?.wiggleAmp ?? wiggleAmpFactor) * interDist
        const freq = (hp?.wiggleFreq ?? sp?.wiggleFreq ?? wiggleFreqFactor) / interDist
        const slice = baseChain.slice(s, e + 1)
        const wiggled = wiggleChain(slice, amp, freq, cosLat)
        for (let i = 0; i < wiggled.length; i++) dense[s + i] = wiggled[i]
      }
      chain = dense
    }

    return { segKey, chain, baseChain, hopKeys: hopKeysList, hopRanges }
  })
}
