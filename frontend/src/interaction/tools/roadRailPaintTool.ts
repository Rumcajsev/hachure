import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { hexAdjacent, pointInPolygon } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'
import { roadsController } from '../../render/layers/roadsLayer'
import type { RoadNetwork } from '../../lib/roadNetwork'
import type { RailNetwork } from '../../lib/railNetwork'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface RoadRailPaintRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  hexEdgeModeRef: MutableRefObject<string>
  roadPaintModeRef: MutableRefObject<boolean>
  railPaintModeRef: MutableRefObject<boolean>
  roadPaintBrushRef: MutableRefObject<0 | 1 | 2>
  roadPaintEraserRef: MutableRefObject<boolean>
  railPaintEraserRef: MutableRefObject<boolean>
  isPaintingRef: MutableRefObject<boolean>
  prevEdgeHexRef: MutableRefObject<{ q: number; r: number } | null>
  paintBufferedAdditionsRef: MutableRefObject<{ q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[]>
  paintBufferedRemovalsRef: MutableRefObject<{ q1: number; r1: number; q2: number; r2: number }[]>
  railBufferedAdditionsRef: MutableRefObject<{ q1: number; r1: number; q2: number; r2: number }[]>
  railBufferedRemovalsRef: MutableRefObject<{ q1: number; r1: number; q2: number; r2: number }[]>
  skipExpensiveLayersRef: MutableRefObject<boolean>
  roadNetworkRef: MutableRefObject<RoadNetwork>
  railNetworkRef: MutableRefObject<RailNetwork>
  batchAddRoadEdgesRef: MutableRefObject<(edges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[]) => void>
  batchRemoveRoadEdgesRef: MutableRefObject<(edges: { q1: number; r1: number; q2: number; r2: number }[]) => void>
  addRoadEdgeRef: MutableRefObject<(q1: number, r1: number, q2: number, r2: number, tier: 0 | 1 | 2) => void>
  removeRoadEdgeAllTiersRef: MutableRefObject<(q1: number, r1: number, q2: number, r2: number) => void>
  batchAddRailEdgesRef: MutableRefObject<(edges: { q1: number; r1: number; q2: number; r2: number }[]) => void>
  batchRemoveRailEdgesRef: MutableRefObject<(edges: { q1: number; r1: number; q2: number; r2: number }[]) => void>
  addRailEdgeRef: MutableRefObject<(q1: number, r1: number, q2: number, r2: number) => void>
  removeRailEdgeRef: MutableRefObject<(q1: number, r1: number, q2: number, r2: number) => void>
  drawRef: MutableRefObject<() => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
  setRoadDataVersion: (updater: (v: number) => number) => void
}

