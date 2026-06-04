/** Geo↔canvas projection utilities. Pure functions, no React or store deps
 *  (but takes GridMetadata by value so callers control the import). */

import { FRAME_MARGIN } from '../store/mapStore'
import type { GridMetadata } from '../store/mapStore'

/** Projects geographic coordinates onto the paper rect in canvas logical pixels.
 *  Accounts for paper_offset_mm: the paper's visual centre may be displaced from
 *  the geographic centre when the map has been asymmetrically expanded. */
export function projectToCanvas(
  lon: number, lat: number,
  meta: GridMetadata,
  paperW: number, paperH: number,
  paperX: number, paperY: number,
): [number, number] {
  const MPDEG = 111319
  const cosLat = Math.cos((meta.center[1] * Math.PI) / 180)
  const β = (meta.bearing * Math.PI) / 180
  const E_m = (lon - meta.center[0]) * cosLat * MPDEG
  const N_m = (lat - meta.center[1]) * MPDEG
  const px_m = E_m * Math.cos(β) - N_m * Math.sin(β)
  const py_m = E_m * Math.sin(β) + N_m * Math.cos(β)
  const scalePxPerM = paperW / (meta.scale_m_per_mm * meta.paper_mm[0])
  const scalePxPerMm = paperW / meta.paper_mm[0]
  const [ox, oy] = meta.paper_offset_mm ?? [0, 0]
  // paper_offset_mm shifts the visual paper centre away from the geographic centre:
  //   ox > 0 → paper centre is to the right of geo centre → geo centre renders left of canvas centre
  //   oy > 0 → paper centre is above geo centre (paper-up) → geo centre renders below canvas centre
  return [
    paperX + paperW / 2 - ox * scalePxPerMm + px_m * scalePxPerM,
    paperY + paperH / 2 + oy * scalePxPerMm - py_m * scalePxPerM,
  ]
}

/** Inverts projectToCanvas — canvas pixel → geographic coordinates. */
export function unprojectFromCanvas(
  cx: number, cy: number,
  meta: GridMetadata,
  paperW: number, paperH: number,
  paperX: number, paperY: number,
): [number, number] {
  const MPDEG = 111319
  const cosLat = Math.cos((meta.center[1] * Math.PI) / 180)
  const β = (meta.bearing * Math.PI) / 180
  const scalePxPerM = paperW / (meta.scale_m_per_mm * meta.paper_mm[0])
  const scalePxPerMm = paperW / meta.paper_mm[0]
  const [ox, oy] = meta.paper_offset_mm ?? [0, 0]
  const px_m = (cx - paperX - paperW / 2 + ox * scalePxPerMm) / scalePxPerM
  const py_m = -(cy - paperY - paperH / 2 - oy * scalePxPerMm) / scalePxPerM
  const E_m = px_m * Math.cos(β) + py_m * Math.sin(β)
  const N_m = -px_m * Math.sin(β) + py_m * Math.cos(β)
  return [meta.center[0] + E_m / (cosLat * MPDEG), meta.center[1] + N_m / MPDEG]
}

/** Compute the axis-aligned lat/lon bbox used when fetching the WorldCover raster.
 *  Accounts for paper_offset_mm so the bbox covers the actual (asymmetric) paper area. */
export function computeWorldcoverBbox(meta: GridMetadata): { minLat: number; minLon: number; maxLat: number; maxLon: number } | null {
  if (!meta) return null
  const MPDEG = 111319
  const [wMm, hMm] = meta.paper_mm
  const scale = meta.scale_m_per_mm
  const buffer = 0.10
  const β = (meta.bearing * Math.PI) / 180
  const cosB = Math.cos(β), sinB = Math.sin(β)
  const cosLat = Math.cos((meta.center[1] * Math.PI) / 180)
  const [ox, oy] = meta.paper_offset_mm ?? [0, 0]
  // Paper corners in paper-space metres from geographic centre, accounting for offset
  const left  = (-(wMm / 2) + ox) * scale * (1 + buffer)
  const right = ( (wMm / 2) + ox) * scale * (1 + buffer)
  const bot   = (-(hMm / 2) - oy) * scale * (1 + buffer)
  const top   = ( (hMm / 2) - oy) * scale * (1 + buffer)
  const corners: [number, number][] = [[left, bot], [right, bot], [right, top], [left, top]]
  const lats: number[] = [], lons: number[] = []
  for (const [px, py] of corners) {
    const E_m = px * cosB + py * sinB
    const N_m = -px * sinB + py * cosB
    lats.push(meta.center[1] + N_m / MPDEG)
    lons.push(meta.center[0] + E_m / (cosLat * MPDEG))
  }
  return { minLat: Math.min(...lats), minLon: Math.min(...lons), maxLat: Math.max(...lats), maxLon: Math.max(...lons) }
}

/** Fits the paper rect (with FRAME_MARGIN) into a CSS canvas of cssW×cssH. */
export function computePaper(cssW: number, cssH: number, meta: GridMetadata) {
  const [pwMm, phMm] = meta.paper_mm
  const aspect = pwMm / phMm
  const margin = FRAME_MARGIN
  let pw = cssW * margin
  let ph = pw / aspect
  if (ph > cssH * margin) { ph = cssH * margin; pw = ph * aspect }
  const px = (cssW - pw) / 2
  const py = (cssH - ph) / 2
  return { pw, ph, px, py }
}
