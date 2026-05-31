/** Terrain layer rendering — hex fills, blob overlays, textures, lakes, coastline.
 *  Pure canvas operations — no React or store imports except types. */

import type { GeneratedHex, BlobOverride, BlobPatch } from '../store/mapStore'
import { buildTerrainBlobsV2, bleedPolygon } from './terrainBlobs'
import { clipPolygonToConvex, pointInPolygon } from './geometry'
import { makePermutation, perturbXY, perturbNormal } from './noise'
import { findEdgeChains, buildEdgeBlobPolys, type EdgeBlobChain, type EdgeBlobParams, parseEdgeBlobKey, sharedEdgeVertices } from './edgeBlobs'
import { drawHistoricalIcons, type HistoricalIconTerrainParams } from './drawHistoricalIcons'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type BlobParams = {
  smooth: number; offset: number; bump: number
  sweepFreq: number; lobeFreq: number; lobeAmp: number
  lobeThreshold: number; lobeDirection: number
  clearingChance: number; satelliteChance: number; patchSize: number
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
  defaultLakeBlobs: { terrain: string; polys: [number, number][][] }[]
  terrainBlobOverrides: Record<string, BlobOverride>
  lakeOverrides: Record<string, BlobOverride>
  blobComponents: Map<string, string>
  blobComponentsByTerrain: Map<string, Map<string, string>>
  terrainBlobParams: BlobParams
  lakeBlobParams: BlobParams
  hexes: GeneratedHex[]
  hexTerrainLayers: (hex: GeneratedHex) => string[]
  R: number
  realisticCoastline: boolean
  coastlineDebugRaw: boolean
  oceanSeaKeys: Set<string>
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
  blobPatches: BlobPatch[]
  terrainBlobFeather: number
  terrainBlobOutlineEnabled: boolean
  terrainBlobOutlineColor: string
  terrainBlobOutlineWidth: number
}

export type { EdgeBlobParams, EdgeBlobChain }

function patchSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function perturbPatch(pts: [number, number][], params: BlobParams, R: number, seed: number): [number, number][] {
  const p1x = makePermutation(seed)
  const p1y = makePermutation(seed + 31)
  let p = perturbXY(pts, p1x, p1y, params.sweepFreq / R, params.bump * R * 0.5)
  if (params.lobeAmp > 0) {
    const p2a = makePermutation(seed + 67)
    const p2b = makePermutation(seed + 113)
    p = perturbNormal(p, p2a, p2b, params.lobeFreq / R, params.bump * params.lobeAmp * R * params.lobeDirection, params.lobeThreshold)
  }
  return p
}

/** Cache of pre-processed color-mode textures: key = `${tex.src}_${hexColor}` */
const colorModeTextureCache = new Map<string, OffscreenCanvas>()

/**
 * Converts a B&W texture to a colored, alpha-masked canvas.
 * invert=false (Marks):     dark pixels → terrain color (opaque), bright → transparent
 * invert=true  (Background): bright pixels → terrain color (opaque), dark → transparent
 * Result is cached per (texture src, color, invert) triple.
 */
