import type { IconOverlay } from '../store/mapStore'

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

const SIN60 = Math.sin(Math.PI / 3)

export function drawIconShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, r: number,
  shape: IconOverlay['shape'],
  fillColor: string, strokeColor: string, strokeWidth: number,
  alpha = 1,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = fillColor
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = strokeWidth

  ctx.beginPath()
  if (shape === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  } else if (shape === 'square') {
    ctx.rect(x - r, y - r, r * 2, r * 2)
  } else if (shape === 'triangle') {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x - r * SIN60, y + r * 0.5)
    ctx.lineTo(x + r * SIN60, y + r * 0.5)
    ctx.closePath()
  } else if (shape === 'diamond') {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
    ctx.closePath()
  } else if (shape === 'star') {
    const outerR = r
    const innerR = r * 0.38
    const points = 5
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2
      const rad = i % 2 === 0 ? outerR : innerR
      if (i === 0) ctx.moveTo(x + rad * Math.cos(angle), y + rad * Math.sin(angle))
      else ctx.lineTo(x + rad * Math.cos(angle), y + rad * Math.sin(angle))
    }
    ctx.closePath()
  }

  ctx.fill()
  if (strokeWidth > 0) ctx.stroke()
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
      drawIconShape(ctx, px, py, r, overlay.shape, overlay.fillColor, overlay.strokeColor, overlay.strokeWidth * scale)
    }
  }

  if (snapPreview) {
    const overlay = iconOverlays.find(o => o.id === snapPreview.overlayId)
    if (overlay) {
      const [px, py] = project(snapPreview.lon, snapPreview.lat)
      drawIconShape(ctx, px, py, R * overlay.size, overlay.shape, overlay.fillColor, overlay.strokeColor, overlay.strokeWidth * scale, 0.5)
    }
  }
}
