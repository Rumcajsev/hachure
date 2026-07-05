/** Draws the live road-color-match preview bitmap (built in imageColorPreview.ts)
 *  using the same forward transform as drawMapImageOverlay, so it sits pixel-aligned
 *  on top of the source map image. Screen-only, never exported. */

import type { ImageTransform } from '../store/slices/mapImageSlice'

export interface DrawRoadColorPreviewParams {
  ctx: CanvasRenderingContext2D
  bitmap: ImageBitmap
  transform: ImageTransform
  px: number
  py: number
  pw: number
  ph: number
}

export function drawRoadColorPreview({
  ctx, bitmap, transform, px, py, pw, ph,
}: DrawRoadColorPreviewParams): void {
  const canvasScale = (transform.scaleFrac * pw) / bitmap.width
  const cx = px + pw / 2 + transform.translateX * pw
  const cy = py + ph / 2 + transform.translateY * ph
  const w = bitmap.width * canvasScale
  const h = bitmap.height * canvasScale

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((transform.rotation * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  ctx.restore()
}
