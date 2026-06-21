/**
 * Screen-only overlays for blob shape editing:
 *  - handle vertex dots and edge-segment highlights (drawn when blobEditMode is on)
 *  - freehand mask stroke preview (drawn while blob-mask tool is active)
 * Never called during export.
 */

type HandleEntry = { edgeKey: string; cx: number; cy: number }
type BlobHandleData = Map<string, {
  handles: HandleEntry[]
  simplifiedPolys: [number, number][][]
}>
type BlobDragLive = { ck: string; handles: { edgeKey: string; cx: number; cy: number; offset: [number, number] }[] } | null

export interface BlobHandleOverlayParams {
  ctx: CanvasRenderingContext2D
  blobEditMode: boolean
  activeBlobEditId: string | null
  hoveredBlobCk: string | null
  blobHandleData: BlobHandleData
  blobDragLive: BlobDragLive
  blobHandleOverrides: Record<string, Record<string, [number, number]>>
  hoveredEdgeHandle: { ck: string; v0Key: string; v1Key: string } | null
  hoveredVertexHandle: { ck: string; edgeKey: string } | null
  zoom: number
}

export function _drawBlobHandleOverlay(p: BlobHandleOverlayParams): void {
  const { ctx, blobEditMode, activeBlobEditId, hoveredBlobCk,
    blobHandleData, blobDragLive, blobHandleOverrides,
    hoveredEdgeHandle, hoveredVertexHandle, zoom } = p

  if (!blobEditMode) return

  const activeId = activeBlobEditId
  const hoveredId = hoveredBlobCk
  const live = blobDragLive
  const handleR = Math.max(2, 3 / zoom)
  const lw = 1 / zoom

  ctx.save()

  const liveCx = (ck: string, edgeKey: string, cx: number) => {
    if (!live || live.ck !== ck) return cx
    return live.handles.find(h => h.edgeKey === edgeKey)?.cx ?? cx
  }
  const liveCy = (ck: string, edgeKey: string, cy: number) => {
    if (!live || live.ck !== ck) return cy
    return live.handles.find(h => h.edgeKey === edgeKey)?.cy ?? cy
  }

  const strokeBlobOutline = (ck: string, handles: HandleEntry[], sPolys: [number, number][][]) => {
    let hIdx = 0
    for (const poly of sPolys) {
      const polyHandles = handles.slice(hIdx, hIdx + poly.length)
      hIdx += poly.length
      if (polyHandles.length < 3) continue
      ctx.beginPath()
      ctx.moveTo(liveCx(ck, polyHandles[0].edgeKey, polyHandles[0].cx), liveCy(ck, polyHandles[0].edgeKey, polyHandles[0].cy))
      for (let i = 1; i < polyHandles.length; i++) {
        ctx.lineTo(liveCx(ck, polyHandles[i].edgeKey, polyHandles[i].cx), liveCy(ck, polyHandles[i].edgeKey, polyHandles[i].cy))
      }
      ctx.closePath()
      ctx.stroke()
    }
  }

  // Hover glow — light highlight on the blob under cursor when nothing selected
  if (hoveredId && hoveredId !== activeId) {
    const { handles, simplifiedPolys: sPolys } = blobHandleData.get(hoveredId) ?? {}
    if (handles && sPolys && sPolys.length > 0) {
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = lw + 2
      ctx.setLineDash([])
      strokeBlobOutline(hoveredId, handles, sPolys)
      ctx.strokeStyle = 'rgba(100,180,255,0.35)'
      ctx.lineWidth = lw + 6
      strokeBlobOutline(hoveredId, handles, sPolys)
      ctx.restore()
    }
  }

  // Dashed outline for active blob
  if (activeId) {
    const { handles, simplifiedPolys: sPolys } = blobHandleData.get(activeId) ?? {}
    if (handles && sPolys && sPolys.length > 0) {
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = lw + 1.5
      ctx.setLineDash([4 / zoom, 4 / zoom])
      strokeBlobOutline(activeId, handles, sPolys)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = lw + 0.5
      strokeBlobOutline(activeId, handles, sPolys)
      ctx.restore()
    }
  }

  // Vertex + edge handles for active or hovered blob
  const handleTargetId = activeId ?? hoveredId
  if (handleTargetId) {
    const { handles: targetHandles, simplifiedPolys: targetSPolys } = blobHandleData.get(handleTargetId) ?? {}
    if (targetHandles && targetSPolys) {
      const hovEdge = hoveredEdgeHandle

      // Edge segment highlight
      if (hovEdge?.ck === handleTargetId) {
        const h0 = targetHandles.find(h => h.edgeKey === hovEdge.v0Key)
        const h1 = targetHandles.find(h => h.edgeKey === hovEdge.v1Key)
        if (h0 && h1) {
          const x0 = liveCx(handleTargetId, h0.edgeKey, h0.cx), y0 = liveCy(handleTargetId, h0.edgeKey, h0.cy)
          const x1 = liveCx(handleTargetId, h1.edgeKey, h1.cx), y1 = liveCy(handleTargetId, h1.edgeKey, h1.cy)
          ctx.save()
          ctx.lineCap = 'round'
          ctx.lineWidth = lw + 4
          ctx.strokeStyle = 'rgba(100,200,255,0.45)'
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
          ctx.lineWidth = lw + 1.5
          ctx.strokeStyle = 'rgba(180,230,255,0.9)'
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
          ctx.restore()
        }
      }

      // Vertex dots
      const hovVertex = hoveredVertexHandle
      for (const { edgeKey, cx, cy } of targetHandles) {
        const hx = liveCx(handleTargetId, edgeKey, cx)
        const hy = liveCy(handleTargetId, edgeKey, cy)
        const hasOverride = !!(blobHandleOverrides[handleTargetId]?.[edgeKey])
          || !!(live?.ck === handleTargetId && live.handles.some(h => h.edgeKey === edgeKey))
        const isHovVertex = hovVertex?.ck === handleTargetId && hovVertex.edgeKey === edgeKey
        if (isHovVertex) {
          ctx.beginPath()
          ctx.arc(hx, hy, handleR + 3 / zoom, 0, Math.PI * 2)
          ctx.lineWidth = (lw + 1.5) / zoom
          ctx.strokeStyle = 'rgba(100,200,255,0.5)'
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(hx, hy, handleR + 1.5 / zoom, 0, Math.PI * 2)
          ctx.lineWidth = lw
          ctx.strokeStyle = 'rgba(180,230,255,0.95)'
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(hx, hy, handleR, 0, Math.PI * 2)
        ctx.fillStyle = hasOverride ? 'rgba(255,180,80,0.9)' : 'rgba(255,255,255,0.75)'
        ctx.fill()
        ctx.lineWidth = lw
        ctx.strokeStyle = isHovVertex ? 'rgba(100,180,255,0.9)' : 'rgba(80,80,80,0.6)'
        ctx.stroke()
      }
    }
  }

  ctx.restore()
}

export interface BlobMaskPreviewParams {
  ctx: CanvasRenderingContext2D
  blobMaskDrawing: boolean
  blobMaskStroke: [number, number][]
  toolMode: string | null  // 'subtract' | 'add' | null
  px: number
  py: number
  zoom: number
}

export function _drawBlobMaskPreview(p: BlobMaskPreviewParams): void {
  const { ctx, blobMaskDrawing, blobMaskStroke, toolMode, px, py, zoom } = p
  if (!blobMaskDrawing || blobMaskStroke.length < 2 || toolMode === null) return

  const isSubtract = toolMode === 'subtract'
  const iz = 1 / zoom
  ctx.save()
  ctx.strokeStyle = isSubtract ? 'rgba(255,80,80,0.85)' : 'rgba(80,220,120,0.85)'
  ctx.fillStyle = isSubtract ? 'rgba(255,80,80,0.1)' : 'rgba(80,220,120,0.1)'
  ctx.lineWidth = 2 * iz
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([6 * iz, 4 * iz])
  ctx.beginPath()
  ctx.moveTo(blobMaskStroke[0][0] - px, blobMaskStroke[0][1] - py)
  for (let i = 1; i < blobMaskStroke.length; i++) {
    ctx.lineTo(blobMaskStroke[i][0] - px, blobMaskStroke[i][1] - py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
