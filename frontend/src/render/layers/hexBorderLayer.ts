import { LayerCache } from '../../lib/LayerCache'
import type { LayerController } from '../types'
import { drawHexBorders } from '../../lib/drawHexBorders'
import type { GeneratedHex, MapStore } from '../../store/mapStore'

export interface HexBorderInput {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
  lineScale: number
  projected: { hex: GeneratedHex; verts: [number, number][] }[]
  borderMode: string
  edgeMode: string
  inMargin: (verts: [number, number][]) => boolean
  bordersExcludedSet: Set<string>
  opacity: number
  color: string
  difference: boolean
}

const cache = new LayerCache()
cache.name = 'hexBorder'

export const hexBorderDeps = (s: MapStore) => [
  s.hexBorderMode, s.hexEdgeMode, s.hexBorderOpacity, s.hexBorderColor, s.hexBorderDifference,
  s.generatedHexes, s.excludedHexKeys, s.disabledHexKeys, s.autoDisabledOceanHexKeys,
]

export const hexBorderController: LayerController<HexBorderInput> = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: HexBorderInput): void {
    const { pw, ph, dpr, offZoom, isExport, lineScale, projected, borderMode, edgeMode, inMargin, bordersExcludedSet, opacity, color, difference } = input

    // Cached path: screen, no difference blend
    if (!isExport && !difference) {
      const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
      if (rebuilt) {
        oCtx.scale(dpr * offZoom, dpr * offZoom)
        oCtx.save()
        oCtx.beginPath()
        oCtx.rect(0, 0, pw, ph)
        oCtx.clip()
        drawHexBorders(oCtx, projected, borderMode, edgeMode, inMargin, 1, bordersExcludedSet, opacity, color, false)
        oCtx.restore()
        cache.commitRebuild()
      }
      cache.blit(ctx, 0, 0, pw, ph)
      return
    }

    // Difference blend must composite directly against terrain — no offscreen cache
    if (!isExport && difference) {
      drawHexBorders(ctx, projected, borderMode, edgeMode, inMargin, 1, bordersExcludedSet, opacity, color, true)
      return
    }

    // Export path — direct draw with lineScale
    if (isExport) {
      drawHexBorders(ctx, projected, borderMode, edgeMode, inMargin, lineScale, bordersExcludedSet, opacity, color, difference)
    }
  },
}
