/** Settlement interior layout: a main street picked from the roads reaching the town,
 *  side roads bent to join it, optional spur/connector lanes, and houses walked out
 *  along every street with density falloff, extra rows, and gap infill.
 *
 *  Ported from a reference point-to-point map prototype (TOWN2.layout). The port is
 *  deliberately mode-agnostic: it only consumes `incoming` road stubs reaching the
 *  town center from outward, tagged with kind + half-width. That contract is cheap to
 *  satisfy from either a point-to-point road graph (roads already end exactly at the
 *  town) or OSM road chains clipped near a hex's settlement (roads merely pass close
 *  by) — one engine, two adapters, no mode-specific branching inside this file.
 *
 *  Units are whatever linear unit the caller's `incoming[].pts` are expressed in
 *  (board cm in the reference; could equally be km or px) — the engine only cares
 *  about ratios between its own constants (STEP, TN_GAP, tier radii), so any
 *  consistent unit works as long as the tier config is scaled to match.
 *
 *  Pure — no canvas, no React, no store imports. See drawTownLayout.ts for rendering. */

import { hashStr, mulberry32, seededRandom } from './noise'
import { distToSeg } from './geometry'

// ── Public types ─────────────────────────────────────────────────────────────

export type RoadKind = 'major' | 'minor' | 'track' | 'lane'

export interface IncomingRoad {
  /** Points from the town center (index 0, at local (0,0)) walking outward.
   *  Only the near few units matter — the engine never looks past tier.radius * ~2. */
  pts: [number, number][]
  kind: RoadKind
  /** Half-width of the road casing, in the same local unit as `pts`. */
  halfWidth: number
}

export interface PlacedHouse {
  x: number
  y: number
  /** Rotation in radians. */
  angle: number
  length: number
  width: number
  /** Deterministic 0..2 variant index — caller maps this to a fill color. */
  variant: number
}

export interface TownLayoutLane {
  /** Polyline of an internally-generated spur/connector lane (not one of the
   *  caller's `incoming` roads) — draw it the same as a minor road. */
  pts: [number, number][]
}

export interface TownLayoutTail {
  /** Index into the `incoming` array this tail replaces the near end of. */
  incomingIndex: number
  /** Arc-length distance from the town center, measured along the ORIGINAL
   *  incoming[i].pts, at which the real road should be cut. */
  cutDistance: number
  /** Replacement near-end points, ordered from the cut point back to the join
   *  on the main street — splice these in place of incoming[i].pts.slice(0, cut)
   *  so the rendered road bends smoothly into the town instead of running
   *  straight into the exact center point. */
  pts: [number, number][]
}

export interface TownLayoutResult {
  houses: PlacedHouse[]
  lanes: TownLayoutLane[]
  tails: TownLayoutTail[]
  /** Label placement candidate, relative to the town center, biased away from
   *  houses and streets. `width` is a rough text-width estimate (caller may
   *  recompute from real font metrics and re-center if it cares). */
  label: { x: number; y: number; width: number }
  /** Radius beyond which nothing was placed — useful as a "keep clear" radius
   *  for whatever sits outside the town (terrain blobs, other settlements). */
  extent: number
}

export interface TownTierConfig {
  /** Base built-up radius before `spread` scaling. */
  radius: number
  /** House placement probability per walker step, before falloff. */
  density: number
  /** Max number of dead-end spur lanes. */
  laneCount: number
  /** Max number of connector streets linking the main street to side roads. */
  connectorCount: number
  /** Probability of a second row of houses behind the first. */
  row2: number
  /** Probability of a third row of houses behind the second. */
  row3: number
  /** Infill density for houses scattered in gaps between streets (0 disables). */
  infill: number
  /** Max clearance-to-nearest-road an infill house may sit at. */
  reach: number
  /** How irregular the town's infill boundary is (0 = circular). */
  wobble: number
}

