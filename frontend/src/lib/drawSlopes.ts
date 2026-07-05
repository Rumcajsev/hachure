/** Slope-edge (escarpment) rendering — hachure, shading, or contour styles. */

import { parseEdgeBlobKey, sharedEdgeVertices } from './edgeBlobs'
import { chaikin } from './geometry'
import { mulberry32 } from './noise'
import type { SlopeStyle } from '../store/mapStore'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type SlopeHoverTarget = {
  edgeKey: string
  p1: [number, number]
  p2: [number, number]
  highHexKey: string
  lowCenter: [number, number]
} | null

// ── Chain building ────────────────────────────────────────────────────────────

type Segment = {
  p1: [number, number]
  p2: [number, number]
  perpLow: [number, number]   // unit vector toward the downhill side
  lowHexKey: string
}

type SlopeChain = {
  pts: [number, number][]
  perpLows: [number, number][]  // perpLow for each segment (length = pts.length - 1)
  isLoop: boolean
}

function vKey(p: [number, number]): string {
  return `${Math.round(p[0])},${Math.round(p[1])}`
}

function buildSegments(
  slopeEdges: Record<string, string>,
  hexVertMap: Map<string, [number, number][]>,
): Segment[] {
  const segs: Segment[] = []
  for (const [edgeKey, highHexKey] of Object.entries(slopeEdges)) {
    const { q1, r1, q2, r2 } = parseEdgeBlobKey(edgeKey)
    const isHigh1 = `${q1},${r1}` === highHexKey
    const lowQ = isHigh1 ? q2 : q1, lowR = isHigh1 ? r2 : r1

    const shared = sharedEdgeVertices(q1, r1, q2, r2, hexVertMap)
    if (!shared) continue
    const lowVerts = hexVertMap.get(`${lowQ},${lowR}`)
    if (!lowVerts) continue

    const midX = (shared[0][0] + shared[1][0]) / 2
    const midY = (shared[0][1] + shared[1][1]) / 2
    const lowCx = lowVerts.reduce((s, v) => s + v[0], 0) / lowVerts.length
    const lowCy = lowVerts.reduce((s, v) => s + v[1], 0) / lowVerts.length
    const toLowX = lowCx - midX, toLowY = lowCy - midY
    const toLowLen = Math.hypot(toLowX, toLowY)
    if (toLowLen < 1) continue

    segs.push({
      p1: shared[0],
      p2: shared[1],
      perpLow: [toLowX / toLowLen, toLowY / toLowLen],
      lowHexKey: `${lowQ},${lowR}`,
    })
  }
  return segs
}

function buildChains(segs: Segment[]): SlopeChain[] {
  if (segs.length === 0) return []

  // Vertex adjacency graph: key → [{segIdx, otherKey}]
  const adj = new Map<string, { segIdx: number; otherKey: string }[]>()
  const vertPos = new Map<string, [number, number]>()

  for (let i = 0; i < segs.length; i++) {
    const k1 = vKey(segs[i].p1), k2 = vKey(segs[i].p2)
    vertPos.set(k1, segs[i].p1)
    vertPos.set(k2, segs[i].p2)
    if (!adj.has(k1)) adj.set(k1, [])
    if (!adj.has(k2)) adj.set(k2, [])
    adj.get(k1)!.push({ segIdx: i, otherKey: k2 })
    adj.get(k2)!.push({ segIdx: i, otherKey: k1 })
  }

  const usedSegs = new Set<number>()
  const chains: SlopeChain[] = []

  const trace = (startKey: string) => {
    const pts: [number, number][] = [vertPos.get(startKey)!]
    const perpLows: [number, number][] = []
    let curKey = startKey

    while (true) {
      const available = (adj.get(curKey) ?? []).filter(e => !usedSegs.has(e.segIdx))
      if (available.length === 0) break
      const { segIdx, otherKey } = available[0]
      usedSegs.add(segIdx)
      perpLows.push(segs[segIdx].perpLow)
      pts.push(vertPos.get(otherKey)!)
      curKey = otherKey
      if (curKey === startKey) break  // completed a loop
    }

    if (pts.length >= 2) {
      const isLoop = vKey(pts[0]) === vKey(pts[pts.length - 1])
      chains.push({ pts, perpLows, isLoop })
    }
  }

  // Endpoints (degree 1) first so chains start/end cleanly
  for (const [k, edges] of adj) {
    if (edges.length !== 1) continue
    if (edges.every(e => usedSegs.has(e.segIdx))) continue
    trace(k)
  }

  // Remaining (loops or junctions)
  for (const [k, edges] of adj) {
    if (edges.every(e => usedSegs.has(e.segIdx))) continue
    trace(k)
  }

  return chains
}

