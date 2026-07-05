import { LayerCache } from '../../lib/LayerCache'
import type { LayerController } from '../types'
import { drawRoadsAndRails } from '../../lib/drawRoadsRails'
import type { DrawRoadsRailsParams, BBox } from '../../lib/drawRoadsRails'

export interface RoadsInput extends DrawRoadsRailsParams {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
  /**
   * When set, draw directly to ctx using this viewport (live CP or dense-point drag).
   * When null, use the offscreen cache.
   */
  liveViewport: BBox | null
  /** When true, force markDirty before prepare() — used on projection cache miss. */
  forceMarkDirty: boolean
  /** Called when the layer actually rebuilds — caller can increment a debug counter. */
  onRebuilt?: () => void
}

const cache = new LayerCache()

export const roadsController: LayerController<RoadsInput> = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: RoadsInput): void {
    const { pw, ph, dpr, offZoom, isExport, liveViewport, forceMarkDirty, onRebuilt,
      roadChains, junctions, railChains, tierStyles, railStyle } = input

    if (isExport) {
      drawRoadsAndRails(ctx, { roadChains, junctions, railChains, tierStyles, railStyle })
      return
    }

    if (liveViewport !== null) {
      // Live CP / dense-point drag: draw every frame directly, no cache
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, pw, ph)
      ctx.clip()
      drawRoadsAndRails(ctx, { roadChains, junctions, railChains, tierStyles, railStyle, viewport: liveViewport })
      ctx.restore()
      return
    }

    // Static: offscreen cache
    const vpad = 50
    const paperViewport: BBox = { minX: -vpad, maxX: pw + vpad, minY: -vpad, maxY: ph + vpad }
    if (forceMarkDirty) {
      console.warn('[roads-layer] forceMarkDirty → marking dirty')
      cache.markDirty()
    }
    const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
    if (rebuilt) {
      console.warn('[roads-layer] REBUILD chains=', roadChains.length, 'tiers=', roadChains.map(c => c.tier).join(','))
      oCtx.scale(dpr * offZoom, dpr * offZoom)
      oCtx.save()
      oCtx.beginPath()
      oCtx.rect(0, 0, pw, ph)
      oCtx.clip()
      drawRoadsAndRails(oCtx, { roadChains, junctions, railChains, tierStyles, railStyle, viewport: paperViewport })
      oCtx.restore()
      cache.commitRebuild()
      onRebuilt?.()
    }
    cache.blit(ctx, 0, 0, pw, ph)
  },
}
