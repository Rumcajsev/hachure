/** Road and rail layer rendering. Pure canvas operations — no React or store imports. */

import type { RoadTierStyle, RailStyle, RoadDashStyle } from '../store/mapStore'
import { offsetPolyline, pointInPolygon } from './geometry'

function dashPattern(style: RoadDashStyle, w: number): number[] {
  if (style === 'dashed') return [w * 2.5, w * 1.5]
  if (style === 'dotted') return [w * 0.5, w * 1.5]
  return []
}

// Returns t ∈ [0,1] along segment AB where it intersects segment CD, or null if no intersection.
function segIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null {
  const dxAB = bx - ax, dyAB = by - ay
  const dxCD = dx - cx, dyCD = dy - cy
  const denom = dxAB * dyCD - dyAB * dxCD
  if (Math.abs(denom) < 1e-10) return null
  const t = ((cx - ax) * dyCD - (cy - ay) * dxCD) / denom
  const u = ((cx - ax) * dyAB - (cy - ay) * dxAB) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return t
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type TerrainBlobEntry = { terrain: string; polys: [number, number][][] }

export type DrawRoadsRailsParams = {
  roadChains: { tier: 0 | 1 | 2; chain: [number, number][] }[]
  junctions: { pos: [number, number]; tier: 0 | 1 | 2 }[]
  railChains: { chain: [number, number][]; baseChain?: [number, number][]; id?: string; isShared: boolean; isLoop: boolean; hopKeys?: string[]; hopRanges?: [number, number][] }[]
  tierStyles: [RoadTierStyle, RoadTierStyle, RoadTierStyle]
  railStyle: RailStyle
  project: (lon: number, lat: number) => [number, number]
  clearColor?: string
  clearanceBlobs?: TerrainBlobEntry[]
}

export function drawRoadsAndRails(rCtx: Ctx, {
  roadChains, junctions, railChains, tierStyles, railStyle, project, clearColor, clearanceBlobs,
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

    if (clearColor && clearanceBlobs && clearanceBlobs.length > 0) {
      const allPolys = clearanceBlobs.flatMap(b => b.polys).filter(p => p.length >= 3)
      if (allPolys.length > 0) {
        const TAPER_PX = 20

        rCtx.save()
        rCtx.fillStyle = clearColor

        for (const tier of [2, 1, 0] as const) {
          const halfW = tierStyles[tier].outerW
          for (const chain of chainsByTier[tier]) {
            const pts = chain.map(([lon, lat]) => project(lon, lat))
            if (pts.length < 2) continue

            // Arc-length at each projected point
            const arcLen: number[] = [0]
            for (let i = 1; i < pts.length; i++)
              arcLen.push(arcLen[i - 1] + Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]))

            // Collect all arc-length positions where the chain crosses a polygon edge
            const crossings: number[] = []
            for (const poly of allPolys) {
              const n = poly.length
              for (let ei = 0; ei < n; ei++) {
                const [ex1, ey1] = poly[ei], [ex2, ey2] = poly[(ei + 1) % n]
                for (let ci = 0; ci < pts.length - 1; ci++) {
                  const t = segIntersect(pts[ci][0], pts[ci][1], pts[ci+1][0], pts[ci+1][1], ex1, ey1, ex2, ey2)
                  if (t !== null) crossings.push(arcLen[ci] + t * (arcLen[ci+1] - arcLen[ci]))
                }
              }
            }
            crossings.sort((a, b) => a - b)

            // One pointInPolygon check — just the first point — to seed inside/outside state
            const firstInside = allPolys.some(p => pointInPolygon(pts[0][0], pts[0][1], p))

            // Build intervals [s0, s1, taperStart, taperEnd] where chain is inside a blob
            type Interval = { s0: number; s1: number; taperStart: boolean; taperEnd: boolean }
            const intervals: Interval[] = []
            let inside = firstInside
            let s0 = inside ? 0 : -1
            let taperStart = false  // no taper if we start inside (road was already in terrain)

            for (const s of crossings) {
              if (inside) {
                intervals.push({ s0, s1: s, taperStart, taperEnd: true })
                inside = false
              } else {
                s0 = s; taperStart = true; inside = true
              }
            }
            if (inside) {
              // Chain ends inside — no taper at the exit end
              intervals.push({ s0, s1: arcLen[arcLen.length - 1], taperStart, taperEnd: false })
            }

            // Draw a tapered ribbon for each interval
            for (const { s0, s1, taperStart, taperEnd } of intervals) {
              // Gather chain points inside [s0, s1]
              const segPts: [number, number][] = []
              const segW: number[] = []
              for (let i = 0; i < pts.length; i++) {
                const s = arcLen[i]
                if (s < s0 - 0.5 || s > s1 + 0.5) continue
                const ew = taperStart ? Math.min(1, (s - s0) / TAPER_PX) : 1
                const xw = taperEnd  ? Math.min(1, (s1 - s) / TAPER_PX) : 1
                segPts.push(pts[i])
                segW.push(Math.min(ew, xw) * halfW)
              }
              if (segPts.length < 2) continue

              // Build left/right ribbon edges using per-point normals
              const left: [number, number][] = []
              const right: [number, number][] = []
              for (let i = 0; i < segPts.length; i++) {
                const prev = segPts[Math.max(0, i - 1)]
                const next = segPts[Math.min(segPts.length - 1, i + 1)]
                const tx = next[0] - prev[0], ty = next[1] - prev[1]
                const tl = Math.hypot(tx, ty) || 1
                const nx = -ty / tl, ny = tx / tl
                const w = segW[i]
                left.push([segPts[i][0] + nx * w, segPts[i][1] + ny * w])
                right.push([segPts[i][0] - nx * w, segPts[i][1] - ny * w])
              }

              rCtx.beginPath()
              rCtx.moveTo(left[0][0], left[0][1])
              for (let i = 1; i < left.length; i++) rCtx.lineTo(left[i][0], left[i][1])
              for (let i = right.length - 1; i >= 0; i--) rCtx.lineTo(right[i][0], right[i][1])
              rCtx.closePath()
              rCtx.fill()
            }
          }
        }
        rCtx.restore()
      }
    }

    rCtx.lineJoin = 'round'
    for (const tier of [2, 1, 0] as const) {
      const s = tierStyles[tier]
      rCtx.lineCap = s.caseDash === 'dashed' ? 'butt' : 'round'
      rCtx.strokeStyle = s.outer
      rCtx.lineWidth = s.outerW
      rCtx.setLineDash(dashPattern(s.caseDash, s.outerW))
      for (const chain of chainsByTier[tier]) drawChain(chain)
    }
    rCtx.setLineDash([])
    rCtx.lineCap = 'round'
    for (const { pos, tier } of junctions) {
      const [x, y] = project(pos[0], pos[1])
      const s = tierStyles[tier]
      rCtx.beginPath(); rCtx.arc(x, y, s.outerW / 2, 0, Math.PI * 2)
      rCtx.fillStyle = s.outer; rCtx.fill()
    }
    for (const tier of [2, 1, 0] as const) {
      const s = tierStyles[tier]
      rCtx.lineCap = s.fillDash === 'dashed' ? 'butt' : 'round'
      rCtx.strokeStyle = s.inner
      rCtx.lineWidth = s.outerW * 0.5
      rCtx.setLineDash(dashPattern(s.fillDash, s.outerW * 0.5))
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
