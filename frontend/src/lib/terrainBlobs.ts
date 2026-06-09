/** Terrain blob building and field-style rendering utilities.
 *  Depends on geometry, noise, and projection libs — no React, no store state. */

import { chaikin, subdivideClosedPolygon, resampleSmoothQuad, douglasPeuckerClosed } from './geometry'
import { makePermutation, perlinNoise2D, perturbXY, perturbNormal, mulberry32 } from './noise'
import { projectToCanvas } from './projection'
import { hexTerrainLayers } from '../store/mapStore'
import type { GridMetadata, GeneratedHex } from '../store/mapStore'

// ── Coastal hex helpers ──────────────────────────────────────────────────────

/** Terrain to use for blob building and land-side color for a coastal hex.
 *  Ignores sea fraction so the hex participates in the correct terrain blob group. */
function effectiveLandTerrain(hex: GeneratedHex): string {
  if (hex.manual_override) {
    if (hex.terrain && hex.terrain !== 'water') return hex.terrain
    if (hex.terrains) {
      for (const t of ['marsh', 'woods', 'light_woods', 'rough', 'clear'] as const) {
        if (hex.terrains.includes(t)) return t
      }
    }
  }
  const cov = hex.coverage ?? {}
  const candidates = ['marsh', 'woods', 'rough', 'clear']
  let best = 'clear', bestFrac = 0
  for (const t of candidates) {
    const f = cov[t] ?? 0
    if (f > bestFrac) { bestFrac = f; best = t }
  }
  return best
}

/** Terrain layers a coastal hex contributes to the blob system.
 *  Uses hexTerrainLayers as the source of truth in both modes; when realistic
 *  coastline is on, 'sea' is stripped because section 6 handles sea fill. */
export function coastalBlobTerrains(hex: GeneratedHex, realisticCoastline: boolean): string[] {
  if (!hex.coastline_clip || hex.coastline_clip.length === 0) return hexTerrainLayers(hex)
  const land = effectiveLandTerrain(hex)
  const base = realisticCoastline
    ? hexTerrainLayers(hex).filter(t => t !== 'water')
    : hexTerrainLayers(hex)
  if (land === 'clear') return base
  const merged = new Set(base)
  merged.add(land)
  return [...merged]
}

// ── Post-shape corridor clamp ────────────────────────────────────────────────

export type CorridorClamp = { chain: [number, number][]; halfWidth: number }

/** After shapeTerrainBlobs, push any shaped vertex that strayed inside a corridor
 *  back to the corridor boundary — by the minimum amount needed, preserving the
 *  vertex's direction (so organic angular variation is kept, only radial distance clamped). */
export function clampBlobsToCorridors(
  polys: [number, number][][],
  corridors: CorridorClamp[],
): [number, number][][] {
  if (corridors.length === 0) return polys
  return polys.map(poly =>
    poly.map(([x, y]) => {
      let bestDist = Infinity, bestCx = x, bestCy = y, bestHW = 0
      for (const { chain, halfWidth } of corridors) {
        for (let i = 0; i < chain.length - 1; i++) {
          const ax = chain[i][0], ay = chain[i][1]
          const bx = chain[i+1][0], by = chain[i+1][1]
          const dx = bx - ax, dy = by - ay
          const len2 = dx*dx + dy*dy
          const t = len2 < 1e-10 ? 0 : Math.max(0, Math.min(1, ((x-ax)*dx + (y-ay)*dy) / len2))
          const cx = ax + t*dx, cy = ay + t*dy
          const dist = Math.hypot(x - cx, y - cy)
          if (dist < bestDist) { bestDist = dist; bestCx = cx; bestCy = cy; bestHW = halfWidth }
        }
      }
      if (bestDist >= bestHW) return [x, y] as [number, number]
      // Push radially outward to exactly halfWidth — preserves angular variation
      const len = bestDist > 1e-6 ? bestDist : 1
      return [bestCx + (x - bestCx) / len * bestHW, bestCy + (y - bestCy) / len * bestHW] as [number, number]
    })
  )
}

