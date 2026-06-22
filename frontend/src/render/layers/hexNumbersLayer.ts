import { LayerCache } from '../../lib/LayerCache'
import type { LayerController } from '../types'
import type { MapStore } from '../../store/mapStore'
import { drawHexNumbers } from '../../lib/drawHexNumbers'
import type { HexNumberParams } from '../../lib/drawHexNumbers'

export type HexNumbersInput = Omit<HexNumberParams, 'ctx'> & {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
}

const cache = new LayerCache()

// hexNumberMap is a TVC memo of (hexNumbersEnabled, generatedHexes, hexOrientation, hexNumberStartCorner)
// — we depend on those source props directly rather than the computed memo.
export const hexNumbersDeps = (s: MapStore) => [
  s.hexNumbersEnabled, s.hexNumberEdge, s.hexNumberColor, s.hexNumberFontScale,
  s.hexOrientation, s.hexNumberStartCorner, s.labelPresetId, s.labelOverrides, s.generatedHexes,
]

export const hexNumbersController: LayerController<HexNumbersInput> = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: HexNumbersInput): void {
    const { pw, ph, dpr, offZoom, isExport, ...drawParams } = input

    if (isExport) {
      drawHexNumbers({ ctx, ...drawParams })
      return
    }

    const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
    if (rebuilt) {
      oCtx.scale(dpr * offZoom, dpr * offZoom)
      drawHexNumbers({ ctx: oCtx, ...drawParams })
      cache.commitRebuild()
    }
    cache.blit(ctx, 0, 0, pw, ph)
  },
}
