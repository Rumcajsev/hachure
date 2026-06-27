/** Terrain layer rendering — hex fills, blob overlays, textures, lakes, coastline.
 *  Pure canvas operations — no React or store imports except types. */

import type { GeneratedHex, BlobOverride, StrokeEffect } from '../store/mapStore'
import { DEFAULT_STROKE_EFFECT } from '../store/mapStore'
import { resolveBlobEffect } from './strokeEffect'
import { buildTerrainBlobsV2, bleedPolygon } from './terrainBlobs'
import { clipPolygonToConvex, pointInPolygon } from './geometry'
import { makePermutation, perlinNoise2D } from './noise'
import { findEdgeChains, buildEdgeBlobPolys, type EdgeBlobChain, type EdgeBlobParams } from './edgeBlobs'
import { drawSlopes, drawBlobHachure, drawPolygonShadow } from './drawSlopes'
import { drawHistoricalIcons, type HistoricalIconTerrainParams } from './drawHistoricalIcons'
import polygonClipping from 'polygon-clipping'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type BlobParams = {
  smooth: number; offset: number; bump: number
  sweepFreq: number; lobeFreq: number; lobeAmp: number
  lobeThreshold: number; lobeDirection: number; topoStyle: number; clusterSize: number
}

export type DrawTerrainParams = {
  projected: { hex: GeneratedHex; verts: [number, number][] }[]
  edgeMode: string
  inMargin: (verts: [number, number][]) => boolean
  terrainColors: Record<string, string>
  terrainTextureScales: Record<string, number>
  terrainTextureBlendModes: Record<string, GlobalCompositeOperation | 'color' | 'color-bg'>
  terrainTextureOpacities: Record<string, number>
  terrainTextureTintColors: Record<string, string>
  terrainTextureTintOpacities: Record<string, number>
  /** terrain name → loaded texture image */
  terrainTextures: Map<string, HTMLImageElement | null>
  px: number; py: number; pw: number; ph: number
  backgroundTerrainBlobs: { terrain: string; polys: [number, number][][] }[]
  defaultTerrainBlobs: { terrain: string; polys: [number, number][][] }[]
  terrainBlobOverrides: Record<string, BlobOverride>
  blobComponents: Map<string, string>
  blobComponentsByTerrain: Map<string, Map<string, string>>
  terrainBlobParams: BlobParams
  hexes: GeneratedHex[]
  hexTerrainLayers: (hex: GeneratedHex) => string[]
  R: number
  realisticCoastline: boolean
  coastlineDebugRaw: boolean
  beachStrip: boolean
  beachColor: string
  beachWidth: number
  /** Full land polygon boundary rings, smoothed globally (DP → Chaikin).
   *  Projected to canvas px. Used for sea mask clipping and beach strip. */
  coastlineBoundaryRings: [number, number][][]
  /** Raw (unsmoothed) projected land polygon boundary — for the debug overlay. */
  coastlineRawBoundaryRings: [number, number][][]
  // Edge blobs
  edgeBlobPainted: Record<string, string>
  edgeBlobWidth: number
  terrainTypeBlobStyles: Record<string, BlobOverride>
  edgeBlobOverrides: Record<string, BlobOverride>
  hexVertMap: Map<string, [number, number][]>
  mapStyle: 'standard' | 'historical_simple'
  elevationBlobs: { hills: [number, number][][]; mountains: [number, number][][] }
  elevationTypeBlobStyles: Record<string, BlobOverride>
  hillsColor: string
  mountainsColor: string
  reliefShadingOpacity: number
  elevationTextureScales: Record<string, number>
  elevationTextureBlendModes: Record<string, GlobalCompositeOperation | 'color' | 'color-bg'>
  elevationTextureOpacities: Record<string, number>
  historicalIconSets: Record<string, HTMLImageElement[]>
  historicalIconParams: Record<string, HistoricalIconTerrainParams>
  hillshadeCanvas: OffscreenCanvas | null
  hillshadeDisabledTerrains: Set<string>
  hillshadeDisabledElevClasses: Set<string>
  contourCanvas: OffscreenCanvas | null
  contourDisabledTerrains: Set<string>
  contourDisabledElevClasses: Set<string>
  terrainBlobOutlineEnabled: boolean
  terrainBlobOutlineColor: string
  terrainBlobOutlineWidth: number
  terrainBlobEffect: StrokeEffect
  slopeEdges: Record<string, string>
  slopeStyle: import('../store/mapStore').SlopeStyle
  slopeSmoothing: boolean
  slopeTickSpacing: number
  slopeTickLength: number
  elevationHachureEnabled: Record<string, boolean>
  elevationShadowEnabled: Record<string, boolean>
  elevationShadowOx: number
  elevationShadowOy: number
  elevationShadowBl: number
  elevationShadowOp: number
  elevationShadowPs: number
  elevationShadowColor: string
}

export type { EdgeBlobParams, EdgeBlobChain }



