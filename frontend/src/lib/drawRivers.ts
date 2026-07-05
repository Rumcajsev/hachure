/** River layer rendering. Pure canvas operations — no React or store imports. */

import type { RiverStyleConfig, RiverTierStyle, LabelBBox } from '../store/mapStore'
import { DEFAULT_STROKE_EFFECT } from '../store/mapStore'
import { riverSmooth, applyWobble, drawVariableWidthStroke } from './riverChains'
import { dashArray } from './strokeEffect'
import type { LabelSpec } from './labelPresets'
import { specToFont } from './labelPresets'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type SegProps = Record<string, { width?: number }>
type HopProps = { wiggleAmp?: number; wiggleFreq?: number; width?: number }

export type ChainEntry = {
  vertices: [number, number][]
  segKey: string
  hopKeys?: string[]
  hopRanges?: [number, number][]
  leafAtStart?: boolean
  leafAtEnd?: boolean
}

export type RiverLabelEntry = { name: string; coords: [number, number][] }

export type DrawRiversParams = {
  riverTierChainData: [ChainEntry[], ChainEntry[], ChainEntry[]]
  riverHopProps?: Record<string, HopProps>
  selectedHopKey?: string | null
  riverTaperSegments?: number
  riverSegProps: SegProps
  riverTierStyles: [RiverTierStyle, RiverTierStyle, RiverTierStyle]
  riverStyle?: RiverStyleConfig   // legacy fallback
  selectedRiverKeys: Set<string>
  riverBaseHW: number   // base half-width before tier widthScale is applied
  lakeProjCenters: { px: number; py: number }[]
  smoothPasses: number
  wobbleBroad: number
  wobbleDetail: number
  R: number
  project: (lon: number, lat: number) => [number, number]
  showRiverLabels?: boolean
  riverLabelData?: RiverLabelEntry[]
  waterLabelSpec?: LabelSpec
  labelOffsets?: Record<string, { dx: number; dy: number }>
  liveLabelOffset?: { id: string; dx: number; dy: number }
  labelBBoxOut?: Record<string, LabelBBox>
  excludeLabelId?: string
}

function segHalfWidth(segProps: SegProps, baseHW: number, segKey: string): number {
  const p = segProps[segKey]
  return p?.width !== undefined ? 1.4 * p.width : baseHW
}

function buildWidthMultipliers(
  pts: [number, number][],
  hopKeys: string[] | undefined,
  hopRanges: [number, number][] | undefined,
  hopProps: Record<string, HopProps> | undefined,
  leafAtStart: boolean,
  leafAtEnd: boolean,
  taperLen: number,
): number[] | undefined {
  const hasTaper = taperLen > 0 && leafAtStart
  const hasHopWidth = hopKeys && hopRanges && hopProps &&
    hopKeys.some(k => hopProps[k]?.width !== undefined)
  if (!hasTaper && !hasHopWidth) return undefined

  const dist = [0]
  for (let i = 1; i < pts.length; i++)
    dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const totalLen = dist[dist.length - 1]

  const mults = new Array(pts.length).fill(1)

  if (hasTaper) {
    for (let i = 0; i < pts.length; i++) {
      mults[i] = leafAtStart ? Math.max(0, Math.min(1, dist[i] / taperLen)) : 1
    }
  }

  if (hasHopWidth && hopKeys && hopRanges && hopProps) {
    for (let h = 0; h < hopKeys.length; h++) {
      const hp = hopProps[hopKeys[h]]
      if (!hp?.width) continue
      const [s, e] = hopRanges[h]
      for (let i = s; i <= e; i++) mults[i] *= hp.width
    }
  }

  return mults
}

