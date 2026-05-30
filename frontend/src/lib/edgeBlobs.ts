/** Edge-blob geometry — builds blob polygons for painted hex edges.
 *  Pure geometry — no React, no store imports. */

import { offsetPolyline, subdivideClosedPolygon, resampleSmoothQuad } from './geometry'
import { makePermutation, perturbXY, perturbNormal } from './noise'
import { preSmoothVar } from './terrainBlobs'

// ── Types ─────────────────────────────────────────────────────────────────────

export type EdgeBlobParams = {
  smooth: number
  bump: number
  sweepFreq: number
  lobeFreq: number
  lobeAmp: number
  lobeThreshold: number
  lobeDirection: number
  width: number
}

export interface EdgeBlobChain {
  chainKey: string
  terrain: string
  edgeKeys: string[]
}

// ── Key utilities ─────────────────────────────────────────────────────────────

/** Canonical key for the edge between two adjacent hexes. */
export function edgeBlobKey(q1: number, r1: number, q2: number, r2: number): string {
  const a = `${q1},${r1}`, b = `${q2},${r2}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Parse an edge key back to its two hex coords. */
export function parseEdgeBlobKey(key: string): { q1: number; r1: number; q2: number; r2: number } {
  const [a, b] = key.split('|')
  const [q1, r1] = a.split(',').map(Number)
  const [q2, r2] = b.split(',').map(Number)
  return { q1, r1, q2, r2 }
}

// ── Shared-vertex helpers ─────────────────────────────────────────────────────

const SNAP = 1
const vk = (p: [number, number]) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`

/** Find the two canvas-space corner vertices shared between two adjacent hexes. */
export function sharedEdgeVertices(
  q1: number, r1: number,
  q2: number, r2: number,
  hexVertMap: Map<string, [number, number][]>,
): [[number, number], [number, number]] | null {
  const v1 = hexVertMap.get(`${q1},${r1}`)
  const v2 = hexVertMap.get(`${q2},${r2}`)
  if (!v1 || !v2) return null
  const keys2 = new Set(v2.map(vk))
  const shared: [number, number][] = v1.filter(v => keys2.has(vk(v)))
  if (shared.length < 2) return null
  return [shared[0], shared[1]]
}

// ── Chain finding ─────────────────────────────────────────────────────────────

/**
 * Group painted edges into connected chains per terrain type.
 * Two edges are connected when they share a hex-corner vertex.
 */
export function findEdgeChains(
  paintedEdges: Record<string, string>,
  hexVertMap: Map<string, [number, number][]>,
): EdgeBlobChain[] {
  const byTerrain = new Map<string, string[]>()
  for (const [edgeKey, terrain] of Object.entries(paintedEdges)) {
    if (!byTerrain.has(terrain)) byTerrain.set(terrain, [])
    byTerrain.get(terrain)!.push(edgeKey)
  }

  const chains: EdgeBlobChain[] = []

  for (const [terrain, edgeKeys] of byTerrain) {
    // Build vertex → edges map for this terrain
    const vertToEdges = new Map<string, string[]>()
    const edgeToVerts = new Map<string, [string, string] | null>()

    for (const edgeKey of edgeKeys) {
      const { q1, r1, q2, r2 } = parseEdgeBlobKey(edgeKey)
      const seg = sharedEdgeVertices(q1, r1, q2, r2, hexVertMap)
      if (!seg) { edgeToVerts.set(edgeKey, null); continue }
      const ka = vk(seg[0]), kb = vk(seg[1])
      edgeToVerts.set(edgeKey, [ka, kb])
      if (!vertToEdges.has(ka)) vertToEdges.set(ka, [])
      if (!vertToEdges.has(kb)) vertToEdges.set(kb, [])
      vertToEdges.get(ka)!.push(edgeKey)
      vertToEdges.get(kb)!.push(edgeKey)
    }

    // BFS to find connected components
    const visited = new Set<string>()
    for (const startEdge of edgeKeys) {
      if (visited.has(startEdge)) continue
      const component: string[] = []
      const queue = [startEdge]
      while (queue.length > 0) {
        const e = queue.shift()!
        if (visited.has(e)) continue
        visited.add(e)
        component.push(e)
        const verts = edgeToVerts.get(e)
        if (!verts) continue
        for (const vKey of verts) {
          for (const neighbor of vertToEdges.get(vKey) ?? []) {
            if (!visited.has(neighbor)) queue.push(neighbor)
          }
        }
      }
      const chainKey = [...component].sort()[0]
      chains.push({ chainKey, terrain, edgeKeys: component })
    }
  }

  return chains
}

// ── Blob geometry ─────────────────────────────────────────────────────────────

/** Compute canvas-space centroid of a hex from its vertex list. */
function hexCenter(q: number, r: number, hexVertMap: Map<string, [number, number][]>): [number, number] | null {
  const verts = hexVertMap.get(`${q},${r}`)
  if (!verts || verts.length === 0) return null
  return [
    verts.reduce((s, v) => s + v[0], 0) / verts.length,
    verts.reduce((s, v) => s + v[1], 0) / verts.length,
  ]
}

type OrderedPath = {
  path: [number, number][]
  orderedEdgeKeys: string[]   // length = path.length - 1; orderedEdgeKeys[i] → segment path[i]→path[i+1]
}

/**
 * Walk the edges of a chain into an ordered list of polyline paths.
 * At branch points (3+ edges meeting) the path is split into arms.
 */
function buildOrderedPaths(
  edgeKeys: string[],
  hexVertMap: Map<string, [number, number][]>,
): OrderedPath[] {
  const vpos = new Map<string, [number, number]>()
  const vertToEdges = new Map<string, string[]>()
  const edgeToVerts = new Map<string, [string, string]>()

  for (const edgeKey of edgeKeys) {
    const { q1, r1, q2, r2 } = parseEdgeBlobKey(edgeKey)
    const seg = sharedEdgeVertices(q1, r1, q2, r2, hexVertMap)
    if (!seg) continue
    const ka = vk(seg[0]), kb = vk(seg[1])
    if (!vpos.has(ka)) vpos.set(ka, seg[0])
    if (!vpos.has(kb)) vpos.set(kb, seg[1])
    edgeToVerts.set(edgeKey, [ka, kb])
    if (!vertToEdges.has(ka)) vertToEdges.set(ka, [])
    if (!vertToEdges.has(kb)) vertToEdges.set(kb, [])
    vertToEdges.get(ka)!.push(edgeKey)
    vertToEdges.get(kb)!.push(edgeKey)
  }

  if (vpos.size === 0) return []

  const visitedEdges = new Set<string>()
  const paths: OrderedPath[] = []

  // Prefer to start from endpoint vertices (degree 1)
  const allVerts = [...vertToEdges.keys()]
  const startFirst = allVerts.sort((a, b) => {
    const da = vertToEdges.get(a)!.length, db = vertToEdges.get(b)!.length
    return da - db
  })

  for (const startVKey of startFirst) {
    const edgesFromStart = vertToEdges.get(startVKey) ?? []
    const unvisited = edgesFromStart.filter(e => !visitedEdges.has(e))
    if (unvisited.length === 0) continue

    // Walk one path per unvisited edge leaving this vertex
    for (const firstEdge of unvisited) {
      if (visitedEdges.has(firstEdge)) continue
      const path: [number, number][] = [vpos.get(startVKey)!]
      const orderedEdgeKeys: string[] = []
      let curV = startVKey

      for (;;) {
        let nextEdge: string | null = null
        let nextV: string | null = null
        for (const e of vertToEdges.get(curV) ?? []) {
          if (visitedEdges.has(e)) continue
          const [va, vb] = edgeToVerts.get(e)!
          nextEdge = e
          nextV = va === curV ? vb : va
          break
        }
        if (!nextEdge || !nextV) break
        visitedEdges.add(nextEdge)
        path.push(vpos.get(nextV)!)
        orderedEdgeKeys.push(nextEdge)
        // Stop at branch points (degree > 2) to let other arms start from there
        if ((vertToEdges.get(nextV)?.length ?? 0) > 2) break
        curV = nextV
      }

      if (path.length >= 2) paths.push({ path, orderedEdgeKeys })
    }
  }

  return paths
}

/**
 * Build the blob polygon for one polyline path.
 * Creates an offset ribbon around the path, then applies the full Perlin blob pipeline.
 * `leftHalfWidth` / `rightHalfWidth` override the default symmetric halfWidth per side
 * (positive offset = left of path direction; negative = right).
 */
function buildRibbonBlob(
  path: [number, number][],
  params: EdgeBlobParams,
  R: number,
  leftHalfWidth?: number,
  rightHalfWidth?: number,
): [number, number][] {
  const { smooth, bump: bumpFraction, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, width } = params
  const halfWidth = width * R

  const lw = leftHalfWidth  ?? halfWidth
  const rw = rightHalfWidth ?? halfWidth

  // Offset both sides to form a ribbon
  const left  = offsetPolyline(path,  lw)
  const right = offsetPolyline(path, -rw)

  // Close the polygon with taper points at each end
  const startPt = path[0]
  const endPt   = path[path.length - 1]

  let poly: [number, number][] = [
    startPt,
    ...left,
    endPt,
    ...right.slice().reverse(),
  ]

  if (poly.length < 3) return []

  const seed = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97))

  for (let pass = 0; pass < smooth; pass++) poly = preSmoothVar(poly, 0.4)

  poly = subdivideClosedPolygon(poly, R * 0.25)

  const permX = makePermutation(seed)
  const permY = makePermutation(seed + 31)
  poly = perturbXY(poly, permX, permY, sweepFreq / R, bumpFraction * R)

  poly = resampleSmoothQuad(poly, 5)

  const permA = makePermutation(seed + 67)
  const permB = makePermutation(seed + 113)
  const lobeP2Amp = bumpFraction * lobeAmp * R * lobeDirection
  poly = perturbNormal(poly, permA, permB, lobeFreq / R, lobeP2Amp, lobeThreshold)

  return poly
}