// Tinted-texture cache: key = `${tex.src}_${hexColor}_${invert}`.
// Each entry is a GPU-backed OffscreenCanvas (~6MB each for typical texture sizes).
// 24 terrain-type × color combinations × 6MB = 144MB, which combined with the
// 7 layer canvases (~239MB) pushes Chrome past its ~256MB GPU eviction threshold,
// causing all drawImage() calls to stall at 18–22ms each.
// Cap at 8 with LRU eviction. 8 × 6MB = 48MB + 239MB layers = ~287MB total — safe.
const colorModeTextureCache = new Map<string, OffscreenCanvas>()
const COLOR_TEXTURE_CACHE_MAX = 8

export function getColorTextureCacheStats(): { entries: number; estimatedBytes: number } {
  let bytes = 0
  for (const c of colorModeTextureCache.values()) bytes += c.width * c.height * 4
  return { entries: colorModeTextureCache.size, estimatedBytes: bytes }
}

function getTintedTexture(tex: HTMLImageElement, hexColor: string, invert: boolean): OffscreenCanvas | null {
  const key = `${tex.src}_${hexColor}_${invert}`
  if (colorModeTextureCache.has(key)) {
    const cached = colorModeTextureCache.get(key)!
    colorModeTextureCache.delete(key)
    colorModeTextureCache.set(key, cached)
    return cached
  }
  if (!tex.complete || tex.naturalWidth === 0) return null
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  const oc = new OffscreenCanvas(tex.naturalWidth, tex.naturalHeight)
  const octx = oc.getContext('2d')!
  octx.drawImage(tex, 0, 0)
  const img = octx.getImageData(0, 0, tex.naturalWidth, tex.naturalHeight)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    d[i] = r; d[i + 1] = g; d[i + 2] = b
    d[i + 3] = Math.round(invert ? lum : 255 - lum)
  }
  octx.putImageData(img, 0, 0)
  if (colorModeTextureCache.size >= COLOR_TEXTURE_CACHE_MAX) {
    const oldestKey = colorModeTextureCache.keys().next().value!
    const evicted = colorModeTextureCache.get(oldestKey)!
    colorModeTextureCache.delete(oldestKey)
    try { evicted.transferToImageBitmap().close() } catch {}
  }
  colorModeTextureCache.set(key, oc)
  return oc
}


function applyTextureOverlay(
  tCtx: Ctx,
  tex: HTMLImageElement,
  polys: [number, number][][],
  R: number,
  scaleR: number,
  bleedPx: number,
  blendMode: GlobalCompositeOperation = 'multiply',
  opacity = 0.6,
  tintColor = '',
  tintOpacity = 0.5,
  colorMode = false,
): void {
  if (!tex.complete || polys.length === 0) return
  const texSize = R * scaleR
  const transform = new DOMMatrix([texSize / tex.naturalWidth, 0, 0, texSize / tex.naturalHeight, 0, 0])

  const buildPath = () => {
    tCtx.beginPath()
    for (const poly of polys) {
      if (poly.length < 3) continue
      const bleedSeed = Math.abs(Math.round(poly[0][0] * 73 + poly[0][1] * 97)) + 31
      const bleedPerm = makePermutation(bleedSeed)
      const p = bleedPx > 0 ? bleedPolygon(poly, bleedPx, R, bleedPerm) : poly
      tCtx.moveTo(p[0][0], p[0][1])
      for (let i = 1; i < p.length; i++) tCtx.lineTo(p[i][0], p[i][1])
      tCtx.closePath()
    }
  }

  const drawTintedPass = (color: string, invert: boolean, alpha: number) => {
    const tinted = getTintedTexture(tex, color, invert)
    if (!tinted) return
    const p = tCtx.createPattern(tinted, 'repeat')
    if (!p) return
    p.setTransform(transform)
    tCtx.save()
    tCtx.globalCompositeOperation = 'source-over'
    tCtx.globalAlpha = alpha
    tCtx.fillStyle = p
    buildPath()
    tCtx.fill('evenodd')
    tCtx.restore()
  }

  if (colorMode && tintColor) {
    const invertAlpha = blendMode === ('color-bg' as GlobalCompositeOperation)
    drawTintedPass(tintColor, invertAlpha, opacity)
  } else {
    const pattern = tCtx.createPattern(tex, 'repeat')
    if (!pattern) return
    pattern.setTransform(transform)
    tCtx.save()
    tCtx.globalCompositeOperation = blendMode
    tCtx.globalAlpha = opacity
    tCtx.fillStyle = pattern
    buildPath()
    tCtx.fill('evenodd')
    tCtx.restore()

    if (tintColor && tintOpacity > 0) {
      tCtx.save()
      tCtx.globalCompositeOperation = 'multiply'
      tCtx.globalAlpha = tintOpacity
      tCtx.fillStyle = tintColor
      buildPath()
      tCtx.fill('evenodd')
      tCtx.restore()
    }
  }
}

function drawElevationBlobs(
  tCtx: Ctx,
  polys: [number, number][][],
  color: string,
): void {
  if (polys.length === 0) return
  tCtx.fillStyle = color
  tCtx.beginPath()
  for (const poly of polys) {
    if (poly.length < 3) continue
    tCtx.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
    tCtx.closePath()
  }
  tCtx.fill('evenodd')
}