export interface TownLayoutInput {
  /** Used to seed this town's randomness — same name always lays out the same way. */
  name: string
  tier: 0 | 1 | 2
  incoming: IncomingRoad[]
  /** Multiplies house footprint dimensions. */
  houseSize: number
  /** Multiplies the tier's built-up radius — how far the town's roads/houses spread. */
  spread: number
  /** Overrides DEFAULT_TOWN_TIER_CONFIG[tier] if given. */
  config?: TownTierConfig
}

export const DEFAULT_TOWN_TIER_CONFIG: Record<0 | 1 | 2, TownTierConfig> = {
  0: { radius: 1.0, density: 0.50, laneCount: 0, connectorCount: 0, row2: 0,   row3: 0, infill: 0,    reach: 0.70, wobble: 0.2 },
  1: { radius: 1.5, density: 0.75, laneCount: 0, connectorCount: 0, row2: 0.2, row3: 0, infill: 0,    reach: 0.75, wobble: 0.2 },
  2: { radius: 2.0, density: 0.75, laneCount: 2, connectorCount: 0, row2: 0.5, row3: 0, infill: 0.45, reach: 0.20, wobble: 0.4 },
}

const STEP = 0.03
const TN_GAP = 0.05
const TN_CLUSTER = 0.7
const LANE_HALF_WIDTH = 0.055

// ── Internal geometry ────────────────────────────────────────────────────────

type Pt = { x: number; y: number }
type Path = { p: Pt[]; L: number }
type Sample = { x: number; y: number; tx: number; ty: number; nx: number; ny: number }
type RoadPiece = { path: Path; half: number; kind: RoadKind | 'lane'; start: Pt | null; s0: number }
type HouseWIP = { x: number; y: number; angle: number; length: number; width: number; nx: number; ny: number; row: number; variant: number }
type Seg = { x1: number; y1: number; x2: number; y2: number; h: number }
type SpatialIndex = { m: Map<number, Seg[]>; cs: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const hsh = (i: number, s: number) => seededRandom(i, s, 0)
const vn = (u: number, s: number): number => {
  const i = Math.floor(u), f = u - i, t = f * f * (3 - 2 * f)
  return lerp(hsh(i, s), hsh(i + 1, s), t)
}

function resampleByArcLengthStep(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]]
  let carry = 0
  let prev = pts[0]
  for (let i = 1; i < pts.length; i++) {
    let a = prev
    const b = pts[i]
    let segLen = Math.hypot(b.x - a.x, b.y - a.y)
    while (segLen > 0 && carry + segLen >= step) {
      const t = (step - carry) / segLen
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      out.push(q)
      a = q
      segLen = Math.hypot(b.x - a.x, b.y - a.y)
      carry = 0
    }
    carry += segLen
    prev = b
  }
  return out
}

function mkPath(pts: Pt[]): Path {
  return { p: pts, L: (pts.length - 1) * STEP }
}

/** Dense Catmull-Rom through control points, then resampled to even STEP spacing. */
function smoothToPath(ctrl: Pt[]): Path {
  const n = ctrl.length
  const dense: Pt[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)]
    const m = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 0.05))
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  dense.push(ctrl[n - 1])
  return mkPath(resampleByArcLengthStep(dense, STEP))
}

function at(path: Path, s: number): Sample {
  const p = path.p, n = p.length
  const i = Math.max(0, Math.min(n - 2, Math.floor(s / STEP)))
  const f = Math.max(0, Math.min(1, s / STEP - i))
  const x = lerp(p[i].x, p[i + 1].x, f), y = lerp(p[i].y, p[i + 1].y, f)
  const a = p[Math.max(0, i - 3)], b = p[Math.min(n - 1, i + 4)]
  let tx = b.x - a.x, ty = b.y - a.y
  const len = Math.hypot(tx, ty) || 1
  tx /= len; ty /= len
  return { x, y, tx, ty, nx: -ty, ny: tx }
}

function segsOf(roads: RoadPiece[]): Seg[] {
  const out: Seg[] = []
  for (const r of roads) {
    const p = r.path.p
    for (let i = 0; i < p.length - 1; i += 2) {
      const j = Math.min(p.length - 1, i + 2)
      out.push({ x1: p[i].x, y1: p[i].y, x2: p[j].x, y2: p[j].y, h: r.half })
    }
  }
  return out
}