/** How far (in units of R) to extend the ribbon toward a matching-terrain hex. */
const HEX_CONNECT_EXTEND = 0.7

/** How far (in units of R) to push a chain endpoint into an adjacent matching-terrain area hex. */
const ENDPOINT_EXTEND_FRACTION = 0.4

/**
 * If the chain endpoint vertex `pt` (from terminal edge `terminalEdgeKey`) sits adjacent
 * to a matching-terrain area hex that is NOT one of the two hexes forming that edge,
 * push the point ENDPOINT_EXTEND_FRACTION * R toward that hex center so the ribbon
 * tip reaches into the area blob and closes the gap.
 */
function extendEndpointIntoAreaHex(
  pt: [number, number],
  terminalEdgeKey: string,
  hexTerrainSet: Set<string>,
  vertToHexes: Map<string, Array<{ q: number; r: number }>>,
  hexVertMap: Map<string, [number, number][]>,
  R: number,
): [number, number] {
  const { q1, r1, q2, r2 } = parseEdgeBlobKey(terminalEdgeKey)
  const edgeHexKeys = new Set([`${q1},${r1}`, `${q2},${r2}`])

  for (const { q, r } of vertToHexes.get(vk(pt)) ?? []) {
    if (edgeHexKeys.has(`${q},${r}`)) continue
    if (!hexTerrainSet.has(`${q},${r}`)) continue
    const center = hexCenter(q, r, hexVertMap)
    if (!center) continue
    const dx = center[0] - pt[0], dy = center[1] - pt[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 0.001) continue
    const ext = ENDPOINT_EXTEND_FRACTION * R
    return [pt[0] + (dx / dist) * ext, pt[1] + (dy / dist) * ext]
  }
  return pt
}

