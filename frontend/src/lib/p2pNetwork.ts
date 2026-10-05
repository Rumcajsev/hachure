/** Point-to-point town/road network generation.
 *
 *  Ported from the reference point-to-point prototype: towns are selected from a
 *  real place list by a greedy min-spacing pass, linked by a Gabriel graph, pruned,
 *  reconnected (MST) if the prune leaves it disconnected, and long edges get a
 *  filler/crossroads node inserted along the way. Roads then route around rivers
 *  with A* on a coarse grid and get an organic sideways wobble.
 *
 *  Pure — no React, no store. Operates on a local km-plane; callers project real
 *  lon/lat in and out via the toLocal/toGeo callbacks (same convention as the
 *  backend's lon/lat <-> local-meters transform).
 */

import type { P2pEdge, P2pTown } from '../store/slices/p2pNetworkSlice'

// ── Public types ─────────────────────────────────────────────────────────────

export interface P2pPlaceInput {
  lon: number
  lat: number
  name: string
  population: number
}

export interface P2pRiverInput {
  /** One or more raw polylines for this river, lon/lat. */
  pieces: [number, number][][]
}

export interface P2pNetworkConfig {
  widthKm: number
  heightKm: number
  /** km represented by one cm of paper — converts the cm-based UI sliders to km. */
  kmPerCm: number
  minNodeDistCm: number
  maxNodeDistCm: number
  maxNodes: number
  supplyCount: number
  pruneFactor: number
  /** 0-100, UI slider range (matches the reference prototype). */
  curviness: number
  routeAroundRivers: boolean
  riverCrossPenaltyKm: number
  /** computeTiers: top N places (by population) become "towns" (tier 2). */
  topTownCount: number
  /** computeTiers: of the rest, this % become "villages" (tier 1); remainder are "hamlets" (tier 0). */
  villagePct: number
  seed?: number
}

export interface P2pNetworkResult {
  towns: P2pTown[]
  edges: P2pEdge[]
}

// ── Internal node/edge representation (array-index based, matches the reference) ──

interface Node {
  x: number
  y: number
  name: string
  score: number
  kind: 'place' | 'filler'
  used?: boolean
  supply?: boolean
  tier?: 0 | 1 | 2
}

interface Edge {
  a: number
  b: number
  d: number
  major: boolean
  pts?: Pt[] | null
}

type Pt = { x: number; y: number }

// ── Geometry helpers ─────────────────────────────────────────────────────────

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function polyLen(pts: Pt[]): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

// ── Graph construction: Gabriel graph, pruning, MST repair ──────────────────

const MAJOR_POP = 10000

function pipeline(nodes: Node[], prune: number): Edge[] {
  const N = nodes.length
  const edges: Edge[] = []
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const A = nodes[i], B = nodes[j]
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, r2 = ((A.x - B.x) ** 2 + (A.y - B.y) ** 2) / 4
    let ok = true
    for (let k = 0; k < N; k++) {
      if (k === i || k === j) continue
      const C = nodes[k]
      if ((C.x - mx) ** 2 + (C.y - my) ** 2 < r2) { ok = false; break }
    }
    if (ok) {
      const d = dist(A, B)
      edges.push({ a: i, b: j, d, major: A.score >= MAJOR_POP && B.score >= MAJOR_POP })
    }
  }
  return repair(nodes, pruneEdges(nodes, edges, prune))
}

function pruneEdges(nodes: Node[], edges: Edge[], f: number): Edge[] {
  const keep = new Set<Edge>(edges)
  const nb = nodes.map(() => new Map<number, Edge>())
  for (const e of edges) { nb[e.a].set(e.b, e); nb[e.b].set(e.a, e) }
  const sorted = [...edges].sort((p, q) => q.d - p.d)
  for (const e of sorted) {
    for (const [k, eak] of nb[e.a]) {
      if (k === e.b) continue
      const ekb = nb[e.b].get(k)
      if (!ekb) continue
      if (Math.max(eak.d, ekb.d) < f * e.d) {
        nb[e.a].delete(e.b); nb[e.b].delete(e.a); keep.delete(e)
        break
      }
    }
  }
  return edges.filter(e => keep.has(e))
}

