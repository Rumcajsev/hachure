/** Point-to-point town icon + label rendering. Pure canvas — no React or store imports.
 *
 *  Unlike drawSettlements.ts, there's no hex-snapping step: a town's position already
 *  is where its roads meet, so there's nothing to search for. Kept as its own small
 *  file rather than forcing reuse of drawSettlements' hex-coupled core.
 */

import type { P2pTown, P2pTownTier } from '../store/slices/p2pNetworkSlice'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface P2pTownTierStyle {
  radiusPx: number
  fillColor: string
  strokeColor: string
  strokeWidth: number
  fontPx: number
  labelColor: string
}

export interface DrawP2pTownsParams {
  towns: P2pTown[]
  tierStyles: Record<P2pTownTier, P2pTownTierStyle>
  supplyColor: string
  project: (lon: number, lat: number) => [number, number]
}

export function drawP2pTowns(ctx: Ctx, { towns, tierStyles, supplyColor, project }: DrawP2pTownsParams): void {
  for (const t of towns) {
    const [cx, cy] = project(t.lon, t.lat)

    if (t.kind === 'filler') {
      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fillStyle = '#f3e9c6'
      ctx.fill()
      ctx.strokeStyle = '#777'
      ctx.lineWidth = 0.6
      ctx.stroke()
      continue
    }

    const ts = tierStyles[t.tier]
    const r = ts.radiusPx

    if (t.supply) {
      // 10-point star, same construction as the reference prototype.
      ctx.beginPath()
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        const rr = k % 2 ? r * 0.45 : r
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = supplyColor
      ctx.fill()
      ctx.strokeStyle = ts.strokeColor
      ctx.lineWidth = ts.strokeWidth
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = ts.fillColor
      ctx.fill()
      if (ts.strokeWidth > 0) {
        ctx.strokeStyle = ts.strokeColor
        ctx.lineWidth = ts.strokeWidth
        ctx.stroke()
      }
    }

    if (!t.name) continue
    ctx.font = `${ts.fontPx}px Georgia, serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = ts.labelColor
    ctx.strokeStyle = '#f3e9c6'
    ctx.lineWidth = ts.fontPx * 0.3
    ctx.lineJoin = 'round'
    const lx = cx + r + 3
    ctx.strokeText(t.name, lx, cy)
    ctx.fillText(t.name, lx, cy)
  }
}

export const DEFAULT_P2P_TOWN_TIER_STYLES: Record<P2pTownTier, P2pTownTierStyle> = {
  0: { radiusPx: 3, fillColor: '#ffffff', strokeColor: '#a33', strokeWidth: 0.8, fontPx: 9, labelColor: '#3a2a1a' },
  1: { radiusPx: 4.5, fillColor: '#ffffff', strokeColor: '#a33', strokeWidth: 1, fontPx: 10, labelColor: '#3a2a1a' },
  2: { radiusPx: 6, fillColor: '#ffffff', strokeColor: '#a33', strokeWidth: 1.2, fontPx: 12, labelColor: '#3a2a1a' },
}
