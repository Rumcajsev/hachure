import { LayerCache } from '../../lib/LayerCache'
import { drawAllBuildings } from '../../lib/drawBuildings'
import type { DrawBuildingsParams } from '../../lib/drawBuildings'
import { drawAllBuildingsV2 } from '../../lib/drawBuildingsV2'
import type { SettlementTier, SettlementTierStyle } from '../../store/mapStore'

export interface BuildingsInput extends DrawBuildingsParams {
  pw: number
  ph: number
  dpr: number
  offZoom: number
  isExport: boolean
  lineScale: number
  /** When true, skip the rebuild (stale bitmap stays visible) — used after road-paint mouseup. */
  skipExpensiveLayers: boolean
}

const cache = new LayerCache()

export const buildingsController = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },
  get lastRebuilt(): boolean { return cache.lastRebuilt },
  get estimatedBytes(): number { return cache.estimatedBytes },
  get hasBitmap(): boolean { return cache.hasBitmap },

  draw(ctx: CanvasRenderingContext2D, input: BuildingsInput): void {
    const { pw, ph, dpr, offZoom, isExport, lineScale, skipExpensiveLayers,
      hexes, urbanHexes, urbanStyle, settlements, settlementTierStyles,
      roadChains, roadTierStyles, hexBuildingGeoCache, project } = input

    if (!isExport) {
      if (urbanHexes.length === 0) {
        cache.dispose()
        return
      }
      if (!skipExpensiveLayers) {
        const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
        if (rebuilt) {
          hexBuildingGeoCache.clear()
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.save()
          oCtx.beginPath()
          oCtx.rect(0, 0, pw, ph)
          oCtx.clip()
          drawAllBuildings(oCtx, { hexes, urbanHexes, urbanStyle, settlements, settlementTierStyles, roadChains, roadTierStyles, hexBuildingGeoCache, project })
          drawAllBuildingsV2(oCtx, { hexes, urbanHexes, urbanStyle, settlements, settlementTierStyles, roadChains, roadTierStyles, project })
          oCtx.restore()
          cache.commitRebuild()
        }
      }
      cache.blit(ctx, 0, 0, pw, ph)
      return
    }

    // Export — scale size-related style fields to match paper-space line scale
    const scaled = Object.fromEntries(
      (Object.entries(settlementTierStyles) as [string, SettlementTierStyle][]).map(([k, v]) => [k, {
        ...v,
        buildingSizeMin: v.buildingSizeMin * lineScale, buildingSizeMax: v.buildingSizeMax * lineScale,
        roadSetback: v.roadSetback * lineScale, slotSpacing: v.slotSpacing * lineScale,
        buildingV2Size: v.buildingV2Size * lineScale, buildingV2Spacing: v.buildingV2Spacing * lineScale,
        buildingStrokeWidth: v.buildingStrokeWidth * lineScale,
      }])
    ) as Record<SettlementTier, SettlementTierStyle>
    drawAllBuildings(ctx, { hexes, urbanHexes, urbanStyle, settlements, settlementTierStyles: scaled, roadChains, roadTierStyles, hexBuildingGeoCache, project })
    drawAllBuildingsV2(ctx, { hexes, urbanHexes, urbanStyle, settlements, settlementTierStyles: scaled, roadChains, roadTierStyles, project })
  },
}
