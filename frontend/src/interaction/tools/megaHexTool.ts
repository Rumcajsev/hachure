import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { pointInPolygon } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface MegaHexRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  activeToolRef: MutableRefObject<{ type: string }>
  clientToLogicalRef: MutableRefObject<LogicalFn>
  setMegaHexOriginRef: MutableRefObject<(q: number, r: number) => void>
  getPaper: GetPaperFn
}

export function attachMegaHexHandlers(el: HTMLElement, refs: MegaHexRefs): () => void {
  const { metaRef, hexesRef, activeToolRef, clientToLogicalRef, setMegaHexOriginRef, getPaper } = refs

  const setAtClient = (clientX: number, clientY: number) => {
    const meta = metaRef.current
    if (!meta) return
    const logical = clientToLogicalRef.current(clientX, clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    for (const hex of hexesRef.current) {
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (pointInPolygon(lx, ly, verts)) { setMegaHexOriginRef.current(hex.q, hex.r); break }
    }
  }

  let active = false

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (activeToolRef.current.type !== 'mega-hex-origin') return
    active = true
    setAtClient(e.clientX, e.clientY)
  }
  const onMove = (e: MouseEvent) => { if (active) setAtClient(e.clientX, e.clientY) }
  const onUp = () => { active = false }

  el.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  return () => {
    el.removeEventListener('mousedown', onDown)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
}