// ── Distance-based blob split ─────────────────────────────────────────────────

/** Minimum distance from point (px,py) to polyline, returning also the closest point. */
function distToChain(
  px: number, py: number,
  chain: [number, number][],
): { dist: number; cx: number; cy: number } {
  let best = Infinity, bx = px, by = py
  for (let i = 0; i < chain.length - 1; i++) {
    const ax = chain[i][0], ay = chain[i][1]
    const bx2 = chain[i+1][0], by2 = chain[i+1][1]
    const dx = bx2 - ax, dy = by2 - ay
    const len2 = dx*dx + dy*dy
    const t = len2 < 1e-10 ? 0 : Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2))
    const cx = ax + t*dx, cy = ay + t*dy
    const d = Math.hypot(px-cx, py-cy)
    if (d < best) { best = d; bx = cx; by = cy }
  }
  return { dist: best, cx: bx, cy: by }
}

export type DistanceCorridor = { chain: [number, number][]; halfWidth: number }

/** Split a raw blob polygon into outside arcs wherever edges cross the corridor distance boundary.
 *  Uses direct distance to the road/river centerline — handles any winding geometry correctly. */
export function splitBlobByCorridors(
  rawPoly: [number, number][],
  corridors: DistanceCorridor[],
): [number, number][][] {
  if (corridors.length === 0 || rawPoly.length < 3) return [rawPoly]

  // Subdivide polygon so no edge is longer than minHalfWidth — ensures even narrow
  // corridors have vertices close enough to be detected by the distance check.
  const minHW = Math.min(...corridors.map(c => c.halfWidth))
  const maxSegLen = Math.max(1, minHW * 0.8)
  const densePoly: [number, number][] = []
  for (let i = 0; i < rawPoly.length; i++) {
    const a = rawPoly[i], b = rawPoly[(i + 1) % rawPoly.length]
    densePoly.push(a)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const segs = Math.ceil(len / maxSegLen)
    for (let s = 1; s < segs; s++) {
      const t = s / segs
      densePoly.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    }
  }

  const n = densePoly.length
  const rawPoly2 = densePoly  // work on the dense version

  // Effective half-width per vertex: minimum distance to any corridor centerline, vs halfWidth
  const minDist = (x: number, y: number): { d: number; hw: number } => {
    let best = Infinity, hw = 0
    for (const { chain, halfWidth } of corridors) {
      const r = distToChain(x, y, chain)
      if (r.dist < best) { best = r.dist; hw = halfWidth }
    }
    return { d: best, hw }
  }

  const vertDists = rawPoly2.map(([x, y]) => minDist(x, y))

  // Find crossing points: edges where inside/outside status changes
  type Split = { edge: number; t: number; pt: [number, number] }
  const splits: Split[] = []

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const { d: di, hw: hwi } = vertDists[i]
    const { d: dj, hw: hwj } = vertDists[j]
    const inside_i = di < hwi, inside_j = dj < hwj
    if (inside_i === inside_j) continue
    const hw = (hwi + hwj) / 2
    const denom = dj - di
    const t = Math.abs(denom) < 1e-10 ? 0.5 : Math.max(0, Math.min(1, (hw - di) / denom))
    const pt: [number, number] = [
      rawPoly2[i][0] + t * (rawPoly2[j][0] - rawPoly2[i][0]),
      rawPoly2[i][1] + t * (rawPoly2[j][1] - rawPoly2[i][1]),
    ]
    splits.push({ edge: i, t, pt })
  }

  if (splits.length < 2) {
    const { d, hw } = vertDists[0]
    return d < hw ? [] : [rawPoly]
  }

  // Build outside arcs between consecutive split points
  const results: [number, number][][] = []
  const nh = splits.length

  for (let k = 0; k < nh; k++) {
    const from = splits[k]
    const to   = splits[(k + 1) % nh]
    const sampleIdx = (from.edge + 1) % n
    const { d, hw } = vertDists[sampleIdx]
    if (d < hw) continue

    const arc: [number, number][] = [from.pt]
    for (let i = (from.edge + 1) % n; i !== (to.edge + 1) % n; i = (i + 1) % n) {
      arc.push(rawPoly2[i])
      if (arc.length > n + 2) break
    }
    arc.push(to.pt)
    if (arc.length >= 3) results.push(arc)
  }

  return results.length > 0 ? results : [rawPoly]
}