function drawRiverLayer(
  rCtx: Ctx,
  chainData: ChainEntry[],
  segProps: SegProps,
  style: { color: string; effect?: RiverTierStyle['effect'] },
  selectedKeys: Set<string>,
  selectedHopKey: string | null | undefined,
  baseHW: number,
  drawMouths: boolean,
  lakeProjCenters: { px: number; py: number }[],
  R: number,
  smoothPasses: number,
  wobbleBroad: number,
  wobbleDetail: number,
  hopProps: Record<string, HopProps> | undefined,
  taperLen: number,
  project: (lon: number, lat: number) => [number, number],
) {
  const projected = chainData
    .filter(({ vertices }) => vertices.length >= 2)
    .map(({ vertices, segKey, hopKeys, hopRanges, leafAtStart = false, leafAtEnd = false }) => {
      let pts = vertices.map(([lon, lat]) => project(lon, lat)) as [number, number][]
      if (smoothPasses > 0) pts = riverSmooth(pts, smoothPasses)
      if (wobbleBroad > 0 || wobbleDetail > 0) pts = applyWobble(pts, wobbleBroad, wobbleDetail, R, segKey)
      const hw = segHalfWidth(segProps, baseHW, segKey)
      const widthMults = buildWidthMultipliers(pts, hopKeys, hopRanges, hopProps, leafAtStart, leafAtEnd, taperLen)
      return { pts, segKey, hw, hopKeys, hopRanges, widthMults }
    })

  const effect = style.effect ?? DEFAULT_STROKE_EFFECT

  // Pass 1: outline
  if (effect.outlineEnabled) {
    for (const { pts, segKey, hw, widthMults } of projected) {
      if (selectedKeys.has(segKey)) continue
      const ow = effect.outlineWidth
      rCtx.save()
      rCtx.setLineDash(dashArray(effect.outlineDash, hw + ow))
      drawVariableWidthStroke(rCtx, pts, hw + ow, hw + ow, effect.outlineColor, widthMults)
      rCtx.setLineDash([])
      rCtx.restore()
    }
  }

  // Pass 2: fill
  for (const { pts, segKey, hw, widthMults } of projected) {
    if (selectedKeys.has(segKey)) continue
    rCtx.save()
    rCtx.setLineDash(dashArray(effect.fillDash, hw))
    drawVariableWidthStroke(rCtx, pts, hw, hw, style.color, widthMults)
    rCtx.setLineDash([])
    rCtx.restore()
  }

  // Pass 3: selected chains — outline → fill → selection glow → fill
  for (const { pts, segKey, hw, hopKeys, hopRanges, widthMults } of projected) {
    if (!selectedKeys.has(segKey)) continue
    if (effect.outlineEnabled) {
      const ow = effect.outlineWidth
      drawVariableWidthStroke(rCtx, pts, hw + ow, hw + ow, effect.outlineColor, widthMults)
    }
    drawVariableWidthStroke(rCtx, pts, hw, hw, style.color, widthMults)
    drawVariableWidthStroke(rCtx, pts, hw + 3, hw + 3, 'rgba(100,180,255,0.35)', widthMults)
    drawVariableWidthStroke(rCtx, pts, hw, hw, style.color, widthMults)

    // Highlight selected hop within this chain
    if (selectedHopKey && hopKeys && hopRanges) {
      const hi = hopKeys.indexOf(selectedHopKey)
      if (hi >= 0) {
        const [s, e] = hopRanges[hi]
        const hopPts = pts.slice(s, e + 1)
        const hopMults = widthMults?.slice(s, e + 1)

        // Dim the non-selected portions so the hop stands out
        rCtx.save()
        rCtx.globalAlpha = 0.55
        if (s > 0)
          drawVariableWidthStroke(rCtx, pts.slice(0, s + 1), hw, hw, '#08101a', widthMults?.slice(0, s + 1))
        if (e < pts.length - 1)
          drawVariableWidthStroke(rCtx, pts.slice(e), hw, hw, '#08101a', widthMults?.slice(e))
        rCtx.restore()

        // Thin amber border, then hop fill — both use hopMults so they reflect current edits
        drawVariableWidthStroke(rCtx, hopPts, hw + 1.5, hw + 1.5, 'rgba(255,200,50,0.9)', hopMults)
        drawVariableWidthStroke(rCtx, hopPts, hw, hw, style.color, hopMults)

        // Boundary dots at hop endpoints
        rCtx.save()
        rCtx.fillStyle = 'rgba(255,200,50,0.9)'
        for (const [bx, by] of [hopPts[0], hopPts[hopPts.length - 1]] as [number, number][]) {
          rCtx.beginPath(); rCtx.arc(bx, by, 3, 0, Math.PI * 2); rCtx.fill()
        }
        rCtx.restore()
      }
    }
  }

  if (drawMouths) {
    const drawnEntryKeys = new Set<string>()
    for (const { pts: pxPts } of projected) {
      const check = (endPt: [number, number]) => {
        const [ex, ey] = endPt
        for (const { px: lpx, py: lpy } of lakeProjCenters) {
          if (Math.hypot(ex - lpx, ey - lpy) < R * 1.1) {
            const k = `${Math.round(ex * 10)},${Math.round(ey * 10)}`
            if (drawnEntryKeys.has(k)) break
            drawnEntryKeys.add(k)
            const dx = lpx - ex, dy = lpy - ey, len = Math.hypot(dx, dy)
            const flareLen = Math.min(len * 0.45, R * 0.45)
            rCtx.save(); rCtx.lineCap = 'round'
            rCtx.lineWidth = R * 0.22; rCtx.strokeStyle = style.color
            rCtx.beginPath(); rCtx.moveTo(ex, ey)
            rCtx.lineTo(ex + dx / len * flareLen, ey + dy / len * flareLen); rCtx.stroke()
            rCtx.restore(); break
          }
        }
      }
      check(pxPts[0]); check(pxPts[pxPts.length - 1])
    }
  }
}

