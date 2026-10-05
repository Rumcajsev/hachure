/** Field-based terrain blob shaping: traces a blurred/warped coverage field with
 *  marching squares instead of perturbing the hex-outline polygon directly.
 *  Pure functions — no React, no store, no canvas. Depends only on noise/geometry libs.
 *
 *  Call traceFieldBlobs() once per connected component (its painted hexes plus a ring
 *  of surrounding hexes for correct boundary resolution — see FieldHex.painted). Each
 *  call is independent and local to the hexes it's given, so callers control scope and
 *  caching the same way buildTerrainBlobTopology's per-component walk already does.
 *
 *  Field classification (which hex a sample point belongs to) is nearest-hex-center,
 *  which depends only on Euclidean distance — so it is unaffected by map rotation
 *  (bearing) as long as callers pass real projected hex centers. It does NOT know
 *  about partial (edge-clipped) hex shapes, so output loops can bleed past the paper
 *  boundary; use clipLoopsToRect() to cut them back to the paper rect after shaping. */

import { makePermutation, perlinNoise2D, hashStr } from './noise'
import { chaikin, douglasPeuckerClosed, clipPolygonToConvex } from './geometry'

// ── User-facing controls ──────────────────────────────────────────────────────

export interface FieldBlobControls {
  shape: number          // -1..1   geometric <-> organic (0 = plain hex outline)
  size: number            // -1..1   inset <-> outset
  bend: number              // 0..1  footprint bend amount
  bendVariation: number      // re-roll seed for the bend pattern
  detail: number               // 0..1  edge roughness
  coves: number                  // 0..1  bays/headlands
}

export const DEFAULT_FIELD_BLOB_CONTROLS: FieldBlobControls = {
  shape: 0, size: 0, bend: 0, bendVariation: 0, detail: 0, coves: 0,
}

/** Derived low-level settings, in px, scaled from R by fieldBlobControlsToSettings(). */
export interface FieldBlobSettings {
  blur: number
  bleed: number
  res: number
  minArea: number
  simplify: number
  smooth: number
  warp: number
  warpScale: number
  anchor: number
  offset: number
  dAmp: number; dFreq: number; dOct: number; dStep: number
  cAmp: number; cFreq: number; cOut: number; cMaskFreq: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function fieldBlobControlsToSettings(c: FieldBlobControls, R: number): FieldBlobSettings {
  const { shape, size, bend, detail, coves } = c
  const absShape = Math.abs(shape), organic = Math.max(0, shape)
  return {
    blur: lerp(0, shape > 0 ? 0.62 * R : 0.45 * R, absShape),
    bleed: 0.5 - 0.09 * organic,
    res: absShape < 0.3 ? 1.5 : 3,
    minArea: 0.3 * R * R * 2.6,
    simplify: shape < 0 ? lerp(0.02 * R, 0.45 * R, -shape) : 0.02 * R * (1 - shape),
    smooth: Math.max(shape <= 0.05 ? 0 : shape <= 0.4 ? 1 : shape <= 0.8 ? 2 : 3, coves > 0.1 ? 1 : 0),
    warp: lerp(0, 1.4 * R, bend),
    warpScale: 3 * R,
    anchor: bend > 0 ? 0.38 * R : 0,
    offset: size * 0.3 * R,
    dAmp: lerp(0, 0.6 * R, detail),
    dFreq: lerp(2 / R, 7 / R, detail),
    dOct: Math.round(lerp(2, 5, detail)),
    dStep: R / 15,
    cAmp: 0.55 * R * Math.pow(clamp01(coves), 0.6),
    cFreq: 0.85 / R,
    cOut: 0.45,
    cMaskFreq: 0.55 / R,
  }
}

// ── Field build ────────────────────────────────────────────────────────────────

export interface FieldHex {
  cx: number
  cy: number
  /** Whether this hex belongs to the blob. Unpainted neighbor hexes must still be
   *  included so the field has something to classify boundary pixels against —
   *  without them, the field just sees distance-to-nearest-painted-hex and produces
   *  a blurry circle instead of a shape that follows the actual hex boundary. */
  painted: boolean
}

function fbm(x: number, y: number, perm: Uint8Array, octaves: number): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlinNoise2D(x * freq, y * freq, perm)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return norm > 0 ? sum / norm / 2 + 0.5 : 0.5 // perlinNoise2D is roughly -1..1 -> fold to 0..1
}