function mkIndex(segs: Seg[]): SpatialIndex {
  const m = new Map<number, Seg[]>()
  const cs = 0.25
  for (const s of segs) {
    const x0 = Math.floor(Math.min(s.x1, s.x2) / cs), x1 = Math.floor(Math.max(s.x1, s.x2) / cs)
    const y0 = Math.floor(Math.min(s.y1, s.y2) / cs), y1 = Math.floor(Math.max(s.y1, s.y2) / cs)
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const k = i * 1000 + j
      let a = m.get(k); if (!a) { a = []; m.set(k, a) }
      a.push(s)
    }
  }
  return { m, cs }
}

function nearest(x: number, y: number, idx: SpatialIndex, rad = 2): { clearance: number; seg: Seg | null } {
  const cx = Math.floor(x / idx.cs), cy = Math.floor(y / idx.cs)
  let best = 1e9, bestSeg: Seg | null = null
  for (let i = cx - rad; i <= cx + rad; i++) for (let j = cy - rad; j <= cy + rad; j++) {
    const a = idx.m.get(i * 1000 + j)
    if (!a) continue
    for (const s of a) {
      const d = distToSeg([x, y], [s.x1, s.y1], [s.x2, s.y2]) - s.h
      if (d < best) { best = d; bestSeg = s }
    }
  }
  return { clearance: bestSeg ? best : 1, seg: bestSeg }
}

const clearance = (x: number, y: number, idx: SpatialIndex) => nearest(x, y, idx).clearance

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

// ── House placement ──────────────────────────────────────────────────────────

function corners(h: HouseWIP): [number, number][] {
  const c = Math.cos(h.angle), s = Math.sin(h.angle), hl = h.length / 2, hw = h.width / 2
  const out: [number, number][] = []
  for (const [u, v] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [0, -hw], [0, hw], [-hl, 0], [hl, 0], [0, 0]] as [number, number][]) {
    out.push([h.x + u * c - v * s, h.y + u * s + v * c])
  }
  return out
}

function obbOverlap(a: HouseWIP, b: HouseWIP, pad: number): boolean {
  if (Math.hypot(a.x - b.x, a.y - b.y) > (a.length + b.length) / 2 + pad + 0.1) return false
  const axes = [
    [Math.cos(a.angle), Math.sin(a.angle)], [-Math.sin(a.angle), Math.cos(a.angle)],
    [Math.cos(b.angle), Math.sin(b.angle)], [-Math.sin(b.angle), Math.cos(b.angle)],
  ]
  const rad = (h: HouseWIP, ux: number, uy: number) =>
    h.length / 2 * Math.abs(ux * Math.cos(h.angle) + uy * Math.sin(h.angle)) +
    h.width / 2 * Math.abs(-ux * Math.sin(h.angle) + uy * Math.cos(h.angle))
  for (const [ux, uy] of axes) {
    const d = Math.abs((b.x - a.x) * ux + (b.y - a.y) * uy)
    if (d > rad(a, ux, uy) + rad(b, ux, uy) + pad) return false
  }
  return true
}

type HouseCtx = { houses: HouseWIP[]; idx: SpatialIndex }

function tryPlace(h: HouseWIP, ctx: HouseCtx): boolean {
  for (const [x, y] of corners(h)) if (clearance(x, y, ctx.idx) < 0.014) return false
  for (const o of ctx.houses) if (obbOverlap(h, o, 0.016)) return false
  ctx.houses.push(h)
  return true
}

type GCfg = { size: number; gap: number; cluster: number }

