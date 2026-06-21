import type { MutableRefObject } from 'react'
import { pointInPolygon, distToSeg } from '../../lib/geometry'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null

type BlobHandleData = Map<string, {
  terrain: string
  handles: { edgeKey: string; cx: number; cy: number }[]
  simplifiedPolys: [number, number][][]
}>

export interface BlobHandleRefs {
  zoomRef: MutableRefObject<number>
  hexRadiusRef: MutableRefObject<number>
  blobEditModeRef: MutableRefObject<boolean>
  activeBlobEditIdRef: MutableRefObject<string | null>
  hoveredBlobCkRef: MutableRefObject<string | null>
  hoveredVertexHandleRef: MutableRefObject<{ ck: string; edgeKey: string } | null>
  hoveredEdgeHandleRef: MutableRefObject<{ ck: string; v0Key: string; v1Key: string } | null>
  blobHandleDataRef: MutableRefObject<BlobHandleData>
  blobHandleOverridesRef: MutableRefObject<Record<string, Record<string, [number, number]>>>
  blobDragLiveRef: MutableRefObject<{ ck: string; handles: { edgeKey: string; cx: number; cy: number; offset: [number, number] }[] } | null>
  defaultTerrainBlobsRef: MutableRefObject<{ terrain: string; polys: [number, number][][] }[]>
  paperDimsRef: MutableRefObject<{ px: number; py: number } | null>
  rafRef: MutableRefObject<number | null>
  setBlobHandleOverrideRef: MutableRefObject<(ck: string, edgeKey: string, offset: [number, number] | null) => void>
  setActiveBlobEditIdRef: MutableRefObject<(id: string | null) => void>
  clientToLogicalRef: MutableRefObject<LogicalFn>
  draw: () => void
}

type VertexDrag = { kind: 'vertex'; canonicalKey: string; hexKey: string; startLx: number; startLy: number; baseOffset: [number, number]; baseCx: number; baseCy: number }
type EdgeDrag   = { kind: 'edge'; canonicalKey: string; v0Key: string; v1Key: string; startLx: number; startLy: number; nx: number; ny: number; baseOffset0: [number, number]; baseOffset1: [number, number]; baseCx0: number; baseCy0: number; baseCx1: number; baseCy1: number }

