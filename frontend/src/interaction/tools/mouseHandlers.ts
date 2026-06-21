/**
 * Canvas mouse event handlers (onMouseMove, onClick, onMouseDown).
 * Each function takes a plain event-shape object and a refs bundle — no React imports.
 * TVC useCallbacks are thin wrappers that call these, all with [] deps.
 */
import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { WORLDCOVER_CLASSES } from '../../store/mapStore'
import { projectToCanvas, unprojectFromCanvas, computeWorldcoverBbox } from '../../lib/projection'
import { pointInPolygon } from '../../lib/geometry'
import { getLabelBoxBounds } from '../../lib/drawLabels'
import type { RiverChainV2 } from '../../lib/riverChains'
import type { RoadNetwork } from '../../lib/roadNetwork'
import type { LabelBBox } from '../../store/slices/labelOffsetsSlice'
import type { BlobMaskEdit } from '../../store/mapStore'

// RIVER_V2 is a Vite define flag — permanently true in this codebase
const RIVER_V2 = true

type LogicalResult = { lx: number; ly: number; cssW: number; cssH: number } | null
type PaperResult   = { pw: number; ph: number; px: number; py: number }
type ActiveTool = { type: string; [k: string]: unknown }
type LabelOverlay  = { id: string; name: string; [k: string]: unknown }
type IconOverlay   = { id: string; [k: string]: unknown }
type PlacedLabel   = { lon: number; lat: number; text?: string; [k: string]: unknown }
type Settlement    = { name: string; hex_q: number; hex_r: number; included: boolean; tier?: number }
type HighlightObj  = { id: string; mode: string }
type SmoothedRail  = { chains: { id: string; chain: [number, number][]; hopKeys?: string[]; hopRanges?: [number, number][] }[] }

