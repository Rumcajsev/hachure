/** Pure helpers for extracting thin linear features (roads/rivers) from a user-aligned
 *  historical map image: classify pixels against tiered swatches, thin the per-tier
 *  mask to a 1px skeleton, then trace the skeleton into pixel-space polylines split
 *  at junctions. No store or React imports. */

import { hexToRgb, colorDistance } from './imageCoverageSample'
import { douglasPeucker } from './geometry'

export interface TieredLineSwatch {
  id: number
  color: string
  tolerance: number
  tier: 0 | 1 | 2
}

export interface TracedLine {
  tier: 0 | 1 | 2
  /** Image pixel coordinates (u, v), already simplified. */
  points: [number, number][]
}

interface Bbox { x0: number; y0: number; x1: number; y1: number }

/** Nearest-swatch-wins classification across ALL swatches (not per-tier), so
 *  overlapping tier colors compete fairly — matches the terrain coverage rule. */
export function classifyPixels(imgData: ImageData, swatches: TieredLineSwatch[]): Int16Array {
  const { width, height, data } = imgData
  const result = new Int16Array(width * height).fill(-1)
  if (swatches.length === 0) return result
  const rgbSwatches = swatches.map(s => ({ tier: s.tier, tolerance: s.tolerance, rgb: hexToRgb(s.color) }))
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    const r = data[idx], g = data[idx + 1], b = data[idx + 2]
    let best = Infinity
    let bestTier = -1
    for (const s of rgbSwatches) {
      const [sr, sg, sb] = s.rgb
      const d = colorDistance(r, g, b, sr, sg, sb)
      if (d <= s.tolerance && d < best) { best = d; bestTier = s.tier }
    }
    result[i] = bestTier
  }
  return result
}

function maskBbox(mask: Uint8Array, width: number, height: number, pad = 2): Bbox | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  return {
    x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad),
    x1: Math.min(width - 1, x1 + pad), y1: Math.min(height - 1, y1 + pad),
  }
}

/** How far (in px) gap-bridging will dilate the classified mask before skeletonizing —
 *  e.g. where a label, contour line, or another feature crosses over a road and
 *  breaks its color run. Effective max gap bridged is ~2x this radius. No erosion
 *  step follows: skeletonize() already re-thins any blob to a 1px centerline, so a
 *  true morphological close (dilate+erode) just strips the bridge back off skinny
 *  1-2px road lines before it can help — erosion's size-preserving property is
 *  pointless when the very next step throws the size away anyway. */
const GAP_CLOSE_RADIUS = 2

function diskOffsets(radius: number): [number, number][] {
  const offsets: [number, number][] = []
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) offsets.push([dx, dy])
    }
  }
  return offsets
}

function dilateMask(mask: Uint8Array, width: number, height: number, bbox: Bbox, offsets: [number, number][]): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let y = bbox.y0; y <= bbox.y1; y++) {
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      if (mask[y * width + x]) { out[y * width + x] = 1; continue }
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        if (mask[ny * width + nx]) { out[y * width + x] = 1; break }
      }
    }
  }
  return out
}

/** Bridges small breaks in a per-tier mask before skeletonizing — fixes the common
 *  case of a road run interrupted by an overlapping label, dashed style, or
 *  antialiasing dropout. `bbox` must already be padded by at least `radius` so
 *  growth isn't clipped at its edges. */
function bridgeMaskGaps(mask: Uint8Array, width: number, height: number, bbox: Bbox, radius: number): Uint8Array {
  if (radius <= 0) return mask
  return dilateMask(mask, width, height, bbox, diskOffsets(radius))
}

/** Zhang-Suen thinning, restricted to the mask's bounding box (padded) since roads
 *  are typically a small fraction of the full image — scanning the whole canvas
 *  every iteration would be wasteful. */