function getTintedTexture(tex: HTMLImageElement, hexColor: string, invert: boolean): OffscreenCanvas | null {
  const key = `${tex.src}_${hexColor}_${invert}`
  if (colorModeTextureCache.has(key)) return colorModeTextureCache.get(key)!
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

  if (colorMode && tintColor) {
    const invertAlpha = blendMode === ('color-bg' as GlobalCompositeOperation)
    const tinted = getTintedTexture(tex, tintColor, invertAlpha)
    if (!tinted) return
    const pattern = tCtx.createPattern(tinted, 'repeat')
    if (!pattern) return
    pattern.setTransform(transform)
    tCtx.save()
    tCtx.globalCompositeOperation = 'source-over'
    tCtx.globalAlpha = opacity
    tCtx.fillStyle = pattern
    buildPath()
    tCtx.fill('evenodd')
    tCtx.restore()
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

function drawElevationBlobsWithShading(
  tCtx: Ctx,
  polys: [number, number][][],
  color: string,
  reliefOpacity: number,
  cls: 'hills' | 'mountains',
  params: Pick<DrawTerrainParams, 'terrainTextures' | 'elevationTextureScales' | 'elevationTextureBlendModes' | 'elevationTextureOpacities' | 'R'>,
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

  // Texture overlay for elevation class
  const tex = params.terrainTextures.get(cls)
  if (tex) {
    const texScale = params.elevationTextureScales[cls] ?? 3
    const blendRaw = params.elevationTextureBlendModes[cls] ?? 'multiply'
    const texOpacity = params.elevationTextureOpacities[cls] ?? 0.5
    const isColorMode = blendRaw === 'color' || blendRaw === 'color-bg'
    const blendMode = isColorMode ? 'multiply' : blendRaw as GlobalCompositeOperation
    applyTextureOverlay(tCtx, tex, polys, params.R, texScale, 0, blendMode, texOpacity, undefined, 0, isColorMode)
  }

  if (reliefOpacity <= 0) return

  for (const poly of polys) {
    if (poly.length < 3) continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const half = Math.hypot(maxX - minX, maxY - minY) * 0.55
    const d = half * 0.707
    const grad = tCtx.createLinearGradient(cx - d, cy - d, cx + d, cy + d)
    grad.addColorStop(0,    `rgba(255,255,255,${(reliefOpacity * 0.8).toFixed(3)})`)
    grad.addColorStop(0.28, `rgba(255,255,255,0)`)
    grad.addColorStop(0.72, `rgba(0,0,0,0)`)
    grad.addColorStop(1,    `rgba(0,0,0,${(reliefOpacity * 0.6).toFixed(3)})`)
    tCtx.save()
    tCtx.beginPath()
    tCtx.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
    tCtx.closePath()
    tCtx.clip()
    tCtx.fillStyle = grad
    tCtx.fillRect(minX, minY, maxX - minX, maxY - minY)
    tCtx.restore()
  }
}

/**
 * Fill a single hex with a radial gradient: solid colour from centre out to
 * (1−featherRatio)×R, then a gradient to fully transparent at the hex edge R.
 * featherRatio=0.5 → outer 50% of the hex radius fades; centre stays solid.
 */
function drawHexWithFade(
  ctx: Ctx,
  verts: [number, number][],
  R: number,
  color: string,
  r: number, g: number, b: number,
  featherRatio: number,
): void {
  let cx = 0, cy = 0
  for (const [x, y] of verts) { cx += x; cy += y }
  cx /= verts.length; cy /= verts.length

  const innerR = R * (1 - featherRatio)
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, R)
  grad.addColorStop(0, color)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(verts[0][0], verts[0][1])
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = grad
  ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4)
  ctx.restore()
}

function polyArea(pts: [number, number][]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) * 0.5
}

