/** Terrain blob cutting by road and river ribbons.
 *  Takes fully-shaped blob polygons and subtracts buffered polyline ribbons from them. */

import polygonClipping from 'polygon-clipping'
import { bufferPolyline } from './geometry'

type Pt = [number, number]
type Poly = Pt[]
type BlobSet = { terrain: string; polys: Poly[] }

export type CutLine = {
  pts: Pt[]
  halfWidth: number  // visual half-width + buffer, in canvas pixels
}

function aabb(poly: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

function aabbOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

function pointInAABB(x: number, y: number, b: ReturnType<typeof aabb>): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
}

/** Quick check: does the ribbon AABB meaningfully overlap this polygon?
 *  Samples the cutline midpoints to see if any land inside the polygon's AABB. */
function ribbonIntersectsAABB(
  cutPts: Pt[],
  polyBB: ReturnType<typeof aabb>,
): boolean {
  for (const [x, y] of cutPts) {
    if (pointInAABB(x, y, polyBB)) return true
  }
  return false
}

/** Convert our flat polygon to the polygon-clipping ring format (closed, no duplicate endpoint needed). */
function toRing(poly: Pt[]): polygonClipping.Ring {
  return poly as polygonClipping.Ring
}

/** Convert a polygon-clipping result geometry back to our flat polygon arrays.
 *  Each MultiPolygon entry is a polygon, first ring is outer, rest are holes (ignored for now). */
function fromGeom(geom: polygonClipping.MultiPolygon): Poly[] {
  const result: Poly[] = []
  for (const polygon of geom) {
    const outer = polygon[0]
    if (outer && outer.length >= 3) result.push(outer as Poly)
  }
  return result
}

/** Apply all cut lines to all blob polygons for the given terrain set.
 *  Returns a new BlobSet array — same terrains, potentially more polygons where cuts split islands. */
export function applyBlobCuts(
  blobs: BlobSet[],
  cutLines: CutLine[],
  cuttableTerrains: Set<string>,
): BlobSet[] {
  if (cutLines.length === 0) return blobs

  return blobs.map(({ terrain, polys }) => {
    if (!cuttableTerrains.has(terrain)) return { terrain, polys }

    let current = polys
    for (const { pts, halfWidth } of cutLines) {
      if (pts.length < 2 || halfWidth <= 0) continue

      const ribbon = bufferPolyline(pts, halfWidth)
      if (ribbon.length < 3) continue
      const ribbonBB = aabb(ribbon)

      const next: Poly[] = []
      for (const poly of current) {
        const polyBB = aabb(poly)
        if (!aabbOverlap(polyBB, ribbonBB) || !ribbonIntersectsAABB(pts, polyBB)) {
          next.push(poly)
          continue
        }
        try {
          const result = polygonClipping.difference(
            [toRing(poly)],
            [toRing(ribbon)],
          )
          const pieces = fromGeom(result)
          if (pieces.length === 0) {
            // polygon was fully consumed — drop it
          } else {
            next.push(...pieces)
          }
        } catch {
          // if clipping fails for any reason, keep the original polygon intact
          next.push(poly)
        }
      }
      current = next
    }

    return { terrain, polys: current }
  })
}
