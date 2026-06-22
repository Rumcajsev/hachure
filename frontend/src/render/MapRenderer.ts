/* eslint-disable @typescript-eslint/no-explicit-any */
import { hexTerrainLayers } from '../store/mapStore'
import { computeWorldcoverBbox, projectToCanvas } from '../lib/projection'
import { buildExportTerrainBlobs } from '../lib/terrainBlobs'
import { buildTerrainTextures } from '../lib/terrainTextures'
import { computeDragLiveData, computeRoadProjections, computeLiveRiverChainData } from '../lib/roadLiveGeometry'
import { liveClassParamsRef } from '../lib/liveClassParamsRef'
import { _drawHoveredEdgePreview } from '../lib/drawHighlights'
import { _drawWorldcoverOverlay, _drawRawOsmRoadsOverlay } from '../lib/drawDebugOverlays'
import { _drawTerrainPaintOverlay, _drawElevationPaintOverlay } from '../lib/drawPaintOverlays'
import { _drawBlobHandleOverlay, _drawBlobMaskPreview } from '../lib/drawBlobHandleOverlay'
import { drawLabels as _drawLabels, _drawLabelDragHandles } from '../lib/drawLabels'
import { drawIcons as _drawIcons } from '../lib/drawIcons'
import { drawBridges as _drawBridges } from '../lib/drawBridges'
import { drawMegaHexGrid as _drawMegaHexGrid } from '../lib/drawMegaHexGrid'
import { drawElevationDebug as _drawElevationDebug, drawElevationClassOverlay as _drawElevationClassOverlay } from '../lib/drawElevationDebug'
import { drawMapBoundary as _drawMapBoundary, drawHexGridMask as _drawHexGridMask, drawExcludedHexOverlay as _drawExcludedHexOverlay } from '../lib/drawHexBorders'
import { drawPaperBackground as _drawPaperBackground, drawPaperMargin as _drawPaperMargin } from '../lib/drawPaperChrome'
import { drawRoadHandles as _drawRoadHandles, drawRailHandles as _drawRailHandles, drawRiverHandles as _drawRiverHandles } from '../lib/drawEditHandles'
import { buildRailChains } from '../lib/railChains'
import { drawMapImageOverlay } from '../lib/drawMapImageOverlay'
import { finalizeDrawFrame } from '../lib/perfMonitor'
import { terrainController } from './layers/terrainLayer'
import { hexBorderController } from './layers/hexBorderLayer'
import { highlightsController } from './layers/highlightsLayer'
import { riversController } from './layers/riversLayer'
import { buildingsController } from './layers/buildingsLayer'
import { roadsController } from './layers/roadsLayer'
import { settlementsController } from './layers/settlementsLayer'
import { hexNumbersController } from './layers/hexNumbersLayer'
import { drawSettlements } from '../lib/drawSettlements'
import { drawRivers } from '../lib/drawRivers'
import { activeEditOverlay } from './activeEditOverlay'

export type ExportTarget = { canvas: HTMLCanvasElement; pw: number; ph: number }

