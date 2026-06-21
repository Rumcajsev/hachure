import type { MutableRefObject } from 'react'
import type { GridMetadata } from '../../store/mapStore'
import type { RiverChainV2 } from '../../lib/riverChains'
import type { RoadNetwork } from '../../lib/roadNetwork'
import { projectToCanvas, unprojectFromCanvas } from '../../lib/projection'

export type SnapTarget =
  | { kind: 'sibling'; key: string; pos: [number, number] }
  | { kind: 'road'; emKey: string; pos: [number, number] }

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface ControlPointDragRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  frameDimsRef: MutableRefObject<{ w: number; h: number }>
  zoomRef: MutableRefObject<number>
  roadNodeEditModeRef: MutableRefObject<boolean>
  riverNodeEditModeRef: MutableRefObject<boolean>
  railNodeEditModeRef: MutableRefObject<boolean>
  roadNetworkRef: MutableRefObject<RoadNetwork>
  roadWiggleAmpRef: MutableRefObject<number>
  roadWiggleFreqRef: MutableRefObject<number>
  roadSegmentPropsRef: MutableRefObject<Record<string, unknown>>
  roadHopPropsRef: MutableRefObject<Record<string, unknown>>
  roadControlOverridesRef: MutableRefObject<Record<string, [number, number]>>
  roadChainOverridesRef: MutableRefObject<Record<string, [number, number][]>>
  railBaseDataRef: MutableRefObject<{ controlPoints: { key: string; pos: [number, number] }[] }>
  railChainOverridesRef: MutableRefObject<Record<string, [number, number][]>>
  smoothedRailDataRef: MutableRefObject<{ chains: { id: string; chain: [number, number][]; baseChain: [number, number][] }[] }>
  riverChainsV2Ref: MutableRefObject<RiverChainV2[]>
  riverChainOverridesRef: MutableRefObject<Record<string, [number, number][]>>
  draggingCpKeyRef: MutableRefObject<string | null>
  draggingCpGroupKeysRef: MutableRefObject<string[]>
  draggingCpKindRef: MutableRefObject<'road' | 'rail' | null>
  snapPreviewRef: MutableRefObject<SnapTarget | null>
  dragRafRef: MutableRefObject<number | null>
  dragLiveOverrideRef: MutableRefObject<Record<string, [number, number]>>
  hoveredChainRef: MutableRefObject<{ id: string; handles: [number, number][]; kind: 'road' | 'river' | 'rail' } | null>
  hoveredHandleIdxRef: MutableRefObject<number | null>
  draggingDensePtRef: MutableRefObject<{ id: string; handles: [number, number][]; handleIdx: number; kind: 'road' | 'river' } | null>
  dragLiveDensePosRef: MutableRefObject<[number, number] | null>
  setRiverChainOverrideRef: MutableRefObject<(id: string, handles: [number, number][]) => void>
  setRoadChainOverrideRef: MutableRefObject<(id: string, handles: [number, number][]) => void>
  setRoadControlOverrideRef: MutableRefObject<(key: string, pos: [number, number]) => void>
  setRailControlOverrideRef: MutableRefObject<(key: string, pos: [number, number]) => void>
  setRoadSnapBindingRef: MutableRefObject<(key: string, emKey: string) => void>
  deleteRoadSnapBindingRef: MutableRefObject<(key: string) => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
  draw: () => void
}

function sparseHandles(chain: [number, number][], step = 5): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < chain.length; i += step) out.push(chain[i])
  if (out[out.length - 1] !== chain[chain.length - 1]) out.push(chain[chain.length - 1])
  return out
}