function walker(road: RoadPiece, s0: number, dir: 1 | -1, side: 1 | -1, dens: number, key: number, T: TownTierConfig, ctx: HouseCtx, rng: () => number, G: GCfg) {
  const path = road.path
  let s = s0
  let guard = 0
  while (s >= 0 && s <= path.L && guard++ < 600) {
    const q = at(path, s)
    const x = Math.hypot(q.x, q.y) / T.radius
    if (x > 1) break
    const f = Math.pow(Math.max(0, 1 - x * x), 0.7)
    const cl = lerp(1, 0.2 + 1.5 * vn(s / 0.9, key), G.cluster)
    if (rng() < dens * f * cl) {
      const l = lerp(0.18, 0.34, rng()) * G.size
      const w = lerp(0.10, 0.16, rng()) * G.size
      const m = at(path, s + dir * l / 2)
      const off = road.half + G.gap * lerp(0.5, 1.5, rng()) + w / 2
      const h: HouseWIP = {
        x: m.x + m.nx * side * off, y: m.y + m.ny * side * off,
        angle: Math.atan2(m.ty, m.tx) + (rng() - 0.5) * 0.14,
        length: l, width: w,
        nx: m.nx * side, ny: m.ny * side,
        row: 1, variant: Math.floor(rng() * 3),
      }
      if (tryPlace(h, ctx)) s += dir * (l + lerp(0.02, 0.08, rng()))
      else s += dir * 0.08
    } else {
      s += dir * lerp(0.06, 0.2, rng())
    }
  }
}

function addRow(rowNo: number, prob: number, ctx: HouseCtx, rng: () => number, G: GCfg) {
  for (const h of ctx.houses.slice()) {
    if (h.row !== rowNo || rng() > prob) continue
    const l = lerp(0.17, 0.30, rng()) * G.size, w = lerp(0.09, 0.14, rng()) * G.size
    const d = h.width / 2 + 0.05 + w / 2 + rng() * 0.03
    tryPlace({
      x: h.x + h.nx * d, y: h.y + h.ny * d,
      angle: h.angle + (rng() - 0.5) * 0.1,
      length: l, width: w, nx: h.nx, ny: h.ny,
      row: rowNo + 1, variant: Math.floor(rng() * 3),
    }, ctx)
  }
}

