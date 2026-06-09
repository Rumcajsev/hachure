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
  /**
   * Pixel-density sampler: returns 0–1 fraction of non-background pixels in the
   * given CSS-coordinate bbox. When provided, replaces the point-obstacle heuristic
   * with actual rendered content. Omit for export paths.
   */
  pixelSampler?: (bx: number, by: number, bw: number, bh: number) => number
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
  labelOffsets, liveLabelOffset, labelBBoxOut, scale = 1, pixelSampler,
}: DrawSettlementsParams) {
  const placed = settlements.filter(s => s.included && s.hex_q !== null)

  // Project all road and rail chain segments for obstacle sampling and icon snapping.
  type Seg = { ax: number; ay: number; bx: number; by: number }
  const allSegs: Seg[] = []
  const obstaclePts: [number, number][] = []

  const sampleChain = (chain: [number, number][]) => {
    if (chain.length < 1) return
    let [scx, scy] = project(chain[0][0], chain[0][1])
    obstaclePts.push([scx, scy])
    for (let i = 1; i < chain.length; i++) {
      const [nx, ny] = project(chain[i][0], chain[i][1])
      allSegs.push({ ax: scx, ay: scy, bx: nx, by: ny })
      const segLen = Math.hypot(nx - scx, ny - scy)
      const steps = Math.max(1, Math.ceil(segLen / 6))
      for (let st = 1; st <= steps; st++) {
        const t = st / steps
        obstaclePts.push([scx + (nx - scx) * t, scy + (ny - scy) * t])
      }
      ;[scx, scy] = [nx, ny]
    }
  }
  for (const { chain } of roadChains) sampleChain(chain)
  for (const { chain } of railChains) sampleChain(chain)

  const scaledHexRadiusPx = hexRadiusPx * scale
  // Spatial grid for obstacle point queries — avoids O(n) scan per label candidate.
  const OBS_CELL = 24 * scale
  const obsGrid = new Map<number, number>()
  const obsKey = (gx: number, gy: number) => gx * 100003 + gy
  for (const [rx, ry] of obstaclePts) {
    const k = obsKey(Math.floor(rx / OBS_CELL), Math.floor(ry / OBS_CELL))
    obsGrid.set(k, (obsGrid.get(k) ?? 0) + 1)
  }
  const obsScore = (ex: number, ey: number, ew: number, eh: number): number => {
    let count = 0
    const gx0 = Math.floor(ex / OBS_CELL), gx1 = Math.floor((ex + ew) / OBS_CELL)
    const gy0 = Math.floor(ey / OBS_CELL), gy1 = Math.floor((ey + eh) / OBS_CELL)
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++)
        count += obsGrid.get(obsKey(gx, gy)) ?? 0
    return count
  }

  const placedBoxes: [number, number, number, number][] = []

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

    type Cand = { x: number; y: number; bx: number; by: number; align: CanvasTextAlign; base: CanvasTextBaseline; bias: number }
    const hw = tw / 2, hh = th / 2
    const cands: Cand[] = [
      { x: cx + gap, y: cy,       bx: cx + gap,      by: cy - hh,       align: 'left',   base: 'middle', bias: 0.0 },
      { x: cx + gap, y: cy - gap, bx: cx + gap,      by: cy - gap - th, align: 'left',   base: 'bottom', bias: 0.3 },
      { x: cx,       y: cy - gap, bx: cx - hw,       by: cy - gap - th, align: 'center', base: 'bottom', bias: 0.8 },
      { x: cx - gap, y: cy - gap, bx: cx - gap - tw, by: cy - gap - th, align: 'right',  base: 'bottom', bias: 1.5 },
      { x: cx - gap, y: cy,       bx: cx - gap - tw, by: cy - hh,       align: 'right',  base: 'middle', bias: 1.5 },
      { x: cx - gap, y: cy + gap, bx: cx - gap - tw, by: cy + gap,      align: 'right',  base: 'top',    bias: 1.5 },
      { x: cx,       y: cy + gap, bx: cx - hw,       by: cy + gap,      align: 'center', base: 'top',    bias: 0.8 },
      { x: cx + gap, y: cy + gap, bx: cx + gap,      by: cy + gap,      align: 'left',   base: 'top',    bias: 0.3 },
    ]

    const pad = 3 * scale
    let bestScore = Infinity
    let best = cands[0]
    for (const c of cands) {
      const ex = c.bx - pad, ey = c.by - pad, ew = tw + pad * 2, eh = th + pad * 2
      // Pixel-density scoring: fraction of non-background pixels (0–1) in the candidate
      // region, sampled from the already-rendered canvas. Falls back to point-obstacle
      // grid when no sampler is provided (export path, or first-frame).
      const density = pixelSampler ? pixelSampler(ex, ey, ew, eh) : obsScore(ex, ey, ew, eh) / 20
      let score = c.bias * 0.4 + density * 5
      for (const [plx, ply, plw, plh] of placedBoxes) {
        if (ex < plx + plw && ex + ew > plx && ey < ply + plh && ey + eh > ply) score += 8
      }
      if (score < bestScore) { bestScore = score; best = c }
    }

    // Apply manual offset (live drag takes precedence over persisted offset)
    const oid = `settlement:${s.name}`
    const off = liveLabelOffset?.id === oid ? liveLabelOffset : labelOffsets?.[oid]
    const odx = off?.dx ?? 0
    const ody = off?.dy ?? 0

    placedBoxes.push([best.bx, best.by, tw, th])

    if (labelBBoxOut) {
      labelBBoxOut[oid] = {
        cx: best.bx + tw / 2 + odx,
        cy: best.by + th / 2 + ody,
        hw: tw / 2 + 3,
        hh: th / 2 + 3,
        angle: 0,
      }
    }

    sCtx.fillStyle = resolved.color
    sCtx.font = font
    sCtx.textAlign = best.align
    sCtx.textBaseline = best.base
    if (resolved.letterSpacing > 0) {
      sCtx.save()
      ;(sCtx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${resolved.letterSpacing}em`
    }
    sCtx.fillText(label, best.x + odx, best.y + ody)
    if (resolved.letterSpacing > 0) sCtx.restore()
  }
}