// Subset of event props used by each handler (avoids React.MouseEvent dependency)
interface ME { clientX: number; clientY: number }
interface MEShift extends ME { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
interface MEDown extends ME { button: number }

export interface MouseHandlerRefs {
  // Canvas / frame
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
  frameDimsRef: MutableRefObject<{ w: number; h: number }>
  paperDimsRef: MutableRefObject<{ px: number; py: number } | null>
  zoomRef: MutableRefObject<number>
  // Core callbacks (via stable refs)
  clientToLogicalRef: MutableRefObject<(clientX: number, clientY: number) => LogicalResult>
  getPaperRef: MutableRefObject<(cssW: number, cssH: number) => PaperResult>
  drawRef: MutableRefObject<() => void>
  isEdgePaintActiveRef: MutableRefObject<() => 'highlight' | 'river' | false>
  paintEdgeRef: MutableRefObject<(hexQ: number, hexR: number, edgeI: number, forceMode?: 'add' | 'remove') => 'add' | 'remove' | null>
  // Tool & panel
  activeToolRef: MutableRefObject<ActiveTool>
  activePanelRef: MutableRefObject<string>
  // Label management
  liveLabelOffsetRef: MutableRefObject<{ id: string; dx: number; dy: number } | null>
  labelBBoxCacheRef: MutableRefObject<Record<string, LabelBBox>>
  labelDragStateRef: MutableRefObject<{ id: string; startLx: number; startLy: number; startDx: number; startDy: number } | null>
  hoveredLabelIdRef: MutableRefObject<string | null>
  labelOffsetsRef: MutableRefObject<Record<string, { dx: number; dy: number }>>
  editingLabelRef: MutableRefObject<boolean>
  setLabelOffsetRef: MutableRefObject<(id: string, dx: number, dy: number) => void>
  setActiveToolRef: MutableRefObject<(tool: ActiveTool) => void>
  // Label overlays
  labelOverlaysRef: MutableRefObject<LabelOverlay[]>
  placedLabelsRef: MutableRefObject<Record<string, PlacedLabel[]>>
  activeLabelOverlayIdRef: MutableRefObject<string | null>
  placeLabelRef: MutableRefObject<(overlayId: string, lon: number, lat: number, text: string) => void>
  removeLabelAtRef: MutableRefObject<(overlayId: string, index: number) => void>
  moveLabelToRef: MutableRefObject<(overlayId: string, index: number, lon: number, lat: number) => void>
  labelSnapRef: MutableRefObject<[number, number] | null>
  draggingLabelRef: MutableRefObject<{ overlayId: string; index: number } | null>
  // Icon overlays
  iconOverlaysRef: MutableRefObject<IconOverlay[]>
  placedIconsRef: MutableRefObject<Record<string, [number, number][]>>
  activeIconOverlayIdRef: MutableRefObject<string | null>
  placeIconRef: MutableRefObject<(overlayId: string, lon: number, lat: number) => void>
  removeIconAtRef: MutableRefObject<(overlayId: string, index: number) => void>
  iconSnapRef: MutableRefObject<[number, number] | null>
  iconPlaceModeRef: MutableRefObject<boolean>
  // Align-image drag
  alignImageDragRef: MutableRefObject<{ startX: number; startY: number; startTX: number; startTY: number } | null>
  mapImageTransformRef: MutableRefObject<{ translateX: number; translateY: number; [k: string]: unknown }>
  setMapImageTransformRef: MutableRefObject<(t: { translateX: number; translateY: number }) => void>
  // WorldCover hover
  showWorldcoverOverlayRef: MutableRefObject<boolean>
  worldcoverOffscreenRef: MutableRefObject<OffscreenCanvas | null>
  // OSM spotlight
  osmSpotlightModeRef: MutableRefObject<boolean>
  spotlightCursorRef: MutableRefObject<{ lx: number; ly: number } | null>
  spotlightRafRef: MutableRefObject<number | null>
  drawOsmHighlightRef: MutableRefObject<(() => void) | null>
  // Grid / hex data
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  hexEdgeModeRef: MutableRefObject<string>
  hexRadiusRef: MutableRefObject<number>
  projectedHexesRef: MutableRefObject<{ hex: GeneratedHex; verts: [number, number][] }[]>
  // Edge paint
  hoveredEdgeRef: MutableRefObject<{ hexQ: number; hexR: number; edgeI: number } | null>
  hoverRafRef: MutableRefObject<number | null>
  edgeDragRef: MutableRefObject<{ mode: 'add' | 'remove'; painted: Set<string> } | null>
  // Drag suppression
  draggedRef: MutableRefObject<boolean>
  // Blob mask
  blobMaskStrokeRef: MutableRefObject<[number, number][]>
  blobMaskDrawingRef: MutableRefObject<boolean>
  addBlobMaskEditRef: MutableRefObject<(edit: BlobMaskEdit) => void>
  // Highlights
  activeHighlightIdRef: MutableRefObject<string | null>
  highlightsRef: MutableRefObject<HighlightObj[]>
  highlightedHexesRef: MutableRefObject<Record<string, string>>
  highlightPaintModeRef: MutableRefObject<boolean>
  setHexHighlightRef: MutableRefObject<(q: number, r: number, id: string) => void>
  clearHexHighlightRef: MutableRefObject<(q: number, r: number) => void>
  // River select
  riverSelectModeRef: MutableRefObject<boolean>
  riverEditModeRef: MutableRefObject<boolean>
  riverChainsV2Ref: MutableRefObject<RiverChainV2[]>
  computedRiverChainsRef: MutableRefObject<{ vertices: [number, number][]; segKey: string }[]>
  selectedSegmentKeysRef: MutableRefObject<string[]>
  selectedHopKeyRef: MutableRefObject<string | null>
  setSelectedSegmentKeysRef: MutableRefObject<(keys: string[]) => void>
  setSelectedHopKeyRef: MutableRefObject<(key: string | null) => void>
  toggleSegmentSelectionRef: MutableRefObject<(key: string) => void>
  // Road select
  roadSelectModeRef: MutableRefObject<boolean>
  roadNetworkRef: MutableRefObject<RoadNetwork>
  roadWiggleAmpRef: MutableRefObject<number>
  roadWiggleFreqRef: MutableRefObject<number>
  roadSegmentPropsRef: MutableRefObject<Parameters<RoadNetwork['getBaseData']>[2]>
  roadHopPropsRef: MutableRefObject<Parameters<RoadNetwork['getBaseData']>[3]>
  selectedRoadSegmentKeysRef: MutableRefObject<string[]>
  selectedRoadHopKeyRef: MutableRefObject<string | null>
  setSelectedRoadSegmentKeysRef: MutableRefObject<(keys: string[]) => void>
  setSelectedRoadHopKeyRef: MutableRefObject<(key: string | null) => void>
  toggleRoadSegmentSelectionRef: MutableRefObject<(key: string) => void>
  // Settlements
  settlementMoveIndexRef: MutableRefObject<number | null>
  settlementPlaceTierRef: MutableRefObject<number | null>
  settlementsRef: MutableRefObject<Settlement[]>
  updateSettlementRef: MutableRefObject<(idx: number, patch: Record<string, unknown>) => void>
  setSettlementMoveIndexRef: MutableRefObject<((n: number | null) => void)>
  placeSettlementAtHexRef: MutableRefObject<(q: number, r: number, verts: [number, number][], center: [number, number], tier: number) => void>
  // Urban paint
  urbanPaintModeRef: MutableRefObject<string | null>
  toggleUrbanHexRef: MutableRefObject<(q: number, r: number) => void>
  // WC tooltip (state setter — unavoidable React dep)
  setWcTooltip: (v: { x: number; y: number; label: string } | null) => void
  wcTooltip: { x: number; y: number; label: string } | null
}

// ────────────────────────────────────────────────────────────────────────────
// onMouseMove
// ────────────────────────────────────────────────────────────────────────────
export function handleMouseMove(e: ME, refs: MouseHandlerRefs): void {
  const { activeToolRef, clientToLogicalRef, getPaperRef, drawRef, metaRef, hexesRef,
    hexEdgeModeRef, hexRadiusRef, projectedHexesRef, hoveredEdgeRef, hoverRafRef,
    edgeDragRef, isEdgePaintActiveRef, paintEdgeRef, liveLabelOffsetRef,
    labelBBoxCacheRef, labelDragStateRef, hoveredLabelIdRef, canvasRef,
    alignImageDragRef, frameDimsRef, paperDimsRef, zoomRef, setMapImageTransformRef,
    showWorldcoverOverlayRef, worldcoverOffscreenRef, setWcTooltip, wcTooltip,
    osmSpotlightModeRef, spotlightCursorRef, spotlightRafRef, drawOsmHighlightRef,
    iconPlaceModeRef, activePanelRef, iconSnapRef, labelSnapRef } = refs

  // Label-follow — label tracks cursor until confirmed with a click
  if (activeToolRef.current.type === 'label-follow') {
    const tool = activeToolRef.current as { type: 'label-follow'; id: string; iconCx: number; iconCy: number }
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      liveLabelOffsetRef.current = { id: tool.id, dx: logical.lx - tool.iconCx, dy: logical.ly - tool.iconCy }
      drawRef.current()
    }
    return
  }