// ── Hachure drawing ───────────────────────────────────────────────────────────

function drawHachureChain(
  ctx: Ctx,
  chain: SlopeChain,
  R: number,
  smooth: boolean,
  alpha: number,
  color: string,
  tickSpacingFactor: number,
  tickLengthFactor: number,
): void {
  const tickLen = R * tickLengthFactor
  const tickSpacing = R * tickSpacingFactor

  // Arc lengths on the original pts, used to map smoothed arc pos → perpLow
  const origArcs: number[] = [0]
  for (let i = 1; i < chain.pts.length; i++) {
    const dx = chain.pts[i][0] - chain.pts[i - 1][0]
    const dy = chain.pts[i][1] - chain.pts[i - 1][1]
    origArcs.push(origArcs[i - 1] + Math.hypot(dx, dy))
  }
  const origTotal = origArcs[origArcs.length - 1]

  const getPerpLow = (arcPos: number): [number, number] => {
    const target = origTotal > 0 ? Math.min(origTotal, arcPos) : 0
    let si = 0
    for (let i = 1; i < origArcs.length - 1; i++) {
      if (origArcs[i] <= target) si = i
    }
    return chain.perpLows[Math.min(si, chain.perpLows.length - 1)]
  }

  // Optionally smooth
  const pts = smooth
    ? chaikin(chain.pts, 2, chain.isLoop)
    : chain.pts

  // Arc lengths on drawn pts
  const arcs: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    arcs.push(arcs[i - 1] + Math.hypot(dx, dy))
  }
  const total = arcs[arcs.length - 1]
  if (total < 1) return

  const nTicks = Math.max(1, Math.round(total / tickSpacing))

  // Seed from first chain vertex for determinism across re-renders
  const rng = mulberry32(Math.round(chain.pts[0][0] * 7 + chain.pts[0][1] * 13))
  const rand   = () => rng()
  const signed = (amt: number) => (rand() - 0.5) * 2 * amt

  // Parse hex color once for rgba() compositing
  const cr = parseInt(color.slice(1, 3), 16)
  const cg = parseInt(color.slice(3, 5), 16)
  const cb = parseInt(color.slice(5, 7), 16)
  const rgba = (a: number) => `rgba(${cr},${cg},${cb},${a.toFixed(2)})`

  ctx.save()
  ctx.lineCap = 'round'

  for (let ti = 0; ti <= nTicks; ti++) {
    const targetArc = (ti / nTicks) * total

    // Find segment
    let si = pts.length - 2
    for (let i = 1; i < arcs.length; i++) {
      if (arcs[i] >= targetArc) { si = i - 1; break }
    }
    si = Math.max(0, Math.min(si, pts.length - 2))

    const segLen = arcs[si + 1] - arcs[si]
    const t = segLen > 0 ? (targetArc - arcs[si]) / segLen : 0
    const x = pts[si][0] + t * (pts[si + 1][0] - pts[si][0])
    const y = pts[si][1] + t * (pts[si + 1][1] - pts[si][1])

    // Local tangent
    const dx = pts[si + 1][0] - pts[si][0]
    const dy = pts[si + 1][1] - pts[si][1]
    const tLen = Math.hypot(dx, dy)
    if (tLen < 0.001) continue

    // Perpendicular toward low side
    const c1x = -dy / tLen, c1y = dx / tLen
    const origArcPos = smooth && total > 0 ? (targetArc / total) * origTotal : targetArc
    const [plx, ply] = getPerpLow(origArcPos)
    const dot = c1x * plx + c1y * ply
    const [px, py] = dot >= 0 ? [c1x, c1y] : [dy / tLen, -dx / tLen]

    // Main tick — offset 25% off the edge, length jitter, position jitter, bezier bow
    const len    = tickLen * (0.8 + rand() * 0.4)
    const inset  = len * 0.25
    const ox = x - px * inset + signed(0.6), oy = y - py * inset + signed(0.6)
    const ex = ox + px * len,                ey = oy + py * len
    const bow = signed(R * 0.025)
    const cpx = (ox + ex) / 2 - py * bow
    const cpy = (oy + ey) / 2 + px * bow

    ctx.lineWidth = R * 0.038 * (0.88 + rand() * 0.24)
    ctx.strokeStyle = rgba(alpha * (0.82 + rand() * 0.18))
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.stroke()

    // Shadow stroke — shorter, pulled ~40% downhill, slightly offset along chain
    if (rand() > 0.3) {
      const sLen = len * (0.35 + rand() * 0.2)
      const pull = R * 0.08
      const sx = ox + px * pull + signed(0.5)
      const sy = oy + py * pull + signed(0.5)
      const sbow = signed(R * 0.015)
      const scpx = (sx + sx + px * sLen) / 2 - py * sbow
      const scpy = (sy + sy + py * sLen) / 2 + px * sbow
      ctx.lineWidth = R * 0.032 * (0.85 + rand() * 0.2)
      ctx.strokeStyle = rgba(alpha * (0.45 + rand() * 0.25))
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo(scpx, scpy, sx + px * sLen, sy + py * sLen)
      ctx.stroke()
    }
  }

  ctx.restore()
}

