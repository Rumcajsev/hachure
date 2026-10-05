/** Point-to-point terrain region construction.
 *
 *  Ported from the reference point-to-point prototype: roads (and optionally rivers)
 *  plus the paper frame are planarized into a graph, its faces are traced to find
 *  closed regions, oversized regions are split into roughly-equal pieces via
 *  k-means-seeded Voronoi cuts, and each region's terrain type is read off the
 *  paint-layer grid by majority vote over the cells it covers.
 *
 *  Pure — no React, no store. Operates on the same local km-plane as p2pNetwork.ts
 *  (same grid cell size, so the terrain paint layer and the river-routing grid line
 *  up). Callers resolve road/river polylines into this plane before calling in, and
 *  project the resulting region polygons to canvas space when drawing.
 */

import type { P2pTerrainType } from '../store/slices/p2pTerrainSlice'
import { P2P_GRID_CELL_KM } from './p2pNetwork'

type Pt = { x: number; y: number }

const CELL = P2P_GRID_CELL_KM
const FS = 4 // km between helper vertices along the map frame, when not already broken up by a river crossing

export const cellKey = (x: number, y: number): string => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`

export interface P2pTerrainRegion {
  /** Local km-plane polygon, closed implicitly (no repeated last point). */
  poly: [number, number][]
  area: number
  type: P2pTerrainType | 'empty'
  cellKeys: string[]
}

export interface P2pTerrainRegionsConfig {
  widthKm: number
  heightKm: number
  maxRegionAreaKm2: number
  splitRivers: boolean
}

// ── Polygon/segment geometry ─────────────────────────────────────────────────

function polyArea2(p: Pt[]): number {
  let s = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j].x * p[i].y - p[i].x * p[j].y
  return s / 2
}

interface ClippedSeg { a: Pt; b: Pt; sa: number; sb: number }

/** Liang-Barsky clip of segment a-b against rect [0,W]x[0,H]. sa/sb: which frame side
 *  (0 left, 1 right, 2 top, 3 bottom) an endpoint landed on after clipping, or -1 if
 *  the endpoint was already inside. */
function clipSegToRect(a: Pt, b: Pt, W: number, H: number): ClippedSeg | null {
  let t0 = 0, t1 = 1, s0 = -1, s1 = -1
  const dx = b.x - a.x, dy = b.y - a.y
  const p = [-dx, dx, -dy, dy], q = [a.x, W - a.x, a.y, H - a.y]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue }
    const r = q[i] / p[i]
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) { t0 = r; s0 = i } }
    else { if (r < t0) return null; if (r < t1) { t1 = r; s1 = i } }
  }
  const pt = (t: number, s: number): Pt => {
    let x = a.x + t * dx, y = a.y + t * dy
    if (s === 0) x = 0; else if (s === 1) x = W; else if (s === 2) y = 0; else if (s === 3) y = H
    return { x, y }
  }
  return { a: t0 > 0 ? pt(t0, s0) : { x: a.x, y: a.y }, b: t1 < 1 ? pt(t1, s1) : { x: b.x, y: b.y }, sa: t0 > 0 ? s0 : -1, sb: t1 < 1 ? s1 : -1 }
}

interface Seg { ax: number; ay: number; bx: number; by: number }

/** Proper crossing of two segments (both interiors, not endpoints). */
function segCross(s: Seg, t: Seg): { x: number; y: number; t: number; w: number } | null {
  const r = s.bx - s.ax, q = s.by - s.ay, u = t.bx - t.ax, v = t.by - t.ay, den = r * v - q * u
  if (Math.abs(den) < 1e-12) return null
  const ta = ((t.ax - s.ax) * v - (t.ay - s.ay) * u) / den
  const wa = ((t.ax - s.ax) * q - (t.ay - s.ay) * r) / den
  const e = 1e-9
  if (ta <= e || ta >= 1 - e || wa <= e || wa >= 1 - e) return null
  return { x: s.ax + ta * r, y: s.ay + ta * q, t: ta, w: wa }
}

interface PlanarGraph {
  vx: number[]
  vy: number[]
  adj: number[][]
  vmap: Map<string, number>
}

/** Splits every segment at its crossings with every other segment and builds a
 *  vertex/edge adjacency graph. Segment pairs are bucketed into a coarse spatial
 *  grid first so this stays well under O(n^2) for realistic road/river/frame counts. */
function planarize(segs: Seg[]): PlanarGraph {
  const vmap = new Map<string, number>(), vx: number[] = [], vy: number[] = []
  const V = (x: number, y: number): number => {
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`
    let i = vmap.get(k)
    if (i === undefined) { i = vx.length; vmap.set(k, i); vx.push(x); vy.push(y) }
    return i
  }
  const n = segs.length
  const su = new Int32Array(n), sv = new Int32Array(n)
  const spl: ([number, number][] | undefined)[] = new Array(n)
  for (let i = 0; i < n; i++) { su[i] = V(segs[i].ax, segs[i].ay); sv[i] = V(segs[i].bx, segs[i].by) }

  const CS = 4, grid = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const s = segs[i]
    const x0 = Math.floor(Math.min(s.ax, s.bx) / CS), x1 = Math.floor(Math.max(s.ax, s.bx) / CS)
    const y0 = Math.floor(Math.min(s.ay, s.by) / CS), y1 = Math.floor(Math.max(s.ay, s.by) / CS)
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = cx * 100000 + cy
      let l = grid.get(k)
      if (!l) { l = []; grid.set(k, l) }
      l.push(i)
    }
  }
  const seen = new Set<number>()
  for (const l of grid.values()) for (let ii = 0; ii < l.length; ii++) for (let jj = ii + 1; jj < l.length; jj++) {
    const a = l[ii], b = l[jj], pk = a * n + b
    if (seen.has(pk)) continue
    seen.add(pk)
    if (su[a] === su[b] || su[a] === sv[b] || sv[a] === su[b] || sv[a] === sv[b]) continue
    const h = segCross(segs[a], segs[b])
    if (!h) continue
    const iv = V(h.x, h.y)
    ;(spl[a] ??= []).push([h.t, iv])
    ;(spl[b] ??= []).push([h.w, iv])
  }

  const nv = vx.length, adj: number[][] = Array.from({ length: nv }, () => [])
  const eset = new Set<number>()
  const addE = (p: number, q: number) => {
    if (p === q) return
    const k = p < q ? p * 1e6 + q : q * 1e6 + p
    if (eset.has(k)) return
    eset.add(k)
    adj[p].push(q); adj[q].push(p)
  }
  for (let i = 0; i < n; i++) {
    const chain = [su[i]]
    if (spl[i]) { spl[i]!.sort((p, q) => p[0] - q[0]); for (const s of spl[i]!) chain.push(s[1]) }
    chain.push(sv[i])
    for (let k = 1; k < chain.length; k++) addE(chain[k - 1], chain[k])
  }
  return { vx, vy, adj, vmap }
}