export function attachBlobHandleHandlers(el: HTMLCanvasElement, refs: BlobHandleRefs): () => void {
  const { zoomRef, hexRadiusRef, blobEditModeRef, activeBlobEditIdRef,
    hoveredBlobCkRef, hoveredVertexHandleRef, hoveredEdgeHandleRef,
    blobHandleDataRef, blobHandleOverridesRef, blobDragLiveRef,
    defaultTerrainBlobsRef, paperDimsRef, rafRef,
    setBlobHandleOverrideRef, setActiveBlobEditIdRef, clientToLogicalRef, draw } = refs

  const vertexHitR = () => Math.max(3, 4 / (zoomRef.current ?? 1))
  const edgeHitR   = () => Math.max(4, 6 / (zoomRef.current ?? 1))
  let dragging: VertexDrag | EdgeDrag | null = null

  const toPaperLocal = (clientX: number, clientY: number) => {
    const logical = clientToLogicalRef.current(clientX, clientY)
    if (!logical) return null
    const pd = paperDimsRef.current
    if (!pd) return null
    return { lx: logical.lx - pd.px, ly: logical.ly - pd.py }
  }

  const forEachEdge = (ck: string, cb: (h0: { edgeKey: string; cx: number; cy: number }, h1: { edgeKey: string; cx: number; cy: number }) => boolean | void) => {
    const hd = blobHandleDataRef.current.get(ck)
    if (!hd) return
    let hIdx = 0
    for (const poly of hd.simplifiedPolys) {
      const n = poly.length
      const polyHandles = hd.handles.slice(hIdx, hIdx + n)
      hIdx += n
      if (polyHandles.length < 3) continue
      for (let i = 0; i < polyHandles.length; i++) {
        if (cb(polyHandles[i], polyHandles[(i + 1) % polyHandles.length]) === true) return
      }
    }
  }

  const findBlobAt = (lx: number, ly: number): string | null | undefined => {
    for (const entry of defaultTerrainBlobsRef.current) {
      for (const poly of entry.polys) {
        if (!pointInPolygon(lx, ly, poly)) continue
        let bestCk: string | null = null, bestD = Infinity
        for (const [ck, hd] of blobHandleDataRef.current) {
          if (hd.terrain !== entry.terrain) continue
          for (const h of hd.handles) {
            const d = Math.hypot(lx - h.cx, ly - h.cy)
            if (d < bestD) { bestD = d; bestCk = ck }
          }
        }
        return bestCk
      }
    }
    return undefined
  }

  const onRightClick = (e: MouseEvent) => {
    if (!blobEditModeRef.current) return
    const activeId = activeBlobEditIdRef.current
    if (!activeId) return
    const pl = toPaperLocal(e.clientX, e.clientY)
    if (!pl) return
    const handleGroup = blobHandleDataRef.current.get(activeId)
    if (!handleGroup) return
    const hitHandle = handleGroup.handles.find(h => Math.hypot(pl.lx - h.cx, pl.ly - h.cy) < vertexHitR())
    if (hitHandle) { setBlobHandleOverrideRef.current(activeId, hitHandle.edgeKey, null); e.stopPropagation(); e.preventDefault() }
  }

  const onDown = (e: MouseEvent) => {
    if (!blobEditModeRef.current) return
    if (e.button !== 0) return
    const pl = toPaperLocal(e.clientX, e.clientY)
    if (!pl) return
    const { lx, ly } = pl
    const R = hexRadiusRef.current
    const targetId = activeBlobEditIdRef.current ?? hoveredBlobCkRef.current

    if (targetId) {
      const handleGroup = blobHandleDataRef.current.get(targetId)
      if (handleGroup) {
        const hitHandle = handleGroup.handles.find(h => Math.hypot(lx - h.cx, ly - h.cy) < vertexHitR())
        if (hitHandle) {
          const baseOffset = (blobHandleOverridesRef.current[targetId]?.[hitHandle.edgeKey] ?? [0, 0]) as [number, number]
          const baseCx = hitHandle.cx - baseOffset[0] * R, baseCy = hitHandle.cy - baseOffset[1] * R
          dragging = { kind: 'vertex', canonicalKey: targetId, hexKey: hitHandle.edgeKey, startLx: lx, startLy: ly, baseOffset, baseCx, baseCy }
          e.stopPropagation(); e.preventDefault(); return
        }
        let edgeDrag: EdgeDrag | null = null
        forEachEdge(targetId, (h0, h1) => {
          if (distToSeg([lx, ly], [h0.cx, h0.cy], [h1.cx, h1.cy]) >= edgeHitR()) return
          const edgeDx = h1.cx - h0.cx, edgeDy = h1.cy - h0.cy, len = Math.hypot(edgeDx, edgeDy) || 1
          const nx = -edgeDy / len, ny = edgeDx / len
          const baseOffset0 = (blobHandleOverridesRef.current[targetId]?.[h0.edgeKey] ?? [0, 0]) as [number, number]
          const baseOffset1 = (blobHandleOverridesRef.current[targetId]?.[h1.edgeKey] ?? [0, 0]) as [number, number]
          edgeDrag = { kind: 'edge', canonicalKey: targetId, v0Key: h0.edgeKey, v1Key: h1.edgeKey, startLx: lx, startLy: ly, nx, ny, baseOffset0, baseOffset1, baseCx0: h0.cx, baseCy0: h0.cy, baseCx1: h1.cx, baseCy1: h1.cy }
          return true
        })
        if (edgeDrag) { dragging = edgeDrag; e.stopPropagation(); e.preventDefault(); return }
      }
    }

    const hit = findBlobAt(lx, ly)
    if (hit !== undefined) {
      if (hit) {
        setActiveBlobEditIdRef.current(hit === activeBlobEditIdRef.current ? null : hit)
        hoveredBlobCkRef.current = null; hoveredEdgeHandleRef.current = null; hoveredVertexHandleRef.current = null
        el.style.cursor = ''; e.stopPropagation()
      }
      return
    }
    setActiveBlobEditIdRef.current(null)
  }

  const onMove = (e: MouseEvent) => {
    if (dragging) {
      const pl = toPaperLocal(e.clientX, e.clientY)
      if (!pl) return
      const { lx, ly } = pl
      const R = hexRadiusRef.current
      if (dragging.kind === 'vertex') {
        const dx = (lx - dragging.startLx) / R, dy = (ly - dragging.startLy) / R
        const off: [number, number] = [dragging.baseOffset[0] + dx, dragging.baseOffset[1] + dy]
        blobDragLiveRef.current = { ck: dragging.canonicalKey, handles: [{ edgeKey: dragging.hexKey, cx: dragging.baseCx + off[0] * R, cy: dragging.baseCy + off[1] * R, offset: off }] }
      } else {
        const d = (lx - dragging.startLx) * dragging.nx + (ly - dragging.startLy) * dragging.ny, d_hr = d / R
        const off0: [number, number] = [dragging.baseOffset0[0] + d_hr * dragging.nx, dragging.baseOffset0[1] + d_hr * dragging.ny]
        const off1: [number, number] = [dragging.baseOffset1[0] + d_hr * dragging.nx, dragging.baseOffset1[1] + d_hr * dragging.ny]
        blobDragLiveRef.current = { ck: dragging.canonicalKey, handles: [
          { edgeKey: dragging.v0Key, cx: dragging.baseCx0 + d * dragging.nx, cy: dragging.baseCy0 + d * dragging.ny, offset: off0 },
          { edgeKey: dragging.v1Key, cx: dragging.baseCx1 + d * dragging.nx, cy: dragging.baseCy1 + d * dragging.ny, offset: off1 },
        ]}
      }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw() })
      return
    }

    if (!blobEditModeRef.current) return
    const pl = toPaperLocal(e.clientX, e.clientY)
    const { lx, ly } = pl ?? { lx: -Infinity, ly: -Infinity }
    const found = pl ? findBlobAt(lx, ly) ?? null : null
    let blobChanged = found !== hoveredBlobCkRef.current
    if (blobChanged) { hoveredBlobCkRef.current = found; el.style.cursor = found ? 'pointer' : '' }

    const targetId = activeBlobEditIdRef.current ?? found
    let newVertex: { ck: string; edgeKey: string } | null = null
    let newEdge: { ck: string; v0Key: string; v1Key: string } | null = null
    if (targetId && pl) {
      const getLivePx = (ck: string, edgeKey: string, cx: number, cy: number) => {
        const live = blobDragLiveRef.current
        if (!live || live.ck !== ck) return { x: cx, y: cy }
        const h = live.handles.find(h => h.edgeKey === edgeKey)
        return h ? { x: h.cx, y: h.cy } : { x: cx, y: cy }
      }
      const hd = blobHandleDataRef.current.get(targetId)
      if (hd) {
        const hit = hd.handles.find(h => {
          const { x, y } = getLivePx(targetId, h.edgeKey, h.cx, h.cy)
          return Math.hypot(lx - x, ly - y) < vertexHitR()
        })
        if (hit) newVertex = { ck: targetId, edgeKey: hit.edgeKey }
      }
      if (!newVertex) {
        forEachEdge(targetId, (h0, h1) => {
          const { x: x0, y: y0 } = getLivePx(targetId, h0.edgeKey, h0.cx, h0.cy)
          const { x: x1, y: y1 } = getLivePx(targetId, h1.edgeKey, h1.cx, h1.cy)
          if (distToSeg([lx, ly], [x0, y0], [x1, y1]) < edgeHitR()) { newEdge = { ck: targetId, v0Key: h0.edgeKey, v1Key: h1.edgeKey }; return true }
        })
      }
    }
    const prevVertex = hoveredVertexHandleRef.current
    const vertexChanged = newVertex?.edgeKey !== prevVertex?.edgeKey || newVertex?.ck !== prevVertex?.ck
    if (vertexChanged) hoveredVertexHandleRef.current = newVertex
    const prev = hoveredEdgeHandleRef.current
    const edgeChanged = newEdge?.v0Key !== prev?.v0Key || newEdge?.v1Key !== prev?.v1Key || newEdge?.ck !== prev?.ck
    if (edgeChanged) hoveredEdgeHandleRef.current = newEdge
    if (blobChanged || vertexChanged || edgeChanged) {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw() })
    }
  }

  const onLeave = () => {
    const any = hoveredBlobCkRef.current !== null || hoveredEdgeHandleRef.current !== null || hoveredVertexHandleRef.current !== null
    hoveredBlobCkRef.current = null; hoveredEdgeHandleRef.current = null; hoveredVertexHandleRef.current = null
    el.style.cursor = ''
    if (any && rafRef.current === null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw() })
  }

  const onUp = () => {
    if (dragging && blobDragLiveRef.current) {
      for (const { edgeKey, offset } of blobDragLiveRef.current.handles) {
        setBlobHandleOverrideRef.current(dragging.canonicalKey, edgeKey, offset)
      }
    }
    blobDragLiveRef.current = null; dragging = null
  }

  el.addEventListener('mousedown', onDown, { capture: true })
  el.addEventListener('contextmenu', onRightClick, { capture: true })
  el.addEventListener('mouseleave', onLeave)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  return () => {
    el.removeEventListener('mousedown', onDown, { capture: true })
    el.removeEventListener('contextmenu', onRightClick, { capture: true })
    el.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
}
