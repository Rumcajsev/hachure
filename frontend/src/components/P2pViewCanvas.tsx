import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { makeP2pBoardProjection, P2P_GRID_CELL_KM } from '../lib/p2pNetwork'
import {
  traceP2pRegionFaces, splitP2pRegionFaces, cellKey, regionType, regionAnchorKey,
  type P2pTerrainRegion,
} from '../lib/p2pTerrainRegions'
import { P2P_TERRAIN_TYPES, type P2pTerrainType } from '../store/slices/p2pTerrainSlice'
import { drawP2pTerrain, DEFAULT_P2P_TERRAIN_STYLES } from '../lib/drawP2pTerrain'
import { drawP2pTowns, DEFAULT_P2P_TOWN_TIER_STYLES } from '../lib/drawP2pTowns'
import { drawRoadsAndRails, type RoadChainPx } from '../lib/drawRoadsRails'
import { DEFAULT_ROAD_TIER_STYLES, DEFAULT_RAIL_STYLE } from '../store/mapStore'

/** Point-to-point map canvas. Deliberately simpler than TerrainViewCanvas: no
 *  LayerCache/RAF machinery, because a p2p scene is tens of towns/roads/regions,
 *  not thousands of hexes — a full redraw on every relevant change is cheap. */
export function P2pViewCanvas({
  surroundColor = '#B7B0A6',
  regionSizePreviewCm2 = null,
}: {
  surroundColor?: string
  /** In-progress "max region size" value while the sidebar slider is being dragged —
   *  deliberately NOT read from the store (see P2pLeftRail.tsx): writing it there would
   *  mean a localStorage serialize on every drag tick, which is exactly the slider-lag
   *  bug this prop exists to avoid. null/omitted = use the committed store value. */
  regionSizePreviewCm2?: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const {
    p2pTowns, p2pEdges, p2pRawRivers, p2pPaintLayer, p2pWidthKm, p2pHeightKm,
    p2pMaxRegionSizeCm2, p2pRiverSplitRegions, center, bearing, pageGrid, marginMm,
    p2pBrush, batchPaintP2pTerrain, batchEraseP2pTerrain,
    p2pBlobSmooth, p2pBlobOffset, p2pBlobBump, p2pBlobSweepFreq, p2pBlobLobeFreq,
    p2pBlobLobeAmp, p2pBlobLobeThreshold, p2pBlobLobeDirection, p2pBlobTopoStyle,
    p2pBlobOutlineEnabled, p2pBlobOutlineColor, p2pBlobOutlineWidth,
  } = useMapStore()

  // Cells painted during an in-progress brush stroke, merged over the committed
  // p2pPaintLayer for live preview. Flushed to the store as one batch on mouseup
  // (never per-move — see CLAUDE.md "never call store actions in a loop").
  const [paintPreview, setPaintPreview] = useState<Map<string, P2pTerrainType | 'eraser'> | null>(null)
  const paintBufferRef = useRef<Map<string, P2pTerrainType | 'eraser'>>(new Map())
  const isPaintingRef = useRef(false)
  const lastPaintKmRef = useRef<[number, number] | null>(null)
  const lastRegionRef = useRef(-1)
  const hoverRegionRef = useRef(-1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const paperMm = useMemo(() => {
    const colSum = pageGrid.colWidths.reduce((a, b) => a + b, 0)
    const rowSum = pageGrid.rowHeights.reduce((a, b) => a + b, 0)
    return [colSum, rowSum] as [number, number]
  }, [pageGrid])

  // Fit the board into the available canvas area, preserving aspect ratio.
  const layout = useMemo(() => {
    const { w: cssW, h: cssH } = size
    if (cssW === 0 || cssH === 0 || p2pWidthKm === 0 || p2pHeightKm === 0) return null
    const margin = 0.92
    let pw = cssW * margin
    let ph = pw * (p2pHeightKm / p2pWidthKm)
    if (ph > cssH * margin) { ph = cssH * margin; pw = ph * (p2pWidthKm / p2pHeightKm) }
    const px = (cssW - pw) / 2
    const py = (cssH - ph) / 2
    const pxPerKm = pw / p2pWidthKm
    return { px, py, pw, ph, pxPerKm }
  }, [size, p2pWidthKm, p2pHeightKm])

  const projection = useMemo(() => {
    if (!layout) return null
    const { toLocal } = makeP2pBoardProjection(center[0], center[1], bearing, p2pWidthKm, p2pHeightKm)
    const projectKm = (xKm: number, yKm: number): [number, number] =>
      [layout.px + xKm * layout.pxPerKm, layout.py + yKm * layout.pxPerKm]
    const project = (lon: number, lat: number): [number, number] => {
      const [xKm, yKm] = toLocal(lon, lat)
      return projectKm(xKm, yKm)
    }
    return { toLocal, projectKm, project }
  }, [layout, center, bearing, p2pWidthKm, p2pHeightKm])

  const townLocal = useMemo(() => {
    if (!projection) return new Map<string, [number, number]>()
    return new Map(p2pTowns.map(t => [t.id, projection.toLocal(t.lon, t.lat)] as [string, [number, number]]))
  }, [p2pTowns, projection])

  const roadsLocal = useMemo(() => {
    if (!projection) return []
    return p2pEdges.map(e => {
      if (e.points && e.points.length >= 2) return e.points.map(([lon, lat]) => projection.toLocal(lon, lat))
      const a = townLocal.get(e.a), b = townLocal.get(e.b)
      return a && b ? [a, b] : []
    }).filter(p => p.length >= 2)
  }, [p2pEdges, projection, townLocal])

  const riversLocal = useMemo(() => {
    if (!projection) return []
    return p2pRawRivers.map(r => r.coords.map(([lon, lat]) => projection.toLocal(lon, lat)))
  }, [p2pRawRivers, projection])

  // Face tracing is the expensive part (planarize + walk) and depends only on
  // roads/rivers/frame — never on paint, and NOT on max-region-size either. Stable
  // across both brush strokes and "max region size" slider drags.
  const rawFaces = useMemo(() => {
    if (!projection || p2pWidthKm === 0) return []
    return traceP2pRegionFaces(
      roadsLocal.map(poly => poly.map(([x, y]) => ({ x, y }))),
      riversLocal.map(poly => poly.map(([x, y]) => ({ x, y }))),
      { widthKm: p2pWidthKm, heightKm: p2pHeightKm, splitRivers: p2pRiverSplitRegions },
    )
  }, [roadsLocal, riversLocal, p2pWidthKm, p2pHeightKm, p2pRiverSplitRegions, projection])

  // Splitting oversized faces (Voronoi cuts) is comparatively cheap — safe to re-run on
  // every tick of a live "max region size" drag. regionSizePreviewCm2 is the sidebar
  // slider's in-progress value (see the constructor comment on why it's a prop, not a
  // store field); falls back to the committed store value when not dragging.
  const effectiveMaxRegionSizeCm2 = regionSizePreviewCm2 ?? p2pMaxRegionSizeCm2
  const regionsGeometry = useMemo(() => {
    if (!rawFaces.length) return []
    const [cwMm] = paperMm
    const kmPerCm = p2pWidthKm / (cwMm / 10)
    return splitP2pRegionFaces(rawFaces, effectiveMaxRegionSizeCm2 * kmPerCm * kmPerCm, {})
  }, [rawFaces, effectiveMaxRegionSizeCm2, p2pWidthKm, paperMm])

  // Grid cell -> region index, for O(1) hit-testing by the paint tool. Stable across
  // brush strokes since it only depends on the (paint-independent) region shapes.
  const cellToRegion = useMemo(() => {
    const m = new Map<string, number>()
    regionsGeometry.forEach((r, ri) => {
      if (r.cellKeys.length) for (const k of r.cellKeys) m.set(k, ri)
      else m.set(regionAnchorKey(r.poly), ri)
    })
    return m
  }, [regionsGeometry])

  // Merge the in-progress brush stroke over the committed paint layer, so the
  // region classification (and thus the drawn terrain) previews live while painting.
  const effectivePaintLayer = useMemo(() => {
    if (!paintPreview || paintPreview.size === 0) return p2pPaintLayer
    const merged = { ...p2pPaintLayer }
    for (const [key, v] of paintPreview) {
      if (v === 'eraser') delete merged[key]
      else merged[key] = v
    }
    return merged
  }, [p2pPaintLayer, paintPreview])

  // Cheap: just re-classifies each already-traced region's majority type, no re-tracing.
  const regions = useMemo((): P2pTerrainRegion[] => {
    return regionsGeometry.map(r => ({
      ...r,
      type: regionType(r.cellKeys, regionAnchorKey(r.poly), effectivePaintLayer),
    }))
  }, [regionsGeometry, effectivePaintLayer])

  // The outline toggle/color/width is one global setting applied to all 4 terrain
  // types (no per-type override yet, unlike hex mode) — merge it onto the fixed
  // per-type fill styles here rather than duplicating it 4x in the store.
  const terrainStyles = useMemo(() => {
    const out = {} as typeof DEFAULT_P2P_TERRAIN_STYLES
    for (const terrain of P2P_TERRAIN_TYPES) {
      out[terrain] = {
        ...DEFAULT_P2P_TERRAIN_STYLES[terrain],
        outlineEnabled: p2pBlobOutlineEnabled,
        outlineColor: p2pBlobOutlineColor,
        outlineWidth: p2pBlobOutlineWidth,
      }
    }
    return out
  }, [p2pBlobOutlineEnabled, p2pBlobOutlineColor, p2pBlobOutlineWidth])

  // Sizes/clears the hover-outline overlay canvas whenever the viewport changes.
  // Kept separate from the main canvas so highlighting the hovered region never
  // touches the (comparatively expensive) terrain/road/river redraw.
  useEffect(() => {
    const canvas = hoverCanvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [size])

  // While the sidebar's "max region size" slider is being dragged, trace ALL current
  // region boundaries instead of just the one hovered — so the cuts are visible as they
  // change, without touching the store (regionSizePreviewCm2 is a prop, see above) or
  // the heavier terrain/road/river canvas.
  useEffect(() => {
    const hc = hoverCanvasRef.current
    const ctx = hc?.getContext('2d')
    if (!ctx || !hc || !projection) return

    if (regionSizePreviewCm2 !== null) {
      ctx.clearRect(0, 0, hc.clientWidth, hc.clientHeight)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(80, 60, 20, 0.6)'
      ctx.lineWidth = 1
      for (const r of regionsGeometry) {
        ctx.beginPath()
        r.poly.forEach(([x, y], i) => {
          const [px, py] = projection.projectKm(x, y)
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.stroke()
      }
    }

    return () => {
      if (regionSizePreviewCm2 !== null) ctx.clearRect(0, 0, hc.clientWidth, hc.clientHeight)
    }
  }, [regionSizePreviewCm2, regionsGeometry, projection])

  // Terrain brush: click or drag fills the WHOLE road-bounded region under the cursor
  // in one go (matches the reference prototype's paintRegion()/regionAt() — it's a
  // flood fill of one region at a time, not per-cell painting; see conversation).
  // Buffers the whole stroke's affected cells in a ref and flushes with one batch
  // store action on mouseup. Also drives the hover-outline overlay so the region
  // about to be painted is visible before and during a drag.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout || !projection) return

    const toKm = (clientX: number, clientY: number): [number, number] | null => {
      const rect = canvas.getBoundingClientRect()
      const xKm = (clientX - rect.left - layout.px) / layout.pxPerKm
      const yKm = (clientY - rect.top - layout.py) / layout.pxPerKm
      if (xKm < 0 || xKm > p2pWidthKm || yKm < 0 || yKm > p2pHeightKm) return null
      return [xKm, yKm]
    }

    const drawHover = (ri: number) => {
      if (regionSizePreviewCm2 !== null) return // the all-edges effect owns the overlay while dragging
      if (ri === hoverRegionRef.current) return
      hoverRegionRef.current = ri
      const hc = hoverCanvasRef.current
      const ctx = hc?.getContext('2d')
      if (!ctx || !hc) return
      ctx.clearRect(0, 0, hc.clientWidth, hc.clientHeight)
      const region = ri >= 0 ? regionsGeometry[ri] : null
      if (!region) return
      ctx.beginPath()
      region.poly.forEach(([x, y], i) => {
        const [px, py] = projection.projectKm(x, y)
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.strokeStyle = '#ffd43b'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const clearHover = () => drawHover(-1)

    const floodRegion = (ri: number, brush: P2pTerrainType | 'eraser') => {
      const region = regionsGeometry[ri]
      if (!region) return
      if (region.cellKeys.length) for (const k of region.cellKeys) paintBufferRef.current.set(k, brush)
      else paintBufferRef.current.set(regionAnchorKey(region.poly), brush)
    }

    const paintAt = (xKm: number, yKm: number) => {
      const brush = useMapStore.getState().p2pBrush
      if (brush === 'off') return
      const last = lastPaintKmRef.current
      // Sample along the path so a fast drag doesn't skip over a thin region between
      // two mousemove events.
      const steps = last
        ? Math.max(1, Math.ceil(Math.hypot(xKm - last[0], yKm - last[1]) / (P2P_GRID_CELL_KM * 0.5)))
        : 1
      let painted = false
      for (let i = last ? 1 : 0; i <= steps; i++) {
        const t = i / steps
        const x = last ? last[0] + (xKm - last[0]) * t : xKm
        const y = last ? last[1] + (yKm - last[1]) * t : yKm
        const ri = cellToRegion.get(cellKey(x, y)) ?? -1
        if (ri >= 0 && ri !== lastRegionRef.current) {
          floodRegion(ri, brush)
          lastRegionRef.current = ri
          painted = true
        }
      }
      lastPaintKmRef.current = [xKm, yKm]
      if (painted) setPaintPreview(new Map(paintBufferRef.current))
    }

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (useMapStore.getState().p2pBrush === 'off') return
      const km = toKm(e.clientX, e.clientY)
      if (!km) return
      isPaintingRef.current = true
      paintBufferRef.current = new Map()
      lastPaintKmRef.current = null
      lastRegionRef.current = -1
      paintAt(km[0], km[1])
      drawHover(lastRegionRef.current)
    }

    const onMove = (e: MouseEvent) => {
      const brush = useMapStore.getState().p2pBrush
      if (brush === 'off') { clearHover(); return }
      const km = toKm(e.clientX, e.clientY)
      if (!km) { clearHover(); return }
      if (isPaintingRef.current) {
        paintAt(km[0], km[1])
        drawHover(lastRegionRef.current)
      } else {
        drawHover(cellToRegion.get(cellKey(km[0], km[1])) ?? -1)
      }
    }

    const onUp = () => {
      if (!isPaintingRef.current) return
      isPaintingRef.current = false
      lastPaintKmRef.current = null
      lastRegionRef.current = -1
      const buffer = paintBufferRef.current
      paintBufferRef.current = new Map()
      setPaintPreview(null)
      if (buffer.size === 0) return
      const paints: { key: string; terrain: P2pTerrainType }[] = []
      const erases: string[] = []
      for (const [key, v] of buffer) {
        if (v === 'eraser') erases.push(key)
        else paints.push({ key, terrain: v })
      }
      if (paints.length) batchPaintP2pTerrain(paints)
      if (erases.length) batchEraseP2pTerrain(erases)
    }

    const onLeave = () => { if (!isPaintingRef.current) clearHover() }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mouseleave', onLeave)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Force the next mount's first drawHover() to actually redraw, even if the
      // region index happens to match — the shapes behind it may have changed.
      hoverRegionRef.current = -2
      const hc = hoverCanvasRef.current
      hc?.getContext('2d')?.clearRect(0, 0, hc.clientWidth, hc.clientHeight)
    }
  }, [layout, projection, p2pWidthKm, p2pHeightKm, regionsGeometry, cellToRegion, regionSizePreviewCm2, batchPaintP2pTerrain, batchEraseP2pTerrain])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout || !projection) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    ctx.fillStyle = surroundColor
    ctx.fillRect(0, 0, size.w, size.h)

    ctx.save()
    ctx.beginPath()
    ctx.rect(layout.px, layout.py, layout.pw, layout.ph)
    ctx.clip()

    ctx.fillStyle = '#f3e9c6'
    ctx.fillRect(layout.px, layout.py, layout.pw, layout.ph)

    const R = P2P_GRID_CELL_KM * layout.pxPerKm
    drawP2pTerrain(ctx, {
      regions, project: projection.projectKm, styles: terrainStyles, R,
      smooth: p2pBlobSmooth, offset: p2pBlobOffset, bump: p2pBlobBump,
      sweepFreq: p2pBlobSweepFreq, lobeFreq: p2pBlobLobeFreq, lobeAmp: p2pBlobLobeAmp,
      lobeThreshold: p2pBlobLobeThreshold, lobeDirection: p2pBlobLobeDirection,
      topoStyle: p2pBlobTopoStyle,
    })

    // Rivers — simple stroke for now, no variable width/wobble yet.
    ctx.strokeStyle = '#7fb2d9'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const r of p2pRawRivers) {
      ctx.lineWidth = Math.max(1, 2 * (r.width_multiplier || 1))
      ctx.beginPath()
      r.coords.forEach(([lon, lat], i) => {
        const [x, y] = projection.project(lon, lat)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    const roadChains: RoadChainPx[] = p2pEdges.map(e => {
      const pts = e.points && e.points.length >= 2
        ? e.points.map(([lon, lat]) => projection.project(lon, lat))
        : (() => {
            const a = p2pTowns.find(t => t.id === e.a), b = p2pTowns.find(t => t.id === e.b)
            if (!a || !b) return []
            return [projection.project(a.lon, a.lat), projection.project(b.lon, b.lat)]
          })()
      return { tier: e.tier, chain: pts }
    }).filter(c => c.chain.length >= 2)

    drawRoadsAndRails(ctx, {
      roadChains, junctions: [], railChains: [],
      tierStyles: DEFAULT_ROAD_TIER_STYLES, railStyle: DEFAULT_RAIL_STYLE,
    })

    drawP2pTowns(ctx, {
      towns: p2pTowns, tierStyles: DEFAULT_P2P_TOWN_TIER_STYLES, supplyColor: '#f6c343',
      project: projection.project,
    })

    ctx.restore()

    ctx.strokeStyle = '#6b5a3a'
    ctx.lineWidth = 1.5
    ctx.strokeRect(layout.px, layout.py, layout.pw, layout.ph)
  }, [
    layout, projection, regions, p2pEdges, p2pTowns, p2pRawRivers, size, surroundColor,
    terrainStyles, p2pBlobSmooth, p2pBlobOffset, p2pBlobBump, p2pBlobSweepFreq,
    p2pBlobLobeFreq, p2pBlobLobeAmp, p2pBlobLobeThreshold, p2pBlobLobeDirection, p2pBlobTopoStyle,
  ])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: p2pBrush !== 'off' ? 'crosshair' : 'default' }} />
      <canvas ref={hoverCanvasRef} style={{ display: 'block', position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  )
}