function paintAtClient(clientX: number, clientY: number, refs: RoadRailPaintRefs) {
  const { metaRef, hexesRef, hexEdgeModeRef, roadPaintModeRef, railPaintModeRef,
    roadPaintBrushRef, roadPaintEraserRef, railPaintEraserRef, prevEdgeHexRef,
    paintBufferedAdditionsRef, paintBufferedRemovalsRef, railBufferedAdditionsRef, railBufferedRemovalsRef,
    roadNetworkRef, railNetworkRef,
    clientToLogical, getPaper, drawRef } = refs

  const meta = metaRef.current
  if (!meta) return
  const logical = clientToLogical(clientX, clientY)
  if (!logical) return
  const { lx, ly, cssW, cssH } = logical
  const { pw, ph, px, py } = getPaper(cssW, cssH)
  const mgPx = meta.margin_mm * (pw / meta.paper_mm[0])
  const marginL = px + mgPx, marginR = px + pw - mgPx
  const marginT = py + mgPx, marginB = py + ph - mgPx
  const inMargin = (verts: [number, number][]) =>
    verts.every(([x, y]) => x >= marginL && x <= marginR && y >= marginT && y <= marginB)

  for (const hex of hexesRef.current) {
    if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
    const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
    if (!hex.partial && !inMargin(verts)) continue
    if (!pointInPolygon(lx, ly, verts)) continue

    const isRoad = roadPaintModeRef.current
    const isRail = railPaintModeRef.current

    if (isRoad) {
      const tier = roadPaintBrushRef.current
      const eraser = roadPaintEraserRef.current
      const prev = prevEdgeHexRef.current
      if (prev && (prev.q !== hex.q || prev.r !== hex.r) && hexAdjacent(prev.q, prev.r, hex.q, hex.r)) {
        if (eraser) {
          roadNetworkRef.current.removeEdge(prev.q, prev.r, hex.q, hex.r)
          paintBufferedRemovalsRef.current.push({ q1: prev.q, r1: prev.r, q2: hex.q, r2: hex.r })
        } else {
          roadNetworkRef.current.addEdge(prev.q, prev.r, hex.q, hex.r, tier)
          paintBufferedAdditionsRef.current.push({ q1: prev.q, r1: prev.r, q2: hex.q, r2: hex.r, tier })
        }
        roadsController.markDirty()
        drawRef.current()
      }
    } else if (isRail) {
      const eraser = railPaintEraserRef.current
      const prev = prevEdgeHexRef.current
      if (prev && (prev.q !== hex.q || prev.r !== hex.r) && hexAdjacent(prev.q, prev.r, hex.q, hex.r)) {
        if (eraser) {
          railNetworkRef.current.removeEdge(prev.q, prev.r, hex.q, hex.r)
          railBufferedRemovalsRef.current.push({ q1: prev.q, r1: prev.r, q2: hex.q, r2: hex.r })
        } else {
          railNetworkRef.current.addEdge(prev.q, prev.r, hex.q, hex.r)
          railBufferedAdditionsRef.current.push({ q1: prev.q, r1: prev.r, q2: hex.q, r2: hex.r })
        }
        roadsController.markDirty()
        drawRef.current()
      }
    }

    prevEdgeHexRef.current = { q: hex.q, r: hex.r }
    break
  }
}

/** Attaches road/rail stroke paint handlers to `el`. Returns cleanup. */
export function attachRoadRailPaintHandlers(el: HTMLElement, refs: RoadRailPaintRefs): () => void {
  const { roadPaintModeRef, railPaintModeRef,
    isPaintingRef, prevEdgeHexRef,
    paintBufferedAdditionsRef, paintBufferedRemovalsRef, railBufferedAdditionsRef, railBufferedRemovalsRef,
    skipExpensiveLayersRef, batchAddRoadEdgesRef, batchRemoveRoadEdgesRef,
    batchAddRailEdgesRef, batchRemoveRailEdgesRef,
    drawRef, setRoadDataVersion } = refs

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (!roadPaintModeRef.current && !railPaintModeRef.current) return
    isPaintingRef.current = true
    paintBufferedAdditionsRef.current = []
    paintBufferedRemovalsRef.current = []
    railBufferedAdditionsRef.current = []
    railBufferedRemovalsRef.current = []
    prevEdgeHexRef.current = null
    paintAtClient(e.clientX, e.clientY, refs)
  }
  const onMove = (e: MouseEvent) => {
    if (!isPaintingRef.current) return
    if (!roadPaintModeRef.current && !railPaintModeRef.current) return
    paintAtClient(e.clientX, e.clientY, refs)
  }
  const onUp = () => {
    isPaintingRef.current = false
    batchAddRoadEdgesRef.current(paintBufferedAdditionsRef.current)
    batchRemoveRoadEdgesRef.current(paintBufferedRemovalsRef.current)
    batchAddRailEdgesRef.current(railBufferedAdditionsRef.current)
    batchRemoveRailEdgesRef.current(railBufferedRemovalsRef.current)
    paintBufferedAdditionsRef.current = []
    paintBufferedRemovalsRef.current = []
    railBufferedAdditionsRef.current = []
    railBufferedRemovalsRef.current = []
    skipExpensiveLayersRef.current = true
    setRoadDataVersion(v => v + 1)
    requestAnimationFrame(() => {
      skipExpensiveLayersRef.current = false
      drawRef.current()
    })
  }

  el.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  return () => {
    el.removeEventListener('mousedown', onDown)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
}