function boxBlur(a: Float32Array, w: number, h: number, radius: number): void {
  if (radius <= 0) return
  const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
  const tmp = new Float32Array(a.length), span = 2 * radius + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += a[row + clampI(k, 0, w - 1)]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / span
      sum += a[row + Math.min(x + radius + 1, w - 1)] - a[row + Math.max(x - radius, 0)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += tmp[clampI(k, 0, h - 1) * w + x]
    for (let y = 0; y < h; y++) {
      a[y * w + x] = sum / span
      sum += tmp[Math.min(y + radius + 1, h - 1) * w + x] - tmp[Math.max(y - radius, 0) * w + x]
    }
  }
}

/** Nearest-hex spatial index. Bucket size follows the usual hex-field heuristic
 *  (R * 1.8 covers a hex's immediate ring in one neighboring-cell lookup). */
function buildHexIndex(hexes: FieldHex[]) {
  const cellSize = Math.max(1, hexes.length ? estimateSpacing(hexes) : 1)
  const buckets = new Map<string, FieldHex[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`
  for (const h of hexes) {
    const k = key(h.cx, h.cy)
    const arr = buckets.get(k)
    if (arr) arr.push(h); else buckets.set(k, [h])
  }
  return {
    nearest(x: number, y: number): FieldHex | null {
      const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize)
      let best: FieldHex | null = null, bestD = Infinity
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = buckets.get(`${cx + dx},${cy + dy}`)
        if (!arr) continue
        for (const h of arr) {
          const d = (x - h.cx) ** 2 + (y - h.cy) ** 2
          if (d < bestD) { bestD = d; best = h }
        }
      }
      return best
    },
  }
}

function estimateSpacing(hexes: FieldHex[]): number {
  const a = hexes[0]
  let minD = Infinity
  for (let i = 1; i < hexes.length && i < 64; i++) {
    const d = Math.hypot(hexes[i].cx - a.cx, hexes[i].cy - a.cy)
    if (d > 0 && d < minD) minD = d
  }
  return Number.isFinite(minD) ? minD * 1.8 : 100
}

function buildField(hexes: FieldHex[], settings: FieldBlobSettings, seed: number, pad: number) {
  const painted = hexes.filter(h => h.painted)
  const minX = Math.min(...painted.map(h => h.cx)) - pad
  const maxX = Math.max(...painted.map(h => h.cx)) + pad
  const minY = Math.min(...painted.map(h => h.cy)) - pad
  const maxY = Math.max(...painted.map(h => h.cy)) + pad
  const step = settings.res
  const mw = Math.max(2, Math.ceil((maxX - minX) / step))
  const mh = Math.max(2, Math.ceil((maxY - minY) / step))
  const index = buildHexIndex(hexes)

  const coverage = new Float32Array(mw * mh)
  const subOffsets: [number, number][] = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    let count = 0
    for (const [ox, oy] of subOffsets) {
      const h = index.nearest(minX + (i + ox) * step, minY + (j + oy) * step)
      if (h?.painted) count++
    }
    coverage[j * mw + i] = count / 4
  }
  const blurRadius = Math.round(settings.blur / (step * 1.4))
  boxBlur(coverage, mw, mh, blurRadius)
  boxBlur(coverage, mw, mh, blurRadius)

  const field = new Float32Array(coverage.length)
  const warpPermX = makePermutation(seed)
  const warpPermY = makePermutation(seed + 97)
  const bilerp = (x: number, y: number) => {
    const cl = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v)
    x = cl(x, mw - 1.001); y = cl(y, mh - 1.001)
    const x0 = x | 0, y0 = y | 0, x1 = x0 + 1, y1 = y0 + 1, fx = x - x0, fy = y - y0
    return (coverage[y0 * mw + x0] * (1 - fx) + coverage[y0 * mw + x1] * fx) * (1 - fy) +
           (coverage[y1 * mw + x0] * (1 - fx) + coverage[y1 * mw + x1] * fx) * fy
  }
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const px = minX + (i + 0.5) * step, py = minY + (j + 0.5) * step
    let value = coverage[j * mw + i]
    if (settings.warp > 0) {
      const wx = perlinNoise2D(px / settings.warpScale, py / settings.warpScale, warpPermX) * settings.warp / step
      const wy = perlinNoise2D(px / settings.warpScale, py / settings.warpScale, warpPermY) * settings.warp / step
      value = bilerp(i + wx, j + wy)
    }
    if (settings.anchor > 0) {
      const h = index.nearest(px, py)
      if (h?.painted) {
        const d = Math.hypot(px - h.cx, py - h.cy)
        value = Math.max(value, Math.max(0, (settings.anchor - d) / (settings.anchor * 0.3)))
      }
    }
    field[j * mw + i] = Math.min(1, value)
  }
  // Close the field at its border so every loop is guaranteed closed
  for (let i = 0; i < mw; i++) { field[i] = 0; field[(mh - 1) * mw + i] = 0 }
  for (let j = 0; j < mh; j++) { field[j * mw] = 0; field[j * mw + mw - 1] = 0 }

  return { field, mw, mh, minX, minY, step }
}

// ── Marching squares ─────────────────────────────────────────────────────────

const SADDLE_FREE_PAIRS: Record<number, number[][]> = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]],
  8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[3, 1]], 13: [[0, 1]], 14: [[3, 0]],
}
interface FieldSeg { ka: string; kb: string; pa: [number, number]; pb: [number, number]; used: boolean }

function marchingSquares(field: Float32Array, mw: number, mh: number, threshold: number): [number, number][][] {
  const segs: FieldSeg[] = [], adjacency = new Map<string, FieldSeg[]>()
  const edgeT = (a: number, b: number) => (threshold - a) / (b - a)
  const addSeg = (ka: string, pa: [number, number], kb: string, pb: [number, number]) => {
    const seg: FieldSeg = { ka, kb, pa, pb, used: false }
    segs.push(seg)
    for (const k of [ka, kb]) {
      const arr = adjacency.get(k)
      if (arr) arr.push(seg); else adjacency.set(k, [seg])
    }
  }
  for (let j = 0; j < mh - 1; j++) for (let i = 0; i < mw - 1; i++) {
    const a = field[j * mw + i], b = field[j * mw + i + 1]
    const c = field[(j + 1) * mw + i + 1], d = field[(j + 1) * mw + i]
    const code = (a > threshold ? 1 : 0) | (b > threshold ? 2 : 0) | (c > threshold ? 4 : 0) | (d > threshold ? 8 : 0)
    if (code === 0 || code === 15) continue
    const edges: [string, [number, number]][] = [
      ['h' + i + ',' + j, [i + edgeT(a, b), j]],
      ['v' + (i + 1) + ',' + j, [i + 1, j + edgeT(b, c)]],
      ['h' + i + ',' + (j + 1), [i + edgeT(d, c), j + 1]],
      ['v' + i + ',' + j, [i, j + edgeT(a, d)]],
    ]
    let pairs = SADDLE_FREE_PAIRS[code]
    if (code === 5) pairs = (a + b + c + d) / 4 > threshold ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]
    if (code === 10) pairs = (a + b + c + d) / 4 > threshold ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]]
    for (const [x, y] of pairs) addSeg(edges[x][0], edges[x][1], edges[y][0], edges[y][1])
  }
  const loops: [number, number][][] = []
  for (const start of segs) {
    if (start.used) continue
    const loop: [number, number][] = []
    let cur: FieldSeg | undefined = start, key = start.ka
    while (cur && !cur.used) {
      cur.used = true
      const forward = cur.ka === key
      loop.push(forward ? cur.pa : cur.pb)
      key = forward ? cur.kb : cur.ka
      cur = (adjacency.get(key) ?? []).find(s => !s.used)
    }
    if (loop.length > 2) loops.push(loop)
  }
  return loops
}

// ── Edge displacement (coves + fine detail) ──────────────────────────────────

function resampleClosed(pts: [number, number][], step: number): [number, number][] {
  const n = pts.length, segLen: number[] = []
  const total = pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % n]
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    segLen.push(d)
    return sum + d
  }, 0)
  const count = Math.max(8, Math.round(total / step)), out: [number, number][] = []
  let i = 0, acc = 0
  for (let k = 0; k < count; k++) {
    const t = (k / count) * total
    while (acc + segLen[i] < t && i < n - 1) { acc += segLen[i]; i++ }
    const u = segLen[i] ? (t - acc) / segLen[i] : 0
    const p = pts[i], q = pts[(i + 1) % n]
    out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u])
  }
  return out
}

/** Slow, patchy, inward-biased normal displacement — bays deeper than headlands. */
function displaceCoves(pts: [number, number][], s: FieldBlobSettings, permCove: Uint8Array, permMask: Uint8Array): [number, number][] {
  const n = pts.length
  return pts.map((p, i): [number, number] => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
    const tx = b[0] - a[0], ty = b[1] - a[1], tlen = Math.hypot(tx, ty) || 1
    const nx = -ty / tlen, ny = tx / tlen
    const maskRaw = (perlinNoise2D(p[0] * s.cMaskFreq, p[1] * s.cMaskFreq, permMask) + 1) / 2
    const mask = 0.25 + 0.75 * clamp01((maskRaw - 0.3) / 0.4)
    let bump = Math.max(-1, Math.min(1, perlinNoise2D(p[0] * s.cFreq, p[1] * s.cFreq, permCove) * 2.1))
    bump = bump > 0 ? bump * s.cOut : bump * 1.15
    const amount = bump * s.cAmp * mask
    return [p[0] + nx * amount, p[1] + ny * amount]
  })
}

/** Fine, symmetric edge roughness. */
function displaceDetail(pts: [number, number][], amp: number, freq: number, octaves: number, perm: Uint8Array): [number, number][] {
  const n = pts.length
  return pts.map((p, i): [number, number] => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
    const tx = b[0] - a[0], ty = b[1] - a[1], tlen = Math.hypot(tx, ty) || 1
    const noise = (fbm(p[0] * freq, p[1] * freq, perm, octaves) - 0.5) * 2 * amp
    return [p[0] - ty / tlen * noise, p[1] + tx / tlen * noise]
  })
}

function offsetAlongNormal(pts: [number, number][], amount: number, inside: (p: [number, number]) => boolean): [number, number][] {
  if (amount === 0) return pts
  const n = pts.length, k = Math.min(3, n >> 2 || 1)
  const edgeNormal = (a: [number, number], b: [number, number]): [number, number] => {
    const tx = b[0] - a[0], ty = b[1] - a[1], tlen = Math.hypot(tx, ty) || 1
    return [-ty / tlen, tx / tlen]
  }
  const normals = pts.map((p, i): [number, number] => {
    const e1 = edgeNormal(pts[(i + n - k) % n], p), e2 = edgeNormal(p, pts[(i + k) % n])
    const vx = e1[0] + e2[0], vy = e1[1] + e2[1], vlen = Math.hypot(vx, vy) || 1
    const ux = vx / vlen, uy = vy / vlen
    const miter = 1 / Math.max(0.5, ux * e1[0] + uy * e1[1])
    return [ux * miter, uy * miter]
  })
  const mid = n >> 1
  const sign = inside([pts[mid][0] + normals[mid][0] * 1.5, pts[mid][1] + normals[mid][1] * 1.5]) ? -1 : 1
  return pts.map((p, i): [number, number] => [p[0] + normals[i][0] * sign * amount, p[1] + normals[i][1] * sign * amount])
}

export function loopArea(pts: [number, number][]): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length]
    area += pts[i][0] * q[1] - q[0] * pts[i][1]
  }
  return area / 2
}

// ── Entry point ───────────────────────────────────────────────────────────────

/** Trace the painted hexes in `hexes` into closed organic loops.
 *  `hexes` should include the painted set plus its immediate unpainted neighbors
 *  (painted: false) so the field can resolve the boundary correctly — see FieldHex.
 *  seed drives bend/coves/detail noise; pass the component's stable per-blob seed
 *  so dice re-rolls and handle drags stay consistent, the same way shapeTerrainBlobs
 *  derives seeds per rawPoly today. */
export function traceFieldBlobs(
  hexes: FieldHex[],
  settings: FieldBlobSettings,
  R: number,
  seed: number,
): [number, number][][] {
  if (!hexes.some(h => h.painted)) return []
  const pad = R * 2.5 + settings.warp
  const { field, mw, mh, minX, minY, step } = buildField(hexes, settings, seed, pad)

  const rawLoops = marchingSquares(field, mw, mh, settings.bleed)
    .map(loop => loop.map(([x, y]): [number, number] => [minX + x * step, minY + y * step]))
    .filter(loop => Math.abs(loopArea(loop)) >= settings.minArea)

  const insideField = ([x, y]: [number, number]): boolean => {
    const fx = (x - minX) / step - 0.5, fy = (y - minY) / step - 0.5
    const cl = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v)
    const cx = cl(fx, mw - 1.001), cy = cl(fy, mh - 1.001)
    const x0 = cx | 0, y0 = cy | 0, u = cx - x0, v = cy - y0
    const val = (field[y0 * mw + x0] * (1 - u) + field[y0 * mw + x0 + 1] * u) * (1 - v) +
                (field[(y0 + 1) * mw + x0] * (1 - u) + field[(y0 + 1) * mw + x0 + 1] * u) * v
    return val > settings.bleed
  }

  const permCove = makePermutation(seed + 311)
  const permMask = makePermutation(seed + 521)
  const permDetail = makePermutation(seed + 733)

  return rawLoops.map(loop => {
    let pts = loop
    if (settings.offset !== 0) pts = offsetAlongNormal(resampleClosed(pts, 2.5), settings.offset, insideField)
    pts = douglasPeuckerClosed(pts, settings.simplify)
    if (settings.cAmp > 0 || settings.dAmp > 0) {
      pts = resampleClosed(pts, settings.dStep)
      if (settings.cAmp > 0) pts = displaceCoves(pts, settings, permCove, permMask)
      if (settings.dAmp > 0) pts = displaceDetail(pts, settings.dAmp, settings.dFreq, settings.dOct, permDetail)
    }
    return chaikin(pts, settings.smooth, true)
  })
}

// ── Paper-boundary clipping ───────────────────────────────────────────────────

/** Clip loops to an axis-aligned rect (the paper boundary in screen space — the
 *  paper itself is never rotated, only the map content inside it, so this is a
 *  plain rect even on a rotated map). Field classification doesn't know about
 *  partial hex shapes at the paper edge, so loops can bleed past it; call this
 *  after shaping to cut them back. */
export function clipLoopsToRect(
  loops: [number, number][][],
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): [number, number][][] {
  const rectPoly: [number, number][] = [
    [rect.minX, rect.minY], [rect.maxX, rect.minY], [rect.maxX, rect.maxY], [rect.minX, rect.maxY],
  ]
  return loops.flatMap(loop => {
    const clipped = clipPolygonToConvex(loop, rectPoly)
    return clipped.length >= 3 ? [clipped] : []
  })
}

// ── Per-terrain adapter ───────────────────────────────────────────────────────

export interface FieldBlobHexInput {
  cx: number
  cy: number
  /** True if this hex belongs to the target terrain (any component). */
  painted: boolean
  /** Canonical connected-component key (same convention as computeConnectedComponents /
   *  blobComponentsByTerrain: "minQ,minR" of the component). Required when painted. */
  componentKey?: string
}

/** Shapes one terrain's painted hexes into field-based blob loops, one call per
 *  connected component so each component keeps a stable identity (blobKeys) for
 *  handle drag / dice re-roll — mirrors shapeTerrainBlobs's output shape so it can
 *  be swapped in at the same call site.
 *  `hexes` must include EVERY hex in the local area, not just painted ones — see
 *  FieldHex.painted in traceFieldBlobs for why unpainted neighbors are required. */
export function shapeTerrainBlobsField(
  terrain: string,
  hexes: FieldBlobHexInput[],
  controls: FieldBlobControls,
  R: number,
  blobSeeds: Record<string, number> = {},
): { terrain: string; polys: [number, number][][]; blobKeys: string[] } {
  const settings = fieldBlobControlsToSettings(controls, R)
  const byComponent = new Map<string, FieldBlobHexInput[]>()
  for (const h of hexes) {
    if (!h.painted || !h.componentKey) continue
    const arr = byComponent.get(h.componentKey)
    if (arr) arr.push(h); else byComponent.set(h.componentKey, [h])
  }

  const pad = R * 4 + settings.warp
  const polys: [number, number][][] = []
  const blobKeys: string[] = []
  for (const [componentKey, paintedHexes] of byComponent) {
    const minX = Math.min(...paintedHexes.map(h => h.cx)) - pad
    const maxX = Math.max(...paintedHexes.map(h => h.cx)) + pad
    const minY = Math.min(...paintedHexes.map(h => h.cy)) - pad
    const maxY = Math.max(...paintedHexes.map(h => h.cy)) + pad
    const local: FieldHex[] = hexes
      .filter(h => h.cx >= minX && h.cx <= maxX && h.cy >= minY && h.cy <= maxY)
      .map(h => ({ cx: h.cx, cy: h.cy, painted: h.componentKey === componentKey }))

    const seed = (hashStr(componentKey) ^ (blobSeeds[componentKey] ?? 0)) >>> 0
    for (const loop of traceFieldBlobs(local, settings, R, seed)) {
      polys.push(loop)
      blobKeys.push(componentKey)
    }
  }
  return { terrain, polys, blobKeys }
}