function repair(nodes: Node[], edges: Edge[]): Edge[] {
  const par = nodes.map((_, i) => i)
  const find = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
  for (const e of edges) par[find(e.a)] = find(e.b)
  for (;;) {
    let best: { a: number; b: number; d: number } | null = null
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (find(i) === find(j)) continue
      const d = dist(nodes[i], nodes[j])
      if (!best || d < best.d) best = { a: i, b: j, d }
    }
    if (!best) break
    edges.push({ a: best.a, b: best.b, d: best.d, major: false })
    par[find(best.a)] = find(best.b)
  }
  return edges
}

/** Inserts a filler node (a nearby unused real place, or else a virtual crossroads)
 *  into every edge longer than maxKm. Returns how many were added. */
function addFillers(nodes: Node[], edges: Edge[], minKm: number, maxKm: number, allPlaces: Node[]): number {
  let added = 0
  const farEnough = (p: Pt) => !nodes.some(n => dist(n, p) < minKm)
  for (const e of edges) {
    if (e.d <= maxKm) continue
    const A = nodes[e.a], B = nodes[e.b]
    const inRange = (p: Pt) => {
      const dA = dist(p, A), dB = dist(p, B)
      return dA >= minKm && dA <= maxKm && dB >= minKm && dB <= maxKm
    }
    let best: Node | null = null
    for (const p of allPlaces) {
      if (p.used || !inRange(p) || segDist(p, A, B) > maxKm * 0.4 || !farEnough(p)) continue
      if (!best || p.score > best.score) best = p
    }
    if (best) { best.used = true; nodes.push(best); added++; continue }

    const steps = Math.max(4, Math.ceil(e.d / 0.5))
    const pts: Pt[] = []
    for (let k = 1; k < steps; k++) { const t = k / steps; pts.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }) }
    let bp: Pt | null = null, bs = Infinity
    for (const q of pts) {
      if (!inRange(q) || !farEnough(q)) continue
      const s = Math.abs(dist(q, A) - dist(q, B))
      if (s < bs) { bs = s; bp = q }
    }
    if (bp) { nodes.push({ x: bp.x, y: bp.y, name: 'Crossroads', score: 0, kind: 'filler' }); added++ }
  }
  return added
}

/** Rank-based tiers: the topN biggest real places are "towns", the next villagePct%
 *  of the rest are "villages", the remainder are "hamlets". Fillers and supply
 *  cities are tiered separately (supply always reads as tier 2 downstream). */
function computeTiers(nodes: Node[], topN: number, villagePct: number): void {
  const pct = Math.max(0, Math.min(100, villagePct)) / 100
  const real = nodes.filter(n => n.kind !== 'filler' && !n.supply).sort((a, b) => b.score - a.score)
  const nv = Math.round((real.length - topN) * pct)
  for (const n of nodes) n.tier = 0
  real.forEach((n, i) => { n.tier = i < topN ? 2 : i < topN + nv ? 1 : 0 })
}

// ── River-avoiding routing (A* on a coarse grid) ─────────────────────────────

/** km per routing-grid cell. Exported so p2pTerrainRegions.ts's paint/terrain grid lines up exactly. */
export const P2P_GRID_CELL_KM = 0.5
const CELL = P2P_GRID_CELL_KM

class Heap {
  d: number[] = []
  v: number[] = []
  get size() { return this.d.length }
  push(d: number, v: number) {
    let i = this.d.length
    this.d.push(d); this.v.push(v)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.d[p] <= d) break
      this.d[i] = this.d[p]; this.v[i] = this.v[p]; i = p
    }
    this.d[i] = d; this.v[i] = v
  }
  pop(): [number, number] {
    const rd = this.d[0], rv = this.v[0]
    const ld = this.d.pop()!, lv = this.v.pop()!
    const n = this.d.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && this.d[c + 1] < this.d[c]) c++
        if (this.d[c] >= ld) break
        this.d[i] = this.d[c]; this.v[i] = this.v[c]; i = c
      }
      this.d[i] = ld; this.v[i] = lv
    }
    return [rd, rv]
  }
}

