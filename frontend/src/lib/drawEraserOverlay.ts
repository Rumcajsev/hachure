/** Screen-only overlay for the image-extraction eraser tool: highlights the
 *  currently hovered hex (or all hexes in an active drag stroke). Never called
 *  during export — erasure only affects classification, it has no rendered map output. */
import type { GeneratedHex } from '../store/mapStore'

const HOVER_FILL = '#cc4444'

export function drawImageEraserOverlay(
  ctx: CanvasRenderingContext2D,
  projected: { hex: GeneratedHex; verts: [number, number][] }[],
  erasedKeys: Set<string>,
  hoverTargets: { q: number; r: number; verts: [number, number][] }[] | null,
): void {
  if (!hoverTargets || hoverTargets.length === 0) return
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.fillStyle = HOVER_FILL
  for (const { verts } of hoverTargets) {
    ctx.beginPath()
    ctx.moveTo(verts[0][0], verts[0][1])
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}
