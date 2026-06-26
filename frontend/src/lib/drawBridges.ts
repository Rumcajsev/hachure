/** Bridge rendering — plank and icon styles.
 *
 *  Bridge positions and direction vectors are in lon/lat space.
 *  The `project` function converts them to canvas pixel coordinates. */

import type { BridgeTier } from '../store/slices/bridgesSlice'
import type { RoadTierStyle, RailStyle } from '../store/mapStore'
import type { BridgePoint } from './detectBridges'

export interface DrawBridgesParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  bridges: BridgePoint[]
  tiers: BridgeTier[]
  overrides: Record<string, string>
  style: 'plank' | 'icon'
  tierStyles: [RoadTierStyle, RoadTierStyle, RoadTierStyle]
  railStyle: RailStyle
  lineScale: number
  lengthScale: number
  project: (lon: number, lat: number) => [number, number]
}

function resolvedTier(
  bridge: BridgePoint,
  tiers: BridgeTier[],
  overrides: Record<string, string>,
): BridgeTier | null {
  const tierId = overrides[bridge.id]
  if (!tierId) return null
  return tiers.find(t => t.id === tierId) ?? null
}

function roadTierIndex(crossingType: BridgePoint['crossingType']): 0 | 1 | 2 {
  return crossingType === 'road-0' ? 0 : crossingType === 'road-1' ? 1 : 2
}

export function drawBridges(params: DrawBridgesParams): void {
  const { ctx, bridges, tiers, overrides, style, tierStyles, railStyle, lineScale, lengthScale, project } = params
  if (bridges.length === 0) return

  for (const bridge of bridges) {
    const isRail = bridge.crossingType === 'rail'
    const tier = resolvedTier(bridge, tiers, overrides)

    const [px, py] = project(bridge.pos[0], bridge.pos[1])
    const [ax, ay] = project(bridge.dirA[0], bridge.dirA[1])
    const [bx, by] = project(bridge.dirB[0], bridge.dirB[1])
    const angle = Math.atan2(by - ay, bx - ax)

    const roadW = isRail
      ? railStyle.thickness * lineScale
      : tierStyles[roadTierIndex(bridge.crossingType)].outerW * lineScale

    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle)

    const [wax, way] = project(bridge.waterA[0], bridge.waterA[1])
    const [wbx, wby] = project(bridge.waterB[0], bridge.waterB[1])
    const wlen = Math.hypot(wbx - wax, wby - way)
    const rdx = Math.cos(angle), rdy = Math.sin(angle)
    let crossingDist: number
    if (wlen < 0.01) {
      crossingDist = bridge.riverHW * 2 * lengthScale
    } else {
      const dwx = (wbx - wax) / wlen, dwy = (wby - way) / wlen
      const sinCross = Math.abs(rdx * dwy - rdy * dwx)
      crossingDist = sinCross > 0.05
        ? Math.min(bridge.riverHW * 2 * lengthScale / sinCross, roadW * 8)
        : bridge.riverHW * 2 * lengthScale * 20
    }
    crossingDist = Math.max(crossingDist, roadW * 1.5)

    const lw = Math.max(0.8, lineScale * 0.8)
    const hy = isRail ? roadW / 2 + lw : roadW / 2
    const hx = crossingDist / 2

    if (!isRail || tier) {
      if (style === 'plank') {
        ctx.fillStyle = tier ? tier.color : tierStyles[roadTierIndex(bridge.crossingType)].inner
        ctx.fillRect(-hx, -hy, hx * 2, hy * 2)
      } else {
        const r = roadW * 1.5
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fillStyle = tier ? tier.color : tierStyles[roadTierIndex(bridge.crossingType)].inner
        ctx.fill()
        if (tier) {
          ctx.strokeStyle = '#1a1a1a'
          ctx.lineWidth = Math.max(0.5, lineScale * 0.8)
          ctx.stroke()
        }
      }
    }

    // Brackets always drawn
    const kd = roadW * 0.5
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = lw
    ctx.lineJoin = 'miter'
    ctx.lineCap = 'butt'
    for (const sign of [-1, 1] as const) {
      const y = sign * hy
      ctx.beginPath()
      ctx.moveTo(-hx - kd, y + sign * kd)
      ctx.lineTo(-hx, y)
      ctx.lineTo(hx, y)
      ctx.lineTo(hx + kd, y + sign * kd)
      ctx.stroke()
    }

    ctx.restore()
  }
}
