import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { makeP2pBoardProjection, P2P_GRID_CELL_KM } from '../lib/p2pNetwork'
import { computeP2pTerrainRegions } from '../lib/p2pTerrainRegions'
import { drawP2pTerrain, DEFAULT_P2P_TERRAIN_STYLES } from '../lib/drawP2pTerrain'
import { drawP2pTowns, DEFAULT_P2P_TOWN_TIER_STYLES } from '../lib/drawP2pTowns'
import { drawRoadsAndRails, type RoadChainPx } from '../lib/drawRoadsRails'
import { DEFAULT_ROAD_TIER_STYLES, DEFAULT_RAIL_STYLE } from '../store/mapStore'

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
  } = useMapStore()

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

  const regions = useMemo(() => {
    if (!projection || p2pWidthKm === 0) return []
    const [cwMm] = paperMm
    const kmPerCm = p2pWidthKm / (cwMm / 10)
    return computeP2pTerrainRegions(
      roadsLocal.map(poly => poly.map(([x, y]) => ({ x, y }))),
      riversLocal.map(poly => poly.map(([x, y]) => ({ x, y }))),
      p2pPaintLayer,
      {
        widthKm: p2pWidthKm, heightKm: p2pHeightKm,
        maxRegionAreaKm2: p2pMaxRegionSizeCm2 * kmPerCm * kmPerCm,
        splitRivers: p2pRiverSplitRegions,
      },
    )
  }, [roadsLocal, riversLocal, p2pPaintLayer, p2pWidthKm, p2pHeightKm, p2pMaxRegionSizeCm2, p2pRiverSplitRegions, projection, paperMm])

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
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