interface RouteGrid {
  W: number; H: number
  river: Uint8Array
  mult: Float32Array
  g: Float64Array
  prev: Int32Array
  stamp: Int32Array
  cur: number
}

function buildGrid(widthKm: number, heightKm: number, pieces: Pt[][]): RouteGrid {
  const W = Math.ceil(widthKm / CELL) + 2, H = Math.ceil(heightKm / CELL) + 2
  const river = new Uint8Array(W * H), mult = new Float32Array(W * H).fill(1)
  const mark = (ix: number, iy: number) => { if (ix >= 0 && iy >= 0 && ix < W && iy < H) river[iy * W + ix] = 1 }
  for (const pc of pieces) {
    for (let i = 1; i < pc.length; i++) {
      const a = pc[i - 1], b = pc[i]
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 3)))
      let px = Math.round(a.x / CELL), py = Math.round(a.y / CELL)
      mark(px, py)
      for (let s = 1; s <= n; s++) {
        const ix = Math.round((a.x + (b.x - a.x) * s / n) / CELL), iy = Math.round((a.y + (b.y - a.y) * s / n) / CELL)
        if (ix !== px && iy !== py) { mark(ix, py); mark(px, iy) }
        mark(ix, iy); px = ix; py = iy
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (river[y * W + x]) continue
    let near = false
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && river[ny * W + nx]) { near = true; break }
    }
    if (near) mult[y * W + x] = 1.6
  }
  return { W, H, river, mult, g: new Float64Array(W * H), prev: new Int32Array(W * H), stamp: new Int32Array(W * H), cur: 0 }
}

function riverAt(grid: RouteGrid, x: number, y: number, a: Pt, b: Pt, fr2: number): boolean {
  const ix = Math.round(x / CELL), iy = Math.round(y / CELL)
  if (ix < 0 || iy < 0 || ix >= grid.W || iy >= grid.H || !grid.river[iy * grid.W + ix]) return false
  return !(((x - a.x) ** 2 + (y - a.y) ** 2 <= fr2) || ((x - b.x) ** 2 + (y - b.y) ** 2 <= fr2))
}

function rasterEntries(grid: RouteGrid, poly: Pt[], a: Pt, b: Pt, freeR: number): number {
  const fr2 = freeR * freeR
  let n = 0, inR = false
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i - 1], q = poly[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (CELL / 3)))
    for (let s = (i === 1 ? 0 : 1); s <= steps; s++) {
      const r = riverAt(grid, p.x + (q.x - p.x) * s / steps, p.y + (q.y - p.y) * s / steps, a, b, fr2)
      if (r && !inR) n++
      inR = r
    }
  }
  return n
}

