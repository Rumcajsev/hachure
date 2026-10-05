/** Canvas rendering for townLayout.ts's output: houses and internally-generated
 *  lanes, positioned relative to a town center already projected to canvas px.
 *  Pure canvas — no React or store imports except types. */

import type { TownLayoutResult } from './townLayout'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface TownLayoutStyle {
  houseColors: [string, string, string]
  houseStrokeColor: string
  houseStrokeWidth: number
  laneCasingColor: string
  laneCasingWidth: number
  laneFillColor: string
  laneFillWidth: number
}

export const DEFAULT_TOWN_LAYOUT_STYLE: TownLayoutStyle = {
  houseColors: ['#b5593a', '#c0653f', '#a95336'],
  houseStrokeColor: '#3a2a1a',
  houseStrokeWidth: 0,
  laneCasingColor: '#5a3a2c',
  laneCasingWidth: 1.8,
  laneFillColor: '#d6a36a',
  laneFillWidth: 0.9,
}

/** cx, cy = town center in canvas px. pxPerUnit = canvas px per townLayout local unit. */
export function drawTownLayout(
  ctx: Ctx, cx: number, cy: number, pxPerUnit: number,
  result: TownLayoutResult, style: TownLayoutStyle = DEFAULT_TOWN_LAYOUT_STYLE,
): void {
  const strokeLane = (color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const lane of result.lanes) {
      if (lane.pts.length < 2) continue
      ctx.beginPath()
      lane.pts.forEach(([x, y], i) => {
        const px = cx + x * pxPerUnit, py = cy + y * pxPerUnit
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }
  }
  strokeLane(style.laneCasingColor, style.laneCasingWidth)
  strokeLane(style.laneFillColor, style.laneFillWidth)

  for (const h of result.houses) {
    const bw = h.length * pxPerUnit, bh = h.width * pxPerUnit
    ctx.save()
    ctx.translate(cx + h.x * pxPerUnit, cy + h.y * pxPerUnit)
    ctx.rotate(h.angle)
    ctx.fillStyle = style.houseColors[h.variant]
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
    if (style.houseStrokeWidth > 0) {
      ctx.strokeStyle = style.houseStrokeColor
      ctx.lineWidth = style.houseStrokeWidth
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh)
    }
    ctx.restore()
  }
}
