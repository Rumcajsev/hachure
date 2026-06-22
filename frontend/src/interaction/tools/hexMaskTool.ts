import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { pointInPolygon } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface HexMaskRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  activeToolRef: MutableRefObject<{ type: string; mode?: 'exclude' | 'include' }>
  toggleExcludedHexRef: MutableRefObject<(key: string, mode: 'exclude' | 'include') => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
}

export function attachHexMaskHandlers(el: HTMLElement, refs: HexMaskRefs): () => void {
  const { metaRef, hexesRef, activeToolRef, toggleExcludedHexRef, clientToLogical, getPaper } = refs

  const paintAt = (clientX: number, clientY: number, mode: 'exclude' | 'include', lastKey: { v: string | null }) => {
    const meta = metaRef.current
    if (!meta) return
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    for (const hex of hexesRef.current) {
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (pointInPolygon(lx, ly, verts)) {
        const key = `${hex.q},${hex.r}`
        if (key !== lastKey.v) { lastKey.v = key; toggleExcludedHexRef.current(key, mode) }
        break
      }
    }
  }

  let active = false
  let mode: 'exclude' | 'include' = 'exclude'
  const lastKey = { v: null as string | null }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    const tool = activeToolRef.current
    if (tool.type !== 'hex-mask') return
    active = true
    mode = (tool as { type: string; mode: 'exclude' | 'include' }).mode
    lastKey.v = null
    paintAt(e.clientX, e.clientY, mode, lastKey)
  }
  const onMove = (e: MouseEvent) => { if (active) paintAt(e.clientX, e.clientY, mode, lastKey) }
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