function routeAstar(grid: RouteGrid, a: Pt, b: Pt, pen: number, freeR: number): Pt[] | null {
  const W = grid.W, H = grid.H, C = CELL, fr2 = freeR * freeR
  const cl = (v: number, m: number) => Math.max(0, Math.min(m - 1, Math.round(v)))
  const sx = cl(a.x / C, W), sy = cl(a.y / C, H), tx = cl(b.x / C, W), ty = cl(b.y / C, H)
  const mg = Math.ceil(20 / C)
  const x0 = Math.max(0, Math.min(sx, tx) - mg), x1 = Math.min(W - 1, Math.max(sx, tx) + mg)
  const y0 = Math.max(0, Math.min(sy, ty) - mg), y1 = Math.min(H - 1, Math.max(sy, ty) + mg)
  const cur = ++grid.cur, heap = new Heap(), s = sy * W + sx, t = ty * W + tx
  grid.stamp[s] = cur; grid.g[s] = 0; grid.prev[s] = -1; heap.push(0, s)
  let found = false
  while (heap.size) {
    const [f, u] = heap.pop()
    if (u === t) { found = true; break }
    const ux = u % W, uy = (u / W) | 0, gu = grid.g[u]
    if (f > gu + Math.hypot(tx - ux, ty - uy) * C + 1e-6) continue
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = ux + dx, ny = uy + dy
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
      const v = ny * W + nx
      let cost = C * (dx && dy ? 1.4142 : 1) * grid.mult[v]
      if (grid.river[v]) {
        const px = nx * C, py = ny * C
        if ((px - a.x) ** 2 + (py - a.y) ** 2 > fr2 && (px - b.x) ** 2 + (py - b.y) ** 2 > fr2) cost += pen
      }
      const ng = gu + cost
      if (grid.stamp[v] !== cur || ng < grid.g[v]) {
        grid.stamp[v] = cur; grid.g[v] = ng; grid.prev[v] = u
        heap.push(ng + Math.hypot(tx - nx, ty - ny) * C, v)
      }
    }
  }
  if (!found) return null
  const pts: Pt[] = []
  for (let u = t; u !== -1; u = grid.prev[u]) pts.push({ x: (u % W) * C, y: ((u / W) | 0) * C })
  pts.reverse()
  if (pts.length < 2) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]
  pts[0] = { x: a.x, y: a.y }; pts[pts.length - 1] = { x: b.x, y: b.y }
  return pts
}

/** Replace the grid staircase with long straight runs, never adding river entries. */
function stringPull(grid: RouteGrid, cells: Pt[], a: Pt, b: Pt, freeR: number): Pt[] {
  const n = cells.length, fr2 = freeR * freeR, pe = new Int32Array(n), rf = new Uint8Array(n)
  let inR = false, cnt = 0
  for (let k = 0; k < n; k++) {
    const r = riverAt(grid, cells[k].x, cells[k].y, a, b, fr2)
    if (r && !inR) cnt++
    inR = r; pe[k] = cnt; rf[k] = r ? 1 : 0
  }
  const out: Pt[] = [cells[0]]
  let i = 0
  while (i < n - 1) {
    let j = n - 1
    for (; j > i + 1; j--) if (rasterEntries(grid, [cells[i], cells[j]], a, b, freeR) <= pe[j] - pe[i] + rf[i]) break
    out.push(cells[j]); i = j
  }
  return out
}

/** Soft bends, never more than R km away from the corner. */
function roundCorners(p: Pt[], R: number): Pt[] {
  if (p.length < 3 || R <= 0) return p
  const out: Pt[] = [p[0]]
  for (let i = 1; i < p.length - 1; i++) {
    const u = p[i - 1], v = p[i], w = p[i + 1]
    const l1 = Math.hypot(u.x - v.x, u.y - v.y), l2 = Math.hypot(w.x - v.x, w.y - v.y), d = Math.min(R, 0.45 * l1, 0.45 * l2)
    if (d < 0.05) { out.push(v); continue }
    const p1 = { x: v.x + (u.x - v.x) * d / l1, y: v.y + (u.y - v.y) * d / l1 }
    const p2 = { x: v.x + (w.x - v.x) * d / l2, y: v.y + (w.y - v.y) * d / l2 }
    for (let s = 0; s <= 4; s++) {
      const t = s / 4, qa = (1 - t) * (1 - t), qb = 2 * t * (1 - t), qc = t * t
      out.push({ x: qa * p1.x + qb * v.x + qc * p2.x, y: qa * p1.y + qb * v.y + qc * p2.y })
    }
  }
  out.push(p[p.length - 1])
  return out
}

function routeOne(grid: RouteGrid, A: Pt, B: Pt, pen: number, freeR: number): Pt[] | null {
  if (rasterEntries(grid, [A, B], A, B, freeR) === 0) return null // straight line already clears every river
  const raw = routeAstar(grid, A, B, pen, freeR)
  if (!raw) return null
  const pulled = stringPull(grid, raw, A, B, freeR)
  const base = rasterEntries(grid, pulled, A, B, freeR)
  for (const R of [2.5, 1.2]) {
    const s = roundCorners(pulled, R)
    if (rasterEntries(grid, s, A, B, freeR) <= base) return s
  }
  return pulled
}