/** Roads or rivers that end inside a region (degree-1 dangling chains) don't divide
 *  it — strip them so face tracing doesn't produce spurious slivers. */
function pruneDeadEnds(G: PlanarGraph): void {
  const adj = G.adj, st: number[] = []
  adj.forEach((l, v) => { if (l.length === 1) st.push(v) })
  while (st.length) {
    const v = st.pop()!
    if (adj[v].length !== 1) continue
    const w = adj[v][0]
    adj[v] = []
    adj[w] = adj[w].filter(x => x !== v)
    if (adj[w].length === 1) st.push(w)
  }
}

/** Planar face tracing: at each vertex, sort outgoing edges by angle, then walk
 *  "always take the next edge clockwise from the one you arrived on" until a face
 *  closes. Produces every face including the one unbounded exterior face. */
function traceFaces(G: PlanarGraph): number[][] {
  const { vx, vy, adj } = G, nv = vx.length
  for (let v = 0; v < nv; v++) {
    const ang = new Map<number, number>()
    for (const w of adj[v]) ang.set(w, Math.atan2(vy[w] - vy[v], vx[w] - vx[v]))
    adj[v].sort((p, q) => ang.get(p)! - ang.get(q)!)
  }
  const seen = new Set<number>(), faces: number[][] = []
  for (let u = 0; u < nv; u++) for (const v0 of adj[u]) {
    if (seen.has(u * nv + v0)) continue
    const f: number[] = []
    let a = u, b = v0, guard = 0
    do {
      seen.add(a * nv + b)
      f.push(a)
      const l = adj[b], i = l.indexOf(a), nx = l[(i - 1 + l.length) % l.length]
      a = b; b = nx
    } while (!(a === u && b === v0) && ++guard < 300000)
    faces.push(f)
  }
  return faces
}