  // Label drag — live preview and hover highlight
  if (activeToolRef.current.type === 'label-drag') {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      const { lx, ly } = logical
      if (labelDragStateRef.current) {
        const { id, startLx, startLy, startDx, startDy } = labelDragStateRef.current
        liveLabelOffsetRef.current = { id, dx: startDx + (lx - startLx), dy: startDy + (ly - startLy) }
        drawRef.current()
      } else {
        const cache = labelBBoxCacheRef.current
        let hit: string | null = null
        for (const [id, bbox] of Object.entries(cache)) {
          const cos = Math.cos(-bbox.angle), sin = Math.sin(-bbox.angle)
          const rx = (lx - bbox.cx) * cos - (ly - bbox.cy) * sin
          const ry = (lx - bbox.cx) * sin + (ly - bbox.cy) * cos
          if (Math.abs(rx) <= bbox.hw + 4 && Math.abs(ry) <= bbox.hh + 4) { hit = id; break }
        }
        if (hit !== hoveredLabelIdRef.current) {
          hoveredLabelIdRef.current = hit
          drawRef.current()
        }
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = hit ? 'grab' : 'default'
      }
    }
    return
  }

  // Align-image drag
  if (alignImageDragRef.current) {
    const drag = alignImageDragRef.current
    const { w: cssW } = frameDimsRef.current
    const { pw } = paperDimsRef.current ?? { pw: cssW }
    const zoom = zoomRef.current
    const dx = (e.clientX - drag.startX) / zoom / pw
    const dy = (e.clientY - drag.startY) / zoom / pw
    setMapImageTransformRef.current({ translateX: drag.startTX + dx, translateY: drag.startTY + dy })
    return
  }

  // WorldCover pixel hover
  if (showWorldcoverOverlayRef.current && worldcoverOffscreenRef.current) {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    const meta = metaRef.current
    if (logical && meta) {
      const { lx, ly, cssW, cssH } = logical
      const { pw, ph, px, py } = getPaperRef.current(cssW, cssH)
      const [lon, lat] = unprojectFromCanvas(lx, ly, meta, pw, ph, px, py)
      const wcBbox = computeWorldcoverBbox(meta)
      if (wcBbox) {
        const { minLon, maxLon, minLat, maxLat } = wcBbox
        const fracX = (lon - minLon) / (maxLon - minLon)
        const fracY = (maxLat - lat) / (maxLat - minLat)
        if (fracX >= 0 && fracX <= 1 && fracY >= 0 && fracY <= 1) {
          const off = worldcoverOffscreenRef.current
          const ipx = Math.floor(fracX * off.width)
          const ipy = Math.floor(fracY * off.height)
          const octx = off.getContext('2d')!
          const [r, g, b] = octx.getImageData(ipx, ipy, 1, 1).data
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          const cls = WORLDCOVER_CLASSES.find(c => c.color.toLowerCase() === hex.toLowerCase())
          const label = cls ? `${cls.code} — ${cls.name}` : '0 — Ocean / no data'
          setWcTooltip({ x: e.clientX, y: e.clientY, label })
        } else {
          setWcTooltip(null)
        }
      }
    } else {
      setWcTooltip(null)
    }
  } else if (wcTooltip) {
    setWcTooltip(null)
  }

  // OSM spotlight
  if (osmSpotlightModeRef.current) {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      spotlightCursorRef.current = { lx: logical.lx, ly: logical.ly }
      if (spotlightRafRef.current === null) {
        spotlightRafRef.current = requestAnimationFrame(() => {
          spotlightRafRef.current = null
          drawOsmHighlightRef.current?.()
        })
      }
    }
  }

  // Icon-place snap
  if (iconPlaceModeRef.current && activePanelRef.current === 'highlights') {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      const { lx, ly, cssW, cssH } = logical
      const meta = metaRef.current
      if (meta) {
        const { pw, ph, px, py } = getPaperRef.current(cssW, cssH)
        const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
        const R2 = meta.outer_radius_m * scalePxPerM
        const snapRadius = R2 * 0.1
        let best: [number, number] | null = null
        let bestDist = snapRadius
        for (const hex of hexesRef.current) {
          if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
          const [cx, cy] = projectToCanvas(hex.center[0], hex.center[1], meta, pw, ph, px, py)
          if (Math.max(Math.abs(lx - cx), Math.abs(ly - cy)) > R2 * 1.5) continue
          const d0 = Math.hypot(lx - cx, ly - cy)
          if (d0 < bestDist) { bestDist = d0; best = [hex.center[0], hex.center[1]] }
          for (const [vlon, vlat] of hex.vertices) {
            const [vx, vy] = projectToCanvas(vlon, vlat, meta, pw, ph, px, py)
            const mx2 = (cx + vx) / 2, my2 = (cy + vy) / 2
            const d = Math.hypot(lx - mx2, ly - my2)
            if (d < bestDist) { bestDist = d; best = unprojectFromCanvas(mx2, my2, meta, pw, ph, px, py) as [number, number] }
          }
        }
        iconSnapRef.current = best ?? unprojectFromCanvas(lx, ly, meta, pw, ph, px, py) as [number, number]
        drawRef.current()
      }
    }
    return
  }

  // Label-place snap
  if (activeToolRef.current.type === 'label-place' && activePanelRef.current === 'highlights') {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      const { lx, ly, cssW, cssH } = logical
      const meta = metaRef.current
      if (meta) {
        const { pw, ph, px, py } = getPaperRef.current(cssW, cssH)
        const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
        const R2 = meta.outer_radius_m * scalePxPerM
        const snapRadius = R2 * 0.1
        let best: [number, number] | null = null
        let bestDist = snapRadius
        for (const hex of hexesRef.current) {
          if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
          const [cx, cy] = projectToCanvas(hex.center[0], hex.center[1], meta, pw, ph, px, py)
          if (Math.max(Math.abs(lx - cx), Math.abs(ly - cy)) > R2 * 1.5) continue
          const d0 = Math.hypot(lx - cx, ly - cy)
          if (d0 < bestDist) { bestDist = d0; best = [hex.center[0], hex.center[1]] }
          for (const [vlon, vlat] of hex.vertices) {
            const [vx, vy] = projectToCanvas(vlon, vlat, meta, pw, ph, px, py)
            const mx2 = (cx + vx) / 2, my2 = (cy + vy) / 2
            const d = Math.hypot(lx - mx2, ly - my2)
            if (d < bestDist) { bestDist = d; best = unprojectFromCanvas(mx2, my2, meta, pw, ph, px, py) as [number, number] }
          }
        }
        labelSnapRef.current = best ?? unprojectFromCanvas(lx, ly, meta, pw, ph, px, py) as [number, number]
        drawRef.current()
      }
    }
    return
  }

  // Edge-paint hover
  if (!isEdgePaintActiveRef.current()) {
    if (hoveredEdgeRef.current !== null) { hoveredEdgeRef.current = null; drawRef.current() }
    return
  }
  const logical = clientToLogicalRef.current(e.clientX, e.clientY)
  if (!logical) return
  const { lx: mx0, ly: my0, cssW: edgeCssW, cssH: edgeCssH } = logical
  const { px: edgePx, py: edgePy } = getPaperRef.current(edgeCssW, edgeCssH)
  const mx = mx0 - edgePx, my = my0 - edgePy

  let best: { hexQ: number; hexR: number; edgeI: number } | null = null
  let bestDist = hexRadiusRef.current * 0.8
  for (const { hex, verts } of projectedHexesRef.current) {
    for (let i = 0; i < 6; i++) {
      const v0 = verts[i], v1 = verts[(i + 1) % 6]
      const dist = Math.hypot(mx - (v0[0] + v1[0]) / 2, my - (v0[1] + v1[1]) / 2)
      if (dist < bestDist) { bestDist = dist; best = { hexQ: hex.q, hexR: hex.r, edgeI: i } }
    }
  }
  const prev = hoveredEdgeRef.current
  if (best?.hexQ !== prev?.hexQ || best?.hexR !== prev?.hexR || best?.edgeI !== prev?.edgeI) {
    hoveredEdgeRef.current = best
    if (hoverRafRef.current === null) {
      hoverRafRef.current = requestAnimationFrame(() => { hoverRafRef.current = null; drawRef.current() })
    }
    if (best && edgeDragRef.current) {
      const paintKey = `${best.hexQ},${best.hexR},${best.edgeI}`
      if (!edgeDragRef.current.painted.has(paintKey)) {
        edgeDragRef.current.painted.add(paintKey)
        paintEdgeRef.current(best.hexQ, best.hexR, best.edgeI, edgeDragRef.current.mode)
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// onClick
// ────────────────────────────────────────────────────────────────────────────
export function handleClick(e: MEShift, refs: MouseHandlerRefs): void {
  const { editingLabelRef, draggedRef, metaRef, clientToLogicalRef, getPaperRef, drawRef,
    hexRadiusRef, riverSelectModeRef, riverEditModeRef, riverChainsV2Ref, computedRiverChainsRef,
    selectedSegmentKeysRef, selectedHopKeyRef, setSelectedSegmentKeysRef, setSelectedHopKeyRef,
    toggleSegmentSelectionRef, setActiveToolRef, roadSelectModeRef, roadNetworkRef,
    roadWiggleAmpRef, roadWiggleFreqRef, roadSegmentPropsRef, roadHopPropsRef,
    selectedRoadSegmentKeysRef, selectedRoadHopKeyRef, setSelectedRoadSegmentKeysRef,
    setSelectedRoadHopKeyRef, toggleRoadSegmentSelectionRef, isEdgePaintActiveRef,
    hoveredEdgeRef, paintEdgeRef, activePanelRef, activeToolRef, hexesRef, hexEdgeModeRef,
    activeHighlightIdRef, highlightsRef, highlightedHexesRef, setHexHighlightRef, clearHexHighlightRef,
    urbanPaintModeRef, toggleUrbanHexRef, settlementMoveIndexRef, settlementPlaceTierRef,
    settlementsRef, updateSettlementRef, setSettlementMoveIndexRef, placeSettlementAtHexRef,
    activeIconOverlayIdRef, placedIconsRef, placeIconRef, removeIconAtRef, iconSnapRef,
    iconOverlaysRef, activeLabelOverlayIdRef, placedLabelsRef, placeLabelRef, removeLabelAtRef,
    labelSnapRef, labelOverlaysRef } = refs

  if (editingLabelRef.current) return
  if (draggedRef.current) return
  const meta = metaRef.current
  if (!meta) return
  const logical = clientToLogicalRef.current(e.clientX, e.clientY)
  if (!logical) return
  const { lx, ly, cssW, cssH } = logical
  const { pw, ph, px, py } = getPaperRef.current(cssW, cssH)
  const mmToPx = pw / meta.paper_mm[0]
  const mgPx = meta.margin_mm * mmToPx
  const marginL = px + mgPx, marginR = px + pw - mgPx
  const marginT = py + mgPx, marginB = py + ph - mgPx
  const inMargin = (verts: [number, number][]) =>
    verts.every(([x, y]) => x >= marginL && x <= marginR && y >= marginT && y <= marginB)

  const pickSegment = (
    chains: { vertices: [number, number][]; segKey: string }[],
    shiftHeld: boolean,
    currentKeys: string[],
    setKeys: (k: string[]) => void,
    toggleKey: (k: string) => void,
  ) => {
    const R = hexRadiusRef.current
    let bestKey: string | null = null, bestDist = Infinity
    for (const { vertices, segKey } of chains) {
      const pxPts = vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number, number][]
      for (let i = 0; i < pxPts.length - 1; i++) {
        const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / len2)) : 0
        const dist = Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy))
        if (dist < bestDist) { bestDist = dist; bestKey = segKey }
      }
    }
    const threshold = R * 0.6
    if (bestDist < threshold && bestKey) {
      if (shiftHeld) toggleKey(bestKey)
      else if (currentKeys.length === 1 && currentKeys[0] === bestKey) setKeys([])
      else setKeys([bestKey])
    } else if (!shiftHeld) {
      setKeys([])
    }
  }

  // River select mode
  if (riverSelectModeRef.current && riverEditModeRef.current) {
    const shiftHeld = e.shiftKey, cmdHeld = e.metaKey || e.ctrlKey
    if (cmdHeld && RIVER_V2 && selectedSegmentKeysRef.current.length > 0) {
      const R = hexRadiusRef.current
      let bestHopKey: string | null = null, bestDist = Infinity
      for (const chain of riverChainsV2Ref.current) {
        if (!selectedSegmentKeysRef.current.includes(chain.segKey)) continue
        const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number, number][]
        for (let h = 0; h < chain.hopKeys.length; h++) {
          const [s, e2] = chain.hopRanges[h]
          for (let i = s; i < e2; i++) {
            const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
            const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / len2)) : 0
            const dist = Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy))
            if (dist < bestDist) { bestDist = dist; bestHopKey = chain.hopKeys[h] }
          }
        }
      }
      if (bestDist < R * 0.6 && bestHopKey) setSelectedHopKeyRef.current(selectedHopKeyRef.current === bestHopKey ? null : bestHopKey)
      else setSelectedHopKeyRef.current(null)
      drawRef.current(); return
    }
    const R2 = hexRadiusRef.current
    let nearestDist = Infinity
    for (const { vertices } of computedRiverChainsRef.current) {
      const pxPts = vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number, number][]
      for (let i = 0; i < pxPts.length - 1; i++) {
        const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / len2)) : 0
        nearestDist = Math.min(nearestDist, Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy)))
      }
    }
    if (!shiftHeld && nearestDist >= R2 * 0.6) {
      setSelectedSegmentKeysRef.current([])
      setSelectedHopKeyRef.current(null)
      setActiveToolRef.current({ type: 'none' })
      drawRef.current(); return
    }
    pickSegment(computedRiverChainsRef.current, shiftHeld,
      selectedSegmentKeysRef.current,
      setSelectedSegmentKeysRef.current, toggleSegmentSelectionRef.current)
    setSelectedHopKeyRef.current(null)
    drawRef.current(); return
  }

  // Road select mode
  if (roadSelectModeRef.current) {
    const shiftHeld = e.shiftKey, cmdHeld = e.metaKey || e.ctrlKey
    const R2 = hexRadiusRef.current
    const roadChains = roadNetworkRef.current.getBaseData(roadWiggleAmpRef.current, roadWiggleFreqRef.current, roadSegmentPropsRef.current, roadHopPropsRef.current, 2).chains
    if (cmdHeld && selectedRoadSegmentKeysRef.current.length > 0) {
      let bestHopKey: string | null = null, bestDist = Infinity
      for (const chain of roadChains) {
        if (!selectedRoadSegmentKeysRef.current.includes(chain.id)) continue
        if (!chain.hopKeys || !chain.hopRanges) continue
        const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number, number][]
        for (let h = 0; h < chain.hopKeys.length; h++) {
          const [s, e2] = chain.hopRanges[h]
          for (let i = s; i < e2; i++) {
            const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
            const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / len2)) : 0
            const dist = Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy))
            if (dist < bestDist) { bestDist = dist; bestHopKey = chain.hopKeys[h] }
          }
        }
      }
      if (bestDist < R2 * 0.6 && bestHopKey) setSelectedRoadHopKeyRef.current(selectedRoadHopKeyRef.current === bestHopKey ? null : bestHopKey)
      else setSelectedRoadHopKeyRef.current(null)
      drawRef.current(); return
    }
    let bestId: string | null = null, bestDist = Infinity
    for (const chain of roadChains) {
      if (chain.id.startsWith('stub|')) continue
      const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number, number][]
      for (let i = 0; i < pxPts.length - 1; i++) {
        const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / len2)) : 0
        const dist = Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy))
        if (dist < bestDist) { bestDist = dist; bestId = chain.id }
      }
    }
    if (!shiftHeld && bestDist >= R2 * 0.6) {
      setSelectedRoadSegmentKeysRef.current([])
      setSelectedRoadHopKeyRef.current(null)
      setActiveToolRef.current({ type: 'none' })
      drawRef.current(); return
    }
    if (bestDist < R2 * 0.6 && bestId) {
      if (shiftHeld) toggleRoadSegmentSelectionRef.current(bestId)
      else if (selectedRoadSegmentKeysRef.current.length === 1 && selectedRoadSegmentKeysRef.current[0] === bestId) setSelectedRoadSegmentKeysRef.current([])
      else setSelectedRoadSegmentKeysRef.current([bestId])
      setSelectedRoadHopKeyRef.current(null)
    } else if (!shiftHeld) {
      setSelectedRoadSegmentKeysRef.current([])
      setSelectedRoadHopKeyRef.current(null)
    }
    drawRef.current(); return
  }

  // Edge-paint click
  if (isEdgePaintActiveRef.current() && hoveredEdgeRef.current) {
    const { hexQ, hexR, edgeI } = hoveredEdgeRef.current
    paintEdgeRef.current(hexQ, hexR, edgeI)
    return
  }

  // Highlights panel — icon/label place/erase
  if (activePanelRef.current === 'highlights') {
    const tool = activeToolRef.current
    if (tool.type === 'icon-place') {
      const overlayId = activeIconOverlayIdRef.current
      if (overlayId) {
        const pos = iconSnapRef.current
        if (pos) {
          const icons = placedIconsRef.current[overlayId] ?? []
          const removeRadius = hexRadiusRef.current * 0.5
          for (let i = 0; i < icons.length; i++) {
            const [ilon, ilat] = icons[i]
            const [ix, iy] = projectToCanvas(ilon, ilat, meta, pw, ph, px, py)
            if (Math.hypot(lx - ix, ly - iy) < removeRadius) { removeIconAtRef.current(overlayId, i); return }
          }
          placeIconRef.current(overlayId, pos[0], pos[1])
          return
        }
      }
    }
    if (tool.type === 'icon-erase') {
      const overlayId = activeIconOverlayIdRef.current
      if (overlayId) {
        const icons = placedIconsRef.current[overlayId] ?? []
        const removeRadius = hexRadiusRef.current * 0.5
        for (let i = 0; i < icons.length; i++) {
          const [ilon, ilat] = icons[i]
          const [ix, iy] = projectToCanvas(ilon, ilat, meta, pw, ph, px, py)
          if (Math.hypot(lx - ix, ly - iy) < removeRadius) { removeIconAtRef.current(overlayId, i); return }
        }
      }
      return
    }
    if (tool.type === 'icon-erase-any') {
      for (const overlay of iconOverlaysRef.current) {
        const icons = placedIconsRef.current[overlay.id] ?? []
        const removeRadius = hexRadiusRef.current * 0.5
        for (let i = 0; i < icons.length; i++) {
          const [ilon, ilat] = icons[i]
          const [ix, iy] = projectToCanvas(ilon, ilat, meta, pw, ph, px, py)
          if (Math.hypot(lx - ix, ly - iy) < removeRadius) { removeIconAtRef.current(overlay.id, i); return }
        }
      }
      return
    }
    if (tool.type === 'label-place') {
      const overlayId = activeLabelOverlayIdRef.current
      if (overlayId) {
        const pos = labelSnapRef.current
        if (pos) {
          const labels = placedLabelsRef.current[overlayId] ?? []
          const removeRadius = hexRadiusRef.current * 0.5
          for (let i = 0; i < labels.length; i++) {
            const { lon, lat } = labels[i]
            const [ix, iy] = projectToCanvas(lon, lat, meta, pw, ph, px, py)
            if (Math.hypot(lx - ix, ly - iy) < removeRadius) { removeLabelAtRef.current(overlayId, i); return }
          }
          const overlay = labelOverlaysRef.current.find(o => o.id === overlayId)
          placeLabelRef.current(overlayId, pos[0], pos[1], overlay?.name ?? 'Label')
          return
        }
      }
    }
    if (tool.type === 'label-erase') {
      const overlayId = activeLabelOverlayIdRef.current
      if (overlayId) {
        const labels = placedLabelsRef.current[overlayId] ?? []
        const removeRadius = hexRadiusRef.current * 0.5
        for (let i = 0; i < labels.length; i++) {
          const { lon, lat } = labels[i]
          const [ix, iy] = projectToCanvas(lon, lat, meta, pw, ph, px, py)
          if (Math.hypot(lx - ix, ly - iy) < removeRadius) { removeLabelAtRef.current(overlayId, i); return }
        }
      }
      return
    }
  }

  // Hex hit-test for tool actions
  for (const hex of hexesRef.current) {
    if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
    const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
    if (!hex.partial && !inMargin(verts)) continue
    if (!pointInPolygon(lx, ly, verts)) continue

    if (activePanelRef.current === 'highlights') {
      const tool = activeToolRef.current
      if (tool.type === 'highlight-paint') {
        const hlId = activeHighlightIdRef.current
        if (hlId) {
          const hl = highlightsRef.current.find(h => h.id === hlId)
          if (hl?.mode === 'area') {
            const key = `${hex.q},${hex.r}`
            if (highlightedHexesRef.current[key] === hlId) clearHexHighlightRef.current(hex.q, hex.r)
            else setHexHighlightRef.current(hex.q, hex.r, hlId)
          }
        }
        return
      }
      if (tool.type === 'highlight-erase') {
        const hlId = activeHighlightIdRef.current
        if (hlId) {
          const hl = highlightsRef.current.find(h => h.id === hlId)
          if (hl?.mode === 'area') {
            const key = `${hex.q},${hex.r}`
            if (highlightedHexesRef.current[key] === hlId) clearHexHighlightRef.current(hex.q, hex.r)
          }
        }
        return
      }
      if (tool.type === 'highlight-erase-any') {
        const key = `${hex.q},${hex.r}`
        if (highlightedHexesRef.current[key]) clearHexHighlightRef.current(hex.q, hex.r)
        return
      }
    }
    if (activePanelRef.current === 'features' && urbanPaintModeRef.current !== null) {
      toggleUrbanHexRef.current(hex.q, hex.r); return
    }
    if (activePanelRef.current === 'features') {
      const moveIdx = settlementMoveIndexRef.current
      if (moveIdx !== null) {
        updateSettlementRef.current(moveIdx, { hex_q: hex.q, hex_r: hex.r })
        setSettlementMoveIndexRef.current(null)
      } else {
        const tier = settlementPlaceTierRef.current
        if (!tier) return
        const existing = settlementsRef.current
        const existingIdx = existing.findIndex(s => s.hex_q === hex.q && s.hex_r === hex.r)
        if (existingIdx !== -1) updateSettlementRef.current(existingIdx, { tier })
        else placeSettlementAtHexRef.current(hex.q, hex.r, hex.vertices as [number, number][], hex.center as [number, number], tier)
      }
      return
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// onMouseDown
// ────────────────────────────────────────────────────────────────────────────
export function handleMouseDown(e: MEDown, refs: MouseHandlerRefs): void {
  if (e.button !== 0) return
  const { editingLabelRef, draggedRef, activeToolRef, liveLabelOffsetRef, setLabelOffsetRef,
    setActiveToolRef, drawRef, labelBBoxCacheRef, labelOffsetsRef, labelDragStateRef,
    canvasRef, clientToLogicalRef, mapImageTransformRef, alignImageDragRef,
    activePanelRef, labelOverlaysRef, placedLabelsRef, draggingLabelRef, labelSnapRef,
    moveLabelToRef, getPaperRef, metaRef, blobMaskStrokeRef, blobMaskDrawingRef,
    addBlobMaskEditRef, isEdgePaintActiveRef, hoveredEdgeRef, paintEdgeRef, edgeDragRef } = refs

  if (editingLabelRef.current) return
  draggedRef.current = false

  // Label-follow — commit current label position
  if (activeToolRef.current.type === 'label-follow') {
    if (liveLabelOffsetRef.current) {
      const { id, dx, dy } = liveLabelOffsetRef.current
      setLabelOffsetRef.current(id, dx, dy)
    }
    liveLabelOffsetRef.current = null
    setActiveToolRef.current({ type: 'none' })
    drawRef.current(); return
  }

  // Label-drag — start dragging label under cursor
  if (activeToolRef.current.type === 'label-drag') {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      const { lx, ly } = logical
      const cache = labelBBoxCacheRef.current
      for (const [id, bbox] of Object.entries(cache)) {
        const cos = Math.cos(-bbox.angle), sin = Math.sin(-bbox.angle)
        const rx = (lx - bbox.cx) * cos - (ly - bbox.cy) * sin
        const ry = (lx - bbox.cx) * sin + (ly - bbox.cy) * cos
        if (Math.abs(rx) <= bbox.hw + 4 && Math.abs(ry) <= bbox.hh + 4) {
          const existing = labelOffsetsRef.current[id] ?? { dx: 0, dy: 0 }
          labelDragStateRef.current = { id, startLx: lx, startLy: ly, startDx: existing.dx, startDy: existing.dy }
          const canvas = canvasRef.current
          if (canvas) canvas.style.cursor = 'grabbing'
          const onUp = () => {
            if (liveLabelOffsetRef.current) {
              const { id: lid, dx, dy } = liveLabelOffsetRef.current
              setLabelOffsetRef.current(lid, dx, dy)
            }
            labelDragStateRef.current = null
            liveLabelOffsetRef.current = null
            if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
            drawRef.current()
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mouseup', onUp)
          break
        }
      }
    }
    return
  }

  // Align-image drag
  if (activeToolRef.current.type === 'align-image') {
    const t = mapImageTransformRef.current
    alignImageDragRef.current = { startX: e.clientX, startY: e.clientY, startTX: t.translateX, startTY: t.translateY }
    const onUp = () => { alignImageDragRef.current = null; window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mouseup', onUp); return
  }

  // Label drag — detect mousedown over placed label in label-place mode
  if (activeToolRef.current.type === 'label-place' && activePanelRef.current === 'highlights') {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (logical) {
      const { lx, ly, cssW, cssH } = logical
      const meta = metaRef.current
      const canvas = canvasRef.current
      if (meta && canvas) {
        const { pw, ph, px, py } = getPaperRef.current(cssW, cssH)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          for (const overlay of labelOverlaysRef.current) {
            const labels = placedLabelsRef.current[overlay.id] ?? []
            for (let i = 0; i < labels.length; i++) {
              const { lon, lat, text } = labels[i]
              const [cx, cy] = projectToCanvas(lon, lat, meta, pw, ph, px, py)
              const { bx, by, bw, bh } = getLabelBoxBounds(ctx, cx, cy, (text as string | undefined) || (overlay.name as string), overlay as Parameters<typeof getLabelBoxBounds>[4])
              if (lx >= bx && lx <= bx + bw && ly >= by && ly <= by + bh) {
                draggingLabelRef.current = { overlayId: overlay.id, index: i }
                draggedRef.current = true
                const onUp = () => {
                  const snap = labelSnapRef.current
                  const dl = draggingLabelRef.current
                  if (dl && snap) moveLabelToRef.current(dl.overlayId, dl.index, snap[0], snap[1])
                  draggingLabelRef.current = null
                  drawRef.current()
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mouseup', onUp); return
              }
            }
          }
        }
      }
    }
  }

  // Blob mask freehand drawing
  if (activeToolRef.current.type === 'blob-mask') {
    const logical = clientToLogicalRef.current(e.clientX, e.clientY)
    if (!logical) return
    blobMaskStrokeRef.current = [[logical.lx, logical.ly]]
    blobMaskDrawingRef.current = true
    draggedRef.current = true
    const onMove = (ev: MouseEvent) => {
      const log = clientToLogicalRef.current(ev.clientX, ev.clientY)
      if (!log) return
      const last = blobMaskStrokeRef.current.at(-1)!
      if (Math.hypot(log.lx - last[0], log.ly - last[1]) > 3) {
        blobMaskStrokeRef.current = [...blobMaskStrokeRef.current, [log.lx, log.ly]]
        drawRef.current()
      }
    }
    const onUp = () => {
      blobMaskDrawingRef.current = false
      const pts = blobMaskStrokeRef.current
      blobMaskStrokeRef.current = []
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (pts.length < 2) { drawRef.current(); return }
      const tool = activeToolRef.current
      if (tool.type !== 'blob-mask') { drawRef.current(); return }
      const meta = metaRef.current
      const canvas = canvasRef.current
      if (!meta || !canvas) { drawRef.current(); return }
      const { pw, ph, px, py } = getPaperRef.current(canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio)
      const unproj = (p: [number, number]): [number, number] => unprojectFromCanvas(p[0], p[1], meta, pw, ph, px, py)
      const polygon = pts.map(unproj)
      if (polygon.length > 2) polygon.push(polygon[0])
      addBlobMaskEditRef.current({
        id: `mask-${Date.now()}`,
        terrain: tool.terrain as string,
        type: tool.mode as BlobMaskEdit['type'],
        polygon,
      })
      drawRef.current()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp); return
  }

  // Edge-paint drag
  if (isEdgePaintActiveRef.current() && hoveredEdgeRef.current) {
    const { hexQ, hexR, edgeI } = hoveredEdgeRef.current
    const paintKey = `${hexQ},${hexR},${edgeI}`
    const firstAction = paintEdgeRef.current(hexQ, hexR, edgeI)
    if (firstAction) {
      edgeDragRef.current = { mode: firstAction, painted: new Set([paintKey]) }
      draggedRef.current = true
    }
    const onUp = () => { edgeDragRef.current = null; window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mouseup', onUp); return
  }

  // Default: track drag distance to suppress click
  const startX = e.clientX, startY = e.clientY
  const onMove = (ev: MouseEvent) => {
    if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) draggedRef.current = true
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