// ── Corridor polygon builder ─────────────────────────────────────────────────

/** Build an organic closed polygon buffering a polyline. Used as a hole cutter
 *  in blob raw polygons — the terrain's own bump/sweepFreq drive the edge noise
 *  so the clearing boundary looks like it belongs to the terrain type. */
export function buildCorridorPolygon(
  pts: [number, number][],
  halfWidth: number,
  bumpFraction: number,
  sweepFreq: number,
  R: number,
  seed: number,
): [number, number][] {
  if (pts.length < 2 || halfWidth <= 0) return []
  const perm = makePermutation(seed + 777)
  const noiseFreq = sweepFreq / R
  const noiseAmp = halfWidth * bumpFraction
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    let tx: number, ty: number
    if (i === 0) { tx = pts[1][0] - pts[0][0]; ty = pts[1][1] - pts[0][1] }
    else if (i === pts.length - 1) { tx = pts[i][0] - pts[i-1][0]; ty = pts[i][1] - pts[i-1][1] }
    else { tx = pts[i+1][0] - pts[i-1][0]; ty = pts[i+1][1] - pts[i-1][1] }
    const len = Math.hypot(tx, ty)
    if (len < 1e-6) { left.push(pts[i]); right.push(pts[i]); continue }
    const nx = -ty / len, ny = tx / len
    const [x, y] = pts[i]
    const w = Math.max(0, halfWidth + perlinNoise2D(x * noiseFreq, y * noiseFreq, perm) * noiseAmp)
    left.push([x + nx * w, y + ny * w])
    right.push([x - nx * w, y - ny * w])
  }
  return [...left, ...right.reverse()]
}

// ── Topo-style perimeter resampling ─────────────────────────────────────────

/** Walk a closed polygon by arc length, picking new vertices at ~spacing intervals
 *  with randomised jitter and a small outward normal offset. Produces a blocky
 *  hand-traced polygon like topo-map forest outlines. */
export function resamplePerimeter(
  poly: [number, number][],
  spacing: number,
  seed: number,
): [number, number][] {
  const n = poly.length
  if (n < 3 || spacing <= 0) return poly

  // Build cumulative arc-length table (closed: last segment wraps to [0])
  const arcLen: number[] = [0]
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]
    arcLen.push(arcLen[i] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const totalLen = arcLen[n]
  if (totalLen < spacing) return poly

  const rng = mulberry32(seed)

  // Interpolate position and outward normal at arc-length t
  const sampleAt = (t: number): { pt: [number, number]; nx: number; ny: number } => {
    const tmod = ((t % totalLen) + totalLen) % totalLen
    let lo = 0, hi = n
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; arcLen[mid] <= tmod ? (lo = mid) : (hi = mid) }
    const seg = lo
    const a = poly[seg], b = poly[(seg + 1) % n]
    const segLen = arcLen[seg + 1] - arcLen[seg]
    const f = segLen < 1e-9 ? 0 : (tmod - arcLen[seg]) / segLen
    const px = a[0] + f * (b[0] - a[0])
    const py = a[1] + f * (b[1] - a[1])
    // Outward normal: perpendicular to the segment, pointing outward
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    const nx = len < 1e-9 ? 0 : -dy / len
    const ny = len < 1e-9 ? 0 :  dx / len
    return { pt: [px, py], nx, ny }
  }

  const jitter = 0.4       // ±40% spacing variation
  const offsetAmp = spacing * 0.35   // max outward/inward shift

  const samples: [number, number][] = []
  let t = rng() * spacing  // random phase start
  while (t < totalLen) {
    const { pt, nx, ny } = sampleAt(t)
    const offset = (rng() * 2 - 1) * offsetAmp
    samples.push([pt[0] + nx * offset, pt[1] + ny * offset])
    t += spacing * (1 + (rng() * 2 - 1) * jitter)
  }

  return samples.length >= 3 ? samples : poly
}