/** Grid cells whose centre lies inside the polygon (even-odd scanline fill). */
function rasterCellKeys(poly: Pt[]): string[] {
  const out: string[] = [], xs: number[] = []
  let miny = Infinity, maxy = -Infinity
  for (const p of poly) { if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y }
  const iy0 = Math.max(0, Math.ceil(miny / CELL)), iy1 = Math.floor(maxy / CELL)
  for (let iy = iy0; iy <= iy1; iy++) {
    const y = iy * CELL
    xs.length = 0
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i]
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ix0 = Math.ceil(xs[k] / CELL), ix1 = Math.floor(xs[k + 1] / CELL)
      for (let ix = ix0; ix <= ix1; ix++) out.push(`${ix},${iy}`)
    }
  }
  return out
}

/** k well-spread seeds inside a big region: farthest-point init, then a few Lloyd iterations. */
function kmeansSeeds(pts0: Pt[], k: number): Pt[] {
  const step = Math.max(1, Math.floor(pts0.length / 1500))
  const pts = pts0.filter((_, i) => i % step === 0)
  let cx = 0, cy = 0
  for (const p of pts) { cx += p.x; cy += p.y }
  cx /= pts.length; cy /= pts.length
  let first = pts[0], fd = Infinity
  for (const p of pts) { const d = (p.x - cx) ** 2 + (p.y - cy) ** 2; if (d < fd) { fd = d; first = p } }
  const seeds: Pt[] = [{ x: first.x, y: first.y }]
  const md = new Float64Array(pts.length).fill(Infinity)
  while (seeds.length < k) {
    const s = seeds[seeds.length - 1]
    let bi = 0, bd = -1
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - s.x) ** 2 + (pts[i].y - s.y) ** 2
      if (d < md[i]) md[i] = d
      if (md[i] > bd) { bd = md[i]; bi = i }
    }
    seeds.push({ x: pts[bi].x, y: pts[bi].y })
  }
  for (let it = 0; it < 6; it++) {
    const sx = new Float64Array(k), sy = new Float64Array(k), sn = new Int32Array(k)
    for (const p of pts) {
      let bi = 0, bd = Infinity
      for (let j = 0; j < k; j++) { const d = (p.x - seeds[j].x) ** 2 + (p.y - seeds[j].y) ** 2; if (d < bd) { bd = d; bi = j } }
      sx[bi] += p.x; sy[bi] += p.y; sn[bi]++
    }
    for (let j = 0; j < k; j++) if (sn[j]) seeds[j] = { x: sx[j] / sn[j], y: sy[j] / sn[j] }
  }
  return seeds
}

