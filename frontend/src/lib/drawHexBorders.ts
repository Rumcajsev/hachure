/** Hex grid border rendering. Pure canvas operations — no React or store imports. */

import type { GeneratedHex } from '../store/mapStore'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function drawHexBorders(
  bCtx: Ctx,
  projected: { hex: GeneratedHex; verts: [number, number][] }[],
  borderMode: string,
  edgeMode: string,
  inMargin: (verts: [number, number][]) => boolean,
  lineScale = 1,
  excludedKeys?: Set<string>,
  opacity = 0.35,
  color = '#000000',
  difference = false,
) {
  const borderLW = 0.5 * lineScale
  bCtx.save()
  bCtx.globalAlpha = opacity
  if (difference) bCtx.globalCompositeOperation = 'difference'
  const strokeColor = difference ? '#ffffff' : color
  for (const { hex, verts } of projected) {
    if (edgeMode === 'whole' && hex.partial) continue
    if (!hex.partial && !inMargin(verts)) continue
    if (excludedKeys?.has(`${hex.q},${hex.r}`)) continue
    if (borderMode === 'full') {
      bCtx.beginPath()
      bCtx.moveTo(verts[0][0], verts[0][1])
      for (let i = 1; i < verts.length; i++) bCtx.lineTo(verts[i][0], verts[i][1])
      bCtx.closePath()
      bCtx.strokeStyle = strokeColor
      bCtx.lineWidth = borderLW
      bCtx.stroke()
    } else if (borderMode === 'stubs') {
      bCtx.strokeStyle = strokeColor
      bCtx.lineWidth = borderLW
      for (let i = 0; i < verts.length; i++) {
        const [x0, y0] = verts[i]
        const [x1, y1] = verts[(i + 1) % verts.length]
        const t = 0.22
        bCtx.beginPath()
        bCtx.moveTo(x0, y0)
        bCtx.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
        bCtx.stroke()
        bCtx.beginPath()
        bCtx.moveTo(x1 + (x0 - x1) * t, y1 + (y0 - y1) * t)
        bCtx.lineTo(x1, y1)
        bCtx.stroke()
      }
    } else if (borderMode === 'dashed') {
      // 3 explicit segments per edge at 1/7–2/7, 3/7–4/7, 5/7–6/7.
      // Gaps at both vertex ends; no setLineDash offset arithmetic.
      bCtx.strokeStyle = strokeColor
      bCtx.lineWidth = borderLW
      const segs: [number, number][] = [[1 / 7, 2 / 7], [3 / 7, 4 / 7], [5 / 7, 6 / 7]]
      for (let i = 0; i < verts.length; i++) {
        const [x0, y0] = verts[i]
        const [x1, y1] = verts[(i + 1) % verts.length]
        for (const [t0, t1] of segs) {
          bCtx.beginPath()
          bCtx.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0)
          bCtx.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)
          bCtx.stroke()
        }
      }
    }
  }
  bCtx.restore()
}