/**
 * Draw blob fill to an offscreen, blur it, composite onto tCtx.
 * The blur of a solid shape has full opacity at centre, fading at edges.
 * Only used for the colour fill — textures are always drawn directly to tCtx.
 */

function polyArea(pts: [number, number][]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) * 0.5
}

function applyEdgeRibbons(
  blobs: { terrain: string; polys: [number, number][][] }[],
  edgeBlobPainted: Record<string, string>,
  hexVertMap: Map<string, [number, number][]>,
  terrainTypeBlobStyles: Record<string, BlobOverride>,
  edgeBlobOverrides: Record<string, BlobOverride>,
  edgeBlobWidth: number,
  terrainBlobParams: BlobParams,
  R: number,
  hexTerrainSetByTerrain: Map<string, Set<string>>,
): { terrain: string; polys: [number, number][][] }[] {
  if (Object.keys(edgeBlobPainted).length === 0) return blobs

  const chains = findEdgeChains(edgeBlobPainted, hexVertMap)
  if (chains.length === 0) return blobs

  const ribbonsByTerrain = new Map<string, [number, number][][]>()
  const clearRibbons: [number, number][][] = []

  for (const chain of chains) {
    const { terrain } = chain
    if (terrain === 'hills' || terrain === 'mountains') continue

    const typeStyle = terrainTypeBlobStyles[terrain]
    const override = edgeBlobOverrides[chain.chainKey]
    const chainParams: EdgeBlobParams = {
      smooth:        override?.smooth        ?? typeStyle?.smooth        ?? terrainBlobParams.smooth,
      bump:          override?.bump          ?? typeStyle?.bump          ?? terrainBlobParams.bump,
      sweepFreq:     override?.sweepFreq     ?? typeStyle?.sweepFreq     ?? terrainBlobParams.sweepFreq,
      lobeFreq:      override?.lobeFreq      ?? typeStyle?.lobeFreq      ?? terrainBlobParams.lobeFreq,
      lobeAmp:       override?.lobeAmp       ?? typeStyle?.lobeAmp       ?? terrainBlobParams.lobeAmp,
      lobeThreshold: override?.lobeThreshold ?? typeStyle?.lobeThreshold ?? terrainBlobParams.lobeThreshold,
      lobeDirection: override?.lobeDirection ?? typeStyle?.lobeDirection ?? terrainBlobParams.lobeDirection,
      width:         override?.width         ?? typeStyle?.width         ?? edgeBlobWidth,
    }

    // Pass hexTerrainSet so buildEdgeBlobPolys extends the terrain-facing side to
    // HEX_CONNECT_EXTEND (1.2R), guaranteeing the ribbon always overlaps the area blob
    // regardless of inset settings. The extension is invisible after polygon union.
    const hexTerrainSet = terrain !== 'clear' ? hexTerrainSetByTerrain.get(terrain) : undefined
    const polys = buildEdgeBlobPolys(chain, hexVertMap, chainParams, R, hexTerrainSet)
    if (polys.length === 0) continue

    if (terrain === 'clear') {
      clearRibbons.push(...polys)
    } else {
      if (!ribbonsByTerrain.has(terrain)) ribbonsByTerrain.set(terrain, [])
      ribbonsByTerrain.get(terrain)!.push(...polys)
    }
  }

  if (ribbonsByTerrain.size === 0 && clearRibbons.length === 0) return blobs

  const applyClears = (polys: [number, number][][]): [number, number][][] => {
    if (clearRibbons.length === 0 || polys.length === 0) return polys
    const clearClip: polygonClipping.MultiPolygon = clearRibbons.map(p => [p as polygonClipping.Ring])
    const next: [number, number][][] = []
    for (const poly of polys) {
      if (poly.length < 3) continue
      try {
        const res = polygonClipping.difference([[poly as polygonClipping.Ring]], clearClip)
        for (const polygon of res) {
          if (polygon[0]?.length >= 3) next.push(polygon[0] as [number, number][])
        }
      } catch { next.push(poly) }
    }
    return next
  }

  const result: { terrain: string; polys: [number, number][][] }[] = blobs.map(blob => {
    let polys = blob.polys
    const ribbons = ribbonsByTerrain.get(blob.terrain)
    if (ribbons && ribbons.length > 0) {
      try {
        if (polys.length === 0) {
          polys = ribbons
        } else {
          const subject: polygonClipping.MultiPolygon = polys.filter(p => p.length >= 3).map(p => [p as polygonClipping.Ring])
          const clip: polygonClipping.MultiPolygon = ribbons.filter(p => p.length >= 3).map(p => [p as polygonClipping.Ring])
          const merged = polygonClipping.union(subject, clip)
          polys = merged.map(polygon => polygon[0] as [number, number][]).filter(p => p?.length >= 3)
        }
      } catch {
        polys = [...polys, ...ribbons]
      }
    }
    polys = applyClears(polys)
    return polys === blob.polys ? blob : { ...blob, polys }
  })

  // Ribbon-only terrains (edge blobs with no matching area hex blob yet)
  for (const [terrain, ribbons] of ribbonsByTerrain) {
    if (result.some(b => b.terrain === terrain)) continue
    const polys = applyClears(ribbons.filter(p => p.length >= 3))
    if (polys.length > 0) result.push({ terrain, polys })
  }

  return result
}

