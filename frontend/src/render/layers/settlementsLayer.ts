import { LayerCache } from '../../lib/LayerCache'
import { drawSettlements } from '../../lib/drawSettlements'
import type { DrawSettlementsParams } from '../../lib/drawSettlements'

export interface SettlementsInput extends DrawSettlementsParams {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
  /** When true, skip rebuild and blit stale bitmap — used after road-paint mouseup. */
  skipExpensiveLayers: boolean
  /** When set, rebuild the cache excluding this label — overlay draws it separately. */
  excludeLabelId?: string
}

const cache = new LayerCache()

export const settlementsController = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: SettlementsInput): void {
    const { pw, ph, dpr, offZoom, isExport, skipExpensiveLayers, scale, excludeLabelId, ...drawParams } = input

    if (!isExport) {
      if (!skipExpensiveLayers) {
        const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
        if (rebuilt) {
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.save()
          oCtx.beginPath()
          oCtx.rect(0, 0, pw, ph)
          oCtx.clip()
          drawSettlements(oCtx, { ...drawParams, excludeLabelId })
          oCtx.restore()
          cache.commitRebuild()
        }
      }
      cache.blit(ctx, 0, 0, pw, ph)
      return
    }

    drawSettlements(ctx, { ...drawParams, scale })
  },
}