function distToSegment2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Attaches control-point and dense-handle drag handlers. Returns cleanup. */
export function attachControlPointDragHandlers(el: HTMLElement, refs: ControlPointDragRefs): () => void {
  const {
    metaRef, frameDimsRef, zoomRef,
    roadNodeEditModeRef, riverNodeEditModeRef, railNodeEditModeRef,
    roadNetworkRef, roadWiggleAmpRef, roadWiggleFreqRef, roadSegmentPropsRef, roadHopPropsRef,
    roadControlOverridesRef, roadChainOverridesRef,
    railBaseDataRef, railChainOverridesRef, smoothedRailDataRef,
    riverChainsV2Ref, riverChainOverridesRef,
    draggingCpKeyRef, draggingCpGroupKeysRef, draggingCpKindRef,
    snapPreviewRef, dragRafRef, dragLiveOverrideRef,
    hoveredChainRef, hoveredHandleIdxRef,
    draggingDensePtRef, dragLiveDensePosRef,
    setRiverChainOverrideRef, setRoadChainOverrideRef,
    setRoadControlOverrideRef, setRailControlOverrideRef,
    setRoadSnapBindingRef, deleteRoadSnapBindingRef,
    clientToLogical, getPaper, draw,
  } = refs

  const SNAP_SIBLING_PX = 14
  const SNAP_ROAD_PX = 16

  const scheduleRedraw = () => {
    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => { dragRafRef.current = null; draw() })
    }
  }

  const checkSnap = (dragKey: string, livePos: [number, number], meta: GridMetadata, pw: number, ph: number, px: number, py: number): SnapTarget | null => {
    if (!dragKey.startsWith('jt|') || !meta) return null
    const parts = dragKey.split('|')
    if (parts.length !== 3) return null
    const hexKey = parts[1]
    const zoom = zoomRef.current ?? 1
    const [dpx, dpy] = projectToCanvas(livePos[0], livePos[1], meta, pw, ph, px, py)

    const snapCps = roadNetworkRef.current.getBaseData(roadWiggleAmpRef.current, roadWiggleFreqRef.current, roadSegmentPropsRef.current as never, roadHopPropsRef.current as never, 2).controlPoints
    const siblings = snapCps.filter(cp => cp.key.startsWith('jt|') && cp.key.split('|')[1] === hexKey && cp.key !== dragKey)
    const sibThresh = SNAP_SIBLING_PX / zoom
    for (const sib of siblings) {
      const [sx, sy] = projectToCanvas(sib.pos[0], sib.pos[1], meta, pw, ph, px, py)
      if (Math.hypot(dpx - sx, dpy - sy) <= sibThresh) return { kind: 'sibling', key: sib.key, pos: sib.pos }
    }

    const roadThresh = SNAP_ROAD_PX / zoom
    let bestDist = roadThresh, bestEmKey: string | null = null, bestEmPos: [number, number] | null = null
    for (const cp of snapCps) {
      if (!cp.key.startsWith('em|')) continue
      const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
      const dist = Math.hypot(dpx - cx, dpy - cy)
      if (dist < bestDist) { bestDist = dist; bestEmKey = cp.key; bestEmPos = cp.pos }
    }
    if (bestEmKey && bestEmPos) return { kind: 'road', emKey: bestEmKey, pos: bestEmPos }
    return null
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (!roadNodeEditModeRef.current && !riverNodeEditModeRef.current && !railNodeEditModeRef.current) return
    const meta = metaRef.current
    const { w: cssW, h: cssH } = frameDimsRef.current
    if (!meta || cssW === 0) return
    const logical = clientToLogical(e.clientX, e.clientY)
    if (!logical) return
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    const { controlPoints } = roadNetworkRef.current.getBaseData(roadWiggleAmpRef.current, roadWiggleFreqRef.current, roadSegmentPropsRef.current as never, roadHopPropsRef.current as never, 2)
    const currentZoom = zoomRef.current ?? 1

    const dissolvedHexesHit = new Set<string>()
    for (const key of Object.keys(roadControlOverridesRef.current)) {
      if (key.startsWith('jt|')) dissolvedHexesHit.add(key.split('|')[1])
    }

    if (roadNodeEditModeRef.current) {
      const jtDotsHit = controlPoints.filter(cp => cp.key.startsWith('jt|') && dissolvedHexesHit.has(cp.key.split('|')[1]))
      const jtGroupsHit: { keys: string[]; pos: [number, number] }[] = []
      for (const cp of jtDotsHit) {
        const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
        let merged = false
        for (const g of jtGroupsHit) {
          const [gx, gy] = projectToCanvas(g.pos[0], g.pos[1], meta, pw, ph, px, py)
          if (Math.hypot(cx - gx, cy - gy) < 2) { g.keys.push(cp.key); merged = true; break }
        }
        if (!merged) jtGroupsHit.push({ keys: [cp.key], pos: cp.pos })
      }
      const hitR = 10 / currentZoom
      for (const g of jtGroupsHit) {
        const [cx, cy] = projectToCanvas(g.pos[0], g.pos[1], meta, pw, ph, px, py)
        if (Math.hypot(logical.lx - cx, logical.ly - cy) <= hitR) {
          draggingCpKeyRef.current = g.keys[0]; draggingCpGroupKeysRef.current = g.keys
          draggingCpKindRef.current = 'road'; e.stopPropagation(); return
        }
      }
      const junctions = controlPoints.filter(cp => cp.key.startsWith('ja|') && !dissolvedHexesHit.has(cp.key.slice(3)))
      const edges = controlPoints.filter(cp => cp.key.startsWith('em|'))
      for (const [cps, hitRScreen] of [[junctions, 10], [edges, 8]] as const) {
        const r = (hitRScreen as number) / currentZoom
        for (const cp of cps) {
          const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
          if (Math.hypot(logical.lx - cx, logical.ly - cy) <= r) {
            draggingCpKeyRef.current = cp.key; draggingCpGroupKeysRef.current = [cp.key]
            draggingCpKindRef.current = 'road'; e.stopPropagation(); return
          }
        }
      }
    }

    if (railNodeEditModeRef.current) {
      const { controlPoints: railCPs } = railBaseDataRef.current
      const hitR = 10 / currentZoom
      for (const cp of railCPs) {
        const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
        if (Math.hypot(logical.lx - cx, logical.ly - cy) <= hitR) {
          draggingCpKeyRef.current = cp.key; draggingCpGroupKeysRef.current = [cp.key]
          draggingCpKindRef.current = 'rail'; e.stopPropagation(); return
        }
      }
    }

    if (riverNodeEditModeRef.current) {
      const handleHitR = 8 / currentZoom
      for (const c of riverChainsV2Ref.current) {
        const existingHandles = riverChainOverridesRef.current[c.segKey]
        const handles = existingHandles ?? sparseHandles(c.baseChain)
        for (let i = 1; i < handles.length - 1; i++) {
          const [cx, cy] = projectToCanvas(handles[i][0], handles[i][1], meta, pw, ph, px, py)
          if (Math.hypot(logical.lx - cx, logical.ly - cy) <= handleHitR) {
            draggingDensePtRef.current = { id: c.segKey, handles: [...handles], handleIdx: i, kind: 'river' }
            dragLiveDensePosRef.current = handles[i]
            hoveredChainRef.current = null; hoveredHandleIdxRef.current = null
            e.stopPropagation(); return
          }
        }
      }
    }
  }

  const onMove = (e: MouseEvent) => {
    const meta = metaRef.current
    const { w: cssW, h: cssH } = frameDimsRef.current
    if (!meta || cssW === 0) return
    const logical = clientToLogical(e.clientX, e.clientY)
    if (!logical) return
    const { pw, ph, px, py } = getPaper(cssW, cssH)

    if (draggingCpKeyRef.current) {
      const lonLat = unprojectFromCanvas(logical.lx, logical.ly, meta, pw, ph, px, py)
      const groupOverrides: Record<string, [number, number]> = {}
      for (const k of draggingCpGroupKeysRef.current) groupOverrides[k] = lonLat
      dragLiveOverrideRef.current = { ...dragLiveOverrideRef.current, ...groupOverrides }
      snapPreviewRef.current = checkSnap(draggingCpKeyRef.current, lonLat, meta, pw, ph, px, py)
      scheduleRedraw(); return
    }

    if (draggingDensePtRef.current) {
      dragLiveDensePosRef.current = unprojectFromCanvas(logical.lx, logical.ly, meta, pw, ph, px, py)
      scheduleRedraw(); return
    }

    const currentZoom = zoomRef.current ?? 1
    const chainHoverR = 12 / currentZoom, dotHoverR = 8 / currentZoom
    let bestChainDist = chainHoverR
    let bestChain: { id: string; baseChain: [number, number][]; kind: 'road' | 'river' | 'rail' } | null = null

    if (roadNodeEditModeRef.current) {
      const { chains } = roadNetworkRef.current.getBaseData(roadWiggleAmpRef.current, roadWiggleFreqRef.current, roadSegmentPropsRef.current as never, roadHopPropsRef.current as never, 2)
      for (const c of chains) {
        if (c.id.startsWith('stub|')) continue
        for (let i = 0; i < c.chain.length - 1; i++) {
          const [ax, ay] = projectToCanvas(c.chain[i][0], c.chain[i][1], meta, pw, ph, px, py)
          const [bx, by] = projectToCanvas(c.chain[i + 1][0], c.chain[i + 1][1], meta, pw, ph, px, py)
          const d = distToSegment2D(logical.lx, logical.ly, ax, ay, bx, by)
          if (d < bestChainDist) { bestChainDist = d; bestChain = { id: c.id, baseChain: c.baseChain, kind: 'road' } }
        }
      }
    }
    if (riverNodeEditModeRef.current) {
      for (const c of riverChainsV2Ref.current) {
        for (let i = 0; i < c.chain.length - 1; i++) {
          const [ax, ay] = projectToCanvas(c.chain[i][0], c.chain[i][1], meta, pw, ph, px, py)
          const [bx, by] = projectToCanvas(c.chain[i + 1][0], c.chain[i + 1][1], meta, pw, ph, px, py)
          const d = distToSegment2D(logical.lx, logical.ly, ax, ay, bx, by)
          if (d < bestChainDist) { bestChainDist = d; bestChain = { id: c.segKey, baseChain: c.baseChain, kind: 'river' } }
        }
      }
    }
    if (railNodeEditModeRef.current) {
      for (const c of smoothedRailDataRef.current.chains) {
        for (let i = 0; i < c.chain.length - 1; i++) {
          const [ax, ay] = projectToCanvas(c.chain[i][0], c.chain[i][1], meta, pw, ph, px, py)
          const [bx, by] = projectToCanvas(c.chain[i + 1][0], c.chain[i + 1][1], meta, pw, ph, px, py)
          const d = distToSegment2D(logical.lx, logical.ly, ax, ay, bx, by)
          if (d < bestChainDist) { bestChainDist = d; bestChain = { id: c.id, baseChain: c.baseChain, kind: 'rail' } }
        }
      }
    }
    if (!roadNodeEditModeRef.current && !riverNodeEditModeRef.current && !railNodeEditModeRef.current) return

    let bestHandles: [number, number][] | null = null
    let bestHandleIdx: number | null = null
    if (bestChain) {
      const existing = bestChain.kind === 'road'
        ? roadChainOverridesRef.current[bestChain.id]
        : bestChain.kind === 'rail'
          ? railChainOverridesRef.current[bestChain.id]
          : riverChainOverridesRef.current[bestChain.id]
      bestHandles = existing ?? sparseHandles(bestChain.baseChain)
      let bestDotDist = dotHoverR
      for (let i = 1; i < bestHandles.length - 1; i++) {
        const [cx, cy] = projectToCanvas(bestHandles[i][0], bestHandles[i][1], meta, pw, ph, px, py)
        const d = Math.hypot(logical.lx - cx, logical.ly - cy)
        if (d < bestDotDist) { bestDotDist = d; bestHandleIdx = i }
      }
    }

    const prevId = hoveredChainRef.current?.id, prevIdx = hoveredHandleIdxRef.current
    hoveredChainRef.current = bestChain ? { id: bestChain.id, handles: bestHandles!, kind: bestChain.kind } : null
    hoveredHandleIdxRef.current = bestHandleIdx
    if (prevId !== bestChain?.id || prevIdx !== bestHandleIdx) scheduleRedraw()
  }

  const onUp = () => {
    const denseDrag = draggingDensePtRef.current, denseFinalPos = dragLiveDensePosRef.current
    if (denseDrag && denseFinalPos) {
      const newHandles = denseDrag.handles.map((p, i) => i === denseDrag.handleIdx ? denseFinalPos : p) as [number, number][]
      if (denseDrag.kind === 'river') setRiverChainOverrideRef.current(denseDrag.id, newHandles)
      else setRoadChainOverrideRef.current(denseDrag.id, newHandles)
    }
    draggingDensePtRef.current = null; dragLiveDensePosRef.current = null

    const dragKey = draggingCpKeyRef.current, groupKeys = draggingCpGroupKeysRef.current
    const snap = snapPreviewRef.current, finalPos = dragKey ? dragLiveOverrideRef.current[dragKey] : null
    draggingCpKeyRef.current = null; draggingCpGroupKeysRef.current = []; snapPreviewRef.current = null
    if (dragRafRef.current !== null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null }
    dragLiveOverrideRef.current = {}

    if (dragKey && snap && draggingCpKindRef.current !== 'rail') {
      const snapPos = snap.pos
      for (const k of groupKeys) {
        setRoadControlOverrideRef.current(k, snapPos)
        if (snap.kind === 'road') setRoadSnapBindingRef.current(k, snap.emKey)
        else deleteRoadSnapBindingRef.current(k)
      }
      if (snap.kind === 'sibling') {
        setRoadControlOverrideRef.current(snap.key, snapPos)
        deleteRoadSnapBindingRef.current(snap.key)
      }
    } else if (dragKey && finalPos) {
      if (draggingCpKindRef.current === 'rail') {
        for (const k of groupKeys) setRailControlOverrideRef.current(k, finalPos)
      } else {
        for (const k of groupKeys) {
          setRoadControlOverrideRef.current(k, finalPos)
          deleteRoadSnapBindingRef.current(k)
        }
      }
    }
    draggingCpKindRef.current = null
  }

  const onLeave = () => {
    if (hoveredChainRef.current || hoveredHandleIdxRef.current !== null) {
      hoveredChainRef.current = null; hoveredHandleIdxRef.current = null; scheduleRedraw()
    }
  }

  el.addEventListener('mousedown', onDown, { capture: true })
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  el.addEventListener('mouseleave', onLeave)
  return () => {
    el.removeEventListener('mousedown', onDown, { capture: true })
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    el.removeEventListener('mouseleave', onLeave)
    hoveredChainRef.current = null; hoveredHandleIdxRef.current = null
  }
}