/** Keep the part of the polygon where nx*x+ny*y <= c. */
function clipHP(poly: Pt[], nx: number, ny: number, c: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const da = nx * a.x + ny * a.y - c, db = nx * b.x + ny * b.y - c
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

function voronoiPieces(poly: Pt[], seeds: Pt[]): Pt[][] {
  const out: Pt[][] = []
  for (let i = 0; i < seeds.length; i++) {
    let p = poly
    const si = seeds[i]
    for (let j = 0; j < seeds.length && p.length >= 3; j++) {
      if (j === i) continue
      const sj = seeds[j]
      p = clipHP(p, sj.x - si.x, sj.y - si.y, ((sj.x * sj.x + sj.y * sj.y) - (si.x * si.x + si.y * si.y)) / 2)
    }
    if (p.length >= 3 && Math.abs(polyArea2(p)) > 1e-6) out.push(p)
  }
  return out
}

/** Grid cell key of a region's polygon centroid — used as the paint-layer key for a
 *  region too small to raster any cell of its own (its `cellKeys` is empty). */
export function regionAnchorKey(poly: [number, number][]): string {
  let cx = 0, cy = 0
  for (const p of poly) { cx += p[0]; cy += p[1] }
  return cellKey(cx / poly.length, cy / poly.length)
}

/** A region's terrain is the majority paint value among its cells (ties favor whatever
 *  was seen first). Exported so callers can re-classify already-traced regions against
 *  a new paint layer without re-running the (expensive) face tracing that built them —
 *  region shape doesn't depend on paint, only this classification does. */
export function regionType(cellKeys: string[], centroidKey: string, paintLayer: Record<string, P2pTerrainType>): P2pTerrainType | 'empty' {
  if (!cellKeys.length) return paintLayer[centroidKey] ?? 'empty'
  const counts: Record<string, number> = {}
  for (const k of cellKeys) {
    const t = paintLayer[k] ?? 'empty'
    counts[t] = (counts[t] ?? 0) + 1
  }
  let best: string = 'empty', bestN = -1
  for (const [t, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = t }
  return best as P2pTerrainType | 'empty'
}

// ── Face tracing (expensive, independent of paint and of max region size) ────

export interface P2pRawFace {
  poly: [number, number][]
  area: number
}

export interface P2pFaceTraceConfig {
  widthKm: number
  heightKm: number
  splitRivers: boolean
}

/** Planarizes roads + rivers + the paper frame and traces the enclosed faces. This is
 *  the costly part (spatially-bucketed segment crossing, face walk) and depends only on
 *  road/river topology and the frame size — never on paint or on the max-region-size
 *  setting. Callers that need to re-split faces live (e.g. while dragging a "max region
 *  size" slider) should call this once and feed the result to splitP2pRegionFaces()
 *  repeatedly, rather than re-tracing on every tick. */
export function traceP2pRegionFaces(
  roads: Pt[][],
  rivers: Pt[][],
  config: P2pFaceTraceConfig,
): P2pRawFace[] {
  const { widthKm: W, heightKm: H } = config
  const segs: Seg[] = []
  for (const poly of roads) for (let i = 1; i < poly.length; i++) {
    segs.push({ ax: poly[i - 1].x, ay: poly[i - 1].y, bx: poly[i].x, by: poly[i].y })
  }

  const framePts: [number[], number[], number[], number[]] = [[], [], [], []] // extra frame vertices per side, from river crossings
  if (config.splitRivers) {
    for (const pc of rivers) for (let i = 1; i < pc.length; i++) {
      const c = clipSegToRect(pc[i - 1], pc[i], W, H)
      if (!c) continue
      segs.push({ ax: c.a.x, ay: c.a.y, bx: c.b.x, by: c.b.y })
      if (c.sa >= 0) framePts[c.sa].push(c.sa < 2 ? c.a.y : c.a.x)
      if (c.sb >= 0) framePts[c.sb].push(c.sb < 2 ? c.b.y : c.b.x)
    }
  }

  const sideCoords = (s: number, len: number): number[] => {
    const cs = [0, len]
    for (let c = FS; c < len; c += FS) cs.push(c)
    for (const c of framePts[s]) cs.push(c)
    cs.sort((p, q) => p - q)
    const u = [cs[0]]
    for (const c of cs) if (c - u[u.length - 1] > 1e-4) u.push(c)
    return u
  }
  for (const [s, len] of [[0, H], [1, H], [2, W], [3, W]] as [number, number][]) {
    const cs = sideCoords(s, len)
    for (let i = 1; i < cs.length; i++) {
      if (s === 0) segs.push({ ax: 0, ay: cs[i - 1], bx: 0, by: cs[i] })
      else if (s === 1) segs.push({ ax: W, ay: cs[i - 1], bx: W, by: cs[i] })
      else if (s === 2) segs.push({ ax: cs[i - 1], ay: 0, bx: cs[i], by: 0 })
      else segs.push({ ax: cs[i - 1], ay: H, bx: cs[i], by: H })
    }
  }

  // Make everything one connected network: a disconnected piece (e.g. a road component
  // that never reaches the frame) gets an invisible bridge to the nearest point of the
  // main network, so face tracing never treats it as an island with an undefined inside.
  const sample = (l: number[], n: number): number[] => {
    const st = Math.max(1, Math.floor(l.length / n))
    return l.filter((_, i) => i % st === 0)
  }
  let G: PlanarGraph
  for (let it = 0; it < 8; it++) {
    G = planarize(segs)
    pruneDeadEnds(G)
    const nv = G.vx.length, compOf = new Int32Array(nv).fill(-1), comps: number[][] = []
    for (let s = 0; s < nv; s++) {
      if (compOf[s] !== -1 || !G.adj[s].length) continue
      const id = comps.length, list = [s], st: number[] = [s]
      compOf[s] = id
      while (st.length) {
        const v = st.pop()!
        for (const w of G.adj[v]) if (compOf[w] === -1) { compOf[w] = id; list.push(w); st.push(w) }
      }
      comps.push(list)
    }
    if (comps.length <= 1) break
    const corner = G.vmap.get('0,0')
    const main = corner === undefined ? -1 : compOf[corner]
    if (main < 0) break
    const mv = sample(comps[main], 500)
    for (let c = 0; c < comps.length; c++) {
      if (c === main) continue
      let best: { d: number; a: number; b: number } | null = null
      for (const a of sample(comps[c], 300)) for (const b of mv) {
        const d = (G.vx[a] - G.vx[b]) ** 2 + (G.vy[a] - G.vy[b]) ** 2
        if (!best || d < best.d) best = { d, a, b }
      }
      if (best) segs.push({ ax: G.vx[best.a], ay: G.vy[best.a], bx: G.vx[best.b], by: G.vy[best.b] })
    }
  }

  const raw = traceFaces(G!).map(f => {
    const poly = f.map(v => ({ x: G.vx[v], y: G.vy[v] }))
    return { poly, a2: polyArea2(poly) }
  })
  const pos = raw.filter(f => f.a2 > 0).length, neg = raw.filter(f => f.a2 < 0).length
  const inner = pos >= neg ? 1 : -1 // the one face of the minority sign is the unbounded exterior face
  const faces = raw.filter(f => Math.sign(f.a2) === inner && Math.abs(f.a2) > 0.02)

  return faces.map(f => ({ poly: f.poly.map(p => [p.x, p.y] as [number, number]), area: Math.abs(f.a2) }))
}

// ── Splitting + classification (cheap — safe to re-run on every tick of a live slider) ──

/** Cuts oversized faces into roughly-equal pieces (recursively, via k-means-seeded
 *  Voronoi cuts) and classifies each by majority paint vote. Depends only on
 *  maxRegionAreaKm2 and paintLayer — never re-traces faces — so it's cheap enough to
 *  call on every tick while a "max region size" slider is being dragged live. */
export function splitP2pRegionFaces(
  faces: P2pRawFace[],
  maxRegionAreaKm2: number,
  paintLayer: Record<string, P2pTerrainType>,
): P2pTerrainRegion[] {
  const maxA = Math.max(1, maxRegionAreaKm2)
  const splitPoly = (poly: Pt[], area: number, depth: number): Pt[][] => {
    const k = Math.ceil(area / maxA)
    if (k < 2 || depth > 2) return [poly]
    const cells = rasterCellKeys(poly)
    if (cells.length < k * 4) return [poly]
    const pts = cells.map(k2 => { const [ix, iy] = k2.split(',').map(Number); return { x: ix * CELL, y: iy * CELL } })
    const pieces = voronoiPieces(poly, kmeansSeeds(pts, k))
    if (pieces.length < 2) return [poly]
    const out: Pt[][] = []
    for (const p of pieces) {
      const a = Math.abs(polyArea2(p))
      if (a > maxA * 1.35) out.push(...splitPoly(p, a, depth + 1))
      else out.push(p)
    }
    return out
  }

  const polys: Pt[][] = []
  for (const f of faces) polys.push(...splitPoly(f.poly.map(([x, y]) => ({ x, y })), f.area, 0))

  return polys.map((poly): P2pTerrainRegion => {
    const cellKeys = rasterCellKeys(poly)
    const polyPts = poly.map(p => [p.x, p.y] as [number, number])
    return {
      poly: polyPts,
      area: Math.abs(polyArea2(poly)),
      type: regionType(cellKeys, regionAnchorKey(polyPts), paintLayer),
      cellKeys,
    }
  })
}

// ── Main entry point ─────────────────────────────────────────────────────────

/** @param roads   Each entry is one road's full polyline in the local km-plane (>=2 points).
 *  @param rivers  Each entry is one river's full polyline in the local km-plane. Only used to
 *                 split regions when config.splitRivers is true. */
export function computeP2pTerrainRegions(
  roads: Pt[][],
  rivers: Pt[][],
  paintLayer: Record<string, P2pTerrainType>,
  config: P2pTerrainRegionsConfig,
): P2pTerrainRegion[] {
  const faces = traceP2pRegionFaces(roads, rivers, config)
  return splitP2pRegionFaces(faces, config.maxRegionAreaKm2, paintLayer)
}