export function drawTerrain(tCtx: Ctx, params: DrawTerrainParams): void {
  const {
    projected, edgeMode, inMargin,
    terrainColors, terrainTextureBlendModes,
    terrainTextureScales, terrainTextureOpacities, terrainTextureTintColors, terrainTextureTintOpacities,
    terrainTextures,
    elevationTextureScales, elevationTextureBlendModes, elevationTextureOpacities,
    px, py, pw, ph,
    backgroundTerrainBlobs, defaultTerrainBlobs,
    terrainBlobOverrides,
    blobComponents, blobComponentsByTerrain,
    terrainBlobParams,
    hexes, hexTerrainLayers, R,
    realisticCoastline, coastlineDebugRaw,
    beachStrip, beachColor, beachWidth,
    coastlineBoundaryRings, coastlineRawBoundaryRings,
    // edge blobs destructured inline below where used
    terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth,
  } = params

  // ── 1. Base fills ───────────────────────────────────────────────────────────
  const clearFillColor = terrainColors['clear'] ?? '#ede8d5'
  for (const { hex, verts } of projected) {
    if (edgeMode === 'whole' && hex.partial) continue
    if (!hex.partial && !inMargin(verts)) continue
    tCtx.beginPath()
    tCtx.moveTo(verts[0][0], verts[0][1])
    for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
    tCtx.closePath()
    tCtx.fillStyle = clearFillColor
    tCtx.fill()
  }

  // ── 2. Clear texture overlay ─────────────────────────────────────────────────
  {
    const clearPolys: [number, number][][] = []
    for (const { hex, verts } of projected) {
      if (hex.terrain !== 'clear') continue
      if (edgeMode === 'whole' && hex.partial) continue
      if (!hex.partial && !inMargin(verts)) continue
      clearPolys.push(verts)
    }
    const clearTex = terrainTextures.get('clear') ?? null
    if (clearTex && clearPolys.length > 0) {
      const clearRawMode = terrainTextureBlendModes['clear'] ?? 'multiply'
      const clearIsColor = clearRawMode === 'color' || clearRawMode === 'color-bg'
      applyTextureOverlay(
        tCtx, clearTex, clearPolys, R, terrainTextureScales['clear'] ?? 3, 0,
        clearIsColor ? 'source-over' : clearRawMode as GlobalCompositeOperation,
        terrainTextureOpacities['clear'] ?? 0.3,
        clearIsColor ? (terrainColors['clear'] ?? '') : (terrainTextureTintColors['clear'] ?? ''),
        clearIsColor ? 1.0 : (terrainTextureTintOpacities['clear'] ?? 0.5),
        clearIsColor,
      )
    }
  }

  // ── 3. Field mode (detached — see terrainBlobs.ts) ─────────────────────────
  // if (renderMode === 'field' && fieldCanvas !== null) {
  //   tCtx.save(); tCtx.imageSmoothingEnabled = true; tCtx.imageSmoothingQuality = 'high'
  //   tCtx.drawImage(fieldCanvas, px, py, pw, ph); tCtx.restore()
  // }

  // ── 3b. Land clip (V3 realistic coastline) ──────────────────────────────────
  // Restrict all terrain blob rendering to land areas so nothing bleeds across
  // the coastline boundary into the sea.  Ocean hexes are excluded entirely;
  // coastal hexes are clipped to the portion inside the raw land polygon.
  // Raw rings (not smoothed) are used here and in section 6 so the clip matches
  // the raster coverage used for hex classification — Chaikin/DP smoothing can
  // shrink the polygon and leave coastal hexes with real land pixels uncovered.
  const landClipActive = realisticCoastline && coastlineRawBoundaryRings.length > 0
  if (landClipActive) {
    tCtx.save()
    tCtx.beginPath()
    for (const { hex, verts } of projected) {
      if (edgeMode === 'whole' && hex.partial) continue
      if (!hex.partial && !inMargin(verts)) continue
      // Let the raw coastline polygon decide which hexes are coastal. If any ring
      // intersects this hex, add only the land-side portion to the clip path.
      // Manually-painted hexes bypass the restriction so their terrain is always
      // fully visible (section 6 paints sea on top).
      // If no ring intersects, add the full hex — it sits entirely on one side.
      let addedLand = false
      if (!hex.manual_override) {
        for (const ring of coastlineRawBoundaryRings) {
          const clipped = clipPolygonToConvex(ring, verts)
          if (clipped.length < 3) continue
          tCtx.moveTo(clipped[0][0], clipped[0][1])
          for (let i = 1; i < clipped.length; i++) tCtx.lineTo(clipped[i][0], clipped[i][1])
          tCtx.closePath()
          addedLand = true
        }
      }
      if (!addedLand) {
        tCtx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
        tCtx.closePath()
      }
    }
    tCtx.clip('evenodd')
  }

  // ── 3c. Elevation blobs (hills / mountains) ──────────────────────────────────
  {
    const { elevationBlobs, hillsColor, mountainsColor, reliefShadingOpacity, elevationTypeBlobStyles,
      elevationShadowEnabled, elevationShadowBl, elevationShadowOp, elevationShadowPs, elevationShadowColor,
      pw, ph } = params

    for (const [cls, polys, clsColor] of [
      ['hills', elevationBlobs.hills, hillsColor],
      ['mountains', elevationBlobs.mountains, mountainsColor],
    ] as const) {
      if (elevationShadowEnabled[cls] && polys.length > 0) {
        drawPolygonShadow(tCtx, polys, pw, ph, 0, 0, elevationShadowBl, elevationShadowOp, elevationShadowPs, elevationShadowColor || clsColor)
      }
    }

    drawElevationBlobs(tCtx, elevationBlobs.hills, hillsColor)
    drawElevationBlobs(tCtx, elevationBlobs.mountains, mountainsColor)

    for (const [cls, polys] of [['hills', elevationBlobs.hills], ['mountains', elevationBlobs.mountains]] as const) {
      if (polys.length > 0) {
        const tex = terrainTextures.get(cls) ?? null
        if (tex) {
          const blendRaw = elevationTextureBlendModes[cls] ?? 'multiply'
          const isColorMode = blendRaw === 'color' || blendRaw === 'color-bg'
          applyTextureOverlay(tCtx, tex, polys, R, elevationTextureScales[cls] ?? 3, 0,
            isColorMode ? 'multiply' : blendRaw as GlobalCompositeOperation,
            elevationTextureOpacities[cls] ?? 0.5, undefined, 0, isColorMode)
        }
      }
    }

    for (const [cls, polys] of [['hills', elevationBlobs.hills], ['mountains', elevationBlobs.mountains]] as const) {
      const clsStyle = elevationTypeBlobStyles[cls]
      const fx = resolveBlobEffect(clsStyle, params.terrainBlobEffect ?? DEFAULT_STROKE_EFFECT, terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth)
      if (polys.length === 0) continue
      if (!fx.outlineEnabled) continue
      tCtx.save()
      tCtx.strokeStyle = fx.outlineColor
      tCtx.lineWidth   = fx.outlineWidth
      tCtx.lineJoin    = 'round'
      tCtx.beginPath()
      for (const poly of polys) {
        if (poly.length < 3) continue
        tCtx.moveTo(poly[0][0], poly[0][1])
        for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
        tCtx.closePath()
      }
      tCtx.stroke()
      tCtx.restore()
    }

    for (const [cls, polys] of [['hills', elevationBlobs.hills], ['mountains', elevationBlobs.mountains]] as const) {
      if (!params.elevationHachureEnabled[cls] || polys.length === 0) continue
      drawBlobHachure(tCtx, polys, R, params.slopeSmoothing, params.slopeTickSpacing, params.slopeTickLength, '#5a4a3a')
    }
  }

  // ── 3d. Background terrain blobs ─────────────────────────────────────────────
  // Drawn before primary blobs so primary terrain sits on top.
  // The blob is computed from background+primary hexes for a seamless boundary,
  // but we clip paint to background-terrain hexes only so primary terrain hexes
  // aren't double-rendered (which made background-painted hexes look lighter).
  if (backgroundTerrainBlobs.length > 0) {
    for (const { terrain, polys } of backgroundTerrainBlobs) {
      if (polys.length === 0) continue
      const rawMode = terrainTextureBlendModes[terrain] ?? 'multiply'
      const isColorMode = rawMode === 'color' || rawMode === 'color-bg'

      // Clip to hexes whose backgroundTerrain matches — primary terrain hexes
      // are included in the blob shape for a seamless boundary but must not
      // be painted here (section 4 covers them at the correct density).
      tCtx.save()
      tCtx.beginPath()
      for (const { hex, verts } of projected) {
        if ((hex as GeneratedHex).backgroundTerrain !== terrain) continue
        tCtx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
        tCtx.closePath()
      }
      tCtx.clip('evenodd')

      if (!isColorMode) {
        tCtx.fillStyle = terrainColors[terrain] ?? '#cccccc'
        tCtx.beginPath()
        for (const poly of polys) {
          if (poly.length < 3) continue
          tCtx.moveTo(poly[0][0], poly[0][1])
          for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
          tCtx.closePath()
        }
        tCtx.fill('evenodd')
      }
      const bgTex = terrainTextures.get(terrain) ?? null
      if (bgTex && polys.length > 0) {
        applyTextureOverlay(tCtx, bgTex, polys, R, terrainTextureScales[terrain] ?? 3, R * 0.12,
          rawMode as GlobalCompositeOperation,
          terrainTextureOpacities[terrain] ?? 0.6,
          isColorMode ? (terrainColors[terrain] ?? '') : (terrainTextureTintColors[terrain] ?? ''),
          isColorMode ? 1.0 : (terrainTextureTintOpacities[terrain] ?? 0.5),
          isColorMode)
      }

      tCtx.restore()
    }
  }

  // ── 4. Blob mode ────────────────────────────────────────────────────────────
  {
    const { edgeBlobPainted, edgeBlobWidth, terrainTypeBlobStyles, edgeBlobOverrides, hexVertMap } = params
    // Build per-terrain hex sets so ribbons can extend into adjacent area blobs.
    const hexTerrainSetByTerrain = new Map<string, Set<string>>()
    for (const { hex } of params.projected) {
      for (const t of params.hexTerrainLayers(hex)) {
        if (t === 'clear') continue
        if (!hexTerrainSetByTerrain.has(t)) hexTerrainSetByTerrain.set(t, new Set())
        hexTerrainSetByTerrain.get(t)!.add(`${hex.q},${hex.r}`)
      }
    }
    const terrainBlobs = applyEdgeRibbons(
      defaultTerrainBlobs, edgeBlobPainted, hexVertMap,
      terrainTypeBlobStyles, edgeBlobOverrides, edgeBlobWidth,
      terrainBlobParams, R, hexTerrainSetByTerrain,
    )

    const BLOB_Z: Record<string, number> = { rough: 1, marsh: 2, light_woods: 4, woods: 5, sea: 10 }

    const defaultBlobMap = new Map<string, [number, number][][]>()
    for (const { terrain, polys } of terrainBlobs) {
      defaultBlobMap.set(terrain, polys)
    }

    // Group overrides by their target terrain
    const overridesByTerrain = new Map<string, Array<[string, BlobOverride]>>()
    for (const [canonicalKey, override] of Object.entries(terrainBlobOverrides)) {
      const canonicalHex = hexes.find(h => `${h.q},${h.r}` === canonicalKey)
      if (!canonicalHex) continue
      const ovTerrain = override.terrain ?? canonicalHex.terrain
      if (ovTerrain === 'clear') continue
      if (!overridesByTerrain.has(ovTerrain)) overridesByTerrain.set(ovTerrain, [])
      overridesByTerrain.get(ovTerrain)!.push([canonicalKey, override])
    }

    const allTerrains = [...new Set([...defaultBlobMap.keys(), ...overridesByTerrain.keys()])]
      .sort((a, b) => (BLOB_Z[a] ?? 5) - (BLOB_Z[b] ?? 5))

    for (const terrain of allTerrains) {
      const defaultPolys = defaultBlobMap.get(terrain) ?? []

      const rawMode = terrainTextureBlendModes[terrain] ?? 'multiply'
      const isColorMode = rawMode === 'color' || rawMode === 'color-bg'

      const terrainColor = terrainColors[terrain] ?? '#cccccc'

      // a. Fill default polys
      if (defaultPolys.length > 0 && !isColorMode) {
        tCtx.fillStyle = terrainColor
        tCtx.beginPath()
        for (const poly of defaultPolys) {
          if (poly.length < 3) continue
          tCtx.moveTo(poly[0][0], poly[0][1])
          for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
          tCtx.closePath()
        }
        tCtx.fill('evenodd')
      }

      // a2. Default texture overlay
      if (defaultPolys.length > 0) {
        const defTex = terrainTextures.get(terrain) ?? null
        if (defTex) {
          applyTextureOverlay(tCtx, defTex, defaultPolys, R, terrainTextureScales[terrain] ?? 3, 0,
            rawMode as GlobalCompositeOperation,
            terrainTextureOpacities[terrain] ?? 0.6,
            isColorMode ? (terrainColors[terrain] ?? '') : (terrainTextureTintColors[terrain] ?? ''),
            isColorMode ? 1.0 : (terrainTextureTintOpacities[terrain] ?? 0.5),
            isColorMode)
        }
      }

      // b. Override passes for this terrain
      for (const [canonicalKey, override] of overridesByTerrain.get(terrain) ?? []) {
        const terrainComponents = blobComponentsByTerrain.get(terrain) ?? blobComponents
        const componentKeySet = new Set<string>()
        for (const [k, ck] of terrainComponents) { if (ck === canonicalKey) componentKeySet.add(k) }

        const ovProjected = projected.map(p => {
          const k = `${p.hex.q},${p.hex.r}`
          const inLayer = hexTerrainLayers(p.hex).includes(terrain)
          if (!inLayer || !componentKeySet.has(k)) return { hex: { ...p.hex, terrain: 'clear' }, verts: p.verts }
          return { ...p, hex: { ...p.hex, terrain } }
        })

        const ovSmooth          = override.smooth          ?? terrainBlobParams.smooth
        const ovOffset          = override.offset          ?? terrainBlobParams.offset
        const ovNoise           = override.bump            ?? terrainBlobParams.bump
        const ovSweepFreq       = override.sweepFreq       ?? terrainBlobParams.sweepFreq
        const ovLobeFreq        = override.lobeFreq        ?? terrainBlobParams.lobeFreq
        const ovLobeAmp         = override.lobeAmp         ?? terrainBlobParams.lobeAmp
        const ovLobeThreshold   = override.lobeThreshold   ?? terrainBlobParams.lobeThreshold
        const ovLobeDirection   = override.lobeDirection   ?? terrainBlobParams.lobeDirection
        const ovClusterSize     = override.clusterSize     ?? terrainBlobParams.clusterSize
        const ovBlobs = buildTerrainBlobsV2(
          ovProjected, ovSmooth, ovOffset, ovNoise,
          ovSweepFreq, ovLobeFreq, ovLobeAmp, ovLobeThreshold, ovLobeDirection, R, terrainBlobParams.topoStyle, ovClusterSize,
        )
        const ovPolys = ovBlobs.find(b => b.terrain === terrain)?.polys ?? []

        const ovColor = override.color ?? terrainColor

        const ovTexScale = override.textureScale ?? (params.terrainTextureScales[terrain] ?? 3)
        if (!isColorMode) {
          tCtx.fillStyle = ovColor
          tCtx.beginPath()
          for (const poly of ovPolys) {
            if (poly.length < 3) continue
            tCtx.moveTo(poly[0][0], poly[0][1])
            for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
            tCtx.closePath()
          }
          tCtx.fill('evenodd')
        }
        if (ovPolys.length > 0) {
          const ovTex = terrainTextures.get(terrain) ?? null
          if (ovTex) {
            applyTextureOverlay(tCtx, ovTex, ovPolys, R, ovTexScale, R * 0.12,
              rawMode as GlobalCompositeOperation,
              terrainTextureOpacities[terrain] ?? 0.6,
              isColorMode ? (terrainColors[terrain] ?? '') : (terrainTextureTintColors[terrain] ?? ''),
              isColorMode ? 1.0 : (terrainTextureTintOpacities[terrain] ?? 0.5),
              isColorMode)
          }
        }
      }

      // c. Blob outline + glow pass
      if (defaultPolys.length > 0) {
        const typeStyle = params.terrainTypeBlobStyles[terrain]
        const fx = resolveBlobEffect(typeStyle, params.terrainBlobEffect ?? DEFAULT_STROKE_EFFECT, terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth)
        if (fx.outlineEnabled) {
          tCtx.save()
          tCtx.strokeStyle = fx.outlineColor
          tCtx.lineWidth   = fx.outlineWidth
          tCtx.lineJoin    = 'round'
          tCtx.beginPath()
          for (const poly of defaultPolys) {
            if (poly.length < 3) continue
            tCtx.moveTo(poly[0][0], poly[0][1])
            for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
            tCtx.closePath()
          }
          tCtx.stroke()
          tCtx.restore()
        }
      }
    }

  } // end blob mode

  // ── 5b. Elevation edge blobs (hills / mountains only) ───────────────────────
  // Terrain edge blobs are merged into area blobs in applyEdgeRibbons (section 4).
  {
    const { edgeBlobPainted, edgeBlobWidth, terrainTypeBlobStyles, edgeBlobOverrides, hexVertMap } = params
    if (Object.keys(edgeBlobPainted).length > 0) {
      const { terrainBlobParams } = params
      const chains = findEdgeChains(edgeBlobPainted, hexVertMap)
      for (const chain of chains) {
        if (chain.terrain !== 'hills' && chain.terrain !== 'mountains') continue
        const typeStyle = terrainTypeBlobStyles[chain.terrain]
        const override = edgeBlobOverrides[chain.chainKey]
        const chainParams: EdgeBlobParams = {
          smooth:        override?.smooth        ?? typeStyle?.smooth        ?? terrainBlobParams.smooth,
          bump:          override?.bump          ?? typeStyle?.bump          ?? terrainBlobParams.bump,
          sweepFreq:     override?.sweepFreq     ?? typeStyle?.sweepFreq     ?? terrainBlobParams.sweepFreq,
          lobeFreq:      override?.lobeFreq      ?? typeStyle?.lobeFreq      ?? terrainBlobParams.lobeFreq,
          lobeAmp:       override?.lobeAmp       ?? typeStyle?.lobeAmp       ?? terrainBlobParams.lobeAmp,
          lobeThreshold: override?.lobeThreshold ?? typeStyle?.lobeThreshold ?? terrainBlobParams.lobeThreshold,
          lobeDirection: override?.lobeDirection ?? typeStyle?.lobeDirection ?? terrainBlobParams.lobeDirection,
          width:         override?.width         ?? typeStyle?.width         ?? edgeBlobWidth,
        }
        const polys = buildEdgeBlobPolys(chain, hexVertMap, chainParams, R, undefined)
        if (polys.length === 0) continue
        const elevColor = chain.terrain === 'hills' ? params.hillsColor : params.mountainsColor
        drawElevationBlobs(tCtx, polys, elevColor)
      }
    }
  }

  if (landClipActive) tCtx.restore()

  // ── 5. Historical icon stamps ───────────────────────────────────────────────
  if (params.mapStyle === 'historical_simple') {
    drawHistoricalIcons(tCtx, {
      blobs: defaultTerrainBlobs,
      R,
      iconSets: params.historicalIconSets,
      iconParams: params.historicalIconParams,
    })
  }

  // ── 6. Coastline — single sea mask overlay ──────────────────────────────────
  // Fill everything outside the land polygon with sea color in one pass.
  // The evenodd rule punches the land polygon out of the full-canvas rect,
  // leaving only the ocean areas filled. Manually painted land hexes within
  // the sea area remain visible because their terrain was drawn before this pass.
  if (realisticCoastline && coastlineRawBoundaryRings.length > 0) {
    const seaColor = terrainColors['water'] ?? '#3a6898'
    tCtx.fillStyle = seaColor
    tCtx.beginPath()
    tCtx.rect(px, py, pw, ph)
    for (const ring of coastlineRawBoundaryRings) {
      if (ring.length < 2) continue
      tCtx.moveTo(ring[0][0], ring[0][1])
      for (let i = 1; i < ring.length; i++) tCtx.lineTo(ring[i][0], ring[i][1])
      tCtx.closePath()
    }
    tCtx.fill('evenodd')

    // Beach strip — stroke the smoothed land polygon boundary for a clean visual line
    if (beachStrip && coastlineBoundaryRings.length > 0) {
      tCtx.strokeStyle = beachColor
      tCtx.lineWidth = beachWidth * R * 2
      tCtx.lineJoin = 'round'
      tCtx.lineCap = 'round'
      for (const ring of coastlineBoundaryRings) {
        if (ring.length < 2) continue
        tCtx.beginPath()
        tCtx.moveTo(ring[0][0], ring[0][1])
        for (let i = 1; i < ring.length; i++) tCtx.lineTo(ring[i][0], ring[i][1])
        tCtx.closePath()
        tCtx.stroke()
      }
    }
  }

  // ── Raw land polygon debug overlay ──────────────────────────────────────────
  // Shows the unsmoothed WorldCover-derived land polygon boundary (per-ring).
  // Useful for comparing raw raster data vs the smoothed V3 result.
  if (coastlineDebugRaw && coastlineRawBoundaryRings.length > 0) {
    tCtx.strokeStyle = 'rgba(255, 50, 50, 0.85)'
    tCtx.lineWidth = 1.5
    tCtx.lineJoin = 'round'
    tCtx.lineCap = 'round'
    tCtx.setLineDash([])
    for (const ring of coastlineRawBoundaryRings) {
      if (ring.length < 2) continue
      tCtx.beginPath()
      tCtx.moveTo(ring[0][0], ring[0][1])
      for (let i = 1; i < ring.length; i++) tCtx.lineTo(ring[i][0], ring[i][1])
      tCtx.closePath()
      tCtx.stroke()
    }
  }

  // ── Hillshade overlay ─────────────────────────────────────────────────────
  if (params.hillshadeCanvas && params.hillshadeCanvas.width > 0 && params.hillshadeCanvas.height > 0) {
    tCtx.save()
    const hsDT = params.hillshadeDisabledTerrains
    const hsDEC = params.hillshadeDisabledElevClasses
    if (hsDT.size > 0 || hsDEC.size > 0) {
      tCtx.beginPath()
      for (const { hex, verts } of projected) {
        if (hsDT.has(hex.terrain) || hsDEC.has(hex.elevation_class ?? 'flat')) continue
        tCtx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
        tCtx.closePath()
      }
      tCtx.clip()
    }
    tCtx.globalCompositeOperation = 'overlay'
    tCtx.drawImage(params.hillshadeCanvas, params.px, params.py, params.pw, params.ph)
    tCtx.restore()
  }

  // ── Contour lines ─────────────────────────────────────────────────────────
  if (params.contourCanvas && params.contourCanvas.width > 0 && params.contourCanvas.height > 0) {
    tCtx.save()
    const cDT = params.contourDisabledTerrains
    const cDEC = params.contourDisabledElevClasses
    if (cDT.size > 0 || cDEC.size > 0) {
      tCtx.beginPath()
      for (const { hex, verts } of projected) {
        if (cDT.has(hex.terrain) || cDEC.has(hex.elevation_class ?? 'flat')) continue
        tCtx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
        tCtx.closePath()
      }
      tCtx.clip()
    }
    tCtx.drawImage(params.contourCanvas, params.px, params.py, params.pw, params.ph)
    tCtx.restore()
  }

  if (Object.keys(params.slopeEdges).length > 0) {
    drawSlopes(tCtx, params.slopeEdges, params.hexVertMap, R, params.slopeStyle, params.slopeSmoothing, params.slopeTickSpacing, params.slopeTickLength,
      '#5a4a3a', params.pw, params.ph,
      0, 0, params.elevationShadowBl, params.elevationShadowOp, params.elevationShadowPs, params.elevationShadowColor)
  }

}

