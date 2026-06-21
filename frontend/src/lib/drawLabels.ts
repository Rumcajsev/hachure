import type { LabelOverlay } from '../store/mapStore'
import type { PlacedLabel } from '../store/slices/labelsSlice'

export interface DrawLabelsParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  labelOverlays: LabelOverlay[]
  placedLabels: Record<string, PlacedLabel[]>
  project: (lon: number, lat: number) => [number, number]
  inMargin: (pts: [number, number][]) => boolean
  snapPreview?: { overlayId: string; lon: number; lat: number } | null
  editingLabel?: { overlayId: string; index: number } | null
  draggingLabel?: { overlayId: string; index: number; lon: number; lat: number } | null
  /** Scale factor for all pixel-based sizes — use lineScale during PDF export. */
  scale?: number
}

const LINE_STEP_RATIO = 1.2

interface BoxMetrics { lines: string[]; bw: number; bh: number; lineStep: number }

function measureBox(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  textSize: number,
): BoxMetrics {
  ctx.font = `bold ${textSize}px ui-monospace, monospace`
  ctx.textBaseline = 'middle'
  const lines = text.split('\n')
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width))

  const lineStep = textSize * LINE_STEP_RATIO
  const totalTextH = lines.length > 1 ? (lines.length - 1) * lineStep + textSize : textSize
  const pad = textSize * 0.15
  const naturalW = tw + pad * 2
  const naturalH = totalTextH + pad * 2
  const bh = naturalH
  const bw = Math.max(naturalW, naturalH)
  return { lines, bw, bh, lineStep }
}

function drawLabelBox(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  overlay: LabelOverlay,
  alpha = 1,
) {
  const { textSize, textColor, bgColor, strokeColor, strokeWidth, opacity = 1 } = overlay
  const { lines, bw, bh, lineStep } = measureBox(ctx, text, textSize)
  const bx = Math.round(x - bw / 2)
  const by = Math.round(y - bh / 2)

  ctx.save()
  ctx.globalAlpha = alpha * opacity

  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor
    ctx.fillRect(bx, by, bw, bh)
  }
  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.strokeRect(bx - strokeWidth / 2, by - strokeWidth / 2, bw + strokeWidth, bh + strokeWidth)
  }

  // textBaseline='middle' places the em-square center at y — browser handles the math.
  // Box center is also at y. Both anchors are y regardless of textSize or glyph shape.
  ctx.font = `bold ${textSize}px ui-monospace, monospace`
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const firstLineY = y - (lines.length - 1) * lineStep / 2
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, firstLineY + i * lineStep)
  }

  ctx.restore()
}

export function drawLabels(params: DrawLabelsParams) {
  const { ctx, labelOverlays, placedLabels, project, inMargin, snapPreview, editingLabel, draggingLabel, scale = 1 } = params

  const scaleOverlay = (o: LabelOverlay): LabelOverlay =>
    scale === 1 ? o : { ...o, textSize: o.textSize * scale, strokeWidth: o.strokeWidth * scale }

  for (const overlay of labelOverlays) {
    const scaled = scaleOverlay(overlay)
    const labels = placedLabels[overlay.id] ?? []
    for (let i = 0; i < labels.length; i++) {
      if (editingLabel?.overlayId === overlay.id && editingLabel.index === i) continue
      if (draggingLabel?.overlayId === overlay.id && draggingLabel.index === i) continue
      const { lon, lat, text } = labels[i]
      const [px, py] = project(lon, lat)
      if (!inMargin([[px, py]])) continue
      drawLabelBox(ctx, px, py, text || overlay.name, scaled)
    }
  }

  if (draggingLabel) {
    const overlay = labelOverlays.find(o => o.id === draggingLabel.overlayId)
    if (overlay) {
      const labels = placedLabels[overlay.id] ?? []
      const label = labels[draggingLabel.index]
      const [px, py] = project(draggingLabel.lon, draggingLabel.lat)
      drawLabelBox(ctx, px, py, label?.text || overlay.name, scaleOverlay(overlay), 0.7)
    }
  }

  if (snapPreview) {
    const overlay = labelOverlays.find(o => o.id === snapPreview.overlayId)
    if (overlay) {
      const [px, py] = project(snapPreview.lon, snapPreview.lat)
      drawLabelBox(ctx, px, py, overlay.name, scaleOverlay(overlay), 0.5)
    }
  }
}

export function getLabelBoxBounds(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  overlay: LabelOverlay,
): { bx: number; by: number; bw: number; bh: number } {
  const { bw, bh } = measureBox(ctx, text, overlay.textSize)
  return { bx: x - bw / 2, by: y - bh / 2, bw, bh }
}

type LabelBBox = { cx: number; cy: number; angle: number; hw: number; hh: number }

export interface LabelDragHandlesParams {
  ctx: CanvasRenderingContext2D
  active: boolean
  bboxCache: Record<string, LabelBBox>
  hoveredLabelId: string | null
  draggingLabelId: string | null
  zoom: number
}

export function _drawLabelDragHandles(p: LabelDragHandlesParams): void {
  if (!p.active) return
  const { ctx, bboxCache, hoveredLabelId, draggingLabelId, zoom } = p
  ctx.save()
  for (const [id, bbox] of Object.entries(bboxCache)) {
    const isHovered = id === hoveredLabelId
    const isDragging = id === draggingLabelId
    ctx.save()
    ctx.translate(bbox.cx, bbox.cy)
    ctx.rotate(bbox.angle)
    ctx.strokeStyle = isDragging ? '#e06030' : isHovered ? '#4a90d9' : 'rgba(80,120,200,0.6)'
    ctx.lineWidth = (isDragging || isHovered ? 1.5 : 1) / zoom
    ctx.setLineDash(isDragging ? [] : [3 / zoom, 2 / zoom])
    ctx.strokeRect(-bbox.hw, -bbox.hh, bbox.hw * 2, bbox.hh * 2)
    ctx.setLineDash([])
    ctx.fillStyle = isDragging ? '#e06030' : isHovered ? '#4a90d9' : 'rgba(80,120,200,0.7)'
    ctx.beginPath()
    ctx.arc(0, 0, 2.5 / zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}
