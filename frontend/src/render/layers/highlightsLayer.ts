import { LayerCache } from '../../lib/LayerCache'
import type { LayerController } from '../types'
import type { MapStore } from '../../store/mapStore'
import { drawHighlights } from '../../lib/drawHighlights'
import type { HighlightsParams } from '../../lib/drawHighlights'

export interface HighlightsInput extends HighlightsParams {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
}

const cache = new LayerCache()

export const highlightsDeps = (s: MapStore) => [
  s.highlights, s.highlightedHexes, s.highlightLines, s.highlightEdgePaths,
]

export const highlightsController: LayerController<HighlightsInput> = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: HighlightsInput): void {
    const { pw, ph, dpr, offZoom, isExport, lineScale, ...drawParams } = input

    if (!isExport) {
      const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
      if (rebuilt) {
        oCtx.scale(dpr * offZoom, dpr * offZoom)
        drawHighlights(oCtx, drawParams)
        cache.commitRebuild()
      }
      cache.blit(ctx, 0, 0, pw, ph)
      return
    }

    drawHighlights(ctx, { ...drawParams, lineScale })
  },
}
