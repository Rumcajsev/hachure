import type { IconOverlay } from '../store/mapStore'
import {
  ICON_GLYPH_FIT, ICON_GLYPH_FIT_BARE, ICON_GLYPH_STROKE,
  ICON_GLYPH_SUBPATHS, SHAPE_SUBPATHS, isPictorialIconShape, isBaseShape,
  type BackgroundShape,
} from './iconGlyphs'

export interface DrawIconsParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  iconOverlays: IconOverlay[]
  placedIcons: Record<string, [number, number][]>
  project: (lon: number, lat: number) => [number, number]
  R: number
  inMargin: (pts: [number, number][]) => boolean
  snapPreview?: { overlayId: string; lon: number; lat: number }
  /** Scale factor for pixel-based stroke widths — use lineScale during PDF export. */
  scale?: number
}

/** Fills (+ optionally strokes) one of the plain Lucide shape outlines, scaled to span radius `r`. */
function fillShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, r: number,
  subpaths: string[],
  fillColor: string, strokeColor: string, strokeWidth: number,
) {
  ctx.save()
  ctx.translate(x, y)
  const s = r / 12
  ctx.scale(s, s)
  ctx.translate(-12, -12)
  const path = new Path2D()
  for (const sub of subpaths) path.addPath(new Path2D(sub))
  ctx.fillStyle = fillColor
  ctx.fill(path)
  if (strokeWidth > 0) {
    ctx.lineWidth = strokeWidth / s
    ctx.strokeStyle = strokeColor
    ctx.stroke(path)
  }
  ctx.restore()
}

export function drawIconShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, r: number,
  shape: IconOverlay['shape'],
  fillColor: string, strokeColor: string, strokeWidth: number,
  alpha = 1,
  lineScale = 1,
  background: BackgroundShape = 'circle',
) {
  ctx.save()
  ctx.globalAlpha = alpha

  if (isPictorialIconShape(shape)) {
    const hasBackground = background !== 'none'
    if (hasBackground) fillShape(ctx, x, y, r, SHAPE_SUBPATHS[background], fillColor, strokeColor, strokeWidth)

    const fit = hasBackground ? ICON_GLYPH_FIT : ICON_GLYPH_FIT_BARE
    const glyphScale = (r * fit) / 12
    ctx.translate(x, y)
    ctx.scale(glyphScale, glyphScale)
    ctx.translate(-12, -12)
    ctx.lineWidth = ICON_GLYPH_STROKE * lineScale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = strokeColor
    const glyph = new Path2D()
    for (const sub of ICON_GLYPH_SUBPATHS[shape]) glyph.addPath(new Path2D(sub))
    ctx.stroke(glyph)

    ctx.restore()
    return
  }

  if (isBaseShape(shape)) fillShape(ctx, x, y, r, SHAPE_SUBPATHS[shape], fillColor, strokeColor, strokeWidth)
  ctx.restore()
}

export function drawIcons(params: DrawIconsParams) {
  const { ctx, iconOverlays, placedIcons, project, R, inMargin, snapPreview, scale = 1 } = params

  for (const overlay of iconOverlays) {
    const icons = placedIcons[overlay.id] ?? []
    const r = R * overlay.size
    for (const [lon, lat] of icons) {
      const [px, py] = project(lon, lat)
      if (!inMargin([[px, py]])) continue
      drawIconShape(ctx, px, py, r, overlay.shape, overlay.fillColor, overlay.strokeColor, overlay.strokeWidth * scale, 1, scale, overlay.background ?? 'circle')
    }
  }

  if (snapPreview) {
    const overlay = iconOverlays.find(o => o.id === snapPreview.overlayId)
    if (overlay) {
      const [px, py] = project(snapPreview.lon, snapPreview.lat)
      drawIconShape(ctx, px, py, R * overlay.size, overlay.shape, overlay.fillColor, overlay.strokeColor, overlay.strokeWidth * scale, 0.5, scale, overlay.background ?? 'circle')
    }
  }
}