export interface MapRefs {
  activeBlobEditIdRef: { current: any }
  activeIconOverlayIdRef: { current: any }
  activeToolRef: { current: any }
  appliedOsmRiverIndicesRef: { current: any }
  autoDisabledOceanHexKeysRef: { current: any }
  beachColorRef: { current: any }
  beachStripRef: { current: any }
  beachWidthRef: { current: any }
  bgPaintHoldRef: { current: any }
  blobComponentsByTerrainRef: { current: any }
  blobComponentsRef: { current: any }
  blobDragLiveRef: { current: any }
  blobEditModeRef: { current: any }
  blobHandleDataRef: { current: any }
  blobHandleOverridesRef: { current: any }
  blobMaskDrawingRef: { current: any }
  blobMaskStrokeRef: { current: any }
  bridgeOverridesRef: { current: any }
  bridgeStyleRef: { current: any }
  bridgeTiersRef: { current: any }
  bridgesEnabledRef: { current: any }
  cachedRiverChainDataRef: { current: any }
  cachedRiverTierChainDataRef: { current: any }
  canvasRef: { current: any }
  clipToHexGridRef: { current: any }
  coastlineDebugRawRef: { current: any }
  contourCanvasRef: { current: any }
  contourDisabledElevClassesSetRef: { current: any }
  contourDisabledTerrainsSetRef: { current: any }
  customTerrainsRef: { current: any }
  dataSourceRef: { current: any }
  defaultBackgroundBlobsRef: { current: any }
  defaultElevationBlobsRef: { current: any }
  defaultTerrainBlobsMaskedRef: { current: any }
  defaultWaterBlobsRef: { current: any }
  detectedBridgesRef: { current: any }
  disabledHexKeysRef: { current: any }
  dragLiveDensePosRef: { current: any }
  dragLiveOverrideRef: { current: any }
  draggingCpKeyRef: { current: any }
  draggingCpKindRef: { current: any }
  draggingDensePtRef: { current: any }
  draggingLabelRef: { current: any }
  drawOsmHighlightRef: { current: any }
  drawPerfRef: { current: any }
  edgeBlobOverridesRef: { current: any }
  edgeBlobPaintedRef: { current: any }
  edgeBlobWidthRef: { current: any }
  editingLabelRef: { current: any }
  elevationPaintBrushRef: { current: any }
  elevationPaintModeRef: { current: any }
  elevationTypeBlobStylesRef: { current: any }
  excludedHexKeysRef: { current: any }
  frameDimsRef: { current: any }
  hexBorderColorRef: { current: any }
  hexBorderDifferenceRef: { current: any }
  hexBorderModeRef: { current: any }
  hexBorderOpacityRef: { current: any }
  hexBuildingGeoCacheRef: { current: any }
  hexEdgeModeRef: { current: any }
  hexIdxRef: { current: any }
  hexNumberColorRef: { current: any }
  hexNumberEdgeRef: { current: any }
  hexNumberFontScaleRef: { current: any }
  hexNumberMapRef: { current: any }
  hexNumbersEnabledRef: { current: any }
  hexRadiusRef: { current: any }
  hexVertMapRef: { current: any }
  hexesRef: { current: any }
  highlightEdgePathsRef: { current: any }
  highlightLinesRef: { current: any }
  highlightedHexesRef: { current: any }
  highlightsRef: { current: any }
  hillsColorRef: { current: any }
  hillshadeCanvasRef: { current: any }
  hillshadeDisabledElevClassesSetRef: { current: any }
  hillshadeDisabledTerrainsSetRef: { current: any }
  hillshadeEnabledRef: { current: any }
  historicalIconParamsRef: { current: any }
  historicalIconSetsRef: { current: any }
  hoveredBlobCkRef: { current: any }
  hoveredChainRef: { current: any }
  hoveredEdgeHandleRef: { current: any }
  hoveredEdgeRef: { current: any }
  hoveredHandleIdxRef: { current: any }
  hoveredLabelIdRef: { current: any }
  hoveredVertexHandleRef: { current: any }
  iconOverlaysRef: { current: any }
  iconPlaceModeRef: { current: any }
  iconSnapRef: { current: any }
  isPaintingRef: { current: any }
  labelBBoxCacheRef: { current: any }
  labelDragStateRef: { current: any }
  labelOffsetsRef: { current: any }
  labelOverlaysRef: { current: any }
  labelSnapRef: { current: any }
  lastBuildingCacheEpochRef: { current: any }
  liveLabelOffsetRef: { current: any }
  mapBgColorRef: { current: any }
  mapBorderColorRef: { current: any }
  mapBorderEnabledRef: { current: any }
  mapBorderWidthRef: { current: any }
  mapImageElementRef: { current: any }
  mapImageOpacityRef: { current: any }
  mapImageTransformRef: { current: any }
  mapOverlayRef: { current: any }
  mapStyleRef: { current: any }
  megaHexColorRef: { current: any }
  megaHexEnabledRef: { current: any }
  megaHexLineWidthRef: { current: any }
  megaHexOpacityRef: { current: any }
  megaHexOriginQRef: { current: any }
  megaHexOriginRRef: { current: any }
  megaHexRadiusRef: { current: any }
  metaRef: { current: any }
  mountainsColorRef: { current: any }
  oceanWaterKeysRef: { current: any }
  osmRiverWaysRef: { current: any }
  pageGridRef: { current: any }
  paintHoverTargetRef: { current: any }
  panRef: { current: any }
  patternCacheRef: { current: any }
  placedIconsRef: { current: any }
  placedLabelsRef: { current: any }
  projectedHexesRef: { current: any }
  railBaseDataRef: { current: any }
  railControlOverridesRef: { current: any }
  railEdgesRef: { current: any }
  railGeomOverrideRef: { current: any }
  railHopPropsRef: { current: any }
  railNodeEditModeRef: { current: any }
  railPathSmoothingRef: { current: any }
  railSegmentPropsRef: { current: any }
  railSmoothingRef: { current: any }
  railStyleRef: { current: any }
  railWiggleAmpRef: { current: any }
  railWiggleFreqRef: { current: any }
  rawCoastlineBoundaryRef: { current: any }
  rawRoadWaysRef: { current: any }
  realisticCoastlineRef: { current: any }
  reliefShadingOpacityRef: { current: any }
  resolvedLabelSpecsRef: { current: any }
  riverChainOverridesRef: { current: any }
  riverChainsV2Ref: { current: any }
  riverEdgesRef: { current: any }
  riverHopPropsRef: { current: any }
  riverNodeEditModeRef: { current: any }
  riverPathSmoothingRef: { current: any }
  riverSegmentPropsRef: { current: any }
  riverSmoothingRef: { current: any }
  riverStyleRef: { current: any }
  riverTierStylesRef: { current: any }
  riverWiggleAmpRef: { current: any }
  riverWiggleFreqRef: { current: any }
  roadCenterPullRef: { current: any }
  roadChainOverridesRef: { current: any }
  roadControlOverridesRef: { current: any }
  roadEdgesRef: { current: any }
  roadHopPropsRef: { current: any }
  roadNetworkRef: { current: any }
  roadNodeEditModeRef: { current: any }
  roadPathSmoothingRef: { current: any }
  roadProjectionCacheRef: { current: any }
  roadSegmentPropsRef: { current: any }
  roadSmoothingRef: { current: any }
  roadTierGeometryRef: { current: any }
  roadTierStylesRef: { current: any }
  roadWiggleAmpRef: { current: any }
  roadWiggleFreqRef: { current: any }
  roadsRebuildCountRef: { current: any }
  screenPwRef: { current: any }
  selectedHopKeyRef: { current: any }
  selectedSegmentKeysRef: { current: any }
  settlementTierStylesRef: { current: any }
  settlementsRef: { current: any }
  showElevationClassOverlayRef: { current: any }
  showElevationDebugRef: { current: any }
  showRawOsmRoadsRef: { current: any }
  showRiverLabelsRef: { current: any }
  showWorldcoverOverlayRef: { current: any }
  skipExpensiveLayersRef: { current: any }
  smoothedCoastlineBoundaryRef: { current: any }
  smoothedRailDataRef: { current: any }
  snapPreviewRef: { current: any }
  strokeTrailRef: { current: any }
  terrainBackgroundPaintEnabledRef: { current: any }
  terrainBlobBumpRef: { current: any }
  terrainBlobEffectRef: { current: any }
  terrainBlobLobeAmpRef: { current: any }
  terrainBlobLobeDirectionRef: { current: any }
  terrainBlobLobeFreqRef: { current: any }
  terrainBlobLobeThresholdRef: { current: any }
  terrainBlobOffsetRef: { current: any }
  terrainBlobOutlineColorRef: { current: any }
  terrainBlobOutlineEnabledRef: { current: any }
  terrainBlobOutlineWidthRef: { current: any }
  terrainBlobOverridesRef: { current: any }
  terrainBlobSmoothRef: { current: any }
  terrainBlobSweepFreqRef: { current: any }
  terrainBlobTopoStyleRef: { current: any }
  terrainColorsRef: { current: any }
  terrainPaintBrushRef: { current: any }
  terrainPaintModeRef: { current: any }
  terrainTextureBlendModesRef: { current: any }
  terrainTextureEnabledRef: { current: any }
  terrainTextureFileRef: { current: any }
  terrainTextureOpacitiesRef: { current: any }
  terrainTextureScalesRef: { current: any }
  terrainTextureTintColorsRef: { current: any }
  terrainTextureTintOpacitiesRef: { current: any }
  terrainTypeBlobStylesRef: { current: any }
  textureCacheRef: { current: any }
  urbanHexesRef: { current: any }
  urbanStyleRef: { current: any }
  waterOverridesRef: { current: any }
  worldcoverImageElementRef: { current: any }
  zoomRef: { current: any }
  getPaperRef: { current: any }
  surroundColorRef: { current: any }
  edgeDragRef: { current: { mode: 'add' | 'remove'; painted: Set<string>; pendingRiverToggles: Array<[number, number, number, number]> } | null }
}

