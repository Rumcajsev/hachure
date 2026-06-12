/** Terrain blob building and field-style rendering utilities.
 *  Depends on geometry, noise, and projection libs — no React, no store state. */

import { chaikin, subdivideClosedPolygon, resampleSmoothQuad, douglasPeuckerClosed, pointInPolygon } from './geometry'
import { makePermutation, perlinNoise2D, perturbXY, perturbNormal, mulberry32 } from './noise'
import { projectToCanvas } from './projection'
import polygonClipping from 'polygon-clipping'
import { hexTerrainLayers } from '../store/mapStore'
import type { GridMetadata, GeneratedHex, BlobMaskEdit } from '../store/mapStore'

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

// ── Blob mask edits (boolean add/subtract) ───────────────────────────────────

export type BlobShapeParams = {
  R: number
  smooth: number
  bump: number
  sweepFreq: number
  lobeFreq: number
  lobeAmp: number
  lobeThreshold: number
  lobeDirection: number
}

/** Apply stored BlobMaskEdits to pre-shaped blob polygons.
 *  Edits are stored in WGS84 lon/lat; projectFn converts them to canvas space.
 *  Add/subtract edits both go through the terrain blob shaping pipeline when shapeParams is provided. */
export function applyBlobMaskEdits(
  blobs: { terrain: string; polys: [number, number][][] }[],
  edits: BlobMaskEdit[],
  projectFn: (lonlat: [number, number]) => [number, number],
  shapeParams?: BlobShapeParams,
): { terrain: string; polys: [number, number][][] }[] {
  if (edits.length === 0) return blobs
  return blobs.map(blob => {
    const relevant = edits.filter(e => e.terrain === blob.terrain)
    if (relevant.length === 0) return blob

    let polys = blob.polys
    for (const edit of relevant) {
      const editCanvas = edit.polygon.map(projectFn)
      if (editCanvas.length < 3) continue

      const seed = Math.abs(Math.round(editCanvas[0][0] * 73 + editCanvas[0][1] * 97)) ^ (edit.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

      let shaped: [number, number][] = editCanvas as [number, number][]
      if (shapeParams) {
        const p = shapeParams
        const p1Amp = p.bump * p.R
        const p2Amp = p.bump * p.lobeAmp * p.R * p.lobeDirection
        let out: [number, number][] = shaped
        const smoothPasses = Math.floor(p.smooth)
        const smoothRemainder = p.smooth - smoothPasses
        for (let i = 0; i < smoothPasses; i++) out = preSmoothVar(out, 0.4)
        if (smoothRemainder > 0) out = preSmoothVar(out, 0.4 * smoothRemainder)
        out = subdivideClosedPolygon(out, p.R * 0.25)
        out = perturbXY(out, makePermutation(seed), makePermutation(seed + 31), p.sweepFreq / p.R, p1Amp)
        out = resampleSmoothQuad(out, 5)
        out = perturbNormal(out, makePermutation(seed + 67), makePermutation(seed + 113), p.lobeFreq / p.R, p2Amp, p.lobeThreshold)
        shaped = out
      }

      if (edit.type === 'subtract') {
        const editMPoly: polygonClipping.MultiPolygon = [[shaped as polygonClipping.Ring]]
        const next: [number, number][][] = []
        for (const poly of polys) {
          if (poly.length < 3) continue
          const subject: polygonClipping.MultiPolygon = [[poly as polygonClipping.Ring]]
          try {
            const result = polygonClipping.difference(subject, editMPoly)
            for (const polygon of result) {
              if (polygon[0]?.length >= 3) next.push(polygon[0] as [number, number][])
            }
          } catch {
            next.push(poly)
          }
        }
        polys = next
      } else {
        polys = [...polys, shaped]
      }
    }
    return { ...blob, polys }
  })
}

/** Cut river corridors out of raw (pre-shaped) hex-outline polygons so the
 *  cut edge participates in the full blob shaping pipeline (inset, bump, lobe).
 *  Call this on rawPolys before passing them to shapeTerrainBlobs. */
export function cutRawPolysWithCorridors(
  rawPolys: [number, number][][],
  corridors: [number, number][][],
): [number, number][][] {
  if (corridors.length === 0) return rawPolys
  const cutMultiPoly: polygonClipping.MultiPolygon = corridors.map(c => [c as polygonClipping.Ring])
  return rawPolys.flatMap(poly => {
    if (poly.length < 3) return [poly]
    const subject: polygonClipping.MultiPolygon = [[poly as polygonClipping.Ring]]
    try {
      const result = polygonClipping.difference(subject, cutMultiPoly)
      return result.map(p => p[0] as [number, number][]).filter(p => p?.length >= 3)
    } catch { return [poly] }
  })
}

export type BlobSplatParams = {
  splatDensity: number  // expected satellites per R of perimeter (0 = none)
  splatSize: number     // satellite radius as fraction of R
  holeDensity: number   // expected holes per 6R of perimeter (0 = none)
  holeSize: number      // hole radius as fraction of R
}

/** Generate procedural satellite splats (small blobs near edges) and holes (clearings inside)
 *  for all terrain blobs. Both are seeded deterministically from blob geometry so they are
 *  stable across re-renders without being stored. Runs after shaping and mask edits. */
export function generateBlobSplats(
  blobs: { terrain: string; polys: [number, number][][] }[],
  params: BlobSplatParams,
  R: number,
  shapeParams: BlobShapeParams,
): { terrain: string; polys: [number, number][][] }[] {
  const { splatDensity, splatSize, holeDensity, holeSize } = params
  if (splatDensity <= 0 && holeDensity <= 0) return blobs

  return blobs.map(blob => {
    const addSplats: [number, number][][] = []
    const subtractPolys: [number, number][][] = []

    for (const poly of blob.polys) {
      const n = poly.length
      if (n < 3) continue

      const seed = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97))
      const rng = mulberry32(seed ^ 0x5A7B3C)

      // Perimeter arc-length table
      let totalLen = 0
      const arcLens: number[] = [0]
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n]
        totalLen += Math.hypot(b[0] - a[0], b[1] - a[1])
        arcLens.push(totalLen)
      }

      // Centroid for normal-direction checks and hole placement
      let cx = 0, cy = 0
      for (const [x, y] of poly) { cx += x; cy += y }
      cx /= n; cy /= n

      // ── Satellites along the boundary ───────────────────────────────────────
      if (splatDensity > 0) {
        const spacing = R / splatDensity
        let t = rng() * spacing
        let idx = 0
        while (t < totalLen) {
          // Find position at arc length t
          const tmod = t % totalLen
          while (idx + 1 < arcLens.length - 1 && arcLens[idx + 1] <= tmod) idx++
          const a = poly[idx], b = poly[(idx + 1) % n]
          const segLen = arcLens[idx + 1] - arcLens[idx]
          const f = segLen < 1e-9 ? 0 : (tmod - arcLens[idx]) / segLen
          const px = a[0] + f * (b[0] - a[0])
          const py = a[1] + f * (b[1] - a[1])

          // Outward normal (flip if it points toward centroid)
          const dx = b[0] - a[0], dy = b[1] - a[1]
          const elen = Math.hypot(dx, dy)
          let nx = elen < 1e-9 ? 0 : -dy / elen
          let ny = elen < 1e-9 ? 0 :  dx / elen
          if (nx * (cx - px) + ny * (cy - py) > 0) { nx = -nx; ny = -ny }

          // Satellite center: just outside the boundary
          const offset = R * (0.15 + rng() * 0.25)
          const scx = px + nx * offset
          const scy = py + ny * offset

          // Satellite radius with variation
          const sr = R * splatSize * (0.6 + rng() * 0.8)
          const splatSeed = seed ^ Math.abs(Math.round(t)) ^ 0x9A3F

          // Build circle polygon and shape it organically
          const nPts = 8 + Math.floor(rng() * 5)
          const circle: [number, number][] = []
          for (let i = 0; i < nPts; i++) {
            const angle = (i / nPts) * Math.PI * 2
            circle.push([scx + Math.cos(angle) * sr, scy + Math.sin(angle) * sr])
          }

          const sp = shapeParams
          const p1Amp = sp.bump * sr
          const p2Amp = sp.bump * sp.lobeAmp * sr * sp.lobeDirection
          let out: [number, number][] = circle
          out = subdivideClosedPolygon(out, Math.max(sr * 0.25, 1))
          out = perturbXY(out, makePermutation(splatSeed), makePermutation(splatSeed + 31), sp.sweepFreq / sr, p1Amp)
          out = resampleSmoothQuad(out, 3)
          out = perturbNormal(out, makePermutation(splatSeed + 67), makePermutation(splatSeed + 113), sp.lobeFreq / sr, p2Amp, sp.lobeThreshold)

          if (out.length >= 3) addSplats.push(out)

          t += spacing * (0.5 + rng())
        }
      }

      // ── Interior holes ──────────────────────────────────────────────────────
      if (holeDensity > 0) {
        // Expected holes proportional to blob perimeter (scales with blob size)
        const expected = holeDensity * totalLen / (6 * R)
        const numHoles = Math.floor(expected) + (rng() < (expected % 1) ? 1 : 0)

        // Bounding box for rejection sampling
        let minX = poly[0][0], maxX = poly[0][0]
        let minY = poly[0][1], maxY = poly[0][1]
        for (const [x, y] of poly) {
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }

        for (let h = 0; h < numHoles; h++) {
          const hr = R * holeSize * (0.6 + rng() * 0.6)
          const minDist = hr * 1.5  // hole center must be this far from boundary

          let hcx = 0, hcy = 0, found = false
          for (let attempt = 0; attempt < 40; attempt++) {
            const tx = minX + rng() * (maxX - minX)
            const ty = minY + rng() * (maxY - minY)
            if (!pointInPolygon(tx, ty, poly)) continue

            // Approximate distance to nearest boundary segment
            let minBd = Infinity
            for (let i = 0; i < n; i++) {
              const a = poly[i], b = poly[(i + 1) % n]
              const edx = b[0] - a[0], edy = b[1] - a[1]
              const len2 = edx * edx + edy * edy
              const t2 = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((tx - a[0]) * edx + (ty - a[1]) * edy) / len2))
              const d = Math.hypot(a[0] + t2 * edx - tx, a[1] + t2 * edy - ty)
              if (d < minBd) minBd = d
            }
            if (minBd >= minDist) { hcx = tx; hcy = ty; found = true; break }
          }
          if (!found) continue

          const holeSeed = seed ^ (h * 0x7F3D) ^ 0xB4E1
          const nPts = 8 + Math.floor(rng() * 5)
          const circle: [number, number][] = []
          for (let i = 0; i < nPts; i++) {
            const angle = (i / nPts) * Math.PI * 2
            circle.push([hcx + Math.cos(angle) * hr, hcy + Math.sin(angle) * hr])
          }

          const sp = shapeParams
          const p1Amp = sp.bump * hr
          const p2Amp = sp.bump * sp.lobeAmp * hr * sp.lobeDirection
          let out: [number, number][] = circle
          out = subdivideClosedPolygon(out, Math.max(hr * 0.25, 1))
          out = perturbXY(out, makePermutation(holeSeed), makePermutation(holeSeed + 31), sp.sweepFreq / hr, p1Amp)
          out = resampleSmoothQuad(out, 3)
          out = perturbNormal(out, makePermutation(holeSeed + 67), makePermutation(holeSeed + 113), sp.lobeFreq / hr, p2Amp, sp.lobeThreshold)

          if (out.length >= 3) subtractPolys.push(out)
        }
      }
    }

    // Apply holes to original polys, then append satellites
    let polys = blob.polys
    if (subtractPolys.length > 0) {
      const cutMPoly: polygonClipping.MultiPolygon = subtractPolys.map(c => [c as polygonClipping.Ring])
      const next: [number, number][][] = []
      for (const poly of polys) {
        if (poly.length < 3) continue
        const subject: polygonClipping.MultiPolygon = [[poly as polygonClipping.Ring]]
        try {
          const result = polygonClipping.difference(subject, cutMPoly)
          for (const p of result) {
            if (p[0]?.length >= 3) next.push(p[0] as [number, number][])
          }
        } catch { next.push(poly) }
      }
      polys = next
    }

    return { ...blob, polys: [...polys, ...addSplats] }
  })
}