// ── Blob shape helpers ───────────────────────────────────────────────────────

export function bleedPolygon(poly: [number, number][], maxBleed: number, R: number, perm: Uint8Array): [number, number][] {
  if (maxBleed <= 0 || poly.length < 3) return poly
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
  let p = subdivideClosedPolygon(poly, R * 0.2)
  p = p.map(pt => {
    const odx = pt[0] - cx, ody = pt[1] - cy
    const olen = Math.hypot(odx, ody)
    if (olen < 1e-6) return pt
    const noise = (perlinNoise2D(pt[0] / (R * 1.5), pt[1] / (R * 1.5), perm) + 1) / 2
    const bleed = noise * noise * maxBleed
    return [pt[0] + (odx / olen) * bleed, pt[1] + (ody / olen) * bleed] as [number, number]
  })
  return chaikin(p, 1, true)
}

// ── V2 blob pipeline ─────────────────────────────────────────────────────────

export type BlobTopologyEntry = {
  terrain: string
  rawPolys: [number, number][][]
  hexCenters: [number, number][]
}

export function preSmoothVar(pts: [number, number][], t: number): [number, number][] {
  if (t <= 0 || pts.length < 3) return pts
  const n = pts.length
  const result: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]
    result.push([x0 * (1 - t) + x1 * t, y0 * (1 - t) + y1 * t])
    result.push([x0 * t + x1 * (1 - t), y0 * t + y1 * (1 - t)])
  }
  return result
}

export function resizeToHexAnchors(
  pts: [number, number][],
  hexCenters: [number, number][],
  s: number,
): [number, number][] {
  if (s === 1 || pts.length < 3 || hexCenters.length === 0) return pts
  return pts.map(pt => {
    let best = hexCenters[0], bestD = Infinity
    for (const c of hexCenters) {
      const d = Math.hypot(pt[0] - c[0], pt[1] - c[1])
      if (d < bestD) { bestD = d; best = c }
    }
    const [cx, cy] = best
    return [cx + (pt[0] - cx) * s, cy + (pt[1] - cy) * s] as [number, number]
  })
}