export function drawMap(refs: MapRefs, exportTarget?: ExportTarget): void {
  const {
    activeBlobEditIdRef, activeIconOverlayIdRef, activeToolRef, appliedOsmRiverIndicesRef, autoDisabledOceanHexKeysRef, beachColorRef, beachStripRef, beachWidthRef,
    bgPaintHoldRef, blobComponentsByTerrainRef, blobComponentsRef, blobDragLiveRef, blobEditModeRef, blobHandleDataRef, blobHandleOverridesRef, blobMaskDrawingRef,
    blobMaskStrokeRef, bridgeOverridesRef, bridgeStyleRef, bridgeTiersRef, bridgesEnabledRef, cachedRiverChainDataRef, cachedRiverTierChainDataRef, canvasRef,
    clipToHexGridRef, coastlineDebugRawRef, contourCanvasRef, contourDisabledElevClassesSetRef, contourDisabledTerrainsSetRef, customTerrainsRef, dataSourceRef, defaultBackgroundBlobsRef,
    defaultElevationBlobsRef, defaultTerrainBlobsMaskedRef, defaultWaterBlobsRef, detectedBridgesRef, disabledHexKeysRef, dragLiveDensePosRef, dragLiveOverrideRef, draggingCpKeyRef,
    draggingCpKindRef, draggingDensePtRef, draggingLabelRef, drawOsmHighlightRef, drawPerfRef, edgeBlobOverridesRef, edgeBlobPaintedRef, edgeBlobWidthRef,
    editingLabelRef, elevationPaintBrushRef, elevationPaintModeRef, elevationTypeBlobStylesRef, excludedHexKeysRef, frameDimsRef, hexBorderColorRef, hexBorderDifferenceRef,
    hexBorderModeRef, hexBorderOpacityRef, hexBuildingGeoCacheRef, hexEdgeModeRef, hexIdxRef, hexNumberColorRef, hexNumberEdgeRef, hexNumberFontScaleRef,
    hexNumberMapRef, hexNumbersEnabledRef, hexRadiusRef, hexVertMapRef, hexesRef, highlightEdgePathsRef, highlightLinesRef, highlightedHexesRef,
    highlightsRef, hillsColorRef, hillshadeCanvasRef, hillshadeDisabledElevClassesSetRef, hillshadeDisabledTerrainsSetRef, hillshadeEnabledRef, historicalIconParamsRef, historicalIconSetsRef,
    hoveredBlobCkRef, hoveredChainRef, hoveredEdgeHandleRef, hoveredEdgeRef, hoveredHandleIdxRef, hoveredLabelIdRef, hoveredVertexHandleRef, iconOverlaysRef,
    iconPlaceModeRef, iconSnapRef, isPaintingRef, labelBBoxCacheRef, labelDragStateRef, labelOffsetsRef, labelOverlaysRef, labelSnapRef,
    lastBuildingCacheEpochRef, liveLabelOffsetRef, mapBgColorRef, mapBorderColorRef, mapBorderEnabledRef, mapBorderWidthRef, mapImageElementRef, mapImageOpacityRef,
    mapImageTransformRef, mapOverlayRef, mapStyleRef, megaHexColorRef, megaHexEnabledRef, megaHexLineWidthRef, megaHexOpacityRef, megaHexOriginQRef,
    megaHexOriginRRef, megaHexRadiusRef, metaRef, mountainsColorRef, oceanWaterKeysRef, osmRiverWaysRef, pageGridRef, paintHoverTargetRef,
    panRef, patternCacheRef, placedIconsRef, placedLabelsRef, projectedHexesRef, railBaseDataRef, railControlOverridesRef, railEdgesRef,
    railGeomOverrideRef, railHopPropsRef, railNodeEditModeRef, railPathSmoothingRef, railSegmentPropsRef, railSmoothingRef, railStyleRef, railWiggleAmpRef,
    railWiggleFreqRef, rawCoastlineBoundaryRef, rawRoadWaysRef, realisticCoastlineRef, reliefShadingOpacityRef, resolvedLabelSpecsRef, riverChainOverridesRef, riverChainsV2Ref,
    riverEdgesRef, riverHopPropsRef, riverNodeEditModeRef, riverPathSmoothingRef, riverSegmentPropsRef, riverSmoothingRef, riverStyleRef, riverTierStylesRef,
    riverWiggleAmpRef, riverWiggleFreqRef, roadCenterPullRef, roadChainOverridesRef, roadControlOverridesRef, roadEdgesRef, roadHopPropsRef, roadNetworkRef,
    roadNodeEditModeRef, roadPathSmoothingRef, roadProjectionCacheRef, roadSegmentPropsRef, roadSmoothingRef, roadTierGeometryRef, roadTierStylesRef, roadWiggleAmpRef,
    roadWiggleFreqRef, roadsRebuildCountRef, screenPwRef, selectedHopKeyRef, selectedSegmentKeysRef, settlementTierStylesRef, settlementsRef, showElevationClassOverlayRef,
    showElevationDebugRef, showRawOsmRoadsRef, showRiverLabelsRef, showWorldcoverOverlayRef, skipExpensiveLayersRef, smoothedCoastlineBoundaryRef, smoothedRailDataRef, snapPreviewRef,
    strokeTrailRef, terrainBackgroundPaintEnabledRef, terrainBlobBumpRef, terrainBlobEffectRef, terrainBlobLobeAmpRef, terrainBlobLobeDirectionRef, terrainBlobLobeFreqRef, terrainBlobLobeThresholdRef,
    terrainBlobOffsetRef, terrainBlobOutlineColorRef, terrainBlobOutlineEnabledRef, terrainBlobOutlineWidthRef, terrainBlobOverridesRef, terrainBlobSmoothRef, terrainBlobSweepFreqRef, terrainBlobTopoStyleRef,
    terrainColorsRef, terrainPaintBrushRef, terrainPaintModeRef, terrainTextureBlendModesRef, terrainTextureEnabledRef, terrainTextureFileRef, terrainTextureOpacitiesRef, terrainTextureScalesRef,
    terrainTextureTintColorsRef, terrainTextureTintOpacitiesRef, terrainTypeBlobStylesRef, textureCacheRef, urbanHexesRef, urbanStyleRef, waterOverridesRef, worldcoverImageElementRef,
    zoomRef, getPaperRef, surroundColorRef,
    edgeDragRef,
  } = refs
  const getPaper = getPaperRef.current
  const surroundColor = surroundColorRef.current

  const _t0 = performance.now()
  const _dirtySnap = {
    rivers: riversController.lastRebuilt,
    bridges: detectedBridgesRef.current.length > 0,
  }
  const canvas = exportTarget ? exportTarget.canvas : canvasRef.current
  const meta = metaRef.current
  const hexes = hexesRef.current
  const { w: frameCssW, h: frameCssH } = frameDimsRef.current
  if (!canvas || !meta || (!exportTarget && frameCssW === 0) || hexes.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Reset bbox cache so it's freshly populated by this draw pass
  if (!exportTarget) labelBBoxCacheRef.current = {}

  // When a label is live-dragged, force the appropriate layer to rebuild.
  // Settlement and river labels use an overlay so only one label redraws per frame instead of the whole layer.
  const live = liveLabelOffsetRef.current
  const liveIsSettlement = !exportTarget && !!live?.id.startsWith('settlement:')
  const liveIsRiver = !exportTarget && !!live?.id.startsWith('river:')
  if (!exportTarget && live) {
    if (liveIsRiver) {
      // First frame of drag: rebuild base layer once with the label excluded, then stay cached.
      if (!activeEditOverlay.isActive) riversController.markDirty()
    } else if (liveIsSettlement) {
      // First frame of drag: rebuild base layer once with the label excluded, then stay cached.
      if (!activeEditOverlay.isActive) settlementsController.markDirty()
    }
  }
  // Drag ended — fold overlay back into normal rendering
  if (!exportTarget && activeEditOverlay.isActive && !liveIsSettlement && !liveIsRiver) {
    settlementsController.markDirty()
    riversController.markDirty()
    activeEditOverlay.end()
  }

  const getPattern = (img: HTMLImageElement): CanvasPattern | null => {
    const cache = patternCacheRef.current
    let pat = cache.get(img)
    if (!pat) {
      pat = ctx.createPattern(img, 'repeat') ?? undefined
      if (pat) cache.set(img, pat)
    }
    return pat ?? null
  }

  const isExport = !!exportTarget
  const dpr = isExport ? 1 : (window.devicePixelRatio || 1)
  const zoom = isExport ? 1 : zoomRef.current
  // Offscreen layers at native Retina resolution (dpr²). Each blit is a GPU→GPU copy so
  // scale doesn't hurt frame time. At zoom ≤ dpr the blit is 1:1 or better; beyond that
  // it stretches by zoom/dpr — crisp up to zoom=2 on Retina, acceptable above.
  const offZoom = isExport ? 1 : dpr
  const pan = isExport ? { x: 0, y: 0 } : panRef.current
  const borderMode = hexBorderModeRef.current
  const edgeMode = hexEdgeModeRef.current
  const excludedSet = new Set(excludedHexKeysRef.current)
  const disabledSet = new Set(disabledHexKeysRef.current)
  const autoDisabledSet = new Set(autoDisabledOceanHexKeysRef.current)
  const bordersExcludedSet = (disabledSet.size > 0 || autoDisabledSet.size > 0)
    ? new Set([...excludedSet, ...disabledSet, ...autoDisabledSet])
    : excludedSet
  const { pw, ph, px, py } = exportTarget
    ? { pw: exportTarget.pw, ph: exportTarget.ph, px: 0, py: 0 }
    : getPaper(frameCssW, frameCssH)
  if (!isExport) screenPwRef.current = pw
  const lineScale = isExport && screenPwRef.current > 0 ? pw / screenPwRef.current : 1
  const cssW = exportTarget ? pw : frameCssW
  const cssH = exportTarget ? ph : frameCssH

  // Reset to identity, clear
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // DPR base transform
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Surround (outside paper)
  ctx.fillStyle = surroundColor
  ctx.fillRect(0, 0, cssW, cssH)

  // Pan/zoom transform centred on canvas
  ctx.save()
  ctx.translate(cssW / 2 + pan.x, cssH / 2 + pan.y)
  ctx.scale(zoom, zoom)
  ctx.translate(-cssW / 2, -cssH / 2)
  // Shift origin to paper top-left so all subsequent drawing uses paper-local coords
  // (0,0 = paper TL, pw×ph = paper BR). projectedHexes are in paper-local space too.
  ctx.translate(px, py)

  // Paper shadow
  _drawPaperBackground({ ctx, px: 0, py: 0, pw, ph, mapBgColor: mapBgColorRef.current })

  const mmToPx = pw / meta.paper_mm[0]
  const mgPx = meta.margin_mm * mmToPx

  // Full hexes: only draw if all vertices inside margin (paper-local bounds).
  // Partial hexes: draw clipped at the margin boundary.
  const inMargin = (verts: [number, number][]) =>
    verts.every(([x, y]) => x >= mgPx && x <= pw - mgPx && y >= mgPx && y <= ph - mgPx)

  // project returns paper-local coords (px=py=0) consistent with projectedHexes verts.
  const project = (lon: number, lat: number): [number, number] =>
    projectToCanvas(lon, lat, meta, pw, ph, 0, 0)

  const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
  const R = meta.outer_radius_m * scalePxPerM

  const _buildTerrainTextures = () => buildTerrainTextures({
    textureCache: textureCacheRef.current,
    terrainTextureFile: terrainTextureFileRef.current,
    terrainTextureEnabled: terrainTextureEnabledRef.current,
    customTerrains: customTerrainsRef.current,
  })

  // For screen rendering, use memoized projected coords (stable across zoom/pan).
  // For export, recompute with the export-specific paper dimensions.
  const projected = isExport
    ? hexes.map(hex => ({
        hex,
        verts: hex.vertices.map(([lon, lat]) => project(lon, lat) as [number, number]),
      }))
    : projectedHexesRef.current
  // Terrain rendering params — shared by offscreen and export paths
  const terrainParams = {
    projected,
    edgeMode,
    inMargin,
    terrainColors: terrainColorsRef.current,
    terrainTextureScales: terrainTextureScalesRef.current,
    terrainTextureBlendModes: terrainTextureBlendModesRef.current,
    terrainTextureOpacities: terrainTextureOpacitiesRef.current,
    terrainTextureTintColors: terrainTextureTintColorsRef.current,
    terrainTextureTintOpacities: terrainTextureTintOpacitiesRef.current,
    terrainTextures: _buildTerrainTextures(),
    px: 0, py: 0, pw, ph,
    backgroundTerrainBlobs: defaultBackgroundBlobsRef.current,
    defaultTerrainBlobs: defaultTerrainBlobsMaskedRef.current,
    defaultWaterBlobs: defaultWaterBlobsRef.current,
    terrainBlobOverrides: terrainBlobOverridesRef.current,
    waterOverrides: waterOverridesRef.current,
    blobComponents: blobComponentsRef.current,
    blobComponentsByTerrain: blobComponentsByTerrainRef.current,
    terrainBlobParams: {
      smooth: terrainBlobSmoothRef.current, offset: terrainBlobOffsetRef.current,
      bump: terrainBlobBumpRef.current, sweepFreq: terrainBlobSweepFreqRef.current,
      lobeFreq: terrainBlobLobeFreqRef.current, lobeAmp: terrainBlobLobeAmpRef.current,
      lobeThreshold: terrainBlobLobeThresholdRef.current, lobeDirection: terrainBlobLobeDirectionRef.current,
      topoStyle: terrainBlobTopoStyleRef.current,
    },
    terrainBlobOutlineEnabled: terrainBlobOutlineEnabledRef.current,
    terrainBlobOutlineColor: terrainBlobOutlineColorRef.current,
    terrainBlobOutlineWidth: terrainBlobOutlineWidthRef.current,
    terrainBlobEffect: terrainBlobEffectRef.current,
    hexes: hexesRef.current,
    hexTerrainLayers,
    R,
    realisticCoastline: realisticCoastlineRef.current,
    coastlineDebugRaw: coastlineDebugRawRef.current,
    oceanWaterKeys: oceanWaterKeysRef.current,
    beachStrip: beachStripRef.current,
    beachColor: beachColorRef.current,
    beachWidth: beachWidthRef.current,
    elevationBlobs: defaultElevationBlobsRef.current,
    elevationTypeBlobStyles: elevationTypeBlobStylesRef.current,
    hillsColor: terrainColorsRef.current['hills'] ?? hillsColorRef.current,
    mountainsColor: terrainColorsRef.current['mountains'] ?? mountainsColorRef.current,
    elevationTextureScales: terrainTextureScalesRef.current,
    elevationTextureBlendModes: terrainTextureBlendModesRef.current,
    elevationTextureOpacities: terrainTextureOpacitiesRef.current,
    reliefShadingOpacity: reliefShadingOpacityRef.current,
    coastlineBoundaryRings: smoothedCoastlineBoundaryRef.current,
    coastlineRawBoundaryRings: rawCoastlineBoundaryRef.current,
    edgeBlobPainted: edgeBlobPaintedRef.current,
    edgeBlobWidth: edgeBlobWidthRef.current,
    terrainTypeBlobStyles: terrainTypeBlobStylesRef.current,
    edgeBlobOverrides: edgeBlobOverridesRef.current,
    hexVertMap: hexVertMapRef.current,
    mapStyle: mapStyleRef.current,
    historicalIconSets: historicalIconSetsRef.current,
    historicalIconParams: historicalIconParamsRef.current,
    hillshadeCanvas: hillshadeEnabledRef.current ? hillshadeCanvasRef.current : null,
    hillshadeDisabledTerrains: hillshadeDisabledTerrainsSetRef.current,
    hillshadeDisabledElevClasses: hillshadeDisabledElevClassesSetRef.current,
    contourCanvas: contourCanvasRef.current,
    contourDisabledTerrains: contourDisabledTerrainsSetRef.current,
    contourDisabledElevClasses: contourDisabledElevClassesSetRef.current,
  }

  const _tTerrain0 = performance.now()

  // Draw with paper-edge clip active (clips content at paper boundary)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, pw, ph)
  ctx.clip()

  // Per-blit timing — measures time spent in drawImage() for each layer.
  // High blit time with low section-compute time = GPU stall (memory pressure).
  // High compute time with low blit time = expensive algorithm.
  let _blitTerrain = 0, _blitHexBorder = 0, _blitHighlights = 0
  let _blitRivers = 0, _blitBuildings = 0, _blitRoads = 0, _blitSettlements = 0

  // Pre-compute export terrain blobs and params (heavy, export-only)
  {
    const { exportTerrainBlobs, exportWaterBlobs } = isExport
      ? buildExportTerrainBlobs({
          projected,
          terrainBlobOverrides: terrainBlobOverridesRef.current,
          blobComponents: blobComponentsRef.current,
          blobComponentsByTerrain: blobComponentsByTerrainRef.current,
          realisticCoastline: realisticCoastlineRef.current,
          waterOverrides: waterOverridesRef.current,
          terrainTypeBlobStyles: terrainTypeBlobStylesRef.current,
          smooth: terrainBlobSmoothRef.current,
          offset: terrainBlobOffsetRef.current,
          bump: terrainBlobBumpRef.current,
          sweepFreq: terrainBlobSweepFreqRef.current,
          lobeFreq: terrainBlobLobeFreqRef.current,
          lobeAmp: terrainBlobLobeAmpRef.current,
          lobeThreshold: terrainBlobLobeThresholdRef.current,
          lobeDirection: terrainBlobLobeDirectionRef.current,
          R,
        })
      : { exportTerrainBlobs: terrainParams.defaultTerrainBlobs, exportWaterBlobs: terrainParams.defaultWaterBlobs }
    const exportTerrainParams = { ...terrainParams, backgroundTerrainBlobs: defaultBackgroundBlobsRef.current, defaultTerrainBlobs: exportTerrainBlobs, defaultWaterBlobs: exportWaterBlobs }
    const _b0 = performance.now()
    terrainController.draw(ctx, {
      pw, ph, dpr, offZoom, isExport, isPainting: isPaintingRef.current,
      screenParams: terrainParams,
      exportParams: exportTerrainParams,
    } satisfies TerrainInput)
    _blitTerrain = performance.now() - _b0
  }

  if (!isExport && meta) {
    _drawWorldcoverOverlay({
      ctx,
      show: showWorldcoverOverlayRef.current,
      image: worldcoverImageElementRef.current,
      meta,
      pw, ph,
      computeWcBbox: computeWorldcoverBbox,
    })
  }


  // Historical map image overlay — screen only, drawn after terrain so hex borders render on top
  if (!isExport && mapImageElementRef.current) {
    const alignMode = activeToolRef.current.type === 'align-image'
    const peekMode = mapOverlayRef.current && dataSourceRef.current === 'map_image'
    if (alignMode || peekMode) {
      drawMapImageOverlay({
        ctx,
        image: mapImageElementRef.current,
        transform: mapImageTransformRef.current,
        opacity: peekMode ? 1.0 : mapImageOpacityRef.current,
        px: 0, py: 0, pw, ph,
      })
    }
  }

  // Hex borders — offscreen cached (difference mode and export draw directly)
  if (borderMode !== 'none') {
    const _b0 = performance.now()
    hexBorderController.draw(ctx, {
      pw, ph, dpr, offZoom, isExport, lineScale,
      projected, borderMode, edgeMode, inMargin, bordersExcludedSet,
      opacity: hexBorderOpacityRef.current,
      color: hexBorderColorRef.current,
      difference: hexBorderDifferenceRef.current,
    } satisfies HexBorderInput)
    _blitHexBorder = performance.now() - _b0
  }

  // Mega hex grid overlay
  if (megaHexEnabledRef.current) {
    _drawMegaHexGrid(ctx, {
      projected,
      radius: megaHexRadiusRef.current,
      color: megaHexColorRef.current,
      opacity: megaHexOpacityRef.current,
      lineWidth: megaHexLineWidthRef.current,
      lineScale: isExport ? lineScale : 1,
      originQ: megaHexOriginQRef.current,
      originR: megaHexOriginRRef.current,
      edgeMode,
      inMargin,
    })
  }

  // Hex numbers — offscreen cached
  if (hexNumbersEnabledRef.current && hexNumberMapRef.current.size > 0) {
    hexNumbersController.draw(ctx, {
      pw, ph, dpr, offZoom, isExport,
      projected,
      numberMap: hexNumberMapRef.current,
      edgeIndex: hexNumberEdgeRef.current,
      color: hexNumberColorRef.current,
      fontScale: hexNumberFontScaleRef.current,
      hexRefSpec: resolvedLabelSpecsRef.current.hexRef,
      R,
      edgeMode,
      inMargin,
    })
  }

  // Elevation debug overlay — screen only, never exported
  if (!isExport && showElevationDebugRef.current) {
    _drawElevationDebug({ ctx, projected, R })
  }

  // Elevation classification overlay — shown while dragging classification sliders
  if (!isExport && showElevationClassOverlayRef.current) {
    _drawElevationClassOverlay({ ctx, projected, R, liveParams: liveClassParamsRef.current ?? undefined })
  }

  // Hex highlights — offscreen cached (joined highlights + line highlights)
  {
    const _b0 = performance.now()
    highlightsController.draw(ctx, {
      pw, ph, dpr, offZoom, isExport, lineScale,
      highlights: highlightsRef.current,
      highlightedHexes: highlightedHexesRef.current,
      highlightLines: highlightLinesRef.current,
      highlightEdgePaths: highlightEdgePathsRef.current,
      projected, edgeMode, R, project, inMargin,
    } satisfies HighlightsInput)
    _blitHighlights = performance.now() - _b0

    if (!isExport) {
      _drawHoveredEdgePreview({ ctx, hoveredEdge: hoveredEdgeRef.current, projected })
    }
  }

  const _tRivers0 = performance.now()
  // Rivers — offscreen cached
  const lakeProjCenters = projected
    .filter(({ hex }) => hex.terrain === 'water')
    .map(({ verts }) => ({
      px: verts.reduce((s, v) => s + v[0], 0) / 6,
      py: verts.reduce((s, v) => s + v[1], 0) / 6,
    }))

  const riverTierChainData = cachedRiverTierChainDataRef.current
  const riverChainData = cachedRiverChainDataRef.current

  const _dragLive = computeDragLiveData({
    dragLiveOverride: dragLiveOverrideRef.current,
    draggingDensePt: draggingDensePtRef.current,
    dragLiveDensePos: dragLiveDensePosRef.current,
    draggingCpKind: draggingCpKindRef.current,
    roadNetwork: roadNetworkRef.current,
    roadEdges: roadEdgesRef.current,
    hexIdx: hexIdxRef.current as Map<string, { center: [number, number] }>,
    roadControlOverrides: roadControlOverridesRef.current,
    roadChainOverrides: roadChainOverridesRef.current,
    roadWiggleAmp: roadWiggleAmpRef.current,
    roadWiggleFreq: roadWiggleFreqRef.current,
    roadSmoothing: roadSmoothingRef.current,
    roadPathSmoothing: roadPathSmoothingRef.current,
    roadSegmentProps: roadSegmentPropsRef.current,
    roadHopProps: roadHopPropsRef.current,
    roadTierGeometry: roadTierGeometryRef.current,
    roadCenterPull: roadCenterPullRef.current,
    railEdges: railEdgesRef.current,
    railControlOverrides: railControlOverridesRef.current,
    railBaseData: railBaseDataRef.current,
    smoothedRailData: smoothedRailDataRef.current,
    railSmoothing: railSmoothingRef.current,
    railPathSmoothing: railPathSmoothingRef.current,
    railWiggleAmp: railWiggleAmpRef.current,
    railWiggleFreq: railWiggleFreqRef.current,
    railSegmentProps: railSegmentPropsRef.current,
    railHopProps: railHopPropsRef.current,
    railGeomOverride: railGeomOverrideRef.current,
    riverEdges: riverEdgesRef.current,
    hexes: hexesRef.current,
    riverChainOverrides: riverChainOverridesRef.current,
    riverWiggleFreq: riverWiggleFreqRef.current,
    riverWiggleAmp: riverWiggleAmpRef.current,
    riverSmoothing: riverSmoothingRef.current,
    riverHopProps: riverHopPropsRef.current,
    riverSegmentProps: riverSegmentPropsRef.current,
    riverPathSmoothing: riverPathSmoothingRef.current,
  })
  const { isDraggingCP, isDraggingRailCP, isDraggingDense, isDraggingRiverDense,
    stableRoadData, liveRoadData, liveRailData } = _dragLive


  const riverParams = {
    riverTierChainData,
    riverChainData,
    riverSegProps: riverSegmentPropsRef.current,
    riverTierStyles: riverTierStylesRef.current,
    riverStyle: riverStyleRef.current,
    selectedRiverKeys: new Set(selectedSegmentKeysRef.current),
    riverBaseHW: 1.4 * lineScale,
    lakeProjCenters,
    smoothPasses: 0,
    wobbleBroad: 0,
    wobbleDetail: 0,
    R,
    riverHopProps: riverHopPropsRef.current,
    selectedHopKey: selectedHopKeyRef.current,
    project,
    showRiverLabels: showRiverLabelsRef.current,
    riverLabelData: showRiverLabelsRef.current
      ? osmRiverWaysRef.current
          .filter((w, i) => w.name && appliedOsmRiverIndicesRef.current.includes(i))
          .map(w => ({ name: w.name, coords: w.coords }))
      : undefined,
    waterLabelSpec: resolvedLabelSpecsRef.current.water,
    labelOffsets: labelOffsetsRef.current,
    liveLabelOffset: liveIsRiver ? undefined : (liveLabelOffsetRef.current ?? undefined),
    labelBBoxOut: labelBBoxCacheRef.current,
    excludeLabelId: liveIsRiver ? live!.id : undefined,
  }

  const liveRiverParams = _dragLive.liveRiverChainOverrides
    ? { ...riverParams, riverChainData: computeLiveRiverChainData(
        _dragLive.liveRiverChainOverrides,
        riverEdgesRef.current, hexesRef.current,
        riverWiggleFreqRef.current, riverWiggleAmpRef.current, riverSmoothingRef.current,
        riverHopPropsRef.current, riverSegmentPropsRef.current, riverPathSmoothingRef.current,
      )}
    : riverParams


  {
    const _b0 = performance.now()
    riversController.draw(ctx, {
      pw, ph, dpr, offZoom, isExport,
      isDraggingLive: isDraggingRiverDense,
      params: liveRiverParams,
    })

    // River label drag overlay — one label redrawn per frame, base layer stays cached
    if (liveIsRiver && live) {
      const riverName = live.id.slice('river:'.length)
      const oCtx = activeEditOverlay.begin(pw, ph, dpr)
      oCtx.save()
      oCtx.beginPath()
      oCtx.rect(0, 0, pw, ph)
      oCtx.clip()
      drawRivers(oCtx, {
        ...liveRiverParams,
        showRiverLabels: true,
        riverLabelData: liveRiverParams.riverLabelData?.filter(w => w.name === riverName),
        liveLabelOffset: live,
        excludeLabelId: undefined,
      })
      oCtx.restore()
      activeEditOverlay.blit(ctx, 0, 0, pw, ph)
    }

    // River edge paint overlay — highlights the current stroke edges over the live-updating chains
    if (!isExport && edgeDragRef.current) {
      const painted = edgeDragRef.current.painted
      const proj = projectedHexesRef.current
      ctx.save()
      ctx.strokeStyle = 'rgba(80,180,255,0.9)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.setLineDash([5, 4])
      for (const key of painted) {
        const [qs, rs, es] = key.split(',')
        const q = Number(qs), r = Number(rs), edgeI = Number(es)
        const entry = proj.find(p => p.hex.q === q && p.hex.r === r)
        if (!entry) continue
        const v0 = entry.verts[edgeI]
        const v1 = entry.verts[(edgeI + 1) % 6]
        ctx.beginPath()
        ctx.moveTo(v0[0], v0[1])
        ctx.lineTo(v1[0], v1[1])
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.restore()
    }

    _blitRivers = performance.now() - _b0
  }

  const _tRoads0 = performance.now()
  const _tRBuildings0 = _tRoads0
  // Urban area buildings + settlement buildings (rendered below roads)
  {
    const { chains: roadChains } = stableRoadData
    const roadStyles = roadTierStylesRef.current

    // Invalidate geometry cache when inputs that affect building layout change
    {
      const currentZoom = Math.round(zoomRef.current * 10)
      const epoch = lastBuildingCacheEpochRef.current
      if (!epoch ||
          epoch.roadData !== stableRoadData ||
          epoch.zoom !== currentZoom ||
          epoch.settlementStyles !== settlementTierStylesRef.current ||
          epoch.urbanStyle !== urbanStyleRef.current) {
        hexBuildingGeoCacheRef.current.clear()
        lastBuildingCacheEpochRef.current = {
          roadData: stableRoadData,
          zoom: currentZoom,
          settlementStyles: settlementTierStylesRef.current,
          urbanStyle: urbanStyleRef.current,
        }
      }
    }


    {
      const _b0 = performance.now()
      buildingsController.draw(ctx, {
        pw, ph, dpr, offZoom, isExport, lineScale,
        skipExpensiveLayers: skipExpensiveLayersRef.current,
        hexes: hexesRef.current,
        urbanHexes: urbanHexesRef.current,
        urbanStyle: urbanStyleRef.current,
        settlements: settlementsRef.current,
        settlementTierStyles: settlementTierStylesRef.current,
        roadChains, roadTierStyles: roadTierStylesRef.current,
        hexBuildingGeoCache: hexBuildingGeoCacheRef.current,
        project,
      } satisfies BuildingsInput)
      _blitBuildings = performance.now() - _b0
    }
  }

  const _tRRoads0 = performance.now()
  const _tRRoads1_afterLiveData = { t: 0 }, _tRRoads2_beforeBlit = { t: 0 }, _tRRoads3_afterBlit = { t: 0 }
  _tRRoads1_afterLiveData.t = performance.now()

  // Road chains + Rail chains — offscreen cached together
  {
    const { chains: roadChains, junctions } = liveRoadData
    const tierStyles = roadTierStylesRef.current

    if (!isExport) {
      const hasRoads = liveRoadData.chains.length > 0 || liveRailData.chains.length > 0
      if (hasRoads) {
        const _proj = computeRoadProjections({
          liveRoadData, liveRailData,
          cache: roadProjectionCacheRef.current,
          pw, ph, project,
          isDraggingCP, isDraggingDense, isDraggingRailCP,
        })
        roadProjectionCacheRef.current = _proj.updatedCache

        const isLiveDrag = isDraggingCP || isDraggingDense || isDraggingRailCP
        const vpad = 50
        const liveViewport = isLiveDrag ? {
          minX: cssW / 2 - (cssW / 2 + pan.x) / zoom - vpad - px,
          maxX: cssW / 2 + (cssW / 2 - pan.x) / zoom + vpad - px,
          minY: cssH / 2 - (cssH / 2 + pan.y) / zoom - vpad - py,
          maxY: cssH / 2 + (cssH / 2 - pan.y) / zoom + vpad - py,
        } : null

        _tRRoads2_beforeBlit.t = performance.now()
        const _b0 = performance.now()
        roadsController.draw(ctx, {
          pw, ph, dpr, offZoom, isExport: false,
          liveViewport, forceMarkDirty: _proj.projCacheMiss,
          roadChains: _proj.roadChainsPx, junctions: _proj.junctionsPx, railChains: _proj.railChainsPx,
          tierStyles, railStyle: railStyleRef.current,
          onRebuilt: () => { roadsRebuildCountRef.current++ },
        } satisfies RoadsInput)
        _blitRoads = performance.now() - _b0
        _tRRoads3_afterBlit.t = performance.now()
      }
    }
    if (isExport) {
      const scaledTierStyles = tierStyles.map(s => ({ ...s, outerW: s.outerW * lineScale })) as [RoadTierStyle, RoadTierStyle, RoadTierStyle]
      const scaledRailStyle = { ...railStyleRef.current, thickness: railStyleRef.current.thickness * lineScale }
      const exportRoadChainsPx = roadChains.map(c => ({ tier: c.tier, chain: c.chain.map(([lon, lat]) => project(lon, lat)) as [number,number][] }))
      const exportJunctionsPx  = junctions.map(j => ({ tier: j.tier, pos: project(j.pos[0], j.pos[1]) as [number,number] }))
      const exportRailChainsPx = liveRailData.chains.map(c => ({
        ...c,
        chain:     c.chain.map(([lon, lat]) => project(lon, lat)) as [number,number][],
        baseChain: c.baseChain?.map(([lon, lat]) => project(lon, lat)) as [number,number][] | undefined,
      }))
      roadsController.draw(ctx, {
        pw, ph, dpr, offZoom, isExport: true,
        liveViewport: null, forceMarkDirty: false,
        roadChains: exportRoadChainsPx, junctions: exportJunctionsPx, railChains: exportRailChainsPx,
        tierStyles: scaledTierStyles, railStyle: scaledRailStyle,
      } satisfies RoadsInput)
    }

    if (!isExport && meta) {
      _drawRawOsmRoadsOverlay({
        ctx,
        show: showRawOsmRoadsRef.current,
        ways: rawRoadWaysRef.current,
        meta,
        pw, ph,
      })
    }

  }

  const _tRBridges0 = performance.now()
  // Bridges — drawn on top of rivers and roads
  if (bridgesEnabledRef.current && detectedBridgesRef.current.length > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, pw, ph)
    ctx.clip()
    _drawBridges({
      ctx,
      bridges: detectedBridgesRef.current,
      tiers: bridgeTiersRef.current,
      overrides: bridgeOverridesRef.current,
      style: bridgeStyleRef.current,
      tierStyles: roadTierStylesRef.current as [RoadTierStyle, RoadTierStyle, RoadTierStyle],
      railStyle: railStyleRef.current,
      lineScale: isExport ? lineScale : 1,
      project,
    })
    ctx.restore()
  }

  // Control point handles (visible when Roads panel active and no paint mode)
  if (roadNodeEditModeRef.current) {
    _drawRoadHandles({
      ctx,
      controlPoints: liveRoadData.controlPoints,
      overrides: roadControlOverridesRef.current,
      zoom: zoomRef.current ?? 1,
      draggingCpKey: draggingCpKeyRef.current,
      hoveredChain: hoveredChainRef.current,
      snapPreview: snapPreviewRef.current,
      liveChains: liveRoadData.chains,
      project,
    })
  }

  // Rail control point handles
  if (railNodeEditModeRef.current) {
    const { controlPoints } = draggingCpKindRef.current === 'rail'
      ? buildRailChains(
          railEdgesRef.current,
          roadEdgesRef.current,
          hexIdxRef.current as Map<string, { center: [number, number] }>,
          new Map(railBaseDataRef.current.controlPoints.filter(cp => cp.key.startsWith('em|')).map(cp => [cp.key, cp.pos] as [string, [number, number]])),
          new Map(railBaseDataRef.current.controlPoints.filter(cp => cp.key.startsWith('ja|')).map(cp => [cp.key.slice(3), cp.pos] as [string, [number, number]])),
          { ...railControlOverridesRef.current, ...dragLiveOverrideRef.current },
          0, 0, railSmoothingRef.current,
        )
      : railBaseDataRef.current
    _drawRailHandles({
      ctx,
      controlPoints,
      overrides: railControlOverridesRef.current,
      zoom: zoomRef.current ?? 1,
      draggingCpKey: draggingCpKeyRef.current,
      hoveredChain: hoveredChainRef.current,
      smoothedChains: smoothedRailDataRef.current.chains,
      project,
    })
  }

  // River node edit handles
  if (riverNodeEditModeRef.current) {
    _drawRiverHandles({
      ctx,
      zoom: zoomRef.current ?? 1,
      allChains: riverChainsV2Ref.current,
      chainOverrides: riverChainOverridesRef.current,
      hoveredChain: hoveredChainRef.current,
      hoveredHandleIdx: hoveredHandleIdxRef.current,
      draggingDensePt: draggingDensePtRef.current,
      dragLiveDensePos: dragLiveDensePosRef.current,
      project,
    })
  }

  if (!isExport) {
    _drawBlobHandleOverlay({
      ctx,
      blobEditMode: blobEditModeRef.current,
      activeBlobEditId: activeBlobEditIdRef.current,
      hoveredBlobCk: hoveredBlobCkRef.current,
      blobHandleData: blobHandleDataRef.current,
      blobDragLive: blobDragLiveRef.current,
      blobHandleOverrides: blobHandleOverridesRef.current,
      hoveredEdgeHandle: hoveredEdgeHandleRef.current,
      hoveredVertexHandle: hoveredVertexHandleRef.current,
      zoom,
    })
    const _blobMaskTool = activeToolRef.current
    _drawBlobMaskPreview({
      ctx,
      blobMaskDrawing: blobMaskDrawingRef.current,
      blobMaskStroke: blobMaskStrokeRef.current,
      toolMode: _blobMaskTool.type === 'blob-mask' ? (_blobMaskTool as { mode: string }).mode : null,
      px, py, zoom,
    })
  }

  const _tRHandles0 = performance.now()
  const _tSettlements0 = _tRHandles0
  // Settlements — offscreen cached
  {
    const _b0 = performance.now()
    const settlementsBase = {
      pw, ph, dpr, offZoom, isExport, scale: lineScale,
      skipExpensiveLayers: skipExpensiveLayersRef.current,
      settlements: settlementsRef.current,
      tierStyles: settlementTierStylesRef.current,
      labelSpecs: resolvedLabelSpecsRef.current,
      roadChains: stableRoadData.chains,
      roadJunctions: stableRoadData.junctions,
      railChains: smoothedRailDataRef.current.chains,
      project,
      hexCenterOf: (q, r) => { const h = hexesRef.current.find(h => h.q === q && h.r === r); return h ? project(h.center[0], h.center[1]) : null },
      hexRadiusPx: hexRadiusRef.current,
      labelOffsets: labelOffsetsRef.current,
      liveLabelOffset: liveIsSettlement ? undefined : (liveLabelOffsetRef.current ?? undefined),
      labelBBoxOut: labelBBoxCacheRef.current,
      excludeLabelId: liveIsSettlement ? live!.id : undefined,
    } satisfies SettlementsInput
    settlementsController.draw(ctx, settlementsBase)

    // Settlement label drag overlay — one label redrawn per frame, base layer stays cached
    if (liveIsSettlement && live) {
      const oCtx = activeEditOverlay.begin(pw, ph, dpr)
      oCtx.save()
      oCtx.beginPath()
      oCtx.rect(0, 0, pw, ph)
      oCtx.clip()
      drawSettlements(oCtx, {
        // Only the one settlement whose label is being dragged
        settlements: settlementsRef.current.filter(s => `settlement:${s.name}` === live.id),
        tierStyles: settlementTierStylesRef.current,
        labelSpecs: resolvedLabelSpecsRef.current,
        roadChains: stableRoadData.chains,
        roadJunctions: stableRoadData.junctions,
        railChains: smoothedRailDataRef.current.chains,
        project,
        hexCenterOf: (q, r) => { const h = hexesRef.current.find(h => h.q === q && h.r === r); return h ? project(h.center[0], h.center[1]) : null },
        hexRadiusPx: hexRadiusRef.current,
        labelOffsets: labelOffsetsRef.current,
        liveLabelOffset: live,
      })
      oCtx.restore()
      activeEditOverlay.blit(ctx, 0, 0, pw, ph)
    }

    _blitSettlements = performance.now() - _b0
  }

  // Icons — drawn on top of all layers
  {
    const snap = !isExport && iconPlaceModeRef.current && iconSnapRef.current
      ? { overlayId: activeIconOverlayIdRef.current!, lon: iconSnapRef.current[0], lat: iconSnapRef.current[1] }
      : undefined
    _drawIcons({ ctx, iconOverlays: iconOverlaysRef.current, placedIcons: placedIconsRef.current, project, R, inMargin, snapPreview: snap, scale: isExport ? lineScale : 1 })
  }

  // Labels — drawn on top of icons
  {
    const tool = activeToolRef.current
    const labelPlaceMode = tool.type === 'label-place'
    const snap = !isExport && labelPlaceMode && labelSnapRef.current
      ? { overlayId: (tool as { id: string }).id, lon: labelSnapRef.current[0], lat: labelSnapRef.current[1] }
      : null
    const el = editingLabelRef.current
    const dl = draggingLabelRef.current
    const dragSnap = dl && labelSnapRef.current
      ? { overlayId: dl.overlayId, index: dl.index, lon: labelSnapRef.current[0], lat: labelSnapRef.current[1] }
      : null
    _drawLabels({
      ctx,
      labelOverlays: labelOverlaysRef.current,
      placedLabels: placedLabelsRef.current,
      project,
      inMargin,
      snapPreview: !dl && !isExport ? snap : null,
      editingLabel: el ? { overlayId: el.overlayId, index: el.index } : null,
      draggingLabel: dragSnap,
      scale: isExport ? lineScale : 1,
    })
  }

  // Cover excluded hexes with background color (on top of all content, inside paper clip)
  if (excludedSet.size > 0) {
    _drawExcludedHexOverlay(ctx, projected, excludedSet, mapBgColorRef.current)
  }

  if (!isExport) {
    _drawElevationPaintOverlay({
      ctx,
      elevationPaintMode: elevationPaintModeRef.current,
      elevationPaintBrush: elevationPaintBrushRef.current,
      strokeTrail: strokeTrailRef.current,
      paintHoverTarget: paintHoverTargetRef.current,
    })
    _drawTerrainPaintOverlay({
      ctx,
      terrainPaintMode: terrainPaintModeRef.current,
      terrainPaintBrush: terrainPaintBrushRef.current,
      strokeTrail: strokeTrailRef.current,
      paintHoverTarget: paintHoverTargetRef.current,
      terrainColors: terrainColorsRef.current,
      terrainBackgroundPaintEnabled: terrainBackgroundPaintEnabledRef.current,
      bgPaintHold: bgPaintHoldRef.current,
      R,
    })
  }


  ctx.restore() // clip

  // Hex grid mask — covers margin area (paper minus hex polygons) with background color
  if (clipToHexGridRef.current && projected.length > 0) {
    _drawHexGridMask(ctx, projected, edgeMode, inMargin, 0, 0, pw, ph, mapBgColorRef.current, excludedSet)
  }

  // Map border — stroke along the outer boundary of the hex grid
  if (mapBorderEnabledRef.current && projected.length > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, pw, ph)
    ctx.clip()
    _drawMapBoundary(ctx, projected, edgeMode, inMargin, mapBorderColorRef.current, mapBorderWidthRef.current, lineScale, excludedSet)
    ctx.restore()
  }

  if (!exportTarget) {
    // Margin indicator + diptych seam (screen only)
    _drawPaperMargin({
      ctx, px: 0, py: 0, pw, ph, mgPx, zoom,
      pageGrid: pageGridRef.current,
    })

    _drawLabelDragHandles({
      ctx,
      active: activeToolRef.current.type === 'label-drag',
      bboxCache: labelBBoxCacheRef.current,
      hoveredLabelId: hoveredLabelIdRef.current,
      draggingLabelId: labelDragStateRef.current?.id ?? null,
      zoom,
    })
  }

  ctx.restore() // pan/zoom
  drawOsmHighlightRef.current?.()
  if (!isExport) {
    const _tEnd = performance.now()
    finalizeDrawFrame({
      t0: _t0, tEnd: _tEnd,
      perfState: drawPerfRef.current,
      rebuiltLayers: [
        terrainController.lastRebuilt     && 'terrain',
        hexBorderController.lastRebuilt   && 'hexBorder',
        riversController.lastRebuilt      && 'rivers',
        buildingsController.lastRebuilt   && 'buildings',
        roadsController.lastRebuilt       && 'roads',
        settlementsController.lastRebuilt && 'settlements',
        highlightsController.lastRebuilt  && 'highlights',
      ].filter(Boolean) as string[],
      dirtySnap: _dirtySnap,
      sectionMs: {
        setup:       _tTerrain0 - _t0,
        terrain:     _tRivers0 - _tTerrain0,
        rivers:      _tRoads0 - _tRivers0,
        roads:       _tSettlements0 - _tRoads0,
        settlements: _tEnd - _tSettlements0,
      },
      blitMs: {
        terrain: _blitTerrain, hexBorder: _blitHexBorder, highlights: _blitHighlights,
        rivers: _blitRivers, buildings: _blitBuildings, roads: _blitRoads, settlements: _blitSettlements,
      },
      roadBreakdown: {
        buildings: _tRRoads0 - _tRBuildings0,
        roads:     _tRBridges0 - _tRRoads0,
        bridges:   _tRHandles0 - _tRBridges0,
        handles:   _tSettlements0 - _tRHandles0,
        liveDataMs: _tRRoads1_afterLiveData.t > 0 ? (_tRRoads1_afterLiveData.t - _tRRoads0).toFixed(1) : '?',
        rebuildMs:  _tRRoads2_beforeBlit.t > 0 ? (_tRRoads2_beforeBlit.t - _tRRoads1_afterLiveData.t).toFixed(1) : '?',
        blitMs:     _tRRoads2_beforeBlit.t > 0 ? (_tRRoads3_afterBlit.t - _tRRoads2_beforeBlit.t).toFixed(1) : '?',
      },
      pw, dpr, offZoom, zoom,
    })
  }
}
