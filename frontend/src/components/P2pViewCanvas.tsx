import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { makeP2pBoardProjection, P2P_GRID_CELL_KM } from '../lib/p2pNetwork'
import { computeP2pTerrainRegions, cellKey, regionType, regionAnchorKey, type P2pTerrainRegion } from '../lib/p2pTerrainRegions'
import type { P2pTerrainType } from '../store/slices/p2pTerrainSlice'
import { drawP2pTerrain, DEFAULT_P2P_TERRAIN_STYLES } from '../lib/drawP2pTerrain'
import { drawP2pTowns, DEFAULT_P2P_TOWN_TIER_STYLES } from '../lib/drawP2pTowns'
import { drawRoadsAndRails, type RoadChainPx } from '../lib/drawRoadsRails'
import { DEFAULT_ROAD_TIER_STYLES, DEFAULT_RAIL_STYLE } from '../store/mapStore'

// Stable reference so passing "no paint yet" to computeP2pTerrainRegions never looks
// like a changed input to useMemo.
const EMPTY_PAINT_LAYER: Record<string, P2pTerrainType> = {}

/** Point-to-point map canvas. Deliberately simpler than TerrainViewCanvas: no
 *  LayerCache/RAF machinery, because a p2p scene is tens of towns/roads/regions,
 *  not thousands of hexes — a full redraw on every relevant change is cheap. */
export function P2pViewCanvas({ surroundColor = '#B7B0A6' }: { surroundColor?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const {
    p2pTowns, p2pEdges, p2pRawRivers, p2pPaintLayer, p2pWidthKm, p2pHeightKm,
    p2pMaxRegionSizeCm2, p2pRiverSplitRegions, center, bearing, pageGrid, marginMm,
    p2pBrush, batchPaintP2pTerrain, batchEraseP2pTerrain,
  } = useMapStore()

  // Cells painted during an in-progress brush stroke, merged over the committed
  // p2pPaintLayer for live preview. Flushed to the store as one batch on mouseup
  // (never per-move — see CLAUDE.md "never call store actions in a loop").
  const [paintPreview, setPaintPreview] = useState<Map<string, P2pTerrainType | 'eraser'> | null>(null)
  const paintBufferRef = useRef<Map<string, P2pTerrainType | 'eraser'>>(new Map())
  const isPaintingRef = useRef(false)
  const lastPaintKmRef = useRef<[number, number] | null>(null)
  const lastRegionRef = useRef(-1)

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

  // Region shapes depend only on roads/rivers/frame/max-size — never on paint — so this
  // is kept separate from paint state. It's the expensive part (face tracing, splitting)
  // and must NOT re-run on every brush stroke, only when the topology or settings change.
  const regionsGeometry = useMemo(() => {
    if (!projection || p2pWidthKm === 0) return []
    const [cwMm] = paperMm
    const kmPerCm = p2pWidthKm / (cwMm / 10)
    return computeP2pTerrainRegions(
      roadsLocal.map(poly => poly.map(([x, y]) => ({ x, y }))),
      riversLocal.map(poly => poly.map(([x, y]) => ({ x, y }))),
      EMPTY_PAINT_LAYER,
      {
        widthKm: p2pWidthKm, heightKm: p2pHeightKm,
        maxRegionAreaKm2: p2pMaxRegionSizeCm2 * kmPerCm * kmPerCm,
        splitRivers: p2pRiverSplitRegions,
      },
    )
  }, [roadsLocal, riversLocal, p2pWidthKm, p2pHeightKm, p2pMaxRegionSizeCm2, p2pRiverSplitRegions, projection, paperMm])

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

  // Terrain brush: click or drag fills the WHOLE road-bounded region under the cursor
  // in one go (matches the reference prototype's paintRegion()/regionAt() — it's a
  // flood fill of one region at a time, not per-cell painting; see conversation).
  // Buffers the whole stroke's affected cells in a ref and flushes with one batch
  // store action on mouseup.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return

    const toKm = (clientX: number, clientY: number): [number, number] | null => {
      const rect = canvas.getBoundingClientRect()
      const xKm = (clientX - rect.left - layout.px) / layout.pxPerKm
      const yKm = (clientY - rect.top - layout.py) / layout.pxPerKm
      if (xKm < 0 || xKm > p2pWidthKm || yKm < 0 || yKm > p2pHeightKm) return null
      return [xKm, yKm]
    }

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
    }

    const onMove = (e: MouseEvent) => {
      if (!isPaintingRef.current) return
      const km = toKm(e.clientX, e.clientY)
      if (!km) return
      paintAt(km[0], km[1])
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

    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [layout, p2pWidthKm, p2pHeightKm, regionsGeometry, cellToRegion, batchPaintP2pTerrain, batchEraseP2pTerrain])

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
      regions, project: projection.projectKm, styles: DEFAULT_P2P_TERRAIN_STYLES, R,
      smooth: 2, offset: 0, bump: 0.15, sweepFreq: 2.5, lobeFreq: 1.2, lobeAmp: 0.4, lobeThreshold: 0.6, lobeDirection: 1,
      topoStyle: 0,
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
  }, [layout, projection, regions, p2pEdges, p2pTowns, p2pRawRivers, size, surroundColor])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: p2pBrush !== 'off' ? 'crosshair' : 'default' }} />
    </div>
  )
}
