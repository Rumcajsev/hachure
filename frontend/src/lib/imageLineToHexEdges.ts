/** Snaps a free-form lon/lat polyline (traced from a map image, or any other source)
 *  onto the hex grid — port of the backend's make_lonlat_to_hex / polyline_to_hex_sequence
 *  / smooth_hex_path (services/geometry.py), so image-extracted lines resolve to the
 *  same hex-edge chains OSM ingestion would produce. No store or React imports. */

import type { GridMetadata, HexOrientation, RoadEdge } from '../store/mapStore'
import { hexAdjacent } from './geometry'

const METERS_PER_DEGREE = 111319

function roundHex(qf: number, rf: number): [number, number] {
  const x = qf, z = rf, y = -x - z
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z)
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) { /* keep ry */ }
  else rz = -rx - ry
  return [rx, rz]
}

/** Returns a closure mapping (lon, lat) -> (q, r) axial hex coords, matching the
 *  grid defined by GridMetadata (center, bearing, outer_radius_m) and orientation. */
export function makeLonLatToHex(meta: GridMetadata, hexOrientation: HexOrientation) {
  const R_m = meta.outer_radius_m
  const beta = (meta.bearing * Math.PI) / 180
  const cosB = Math.cos(beta), sinB = Math.sin(beta)
  const cosLat = Math.cos((meta.center[1] * Math.PI) / 180)
  const flatTop = hexOrientation === 'flat'

  return (lon: number, lat: number): [number, number] => {
    const E_m = (lon - meta.center[0]) * cosLat * METERS_PER_DEGREE
    const N_m = (lat - meta.center[1]) * METERS_PER_DEGREE
    const px = cosB * E_m - sinB * N_m
    const py = sinB * E_m + cosB * N_m
    let qf: number, rf: number
    if (flatTop) {
      qf = (2 * px) / (3 * R_m)
      rf = py / (R_m * Math.sqrt(3)) - px / (3 * R_m)
    } else {
      rf = (2 * py) / (3 * R_m)
      qf = px / (R_m * Math.sqrt(3)) - py / (3 * R_m)
    }
    return roundHex(qf, rf)
  }
}

/** Samples along each polyline segment at ~R_m/3 intervals and rounds each sample to
 *  its hex, keeping only hex-to-hex transitions — same density backend fetches use. */
export function polylineToHexSequence(
  coords: [number, number][],
  lonLatToHex: (lon: number, lat: number) => [number, number],
  R_m: number,
  cosLat: number,
): [number, number][] {
  const result: [number, number][] = []
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i]
    const [lon2, lat2] = coords[i + 1]
    const dE = (lon2 - lon1) * cosLat * METERS_PER_DEGREE
    const dN = (lat2 - lat1) * METERS_PER_DEGREE
    const dist = Math.hypot(dE, dN)
    const nSamples = Math.max(2, Math.floor(dist / (R_m / 3)) + 1)
    for (let j = 0; j < nSamples; j++) {
      const t = j / (nSamples - 1)
      const h = lonLatToHex(lon1 + t * (lon2 - lon1), lat1 + t * (lat2 - lat1))
      const last = result[result.length - 1]
      if (!last || last[0] !== h[0] || last[1] !== h[1]) result.push(h)
    }
  }
  return result
}

/** Collapses A -> B -> A back-and-forth flicker in a hex path (the renderer would
 *  otherwise draw a visible zigzag stub). */
export function smoothHexPath(path: [number, number][]): [number, number][] {
  let current = path
  let changed = true
  while (changed) {
    changed = false
    const next: [number, number][] = [current[0]]
    let i = 1
    while (i < current.length) {
      if (i + 1 < current.length && current[i + 1][0] === next[next.length - 1][0] && current[i + 1][1] === next[next.length - 1][1]) {
        i += 2
        changed = true
      } else {
        next.push(current[i])
        i++
      }
    }
    current = next
  }
  return current
}

/** End-to-end: lon/lat polyline -> smoothed hex path. */
export function snapWayToHexPath(coords: [number, number][], meta: GridMetadata, hexOrientation: HexOrientation): [number, number][] {
  if (coords.length < 2) return []
  const lonLatToHex = makeLonLatToHex(meta, hexOrientation)
  const cosLat = Math.cos((meta.center[1] * Math.PI) / 180)
  const path = polylineToHexSequence(coords, lonLatToHex, meta.outer_radius_m, cosLat)
  return smoothHexPath(path)
}

/** Converts a hex path into adjacency-filtered RoadEdge hops for one tier, skipping
 *  any pair already present in existingEdges (checked pair-wise regardless of tier,
 *  same rule roadsSlice's applyRoadType uses). */
export function hexPathToRoadEdges(
  hexPath: [number, number][],
  tier: 0 | 1 | 2,
  existingEdges: RoadEdge[],
): { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[] {
  const existingPairs = new Set<string>()
  for (const e of existingEdges) {
    const a = `${e.q1},${e.r1}`, b = `${e.q2},${e.r2}`
    existingPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`)
  }
  const seen = new Set<string>()
  const edges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[] = []
  for (let i = 0; i < hexPath.length - 1; i++) {
    const [q1, r1] = hexPath[i]
    const [q2, r2] = hexPath[i + 1]
    if (!hexAdjacent(q1, r1, q2, r2)) continue
    const a = `${q1},${r1}`, b = `${q2},${r2}`
    const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
    if (existingPairs.has(pairKey) || seen.has(pairKey)) continue
    seen.add(pairKey)
    edges.push({ q1, r1, q2, r2, tier })
  }
  return edges
}
