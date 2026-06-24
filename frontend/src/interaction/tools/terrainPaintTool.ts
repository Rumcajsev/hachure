import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { edgeBlobCanonicalKey } from '../../store/mapStore'
import { hexLineBetween, pointInPolygon, distToSeg } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'

export type PaintHoverTarget =
  | { type: 'hex'; q: number; r: number; verts: [number, number][] }
  | { type: 'edge'; p1: [number, number]; p2: [number, number]; edgeKey: string }
  | null

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface TerrainPaintRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  frameDimsRef: MutableRefObject<{ w: number; h: number }>
  hexEdgeModeRef: MutableRefObject<string>
  terrainEdgePaintEnabledRef: MutableRefObject<boolean>
  terrainBackgroundPaintEnabledRef: MutableRefObject<boolean>
  terrainPaintModeRef: MutableRefObject<boolean>
  elevationPaintModeRef: MutableRefObject<boolean>
  edgePaintHoldRef: MutableRefObject<boolean>
  bgPaintHoldRef: MutableRefObject<boolean>
  isPaintingRef: MutableRefObject<boolean>
  lastPaintedKeyRef: MutableRefObject<string | null>
  lastPaintedEdgeKeyRef: MutableRefObject<string | null>
  strokeTrailRef: MutableRefObject<Map<string, NonNullable<PaintHoverTarget>>>
  strokeTypeRef: MutableRefObject<'hex' | 'edge' | null>
  paintHoverTargetRef: MutableRefObject<PaintHoverTarget>
  pendingTerrainPaintRef: MutableRefObject<{ q: number; r: number; terrain: string }[]>
  pendingBgPaintRef: MutableRefObject<{ q: number; r: number; terrain: string | undefined }[]>
  pendingElevationPaintRef: MutableRefObject<{ q: number; r: number; cls: 'flat' | 'hills' | 'mountains' }[]>
  pendingEraseTerrainRef: MutableRefObject<{ q: number; r: number }[]>
  hexGeomMapRef: MutableRefObject<Map<string, { vertices: [number, number][] }>>
  terrainPaintBrushRef: MutableRefObject<string>
  elevationPaintBrushRef: MutableRefObject<'flat' | 'hills' | 'mountains'>
  edgeBlobPaintedRef: MutableRefObject<Record<string, string>>
  hoverRafRef: MutableRefObject<number | null>
  batchOverrideHexTerrainRef: MutableRefObject<(ops: { q: number; r: number; terrain: string }[]) => void>
  batchOverrideHexBackgroundRef: MutableRefObject<(ops: { q: number; r: number; terrain: string | undefined }[]) => void>
  batchOverrideHexElevationRef: MutableRefObject<(ops: { q: number; r: number; cls: 'flat' | 'hills' | 'mountains' }[]) => void>
  batchResetHexOverrideRef: MutableRefObject<(ops: { q: number; r: number }[]) => void>
  eraseEdgeBlobRef: MutableRefObject<(key: string) => void>
  paintEdgeBlobRef: MutableRefObject<(key: string, terrain: string) => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
  draw: () => void
  setIsTerrainPainting: (v: boolean) => void
}

