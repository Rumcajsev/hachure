import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { edgeBlobCanonicalKey } from '../../store/mapStore'
import { distToSeg } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'
import type { SlopeHoverTarget } from '../../lib/drawSlopes'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface SlopeToolRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  slopeModeRef: MutableRefObject<boolean>
  slopeHoverTargetRef: MutableRefObject<SlopeHoverTarget>
  setSlopeEdgeRef: MutableRefObject<(edgeKey: string, highHexKey: string) => void>
  removeSlopeEdgeRef: MutableRefObject<(edgeKey: string) => void>
  slopeEdgesRef: MutableRefObject<Record<string, string>>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
  draw: () => void
}

const HEX_DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
const SNAP = 2
const vk2 = (p: [number, number]) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`

function computeSlopeHover(
  clientX: number,
  clientY: number,
  refs: SlopeToolRefs,
): SlopeHoverTarget {
  const { metaRef, hexesRef, clientToLogical, getPaper } = refs
  const meta = metaRef.current
  if (!meta) return null
  const logical = clientToLogical(clientX, clientY)
  if (!logical) return null
  const { lx: lxCanvas, ly: lyCanvas, cssW, cssH } = logical
  const { pw, ph, px, py } = getPaper(cssW, cssH)
  const lx = lxCanvas - px, ly = lyCanvas - py
  const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
  const R = meta.outer_radius_m * scalePxPerM

  const hexes = hexesRef.current
  const hexMap = new Map<string, GeneratedHex>()
  for (const hex of hexes) hexMap.set(`${hex.q},${hex.r}`, hex)

  const proj = (lon: number, lat: number) =>
    projectToCanvas(lon, lat, meta, pw, ph, 0, 0) as [number, number]

  const threshold = R * 0.35
  let bestDist = threshold
  let best: SlopeHoverTarget = null

  for (const hex of hexes) {
    const verts = hex.vertices.map(([lon, lat]) => proj(lon, lat))
    const cx = verts.reduce((s, v) => s + v[0], 0) / 6
    const cy = verts.reduce((s, v) => s + v[1], 0) / 6
    if (Math.hypot(lx - cx, ly - cy) > R * 2) continue

    for (const [dq, dr] of HEX_DIRS) {
      const nq = hex.q + dq, nr = hex.r + dr
      const neighbor = hexMap.get(`${nq},${nr}`)
      if (!neighbor) continue
      const nverts = neighbor.vertices.map(([lon, lat]) => proj(lon, lat))
      const nkeys = new Set(nverts.map(vk2))
      const shared = verts.filter(v => nkeys.has(vk2(v))) as [number, number][]
      if (shared.length < 2) continue
      const d = distToSeg([lx, ly], shared[0], shared[1])
      if (d >= bestDist) continue
      bestDist = d

      // Determine which hex the cursor is closer to → that is the LOW hex
      const hexCenter: [number, number] = [cx, cy]
      const nCx = nverts.reduce((s, v) => s + v[0], 0) / 6
      const nCy = nverts.reduce((s, v) => s + v[1], 0) / 6
      const neighborCenter: [number, number] = [nCx, nCy]
      const distToHex = Math.hypot(lx - hexCenter[0], ly - hexCenter[1])
      const distToNeighbor = Math.hypot(lx - neighborCenter[0], ly - neighborCenter[1])

      // Cursor-nearer hex = downhill; farther hex = high hex
      const lowCenter = distToHex <= distToNeighbor ? hexCenter : neighborCenter
      const highQ = distToHex <= distToNeighbor ? nq : hex.q
      const highR = distToHex <= distToNeighbor ? nr : hex.r

      best = {
        edgeKey: edgeBlobCanonicalKey(hex.q, hex.r, nq, nr),
        p1: shared[0],
        p2: shared[1],
        highHexKey: `${highQ},${highR}`,
        lowCenter,
      }
    }
  }
  return best
}

export function attachSlopeHandlers(el: HTMLElement, refs: SlopeToolRefs): () => void {
  const { slopeModeRef, slopeHoverTargetRef, setSlopeEdgeRef, removeSlopeEdgeRef, slopeEdgesRef, draw } = refs

  let hoverRaf: number | null = null

  const scheduleRedraw = () => {
    if (hoverRaf === null) hoverRaf = requestAnimationFrame(() => { hoverRaf = null; draw() })
  }

  const onMove = (e: MouseEvent) => {
    if (!slopeModeRef.current) {
      if (slopeHoverTargetRef.current !== null) { slopeHoverTargetRef.current = null; draw() }
      return
    }
    const next = computeSlopeHover(e.clientX, e.clientY, refs)
    const prevKey = slopeHoverTargetRef.current?.edgeKey
    const nextKey = next?.edgeKey
    const prevHigh = slopeHoverTargetRef.current?.highHexKey
    const nextHigh = next?.highHexKey
    if (prevKey !== nextKey || prevHigh !== nextHigh) {
      slopeHoverTargetRef.current = next
      scheduleRedraw()
    }
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (!slopeModeRef.current) return
    const target = computeSlopeHover(e.clientX, e.clientY, refs)
    if (!target) return
    const { edgeKey, highHexKey } = target
    const existing = slopeEdgesRef.current[edgeKey]
    if (existing === highHexKey) {
      // Same direction clicked again → erase
      removeSlopeEdgeRef.current(edgeKey)
    } else {
      // Not set, or set from the other side → set/flip
      setSlopeEdgeRef.current(edgeKey, highHexKey)
    }
  }

  const onLeave = () => {
    if (slopeHoverTargetRef.current !== null) { slopeHoverTargetRef.current = null; draw() }
  }

  el.addEventListener('mousedown', onDown)
  el.addEventListener('mouseleave', onLeave)
  window.addEventListener('mousemove', onMove)

  return () => {
    el.removeEventListener('mousedown', onDown)
    el.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('mousemove', onMove)
    if (hoverRaf !== null) cancelAnimationFrame(hoverRaf)
  }
}
