/** Draws the traced candidate road lines (skeletonized + simplified, from
 *  imageLineExtract.ts) for the single swatch currently being tuned, reprojecting
 *  each pixel-space polyline through the same forward transform drawMapImageOverlay
 *  uses. Screen-only preview, never exported — nothing here touches the store. */

import type { ImageTransform } from '../store/slices/mapImageSlice'
import { imagePixelToCanvasPoint } from './imageCoverageSample'

export interface DrawRoadLineTracePreviewParams {
  ctx: CanvasRenderingContext2D
  lines: [number, number][][]
  naturalW: number
  naturalH: number
  transform: ImageTransform
  px: number
  py: number
  pw: number
  ph: number
}

const TRACE_PREVIEW_COLOR = '#ffe600'
const TRACE_PREVIEW_LINE_WIDTH = 2.5

export function drawRoadLineTracePreview({
  ctx, lines, naturalW, naturalH, transform, px, py, pw, ph,
}: DrawRoadLineTracePreviewParams): void {
  if (lines.length === 0) return
  ctx.save()
  ctx.strokeStyle = TRACE_PREVIEW_COLOR
  ctx.lineWidth = TRACE_PREVIEW_LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const line of lines) {
    if (line.length < 2) continue
    ctx.beginPath()
    let started = false
    for (const [u, v] of line) {
      const pt = imagePixelToCanvasPoint(u, v, transform, naturalW, naturalH, px, py, pw, ph)
      if (!pt) continue
      if (!started) { ctx.moveTo(pt[0], pt[1]); started = true }
      else ctx.lineTo(pt[0], pt[1])
    }
    if (started) ctx.stroke()
  }
  ctx.restore()
}