function buildComputeHoverTarget(refs: TerrainPaintRefs) {
  return function computeHoverTarget(clientX: number, clientY: number): PaintHoverTarget {
    const { metaRef, hexesRef, clientToLogical, getPaper,
      terrainEdgePaintEnabledRef, edgePaintHoldRef, hexEdgeModeRef } = refs
    const meta = metaRef.current
    if (!meta) return null
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return null
    const { lx: lxCanvas, ly: lyCanvas, cssW, cssH } = logical
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    const lx = lxCanvas - px, ly = lyCanvas - py
    const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
    const R = meta.outer_radius_m * scalePxPerM
    const mgPx = meta.margin_mm * (pw / meta.paper_mm[0])
    const inMarginCheck = (verts: [number, number][]) =>
      verts.every(([x, y]) => x >= mgPx && x <= pw - mgPx && y >= mgPx && y <= ph - mgPx)

    const HEX_DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
    const SNAP = 2
    const vk2 = (p: [number, number]) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`

    const hexMap = new Map<string, GeneratedHex>()
    for (const hex of hexesRef.current) hexMap.set(`${hex.q},${hex.r}`, hex)

    if (terrainEdgePaintEnabledRef.current || edgePaintHoldRef.current) {
      const threshold = R * 0.35
      let bestDist = threshold
      let bestEdge: { p1: [number, number]; p2: [number, number]; edgeKey: string } | null = null

      for (const hex of hexesRef.current) {
        if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, 0, 0) as [number, number])
        const cx = verts.reduce((s, v) => s + v[0], 0) / 6
        const cy = verts.reduce((s, v) => s + v[1], 0) / 6
        if (Math.hypot(lx - cx, ly - cy) > R * 2) continue

        for (const [dq, dr] of HEX_DIRS) {
          const nq = hex.q + dq, nr = hex.r + dr
          const neighbor = hexMap.get(`${nq},${nr}`)
          if (!neighbor) continue
          const nverts = neighbor.vertices.map(([lon2, lat2]) => projectToCanvas(lon2, lat2, meta, pw, ph, 0, 0) as [number, number])
          const nkeys = new Set(nverts.map(vk2))
          const shared = verts.filter(v => nkeys.has(vk2(v)))
          if (shared.length < 2) continue
          const d = distToSeg([lx, ly], shared[0], shared[1])
          if (d < bestDist) {
            bestDist = d
            bestEdge = { p1: shared[0], p2: shared[1], edgeKey: edgeBlobCanonicalKey(hex.q, hex.r, nq, nr) }
          }
        }
      }

      if (bestEdge) return { type: 'edge', p1: bestEdge.p1, p2: bestEdge.p2, edgeKey: bestEdge.edgeKey }
    }

    for (const hex of hexesRef.current) {
      if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, 0, 0) as [number, number])
      if (!hex.partial && !inMarginCheck(verts)) continue
      if (pointInPolygon(lx, ly, verts)) {
        return { type: 'hex', q: hex.q, r: hex.r, verts }
      }
    }

    return null
  }
}

/** Attaches terrain + elevation paint mouse/keyboard handlers to `el`. Returns cleanup. */
export function attachTerrainPaintHandlers(el: HTMLElement, refs: TerrainPaintRefs): () => void {
  const { metaRef, hexesRef, frameDimsRef, getPaper,
    terrainPaintModeRef, elevationPaintModeRef,
    terrainEdgePaintEnabledRef, terrainBackgroundPaintEnabledRef,
    edgePaintHoldRef, bgPaintHoldRef,
    isPaintingRef, lastPaintedKeyRef, lastPaintedEdgeKeyRef,
    strokeTrailRef, strokeTypeRef, paintHoverTargetRef,
    pendingTerrainPaintRef, pendingBgPaintRef, pendingElevationPaintRef, pendingEraseTerrainRef,
    hexGeomMapRef, terrainPaintBrushRef, elevationPaintBrushRef,
    edgeBlobPaintedRef, hoverRafRef,
    batchOverrideHexTerrainRef, batchOverrideHexBackgroundRef, batchOverrideHexElevationRef,
    batchResetHexOverrideRef,
    eraseEdgeBlobRef, paintEdgeBlobRef,
    draw, setIsTerrainPainting,
  } = refs

  const computeHoverTarget = buildComputeHoverTarget(refs)

  const hoverKey = (t: PaintHoverTarget) => {
    if (!t) return null
    return t.type === 'hex' ? `hex:${t.q},${t.r}` : `edge:${t.edgeKey}`
  }

  const executePaint = (target: PaintHoverTarget) => {
    if (!target) return
    if (strokeTypeRef.current !== null && target.type !== strokeTypeRef.current) return
    if (target.type === 'hex') {
      const meta = metaRef.current
      const { w: cssW, h: cssH } = frameDimsRef.current
      const { pw, ph } = getPaper(cssW, cssH)
      let hexPath: [number, number][]
      if (lastPaintedKeyRef.current) {
        const [lq, lr] = lastPaintedKeyRef.current.split(',').map(Number)
        hexPath = hexLineBetween(lq, lr, target.q, target.r).slice(1)
      } else {
        hexPath = [[target.q, target.r]]
      }
      for (const [q, r] of hexPath) {
        const key = `${q},${r}`
        if (strokeTrailRef.current.has(`hex:${key}`)) continue
        const hexGeom = hexGeomMapRef.current.get(key)
        if (!hexGeom || !meta) continue
        const verts = hexGeom.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, 0, 0) as [number, number])
        lastPaintedKeyRef.current = key
        strokeTrailRef.current.set(`hex:${key}`, { type: 'hex', q, r, verts })
        if (elevationPaintModeRef.current) {
          pendingElevationPaintRef.current.push({ q, r, cls: elevationPaintBrushRef.current })
        } else if (terrainPaintBrushRef.current === 'eraser') {
          pendingEraseTerrainRef.current.push({ q, r })
        } else if (terrainBackgroundPaintEnabledRef.current || bgPaintHoldRef.current) {
          const brush = terrainPaintBrushRef.current
          pendingBgPaintRef.current.push({ q, r, terrain: brush === 'clear' ? undefined : brush })
        } else {
          pendingTerrainPaintRef.current.push({ q, r, terrain: terrainPaintBrushRef.current })
        }
      }
    } else {
      if (target.edgeKey !== lastPaintedEdgeKeyRef.current) {
        lastPaintedEdgeKeyRef.current = target.edgeKey
        strokeTrailRef.current.set(`edge:${target.edgeKey}`, target)
        if (elevationPaintModeRef.current) {
          const elBrush = elevationPaintBrushRef.current
          if (elBrush === 'flat') {
            eraseEdgeBlobRef.current(target.edgeKey)
          } else {
            paintEdgeBlobRef.current(target.edgeKey, elBrush)
          }
        } else {
          const brush = terrainPaintBrushRef.current
          if (brush === 'eraser') {
            eraseEdgeBlobRef.current(target.edgeKey)
          } else if (brush === 'clear' && edgeBlobPaintedRef.current[target.edgeKey] === 'clear') {
            eraseEdgeBlobRef.current(target.edgeKey)
          } else {
            paintEdgeBlobRef.current(target.edgeKey, brush)
          }
        }
      }
    }
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (!terrainPaintModeRef.current && !elevationPaintModeRef.current) return
    isPaintingRef.current = true
    lastPaintedKeyRef.current = null
    lastPaintedEdgeKeyRef.current = null
    strokeTrailRef.current.clear()
    pendingTerrainPaintRef.current = []
    pendingBgPaintRef.current = []
    pendingElevationPaintRef.current = []
    pendingEraseTerrainRef.current = []
    hexGeomMapRef.current = new Map(hexesRef.current.map(h => [`${h.q},${h.r}`, { vertices: h.vertices }]))
    setIsTerrainPainting(true)
    const target = computeHoverTarget(e.clientX, e.clientY)
    strokeTypeRef.current = target?.type ?? null
    paintHoverTargetRef.current = target
    executePaint(target)
  }

  const onMove = (e: MouseEvent) => {
    if (!terrainPaintModeRef.current && !elevationPaintModeRef.current) {
      if (paintHoverTargetRef.current !== null) {
        paintHoverTargetRef.current = null
        draw()
      }
      return
    }
    const target = computeHoverTarget(e.clientX, e.clientY)
    const changed = hoverKey(target) !== hoverKey(paintHoverTargetRef.current)
    paintHoverTargetRef.current = target
    if (isPaintingRef.current) executePaint(target)
    if (changed) {
      if (hoverRafRef.current === null) {
        hoverRafRef.current = requestAnimationFrame(() => { hoverRafRef.current = null; draw() })
      }
    }
  }

  const onUp = () => {
    if (isPaintingRef.current && (terrainPaintModeRef.current || elevationPaintModeRef.current)) {
      if (pendingTerrainPaintRef.current.length > 0) {
        batchOverrideHexTerrainRef.current(pendingTerrainPaintRef.current)
        pendingTerrainPaintRef.current = []
      }
      if (pendingBgPaintRef.current.length > 0) {
        batchOverrideHexBackgroundRef.current(pendingBgPaintRef.current)
        pendingBgPaintRef.current = []
      }
      if (pendingElevationPaintRef.current.length > 0) {
        batchOverrideHexElevationRef.current(pendingElevationPaintRef.current)
        pendingElevationPaintRef.current = []
      }
      if (pendingEraseTerrainRef.current.length > 0) {
        batchResetHexOverrideRef.current(pendingEraseTerrainRef.current)
        pendingEraseTerrainRef.current = []
      }
      setIsTerrainPainting(false)
    }
    isPaintingRef.current = false
    strokeTrailRef.current.clear()
    strokeTypeRef.current = null
  }

  const onLeave = () => {
    if (paintHoverTargetRef.current !== null) {
      paintHoverTargetRef.current = null
      draw()
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!terrainPaintModeRef.current && !elevationPaintModeRef.current) return
    if (e.key === 'Shift' && !terrainEdgePaintEnabledRef.current && !edgePaintHoldRef.current) {
      edgePaintHoldRef.current = true
      paintHoverTargetRef.current = null
      draw()
    }
    if (e.key === 'Alt' && !terrainBackgroundPaintEnabledRef.current && !bgPaintHoldRef.current) {
      bgPaintHoldRef.current = true
      paintHoverTargetRef.current = null
      draw()
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift' && edgePaintHoldRef.current) {
      edgePaintHoldRef.current = false
      paintHoverTargetRef.current = null
      draw()
    }
    if (e.key === 'Alt' && bgPaintHoldRef.current) {
      bgPaintHoldRef.current = false
      paintHoverTargetRef.current = null
      draw()
    }
  }

  el.addEventListener('mousedown', onDown)
  el.addEventListener('mouseleave', onLeave)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return () => {
    el.removeEventListener('mousedown', onDown)
    el.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }
}
