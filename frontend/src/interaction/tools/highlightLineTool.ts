import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { pointInPolygon } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface HighlightLineRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  hexEdgeModeRef: MutableRefObject<string>
  activePanelRef: MutableRefObject<string>
  highlightsRef: MutableRefObject<{ id: string; mode: string }[]>
  highlightLinesRef: MutableRefObject<Record<string, string[][]>>
  activeHighlightIdRef: MutableRefObject<string | null>
  highlightPaintModeRef: MutableRefObject<boolean>
  highlightLineEraserRef: MutableRefObject<boolean>
  startNewLineSegmentRef: MutableRefObject<(id: string) => void>
  appendHexToLineRef: MutableRefObject<(id: string, q: number, r: number) => void>
  truncateHighlightLineRef: MutableRefObject<(id: string, idx: number) => void>
  eraseHexFromLineRef: MutableRefObject<(id: string, q: number, r: number) => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
}

export function attachHighlightLineHandlers(el: HTMLElement, refs: HighlightLineRefs): () => void {
  const { metaRef, hexesRef, hexEdgeModeRef, activePanelRef,
    highlightsRef, highlightLinesRef, activeHighlightIdRef,
    highlightPaintModeRef, highlightLineEraserRef,
    startNewLineSegmentRef, appendHexToLineRef, truncateHighlightLineRef, eraseHexFromLineRef,
    clientToLogical, getPaper } = refs

  let painting = false
  let prevHex: { q: number; r: number } | null = null
  let segmentStarted = false
  let lastPainted: string | null = null

  const hexAtClient = (clientX: number, clientY: number) => {
    const meta = metaRef.current
    if (!meta) return null
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return null
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    for (const hex of hexesRef.current) {
      if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (pointInPolygon(lx, ly, verts)) return hex
    }
    return null
  }

  const appendOrPop = (hex: { q: number; r: number }, hlId: string) => {
    const key = `${hex.q},${hex.r}`
    if (key === lastPainted) return
    lastPainted = key

    if (!segmentStarted) {
      startNewLineSegmentRef.current(hlId)
      if (prevHex) appendHexToLineRef.current(hlId, prevHex.q, prevHex.r)
      appendHexToLineRef.current(hlId, hex.q, hex.r)
      segmentStarted = true
      return
    }

    const segs = highlightLinesRef.current[hlId] ?? []
    const lastSeg = segs.length > 0 ? segs[segs.length - 1] : []
    const idx = lastSeg.lastIndexOf(key)
    if (idx !== -1) {
      if (idx === 0 && lastSeg.length >= 3) {
        appendHexToLineRef.current(hlId, hex.q, hex.r)
        segmentStarted = false; prevHex = hex
      } else {
        truncateHighlightLineRef.current(hlId, idx < 2 ? 0 : idx)
        if (idx < 2) { segmentStarted = false; prevHex = hex }
      }
    } else {
      appendHexToLineRef.current(hlId, hex.q, hex.r)
    }
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    const hlId = activeHighlightIdRef.current
    if (!hlId) return
    const hl = highlightsRef.current.find(h => h.id === hlId)
    if (hl?.mode !== 'line') return
    if (activePanelRef.current !== 'highlights') return
    const isEraser = highlightLineEraserRef.current
    if (!isEraser && !highlightPaintModeRef.current) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    e.stopPropagation()
    painting = true; segmentStarted = false
    prevHex = hexAtClient(e.clientX, e.clientY)
    lastPainted = prevHex ? `${prevHex.q},${prevHex.r}` : null
    if (!isEraser && prevHex) {
      const segs = highlightLinesRef.current[hlId] ?? []
      const lastSeg = segs.length > 0 ? segs[segs.length - 1] : []
      if (lastSeg.length > 0 && lastSeg[lastSeg.length - 1] === lastPainted) segmentStarted = true
    }
    if (isEraser && prevHex) eraseHexFromLineRef.current(hlId, prevHex.q, prevHex.r)
  }

  const onMove = (e: MouseEvent) => {
    if (!painting) return
    const hlId = activeHighlightIdRef.current
    if (!hlId) return
    const hex = hexAtClient(e.clientX, e.clientY)
    if (!hex) return
    if (highlightLineEraserRef.current) {
      const key = `${hex.q},${hex.r}`
      if (key === lastPainted) return
      lastPainted = key
      eraseHexFromLineRef.current(hlId, hex.q, hex.r)
    } else {
      appendOrPop(hex, hlId)
    }
  }

  const onUp = () => { painting = false; prevHex = null; segmentStarted = false; lastPainted = null }

  el.addEventListener('mousedown', onDown, { capture: true })
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  return () => {
    el.removeEventListener('mousedown', onDown, { capture: true })
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
}
