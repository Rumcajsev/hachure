import { LayerCache } from '../../lib/LayerCache'
import type { LayerController } from '../types'
import { drawRivers } from '../../lib/drawRivers'
import type { DrawRiversParams } from '../../lib/drawRivers'

export interface RiversInput {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
  /** True when a river node is actively being dragged — bypass cache and draw live params directly. */
  isDraggingLive: boolean
  params: DrawRiversParams
}

const cache = new LayerCache()
cache.name = 'rivers'

export const riversController: LayerController<RiversInput> = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: RiversInput): void {
    const { pw, ph, dpr, offZoom, isExport, isDraggingLive, params } = input

    if (isExport) {
      drawRivers(ctx, params)
      return
    }

    // Live river drag — draw directly so the moving node is immediate
    if (isDraggingLive) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, pw, ph)
      ctx.clip()
      drawRivers(ctx, params)
      ctx.restore()
      return
    }

    // Cached path
    const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
    if (rebuilt) {
      oCtx.scale(dpr * offZoom, dpr * offZoom)
      oCtx.save()
      oCtx.beginPath()
      oCtx.rect(0, 0, pw, ph)
      oCtx.clip()
      drawRivers(oCtx, params)
      oCtx.restore()
      cache.commitRebuild()
    }
    cache.blit(ctx, 0, 0, pw, ph)
  },
}
