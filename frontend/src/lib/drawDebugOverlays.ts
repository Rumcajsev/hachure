/**
 * Screen-only diagnostic and reference overlays.
 * Both operate in paper-local canvas space (px=0, py=0 convention).
 * Never called during export.
 */
import type { GridMetadata } from '../store/mapStore'
import { projectToCanvas } from './projection'

// ---------------------------------------------------------------------------
// WorldCover raster overlay
// ---------------------------------------------------------------------------

export interface WorldcoverOverlayParams {
  ctx: CanvasRenderingContext2D
  show: boolean
  image: HTMLImageElement | null
  meta: GridMetadata
  pw: number
  ph: number
  computeWcBbox: (meta: GridMetadata) => { minLon: number; minLat: number; maxLon: number; maxLat: number } | null
}

export function _drawWorldcoverOverlay(p: WorldcoverOverlayParams): void {
  const { ctx, show, image, meta, pw, ph, computeWcBbox } = p
  if (!show || !image) return

  const wcBbox = computeWcBbox(meta)
  if (!wcBbox) return

  const proj = (lon: number, lat: number): [number, number] =>
    projectToCanvas(lon, lat, meta, pw, ph, 0, 0)

  const { minLon, minLat, maxLon, maxLat } = wcBbox
  const tl = proj(minLon, maxLat)
  const tr = proj(maxLon, maxLat)
  const bl = proj(minLon, minLat)
  const iw = image.naturalWidth, ih = image.naturalHeight

  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.setTransform(
    (tr[0] - tl[0]) / iw, (tr[1] - tl[1]) / iw,
    (bl[0] - tl[0]) / ih, (bl[1] - tl[1]) / ih,
    tl[0], tl[1],
  )
  ctx.drawImage(image, 0, 0, iw, ih)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Raw OSM road debug overlay
// ---------------------------------------------------------------------------

type RoadWay = { coords: [number, number][]; highway: string }

export interface RawOsmRoadsOverlayParams {
  ctx: CanvasRenderingContext2D
  show: boolean
  ways: RoadWay[]
  meta: GridMetadata
  pw: number
  ph: number
}

export function _drawRawOsmRoadsOverlay(p: RawOsmRoadsOverlayParams): void {
  const { ctx, show, ways, meta, pw, ph } = p
  if (!show || ways.length === 0) return

  const proj = (lon: number, lat: number): [number, number] =>
    projectToCanvas(lon, lat, meta, pw, ph, 0, 0)

  const tierColor = ['rgba(220,50,50,0.9)', 'rgba(220,140,30,0.9)', 'rgba(180,180,30,0.85)']
  const tierWidth = [2.5, 1.5, 1]
  const hwTier: Record<string, number> = {
    motorway: 0, motorway_link: 0, trunk: 0, trunk_link: 0,
    primary: 1, primary_link: 1,
    secondary: 2, secondary_link: 2, tertiary: 2, tertiary_link: 2,
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, pw, ph)
  ctx.clip()

  for (const way of ways) {
    if (way.coords.length < 2) continue
    const tier = hwTier[way.highway] ?? 2
    ctx.beginPath()
    ctx.strokeStyle = tierColor[tier]
    ctx.lineWidth = tierWidth[tier]
    const [x0, y0] = proj(way.coords[0][0], way.coords[0][1])
    ctx.moveTo(x0, y0)
    for (let i = 1; i < way.coords.length; i++) {
      const [x, y] = proj(way.coords[i][0], way.coords[i][1])
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Image-extracted road preview overlay (raw, unsnapped traced polylines)
// ---------------------------------------------------------------------------

type ExtractedRoadWay = { coords: [number, number][]; tier: 0 | 1 | 2 }

export interface ExtractedRoadWaysOverlayParams {
  ctx: CanvasRenderingContext2D
  ways: ExtractedRoadWay[]
  meta: GridMetadata
  pw: number
  ph: number
}

export function _drawExtractedRoadWaysOverlay(p: ExtractedRoadWaysOverlayParams): void {
  const { ctx, ways, meta, pw, ph } = p
  if (ways.length === 0) return

  const proj = (lon: number, lat: number): [number, number] =>
    projectToCanvas(lon, lat, meta, pw, ph, 0, 0)

  const tierColor = ['rgba(60,160,220,0.95)', 'rgba(60,200,140,0.95)', 'rgba(220,60,220,0.9)']
  const tierWidth = [2.5, 2, 1.5]

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, pw, ph)
  ctx.clip()
  ctx.setLineDash([4, 3])

  for (const way of ways) {
    if (way.coords.length < 2) continue
    ctx.beginPath()
    ctx.strokeStyle = tierColor[way.tier]
    ctx.lineWidth = tierWidth[way.tier]
    const [x0, y0] = proj(way.coords[0][0], way.coords[0][1])
    ctx.moveTo(x0, y0)
    for (let i = 1; i < way.coords.length; i++) {
      const [x, y] = proj(way.coords[i][0], way.coords[i][1])
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  ctx.restore()
}
