import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { pointInPolygon } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'

export type EraserHoverEntry = { q: number; r: number; verts: [number, number][] }
export type EraserHoverTarget = EraserHoverEntry[] | null

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface ImageEraserRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  activeToolRef: MutableRefObject<{ type: string; target?: string }>
  eraserHoverTargetRef: MutableRefObject<EraserHoverTarget>
  hoverRafRef: MutableRefObject<number | null>
  addRoadImageEraseHexKeysRef: MutableRefObject<(keys: string[]) => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
  draw: () => void
}

function hitTestHex(clientX: number, clientY: number, refs: ImageEraserRefs): EraserHoverTarget {
  const meta = refs.metaRef.current
  if (!meta) return null
  const logical = refs.clientToLogical(clientX, clientY)
  if (!logical) return null
  const { lx, ly, cssW, cssH } = logical
  const { pw, ph, px, py } = refs.getPaper(cssW, cssH)
  // Use paper-local coords (px=0, py=0) so verts match the render context which
  // has already applied ctx.translate(px, py). Hit-test in the same paper-local space.
  const plx = lx - px
  const ply = ly - py
  for (const hex of refs.hexesRef.current) {
    const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, 0, 0) as [number, number])
    if (pointInPolygon(plx, ply, verts)) return { q: hex.q, r: hex.r, verts }
  }
  return null
}

/** Whole-hex eraser for the image-extraction wizard: hovering highlights a hex
 *  (like the terrain/road paint tools), clicking (or dragging across several)
 *  marks it erased so every pixel inside it is excluded from color
 *  classification regardless of tolerance. Painted hexes are buffered locally
 *  during the drag and flushed once on mouseup — never in a per-move loop. */
export function attachImageEraserHandlers(el: HTMLElement, refs: ImageEraserRefs): () => void {
  const { activeToolRef, eraserHoverTargetRef, hoverRafRef, addRoadImageEraseHexKeysRef, draw } = refs

  let active = false
  let lastKey: string | null = null
  const pending = new Map<string, EraserHoverEntry>()

  const isEraserActive = () => activeToolRef.current.type === 'image-eraser'

  const scheduleRedraw = () => {
    if (hoverRafRef.current === null) {
      hoverRafRef.current = requestAnimationFrame(() => { hoverRafRef.current = null; draw() })
    }
  }

  const setHoverTargets = (targets: EraserHoverTarget) => {
    eraserHoverTargetRef.current = targets
    scheduleRedraw()
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (!isEraserActive()) return
    active = true
    lastKey = null
    pending.clear()
    const entry = hitTestHex(e.clientX, e.clientY, refs)
    if (entry) {
      const key = `${entry.q},${entry.r}`
      lastKey = key
      pending.set(key, entry)
    }
    setHoverTargets(pending.size > 0 ? [...pending.values()] : null)
  }

  const onMove = (e: MouseEvent) => {
    if (!isEraserActive()) {
      setHoverTargets(null)
      return
    }
    const entry = hitTestHex(e.clientX, e.clientY, refs)
    if (active) {
      if (entry) {
        const key = `${entry.q},${entry.r}`
        if (key !== lastKey) {
          lastKey = key
          pending.set(key, entry)
        }
      }
      setHoverTargets(pending.size > 0 ? [...pending.values()] : null)
    } else {
      setHoverTargets(entry ? [entry] : null)
    }
  }

  const onUp = () => {
    if (active && pending.size > 0) addRoadImageEraseHexKeysRef.current([...pending.keys()])
    active = false
    pending.clear()
    lastKey = null
    setHoverTargets(null)
  }

  const onLeave = () => setHoverTargets(null)

  el.addEventListener('mousedown', onDown)
  el.addEventListener('mouseleave', onLeave)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  return () => {
    el.removeEventListener('mousedown', onDown)
    el.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
}