function infill(T: TownTierConfig, ctx: HouseCtx, rng: () => number, G: GCfg) {
  const step = 0.14
  const ph1 = rng() * 6.28, ph2 = rng() * 6.28, ph3 = rng() * 6.28
  for (let pass = 0; pass < 2; pass++) {
    const pts: Pt[] = []
    for (let x = -T.radius * 1.5; x <= T.radius * 1.5; x += step) {
      for (let y = -T.radius * 1.5; y <= T.radius * 1.5; y += step) {
        pts.push({ x: x + (rng() - 0.5) * step, y: y + (rng() - 0.5) * step })
      }
    }
    shuffle(pts, rng)
    for (const p of pts) {
      const ang = Math.atan2(p.y, p.x)
      const Ra = T.radius * (1 + T.wobble * (Math.sin(2 * ang + ph1) + 0.8 * Math.sin(3 * ang + ph2) + 0.6 * Math.sin(5 * ang + ph3)) / 1.6)
      const d = Math.hypot(p.x, p.y) / Ra
      if (d > 1 || rng() > T.infill * Math.pow(1 - d * d, 0.6)) continue
      const nr = nearest(p.x, p.y, ctx.idx, 7)
      if (!nr.seg || nr.clearance > T.reach) continue
      const sg = nr.seg
      const l = lerp(0.16, 0.28, rng()) * G.size, w = lerp(0.09, 0.14, rng()) * G.size
      const a = Math.atan2(sg.y2 - sg.y1, sg.x2 - sg.x1) + (rng() < 0.15 ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.2
      tryPlace({ x: p.x, y: p.y, angle: a, length: l, width: w, nx: 0, ny: 0, row: 9, variant: Math.floor(rng() * 3) }, ctx)
    }
  }
}

// ── Roads: main street selection, side-road bending, spurs, connectors ──────

function buildRoads(inc: IncomingRoad[], rng: () => number): { roads: RoadPiece[]; tails: (({ cut: number; pts: Pt[] }) | undefined)[] } {
  const nearIdx = Math.max(1, Math.round(1 / STEP))
  const R = inc.map((r, idx) => {
    const pts = resampleByArcLengthStep(r.pts.map(([x, y]) => ({ x, y })), STEP)
    const j = Math.min(pts.length - 1, nearIdx)
    return { idx, pts, half: r.halfWidth, kind: r.kind, ang: Math.atan2(pts[j].y, pts[j].x) }
  })

  let main: RoadPiece
  let sides: typeof R = []

  if (R.length === 0) {
    const a = rng() * Math.PI, dx = Math.cos(a), dy = Math.sin(a)
    main = { path: smoothToPath([{ x: -dx * 3, y: -dy * 3 }, { x: 0, y: 0 }, { x: dx * 3, y: dy * 3 }]), half: LANE_HALF_WIDTH, kind: 'lane', start: null, s0: 3 }
  } else if (R.length === 1) {
    main = { path: mkPath(R[0].pts), half: R[0].half, kind: R[0].kind, start: null, s0: 0 }
  } else {
    let best = -1, ba = 0, bb = 1
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      let d = Math.abs(R[i].ang - R[j].ang)
      d = Math.min(d, Math.PI * 2 - d)
      const sc = d + (R[i].kind === 'major' ? 0.35 : 0) + (R[j].kind === 'major' ? 0.35 : 0)
      if (sc > best) { best = sc; ba = i; bb = j }
    }
    const A = R[ba], B = R[bb]
    main = {
      path: mkPath([...A.pts.slice().reverse(), ...B.pts.slice(1)]),
      half: Math.max(A.half, B.half),
      kind: (A.kind === 'major' || B.kind === 'major') ? 'major' : 'minor',
      start: null,
      s0: (A.pts.length - 1) * STEP,
    }
    sides = R.filter((_, k) => k !== ba && k !== bb).sort((p, q) => p.ang - q.ang)
  }

  const roads: RoadPiece[] = [main]
  const tails: (({ cut: number; pts: Pt[] }) | undefined)[] = []
  const cnt: Record<number, Record<number, number>> = { [-1]: { [-1]: 0, [1]: 0 }, [1]: { [-1]: 0, [1]: 0 } }
  const mt = at(main.path, main.s0)

  for (const r of sides) {
    const dx = Math.cos(r.ang), dy = Math.sin(r.ang)
    const side = Math.sign(mt.tx * dy - mt.ty * dx) || 1
    const dot = mt.tx * dx + mt.ty * dy
    const dir = Math.abs(dot) < 0.3 ? (cnt[side][1] <= cnt[side][-1] ? 1 : -1) : Math.sign(dot)
    const off = dir * (0.45 + 0.55 * cnt[side][dir]++) * (R.length >= 2 && main.kind === 'major' ? 1 : 0.8)
    const P = at(main.path, Math.max(0.2, Math.min(main.path.L - 0.2, main.s0 + off)))
    const iR = Math.min(r.pts.length - 1, Math.round(Math.max(1.4, Math.abs(off) + 1) / STEP))
    const iQ = Math.round(iR * 0.55)
    if (iR < 8) continue
    const Q = r.pts[iQ], R1 = r.pts[iR]
    const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2
    const len = Math.hypot(Q.x - P.x, Q.y - P.y) || 1
    const b = (rng() - 0.5) * 0.12
    const curve = smoothToPath([{ x: P.x, y: P.y }, { x: mx - (Q.y - P.y) / len * b, y: my + (Q.x - P.x) / len * b }, Q, R1]).p
    roads.push({ path: mkPath([...curve, ...r.pts.slice(iR + 1)]), half: r.half, kind: r.kind, start: { x: P.x, y: P.y }, s0: 0 })
    tails[r.idx] = { cut: iR * STEP, pts: curve.slice().reverse() }
  }

  return { roads, tails }
}

