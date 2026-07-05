/** Pure helpers for sampling a user-aligned historical map image under hex polygons
 *  to build a coverage map (swatch id -> fraction of hex area matching that color),
 *  in the same shape the WorldCover classification engine already consumes.
 *  No store or React imports. */

import type { GeneratedHex, GridMetadata, ImageSwatch } from '../store/mapStore'
import type { ImageTransform } from '../store/slices/mapImageSlice'
import { projectToCanvas } from './projection'
import { pointInPolygon } from './geometry'
import { mulberry32 } from './noise'

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** Inverse of drawMapImageOverlay's forward transform (translate -> rotate -> scale,
 *  image-pixel to paper-space). Returns null if the point falls outside the image. */
export function canvasPointToImagePixel(
  X: number, Y: number,
  transform: ImageTransform, naturalW: number, naturalH: number,
  px: number, py: number, pw: number, ph: number,
): { u: number; v: number } | null {
  if (transform.scaleFrac <= 0) return null
  const canvasScale = (transform.scaleFrac * pw) / naturalW
  if (canvasScale <= 0) return null
  const cx = px + pw / 2 + transform.translateX * pw
  const cy = py + ph / 2 + transform.translateY * ph
  const rot = (transform.rotation * Math.PI) / 180
  const dx = X - cx, dy = Y - cy
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const lx = dx * cos + dy * sin
  const ly = -dx * sin + dy * cos
  const u = lx / canvasScale + naturalW / 2
  const v = ly / canvasScale + naturalH / 2
  if (u < 0 || u >= naturalW || v < 0 || v >= naturalH) return null
  return { u, v }
}

/** Forward of canvasPointToImagePixel (image-pixel to paper-space): translate ->
 *  rotate -> scale, matching drawMapImageOverlay's own forward transform. Used to
 *  reproject traced image features (e.g. extracted road/river lines) into map space. */
export function imagePixelToCanvasPoint(
  u: number, v: number,
  transform: ImageTransform, naturalW: number, naturalH: number,
  px: number, py: number, pw: number, ph: number,
): [number, number] | null {
  if (transform.scaleFrac <= 0) return null
  const canvasScale = (transform.scaleFrac * pw) / naturalW
  if (canvasScale <= 0) return null
  const cx = px + pw / 2 + transform.translateX * pw
  const cy = py + ph / 2 + transform.translateY * ph
  const rot = (transform.rotation * Math.PI) / 180
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const lx = (u - naturalW / 2) * canvasScale
  const ly = (v - naturalH / 2) * canvasScale
  const dx = lx * cos - ly * sin
  const dy = lx * sin + ly * cos
  return [dx + cx, dy + cy]
}

/** Small plus-shaped pixel cluster average, to damp thin contour/grid-line noise
 *  contaminating a single-pixel sample. */
export function sampleAveragedPixel(imgData: ImageData, u: number, v: number): [number, number, number] {
  const ix = Math.round(u), iy = Math.round(v)
  const offsets: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
  let r = 0, g = 0, b = 0, n = 0
  for (const [ox, oy] of offsets) {
    const x = ix + ox, y = iy + oy
    if (x < 0 || x >= imgData.width || y < 0 || y >= imgData.height) continue
    const idx = (y * imgData.width + x) * 4
    r += imgData.data[idx]; g += imgData.data[idx + 1]; b += imgData.data[idx + 2]
    n++
  }
  if (n === 0) return [0, 0, 0]
  return [r / n, g / n, b / n]
}

/** Resolution-independent paper rect: unit width, true paper aspect ratio for height,
 *  so hex projection and image-transform inversion agree regardless of live canvas size. */
export function unitPaperRect(meta: GridMetadata): { px: number; py: number; pw: number; ph: number } {
  return { px: 0, py: 0, pw: 1, ph: meta.paper_mm[1] / meta.paper_mm[0] }
}

const NEAREST_MATCH_NONE = -1

function nearestSwatch(r: number, g: number, b: number, swatches: ImageSwatch[]): number {
  let bestId = NEAREST_MATCH_NONE
  let bestDist = Infinity
  for (const s of swatches) {
    const [sr, sg, sb] = hexToRgb(s.color)
    const dist = colorDistance(r, g, b, sr, sg, sb)
    if (dist <= s.tolerance && dist < bestDist) {
      bestDist = dist
      bestId = s.id
    }
  }
  return bestId
}

/** Samples a jittered grid over the hex's paper-space bounding box, filtered to the
 *  hex interior, and returns the fraction of interior samples matching each swatch id
 *  (nearest swatch within its tolerance wins) - the same shape classifyHex expects. */
export function sampleHexImageCoverage(
  hex: GeneratedHex, meta: GridMetadata, imgData: ImageData,
  transform: ImageTransform, swatches: ImageSwatch[],
): Record<number, number> {
  const coverage: Record<number, number> = {}
  if (swatches.length === 0) return coverage

  const rect = unitPaperRect(meta)
  const paperVerts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, rect.pw, rect.ph, rect.px, rect.py))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of paperVerts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return coverage

  const GRID = 8
  const cellW = (maxX - minX) / GRID
  const cellH = (maxY - minY) / GRID
  const rng = mulberry32(hex.q * 92821 + hex.r * 68917)

  const counts: Record<number, number> = {}
  let total = 0

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const jx = (rng() - 0.5) * 0.6
      const jy = (rng() - 0.5) * 0.6
      const x = minX + (gx + 0.5 + jx) * cellW
      const y = minY + (gy + 0.5 + jy) * cellH
      if (!pointInPolygon(x, y, paperVerts as [number, number][])) continue
      const pt = canvasPointToImagePixel(x, y, transform, imgData.width, imgData.height, rect.px, rect.py, rect.pw, rect.ph)
      if (!pt) continue
      const [r, g, b] = sampleAveragedPixel(imgData, pt.u, pt.v)
      const matchId = nearestSwatch(r, g, b, swatches)
      total++
      if (matchId !== NEAREST_MATCH_NONE) counts[matchId] = (counts[matchId] ?? 0) + 1
    }
  }

  if (total === 0) return coverage
  for (const [id, count] of Object.entries(counts)) coverage[Number(id)] = count / total
  return coverage
}

export function computeAllHexImageCoverage(
  hexes: GeneratedHex[], meta: GridMetadata, imgData: ImageData,
  transform: ImageTransform, swatches: ImageSwatch[],
): Map<string, Record<number, number>> {
  const result = new Map<string, Record<number, number>>()
  for (const hex of hexes) {
    result.set(`${hex.q},${hex.r}`, sampleHexImageCoverage(hex, meta, imgData, transform, swatches))
  }
  return result
}