/** Cut river corridors out of all terrain blobs in one efficient pass.
 *  Corridors are in canvas/paper coords (not lon/lat) — no projection needed.
 *  When shapeParams is provided each corridor goes through the same organic
 *  shaping pipeline as manual subtract edits, so cut edges match the terrain
 *  blob style (wobbly/lobed) rather than being crisp geometric strips.
 *  All (shaped) corridors are unioned into a single MultiPolygon so only one
 *  polygonClipping.difference call is needed per blob regardless of river count. */
export function applyRiverCuts(
  blobs: { terrain: string; polys: [number, number][][] }[],
  corridors: [number, number][][],
  shapeParams?: BlobShapeParams,
): { terrain: string; polys: [number, number][][] }[] {
  if (corridors.length === 0) return blobs

  const shapedCorridors: [number, number][][] = corridors.map(corridor => {
    if (!shapeParams || corridor.length < 3) return corridor
    const p = shapeParams
    const seed = Math.abs(Math.round(corridor[0][0] * 73 + corridor[0][1] * 97))
    const p1Amp = p.bump * p.R
    const p2Amp = p.bump * p.lobeAmp * p.R * p.lobeDirection
    let out: [number, number][] = corridor
    const smoothPasses = Math.floor(p.smooth)
    const smoothRemainder = p.smooth - smoothPasses
    for (let i = 0; i < smoothPasses; i++) out = preSmoothVar(out, 0.4)
    if (smoothRemainder > 0) out = preSmoothVar(out, 0.4 * smoothRemainder)
    out = subdivideClosedPolygon(out, p.R * 0.25)
    out = perturbXY(out, makePermutation(seed), makePermutation(seed + 31), p.sweepFreq / p.R, p1Amp)
    out = resampleSmoothQuad(out, 5)
    out = perturbNormal(out, makePermutation(seed + 67), makePermutation(seed + 113), p.lobeFreq / p.R, p2Amp, p.lobeThreshold)
    return out
  })

  const cutMultiPoly: polygonClipping.MultiPolygon = shapedCorridors.map(c => [c as polygonClipping.Ring])
  return blobs.map(blob => {
    const nextPolys: [number, number][][] = []
    for (const poly of blob.polys) {
      if (poly.length < 3) continue
      const subject: polygonClipping.MultiPolygon = [[poly as polygonClipping.Ring]]
      try {
        const result = polygonClipping.difference(subject, cutMultiPoly)
        for (const p of result) {
          if (p[0]?.length >= 3) nextPolys.push(p[0] as [number, number][])
        }
      } catch {
        nextPolys.push(poly)
      }
    }
    return { ...blob, polys: nextPolys }
  })
}