// ── Polygon shadow (shared by slope shading + elevation blob shadow) ─────────

export function drawPolygonShadow(
  ctx: Ctx,
  polys: [number, number][][],
  pw: number,
  ph: number,
  ox: number,
  oy: number,
  bl: number,
  op: number,   // 0–100
  ps: number,
  color: string,
  clipPolys?: [number, number][][],
): void {
  if (polys.length === 0) return
  const off = new OffscreenCanvas(pw, ph)
  const oCtx = off.getContext('2d')!
  oCtx.fillStyle = color
  oCtx.beginPath()
  for (const poly of polys) {
    if (poly.length < 3) continue
    oCtx.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) oCtx.lineTo(poly[i][0], poly[i][1])
    oCtx.closePath()
  }
  oCtx.fill()
  const opacity = op / 100
  for (let i = 0; i < ps; i++) {
    const t = ps === 1 ? 1 : i / (ps - 1)
    const passBlur = bl * (0.6 + t * 0.4)
    const passOp   = opacity * (1 - t * 0.3)
    ctx.save()
    if (clipPolys && clipPolys.length > 0) {
      ctx.beginPath()
      for (const cp of clipPolys) {
        if (cp.length < 3) continue
        ctx.moveTo(cp[0][0], cp[0][1])
        for (let j = 1; j < cp.length; j++) ctx.lineTo(cp[j][0], cp[j][1])
        ctx.closePath()
      }
      ctx.clip()
    }
    ctx.filter = `blur(${passBlur.toFixed(1)}px)`
    ctx.globalAlpha = passOp
    ctx.drawImage(off, ox * (0.5 + t * 0.5), oy * (0.5 + t * 0.5))
    ctx.restore()
  }
}

// ── Edge shadow polygons ──────────────────────────────────────────────────────

function buildChainShadowPolygons(chains: SlopeChain[], R: number, smooth = false): [number, number][][] {
  const depth = R * 0.18
  const SUBS = 4
  const polys: [number, number][][] = []

  for (const { pts: origPts, perpLows, isLoop } of chains) {
    if (origPts.length < 2) continue

    // Original arc lengths — used to map smoothed arc position → perpLow segment
    const origArcs: number[] = [0]
    for (let i = 1; i < origPts.length; i++)
      origArcs.push(origArcs[i - 1] + Math.hypot(origPts[i][0] - origPts[i - 1][0], origPts[i][1] - origPts[i - 1][1]))
    const origTotal = origArcs[origArcs.length - 1]
    if (origTotal < 1) continue

    const getPerpLow = (s: number): [number, number] => {
      const target = Math.min(origTotal, s)
      let si = 0
      for (let i = 1; i < origArcs.length - 1; i++) { if (origArcs[i] <= target) si = i }
      return perpLows[Math.min(si, perpLows.length - 1)]
    }

    const pts = smooth ? chaikin(origPts, 2, isLoop) : origPts

    const arcLengths: number[] = [0]
    for (let i = 1; i < pts.length; i++)
      arcLengths.push(arcLengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const total = arcLengths[arcLengths.length - 1]
    if (total < 1) continue

    const nSegs = pts.length - 1
    const poly: [number, number][] = pts.slice() as [number, number][]

    for (let k = nSegs - 1; k >= 0; k--) {
      const segArcStart = arcLengths[k]
      const segLen = arcLengths[k + 1] - segArcStart
      const jStart = k === nSegs - 1 ? SUBS : SUBS - 1
      for (let j = jStart; j >= 0; j--) {
        const t = j / SUBS
        const s = segArcStart + t * segLen
        const taper = Math.sin((s / total) * Math.PI)
        const origS = smooth && total > 0 ? (s / total) * origTotal : s
        const [px, py] = getPerpLow(origS)
        const ex = pts[k][0] + t * (pts[k + 1][0] - pts[k][0])
        const ey = pts[k][1] + t * (pts[k + 1][1] - pts[k][1])
        poly.push([ex + px * depth * taper, ey + py * depth * taper])
      }
    }

    polys.push(poly)
  }

  return polys
}

// ── Blob hachure (elevation types) ───────────────────────────────────────────

function polygonToChain(polygon: [number, number][]): SlopeChain {
  if (polygon.length < 3) return { pts: [], perpLows: [], isLoop: false }

  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length

  const perpLows: [number, number][] = []
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length]
    const midX = (p1[0] + p2[0]) / 2, midY = (p1[1] + p2[1]) / 2
    const dx = midX - cx, dy = midY - cy
    const len = Math.hypot(dx, dy)
    perpLows.push(len > 0.001 ? [dx / len, dy / len] : [0, 1])
  }

  // Close the loop by appending the first point
  return { pts: [...polygon, polygon[0]], perpLows, isLoop: false }
}

