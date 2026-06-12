/** Road and rail layer rendering. Pure canvas operations — no React or store imports. */

import type { RoadTierStyle, RailStyle, RoadDashStyle } from '../store/mapStore'
import { DEFAULT_STROKE_EFFECT } from '../store/mapStore'
import { offsetPolyline } from './geometry'
import { dashArray, drawLineGlow } from './strokeEffect'

function dashPattern(style: RoadDashStyle, w: number): number[] {
  if (style === 'dashed') return [w * 2.5, w * 1.5]
  if (style === 'dotted') return [w * 0.5, w * 1.5]
  return []
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type DrawRoadsRailsParams = {
  roadChains: { tier: 0 | 1 | 2; chain: [number, number][] }[]
  junctions: { pos: [number, number]; tier: 0 | 1 | 2 }[]
  railChains: { chain: [number, number][]; baseChain?: [number, number][]; id?: string; isShared: boolean; isLoop: boolean; hopKeys?: string[]; hopRanges?: [number, number][] }[]
  tierStyles: [RoadTierStyle, RoadTierStyle, RoadTierStyle]
  railStyle: RailStyle
  project: (lon: number, lat: number) => [number, number]
}

export function drawRoadsAndRails(rCtx: Ctx, {
  roadChains, junctions, railChains, tierStyles, railStyle, project,
}: DrawRoadsRailsParams) {
  rCtx.save()
  const drawChain = (chain: [number, number][]) => {
    const pts = chain.map(([lon, lat]) => project(lon, lat))
    if (pts.length < 2) return
    rCtx.beginPath()
    rCtx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) rCtx.lineTo(pts[i][0], pts[i][1])
    rCtx.stroke()
  }

  if (roadChains.length > 0) {
    const chainsByTier: [[number,number][][], [number,number][][], [number,number][][]] = [[], [], []]
    for (const { tier, chain } of roadChains) chainsByTier[tier].push(chain)

    // Pass 0: outer glow per tier (behind everything)
    for (const tier of [2, 1, 0] as const) {
      const s = tierStyles[tier]
      if (!s.effect?.glowEnabled) continue
      for (const chain of chainsByTier[tier]) {
        const pts = chain.map(([lon, lat]) => project(lon, lat)) as [number, number][]
        if (pts.length < 2) continue
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
        const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
        drawLineGlow(rCtx, s.effect, s.outerW / 2, bounds, (ctx, halfW, color) => {
          ctx.lineJoin = 'round'; ctx.lineCap = 'round'
          ctx.strokeStyle = color; ctx.lineWidth = halfW * 2
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
          ctx.stroke()
        })
      }
    }

    // Pass 1: casing (outline) — skipped if effect.outlineEnabled is explicitly false
    rCtx.lineJoin = 'round'
    for (const tier of [2, 1, 0] as const) {
      const s = tierStyles[tier]
      const fx = s.effect ?? DEFAULT_STROKE_EFFECT
      if (fx.outlineEnabled === false) continue
      const outlineDash = fx.outlineDash ?? s.caseDash
      rCtx.lineCap = outlineDash === 'dashed' || outlineDash === 'dotted' ? 'butt' : 'round'
      rCtx.strokeStyle = s.outer
      rCtx.lineWidth = s.outerW
      rCtx.setLineDash(dashArray(outlineDash, s.outerW))
      for (const chain of chainsByTier[tier]) drawChain(chain)
    }
    rCtx.setLineDash([])
    rCtx.lineCap = 'round'
    for (const { pos, tier } of junctions) {
      const [x, y] = project(pos[0], pos[1])
      const s = tierStyles[tier]
      const fx = s.effect ?? DEFAULT_STROKE_EFFECT
      if (fx.outlineEnabled === false) continue
      rCtx.beginPath(); rCtx.arc(x, y, s.outerW / 2, 0, Math.PI * 2)
      rCtx.fillStyle = s.outer; rCtx.fill()
    }
    for (const tier of [2, 1, 0] as const) {
      const s = tierStyles[tier]
      const fillDash = (s.effect ?? DEFAULT_STROKE_EFFECT).fillDash ?? s.fillDash
      rCtx.lineCap = fillDash === 'dashed' || fillDash === 'dotted' ? 'butt' : 'round'
      rCtx.strokeStyle = s.inner
      rCtx.lineWidth = s.outerW * 0.5
      rCtx.setLineDash(dashArray(fillDash, s.outerW * 0.5))
      for (const chain of chainsByTier[tier]) drawChain(chain)
    }
    rCtx.setLineDash([])
    rCtx.lineCap = 'round'
    for (const { pos, tier } of junctions) {
      const [x, y] = project(pos[0], pos[1])
      const s = tierStyles[tier]
      rCtx.beginPath(); rCtx.arc(x, y, s.outerW * 0.25, 0, Math.PI * 2)
      rCtx.fillStyle = s.inner; rCtx.fill()
    }
  }

  if (railChains.length > 0) {
    const RAIL_OFFSET_PX = 5
    const geoKey = (p: [number, number]) => `${p[0]},${p[1]}`

    const sharedOffsetEnds = new Map<string, [number, number]>()
    for (const { chain, isShared } of railChains) {
      if (!isShared || chain.length < 2) continue
      const rawPts = chain.map(([lon, lat]) => project(lon, lat)) as [number, number][]
      const full = offsetPolyline(rawPts, RAIL_OFFSET_PX)
      sharedOffsetEnds.set(geoKey(chain[0] as [number, number]), full[0])
      sharedOffsetEnds.set(geoKey(chain[chain.length - 1] as [number, number]), full[full.length - 1])
    }

    const rs = railStyle

    const drawRailPts = (pts: [number, number][], isLoop: boolean) => {
      if (pts.length < 2) return
      if (rs.railStyle === 'cross') {
        rCtx.lineCap = 'round'; rCtx.lineJoin = 'round'
        rCtx.lineWidth = rs.thickness * 0.4; rCtx.strokeStyle = rs.outerColor
        rCtx.beginPath(); rCtx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) rCtx.lineTo(pts[i][0], pts[i][1])
        if (isLoop) rCtx.closePath()
        rCtx.stroke()
        const spacing = rs.thickness * 4, halfLen = rs.thickness * 1.2
        rCtx.lineCap = 'round'; rCtx.lineWidth = rs.thickness * 0.4; rCtx.strokeStyle = rs.outerColor
        let accumulated = 0, nextTie = spacing / 2
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1]
          const segLen = Math.hypot(dx, dy)
          if (segLen === 0) continue
          const nx = -dy / segLen, ny = dx / segLen
          while (accumulated + segLen >= nextTie) {
            const t = (nextTie - accumulated) / segLen
            const x = pts[i-1][0] + dx * t, y = pts[i-1][1] + dy * t
            rCtx.beginPath(); rCtx.moveTo(x - nx * halfLen, y - ny * halfLen)
            rCtx.lineTo(x + nx * halfLen, y + ny * halfLen); rCtx.stroke()
            nextTie += spacing
          }
          accumulated += segLen
        }
      } else {
        rCtx.lineCap = 'round'; rCtx.lineJoin = 'round'
        rCtx.lineWidth = rs.thickness; rCtx.strokeStyle = rs.outerColor
        rCtx.beginPath(); rCtx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) rCtx.lineTo(pts[i][0], pts[i][1])
        if (isLoop) rCtx.closePath()
        rCtx.stroke()
        rCtx.lineCap = 'butt'
        rCtx.lineWidth = rs.thickness * 0.48; rCtx.strokeStyle = rs.innerColor
        rCtx.setLineDash([7, 7])
        rCtx.beginPath(); rCtx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) rCtx.lineTo(pts[i][0], pts[i][1])
        if (isLoop) rCtx.closePath()
        rCtx.stroke()
        rCtx.setLineDash([])
      }
    }

    // Collect junction positions (chain endpoints that are shared by multiple chains)
    const endpointCount = new Map<string, number>()
    for (const { chain, isLoop } of railChains) {
      if (isLoop || chain.length < 2) continue
      const sk = geoKey(chain[0] as [number, number])
      const ek = geoKey(chain[chain.length - 1] as [number, number])
      endpointCount.set(sk, (endpointCount.get(sk) ?? 0) + 1)
      endpointCount.set(ek, (endpointCount.get(ek) ?? 0) + 1)
    }
    const junctionPts: [number, number][] = []
    for (const { chain, isLoop } of railChains) {
      if (isLoop || chain.length < 2) continue
      for (const endPt of [chain[0], chain[chain.length - 1]] as [number, number][]) {
        if ((endpointCount.get(geoKey(endPt)) ?? 0) >= 2) {
          const [x, y] = project(endPt[0], endPt[1])
          junctionPts.push([x, y])
        }
      }
    }

    for (const { chain, isShared, isLoop } of railChains) {
      let pts = chain.map(([lon, lat]) => project(lon, lat)) as [number, number][]
      if (!isLoop) {
        if (isShared) {
          pts = offsetPolyline(pts, RAIL_OFFSET_PX)
        } else {
          const s = sharedOffsetEnds.get(geoKey(chain[0] as [number, number]))
          const e = sharedOffsetEnds.get(geoKey(chain[chain.length - 1] as [number, number]))
          if (s) pts[0] = s
          if (e) pts[pts.length - 1] = e
        }
      }
      drawRailPts(pts, isLoop)
    }

    // Draw junction caps so branches meet cleanly
    if (junctionPts.length > 0) {
      const r = rs.thickness * 0.7
      for (const [x, y] of junctionPts) {
        rCtx.beginPath(); rCtx.arc(x, y, r, 0, Math.PI * 2)
        rCtx.fillStyle = rs.outerColor; rCtx.fill()
      }
      const ri = r * 0.5
      for (const [x, y] of junctionPts) {
        rCtx.beginPath(); rCtx.arc(x, y, ri, 0, Math.PI * 2)
        rCtx.fillStyle = rs.innerColor; rCtx.fill()
      }
    }
  }
  rCtx.restore()
}
