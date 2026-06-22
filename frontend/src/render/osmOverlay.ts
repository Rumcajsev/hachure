/**
 * Draws the OSM highlight / spotlight overlay onto the dedicated overlay canvas.
 * Screen-only — never called during export.
 */
import type { MutableRefObject } from 'react'
import type { GridMetadata } from '../store/mapStore'
import { projectToCanvas } from '../lib/projection'

type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

type RoadWay  = { coords: [number, number][]; highway: string }
type RiverWay = { coords: [number, number][]; type: string; width_multiplier: number; segments?: [number, number][][] }
type RailWay  = { coords: [number, number][] }

export interface OsmOverlayRefs {
  osmOverlayCanvasRef: MutableRefObject<HTMLCanvasElement | null>
  metaRef: MutableRefObject<GridMetadata | null>
  frameDimsRef: MutableRefObject<{ w: number; h: number }>
  osmHighlightTierRef: MutableRefObject<number | null>
  osmHighlightTypeRef: MutableRefObject<string | null>
  osmSpotlightModeRef: MutableRefObject<boolean>
  spotlightCursorRef: MutableRefObject<{ lx: number; ly: number } | null>
  osmRailHighlightRef: MutableRefObject<boolean>
  hoveredOsmRiverIdxRef: MutableRefObject<number | null>
  zoomRef: MutableRefObject<number>
  panRef: MutableRefObject<{ x: number; y: number }>
  rawRoadWaysRef: MutableRefObject<RoadWay[]>
  osmRiverWaysRef: MutableRefObject<RiverWay[]>
  rawRailWaysRef: MutableRefObject<RailWay[]>
  osmSpotlightRadiusRef: MutableRefObject<number>
  osmSpotlightTiersRef: MutableRefObject<boolean[]>
  getPaperRef: MutableRefObject<GetPaperFn>
}