// ── Organic road wobble ──────────────────────────────────────────────────────

function hash32(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const nodeKey = (n: Node) => n.kind === 'filler' ? `c${Math.round(n.x)},${Math.round(n.y)}` : n.name

function resample(poly: Pt[], n: number): Pt[] {
  const cum = [0]
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y))
  const L = cum[cum.length - 1], out: Pt[] = []
  let j = 1
  for (let s = 0; s < n; s++) {
    const d = L * s / (n - 1)
    while (j < poly.length - 1 && cum[j] < d) j++
    const t = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1)
    out.push({ x: poly[j - 1].x + (poly[j].x - poly[j - 1].x) * t, y: poly[j - 1].y + (poly[j].y - poly[j - 1].y) * t })
  }
  return out
}

function wobblePoly(poly: Pt[], coef: [number, number, number], amp: number, widthKm: number, heightKm: number): Pt[] {
  const n = Math.max(14, Math.min(90, Math.ceil(polyLen(poly) / 0.7)))
  const p = resample(poly, n), out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)]
    let dx = b.x - a.x, dy = b.y - a.y
    const l = Math.hypot(dx, dy) || 1
    dx /= l; dy /= l
    const g = coef[0] * Math.sin(Math.PI * t) + coef[1] * Math.sin(2 * Math.PI * t) + coef[2] * Math.sin(3 * Math.PI * t)
    out.push({
      x: Math.max(0, Math.min(widthKm, p[i].x - dy * amp * g)),
      y: Math.max(0, Math.min(heightKm, p[i].y + dx * amp * g)),
    })
  }
  out[0] = { x: poly[0].x, y: poly[0].y }
  out[n - 1] = { x: poly[poly.length - 1].x, y: poly[poly.length - 1].y }
  return out
}

function minDistToNodes(poly: Pt[], nodes: Node[], skipA: Node, skipB: Node): number {
  let m = Infinity
  for (const n of nodes) {
    if (n === skipA || n === skipB) continue
    for (const p of poly) { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < m) m = d }
  }
  return m
}

function shapeRoad(
  e: Edge, A: Node, B: Node, base: Pt[] | null, curv: number, rOn: boolean, freeR: number,
  grid: RouteGrid | null, nodes: Node[], kmPerCm: number, maxKm: number, widthKm: number, heightKm: number, seed: number,
): Pt[] | null {
  const poly = base ?? [A, B]
  if (curv <= 0.001) return base
  const L = polyLen(poly)
  if (L < 2) return base
  const rnd = mulberry32(hash32([nodeKey(A), nodeKey(B)].sort().join('|') + '#' + seed))
  const sgn = () => (rnd() < 0.5 ? -1 : 1)
  let coef: [number, number, number], frac: number
  if (rnd() < 0.25) {
    coef = [sgn() * rnd() * 0.4, sgn() * (0.7 + rnd() * 0.3), sgn() * (0.1 + rnd() * 0.25)]
    frac = 0.05 + rnd() * 0.03
  } else {
    coef = [sgn() * (0.6 + rnd() * 0.4), sgn() * rnd() * 0.4, sgn() * rnd() * 0.1]
    frac = 0.03 + rnd() * 0.03
  }
  const baseEntries = rOn && grid ? rasterEntries(grid, poly, A, B, freeR) : 0
  const clear = 0.7 * kmPerCm, baseMin = minDistToNodes(poly, nodes, A, B), lenCap = Math.max(maxKm, L)
  let scale = curv
  for (let attempt = 0; attempt < 5; attempt++) {
    const cand = wobblePoly(poly, coef, L * frac * scale, widthKm, heightKm)
    const ok = polyLen(cand) <= lenCap
      && (!rOn || !grid || rasterEntries(grid, cand, A, B, freeR) <= baseEntries)
      && minDistToNodes(cand, nodes, A, B) >= Math.min(clear, baseMin) - 0.05
    if (ok) return cand
    scale *= 0.6
  }
  return base
}