function skeletonize(mask: Uint8Array, width: number, height: number, bbox: Bbox): Uint8Array {
  const img = mask.slice()
  const at = (x: number, y: number) => (x < 0 || x >= width || y < 0 || y >= height) ? 0 : img[y * width + x]
  const MAX_ITERATIONS = 200
  let changed = true
  let iterations = 0
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false
    iterations++
    for (const step of [0, 1] as const) {
      const toClear: number[] = []
      for (let y = bbox.y0; y <= bbox.y1; y++) {
        for (let x = bbox.x0; x <= bbox.x1; x++) {
          if (!img[y * width + x]) continue
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y)
          const p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1)
          const p8 = at(x - 1, y), p9 = at(x - 1, y - 1)
          const n = [p2, p3, p4, p5, p6, p7, p8, p9]
          const B = n[0] + n[1] + n[2] + n[3] + n[4] + n[5] + n[6] + n[7]
          if (B < 2 || B > 6) continue
          let A = 0
          for (let k = 0; k < 8; k++) if (n[k] === 0 && n[(k + 1) % 8] === 1) A++
          if (A !== 1) continue
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue
            if (p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0) continue
            if (p2 * p6 * p8 !== 0) continue
          }
          toClear.push(y * width + x)
        }
      }
      if (toClear.length > 0) {
        changed = true
        for (const i of toClear) img[i] = 0
      }
    }
  }
  return img
}

const NEI8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]

/** Vectorizes a 1px skeleton into pixel-space polylines. Walks from endpoints and
 *  junctions along degree-2 chains until another endpoint/junction is hit; any
 *  pixels left over (closed loops with no endpoint) get one representative walk. */
