/** Settlement icons and label placement rendering. Pure canvas — no React or store imports. */

import type { Settlement, SettlementTierStyle, LabelBBox } from '../store/mapStore'
import type { LabelSpec } from './labelPresets'
import { specToFont } from './labelPresets'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type SettlementTier = 1 | 2 | 3 | 4

export type DrawSettlementsParams = {
  settlements: Settlement[]
  tierStyles: Record<SettlementTier, SettlementTierStyle>
  labelSpecs: {
    cityMajor: LabelSpec
    cityMinor: LabelSpec
    town: LabelSpec
    village: LabelSpec
  }
  roadChains: { chain: [number, number][] }[]
  railChains: { chain: [number, number][] }[]
  roadJunctions?: { pos: [number, number] }[]
  project: (lon: number, lat: number) => [number, number]
  hexCenterOf: (q: number, r: number) => [number, number] | null
  hexRadiusPx: number
  labelOffsets?: Record<string, { dx: number; dy: number }>
  liveLabelOffset?: { id: string; dx: number; dy: number }
  labelBBoxOut?: Record<string, LabelBBox>
  /** Scale factor for all pixel-based sizes — use lineScale during PDF export. */
  scale?: number
  /** When set, this settlement's label is skipped — used when an overlay draws it separately. */
  excludeLabelId?: string
}

function closestPointOnSegment(
  ax: number, ay: number, bx: number, by: number,
  px: number, py: number
): [number, number] {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return [ax, ay]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return [ax + t * dx, ay + t * dy]
}

export function drawSettlements(sCtx: Ctx, {
  settlements, tierStyles, labelSpecs, roadChains, railChains, roadJunctions, project, hexCenterOf, hexRadiusPx,
  labelOffsets, liveLabelOffset, labelBBoxOut, scale = 1, excludeLabelId,
}: DrawSettlementsParams) {
  const placed = settlements.filter(s => s.included && s.hex_q !== null)

  // Project road and rail chain segments — used for icon snapping only.
  type Seg = { ax: number; ay: number; bx: number; by: number }
  const allSegs: Seg[] = []

  const sampleChain = (chain: [number, number][]) => {
    if (chain.length < 2) return
    let [scx, scy] = project(chain[0][0], chain[0][1])
    for (let i = 1; i < chain.length; i++) {
      const [nx, ny] = project(chain[i][0], chain[i][1])
      allSegs.push({ ax: scx, ay: scy, bx: nx, by: ny })
      ;[scx, scy] = [nx, ny]
    }
  }
  for (const { chain } of roadChains) sampleChain(chain)
  for (const { chain } of railChains) sampleChain(chain)

  const scaledHexRadiusPx = hexRadiusPx * scale

  for (const s of placed) {
    const center = hexCenterOf(s.hex_q!, s.hex_r)
    if (!center) continue
    const [hx, hy] = center

    // Snap icon to closest road/rail point within the hex.
    // Junction positions are preferred — check them first, then fall back to segment snap.
    let cx = hx, cy = hy
    if (scaledHexRadiusPx > 0) {
      let bestDist = scaledHexRadiusPx
      if (roadJunctions) {
        for (const { pos } of roadJunctions) {
          const [jx, jy] = project(pos[0], pos[1])
          const d = Math.hypot(jx - hx, jy - hy)
          if (d < bestDist) { bestDist = d; cx = jx; cy = jy }
        }
      }
      // Only fall back to segment snap if no junction claimed the icon.
      if (cx === hx && cy === hy) {
        for (const { ax, ay, bx, by } of allSegs) {
          const [px, py] = closestPointOnSegment(ax, ay, bx, by, hx, hy)
          const d = Math.hypot(px - hx, py - hy)
          if (d < bestDist) { bestDist = d; cx = px; cy = py }
        }
      }
    }
    const tier = (s.tier ?? (s.type === 'city' ? 1 : s.type === 'town' ? 3 : 4)) as SettlementTier
    const ts = tierStyles[tier]
    const r = ts.size * scale

    if (ts.displayMode === 'icon') {
      sCtx.fillStyle = ts.fillColor
      sCtx.strokeStyle = ts.strokeColor
      sCtx.lineWidth = ts.strokeWidth * scale
      sCtx.beginPath()
      if (ts.shape === 'circle') {
        sCtx.arc(cx, cy, r, 0, Math.PI * 2)
      } else {
        sCtx.rect(cx - r, cy - r, r * 2, r * 2)
      }
      sCtx.fill()
      if (ts.strokeWidth > 0) sCtx.stroke()
    }

    const tierSpecKey = tier === 1 ? 'cityMajor' : tier === 2 ? 'cityMinor' : tier === 3 ? 'town' : 'village'
    const baseSpec = labelSpecs[tierSpecKey as keyof typeof labelSpecs]
    const resolved: LabelSpec = s.labelOverride ? { ...baseSpec, ...s.labelOverride } : baseSpec
    const basePx = r * 1.8
    const font = specToFont(resolved, basePx)
    sCtx.font = font
    const label = resolved.uppercase ? s.name.toUpperCase() : s.name
    const tw = sCtx.measureText(label).width
    const th = basePx

    const gap = (ts.displayMode === 'icon' ? r : 0) + 3 * scale

    // Manual offset takes precedence — stored as delta from the icon centre (cx, cy).
    const oid = `settlement:${s.name}`
    if (excludeLabelId === oid) continue
    const off = liveLabelOffset?.id === oid ? liveLabelOffset : labelOffsets?.[oid]

    let tx: number, ty: number, tAlign: CanvasTextAlign, tBase: CanvasTextBaseline
    if (off) {
      // Absolute manual position: centre the label at (cx + dx, cy + dy).
      tx = cx + off.dx
      ty = cy + off.dy
      tAlign = 'center'
      tBase = 'middle'
      const isLive = liveLabelOffset?.id === oid
      if (labelBBoxOut) labelBBoxOut[oid] = { cx: tx, cy: ty, hw: tw / 2 + 3, hh: th / 2 + 3, angle: 0, iconCx: cx, iconCy: cy }
      if (isLive) {
        // Exclude live-dragged label from bbox tracking so other labels don't shift.
      }
    } else {
      // Fixed placement: label to the right of the icon, vertically centred.
      tx = cx + gap
      ty = cy
      tAlign = 'left'
      tBase = 'middle'
      if (labelBBoxOut) labelBBoxOut[oid] = { cx: tx + tw / 2, cy: ty, hw: tw / 2 + 3, hh: th / 2 + 3, angle: 0, iconCx: cx, iconCy: cy }
    }

    sCtx.fillStyle = resolved.color
    sCtx.font = font
    sCtx.textAlign = tAlign
    sCtx.textBaseline = tBase
    if (resolved.letterSpacing > 0) {
      sCtx.save()
      ;(sCtx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${resolved.letterSpacing}em`
    }
    if (resolved.strokeWidth && resolved.strokeWidth > 0) {
      sCtx.strokeStyle = resolved.strokeColor ?? '#ffffff'
      sCtx.lineWidth = resolved.strokeWidth * scale
      sCtx.lineJoin = 'round'
      sCtx.strokeText(label, tx, ty)
    }
    sCtx.fillText(label, tx, ty)
    if (resolved.letterSpacing > 0) sCtx.restore()
  }
}
