/** Slope-edge (escarpment) rendering — hachure tick marks on the downhill side. */

import { parseEdgeBlobKey, sharedEdgeVertices } from './edgeBlobs'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type SlopeHoverTarget = {
  edgeKey: string
  p1: [number, number]
  p2: [number, number]
  highHexKey: string
  lowCenter: [number, number]
} | null

function drawHachures(
  ctx: Ctx,
  p1: [number, number],
  p2: [number, number],
  lowCenter: [number, number],
  R: number,
  alpha: number,
  color: string,
): void {
  const tickLen = R * 0.22
  const edgeDx = p2[0] - p1[0], edgeDy = p2[1] - p1[1]
  const edgeLen = Math.hypot(edgeDx, edgeDy)
  if (edgeLen < 1) return

  // Unit perpendicular pointing toward low hex center
  const midX = (p1[0] + p2[0]) / 2, midY = (p1[1] + p2[1]) / 2
  const toLowX = lowCenter[0] - midX, toLowY = lowCenter[1] - midY
  const toLowLen = Math.hypot(toLowX, toLowY)
  if (toLowLen < 1) return
  const perpX = toLowX / toLowLen, perpY = toLowY / toLowLen

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = R * 0.045
  ctx.lineCap = 'round'
  ctx.beginPath()

  const TICKS = 3
  for (let i = 0; i < TICKS; i++) {
    const t = (i + 1) / (TICKS + 1)
    const ox = p1[0] + edgeDx * t
    const oy = p1[1] + edgeDy * t
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + perpX * tickLen, oy + perpY * tickLen)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawSlopes(
  ctx: Ctx,
  slopeEdges: Record<string, string>,
  hexVertMap: Map<string, [number, number][]>,
  R: number,
  color = '#5a4a3a',
): void {
  for (const [edgeKey, highHexKey] of Object.entries(slopeEdges)) {
    const { q1, r1, q2, r2 } = parseEdgeBlobKey(edgeKey)
    const isHigh1 = `${q1},${r1}` === highHexKey
    const lowQ = isHigh1 ? q2 : q1, lowR = isHigh1 ? r2 : r1

    const shared = sharedEdgeVertices(q1, r1, q2, r2, hexVertMap)
    if (!shared) continue
    const lowVerts = hexVertMap.get(`${lowQ},${lowR}`)
    if (!lowVerts) continue
    const lowCenter: [number, number] = [
      lowVerts.reduce((s, v) => s + v[0], 0) / lowVerts.length,
      lowVerts.reduce((s, v) => s + v[1], 0) / lowVerts.length,
    ]
    drawHachures(ctx, shared[0], shared[1], lowCenter, R, 0.85, color)
  }
}

export function drawSlopeHover(
  ctx: Ctx,
  hover: SlopeHoverTarget,
  R: number,
  color = '#5a4a3a',
): void {
  if (!hover) return
  drawHachures(ctx, hover.p1, hover.p2, hover.lowCenter, R, 0.45, color)
}