// Collect the boundary edges of the visible hex grid (edges not shared between two visible hexes).
function collectBoundaryEdges(
  projected: { hex: GeneratedHex; verts: [number, number][] }[],
  edgeMode: string,
  inMargin: (verts: [number, number][]) => boolean,
  excludedKeys?: Set<string>,
): Array<[[number, number], [number, number]]> {
  const snap = (n: number) => Math.round(n * 10) / 10
  const vkey = (v: [number, number]) => `${snap(v[0])},${snap(v[1])}`
  // Map from canonical edge key → [v0, v1]. Deleted when seen twice (interior).
  const edgeMap = new Map<string, [[number, number], [number, number]]>()

  for (const { hex, verts } of projected) {
    if (edgeMode === 'whole' && hex.partial) continue
    if (!hex.partial && !inMargin(verts)) continue
    if (excludedKeys?.has(`${hex.q},${hex.r}`)) continue

    for (let i = 0; i < verts.length; i++) {
      const v0 = verts[i] as [number, number]
      const v1 = verts[(i + 1) % verts.length] as [number, number]
      const k0 = vkey(v0), k1 = vkey(v1)
      const ek = k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`
      if (edgeMap.has(ek)) {
        edgeMap.delete(ek)
      } else {
        edgeMap.set(ek, [v0, v1])
      }
    }
  }

  return Array.from(edgeMap.values())
}

// Chain boundary edge segments into closed loops.
export function chainBoundaryEdges(
  edges: Array<[[number, number], [number, number]]>,
): Array<[number, number][]> {
  if (edges.length === 0) return []

  const snap = (n: number) => Math.round(n * 10) / 10
  const vkey = (v: [number, number]) => `${snap(v[0])},${snap(v[1])}`

  // vertex key → list of {neighbor key, neighbor vert, edge index}
  type Neighbor = { nk: string; nv: [number, number]; idx: number }
  const adj = new Map<string, Neighbor[]>()
  edges.forEach(([a, b], idx) => {
    const ka = vkey(a), kb = vkey(b)
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka)!.push({ nk: kb, nv: b, idx })
    adj.get(kb)!.push({ nk: ka, nv: a, idx })
  })

  const visitedEdges = new Set<number>()
  const loops: Array<[number, number][]> = []

  for (let startIdx = 0; startIdx < edges.length; startIdx++) {
    if (visitedEdges.has(startIdx)) continue

    const loop: [number, number][] = []
    let [curVert, nextVert] = edges[startIdx]
    let curKey = vkey(curVert)
    let nextKey = vkey(nextVert)
    let edgeIdx = startIdx

    while (!visitedEdges.has(edgeIdx)) {
      visitedEdges.add(edgeIdx)
      loop.push(curVert)

      const prevKey = curKey
      curVert = nextVert
      curKey = nextKey

      const neighbors = adj.get(curKey) ?? []
      const next =
        neighbors.find(n => !visitedEdges.has(n.idx) && n.nk !== prevKey) ??
        neighbors.find(n => !visitedEdges.has(n.idx))
      if (!next) break

      nextVert = next.nv
      nextKey = next.nk
      edgeIdx = next.idx
    }

    if (loop.length >= 3) loops.push(loop)
  }

  return loops
}

/** Draw a stroke along the outer boundary of the visible hex grid. */
export function drawMapBoundary(
  ctx: Ctx,
  projected: { hex: GeneratedHex; verts: [number, number][] }[],
  edgeMode: string,
  inMargin: (verts: [number, number][]) => boolean,
  color: string,
  lineWidth: number,
  lineScale = 1,
  excludedKeys?: Set<string>,
) {
  const edges = collectBoundaryEdges(projected, edgeMode, inMargin, excludedKeys)
  const loops = chainBoundaryEdges(edges)
  if (loops.length === 0) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth * lineScale
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const loop of loops) {
    ctx.beginPath()
    ctx.moveTo(loop[0][0], loop[0][1])
    for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i][0], loop[i][1])
    ctx.closePath()
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Fill the paper area outside the visible hex grid with bgColor.
 * Clipped to the paper rect so partial-hex vertices outside the paper don't bleed.
 */
export function drawHexGridMask(
  ctx: Ctx,
  projected: { hex: GeneratedHex; verts: [number, number][] }[],
  edgeMode: string,
  inMargin: (verts: [number, number][]) => boolean,
  px: number, py: number, pw: number, ph: number,
  bgColor: string,
  excludedKeys?: Set<string>,
) {
  ctx.save()
  // Clip to paper so partial-hex polygons that extend outside don't punch holes there.
  ctx.beginPath()
  ctx.rect(px, py, pw, ph)
  ctx.clip()

  ctx.beginPath()
  ctx.rect(px, py, pw, ph)
  for (const { hex, verts } of projected) {
    if (edgeMode === 'whole' && hex.partial) continue
    if (!hex.partial && !inMargin(verts)) continue
    if (excludedKeys?.has(`${hex.q},${hex.r}`)) continue
    ctx.moveTo(verts[0][0], verts[0][1])
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
    ctx.closePath()
  }
  ctx.fillStyle = bgColor
  ctx.fill('evenodd')
  ctx.restore()
}

/** Fill excluded hexes with bgColor, covering any content underneath them. */
export function drawExcludedHexOverlay(
  ctx: Ctx,
  projected: { hex: GeneratedHex; verts: [number, number][] }[],
  excludedKeys: Set<string>,
  bgColor: string,
) {
  if (excludedKeys.size === 0) return
  ctx.save()
  ctx.fillStyle = bgColor
  for (const { hex, verts } of projected) {
    if (!excludedKeys.has(`${hex.q},${hex.r}`)) continue
    ctx.beginPath()
    ctx.moveTo(verts[0][0], verts[0][1])
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}
