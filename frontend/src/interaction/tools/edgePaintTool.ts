/**
 * Edge paint tool — shared logic for river edges and highlight edge paths.
 * Both features paint/erase hex edges; what differs is which store collection
 * gets updated. The hover+drag scaffolding in mouseHandlers.ts calls these.
 *
 * For river edges, paintEdge does NOT update the store directly. It returns
 * `riverPair` so the caller can accumulate changes and apply them on mouseup
 * in one batch — keeping the store silent during the drag stroke.
 */
import type { MutableRefObject } from 'react'
import type { GeneratedHex, RiverEdge } from '../../store/mapStore'
import { highlightsController } from '../../render/layers/highlightsLayer'

type HighlightObj = { id: string; mode: string }

export interface EdgePaintRefs {
  riverEditModeRef:     MutableRefObject<boolean>
  riverSelectModeRef:   MutableRefObject<boolean>
  highlightPaintModeRef: MutableRefObject<boolean>
  activeHighlightIdRef: MutableRefObject<string | null>
  highlightsRef:        MutableRefObject<HighlightObj[]>
  hexesRef:             MutableRefObject<GeneratedHex[]>
  riverEdgesRef:        MutableRefObject<RiverEdge[]>
  highlightEdgePathsRef: MutableRefObject<Record<string, [number, number][][]>>
  setHighlightEdgePathRef: MutableRefObject<(id: string, segments: [number, number][][]) => void>
}

export function isEdgePaintActive(refs: EdgePaintRefs): 'highlight' | 'river' | false {
  const { riverEditModeRef, riverSelectModeRef, highlightPaintModeRef,
    activeHighlightIdRef, highlightsRef } = refs
  if (riverEditModeRef.current && !riverSelectModeRef.current) return 'river'
  if (!highlightPaintModeRef.current) return false
  const hlId = activeHighlightIdRef.current
  if (!hlId) return false
  const hl = highlightsRef.current.find(h => h.id === hlId)
  return hl?.mode === 'edge' ? 'highlight' : false
}

export type PaintEdgeResult = {
  action: 'add' | 'remove'
  /** For river edges: the canonical hex pair to toggle. Null for highlight edges. */
  riverPair: [number, number, number, number] | null
} | null

/**
 * Paint or erase a single hex edge. forceMode locks the whole drag stroke to
 * one direction instead of toggling on each cell.
 *
 * For river mode: does NOT update the store — returns riverPair for the caller
 * to accumulate and flush on mouseup.
 * For highlight mode: updates store immediately (highlight state is cheap to update).
 */
export function paintEdge(
  hexQ: number, hexR: number, edgeI: number,
  refs: EdgePaintRefs,
  forceMode?: 'add' | 'remove',
): PaintEdgeResult {
  const mode = isEdgePaintActive(refs)
  if (!mode) return null

  const hex = refs.hexesRef.current.find(h => h.q === hexQ && h.r === hexR)
  if (!hex) return null

  const geoV0 = hex.vertices[edgeI] as [number, number]
  const geoV1 = hex.vertices[(edgeI + 1) % 6] as [number, number]

  const VKEY_EPS = 0.00015
  const vk = (v: [number, number]) =>
    `${Math.round(v[0] / (VKEY_EPS * 0.5))},${Math.round(v[1] / (VKEY_EPS * 0.5))}`
  const vEq = (a: [number, number], b: [number, number]) => vk(a) === vk(b)

  if (mode === 'river') {
    const EPS = 1e-5
    const neighbor = refs.hexesRef.current.find(h => {
      if (h.q === hexQ && h.r === hexR) return false
      const verts = h.vertices as [number, number][]
      let hasV0 = false, hasV1 = false
      for (const v of verts) {
        if (Math.abs(v[0] - geoV0[0]) < EPS && Math.abs(v[1] - geoV0[1]) < EPS) hasV0 = true
        if (Math.abs(v[0] - geoV1[0]) < EPS && Math.abs(v[1] - geoV1[1]) < EPS) hasV1 = true
      }
      return hasV0 && hasV1
    })
    if (!neighbor) return null

    const ek = (q1: number, r1: number, q2: number, r2: number) => {
      const s1 = `${q1},${r1}`, s2 = `${q2},${r2}`
      return s1 < s2 ? `${s1}|${s2}` : `${s2}|${s1}`
    }
    const k = ek(hexQ, hexR, neighbor.q, neighbor.r)
    const exists = refs.riverEdgesRef.current.some(e => ek(e.q1, e.r1, e.q2, e.r2) === k)

    if (forceMode === 'add' && exists) return { action: 'add', riverPair: [hexQ, hexR, neighbor.q, neighbor.r] }
    if (forceMode === 'remove' && !exists) return { action: 'remove', riverPair: [hexQ, hexR, neighbor.q, neighbor.r] }

    // Return coords for caller to apply — store is NOT touched here
    return { action: exists ? 'remove' : 'add', riverPair: [hexQ, hexR, neighbor.q, neighbor.r] }
  }

  // Highlight edge paint — updates store immediately (no deferred path needed)
  const hlId = refs.activeHighlightIdRef.current!
  const segments = refs.highlightEdgePathsRef.current[hlId] ?? []
  const ck0 = vk(geoV0), ck1 = vk(geoV1)
  const edgeIdx = (seg: [number, number][]) => {
    for (let i = 0; i < seg.length - 1; i++) {
      if ((vk(seg[i]) === ck0 && vk(seg[i + 1]) === ck1) ||
          (vk(seg[i]) === ck1 && vk(seg[i + 1]) === ck0)) return i
    }
    return -1
  }
  const segIdx = segments.findIndex(s => edgeIdx(s) !== -1)
  const exists = segIdx !== -1

  if (forceMode === 'add' && exists) return { action: 'add', riverPair: null }
  if (forceMode === 'remove' && !exists) return { action: 'remove', riverPair: null }

  let nextSegments: [number, number][][]
  if (exists) {
    nextSegments = []
    for (let si = 0; si < segments.length; si++) {
      if (si !== segIdx) { nextSegments.push(segments[si]); continue }
      const seg = segments[si]
      const ei = edgeIdx(seg)
      const before = seg.slice(0, ei + 1) as [number, number][]
      const after = seg.slice(ei + 1) as [number, number][]
      if (before.length >= 2) nextSegments.push(before)
      if (after.length >= 2) nextSegments.push(after)
    }
  } else {
    const lastSeg = segments.length > 0 ? segments[segments.length - 1] : []
    let newLastSeg: [number, number][] | null = null
    let appendNew = false
    if (lastSeg.length === 0) {
      newLastSeg = [geoV0, geoV1]
    } else if (vEq(lastSeg[lastSeg.length - 1], geoV0)) {
      newLastSeg = [...lastSeg, geoV1]
    } else if (vEq(lastSeg[lastSeg.length - 1], geoV1)) {
      newLastSeg = [...lastSeg, geoV0]
    } else if (vEq(lastSeg[0], geoV0)) {
      newLastSeg = [geoV1, ...lastSeg]
    } else if (vEq(lastSeg[0], geoV1)) {
      newLastSeg = [geoV0, ...lastSeg]
    } else {
      appendNew = true
    }
    if (appendNew) {
      nextSegments = [...segments, [geoV0, geoV1]]
    } else if (newLastSeg!.length <= 1) {
      nextSegments = segments.slice(0, -1)
    } else {
      nextSegments = [...segments.slice(0, -1), newLastSeg!]
    }
  }
  refs.setHighlightEdgePathRef.current(hlId, nextSegments)
  highlightsController.markDirty()
  return { action: exists ? 'remove' : 'add', riverPair: null }
}