function traceSkeleton(skeleton: Uint8Array, width: number, height: number, bbox: Bbox): [number, number][][] {
  const idx = (x: number, y: number) => y * width + x
  const toXY = (i: number): [number, number] => [i % width, Math.floor(i / width)]
  const neighborsOf = (i: number): number[] => {
    const [x, y] = toXY(i)
    const out: number[] = []
    for (const [dx, dy] of NEI8) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && skeleton[idx(nx, ny)]) out.push(idx(nx, ny))
    }
    return out
  }

  const pts: number[] = []
  const degree = new Uint8Array(width * height)
  for (let y = bbox.y0; y <= bbox.y1; y++) {
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      const i = idx(x, y)
      if (!skeleton[i]) continue
      pts.push(i)
      degree[i] = neighborsOf(i).length
    }
  }

  const visitedEdge = new Set<string>()
  const edgeKey = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`
  const chains: [number, number][][] = []
  const MAX_CHAIN = width * height

  // Thinning rarely leaves a single clean junction pixel — it's usually a small blob
  // of mutually-adjacent non-degree-2 pixels. Cluster those (8-connected flood fill)
  // and collapse each cluster to one representative point, so a junction renders as
  // a single node instead of a handful of near-duplicate micro-segments around it.
  const clusterOf = new Int32Array(width * height).fill(-1)
  const clusterMembers: number[][] = []
  const clusterRepXY: [number, number][] = []
  for (const p of pts) {
    if (degree[p] === 2 || clusterOf[p] !== -1) continue
    const cid = clusterMembers.length
    const members: number[] = [p]
    clusterOf[p] = cid
    const stack = [p]
    while (stack.length > 0) {
      const cur = stack.pop() as number
      for (const n of neighborsOf(cur)) {
        if (degree[n] === 2 || clusterOf[n] !== -1) continue
        clusterOf[n] = cid
        members.push(n)
        stack.push(n)
      }
    }
    clusterMembers.push(members)
    let sx = 0, sy = 0
    for (const m of members) { const [x, y] = toXY(m); sx += x; sy += y }
    const cx = sx / members.length, cy = sy / members.length
    let best = members[0], bestD = Infinity
    for (const m of members) {
      const [x, y] = toXY(m)
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d < bestD) { bestD = d; best = m }
    }
    clusterRepXY.push(toXY(best))
  }

  for (let cid = 0; cid < clusterMembers.length; cid++) {
    for (const m of clusterMembers[cid]) {
      for (const n of neighborsOf(m)) {
        if (clusterOf[n] === cid) continue // internal to the same junction blob
        const key = edgeKey(m, n)
        if (visitedEdge.has(key)) continue
        visitedEdge.add(key)
        if (clusterOf[n] !== -1) {
          // Directly touches another cluster — a zero-length bridge between two nodes.
          chains.push([clusterRepXY[cid], clusterRepXY[clusterOf[n]]])
          continue
        }
        // n starts an open degree-2 chain; walk it until the next special pixel.
        const chainPixels: number[] = [n]
        let prev = m, cur = n
        let guard = 0
        while (degree[cur] === 2 && guard++ < MAX_CHAIN) {
          const next = neighborsOf(cur).find(x => x !== prev)
          if (next === undefined) break
          const k2 = edgeKey(cur, next)
          if (visitedEdge.has(k2)) break
          visitedEdge.add(k2)
          chainPixels.push(next)
          prev = cur
          cur = next
        }
        const endCid = clusterOf[cur]
        const chainXY = chainPixels.map(toXY)
        if (endCid !== -1) chainXY[chainXY.length - 1] = clusterRepXY[endCid]
        chains.push([clusterRepXY[cid], ...chainXY])
      }
    }
  }

  // Leftover degree-2-only pixels form closed loops — walk each exactly once.
  const seenLoop = new Set<number>()
  for (const p of pts) {
    if (degree[p] !== 2 || seenLoop.has(p)) continue
    const start = p
    const startNbrs = neighborsOf(start)
    const first = startNbrs.find(n => !visitedEdge.has(edgeKey(start, n)))
    if (first === undefined) continue
    const loopChain: number[] = [start]
    seenLoop.add(start)
    visitedEdge.add(edgeKey(start, first))
    let prev = start, cur = first
    let guard = 0
    while (cur !== start && guard++ < MAX_CHAIN) {
      loopChain.push(cur)
      seenLoop.add(cur)
      const next = neighborsOf(cur).find(n => n !== prev)
      if (next === undefined) break
      visitedEdge.add(edgeKey(cur, next))
      prev = cur
      cur = next
    }
    loopChain.push(start)
    chains.push(loopChain.map(toXY))
  }

  return chains.filter(c => c.length >= 2)
}

/** End-to-end: classify -> per-tier mask -> skeletonize -> trace -> simplify.
 *  Returns pixel-space polylines grouped by tier, ready for reprojection. */
export function extractTieredLinesFromImage(imgData: ImageData, swatches: TieredLineSwatch[]): TracedLine[] {
  const { width, height } = imgData
  const result: TracedLine[] = []
  if (swatches.length === 0) return result
  const classified = classifyPixels(imgData, swatches)

  for (const tier of [0, 1, 2] as const) {
    if (!swatches.some(s => s.tier === tier)) continue
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i++) mask[i] = classified[i] === tier ? 1 : 0
    const bbox = maskBbox(mask, width, height, GAP_CLOSE_RADIUS + 2)
    if (!bbox) continue
    const bridged = bridgeMaskGaps(mask, width, height, bbox, GAP_CLOSE_RADIUS)
    const skeleton = skeletonize(bridged, width, height, bbox)
    const chains = traceSkeleton(skeleton, width, height, bbox)
    for (const chain of chains) {
      const simplified = douglasPeucker(chain, 1.5)
      if (simplified.length < 2) continue
      // Drop degenerate chains that collapse to (near-)zero length — small tendrils
      // off a thick junction blob that curl back into the same cluster.
      const length = simplified.reduce((acc, [x, y], i) => i === 0 ? 0 : acc + Math.hypot(x - simplified[i - 1][0], y - simplified[i - 1][1]), 0)
      if (length < 1) continue
      result.push({ tier, points: simplified })
    }
  }
  return result
}