/**
 * Build all blob polygons for one edge chain.
 * Returns a list of polygons (one per non-branching path segment in the chain).
 *
 * When `hexTerrainSet` is provided, any side of the ribbon that faces a hex
 * whose terrain matches the chain terrain is extended to `HEX_CONNECT_EXTEND * R`
 * so the edge blob visually merges with the adjacent hex blob. Endpoints that
 * sit at a vertex touching a matching-terrain area hex are also pushed into that
 * hex by ENDPOINT_EXTEND_FRACTION * R to close vertex-gap artefacts.
 */
export function buildEdgeBlobPolys(
  chain: EdgeBlobChain,
  hexVertMap: Map<string, [number, number][]>,
  params: EdgeBlobParams,
  R: number,
  hexTerrainSet?: Set<string>,
): [number, number][][] {
  const ordered = buildOrderedPaths(chain.edgeKeys, hexVertMap)
  const halfWidth = params.width * R
  const bigWidth  = Math.max(halfWidth, HEX_CONNECT_EXTEND * R)

  // Build vertex → hex list once for endpoint extension lookups.
  const vertToHexes = new Map<string, Array<{ q: number; r: number }>>()
  if (hexTerrainSet && hexTerrainSet.size > 0) {
    for (const [hexKey, verts] of hexVertMap) {
      const [q, r] = hexKey.split(',').map(Number)
      for (const v of verts) {
        const k = vk(v)
        if (!vertToHexes.has(k)) vertToHexes.set(k, [])
        vertToHexes.get(k)!.push({ q, r })
      }
    }
  }

  const result: [number, number][][] = []
  for (const { path, orderedEdgeKeys } of ordered) {
    let leftHalfWidth  = halfWidth
    let rightHalfWidth = halfWidth

    if (hexTerrainSet && hexTerrainSet.size > 0) {
      let leftMatch = 0, rightMatch = 0

      for (let i = 0; i < orderedEdgeKeys.length; i++) {
        const { q1, r1, q2, r2 } = parseEdgeBlobKey(orderedEdgeKeys[i])
        const c1 = hexCenter(q1, r1, hexVertMap)
        const c2 = hexCenter(q2, r2, hexVertMap)
        if (!c1 || !c2) continue

        // Segment direction from path[i] to path[i+1]
        const dx = path[i + 1][0] - path[i][0]
        const dy = path[i + 1][1] - path[i][1]

        // 2D cross product (dx,dy) × (c-path[i]) = dx*cy - dy*cx.
        // In canvas coords (Y-down): cross > 0 → point is on the positive-offset side
        // of the path, i.e. offsetPolyline(path, +w) extends toward it.
        const cross1 = dx * (c1[1] - path[i][1]) - dy * (c1[0] - path[i][0])
        const cross2 = dx * (c2[1] - path[i][1]) - dy * (c2[0] - path[i][0])

        const hex1Match = hexTerrainSet.has(`${q1},${r1}`)
        const hex2Match = hexTerrainSet.has(`${q2},${r2}`)

        // cross > 0 → hex is on positive-offset side → extend leftHalfWidth (used with +offset)
        // cross < 0 → hex is on negative-offset side → extend rightHalfWidth (used with -offset)
        if (hex1Match) { if (cross1 > 0) leftMatch++; else rightMatch++ }
        if (hex2Match) { if (cross2 > 0) leftMatch++; else rightMatch++ }
      }

      if (leftMatch  > 0) leftHalfWidth  = bigWidth
      if (rightMatch > 0) rightHalfWidth = bigWidth
    }

    // Extend endpoints into adjacent matching-terrain area hexes.
    let workPath = path as [number, number][]
    if (hexTerrainSet && hexTerrainSet.size > 0 && orderedEdgeKeys.length > 0) {
      const first = extendEndpointIntoAreaHex(path[0], orderedEdgeKeys[0], hexTerrainSet, vertToHexes, hexVertMap, R)
      const last  = extendEndpointIntoAreaHex(path[path.length - 1], orderedEdgeKeys[orderedEdgeKeys.length - 1], hexTerrainSet, vertToHexes, hexVertMap, R)
      if (first !== path[0] || last !== path[path.length - 1]) {
        workPath = [...path]
        workPath[0] = first
        workPath[workPath.length - 1] = last
      }
    }

    const poly = buildRibbonBlob(workPath, params, R, leftHalfWidth, rightHalfWidth)
    if (poly.length >= 3) result.push(poly)
  }
  return result
}
