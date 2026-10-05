/** Point-to-point terrain rendering.
 *
 *  Feeds p2pTerrainRegions.ts's region polygons through the exact same organic-
 *  shaping pipeline (shapeInputPolygon → shapeTerrainBlobs) and the same fill/
 *  texture/outline drawing (drawTerrainBlobFill / drawBlobOutline) that hex
 *  terrain blobs use. A region is just a blob with a different topology source —
 *  by the time it's shaped, hex-cell vs. planar-graph origin no longer matters.
 */

import { shapeInputPolygon, shapeTerrainBlobs, type BlobTopologyEntry } from './terrainBlobs'
import { drawTerrainBlobFill, drawBlobOutline, type BlobFillStyle } from './drawTerrain'
import type { P2pTerrainRegion } from './p2pTerrainRegions'
import type { P2pTerrainType } from '../store/slices/p2pTerrainSlice'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface P2pTerrainStyle extends BlobFillStyle {
  outlineEnabled: boolean
  outlineColor: string
  outlineWidth: number
}

export interface DrawP2pTerrainParams {
  regions: P2pTerrainRegion[]
  /** Projects a local km-plane point to canvas pixels. */
  project: (xKm: number, yKm: number) => [number, number]
  styles: Partial<Record<P2pTerrainType, P2pTerrainStyle>>
  /** Pixel-space scale unit for the organic deformation — same role hex radius
   *  plays for hex blobs. Pass the grid cell size in pixels for a comparable feel. */
  R: number
  smooth: number
  offset: number
  bump: number
  sweepFreq: number
  lobeFreq: number
  lobeAmp: number
  lobeThreshold: number
  lobeDirection: number
  topoStyle: number
}

export function drawP2pTerrain(ctx: Ctx, params: DrawP2pTerrainParams): void {
  const {
    regions, project, styles, R,
    smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, topoStyle,
  } = params

  const byType = new Map<string, { polys: [number, number][][]; centers: [number, number][] }>()
  for (const r of regions) {
    if (r.type === 'empty' || !styles[r.type as P2pTerrainType]) continue
    const poly = r.poly.map(([x, y]) => project(x, y))
    let cx = 0, cy = 0
    for (const [x, y] of poly) { cx += x; cy += y }
    cx /= poly.length; cy /= poly.length
    if (!byType.has(r.type)) byType.set(r.type, { polys: [], centers: [] })
    const bucket = byType.get(r.type)!
    bucket.polys.push(poly)
    bucket.centers.push([cx, cy])
  }

  const topology: BlobTopologyEntry[] = [...byType.entries()].map(([terrain, { polys, centers }]) => ({
    terrain,
    rawPolys: polys.map(poly => {
      const seed = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97))
      return shapeInputPolygon(poly, topoStyle, R, seed)
    }),
    hexCenters: centers,
  }))

  const shaped = shapeTerrainBlobs(topology, smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, R, {})

  for (const { terrain, polys } of shaped) {
    const style = styles[terrain as P2pTerrainType]
    if (!style) continue
    drawTerrainBlobFill(ctx, polys, R, style)
    if (style.outlineEnabled) drawBlobOutline(ctx, polys, style.outlineColor, style.outlineWidth)
  }
}

export const DEFAULT_P2P_TERRAIN_STYLES: Record<P2pTerrainType, P2pTerrainStyle> = {
  fields:       { color: '#dad999', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
  light_forest: { color: '#bdd392', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
  heavy_forest: { color: '#7ea663', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
  swamp:        { color: '#b4c9b4', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
}
