import { LayerCache } from '../../lib/LayerCache'
import { drawTerrain } from '../../lib/drawTerrain'
import type { DrawTerrainParams } from '../../lib/drawTerrain'
import type { LayerController } from '../types'

export interface TerrainInput {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
  /**
   * True while the user is actively painting (mousedown).
   * The offscreen cache is skipped and screen params are drawn directly
   * so the terrain doesn't lag during brush strokes.
   */
  isPainting: boolean
  /** Params for the screen (offscreen-cached) path. Also used for painting. */
  screenParams: DrawTerrainParams
  /** Params for the export path — caller pre-computes blobs at full resolution. */
  exportParams: DrawTerrainParams
}

const cache = new LayerCache()
cache.name = 'terrain'

export const terrainController: LayerController<TerrainInput> = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: TerrainInput): void {
    const { pw, ph, dpr, offZoom, isExport, isPainting, screenParams, exportParams } = input

    // Export — always draw directly at full resolution
    if (isExport) {
      drawTerrain(ctx, exportParams)
      return
    }

    // Actively painting — skip the offscreen cache so strokes appear immediately
    if (isPainting) {
      drawTerrain(ctx, screenParams)
      return
    }

    // Static screen — offscreen cached
    const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
    if (rebuilt) {
      console.log('[draw] terrain rebuild triggered')
      const _t = performance.now()
      oCtx.scale(dpr * offZoom, dpr * offZoom)
      oCtx.save()
      oCtx.beginPath()
      oCtx.rect(0, 0, pw, ph)
      oCtx.clip()
      drawTerrain(oCtx, screenParams)
      oCtx.restore()
      console.log(`[draw] terrain rebuild done in ${(performance.now() - _t).toFixed(1)}ms`)
      cache.commitRebuild()
    }
    cache.blit(ctx, 0, 0, pw, ph)
  },
}