function drawRiverLabels(
  rCtx: Ctx,
  labelData: RiverLabelEntry[],
  spec: LabelSpec,
  project: (lon: number, lat: number) => [number, number],
  labelOffsets?: Record<string, { dx: number; dy: number }>,
  liveLabelOffset?: { id: string; dx: number; dy: number },
  labelBBoxOut?: Record<string, LabelBBox>,
  excludeLabelId?: string,
) {
  const basePx = 9
  rCtx.save()
  rCtx.font = specToFont(spec, basePx)
  rCtx.textAlign = 'center'
  rCtx.textBaseline = 'middle'

  const seen = new Set<string>()

  for (const { name, coords } of labelData) {
    if (!name || seen.has(name)) continue
    if (excludeLabelId && `river:${name}` === excludeLabelId) continue

    const pts = coords.map(([lon, lat]) => project(lon, lat))
    if (pts.length < 2) continue

    // Total arc length
    let totalLen = 0
    const segLens: number[] = []
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      segLens.push(d)
      totalLen += d
    }

    const tw = rCtx.measureText(name).width
    if (totalLen < tw * 1.5) continue  // chain too short to label

    // Anchor at arc midpoint
    let target = totalLen * 0.5
    let ax = pts[0][0], ay = pts[0][1]
    for (let i = 0; i < segLens.length; i++) {
      if (target <= segLens[i]) {
        const t = target / segLens[i]
        ax = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t
        ay = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
        break
      }
      target -= segLens[i]
    }

    // Average tangent over middle third
    const lo = totalLen * 0.33, hi = totalLen * 0.66
    let sumX = 0, sumY = 0, acc = 0
    for (let i = 0; i < segLens.length; i++) {
      const s = acc, e = acc + segLens[i]
      if (e > lo && s < hi) {
        const odx = pts[i + 1][0] - pts[i][0]
        const ody = pts[i + 1][1] - pts[i][1]
        const w = Math.min(e, hi) - Math.max(s, lo)
        sumX += odx * w; sumY += ody * w
      }
      acc = e
    }
    let angle = Math.atan2(sumY, sumX)
    // Keep text readable — flip if pointing left
    if (angle < -Math.PI / 2 || angle > Math.PI / 2) angle += Math.PI

    const label = spec.uppercase ? name.toUpperCase() : name
    seen.add(name)

    // Apply manual offset (live drag takes precedence over persisted offset)
    const oid = `river:${name}`
    const off = liveLabelOffset?.id === oid ? liveLabelOffset : labelOffsets?.[oid]
    const fx = ax + (off?.dx ?? 0)
    const fy = ay + (off?.dy ?? 0)

    if (labelBBoxOut) {
      labelBBoxOut[oid] = { cx: fx, cy: fy, hw: tw / 2 + 3, hh: basePx / 2 + 3, angle }
    }

    rCtx.save()
    rCtx.translate(fx, fy)
    rCtx.rotate(angle)
    const strokeW = spec.strokeWidth ?? 0
    if (strokeW > 0) {
      rCtx.strokeStyle = spec.strokeColor ?? 'rgba(255,255,255,0.7)'
      rCtx.lineWidth = strokeW
      rCtx.lineJoin = 'round'
      rCtx.strokeText(label, 0, 0)
    } else {
      rCtx.strokeStyle = 'rgba(255,255,255,0.7)'
      rCtx.lineWidth = 2.5
      rCtx.strokeText(label, 0, 0)
    }
    rCtx.fillStyle = spec.color
    rCtx.fillText(label, 0, 0)
    rCtx.restore()
  }

  rCtx.restore()
}

export function drawRivers(rCtx: Ctx, params: DrawRiversParams) {
  const {
    riverTierChainData,
    riverSegProps,
    riverTierStyles, riverStyle,
    selectedRiverKeys,
    riverBaseHW,
    riverTaperSegments,
    lakeProjCenters, smoothPasses, wobbleBroad, wobbleDetail, R,
    riverHopProps, selectedHopKey,
    project,
    showRiverLabels, riverLabelData, waterLabelSpec,
    labelOffsets, liveLabelOffset, labelBBoxOut, excludeLabelId,
  } = params

  const taperLen = (riverTaperSegments ?? 0) * R

  // Draw river tiers back-to-front: stream (2) → river (1) → major (0)
  for (const tier of [2, 1, 0] as const) {
    const tierStyle = riverTierStyles?.[tier] ?? riverStyle ?? { color: '#5888b0' }
    if ((tierStyle as RiverTierStyle).visible === false) continue
    const tierBaseHW = riverBaseHW * ((tierStyle as RiverTierStyle).widthScale ?? 1)

    drawRiverLayer(rCtx, riverTierChainData[tier], riverSegProps, tierStyle, selectedRiverKeys,
      selectedHopKey, tierBaseHW, tier === 0, lakeProjCenters, R, smoothPasses, wobbleBroad, wobbleDetail, riverHopProps, taperLen, project)
  }

  if (showRiverLabels && riverLabelData && riverLabelData.length > 0 && waterLabelSpec) {
    drawRiverLabels(rCtx, riverLabelData, waterLabelSpec, project, labelOffsets, liveLabelOffset, labelBBoxOut, excludeLabelId)
  }
}