export function drawOsmHighlight(refs: OsmOverlayRefs): void {
  const { osmOverlayCanvasRef, metaRef, frameDimsRef, osmHighlightTierRef, osmHighlightTypeRef,
    osmSpotlightModeRef, spotlightCursorRef, osmRailHighlightRef,
    hoveredOsmRiverIdxRef, zoomRef, panRef, rawRoadWaysRef,
    osmRiverWaysRef, rawRailWaysRef, osmSpotlightRadiusRef,
    osmSpotlightTiersRef, getPaperRef } = refs

  const overlayCanvas = osmOverlayCanvasRef.current
  const meta = metaRef.current
  const { w: frameCssW, h: frameCssH } = frameDimsRef.current
  if (!overlayCanvas || !meta || frameCssW === 0) return
  const ctx = overlayCanvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

  const ht = osmHighlightTierRef.current
  const highType = osmHighlightTypeRef.current
  const spotlight = osmSpotlightModeRef.current
  const cursor = spotlightCursorRef.current
  const railHighlight = osmRailHighlightRef.current
  const hoveredRiverIdx = hoveredOsmRiverIdxRef.current

  if (!spotlight && ht === null && highType === null && !railHighlight && hoveredRiverIdx === null) return
  if (spotlight && !cursor) return

  const zoom = zoomRef.current
  const pan = panRef.current
  const { pw, ph, px, py } = getPaperRef.current(frameCssW, frameCssH)

  const project = (lon: number, lat: number): [number, number] =>
    projectToCanvas(lon, lat, meta, pw, ph, px, py)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.save()
  ctx.translate(frameCssW / 2 + pan.x, frameCssH / 2 + pan.y)
  ctx.scale(zoom, zoom)
  ctx.translate(-frameCssW / 2, -frameCssH / 2)

  const hwTier: Record<string, number> = { motorway: 0, trunk: 0, primary: 1, secondary: 1, tertiary: 2 }
  const tierColors = [
    ['rgba(255,80,80,0.25)', 'rgba(255,100,100,0.95)'],
    ['rgba(255,180,40,0.25)', 'rgba(255,180,40,0.95)'],
    ['rgba(220,220,60,0.25)', 'rgba(220,220,60,0.95)'],
  ]

  const drawWays = (tiers: number[]) => {
    for (const tier of tiers) {
      const ways = rawRoadWaysRef.current.filter(w => w.coords.length >= 2 && (hwTier[w.highway] ?? 2) === tier)
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = tierColors[tier][pass]
        ctx.lineWidth = pass === 0 ? 6 : 1.5
        for (const way of ways) {
          ctx.beginPath()
          const [x0, y0] = project(way.coords[0][0], way.coords[0][1])
          ctx.moveTo(x0, y0)
          for (let i = 1; i < way.coords.length; i++) {
            const [xi, yi] = project(way.coords[i][0], way.coords[i][1])
            ctx.lineTo(xi, yi)
          }
          ctx.stroke()
        }
      }
    }
  }

  const riverOsmColors: Record<string, [string, string]> = {
    river: ['rgba(60,140,220,0.2)', 'rgba(80,160,240,0.9)'],
  }

  const drawHoveredRiverWay = (idx: number) => {
    const way = osmRiverWaysRef.current[idx]
    if (!way) return
    const segs = way.segments ?? (way.coords.length >= 2 ? [way.coords] : [])
    if (segs.length === 0) return
    const colors = riverOsmColors[way.type] ?? riverOsmColors.river
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = colors[pass]
      ctx.lineWidth = pass === 0 ? 5 * way.width_multiplier : 1.5
      for (const seg of segs) {
        if (seg.length < 2) continue
        ctx.beginPath()
        const [x0, y0] = project(seg[0][0], seg[0][1])
        ctx.moveTo(x0, y0)
        for (let i = 1; i < seg.length; i++) {
          const [xi, yi] = project(seg[i][0], seg[i][1])
          ctx.lineTo(xi, yi)
        }
        ctx.stroke()
      }
    }
  }

  const railColors = ['rgba(0,220,220,0.25)', 'rgba(0,220,220,0.95)']

  const drawRailRawWays = () => {
    const ways = rawRailWaysRef.current
    if (ways.length === 0) return
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = railColors[pass]
      ctx.lineWidth = pass === 0 ? 5 : 1.5
      for (const way of ways) {
        if (way.coords.length < 2) continue
        ctx.beginPath()
        const [x0, y0] = project(way.coords[0][0], way.coords[0][1])
        ctx.moveTo(x0, y0)
        for (let i = 1; i < way.coords.length; i++) {
          const [xi, yi] = project(way.coords[i][0], way.coords[i][1])
          ctx.lineTo(xi, yi)
        }
        ctx.stroke()
      }
    }
  }

  if (spotlight && cursor) {
    const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
    const R = meta.outer_radius_m * scalePxPerM
    const spotR = osmSpotlightRadiusRef.current * R * 2.2
    const activeTiers = osmSpotlightTiersRef.current
      .slice(0, 3).map((on, i) => on ? i : -1).filter(i => i >= 0) as number[]
    const showRails = osmSpotlightTiersRef.current[3]

    ctx.save()
    ctx.beginPath()
    ctx.arc(cursor.lx, cursor.ly, spotR, 0, Math.PI * 2)
    ctx.clip()
    drawWays(activeTiers)
    if (showRails) drawRailRawWays()
    ctx.restore()
  } else if (ht !== null || highType !== null || railHighlight || hoveredRiverIdx !== null) {
    const drawWaysByType = (highway: string) => {
      const tier = hwTier[highway] ?? 2
      const ways = rawRoadWaysRef.current.filter(w => w.coords.length >= 2 && w.highway === highway)
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = tierColors[tier][pass]
        ctx.lineWidth = pass === 0 ? 6 : 1.5
        for (const way of ways) {
          ctx.beginPath()
          const [x0, y0] = project(way.coords[0][0], way.coords[0][1])
          ctx.moveTo(x0, y0)
          for (let i = 1; i < way.coords.length; i++) {
            const [xi, yi] = project(way.coords[i][0], way.coords[i][1])
            ctx.lineTo(xi, yi)
          }
          ctx.stroke()
        }
      }
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(px, py, pw, ph)
    ctx.clip()
    if (ht !== null) drawWays([ht])
    if (highType !== null) drawWaysByType(highType)
    if (railHighlight) drawRailRawWays()
    if (hoveredRiverIdx !== null) drawHoveredRiverWay(hoveredRiverIdx)
    ctx.restore()
  }

  ctx.restore()
}