function routeEdges(grid: RouteGrid | null, edges: Edge[], nodes: Node[], config: P2pNetworkConfig, maxKm: number): void {
  const rOn = config.routeAroundRivers && !!grid
  const pen = Math.max(0, config.riverCrossPenaltyKm)
  const freeR = Math.max(0.8, 0.4 * config.kmPerCm)
  const curv = config.curviness / 50
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b]
    const base = rOn && grid ? routeOne(grid, A, B, pen, freeR) : null
    e.pts = shapeRoad(e, A, B, base, curv, rOn, freeR, grid, nodes, config.kmPerCm, maxKm, config.widthKm, config.heightKm, config.seed ?? 1)
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

const EDGE_CM = 1.5 // towns are not placed closer than this to the map edge

export function generateP2pNetwork(
  places: P2pPlaceInput[],
  rivers: P2pRiverInput[],
  config: P2pNetworkConfig,
  toLocal: (lon: number, lat: number) => [number, number],
  toGeo: (x: number, y: number) => [number, number],
): P2pNetworkResult {
  const minKm = config.minNodeDistCm * config.kmPerCm
  const maxKm = config.maxNodeDistCm * config.kmPerCm

  const allPlaces: Node[] = places.map(p => {
    const [x, y] = toLocal(p.lon, p.lat)
    return { x, y, name: p.name, score: p.population, kind: 'place', used: false }
  })

  // Node selection: biggest first, enforcing min spacing and a paper-edge inset.
  const sorted = [...allPlaces].sort((a, b) => b.score - a.score)
  const nodes: Node[] = []
  const insetKm = EDGE_CM * config.kmPerCm
  for (const p of sorted) {
    if (nodes.length >= config.maxNodes) break
    if (p.x < insetKm || p.y < insetKm || p.x > config.widthKm - insetKm || p.y > config.heightKm - insetKm) continue
    if (nodes.every(n => dist(n, p) >= minKm)) { p.used = true; nodes.push(p) }
  }

  let edges: Edge[] = []
  for (let it = 0; it < 10; it++) {
    edges = pipeline(nodes, config.pruneFactor)
    if (!addFillers(nodes, edges, minKm, maxKm, allPlaces)) break
    if (it === 9) edges = pipeline(nodes, config.pruneFactor)
  }

  const supply = nodes.filter(n => n.kind === 'place').sort((a, b) => b.score - a.score).slice(0, config.supplyCount)
  for (const n of nodes) n.supply = supply.includes(n)

  computeTiers(nodes, config.topTownCount, config.villagePct)

  let grid: RouteGrid | null = null
  if (config.routeAroundRivers && rivers.length > 0) {
    const pieces = rivers.flatMap(r => r.pieces.map(pc => pc.map(([lon, lat]) => {
      const [x, y] = toLocal(lon, lat)
      return { x, y }
    })))
    grid = buildGrid(config.widthKm, config.heightKm, pieces)
  }
  routeEdges(grid, edges, nodes, config, maxKm)

  const ids = nodes.map((_, i) => `p2p-${i}`)
  const towns: P2pTown[] = nodes.map((n, i) => {
    const [lon, lat] = toGeo(n.x, n.y)
    return {
      id: ids[i], lon, lat,
      name: n.kind === 'filler' ? '' : n.name,
      population: n.score,
      tier: n.tier ?? 0,
      supply: !!n.supply,
      kind: n.kind,
    }
  })

  const edgesOut: P2pEdge[] = edges.map(e => ({
    a: ids[e.a], b: ids[e.b],
    tier: e.major ? 0 : 1,
    points: e.pts && e.pts.length >= 2 ? e.pts.map(p => toGeo(p.x, p.y)) : undefined,
  }))

  return { towns, edges: edgesOut }
}