function addSpurs(roads: RoadPiece[], T: TownTierConfig, rng: () => number) {
  const k = Math.round(T.laneCount * (0.55 + 0.9 * rng()))
  const base = roads.slice()
  let made = 0
  for (let att = 0; att < 200 && made < k; att++) {
    const par = base[Math.floor(rng() * base.length)]
    const s = 0.3 + rng() * Math.max(0.1, par.path.L - 0.6)
    const P = at(par.path, s)
    if (Math.hypot(P.x, P.y) > T.radius * 0.85) continue
    if (roads.some(r => r.start && Math.hypot(r.start.x - P.x, r.start.y - P.y) < 0.55)) continue
    const sd = rng() < 0.5 ? -1 : 1, ang = (rng() - 0.5) * 0.7, ca = Math.cos(ang), sa = Math.sin(ang)
    let dx = P.nx * sd, dy = P.ny * sd
    ;[dx, dy] = [dx * ca - dy * sa, dx * sa + dy * ca]
    const px = -dy, py = dx, len = 0.8 + rng() * 0.9
    const c = [
      { x: P.x, y: P.y },
      { x: P.x + dx * len * 0.33 + px * (rng() - 0.5) * 0.25, y: P.y + dy * len * 0.33 + py * (rng() - 0.5) * 0.25 },
      { x: P.x + dx * len * 0.66 + px * (rng() - 0.5) * 0.3, y: P.y + dy * len * 0.66 + py * (rng() - 0.5) * 0.3 },
      { x: P.x + dx * len, y: P.y + dy * len },
    ]
    const lane: RoadPiece = { path: smoothToPath(c), kind: 'lane', half: LANE_HALF_WIDTH, start: { x: P.x, y: P.y }, s0: 0 }
    const idx = mkIndex(segsOf(roads))
    let ok = true
    for (let i = Math.ceil(0.45 / STEP); i < lane.path.p.length && ok; i++) {
      const q = lane.path.p[i]
      if (clearance(q.x, q.y, idx) < 0.26) ok = false
    }
    if (ok) { roads.push(lane); made++ }
  }
}

function addConnectors(roads: RoadPiece[], T: TownTierConfig, rng: () => number) {
  const k = T.connectorCount
  const main = roads[0]
  const sides = roads.filter(r => r !== main && r.kind !== 'lane')
  if (!sides.length || !k) return
  let made = 0
  for (let att = 0; att < 300 && made < k; att++) {
    const sd = sides[Math.floor(rng() * sides.length)]
    const P1 = at(main.path, main.s0 + (rng() - 0.5) * 2 * T.radius * 0.8)
    const s2 = 0.4 + rng() * 1.5
    if (s2 > sd.path.L - 0.1) continue
    const P2 = at(sd.path, s2)
    const len = Math.hypot(P2.x - P1.x, P2.y - P1.y)
    if (len < 0.55 || len > 1.9) continue
    if (roads.some(r => r.start && Math.hypot(r.start.x - P1.x, r.start.y - P1.y) < 0.4)) continue
    const mx = (P1.x + P2.x) / 2, my = (P1.y + P2.y) / 2
    const px = -(P2.y - P1.y) / len, py = (P2.x - P1.x) / len, b = (rng() - 0.5) * 0.3
    const lane: RoadPiece = {
      path: smoothToPath([{ x: P1.x, y: P1.y }, { x: mx + px * b, y: my + py * b }, { x: P2.x, y: P2.y }]),
      kind: 'lane', half: LANE_HALF_WIDTH, start: { x: P1.x, y: P1.y }, s0: 0,
    }
    const idx = mkIndex(segsOf(roads))
    let ok = true
    const pad = Math.ceil(0.22 / STEP)
    for (let i = pad; i < lane.path.p.length - pad && ok; i++) {
      const q = lane.path.p[i]
      if (clearance(q.x, q.y, idx) < 0.12) ok = false
    }
    if (ok) { roads.push(lane); made++ }
  }
}

