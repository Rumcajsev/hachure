/** Mega hex grid overlay — draws a coarser hexagonal grid on top of the small hex grid.
 *
 *  Lattice math: for radius R, each mega hex contains 3R²+3R+1 small hexes.
 *  Basis vectors: a1=(2R+1, -R), a2=(R, R+1), det=3R²+3R+1.
 *  Inverse: i=((R+1)*dq - R*dr)/N,  j=(R*dq + (2R+1)*dr)/N
 *  where dq,dr are relative to the origin hex. */

import type { GeneratedHex } from '../store/mapStore'
import { chainBoundaryEdges } from './drawHexBorders'
import { drawPatternAlongPath, type LinePattern } from './drawHighlights'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface MegaHexGridParams {
  projected: { hex: GeneratedHex; verts: [number, number][] }[]
  radius: number
  color: string
  opacity: number
  lineWidth: number
  lineScale: number
  originQ: number
  originR: number
  edgeMode: string
  inMargin: (verts: [number, number][]) => boolean
  linePattern: LinePattern | 'none'
  patternSpacing: number
}

function latticeIndex(
  q: number, r: number,
  originQ: number, originR: number,
  R: number,
  N: number,
): [number, number] {
  const dq = q - originQ
  const dr = r - originR
  const iFrac = ((R + 1) * dq - R * dr) / N
  const jFrac = (R * dq + (2 * R + 1) * dr) / N

  // Simple rounding fails for non-orthogonal lattices — test all 4 candidates
  // and pick whichever lattice center is closest in the axial metric.
  const iF = Math.floor(iFrac)
  const jF = Math.floor(jFrac)
  const a1q = 2 * R + 1, a1r = -R
  const a2q = R,         a2r = R + 1
  let bestI = iF, bestJ = jF, bestDist = Infinity
  for (let di = 0; di <= 1; di++) {
    for (let dj = 0; dj <= 1; dj++) {
      const i = iF + di, j = jF + dj
      const cq = originQ + i * a1q + j * a2q
      const cr = originR + i * a1r + j * a2r
      const ddq = q - cq, ddr = r - cr
      const dist = (Math.abs(ddq) + Math.abs(ddr) + Math.abs(ddq + ddr)) / 2
      if (dist < bestDist) { bestDist = dist; bestI = i; bestJ = j }
    }
  }
  return [bestI, bestJ]
}

export function drawMegaHexGrid(ctx: Ctx, params: MegaHexGridParams): void {
  const {
    projected, radius: R, color, opacity, lineWidth, lineScale, originQ, originR,
    edgeMode, inMargin, linePattern, patternSpacing,
  } = params
  if (!projected.length || opacity <= 0 || lineWidth <= 0) return

  const N = 3 * R * R + 3 * R + 1

  const vKey = (v: [number, number]) => `${Math.round(v[0] * 10)},${Math.round(v[1] * 10)}`
  type DirEdge = [[number, number], [number, number]]

  // Tag every visible hex edge with the lattice group (mega hex) its hex belongs to.
  // An edge touched by hexes from two DIFFERENT groups is a real mega-hex boundary.
  // An edge touched by only one hex has no neighbor on the other side at all — that's
  // the edge of the generated map itself (edgeMode cutoff, margin, or missing data),
  // not a mega-hex boundary — so it's dropped rather than traced.
  const edgeGroups = new Map<string, { edge: DirEdge; groups: Set<string> }>()
  for (const { hex, verts } of projected) {
    if (edgeMode === 'whole' && hex.partial) continue
    if (!hex.partial && !inMargin(verts)) continue
    const [i, j] = latticeIndex(hex.q, hex.r, originQ, originR, R, N)
    const groupKey = `${i},${j}`
    for (let k = 0; k < 6; k++) {
      const v1 = verts[k], v2 = verts[(k + 1) % 6]
      const k1 = vKey(v1), k2 = vKey(v2)
      const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
      let entry = edgeGroups.get(ek)
      if (!entry) { entry = { edge: [v1, v2], groups: new Set() }; edgeGroups.set(ek, entry) }
      entry.groups.add(groupKey)
    }
  }

  const boundaryEdges: DirEdge[] = []
  for (const { edge, groups } of edgeGroups.values()) {
    if (groups.size === 2) boundaryEdges.push(edge)
  }
  if (boundaryEdges.length === 0) return

  const loops = chainBoundaryEdges(boundaryEdges)
  if (loops.length === 0) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth * lineScale
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalAlpha = opacity

  for (const loop of loops) {
    if (loop.length < 3) continue
    if (linePattern === 'none') {
      ctx.beginPath()
      ctx.moveTo(loop[0][0], loop[0][1])
      for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i][0], loop[i][1])
      ctx.closePath()
      ctx.stroke()
    } else {
      drawPatternAlongPath(ctx, loop, linePattern, lineWidth * lineScale, true, patternSpacing)
    }
  }

  ctx.restore()
}