export function buildTerrainBlobTopology(
  projected: { hex: { terrain: string; partial: boolean }; verts: [number, number][] }[],
  R: number,
): BlobTopologyEntry[] {
  const SNAP = Math.max(2, R * 0.015)
  const vk = (p: [number, number]) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`
  const vpos = new Map<string, [number, number]>()
  const edgeCount = new Map<string, Map<string, number>>()
  const edgeEnds = new Map<string, [string, string]>()
  const hexCentersByTerrain = new Map<string, [number, number][]>()

  for (const { hex, verts } of projected) {
    const t = hex.terrain
    if (t !== 'clear') {
      const cx = (verts[0][0] + verts[1][0] + verts[2][0] + verts[3][0] + verts[4][0] + verts[5][0]) / 6
      const cy = (verts[0][1] + verts[1][1] + verts[2][1] + verts[3][1] + verts[4][1] + verts[5][1]) / 6
      if (!hexCentersByTerrain.has(t)) hexCentersByTerrain.set(t, [])
      hexCentersByTerrain.get(t)!.push([cx, cy])
    }
    let tc: Map<string, number> | null = null
    if (t !== 'clear') {
      if (!edgeCount.has(t)) edgeCount.set(t, new Map())
      tc = edgeCount.get(t)!
    }
    for (let i = 0; i < 6; i++) {
      const a = verts[i], b = verts[(i + 1) % 6]
      const ka = vk(a), kb = vk(b)
      if (!vpos.has(ka)) vpos.set(ka, a)
      if (!vpos.has(kb)) vpos.set(kb, b)
      if (tc !== null) {
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        tc.set(ek, (tc.get(ek) ?? 0) + 1)
        if (!edgeEnds.has(ek)) edgeEnds.set(ek, [ka, kb])
      }
    }
  }

  const result: BlobTopologyEntry[] = []

  for (const [terrain, tc] of edgeCount) {
    const adj = new Map<string, string[]>()
    for (const [ek, count] of tc) {
      if (count !== 1) continue
      const [ka, kb] = edgeEnds.get(ek)!
      if (!adj.has(ka)) adj.set(ka, [])
      if (!adj.has(kb)) adj.set(kb, [])
      adj.get(ka)!.push(kb)
      adj.get(kb)!.push(ka)
    }

    const visitedVerts = new Set<string>()
    const visitedEdges = new Set<string>()
    const rawPolys: [number, number][][] = []

    for (const [startKey] of adj) {
      if (visitedVerts.has(startKey)) continue
      const pts: [number, number][] = []
      let cur = startKey
      for (;;) {
        visitedVerts.add(cur)
        pts.push(vpos.get(cur)!)
        const nbrs = adj.get(cur) ?? []
        let next: string | null = null
        for (const n of nbrs) {
          const ek = cur < n ? `${cur}|${n}` : `${n}|${cur}`
          if (!visitedEdges.has(ek)) { visitedEdges.add(ek); next = n; break }
        }
        if (!next || next === startKey) break
        cur = next
      }
      if (pts.length >= 3) rawPolys.push(pts)
    }

    result.push({ terrain, rawPolys, hexCenters: hexCentersByTerrain.get(terrain) ?? [] })
  }

  return result
}

/** Reshape a raw hex-outline polygon into a handle-friendly polygon.
 *  Either topo-resamples it (blocky, irregular vertices) or Douglas-Peucker simplifies it.
 *  This is the input-shaping step that runs before the organic deformation pipeline. */
export function shapeInputPolygon(
  poly: [number, number][],
  simplify: number,
  topoStyle: number,
  R: number,
  seed: number,
): [number, number][] {
  // Base spacing is R (≈ natural hex corner spacing), topoStyle adds on top so any
  // non-zero value guarantees fewer vertices than the raw hex outline.
  if (topoStyle > 0) return resamplePerimeter(poly, (1 + topoStyle) * R, seed)
  if (simplify > 0) return douglasPeuckerClosed(poly, simplify * R)
  return poly
}

export function shapeTerrainBlobs(
  topology: BlobTopologyEntry[],
  smooth: number,
  offsetFraction: number,
  bumpFraction: number,
  sweepFreq: number,
  lobeFreq: number,
  lobeAmp: number,
  lobeThreshold: number,
  lobeDirection: number,
  R: number,
  blobSeeds: Record<string, number> = {},
): { terrain: string; polys: [number, number][][]; blobKeys: string[] }[] {
  const result: { terrain: string; polys: [number, number][][]; blobKeys: string[] }[] = []

  for (const { terrain, rawPolys, hexCenters } of topology) {
    const resizeS = Math.max(0.1, 1 + offsetFraction)
    const p1Amp = bumpFraction * R
    const p2Amp = bumpFraction * lobeAmp * R * lobeDirection

    const rawSeeds = rawPolys.map(poly => {
      const posHash = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97))
      return { posHash, seed: posHash ^ (blobSeeds[String(posHash)] ?? 0) }
    })

    const finalPolys = rawPolys.map((poly, i) => {
      const { seed } = rawSeeds[i]

      let p: [number, number][] = poly
      const smoothPasses = Math.floor(smooth)
      const smoothRemainder = smooth - smoothPasses
      for (let pass = 0; pass < smoothPasses; pass++) p = preSmoothVar(p, 0.4)
      if (smoothRemainder > 0) p = preSmoothVar(p, 0.4 * smoothRemainder)
      p = resizeToHexAnchors(p, hexCenters, resizeS)

      // R * 0.25 (was 0.15) halves the point count before perturbXY and the
      // 5× resampleSmoothQuad multiplier, cutting perturbNormal cost by ~40%.
      p = subdivideClosedPolygon(p, R * 0.25)
      const permP1x = makePermutation(seed)
      const permP1y = makePermutation(seed + 31)
      p = perturbXY(p, permP1x, permP1y, sweepFreq / R, p1Amp)

      p = resampleSmoothQuad(p, 5)

      const permP2a = makePermutation(seed + 67)
      const permP2b = makePermutation(seed + 113)
      p = perturbNormal(p, permP2a, permP2b, lobeFreq / R, p2Amp, lobeThreshold)

      return p
    })

    const allPolys: [number, number][][] = [...finalPolys]

    const blobKeys = rawSeeds.map(rs => String(rs.posHash))
    result.push({ terrain, polys: allPolys, blobKeys })
  }

  return result
}

export function buildTerrainBlobsV2(
  projected: { hex: { terrain: string; partial: boolean }; verts: [number, number][] }[],
  smooth: number,
  offsetFraction: number,
  bumpFraction: number,
  sweepFreq: number,
  lobeFreq: number,
  lobeAmp: number,
  lobeThreshold: number,
  lobeDirection: number,
  R: number,
  simplify: number = 0,
  topoStyle: number = 0,
): { terrain: string; polys: [number, number][][] }[] {
  const topology = buildTerrainBlobTopology(projected, R)
  const shapedTopology = topology.map(entry => ({
    ...entry,
    rawPolys: entry.rawPolys.map(poly => {
      const seed = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97))
      return shapeInputPolygon(poly, simplify, topoStyle, R, seed)
    }),
  }))
  return shapeTerrainBlobs(
    shapedTopology,
    smooth, offsetFraction, bumpFraction,
    sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection,
    R, {},
  )
}

// ── Connected components ─────────────────────────────────────────────────────

export function computeConnectedComponents(hexes: { q: number; r: number; terrain: string }[]): Map<string, string> {
  const hexByKey = new Map<string, typeof hexes[0]>()
  for (const h of hexes) hexByKey.set(`${h.q},${h.r}`, h)
  const visited = new Set<string>()
  const result = new Map<string, string>()
  const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]
  for (const hex of hexes) {
    const startKey = `${hex.q},${hex.r}`
    if (visited.has(startKey)) continue
    const queue = [hex]
    const component: typeof hexes[0][] = []
    while (queue.length > 0) {
      const h = queue.shift()!
      const k = `${h.q},${h.r}`
      if (visited.has(k)) continue
      visited.add(k)
      component.push(h)
      for (const [dq, dr] of DIRS) {
        const nk = `${h.q + dq},${h.r + dr}`
        const nh = hexByKey.get(nk)
        if (!nh || visited.has(nk)) continue
        if (nh.terrain === hex.terrain) queue.push(nh)
      }
    }
    let minQ = hex.q, minR = hex.r
    for (const h of component) {
      if (h.q < minQ || (h.q === minQ && h.r < minR)) { minQ = h.q; minR = h.r }
    }
    const canonicalKey = `${minQ},${minR}`
    for (const h of component) result.set(`${h.q},${h.r}`, canonicalKey)
  }
  return result
}

// ── Field-style rendering ────────────────────────────────────────────────────
// Detached from active use — kept for future reuse. Nothing below this line is
// referenced by the current render pipeline (blob mode only).
/*
export function parseHexColor(hex: string): [number, number, number] {
  const c = parseInt(hex.replace('#', ''), 16)
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
}

export type FieldTextureData = {
  data: Uint8ClampedArray
  w: number
  h: number
}

export function buildFieldCanvas(
  hexes: { q: number; r: number; center: [number, number]; terrain: string; isLake: boolean }[],
  meta: GridMetadata,
  pw: number, ph: number, px: number, py: number,
  dpr: number,
  freq: number, amp: number, octaves: number, persistence: number,
  fieldWildness: Record<string, number>,
  terrainColors: Record<string, string>,
  fallbackColors: Record<string, string>,
  textures?: Record<string, FieldTextureData>,
): OffscreenCanvas {
  const SCALE = dpr
  const fw = Math.max(1, Math.ceil(pw * SCALE))
  const fh = Math.max(1, Math.ceil(ph * SCALE))

  const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
  const R = meta.outer_radius_m * scalePxPerM * SCALE

  const fieldHexes = hexes.map(hex => {
    const [cx, cy] = projectToCanvas(hex.center[0], hex.center[1], meta, pw, ph, px, py)
    const terrain = hex.isLake ? 'lake' : hex.terrain
    const colorHex = terrainColors[terrain] ?? fallbackColors[terrain] ?? '#888888'
    return {
      fx: (cx - px) * SCALE,
      fy: (cy - py) * SCALE,
      terrain,
      rgb: parseHexColor(colorHex),
    }
  })

  const cellSize = R * 1.8
  const gridCols = Math.ceil(fw / cellSize) + 1
  const gridRows = Math.ceil(fh / cellSize) + 1
  const grid: number[][] = Array.from({ length: gridCols * gridRows }, () => [])
  for (let i = 0; i < fieldHexes.length; i++) {
    const { fx, fy } = fieldHexes[i]
    const col = Math.floor(fx / cellSize)
    const row = Math.floor(fy / cellSize)
    if (col >= 0 && col < gridCols && row >= 0 && row < gridRows)
      grid[row * gridCols + col].push(i)
  }

  const findNearest = (qx: number, qy: number) => {
    const col = Math.max(0, Math.min(gridCols - 1, Math.floor(qx / cellSize)))
    const row = Math.max(0, Math.min(gridRows - 1, Math.floor(qy / cellSize)))
    let best = -1, bestD2 = Infinity
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const c = col + dc, r = row + dr
        if (c < 0 || c >= gridCols || r < 0 || r >= gridRows) continue
        for (const i of grid[r * gridCols + c]) {
          const h = fieldHexes[i]
          const d2 = (qx - h.fx) ** 2 + (qy - h.fy) ** 2
          if (d2 < bestD2) { bestD2 = d2; best = i }
        }
      }
    }
    return best >= 0 ? fieldHexes[best] : null
  }

  const seed = (Math.abs(Math.round(meta.center[0] * 1000)) * 997 + Math.abs(Math.round(meta.center[1] * 1000))) | 0
  const permX = makePermutation(seed)
  const permY = makePermutation(seed + 37)

  const noiseFreq = freq / R
  const noiseAmp = amp * R

  const offscreen = new OffscreenCanvas(fw, fh)
  const octx = offscreen.getContext('2d')!
  const imageData = octx.createImageData(fw, fh)
  const data = imageData.data

  for (let fy_ = 0; fy_ < fh; fy_++) {
    for (let fx_ = 0; fx_ < fw; fx_++) {
      const undisplaced = findNearest(fx_, fy_)
      if (!undisplaced) continue

      const wildness = fieldWildness[undisplaced.terrain] ?? 1.0
      let dx = 0, dy = 0, a = noiseAmp * wildness, f = noiseFreq
      for (let o = 0; o < octaves; o++) {
        dx += perlinNoise2D(fx_ * f, fy_ * f, permX) * a
        dy += perlinNoise2D(fx_ * f, fy_ * f, permY) * a
        a *= persistence; f *= 2
      }

      const displaced = findNearest(fx_ + dx, fy_ + dy) ?? undisplaced
      let [r, g, b] = displaced.rgb

      const tex = textures?.[displaced.terrain]
      if (tex) {
        const tx = fx_ % tex.w
        const ty = fy_ % tex.h
        const ti = (ty * tex.w + tx) * 4
        const ta = tex.data[ti + 3] / 255
        r = Math.round(r + (Math.min(r, tex.data[ti])     - r) * ta)
        g = Math.round(g + (Math.min(g, tex.data[ti + 1]) - g) * ta)
        b = Math.round(b + (Math.min(b, tex.data[ti + 2]) - b) * ta)
      }

      const idx = (fy_ * fw + fx_) * 4
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255
    }
  }

  octx.putImageData(imageData, 0, 0)
  return offscreen
}
*/