function buildHouses(roads: RoadPiece[], T: TownTierConfig, rng: () => number, G: GCfg): HouseWIP[] {
  const ctx: HouseCtx = { houses: [], idx: mkIndex(segsOf(roads)) }
  const main = roads[0]
  const k0 = rng() * 50
  for (const dir of (main.s0 > 0.05 ? [1, -1] : [1]) as (1 | -1)[]) {
    for (const side of [-1, 1] as (1 | -1)[]) walker(main, main.s0, dir, side, T.density, k0 + dir * 3 + side, T, ctx, rng, G)
  }
  roads.slice(1).forEach((r, i) => {
    const lane = r.kind === 'lane'
    const dens = T.density * (lane ? 0.85 : 1)
    for (const side of [-1, 1] as (1 | -1)[]) walker(r, lane ? 0.12 : 0.1, 1, side, dens, i * 7.3 + side + k0, T, ctx, rng, G)
  })
  if (T.row2 > 0) addRow(1, T.row2, ctx, rng, G)
  if (T.row3 > 0) addRow(2, T.row3, ctx, rng, G)
  if (T.infill > 0) infill(T, ctx, rng, G)
  return ctx.houses
}

function placeLabel(text: string, houses: HouseWIP[], roads: RoadPiece[], ext: number): { x: number; y: number; width: number } {
  const w = text.length * 0.29, h = 0.5
  let best: { sc: number; x: number; y: number; w: number } | null = null
  const segs = segsOf(roads)
  for (const r of [ext * 0.6, ext * 0.85, ext * 1.1 + 0.1, ext * 1.4 + 0.2]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const cx = Math.cos(a) * (r + w * 0.3 * Math.abs(Math.cos(a))), cy = Math.sin(a) * (r + h * 0.5)
      const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2 - 0.1, y1 = cy + h / 2 + 0.1
      let sc = 0
      for (const o of houses) if (o.x > x0 - 0.12 && o.x < x1 + 0.12 && o.y > y0 - 0.06 && o.y < y1 + 0.06) sc += 3
      for (const s of segs) {
        const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2
        if (mx > x0 && mx < x1 && my > y0 && my < y1) sc += 1
      }
      sc += r * 0.35 + Math.abs(Math.sin(a)) * 0.2
      if (!best || sc < best.sc) best = { sc, x: x0, y: cy + h * 0.32, w }
    }
  }
  return best ? { x: best.x, y: best.y, width: best.w } : { x: ext, y: 0, width: w }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function layoutTown(input: TownLayoutInput): TownLayoutResult {
  const base = input.config ?? DEFAULT_TOWN_TIER_CONFIG[input.tier]
  const T: TownTierConfig = { ...base, radius: base.radius * input.spread }
  const G: GCfg = { size: input.houseSize, gap: TN_GAP, cluster: TN_CLUSTER }

  const seedBase = hashStr(input.name + '#townlayout')
  const rngRoads = mulberry32(seedBase)
  const rngExtra = mulberry32(seedBase ^ 0x9e3779b9)
  const rngHouses = mulberry32(seedBase ^ 0x85ebca6b)

  const { roads, tails } = buildRoads(input.incoming, rngRoads)
  if (T.laneCount > 0) addSpurs(roads, T, rngExtra)
  if (T.connectorCount > 0) addConnectors(roads, T, rngExtra)
  const houses = buildHouses(roads, T, rngHouses, G)

  let extent = T.radius * 0.6
  for (const h of houses) extent = Math.max(extent, Math.hypot(h.x, h.y) + 0.2)

  const lanes: TownLayoutLane[] = roads
    .filter(r => r.kind === 'lane')
    .map(r => ({ pts: r.path.p.filter((_, i, a) => i % 3 === 0 || i === a.length - 1).map(p => [p.x, p.y] as [number, number]) }))

  const tailsList: TownLayoutTail[] = []
  tails.forEach((t, i) => { if (t) tailsList.push({ incomingIndex: i, cutDistance: t.cut, pts: t.pts.map(p => [p.x, p.y] as [number, number]) }) })

  return {
    houses: houses.map(h => ({ x: h.x, y: h.y, angle: h.angle, length: h.length, width: h.width, variant: h.variant })),
    lanes,
    tails: tailsList,
    label: placeLabel(input.name, houses, roads, extent),
    extent,
  }
}
