/**
 * Screen-only paint-mode overlays drawn on top of all cached layers.
 * Never called during export.
 */
import { TERRAIN_COLORS } from '../store/mapStore'

type PaintTarget =
  | { type: 'hex'; verts: [number, number][] }
  | { type: 'edge'; p1: [number, number]; p2: [number, number] }

export interface TerrainPaintOverlayParams {
  ctx: CanvasRenderingContext2D
  terrainPaintMode: boolean
  terrainPaintBrush: string
  strokeTrail: Map<string, PaintTarget>
  paintHoverTarget: PaintTarget | null
  terrainColors: Record<string, string>
  terrainBackgroundPaintEnabled: boolean
  bgPaintHold: boolean
  R: number
}

export function _drawTerrainPaintOverlay(p: TerrainPaintOverlayParams): void {
  const { ctx, terrainPaintMode, terrainPaintBrush, strokeTrail, paintHoverTarget,
    terrainColors, terrainBackgroundPaintEnabled, bgPaintHold, R } = p
  if (!terrainPaintMode) return

  const rawColor = terrainColors[terrainPaintBrush] ?? TERRAIN_COLORS[terrainPaintBrush] ?? '#888888'

  if (strokeTrail.size > 0) {
    ctx.save()
    for (const target of strokeTrail.values()) {
      if (target.type === 'hex') {
        ctx.globalAlpha = 0.35
        ctx.fillStyle = rawColor
        ctx.beginPath()
        const { verts } = target
        ctx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = rawColor
        ctx.lineWidth = R * 0.40
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(target.p1[0], target.p1[1])
        ctx.lineTo(target.p2[0], target.p2[1])
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  if (paintHoverTarget) {
    ctx.save()
    if (paintHoverTarget.type === 'hex') {
      const { verts } = paintHoverTarget
      const isBgMode = terrainBackgroundPaintEnabled || bgPaintHold
      if (isBgMode) {
        const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length
        const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length
        const inset = 0.82
        const iv = verts.map(v => [cx + (v[0] - cx) * inset, cy + (v[1] - cy) * inset] as [number, number])
        ctx.globalAlpha = 0.70
        ctx.strokeStyle = rawColor
        ctx.lineWidth = R * 0.10
        ctx.beginPath()
        ctx.moveTo(iv[0][0], iv[0][1])
        for (let i = 1; i < iv.length; i++) ctx.lineTo(iv[i][0], iv[i][1])
        ctx.closePath()
        ctx.stroke()
      } else {
        ctx.globalAlpha = 0.40
        ctx.fillStyle = rawColor
        ctx.beginPath()
        ctx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
        ctx.closePath()
        ctx.fill()
      }
    } else {
      ctx.globalAlpha = 0.70
      ctx.strokeStyle = rawColor
      ctx.lineWidth = R * 0.40
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(paintHoverTarget.p1[0], paintHoverTarget.p1[1])
      ctx.lineTo(paintHoverTarget.p2[0], paintHoverTarget.p2[1])
      ctx.stroke()
    }
    ctx.restore()
  }
}

export interface ElevationPaintOverlayParams {
  ctx: CanvasRenderingContext2D
  elevationPaintMode: boolean
  elevationPaintBrush: string
  strokeTrail: Map<string, PaintTarget>
  paintHoverTarget: PaintTarget | null
}

export function _drawElevationPaintOverlay(p: ElevationPaintOverlayParams): void {
  const { ctx, elevationPaintMode, elevationPaintBrush, strokeTrail, paintHoverTarget } = p
  if (!elevationPaintMode) return

  const brushColor: Record<string, string> = { flat: '#3a7a3a', hills: '#7a7a30', mountains: '#7a4a20' }
  const color = brushColor[elevationPaintBrush] ?? '#888888'

  if (strokeTrail.size > 0) {
    ctx.save()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.35
    for (const target of strokeTrail.values()) {
      if (target.type !== 'hex') continue
      const { verts } = target
      ctx.beginPath()
      ctx.moveTo(verts[0][0], verts[0][1])
      for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  if (paintHoverTarget?.type === 'hex') {
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = color
    ctx.beginPath()
    const { verts } = paintHoverTarget
    ctx.moveTo(verts[0][0], verts[0][1])
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