export function drawTerrain(tCtx: Ctx, params: DrawTerrainParams): void {
  const {
    projected, edgeMode, inMargin,
    terrainColors, terrainTextureScales, terrainTextureBlendModes, terrainTextureOpacities,
    terrainTextureTintColors, terrainTextureTintOpacities, terrainTextures,
    px, py, pw, ph,
    backgroundTerrainBlobs, defaultTerrainBlobs, defaultLakeBlobs,
    terrainBlobOverrides, lakeOverrides,
    blobComponents, blobComponentsByTerrain,
    terrainBlobParams, lakeBlobParams,
    hexes, hexTerrainLayers, R,
    realisticCoastline, coastlineDebugRaw,
    oceanSeaKeys,
    beachStrip, beachColor, beachWidth,
    coastlineBoundaryRings, coastlineRawBoundaryRings,
    // edge blobs destructured inline below where used
    terrainBlobFeather,
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

  // ── 2. Clear texture overlay ────────────────────────────────────────────────
  {
    const clearTex = terrainTextures.get('clear') ?? null
    if (clearTex) {
      const clearPolys: [number, number][][] = []
      for (const { hex, verts } of projected) {
        if (hex.terrain !== 'clear') continue
        if (edgeMode === 'whole' && hex.partial) continue
        if (!hex.partial && !inMargin(verts)) continue
        clearPolys.push(verts)
      }
      {
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
  }

  // ── 3. Field mode (detached — see terrainBlobs.ts) ─────────────────────────
  // if (renderMode === 'field' && fieldCanvas !== null) {
  //   tCtx.save(); tCtx.imageSmoothingEnabled = true; tCtx.imageSmoothingQuality = 'high'
  //   tCtx.drawImage(fieldCanvas, px, py, pw, ph); tCtx.restore()
  // }

  // ── 3b. Land clip (V3 realistic coastline) ──────────────────────────────────
  // Restrict all terrain blob rendering to land areas so nothing bleeds across
  // the coastline boundary into the sea.  Ocean hexes are excluded entirely;
  // coastal hexes are clipped to the portion inside the smoothed land polygon.
  const landClipActive = realisticCoastline && coastlineBoundaryRings.length > 0
  if (landClipActive) {
    tCtx.save()
    tCtx.beginPath()
    for (const { hex, verts } of projected) {
      if (edgeMode === 'whole' && hex.partial) continue
      if (!hex.partial && !inMargin(verts)) continue
      // Consistent with section 6: let the coastline polygon decide which hexes
      // are coastal. If any ring intersects this hex, add only the land-side
      // portion to the clip path. Manually-painted hexes bypass the restriction
      // so their terrain is always fully visible (section 6 paints sea on top).
      // If no ring intersects, add the full hex — it sits entirely on one side.
      let addedLand = false
      if (!hex.manual_override) {
        for (const ring of coastlineBoundaryRings) {
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
    const { elevationBlobs, hillsColor, mountainsColor, reliefShadingOpacity, elevationTypeBlobStyles } = params
    const elevTexParams = { terrainTextures: params.terrainTextures, elevationTextureScales: params.elevationTextureScales, elevationTextureBlendModes: params.elevationTextureBlendModes, elevationTextureOpacities: params.elevationTextureOpacities, R }
    drawElevationBlobsWithShading(tCtx, elevationBlobs.hills, hillsColor, reliefShadingOpacity, 'hills', elevTexParams)
    drawElevationBlobsWithShading(tCtx, elevationBlobs.mountains, mountainsColor, reliefShadingOpacity, 'mountains', elevTexParams)

    for (const [cls, polys] of [['hills', elevationBlobs.hills], ['mountains', elevationBlobs.mountains]] as const) {
      const clsStyle = elevationTypeBlobStyles[cls]
      const effectiveOutline = clsStyle?.outlineEnabled ?? terrainBlobOutlineEnabled
      if (!effectiveOutline || polys.length === 0) continue
      tCtx.save()
      tCtx.strokeStyle = clsStyle?.outlineColor ?? terrainBlobOutlineColor
      tCtx.lineWidth   = clsStyle?.outlineWidth ?? terrainBlobOutlineWidth
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
  }

  // ── 3d. Background terrain blobs ─────────────────────────────────────────────
  // Drawn before primary blobs so primary terrain sits on top.
  // The fringe effect appears where the primary blob's organic boundary
  // doesn't fully cover the hex.
  if (backgroundTerrainBlobs.length > 0) {
    for (const { terrain, polys } of backgroundTerrainBlobs) {
      if (polys.length === 0) continue
      const rawMode = terrainTextureBlendModes[terrain] ?? 'multiply'
      const isColorMode = rawMode === 'color' || rawMode === 'color-bg'
      const tex = terrainTextures.get(terrain) ?? null
      const texBlend = rawMode as GlobalCompositeOperation
      const texOpacity = terrainTextureOpacities[terrain] ?? 0.6
      const texTint = isColorMode ? (terrainColors[terrain] ?? '') : (terrainTextureTintColors[terrain] ?? '')
      const texTintOpacity = isColorMode ? 1.0 : (terrainTextureTintOpacities[terrain] ?? 0.5)
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
      const texScale = terrainTextureScales[terrain] ?? 3
      if (tex) applyTextureOverlay(tCtx, tex, polys, R, texScale, R * 0.12, texBlend, texOpacity, texTint, texTintOpacity, isColorMode)
    }
  }

  // ── 4. Blob mode ────────────────────────────────────────────────────────────
  {
    const BLOB_Z: Record<string, number> = { rough: 1, marsh: 2, light_woods: 4, woods: 5, sea: 10 }

    // Build defaultBlobMap excluding lakes
    const defaultBlobMap = new Map<string, [number, number][][]>()
    for (const { terrain, polys } of defaultTerrainBlobs) {
      if (terrain !== 'lake') defaultBlobMap.set(terrain, polys)
    }

    // Group overrides by their target terrain
    const overridesByTerrain = new Map<string, Array<[string, BlobOverride]>>()
    for (const [canonicalKey, override] of Object.entries(terrainBlobOverrides)) {
      const canonicalHex = hexes.find(h => `${h.q},${h.r}` === canonicalKey)
      if (!canonicalHex || (canonicalHex.isLake ?? false)) continue
      const ovTerrain = override.terrain ?? canonicalHex.terrain
      if (ovTerrain === 'clear' || ovTerrain === 'lake') continue
      if (!overridesByTerrain.has(ovTerrain)) overridesByTerrain.set(ovTerrain, [])
      overridesByTerrain.get(ovTerrain)!.push([canonicalKey, override])
    }

    const addPatchTerrains = params.blobPatches.filter(p => p.mode === 'add').map(p => p.terrain)
    const allTerrains = [...new Set([...defaultBlobMap.keys(), ...overridesByTerrain.keys(), ...addPatchTerrains])]
      .sort((a, b) => (BLOB_Z[a] ?? 5) - (BLOB_Z[b] ?? 5))

    for (const terrain of allTerrains) {
      const defaultPolys = defaultBlobMap.get(terrain) ?? []
      const cutPatches = params.blobPatches.filter(p => p.terrain === terrain && p.mode === 'cut')

      const rawMode = terrainTextureBlendModes[terrain] ?? 'multiply'
      const isColorMode = rawMode === 'color' || rawMode === 'color-bg'
      const tex = terrainTextures.get(terrain) ?? null
      const texBlend = rawMode as GlobalCompositeOperation
      const texOpacity = terrainTextureOpacities[terrain] ?? 0.6
      const texTint = isColorMode ? (terrainColors[terrain] ?? '') : (terrainTextureTintColors[terrain] ?? '')
      const texTintOpacity = isColorMode ? 1.0 : (terrainTextureTintOpacities[terrain] ?? 0.5)

      const typeFeather = params.terrainTypeBlobStyles[terrain]?.feather
      const featherRatio = typeFeather ?? terrainBlobFeather

      // Pre-parse colour RGB once for gradient transparent stop
      const terrainColor = terrainColors[terrain] ?? '#cccccc'
      const _tr = parseInt(terrainColor.slice(1, 3), 16) || 0
      const _tg = parseInt(terrainColor.slice(3, 5), 16) || 0
      const _tb = parseInt(terrainColor.slice(5, 7), 16) || 0

      // a. Fill default polys
      if (defaultPolys.length > 0) {
        if (!isColorMode) {
          if (featherRatio > 0) {
            // Per-hex radial gradient: solid from centre to (1-ratio)×R, fades to
            // transparent at the hex edge. Interior hexes look solid because adjacent
            // gradients overlap; boundary hexes dissolve at their edges.
            for (const { hex, verts } of projected) {
              if (!hexTerrainLayers(hex).includes(terrain)) continue
              if (edgeMode === 'whole' && hex.partial) continue
              if (!hex.partial && !inMargin(verts)) continue
              drawHexWithFade(tCtx, verts, R, terrainColor, _tr, _tg, _tb, featherRatio)
            }
          } else {
            tCtx.fillStyle = terrainColor
            tCtx.beginPath()
            for (const poly of defaultPolys) {
              if (poly.length < 3) continue
              tCtx.moveTo(poly[0][0], poly[0][1])
              for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
              tCtx.closePath()
            }
            for (const patch of cutPatches) {
              if (patch.points.length < 3) continue
              const cPts = perturbPatch(patch.points, terrainBlobParams, R, patchSeed(patch.id))
              tCtx.moveTo(cPts[0][0], cPts[0][1])
              for (let i = 1; i < cPts.length; i++) tCtx.lineTo(cPts[i][0], cPts[i][1])
              tCtx.closePath()
            }
            tCtx.fill('evenodd')
          }
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
        const ovClearingChance  = override.clearingChance  ?? terrainBlobParams.clearingChance
        const ovSatelliteChance = override.satelliteChance ?? terrainBlobParams.satelliteChance
        const ovPatchSize       = override.patchSize       ?? terrainBlobParams.patchSize

        const ovBlobs = buildTerrainBlobsV2(
          ovProjected, ovSmooth, ovOffset, ovNoise,
          ovSweepFreq, ovLobeFreq, ovLobeAmp, ovLobeThreshold, ovLobeDirection, R,
          ovClearingChance, ovSatelliteChance, ovPatchSize,
        )
        const ovPolys = ovBlobs.find(b => b.terrain === terrain)?.polys ?? []

        const ovFeatherRatio = override.feather ?? featherRatio
        const ovColor = override.color ?? terrainColor

        if (!isColorMode) {
          if (ovFeatherRatio > 0) {
            const ovR = parseInt(ovColor.slice(1, 3), 16) || 0
            const ovG = parseInt(ovColor.slice(3, 5), 16) || 0
            const ovB = parseInt(ovColor.slice(5, 7), 16) || 0
            for (const { hex, verts } of projected) {
              const k = `${hex.q},${hex.r}`
              if (!componentKeySet.has(k)) continue
              if (!hexTerrainLayers(hex).includes(terrain)) continue
              if (edgeMode === 'whole' && hex.partial) continue
              if (!hex.partial && !inMargin(verts)) continue
              drawHexWithFade(tCtx, verts, R, ovColor, ovR, ovG, ovB, ovFeatherRatio)
            }
          } else {
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
        }

        const ovTexScale = override.textureScale ?? (terrainTextureScales[terrain] ?? 3)
        if (tex) applyTextureOverlay(tCtx, tex, ovPolys, R, ovTexScale, R * 0.12, texBlend, texOpacity, texTint, texTintOpacity, isColorMode)
      }

      // c. Global texture for default polys (no bleed)
      if (tex) applyTextureOverlay(tCtx, tex, defaultPolys, R, terrainTextureScales[terrain] ?? 3, 0, texBlend, texOpacity, texTint, texTintOpacity, isColorMode)

      // d. Add patches — perturbed with same wobble as main blobs
      const addPatches = params.blobPatches.filter(p => p.terrain === terrain && p.mode === 'add')
      for (const patch of addPatches) {
        if (patch.points.length < 3) continue
        const aPts = perturbPatch(patch.points, terrainBlobParams, R, patchSeed(patch.id))
        if (!isColorMode) {
          tCtx.fillStyle = terrainColors[terrain] ?? '#cccccc'
          tCtx.beginPath()
          tCtx.moveTo(aPts[0][0], aPts[0][1])
          for (let i = 1; i < aPts.length; i++) tCtx.lineTo(aPts[i][0], aPts[i][1])
          tCtx.closePath()
          tCtx.fill()
        }
        if (tex) applyTextureOverlay(tCtx, tex, [aPts], R, terrainTextureScales[terrain] ?? 3, 0, texBlend, texOpacity, texTint, texTintOpacity)
      }

      // e. Blob outline pass
      const typeOutlineEnabled = params.terrainTypeBlobStyles[terrain]?.outlineEnabled
      const typeOutlineColor   = params.terrainTypeBlobStyles[terrain]?.outlineColor
      const typeOutlineWidth   = params.terrainTypeBlobStyles[terrain]?.outlineWidth
      const effectiveOutline   = typeOutlineEnabled ?? terrainBlobOutlineEnabled
      if (effectiveOutline && defaultPolys.length > 0) {
        tCtx.save()
        tCtx.strokeStyle = typeOutlineColor ?? terrainBlobOutlineColor
        tCtx.lineWidth   = typeOutlineWidth ?? terrainBlobOutlineWidth
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

    // ── 5. Lakes ──────────────────────────────────────────────────────────────
    const lakeColor = terrainColors['lake'] ?? '#5888b0'

    const drawLakePolys = (polys: [number, number][][], fillColor: string) => {
      tCtx.fillStyle = fillColor
      for (const poly of polys) {
        if (poly.length < 3) continue
        tCtx.beginPath()
        tCtx.moveTo(poly[0][0], poly[0][1])
        for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
        tCtx.closePath()
        tCtx.fill()
      }
    }

    // Default lake pass
    const lakeBlobPolys = defaultLakeBlobs.find(b => b.terrain === 'lake')?.polys ?? []
    if (lakeBlobPolys.length > 0) drawLakePolys(lakeBlobPolys, lakeColor)

    // Override lake passes
    for (const [canonicalKey, override] of Object.entries(lakeOverrides)) {
      const componentKeySet = new Set<string>()
      for (const [k, ck] of blobComponents) { if (ck === canonicalKey) componentKeySet.add(k) }

      const ovLakeProjected = projected
        .filter(p => (p.hex.isLake ?? false) && componentKeySet.has(`${p.hex.q},${p.hex.r}`))
        .map(p => ({ hex: { ...p.hex, terrain: 'lake' }, verts: p.verts }))
      if (ovLakeProjected.length === 0) continue

      const ovSmooth          = override.smooth          ?? lakeBlobParams.smooth
      const ovOffset          = override.offset          ?? lakeBlobParams.offset
      const ovNoise           = override.bump            ?? lakeBlobParams.bump
      const ovSweepFreq       = override.sweepFreq       ?? lakeBlobParams.sweepFreq
      const ovLobeFreq        = override.lobeFreq        ?? lakeBlobParams.lobeFreq
      const ovLobeAmp         = override.lobeAmp         ?? lakeBlobParams.lobeAmp
      const ovLobeThreshold   = override.lobeThreshold   ?? lakeBlobParams.lobeThreshold
      const ovLobeDirection   = override.lobeDirection   ?? lakeBlobParams.lobeDirection

      const ovBlobs = buildTerrainBlobsV2(
        ovLakeProjected, ovSmooth, ovOffset, ovNoise,
        ovSweepFreq, ovLobeFreq, ovLobeAmp, ovLobeThreshold, ovLobeDirection, R,
      )
      // Lakes intentionally omit clearing/satellite params — decorators on water would look odd.
      const ovPolys = ovBlobs.find(b => b.terrain === 'lake')?.polys ?? []
      drawLakePolys(ovPolys, override.color ?? lakeColor)
    }
  } // end blob mode

  // ── 5b. Edge blobs ───────────────────────────────────────────────────────────
  const { edgeBlobPainted, edgeBlobWidth, terrainTypeBlobStyles, edgeBlobOverrides, hexVertMap } = params
  if (Object.keys(edgeBlobPainted).length > 0) {
    // Build terrain → hex-key set for the connection extension check.
    // Includes both primary terrain layers and backgroundTerrain so edge blobs
    // can extend into background hexes of the same type.
    const terrainToHexes = new Map<string, Set<string>>()
    for (const { hex } of projected) {
      for (const t of hexTerrainLayers(hex)) {
        if (!terrainToHexes.has(t)) terrainToHexes.set(t, new Set())
        terrainToHexes.get(t)!.add(`${hex.q},${hex.r}`)
      }
      if (hex.backgroundTerrain) {
        if (!terrainToHexes.has(hex.backgroundTerrain)) terrainToHexes.set(hex.backgroundTerrain, new Set())
        terrainToHexes.get(hex.backgroundTerrain)!.add(`${hex.q},${hex.r}`)
      }
    }

    const { terrainBlobParams } = params
    const chains = findEdgeChains(edgeBlobPainted, hexVertMap)
    for (const chain of chains) {
      // Shape params: global terrain blob defaults → per-terrain blob style override → per-chain override.
      // Width: global edge default → per-terrain width field → per-chain override.
      const typeStyle = terrainTypeBlobStyles[chain.terrain]
      const override = edgeBlobOverrides[chain.chainKey]
      const chainParams: EdgeBlobParams = {
        smooth:        override?.smooth         ?? typeStyle?.smooth         ?? terrainBlobParams.smooth,
        bump:          override?.bump           ?? typeStyle?.bump           ?? terrainBlobParams.bump,
        sweepFreq:     override?.sweepFreq      ?? typeStyle?.sweepFreq      ?? terrainBlobParams.sweepFreq,
        lobeFreq:      override?.lobeFreq       ?? typeStyle?.lobeFreq       ?? terrainBlobParams.lobeFreq,
        lobeAmp:       override?.lobeAmp        ?? typeStyle?.lobeAmp        ?? terrainBlobParams.lobeAmp,
        lobeThreshold: override?.lobeThreshold  ?? typeStyle?.lobeThreshold  ?? terrainBlobParams.lobeThreshold,
        lobeDirection: override?.lobeDirection  ?? typeStyle?.lobeDirection  ?? terrainBlobParams.lobeDirection,
        width:         override?.width          ?? typeStyle?.width          ?? edgeBlobWidth,
      }
      // 'clear' edges trim terrain blobs — no extension toward matching hexes needed.
      const hexTerrainSet = chain.terrain === 'clear' ? undefined : terrainToHexes.get(chain.terrain)
      const polys = buildEdgeBlobPolys(chain, hexVertMap, chainParams, R, hexTerrainSet)
      if (polys.length === 0) continue
      {
        const color = override?.color ?? terrainColors[chain.terrain] ?? '#cccccc'
        tCtx.fillStyle = color
        for (const poly of polys) {
          if (poly.length < 3) continue
          tCtx.beginPath()
          tCtx.moveTo(poly[0][0], poly[0][1])
          for (let i = 1; i < poly.length; i++) tCtx.lineTo(poly[i][0], poly[i][1])
          tCtx.closePath()
          tCtx.fill()
        }
      }
      const texScale = override?.textureScale ?? (terrainTextureScales[chain.terrain] ?? 3)
      const edgeRawMode = terrainTextureBlendModes[chain.terrain] ?? 'multiply'
      const edgeIsColor = edgeRawMode === 'color' || edgeRawMode === 'color-bg'
      const edgeTexBlend: GlobalCompositeOperation = edgeIsColor ? 'source-over' : edgeRawMode as GlobalCompositeOperation
      const edgeTexOpacity = terrainTextureOpacities[chain.terrain] ?? 0.6
      const edgeTexTint = edgeIsColor ? (terrainColors[chain.terrain] ?? '') : (terrainTextureTintColors[chain.terrain] ?? '')
      const edgeTexTintOpacity = edgeIsColor ? 1.0 : (terrainTextureTintOpacities[chain.terrain] ?? 0.5)
      const edgeTex = terrainTextures.get(chain.terrain) ?? null
      if (edgeTex) applyTextureOverlay(tCtx, edgeTex, polys, R, texScale, R * 0.12, edgeTexBlend, edgeTexOpacity, edgeTexTint, edgeTexTintOpacity, edgeIsColor)
    }
  }

  if (landClipActive) tCtx.restore()

  // ── 5c. Historical icon stamps ───────────────────────────────────────────────
  if (params.mapStyle === 'historical_simple') {
    drawHistoricalIcons(tCtx, {
      blobs: defaultTerrainBlobs,
      R,
      iconSets: params.historicalIconSets,
      iconParams: params.historicalIconParams,
    })
  }

  // ── 6. Coastline ────────────────────────────────────────────────────────────
  if (realisticCoastline && coastlineBoundaryRings.length > 0) {
    const seaColor = terrainColors['sea'] ?? '#3a6898'

    // Ocean hexes — solid sea fill.  Skip hexes the user has manually painted
    // with non-sea terrain so their paint isn't erased by the sea fill.
    tCtx.fillStyle = seaColor
    tCtx.beginPath()
    for (const { hex, verts } of projected) {
      const key = `${hex.q},${hex.r}`
      if (!oceanSeaKeys.has(key)) continue
      if (!inMargin(verts) && !hex.partial) continue
      if (hex.manual_override && hexTerrainLayers(hex).some(t => t !== 'sea')) continue
      tCtx.moveTo(verts[0][0], verts[0][1])
      for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
      tCtx.closePath()
    }
    // Coastal hexes — evenodd: hex outline + land clip, with per-ring inversion detection.
    //
    // Sutherland-Hodgman can return the sea-side piece instead of the land-side piece
    // when the ring enters and exits the hex close together (thin peninsula, coastal notch).
    // We detect this per ring: pointInPolygon(hexCenter, ring) tells us if the center is
    // inside the land ring; pointInPolygon(hexCenter, clip) tells us if the clip contains
    // the center.  They should agree — if they don't, the clip is inverted.
    //
    // Not inverted → add hex + clip to evenodd path (sea fills the gap).
    // Inverted     → collect clip for a separate solid fill (clip IS the sea area).
    const invertedClips: [number, number][][] = []

    for (const { hex, verts } of projected) {
      if (!inMargin(verts) && !hex.partial) continue

      const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length
      const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length
      const minClipArea = polyArea(verts) * 0.01   // skip clips < 1% of hex (floating-point dust)

      let addedHex = false
      let hasAnyClip = false

      for (const ring of coastlineBoundaryRings) {
        const clipped = clipPolygonToConvex(ring, verts)
        if (clipped.length < 3) continue
        if (polyArea(clipped) < minClipArea) continue

        hasAnyClip = true
        const centerInsideRing  = pointInPolygon(cx, cy, ring)
        const centerInsideClip  = pointInPolygon(cx, cy, clipped)
        const inverted = centerInsideRing !== centerInsideClip

        if (inverted) {
          // Clip is the sea area — handle with a separate solid fill below.
          invertedClips.push(clipped)
        } else {
          // Clip is the land area — evenodd: sea fills hex minus clip.
          if (!addedHex) {
            tCtx.moveTo(verts[0][0], verts[0][1])
            for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
            tCtx.closePath()
            addedHex = true
          }
          tCtx.moveTo(clipped[0][0], clipped[0][1])
          for (let i = 1; i < clipped.length; i++) tCtx.lineTo(clipped[i][0], clipped[i][1])
          tCtx.closePath()
        }
      }

      // No ring intersected but backend flagged as coastal — smoothing voted it ocean.
      if (!hasAnyClip && hex.coastline_clip && hex.coastline_clip.length > 0
          && !(hex.manual_override && hexTerrainLayers(hex).some(t => t !== 'sea'))) {
        tCtx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) tCtx.lineTo(verts[i][0], verts[i][1])
        tCtx.closePath()
      }
    }
    tCtx.fill('evenodd')

    // Inverted-clip solid fill: these polygons are the sea areas that S-H returned
    // as land clips.  Fill them directly with sea color on top of the evenodd result.
    if (invertedClips.length > 0) {
      tCtx.fillStyle = seaColor
      tCtx.beginPath()
      for (const clip of invertedClips) {
        tCtx.moveTo(clip[0][0], clip[0][1])
        for (let i = 1; i < clip.length; i++) tCtx.lineTo(clip[i][0], clip[i][1])
        tCtx.closePath()
      }
      tCtx.fill()
    }

    // Beach strip — stroke the smoothed polygon boundary directly
    if (beachStrip) {
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
  if (params.hillshadeCanvas) {
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
  if (params.contourCanvas) {
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
}