export function drawBlobHachure(
  ctx: Ctx,
  polygons: [number, number][][],
  R: number,
  smooth: boolean,
  tickSpacingFactor: number,
  tickLengthFactor: number,
  color: string,
): void {
  for (const polygon of polygons) {
    const chain = polygonToChain(polygon)
    if (chain.pts.length < 2) continue
    drawHachureChain(ctx, chain, R, smooth, 0.85, color, tickSpacingFactor, tickLengthFactor)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function drawSlopes(
  ctx: Ctx,
  slopeEdges: Record<string, string>,
  hexVertMap: Map<string, [number, number][]>,
  R: number,
  style: SlopeStyle = 'hachure',
  smooth = false,
  tickSpacingFactor = 0.18,
  tickLengthFactor = 0.22,
  color = '#5a4a3a',
  pw = 0,
  ph = 0,
  shadowOx = 14,
  shadowOy = 16,
  shadowBl = 22,
  shadowOp = 30,
  shadowPs = 3,
  shadowColor = '#8a6840',
): void {
  if (style === 'shading') {
    const segs = buildSegments(slopeEdges, hexVertMap)
    const chains = buildChains(segs)
    const polys = buildChainShadowPolygons(chains, R, smooth)
    const seen = new Set<string>()
    const clipPolys: [number, number][][] = []
    for (const seg of segs) {
      if (seen.has(seg.lowHexKey)) continue
      seen.add(seg.lowHexKey)
      const verts = hexVertMap.get(seg.lowHexKey)
      if (verts && verts.length >= 3) clipPolys.push(verts)
    }
    drawPolygonShadow(ctx, polys, pw, ph, 0, 0, shadowBl, shadowOp, shadowPs, shadowColor, clipPolys)
    return
  }

  const chains = buildChains(buildSegments(slopeEdges, hexVertMap))

  if (style === 'hachure') {
    for (const chain of chains)
      drawHachureChain(ctx, chain, R, smooth, 0.85, color, tickSpacingFactor, tickLengthFactor)
    return
  }

  // contour — TODO
  for (const chain of chains)
    drawHachureChain(ctx, chain, R, smooth, 0.85, color, tickSpacingFactor, tickLengthFactor)
}

export function drawSlopeHover(
  ctx: Ctx,
  hover: SlopeHoverTarget,
  R: number,
  color = '#5a4a3a',
): void {
  if (!hover) return
  const tickLen = R * 0.22
  const edgeDx = hover.p2[0] - hover.p1[0], edgeDy = hover.p2[1] - hover.p1[1]
  const edgeLen = Math.hypot(edgeDx, edgeDy)
  if (edgeLen < 1) return

  const midX = (hover.p1[0] + hover.p2[0]) / 2, midY = (hover.p1[1] + hover.p2[1]) / 2
  const toLowX = hover.lowCenter[0] - midX, toLowY = hover.lowCenter[1] - midY
  const toLowLen = Math.hypot(toLowX, toLowY)
  if (toLowLen < 1) return
  const perpX = toLowX / toLowLen, perpY = toLowY / toLowLen

  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = color
  ctx.lineWidth = R * 0.04
  ctx.lineCap = 'round'
  ctx.beginPath()
  const TICKS = 3
  for (let i = 0; i < TICKS; i++) {
    const t = (i + 1) / (TICKS + 1)
    const ox = hover.p1[0] + edgeDx * t
    const oy = hover.p1[1] + edgeDy * t
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + perpX * tickLen, oy + perpY * tickLen)
  }
  ctx.stroke()
  ctx.restore()
}
