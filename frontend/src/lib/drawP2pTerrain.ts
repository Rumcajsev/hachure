/** Point-to-point terrain rendering.
 *
 *  Feeds p2pTerrainRegions.ts's region polygons through the exact same organic-
 *  shaping pipeline (shapeInputPolygon → shapeTerrainBlobs) and the same fill/
 *  texture/outline drawing (drawTerrainBlobFill / drawBlobOutline) that hex
 *  terrain blobs use. A region is just a blob with a different topology source —
 *  by the time it's shaped, hex-cell vs. planar-graph origin no longer matters.
 */

import { shapeInputPolygon, shapeTerrainBlobs, perturbCorridorsForTerrain, cutRawPolysWithCorridors, type BlobTopologyEntry } from './terrainBlobs'
import { drawTerrainBlobFill, drawBlobOutline, type BlobFillStyle } from './drawTerrain'
import { offsetPolyline } from './geometry'
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
  /** Road/river centerlines in canvas-pixel space (already projected), for corridor
   *  clipping — see cutCorridors() below. Omit/empty to skip a given source. */
  roadChainsPx?: [number, number][][]
  riverChainsPx?: [number, number][][]
  roadCutEnabled?: boolean
  roadCutWidth?: number
  roadCutRoughness?: number
  riverCutEnabled?: boolean
  riverCutWidth?: number
  riverCutRoughness?: number
}

/** Widens each centerline into a closed ribbon polygon of the given half-width, by
 *  offsetting it to both sides and stitching the two offset curves into one loop. */
function buildCorridorRibbons(chains: [number, number][][], halfWidth: number): [number, number][][] {
  const out: [number, number][][] = []
  for (const pts of chains) {
    if (pts.length < 2) continue
    const upper = offsetPolyline(pts, +halfWidth)
    const lower = offsetPolyline(pts, -halfWidth).slice().reverse()
    if (upper.length + lower.length >= 3) out.push([...upper, ...lower])
  }
  return out
}

/** Merge same-type adjacent region polygons into one outer-boundary polygon per
 *  connected cluster. Mirrors terrainBlobs.ts's buildTerrainBlobTopology (the hex-grid
 *  equivalent): an edge shared by two same-type regions is interior and must be
 *  dissolved before organic shaping runs, or each side gets deformed independently
 *  and a seam/gap opens up right along what used to be a seamless shared edge. */
function dissolveAdjacentPolys(polys: [number, number][][], R: number): [number, number][][] {
  const SNAP = Math.max(2, R * 0.015)
  const vk = (p: [number, number]) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`
  const vpos = new Map<string, [number, number]>()
  const edgeCount = new Map<string, number>()
  const edgeEnds = new Map<string, [string, string]>()

  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      const ka = vk(a), kb = vk(b)
      if (!vpos.has(ka)) vpos.set(ka, a)
      if (!vpos.has(kb)) vpos.set(kb, b)
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      edgeCount.set(ek, (edgeCount.get(ek) ?? 0) + 1)
      if (!edgeEnds.has(ek)) edgeEnds.set(ek, [ka, kb])
    }
  }

  const adj = new Map<string, string[]>()
  for (const [ek, count] of edgeCount) {
    if (count !== 1) continue
    const [ka, kb] = edgeEnds.get(ek)!
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka)!.push(kb)
    adj.get(kb)!.push(ka)
  }

  const visitedVerts = new Set<string>()
  const visitedEdges = new Set<string>()
  const out: [number, number][][] = []
  for (const [startKey] of adj) {
    if (visitedVerts.has(startKey)) continue
    const pts: [number, number][] = []
    let cur = startKey
    for (;;) {
      visitedVerts.add(cur)
      pts.push(vpos.get(cur)!)
      const nbrs = adj.get(cur) ?? []
      let next: string | null = null
      for (const n of nbrs) {
        const ek = cur < n ? `${cur}|${n}` : `${n}|${cur}`
        if (!visitedEdges.has(ek)) { visitedEdges.add(ek); next = n; break }
      }
      if (!next || next === startKey) break
      cur = next
    }
    if (pts.length >= 3) out.push(pts)
  }
  return out
}

export function drawP2pTerrain(ctx: Ctx, params: DrawP2pTerrainParams): void {
  const {
    regions, project, styles, R,
    smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, topoStyle,
    roadChainsPx = [], riverChainsPx = [],
    roadCutEnabled = false, roadCutWidth = 0.3, roadCutRoughness = 0.3,
    riverCutEnabled = false, riverCutWidth = 0.5, riverCutRoughness = 0.3,
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
    rawPolys: dissolveAdjacentPolys(polys, R).map(poly => {
      const seed = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97))
      return shapeInputPolygon(poly, topoStyle, R, seed)
    }),
    hexCenters: centers,
  }))

  const shaped = shapeTerrainBlobs(topology, smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, R, {})

  // Corridor clipping: cut the SHAPED (already-wobbled) blobs against road/river
  // ribbons, so the organic deformation never bulges across a road or river — same
  // mechanism and ordering as hex mode's roadBlobCut*/riverBlobCut* (shape, then cut).
  const roadRibbons = roadCutEnabled && roadChainsPx.length ? buildCorridorRibbons(roadChainsPx, roadCutWidth * R) : []
  const riverRibbons = riverCutEnabled && riverChainsPx.length ? buildCorridorRibbons(riverChainsPx, riverCutWidth * R) : []

  for (const { terrain, polys } of shaped) {
    const style = styles[terrain as P2pTerrainType]
    if (!style) continue
    let finalPolys = polys
    if (roadRibbons.length || riverRibbons.length) {
      // Different seed per terrain type (same trick hex mode uses) so the cut edge's
      // noise doesn't look identical across every terrain crossing the same road.
      const terrainSeed = Math.abs(terrain.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0))
      const corridors = [
        ...(roadRibbons.length ? perturbCorridorsForTerrain(roadRibbons, roadCutRoughness, 1 + roadCutRoughness, sweepFreq, R, roadCutWidth * R, terrainSeed) : []),
        ...(riverRibbons.length ? perturbCorridorsForTerrain(riverRibbons, riverCutRoughness, 1 + riverCutRoughness, sweepFreq, R, riverCutWidth * R, terrainSeed + 1) : []),
      ]
      finalPolys = corridors.length ? cutRawPolysWithCorridors(polys, corridors) : polys
    }
    drawTerrainBlobFill(ctx, finalPolys, R, style)
    if (style.outlineEnabled) drawBlobOutline(ctx, finalPolys, style.outlineColor, style.outlineWidth)
  }
}

export const DEFAULT_P2P_TERRAIN_STYLES: Record<P2pTerrainType, P2pTerrainStyle> = {
  fields:       { color: '#dad999', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
  light_forest: { color: '#bdd392', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
  heavy_forest: { color: '#7ea663', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
  swamp:        { color: '#b4c9b4', texture: null, textureScale: 3, blendMode: 'multiply', opacity: 0.6, tintColor: '', tintOpacity: 0.5, outlineEnabled: false, outlineColor: '#00000000', outlineWidth: 0 },
}
