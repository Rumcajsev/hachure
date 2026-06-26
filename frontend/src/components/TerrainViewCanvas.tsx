import { useRef, useEffect, useCallback, useState, useMemo, forwardRef, useImperativeHandle, type CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore, TERRAIN_COLORS, WATER_COLOR, TERRAIN_PRIORITY, hexTerrainLayers, edgeBlobCanonicalKey, WORLDCOVER_CLASSES, validColWidthsForRows, validRowHeightsForCols, cellPaperInfo, type GeneratedHex, type RoadTierStyle, type SettlementTier, type SettlementTierStyle, type BlobMaskEdit } from '../store/mapStore'
import { BlobOverrideFlyout } from './BlobOverrideFlyout'
import { useTheme } from '../context/ThemeContext'
import { hexAdjacent, hexLineBetween, catmullRom, offsetPolyline, pointInPolygon, distToSeg, douglasPeucker, douglasPeuckerClosed, chaikin } from '../lib/geometry'
import { mulberry32, makePermutation } from '../lib/noise'
import { projectToCanvas, unprojectFromCanvas, computePaper, computeWorldcoverBbox } from '../lib/projection'
import { coastalBlobTerrains, bleedPolygon, buildTerrainBlobsV2, buildTerrainBlobTopology, shapeTerrainBlobs, shapeInputPolygon, computeConnectedComponents, applyBlobMaskEdits, cutRawPolysWithCorridors, perturbCorridorsForTerrain, generateBlobSplats, buildExportTerrainBlobs } from '../lib/terrainBlobs'
import type { BlobTopologyEntry } from '../lib/terrainBlobs'
import { findEdgeChains as findEdgeChainsSync } from '../lib/edgeBlobs'
import { riverChainCache, buildRiverChainsV2, type RiverChainCache } from '../lib/riverChains'
import { computeDragLiveData, computeRoadProjections, computeLiveRiverChainData } from '../lib/roadLiveGeometry'

import { drawRivers as _drawRivers } from '../lib/drawRivers'
import { RoadNetwork } from '../lib/roadNetwork'
import { buildRailChains, applyRailWiggle } from '../lib/railChains'
import type { RailBaseData } from '../lib/railChains'

// Stable identity returned when there are no rail edges, so that useMemos depending on
// railBaseData / smoothedRailData don't create new references on every road-paint mouseup.
const EMPTY_RAIL_DATA: RailBaseData = { chains: [], controlPoints: [], interHexDist: 0 }
import { drawHighlights as _drawHighlights, _drawHoveredEdgePreview } from '../lib/drawHighlights'
import { drawIcons as _drawIcons } from '../lib/drawIcons'
import { drawLabels as _drawLabels, getLabelBoxBounds, _drawLabelDragHandles } from '../lib/drawLabels'
import { _drawWorldcoverOverlay, _drawRawOsmRoadsOverlay } from '../lib/drawDebugOverlays'
import { drawRoadsAndRails as _drawRoadsAndRails } from '../lib/drawRoadsRails'

import { drawSettlements as _drawSettlements } from '../lib/drawSettlements'
import { drawAllBuildings as _drawAllBuildings, type BuildingCmd } from '../lib/drawBuildings'
import { drawAllBuildingsV2 as _drawAllBuildingsV2 } from '../lib/drawBuildingsV2'
import { drawMapBoundary as _drawMapBoundary, drawHexGridMask as _drawHexGridMask, drawExcludedHexOverlay as _drawExcludedHexOverlay } from '../lib/drawHexBorders'
import { startLayerDirtySync } from '../render/layerDirtySync'
import { hexBorderController } from '../render/layers/hexBorderLayer'
import type { HexBorderInput } from '../render/layers/hexBorderLayer'
import { highlightsController } from '../render/layers/highlightsLayer'
import type { HighlightsInput } from '../render/layers/highlightsLayer'
import { riversController } from '../render/layers/riversLayer'
import { buildingsController } from '../render/layers/buildingsLayer'
import type { BuildingsInput } from '../render/layers/buildingsLayer'
import { settlementsController } from '../render/layers/settlementsLayer'
import type { SettlementsInput } from '../render/layers/settlementsLayer'
import { hexNumbersController } from '../render/layers/hexNumbersLayer'
import { roadsController } from '../render/layers/roadsLayer'
import type { RoadsInput } from '../render/layers/roadsLayer'
import { terrainController } from '../render/layers/terrainLayer'
import type { TerrainInput } from '../render/layers/terrainLayer'
import { drawOsmHighlight as _drawOsmHighlightFn } from '../render/osmOverlay'
import type { OsmOverlayRefs } from '../render/osmOverlay'
import { attachTerrainPaintHandlers } from '../interaction/tools/terrainPaintTool'
import type { PaintHoverTarget } from '../interaction/tools/terrainPaintTool'
import { attachHexDisableHandlers } from '../interaction/tools/hexDisableTool'
import { attachHexMaskHandlers } from '../interaction/tools/hexMaskTool'
import { attachMegaHexHandlers } from '../interaction/tools/megaHexTool'
import { attachRoadRailPaintHandlers } from '../interaction/tools/roadRailPaintTool'
import { attachControlPointDragHandlers } from '../interaction/tools/controlPointDragTool'
import type { SnapTarget } from '../interaction/tools/controlPointDragTool'
import { attachHighlightLineHandlers } from '../interaction/tools/highlightLineTool'
import { attachBlobHandleHandlers } from '../interaction/tools/blobHandleTool'
import { attachSlopeHandlers } from '../interaction/tools/slopeTool'
import { attachContextMenuHandlers } from '../interaction/tools/contextMenuTool'
import type { CtxItem } from '../interaction/tools/contextMenuTool'
import { handleMouseMove, handleClick, handleMouseDown, handleMouseLeave, handleDoubleClick } from '../interaction/tools/mouseHandlers'
import type { MouseHandlerRefs } from '../interaction/tools/mouseHandlers'
import { drawTerrain as _drawTerrain, getColorTextureCacheStats } from '../lib/drawTerrain'
import { TEXTURE_OPTIONS, TEXTURE_PATHS, DEFAULT_TERRAIN_TEXTURES, buildTerrainTextures } from '../lib/terrainTextures'
import { computeHillshade } from '../lib/drawHillshade'
import { computeContours } from '../lib/drawContours'
import { drawHexNumbers as _drawHexNumbers, buildHexNumberMap } from '../lib/drawHexNumbers'
import { getToolCursor } from '../lib/cursors'
import { detectBridges } from '../lib/detectBridges'
import { drawBridges as _drawBridges } from '../lib/drawBridges'
import { drawMegaHexGrid as _drawMegaHexGrid } from '../lib/drawMegaHexGrid'
import { drawElevationDebug as _drawElevationDebug, drawElevationClassOverlay as _drawElevationClassOverlay } from '../lib/drawElevationDebug'
import { _drawTerrainPaintOverlay, _drawElevationPaintOverlay } from '../lib/drawPaintOverlays'
import { _drawBlobHandleOverlay, _drawBlobMaskPreview } from '../lib/drawBlobHandleOverlay'
import { liveClassParamsRef, requestDraw } from '../lib/liveClassParamsRef'
import { drawMapImageOverlay } from '../lib/drawMapImageOverlay'
import type { BridgePoint } from '../lib/detectBridges'
import { drawRoadHandles as _drawRoadHandles, drawRailHandles as _drawRailHandles, drawRiverHandles as _drawRiverHandles } from '../lib/drawEditHandles'
import { drawPaperBackground as _drawPaperBackground, drawPaperMargin as _drawPaperMargin } from '../lib/drawPaperChrome'
import { shouldSuppressShortcut } from '../lib/keyboard'
import { resolveLabels } from '../lib/labelPresets'
import { finalizeDrawFrame } from '../lib/perfMonitor'
import { drawMap, type MapRefs, type ExportTarget } from '../render/MapRenderer'

const OSM_OVERLAY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}


const EMPTY_CORRIDORS: [number, number][][] = []

function CtxIcon({ type, color }: { type: 'edit' | 'dice' | 'erase'; color: string }) {
  const s: React.CSSProperties = { width: 12, height: 12, flexShrink: 0, display: 'block' }
  if (type === 'edit') return (
    <svg style={s} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5l2.5 2.5L3.5 11H1v-2.5L8 1.5z" />
    </svg>
  )
  if (type === 'dice') return (
    <svg style={s} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="10" height="10" rx="2" />
      <circle cx="4" cy="4" r="0.9" fill={color} stroke="none" />
      <circle cx="8" cy="4" r="0.9" fill={color} stroke="none" />
      <circle cx="6" cy="6" r="0.9" fill={color} stroke="none" />
      <circle cx="4" cy="8" r="0.9" fill={color} stroke="none" />
      <circle cx="8" cy="8" r="0.9" fill={color} stroke="none" />
    </svg>
  )
  return (
    <svg style={s} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
      <path d="M2 10L10 2M2 2l8 8" />
    </svg>
  )
}

export type TerrainViewCanvasHandle = {
  exportBlob: () => Promise<{ blob: Blob; paperMm: [number, number] } | null>
  exportSheets: () => Promise<{ blob: Blob; paperMm: [number, number] }[] | null>
  getPaperRect: () => { pw: number; ph: number; px: number; py: number } | null
  peekStart: () => void
  peekEnd: () => void
  zoomToPhysical: () => void
  captureThumb: () => string | null
}

export const TerrainViewCanvas = forwardRef<TerrainViewCanvasHandle, { surroundColor?: string }>(function TerrainViewCanvas({ surroundColor = '#1a1a2a' }, ref) {
  const t = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const osmOverlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null)
  const textureCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const patternCacheRef = useRef<WeakMap<HTMLImageElement, CanvasPattern>>(new WeakMap())
  const historicalIconSetsRef = useRef<Record<string, HTMLImageElement[]>>({})

  // Offscreen canvas refs for non-terrain layers




  // Cached pixel-space projections of road/rail chains.
  // project() is deterministic for a given viewport (pw/ph/px/py) — no need to re-project
  // on every frame. Invalidated when chain data or paper dims change.
  const roadProjectionCacheRef = useRef<{
    roadData: unknown; railData: unknown
    pw: number; ph: number; px: number; py: number
    roadChainsPx: { tier: 0|1|2; chain: [number,number][]; bbox: { minX: number; maxX: number; minY: number; maxY: number } }[]
    junctionsPx:  { pos: [number,number]; tier: 0|1|2 }[]
    railChainsPx: { chain: [number,number][]; baseChain?: [number,number][]; id?: string; isShared: boolean; isLoop: boolean; hopKeys?: string[]; hopRanges?: [number,number][]; bbox: { minX: number; maxX: number; minY: number; maxY: number } }[]
  } | null>(null)

  // Set true on road-paint mouseup so draw() skips the expensive settlement/building
  // rebuilds on that frame. A RAF in onUp clears the flag and schedules a follow-up draw.
  const skipExpensiveLayersRef = useRef(false)
  const [frameDims, setFrameDims] = useState({ w: 0, h: 0 })
  const frameDimsRef = useRef({ w: 0, h: 0 })
  const basePaperRef = useRef<{pw: number, ph: number} | null>(null)
  const lastFrozenMetaRef = useRef<unknown>(null)

  const rafRef = useRef<number | null>(null)
  const drawPerfRef = useRef({ frames: 0, lastSec: 0, fps: 0 })
  const roadsRebuildCountRef = useRef(0)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panOriginRef = useRef({ x: 0, y: 0 })

  const [roadDataVersion, setRoadDataVersion] = useState(0)
  const [isTerrainPainting, setIsTerrainPainting] = useState(false)
  const [wcTooltip, setWcTooltip] = useState<{ x: number; y: number; label: string } | null>(null)

  const [mapOverlay, setMapOverlay] = useState(false)
  const mapOverlayRef = useRef(false)
  mapOverlayRef.current = mapOverlay
  const [overlayRect, setOverlayRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  // Screen-space paper rect for expand mode overlay (accounts for zoom/pan)
  const [expandPaperRect, setExpandPaperRect] = useState<{ px: number; py: number; pw: number; ph: number } | null>(null)
  const overlayContainerRef = useRef<HTMLDivElement>(null)
  const overlayMapRef = useRef<maplibregl.Map | null>(null)

  const {
    generatedHexes, generatedMetadata,
    hexBorderMode, hexEdgeMode, hexBorderOpacity, hexBorderColor, hexBorderDifference,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump,
    terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
    terrainBlobTopoStyle, terrainBlobClusterSize,
    terrainBlobSplatDensity, terrainBlobSplatSize,
    terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth, terrainBlobEffect,
terrainColors, terrainTextureScales, terrainTextureBlendModes, terrainTextureOpacities,
    terrainTextureTintColors, terrainTextureTintOpacities,
    terrainTextureFile, terrainTextureEnabled,
    terrainPaintMode, terrainPaintBrush, overrideHexTerrain, batchOverrideHexTerrain, batchOverrideHexBackground, resetHexOverride, batchResetHexOverride,
    elevationPaintMode, elevationPaintBrush, overrideHexElevation, batchOverrideHexElevation,
    elevationTypeBlobStyles,
    terrainLayersEnabled,
    roadEdges, railEdges, rawRoadWays, rawRailWays, roadTierStyles, railStyle,
    showRawOsmRoads, osmHighlightTier, osmHighlightType, osmSpotlightMode, osmSpotlightRadius, osmSpotlightTiers,
    osmRailHexPaths, osmRailHighlight,
    osmRiverWays, hoveredOsmRiverIdx, appliedOsmRiverIndices,
    roadPaintMode, roadPaintBrush, roadPaintEraser,
    railPaintMode, railPaintEraser,
    railNodeEditMode,
    railControlOverrides, setRailControlOverride, deleteRailControlOverride,
    railSnapBindings, setRailSnapBinding, deleteRailSnapBinding,
    railWiggleAmp, railWiggleFreq, railSmoothing, railPathSmoothing, railGeomOverride, railWiggleDragging,
    railChainOverrides, setRailChainOverride,
    railSelectMode, selectedRailSegmentKeys, selectedRailHopKey,
    setSelectedRailSegmentKeys, toggleRailSegmentSelection, setSelectedRailHopKey,
    setRailSegmentProp, clearRailSegmentProp, setRailHopProp, clearRailHopProp,
    railSegmentProps, railHopProps,
    addRoadEdge, removeRoadHexEdges, removeRoadEdgeAllTiers, batchAddRoadEdges, batchRemoveRoadEdges,
    addRailEdge, removeRailEdge, removeRailHexEdges, batchAddRailEdges, batchRemoveRailEdges,
    activePanel,
    roadControlOverrides, setRoadControlOverride, deleteRoadControlOverride,
    roadSnapBindings, setRoadSnapBinding, deleteRoadSnapBinding,
    roadNodeEditMode,
    roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing, roadCenterPull, roadTierGeometry, roadDensityMinChain, roadWiggleDragging,
    roadBlobCutEnabled, roadBlobCutWidth, roadBlobCutRoughness,
    setRoadBlobCutEnabled, setRoadBlobCutWidth, setRoadBlobCutRoughness,
    roadChainOverrides, setRoadChainOverride,
    riverEdges,
    riverEditMode, toggleRiverEdge, batchToggleRiverEdges,
    riverNodeEditMode, riverChainOverrides, setRiverChainOverride,
    riverHopProps, selectedHopKey, setRiverHopProp, setSelectedHopKey,
    roadSelectMode, selectedRoadSegmentKeys, selectedRoadHopKey,
    setRoadSelectMode, setSelectedRoadSegmentKeys, toggleRoadSegmentSelection,
    setRoadSegmentProp, clearRoadSegmentProp, setRoadHopProp, clearRoadHopProp, setSelectedRoadHopKey,
    roadSegmentProps, roadHopProps,
    showRiverLabels, riverLabelColor,
    riverSegmentProps,
    setRiverSegmentProp, clearRiverSegmentProp,
    riverSelectMode,
    selectedSegmentKeys,
    setSelectedSegmentKeys, toggleSegmentSelection,
    riverTierStyles, riverStyle,
    riverWidthScale,
    riverWiggleFreq, riverWiggleAmp, riverSmoothing, riverPathSmoothing,
    riverBlobCutEnabled, riverBlobCutWidth, riverBlobCutRoughness,
    terrainBlobOverrides, setTerrainBlobOverride,
    terrainTypeBlobStyles,
    waterOverrides, setWaterOverride,
    edgeBlobPainted,
    paintEdgeBlob, eraseEdgeBlob,
    slopeEdges, setSlopeEdge, removeSlopeEdge, slopeStyle, slopeSmoothing, slopeTickSpacing, slopeTickLength,
    elevationHachureEnabled,
    elevationShadowEnabled, elevationShadowOx, elevationShadowOy, elevationShadowBl, elevationShadowOp, elevationShadowPs, elevationShadowColor,
    terrainEdgePaintEnabled,
    terrainBackgroundPaintEnabled, overrideHexBackground,
    customTerrains,
    edgeBlobWidth, edgeBlobOverrides, setEdgeBlobOverride,
    realisticCoastline, coastlineDebugRaw,
    beachStrip, beachColor, beachWidth,
    hillsColor, mountainsColor, reliefShadingOpacity,
    heightmapUrl, heightmapMeta,
    hillshadeEnabled,
    hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity, hillshadeMode,
    hillshadeDisabledTerrains, hillshadeDisabledElevClasses,
    setHillshadeAzimuth, setHillshadeAltitude, setHillshadeIntensity,
    contoursEnabled, contourInterval, contourBaseElevation, contourSmoothPasses, contourLineWidth,
    contourIndexEvery, contourIndexWidthMult, contourColor, contourOpacity,
    contourDisabledTerrains, contourDisabledElevClasses,
    coastlineDPEpsilon, coastlineChaikinPasses,
    terrainRenderMode,
    settlements, settlementTierStyles, settlementPlaceTier, addSettlement, placeSettlementAtHex,
    labelPresetId, labelOverrides,
    settlementMoveIndex, setSettlementMoveIndex, updateSettlement, deleteSettlement,
    urbanHexes, urbanStyle, urbanPaintMode, toggleUrbanHex,
    highlights, highlightedHexes, highlightLines, highlightEdgePaths,
    activeHighlightId, highlightPaintMode, highlightLineEraser,
    setHexHighlight, clearHexHighlight, startNewLineSegment, appendHexToLine, removeLastHexFromLine, truncateHighlightLine,
    eraseHexFromLine,
    setHighlightEdgePath,
    iconOverlays, placedIcons, activeIconOverlayId, iconPlaceMode,
    placeIcon, removeIconAt,
    labelOverlays, placedLabels, activeLabelOverlayId,
    placeLabel, removeLabelAt, updateLabelText, moveLabelTo,
    showElevationDebug,
    elevationImportEnabled,
    classificationParams,
    elevationOverridesTerrain,
    showElevationClassOverlay,
    activeTool,
    setActiveTool,
    pageGrid, paperSize, orientation,
    hexOrientation,
    hexNumbersEnabled, hexNumberStartCorner, hexNumberEdge, hexNumberColor, hexNumberFontScale,
    mapStyle,
    historicalIconParams,
    mapBgColor, mapBorderEnabled, mapBorderColor, mapBorderWidth, clipToHexGrid,
    excludedHexKeys, toggleExcludedHex, resetExcludedHexes,
    disabledHexKeys, toggleDisabledHex, autoDisableOceanHexes,
    autoDisabledOceanHexKeys, setAutoDisabledOceanHexKeys,
    bridgesEnabled, bridgeStyle, bridgeLengthScale, bridgeTiers, bridgeOverrides, setBridgeOverride, clearBridgeOverride,
    megaHexEnabled, megaHexRadius, megaHexColor, megaHexOpacity, megaHexLineWidth,
    megaHexOriginQ, megaHexOriginR, setMegaHexOrigin,
    mapImageDataUrl, mapImageTransform, mapImageOpacity, setMapImageTransform,
    dataSource,
    blobSeeds, randomizeBlobSeed,
    blobEditMode, setBlobEditMode, activeBlobEditId, setActiveBlobEditId,
    blobHandleOverrides, setBlobHandleOverride,
    blobMaskEdits, addBlobMaskEdit, removeBlobMaskEdit, clearBlobMaskEdits,
    labelOffsets, setLabelOffset, clearLabelOffset, clearAllLabelOffsets,
    worldcoverImageUrl, showWorldcoverOverlay,
    expandMode, setExpandMode, expandMap, expandFetchSteps,
  } = useMapStore()
  // dev-only: expose store for dry-run console injection
  useEffect(() => { (window as any).__mapStore = useMapStore }, [])
  // Layer dirty rules — each layer owns its dep list in its own file
  useEffect(() => startLayerDirtySync(), [])

  const pageGridRef = useRef(pageGrid)
  const paperSizeRef = useRef(paperSize)
  const orientationRef = useRef(orientation)
  const hexesRef = useRef(generatedHexes)
  const metaRef = useRef(generatedMetadata)
  const hexBorderModeRef = useRef(hexBorderMode)
  const hexEdgeModeRef = useRef(hexEdgeMode)
  const hexBorderOpacityRef = useRef(hexBorderOpacity)
  const hexBorderColorRef = useRef(hexBorderColor)
  const hexBorderDifferenceRef = useRef(hexBorderDifference)
  const terrainPaintModeRef = useRef(terrainPaintMode)
  const terrainPaintBrushRef = useRef(terrainPaintBrush)
  const overrideHexTerrainRef = useRef(overrideHexTerrain)
  const elevationPaintModeRef = useRef(elevationPaintMode)
  const elevationPaintBrushRef = useRef(elevationPaintBrush)
  const overrideHexElevationRef = useRef(overrideHexElevation)
  const terrainEdgePaintEnabledRef = useRef(terrainEdgePaintEnabled)
  const terrainBackgroundPaintEnabledRef = useRef(terrainBackgroundPaintEnabled)
  const edgePaintHoldRef = useRef(false)
  const bgPaintHoldRef = useRef(false)
  const overrideHexBackgroundRef = useRef(overrideHexBackground)
  const elevationHachureEnabledRef = useRef(elevationHachureEnabled)
  const elevationShadowEnabledRef = useRef(elevationShadowEnabled)
  const elevationShadowOxRef = useRef(elevationShadowOx)
  const elevationShadowOyRef = useRef(elevationShadowOy)
  const elevationShadowBlRef = useRef(elevationShadowBl)
  const elevationShadowOpRef = useRef(elevationShadowOp)
  const elevationShadowPsRef = useRef(elevationShadowPs)
  const elevationShadowColorRef = useRef(elevationShadowColor)
  const slopeEdgesRef = useRef(slopeEdges)
  const slopeStyleRef = useRef(slopeStyle)
  const slopeSmoothingRef = useRef(slopeSmoothing)
  const slopeTickSpacingRef = useRef(slopeTickSpacing)
  const slopeTickLengthRef = useRef(slopeTickLength)
  const slopeModeRef = useRef(false)
  const slopeHoverTargetRef = useRef<import('../lib/drawSlopes').SlopeHoverTarget>(null)
  const setSlopeEdgeRef = useRef(setSlopeEdge)
  const removeSlopeEdgeRef = useRef(removeSlopeEdge)
  const batchSetSlopeEdgesRef = useRef(useMapStore.getState().batchSetSlopeEdges)
  const batchRemoveSlopeEdgesRef = useRef(useMapStore.getState().batchRemoveSlopeEdges)
  const paintEdgeBlobRef = useRef(paintEdgeBlob)
  const eraseEdgeBlobRef = useRef(eraseEdgeBlob)
  const edgeBlobPaintedRef = useRef(edgeBlobPainted)
  const edgeBlobOverridesRef = useRef(edgeBlobOverrides)
  const customTerrainsRef = useRef(customTerrains)
  const edgeBlobWidthRef = useRef(edgeBlobWidth)
  const roadEdgesRef = useRef(roadEdges)
  const railEdgesRef = useRef(railEdges)
  const rawRoadWaysRef = useRef(rawRoadWays)
  const rawRailWaysRef = useRef(rawRailWays)
  const showRawOsmRoadsRef = useRef(showRawOsmRoads)
  const osmHighlightTierRef = useRef(osmHighlightTier)
  const osmHighlightTypeRef = useRef(osmHighlightType)
  const osmSpotlightModeRef = useRef(osmSpotlightMode)
  const osmSpotlightRadiusRef = useRef(osmSpotlightRadius)
  const osmSpotlightTiersRef = useRef(osmSpotlightTiers)
  const osmRailHexPathsRef = useRef(osmRailHexPaths)
  const osmRailHighlightRef = useRef(osmRailHighlight)
  const osmRiverWaysRef = useRef(osmRiverWays)
  const appliedOsmRiverIndicesRef = useRef(appliedOsmRiverIndices)
  const hoveredOsmRiverIdxRef = useRef(hoveredOsmRiverIdx)
  const labelOffsetsRef = useRef(labelOffsets)
  // Populated each draw pass when either layer rebuilds; used for hit-testing in label-drag mode
  const labelBBoxCacheRef = useRef<Record<string, import('../store/slices/labelOffsetsSlice').LabelBBox>>({})
  // Live offset applied during an in-progress drag (not yet committed to the store)
  const liveLabelOffsetRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  // Drag state: which label is being dragged and where the drag started
  const labelDragStateRef = useRef<{ id: string; startLx: number; startLy: number; startDx: number; startDy: number } | null>(null)
  // ID of the label currently under the cursor in label-drag mode (for hover highlight)
  const hoveredLabelIdRef = useRef<string | null>(null)
  const spotlightCursorRef = useRef<{ lx: number; ly: number } | null>(null)
  const spotlightRafRef = useRef<number | null>(null)
  const roadTierStylesRef = useRef(roadTierStyles)
  const railStyleRef = useRef(railStyle)
  const bridgesEnabledRef = useRef(bridgesEnabled)
  const bridgeStyleRef = useRef(bridgeStyle)
  const bridgeLengthScaleRef = useRef(bridgeLengthScale)
  const bridgeTiersRef = useRef(bridgeTiers)
  const bridgeOverridesRef = useRef(bridgeOverrides)
  const setBridgeOverrideRef = useRef(setBridgeOverride)
  const clearBridgeOverrideRef = useRef(clearBridgeOverride)
  const megaHexEnabledRef = useRef(megaHexEnabled)
  const megaHexRadiusRef = useRef(megaHexRadius)
  const megaHexColorRef = useRef(megaHexColor)
  const megaHexOpacityRef = useRef(megaHexOpacity)
  const megaHexLineWidthRef = useRef(megaHexLineWidth)
  const megaHexOriginQRef = useRef(megaHexOriginQ)
  const megaHexOriginRRef = useRef(megaHexOriginR)
  const setMegaHexOriginRef = useRef(setMegaHexOrigin)
  const detectedBridgesRef = useRef<BridgePoint[]>([])
  const roadPaintModeRef = useRef(roadPaintMode)
  const roadPaintBrushRef = useRef(roadPaintBrush)
  const roadPaintEraserRef = useRef(roadPaintEraser)
  const railPaintModeRef = useRef(railPaintMode)
  const railPaintEraserRef = useRef(railPaintEraser)
  const addRoadEdgeRef = useRef(addRoadEdge)
  const removeRoadHexEdgesRef = useRef(removeRoadHexEdges)
  const removeRoadEdgeAllTiersRef = useRef(removeRoadEdgeAllTiers)
  const batchAddRoadEdgesRef = useRef(batchAddRoadEdges)
  const batchRemoveRoadEdgesRef = useRef(batchRemoveRoadEdges)
  const roadNetworkRef = useRef(new RoadNetwork())
  const paintBufferedAdditionsRef = useRef<{ q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[]>([])
  const paintBufferedRemovalsRef = useRef<{ q1: number; r1: number; q2: number; r2: number }[]>([])
  const railBufferedAdditionsRef = useRef<{ q1: number; r1: number; q2: number; r2: number }[]>([])
  const railBufferedRemovalsRef = useRef<{ q1: number; r1: number; q2: number; r2: number }[]>([])
  const addRailEdgeRef = useRef(addRailEdge)
  const removeRailEdgeRef = useRef(removeRailEdge)
  const batchAddRailEdgesRef = useRef(batchAddRailEdges)
  const batchRemoveRailEdgesRef = useRef(batchRemoveRailEdges)
  const removeRailHexEdgesRef = useRef(removeRailHexEdges)
  const activePanelRef = useRef(activePanel)
  const roadControlOverridesRef = useRef(roadControlOverrides)
  const setRoadControlOverrideRef = useRef(setRoadControlOverride)
  const roadNodeEditModeRef = useRef(roadNodeEditMode)
  const deleteRoadControlOverrideRef = useRef(deleteRoadControlOverride)
  const setRoadSnapBindingRef = useRef(setRoadSnapBinding)
  const deleteRoadSnapBindingRef = useRef(deleteRoadSnapBinding)
  const resetHexOverrideRef = useRef(resetHexOverride)
  const roadWiggleAmpRef = useRef(roadWiggleAmp)
  const roadWiggleFreqRef = useRef(roadWiggleFreq)
  const roadSmoothingRef = useRef(roadSmoothing)
  const roadPathSmoothingRef = useRef(roadPathSmoothing)
  const roadCenterPullRef = useRef(roadCenterPull)
  const roadChainOverridesRef = useRef(roadChainOverrides)
  const setRoadChainOverrideRef = useRef(setRoadChainOverride)
  const { deleteRoadChainOverride } = useMapStore()
  const deleteRoadChainOverrideRef = useRef(deleteRoadChainOverride)
  const { deleteRailChainOverride } = useMapStore()
  const deleteRailChainOverrideRef = useRef(deleteRailChainOverride)
  const railNodeEditModeRef = useRef(railNodeEditMode)
  const railControlOverridesRef = useRef(railControlOverrides)
  const setRailControlOverrideRef = useRef(setRailControlOverride)
  const deleteRailControlOverrideRef = useRef(deleteRailControlOverride)
  const setRailSnapBindingRef = useRef(setRailSnapBinding)
  const deleteRailSnapBindingRef = useRef(deleteRailSnapBinding)
  const railWiggleAmpRef = useRef(railWiggleAmp)
  const railWiggleFreqRef = useRef(railWiggleFreq)
  const railSmoothingRef = useRef(railSmoothing)
  const railPathSmoothingRef = useRef(railPathSmoothing)
  const railGeomOverrideRef = useRef(railGeomOverride)
  const roadTierGeometryRef = useRef(roadTierGeometry)
  const railChainOverridesRef = useRef(railChainOverrides)
  const setRailChainOverrideRef = useRef(setRailChainOverride)
  const railSelectModeRef = useRef(railSelectMode)
  const selectedRailSegmentKeysRef = useRef(selectedRailSegmentKeys)
  const selectedRailHopKeyRef = useRef(selectedRailHopKey)
  const setSelectedRailSegmentKeysRef = useRef(setSelectedRailSegmentKeys)
  const toggleRailSegmentSelectionRef = useRef(toggleRailSegmentSelection)
  const setRailHopPropRef = useRef(setRailHopProp)
  const clearRailHopPropRef = useRef(clearRailHopProp)
  const setSelectedRailHopKeyRef = useRef(setSelectedRailHopKey)
  const railSegmentPropsRef = useRef(railSegmentProps)
  const railHopPropsRef = useRef(railHopProps)
  const draggingCpKindRef = useRef<'road' | 'rail' | null>(null)
  const riverNodeEditModeRef = useRef(riverNodeEditMode)
  const riverChainOverridesRef = useRef(riverChainOverrides)
  const setRiverChainOverrideRef = useRef(setRiverChainOverride)
  const riverChainsV2Ref = useRef<import('../lib/riverChains').RiverChainV2[]>([])
  type ChainEntry = import('../lib/drawRivers').ChainEntry
  const cachedRiverTierChainDataRef = useRef<[ChainEntry[], ChainEntry[], ChainEntry[]]>([[], [], []])
  const cachedRiverChainDataRef = useRef<ChainEntry[]>([])
  // Per-tier chain build cache: skips catmullRom+wiggle for unchanged chains.
  const riverTierChainCaches = useRef<[RiverChainCache, RiverChainCache, RiverChainCache]>([new Map(), new Map(), new Map()])
  // Dense-point hover/drag refs (shared by road node edit and river node edit)
  // handles = sparse edit points (every 5th of the dense catmullRom output)
  const hoveredChainRef = useRef<{ id: string; handles: [number, number][]; kind: 'road' | 'river' | 'rail' } | null>(null)
  const hoveredHandleIdxRef = useRef<number | null>(null)
  const draggingDensePtRef = useRef<{ id: string; handles: [number, number][]; handleIdx: number; kind: 'road' | 'river' } | null>(null)
  const dragLiveDensePosRef = useRef<[number, number] | null>(null)
  const dragLiveOverrideRef = useRef<Record<string, [number, number]>>({})
  const dragRafRef = useRef<number | null>(null)
  const riverEdgesRef = useRef(riverEdges)
  const riverEditModeRef = useRef(riverEditMode)
  const toggleRiverEdgeRef = useRef(toggleRiverEdge)
  const batchToggleRiverEdgesRef = useRef(batchToggleRiverEdges)
  const showRiverLabelsRef = useRef(showRiverLabels)
  const riverLabelColorRef = useRef(riverLabelColor)
  const riverSegmentPropsRef = useRef(riverSegmentProps)
  const riverSelectModeRef = useRef(riverSelectMode)
  const selectedSegmentKeysRef = useRef(selectedSegmentKeys)
  const setSelectedSegmentKeysRef = useRef(setSelectedSegmentKeys)
  const toggleSegmentSelectionRef = useRef(toggleSegmentSelection)
  const riverTierStylesRef = useRef(riverTierStyles)
  const riverStyleRef = useRef(riverStyle)
  const computedRiverChainsRef = useRef<{ vertices: [number,number][]; segKey: string }[]>([])
  const riverWidthScaleRef = useRef(riverWidthScale)
  const riverHopPropsRef = useRef(riverHopProps)
  const selectedHopKeyRef = useRef(selectedHopKey)
  const setRiverHopPropRef = useRef(setRiverHopProp)
  const setSelectedHopKeyRef = useRef(setSelectedHopKey)
  const riverWiggleFreqRef = useRef(riverWiggleFreq)
  const riverWiggleAmpRef = useRef(riverWiggleAmp)
  const riverSmoothingRef = useRef(riverSmoothing)
  const riverPathSmoothingRef = useRef(riverPathSmoothing)
  const setRiverSegmentPropRef = useRef(setRiverSegmentProp)
  const clearRiverSegmentPropRef = useRef(clearRiverSegmentProp)
  const roadSelectModeRef = useRef(roadSelectMode)
  const selectedRoadSegmentKeysRef = useRef(selectedRoadSegmentKeys)
  const selectedRoadHopKeyRef = useRef(selectedRoadHopKey)
  const setRoadSelectModeRef = useRef(setRoadSelectMode)
  const setSelectedRoadSegmentKeysRef = useRef(setSelectedRoadSegmentKeys)
  const toggleRoadSegmentSelectionRef = useRef(toggleRoadSegmentSelection)
  const setRoadHopPropRef = useRef(setRoadHopProp)
  const clearRoadHopPropRef = useRef(clearRoadHopProp)
  const setSelectedRoadHopKeyRef = useRef(setSelectedRoadHopKey)
  const roadSegmentPropsRef = useRef(roadSegmentProps)
  const roadHopPropsRef = useRef(roadHopProps)
  const terrainBlobSmoothRef = useRef(terrainBlobSmooth)
  const terrainBlobOffsetRef = useRef(terrainBlobOffset)
  const terrainBlobBumpRef = useRef(terrainBlobBump)
  const terrainBlobSweepFreqRef = useRef(terrainBlobSweepFreq)
  const terrainBlobLobeFreqRef = useRef(terrainBlobLobeFreq)
  const terrainBlobLobeAmpRef = useRef(terrainBlobLobeAmp)
  const terrainBlobLobeThresholdRef = useRef(terrainBlobLobeThreshold)
  const terrainBlobLobeDirectionRef = useRef(terrainBlobLobeDirection)
  const terrainBlobTopoStyleRef = useRef(terrainBlobTopoStyle)
  const terrainBlobClusterSizeRef = useRef(terrainBlobClusterSize)
  const terrainBlobOutlineEnabledRef = useRef(terrainBlobOutlineEnabled)
  const terrainBlobOutlineColorRef = useRef(terrainBlobOutlineColor)
  const terrainBlobOutlineWidthRef = useRef(terrainBlobOutlineWidth)
  const terrainBlobEffectRef = useRef(terrainBlobEffect)
  const terrainColorsRef = useRef(terrainColors)
  const terrainTextureScalesRef = useRef(terrainTextureScales)
  const terrainTextureBlendModesRef = useRef(terrainTextureBlendModes)
  const terrainTextureOpacitiesRef = useRef(terrainTextureOpacities)
  const terrainTextureTintColorsRef = useRef(terrainTextureTintColors)
  const terrainTextureTintOpacitiesRef = useRef(terrainTextureTintOpacities)
const terrainTextureFileRef = useRef(terrainTextureFile)
  const terrainTextureEnabledRef = useRef(terrainTextureEnabled)
  const terrainBlobOverridesRef = useRef(terrainBlobOverrides)
  const terrainTypeBlobStylesRef = useRef(terrainTypeBlobStyles)
  const waterOverridesRef = useRef(waterOverrides)
  const terrainRenderModeRef = useRef(terrainRenderMode)
  // Field mode refs — detached. Re-add when field render is reactivated.
  // const fieldFreqRef = useRef(fieldFreq)
  // const fieldAmpRef = useRef(fieldAmp)
  // const fieldOctavesRef = useRef(fieldOctaves)
  // const fieldPersistenceRef = useRef(fieldPersistence)
  // const fieldWildnessRef = useRef(fieldWildness)
  // const fieldCanvasRef = useRef<OffscreenCanvas | null>(null)
  const hexBuildingGeoCacheRef = useRef<Map<string, BuildingCmd[]>>(new Map())
  const lastBuildingCacheEpochRef = useRef<{ roadData: unknown; zoom: number; settlementStyles: unknown; urbanStyle: unknown } | null>(null)
  const settlementsRef = useRef(settlements)
  const settlementTierStylesRef = useRef(settlementTierStyles)
  const settlementPlaceTierRef = useRef(settlementPlaceTier)
  const addSettlementRef = useRef(addSettlement)
  const placeSettlementAtHexRef = useRef(placeSettlementAtHex)
  const settlementMoveIndexRef = useRef(settlementMoveIndex)
  const setSettlementMoveIndexRef = useRef(setSettlementMoveIndex)
  const updateSettlementRef = useRef(updateSettlement)
  const deleteSettlementRef = useRef(deleteSettlement)
  const urbanHexesRef = useRef(urbanHexes)
  const urbanStyleRef = useRef(urbanStyle)
  const urbanPaintModeRef = useRef(urbanPaintMode)
  const toggleUrbanHexRef = useRef(toggleUrbanHex)
  const highlightsRef = useRef(highlights)
  const highlightedHexesRef = useRef(highlightedHexes)
  const highlightLinesRef = useRef(highlightLines)
  const highlightEdgePathsRef = useRef(highlightEdgePaths)
  const activeHighlightIdRef = useRef(activeHighlightId)
  const highlightPaintModeRef = useRef(highlightPaintMode)
  const highlightLineEraserRef = useRef(highlightLineEraser)
  const randomizeBlobSeedRef = useRef(randomizeBlobSeed)
  const blobEditModeRef = useRef(blobEditMode)
  const activeBlobEditIdRef = useRef(activeBlobEditId)
  const blobHandleOverridesRef = useRef(blobHandleOverrides)
  const setBlobHandleOverrideRef = useRef(setBlobHandleOverride)
  const setActiveBlobEditIdRef = useRef(setActiveBlobEditId)
  // canonicalKey → { terrain, handles, simplifiedPolys } — updated by blob useMemo
  const blobHandleDataRef = useRef<Map<string, { terrain: string; handles: { edgeKey: string; cx: number; cy: number }[]; simplifiedPolys: [number, number][][] }>>(new Map())
  // Live drag state — 1 entry for vertex drag, 2 for edge drag; committed to Zustand on mouseup
  const blobDragLiveRef = useRef<{ ck: string; handles: { edgeKey: string; cx: number; cy: number; offset: [number, number] }[] } | null>(null)
  // Blob under the cursor (select tool hover)
  const hoveredBlobCkRef = useRef<string | null>(null)
  // Vertex handle under the cursor
  const hoveredVertexHandleRef = useRef<{ ck: string; edgeKey: string } | null>(null)
  // Edge segment under the cursor
  const hoveredEdgeHandleRef = useRef<{ ck: string; v0Key: string; v1Key: string } | null>(null)
  const activeToolRef = useRef(activeTool)
  const setHexHighlightRef = useRef(setHexHighlight)
  const clearHexHighlightRef = useRef(clearHexHighlight)
  const startNewLineSegmentRef = useRef(startNewLineSegment)
  const appendHexToLineRef = useRef(appendHexToLine)
  const removeLastHexFromLineRef = useRef(removeLastHexFromLine)
  const truncateHighlightLineRef = useRef(truncateHighlightLine)
  const eraseHexFromLineRef = useRef(eraseHexFromLine)
  const setHighlightEdgePathRef = useRef(setHighlightEdgePath)
  const hoveredEdgeRef = useRef<{ hexQ: number; hexR: number; edgeI: number } | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const iconOverlaysRef = useRef(iconOverlays)
  const placedIconsRef = useRef(placedIcons)
  const activeIconOverlayIdRef = useRef(activeIconOverlayId)
  const iconPlaceModeRef = useRef(iconPlaceMode)
  const placeIconRef = useRef(placeIcon)
  const removeIconAtRef = useRef(removeIconAt)
  const iconSnapRef = useRef<[number, number] | null>(null)

  const [editingLabel, setEditingLabel] = useState<{
    overlayId: string; index: number; text: string
    screenX: number; screenY: number; width: number; height: number; textSize: number
  } | null>(null)
  const editingLabelRef = useRef(editingLabel)
  const labelOverlaysRef = useRef(labelOverlays)
  const placedLabelsRef = useRef(placedLabels)
  const activeLabelOverlayIdRef = useRef(activeLabelOverlayId)
  const placeLabelRef = useRef(placeLabel)
  const removeLabelAtRef = useRef(removeLabelAt)
  const updateLabelTextRef = useRef(updateLabelText)
  const moveLabelToRef = useRef(moveLabelTo)
  const labelSnapRef = useRef<[number, number] | null>(null)
  const draggingLabelRef = useRef<{ overlayId: string; index: number } | null>(null)

  // Blob mask freehand drawing
  const blobMaskStrokeRef = useRef<[number, number][]>([])
  const blobMaskDrawingRef = useRef(false)
  const addBlobMaskEditRef = useRef(addBlobMaskEdit)
  addBlobMaskEditRef.current = addBlobMaskEdit

  pageGridRef.current = pageGrid
  paperSizeRef.current = paperSize
  orientationRef.current = orientation
  hexesRef.current = generatedHexes
  metaRef.current = generatedMetadata
  hexBorderModeRef.current = hexBorderMode
  hexEdgeModeRef.current = hexEdgeMode
  hexBorderOpacityRef.current = hexBorderOpacity
  hexBorderColorRef.current = hexBorderColor
  hexBorderDifferenceRef.current = hexBorderDifference
  terrainPaintModeRef.current = terrainPaintMode
  terrainPaintBrushRef.current = terrainPaintBrush
  overrideHexTerrainRef.current = overrideHexTerrain
  elevationPaintModeRef.current = elevationPaintMode
  elevationPaintBrushRef.current = elevationPaintBrush
  overrideHexElevationRef.current = overrideHexElevation
  terrainBackgroundPaintEnabledRef.current = terrainBackgroundPaintEnabled
  overrideHexBackgroundRef.current = overrideHexBackground
  roadEdgesRef.current = roadEdges
  railEdgesRef.current = railEdges
  rawRoadWaysRef.current = rawRoadWays
  rawRailWaysRef.current = rawRailWays
  showRawOsmRoadsRef.current = showRawOsmRoads
  osmHighlightTierRef.current = osmHighlightTier
  osmHighlightTypeRef.current = osmHighlightType
  osmSpotlightModeRef.current = osmSpotlightMode
  osmSpotlightRadiusRef.current = osmSpotlightRadius
  osmSpotlightTiersRef.current = osmSpotlightTiers
  osmRailHexPathsRef.current = osmRailHexPaths
  osmRailHighlightRef.current = osmRailHighlight
  osmRiverWaysRef.current = osmRiverWays
  appliedOsmRiverIndicesRef.current = appliedOsmRiverIndices
  hoveredOsmRiverIdxRef.current = hoveredOsmRiverIdx
  labelOffsetsRef.current = labelOffsets
  roadTierStylesRef.current = roadTierStyles
  railStyleRef.current = railStyle
  bridgesEnabledRef.current = bridgesEnabled
  bridgeStyleRef.current = bridgeStyle
  bridgeLengthScaleRef.current = bridgeLengthScale
  bridgeTiersRef.current = bridgeTiers
  bridgeOverridesRef.current = bridgeOverrides
  setBridgeOverrideRef.current = setBridgeOverride
  clearBridgeOverrideRef.current = clearBridgeOverride
  megaHexEnabledRef.current = megaHexEnabled
  megaHexRadiusRef.current = megaHexRadius
  megaHexColorRef.current = megaHexColor
  megaHexOpacityRef.current = megaHexOpacity
  megaHexLineWidthRef.current = megaHexLineWidth
  megaHexOriginQRef.current = megaHexOriginQ
  megaHexOriginRRef.current = megaHexOriginR
  setMegaHexOriginRef.current = setMegaHexOrigin
  roadPaintModeRef.current = roadPaintMode
  roadPaintBrushRef.current = roadPaintBrush
  roadPaintEraserRef.current = roadPaintEraser
  railPaintModeRef.current = railPaintMode
  railPaintEraserRef.current = railPaintEraser
  addRoadEdgeRef.current = addRoadEdge
  removeRoadHexEdgesRef.current = removeRoadHexEdges
  removeRoadEdgeAllTiersRef.current = removeRoadEdgeAllTiers
  batchAddRoadEdgesRef.current = batchAddRoadEdges
  batchRemoveRoadEdgesRef.current = batchRemoveRoadEdges
  addRailEdgeRef.current = addRailEdge
  removeRailEdgeRef.current = removeRailEdge
  batchAddRailEdgesRef.current = batchAddRailEdges
  batchRemoveRailEdgesRef.current = batchRemoveRailEdges
  removeRailHexEdgesRef.current = removeRailHexEdges
  activePanelRef.current = activePanel
  urbanHexesRef.current = urbanHexes
  urbanStyleRef.current = urbanStyle
  urbanPaintModeRef.current = urbanPaintMode
  toggleUrbanHexRef.current = toggleUrbanHex
  highlightsRef.current = highlights
  highlightedHexesRef.current = highlightedHexes
  highlightLinesRef.current = highlightLines
  highlightEdgePathsRef.current = highlightEdgePaths
  activeHighlightIdRef.current = activeHighlightId
  highlightPaintModeRef.current = highlightPaintMode
  highlightLineEraserRef.current = highlightLineEraser
  activeToolRef.current = activeTool
  slopeModeRef.current = activeTool.type === 'slope'
  randomizeBlobSeedRef.current = randomizeBlobSeed
  blobEditModeRef.current = blobEditMode
  activeBlobEditIdRef.current = activeBlobEditId
  blobHandleOverridesRef.current = blobHandleOverrides
  setBlobHandleOverrideRef.current = setBlobHandleOverride
  setActiveBlobEditIdRef.current = setActiveBlobEditId
  setHexHighlightRef.current = setHexHighlight
  clearHexHighlightRef.current = clearHexHighlight
  startNewLineSegmentRef.current = startNewLineSegment
  appendHexToLineRef.current = appendHexToLine
  removeLastHexFromLineRef.current = removeLastHexFromLine
  truncateHighlightLineRef.current = truncateHighlightLine
  eraseHexFromLineRef.current = eraseHexFromLine
  setHighlightEdgePathRef.current = setHighlightEdgePath
  iconOverlaysRef.current = iconOverlays
  placedIconsRef.current = placedIcons
  activeIconOverlayIdRef.current = activeIconOverlayId
  iconPlaceModeRef.current = iconPlaceMode
  placeIconRef.current = placeIcon
  removeIconAtRef.current = removeIconAt
  editingLabelRef.current = editingLabel
  labelOverlaysRef.current = labelOverlays
  placedLabelsRef.current = placedLabels
  activeLabelOverlayIdRef.current = activeLabelOverlayId
  placeLabelRef.current = placeLabel
  removeLabelAtRef.current = removeLabelAt
  updateLabelTextRef.current = updateLabelText
  moveLabelToRef.current = moveLabelTo
  roadControlOverridesRef.current = roadControlOverrides
  setRoadControlOverrideRef.current = setRoadControlOverride
  roadNodeEditModeRef.current = roadNodeEditMode
  deleteRoadControlOverrideRef.current = deleteRoadControlOverride
  setRoadSnapBindingRef.current = setRoadSnapBinding
  deleteRoadSnapBindingRef.current = deleteRoadSnapBinding
  overrideHexTerrainRef.current = overrideHexTerrain
  terrainBackgroundPaintEnabledRef.current = terrainBackgroundPaintEnabled
  overrideHexBackgroundRef.current = overrideHexBackground
  resetHexOverrideRef.current = resetHexOverride
  elevationPaintModeRef.current = elevationPaintMode
  elevationPaintBrushRef.current = elevationPaintBrush
  overrideHexElevationRef.current = overrideHexElevation
  roadWiggleAmpRef.current = roadWiggleAmp
  roadWiggleFreqRef.current = roadWiggleFreq
  roadSmoothingRef.current = roadSmoothing
  roadPathSmoothingRef.current = roadPathSmoothing
  roadCenterPullRef.current = roadCenterPull
  roadChainOverridesRef.current = roadChainOverrides
  setRoadChainOverrideRef.current = setRoadChainOverride
  deleteRoadChainOverrideRef.current = deleteRoadChainOverride
  riverNodeEditModeRef.current = riverNodeEditMode
  riverChainOverridesRef.current = riverChainOverrides
  setRiverChainOverrideRef.current = setRiverChainOverride
  riverEdgesRef.current = riverEdges
  riverEditModeRef.current = riverEditMode
  toggleRiverEdgeRef.current = toggleRiverEdge
  batchToggleRiverEdgesRef.current = batchToggleRiverEdges
  showRiverLabelsRef.current = showRiverLabels
  riverLabelColorRef.current = riverLabelColor
  riverSegmentPropsRef.current = riverSegmentProps
  riverSelectModeRef.current = riverSelectMode
  selectedSegmentKeysRef.current = selectedSegmentKeys
  setSelectedSegmentKeysRef.current = setSelectedSegmentKeys
  toggleSegmentSelectionRef.current = toggleSegmentSelection
  riverTierStylesRef.current = riverTierStyles
  riverStyleRef.current = riverStyle
  riverWidthScaleRef.current = riverWidthScale
  riverHopPropsRef.current = riverHopProps
  selectedHopKeyRef.current = selectedHopKey
  setRiverHopPropRef.current = setRiverHopProp
  setSelectedHopKeyRef.current = setSelectedHopKey
  riverWiggleFreqRef.current = riverWiggleFreq
  riverWiggleAmpRef.current = riverWiggleAmp
  riverSmoothingRef.current = riverSmoothing
  riverPathSmoothingRef.current = riverPathSmoothing
  setRiverSegmentPropRef.current = setRiverSegmentProp
  clearRiverSegmentPropRef.current = clearRiverSegmentProp
  roadSelectModeRef.current = roadSelectMode
  selectedRoadSegmentKeysRef.current = selectedRoadSegmentKeys
  selectedRoadHopKeyRef.current = selectedRoadHopKey
  setRoadSelectModeRef.current = setRoadSelectMode
  setSelectedRoadSegmentKeysRef.current = setSelectedRoadSegmentKeys
  toggleRoadSegmentSelectionRef.current = toggleRoadSegmentSelection
  setRoadHopPropRef.current = setRoadHopProp
  clearRoadHopPropRef.current = clearRoadHopProp
  setSelectedRoadHopKeyRef.current = setSelectedRoadHopKey
  roadSegmentPropsRef.current = roadSegmentProps
  roadHopPropsRef.current = roadHopProps
  railNodeEditModeRef.current = railNodeEditMode
  railControlOverridesRef.current = railControlOverrides
  setRailControlOverrideRef.current = setRailControlOverride
  deleteRailControlOverrideRef.current = deleteRailControlOverride
  setRailSnapBindingRef.current = setRailSnapBinding
  deleteRailSnapBindingRef.current = deleteRailSnapBinding
  railWiggleAmpRef.current = railWiggleAmp
  railWiggleFreqRef.current = railWiggleFreq
  railSmoothingRef.current = railSmoothing
  railPathSmoothingRef.current = railPathSmoothing
  railGeomOverrideRef.current = railGeomOverride
  roadTierGeometryRef.current = roadTierGeometry
  railChainOverridesRef.current = railChainOverrides
  setRailChainOverrideRef.current = setRailChainOverride
  deleteRailChainOverrideRef.current = deleteRailChainOverride
  railSelectModeRef.current = railSelectMode
  selectedRailSegmentKeysRef.current = selectedRailSegmentKeys
  selectedRailHopKeyRef.current = selectedRailHopKey
  setSelectedRailSegmentKeysRef.current = setSelectedRailSegmentKeys
  toggleRailSegmentSelectionRef.current = toggleRailSegmentSelection
  setRailHopPropRef.current = setRailHopProp
  clearRailHopPropRef.current = clearRailHopProp
  setSelectedRailHopKeyRef.current = setSelectedRailHopKey
  railSegmentPropsRef.current = railSegmentProps
  railHopPropsRef.current = railHopProps
  terrainBlobSmoothRef.current = terrainBlobSmooth
  terrainBlobOffsetRef.current = terrainBlobOffset
  terrainBlobBumpRef.current = terrainBlobBump
  terrainBlobSweepFreqRef.current = terrainBlobSweepFreq
  terrainBlobLobeFreqRef.current = terrainBlobLobeFreq
  terrainBlobLobeAmpRef.current = terrainBlobLobeAmp
  terrainBlobLobeThresholdRef.current = terrainBlobLobeThreshold
  terrainBlobLobeDirectionRef.current = terrainBlobLobeDirection
  terrainBlobTopoStyleRef.current = terrainBlobTopoStyle
  terrainBlobClusterSizeRef.current = terrainBlobClusterSize
  terrainBlobOutlineEnabledRef.current = terrainBlobOutlineEnabled
  terrainBlobOutlineColorRef.current = terrainBlobOutlineColor
  terrainBlobOutlineWidthRef.current = terrainBlobOutlineWidth
  terrainBlobEffectRef.current = terrainBlobEffect
  terrainColorsRef.current = terrainColors
  terrainTextureScalesRef.current = terrainTextureScales
  terrainTextureBlendModesRef.current = terrainTextureBlendModes
  terrainTextureOpacitiesRef.current = terrainTextureOpacities
  terrainTextureTintColorsRef.current = terrainTextureTintColors
  terrainTextureTintOpacitiesRef.current = terrainTextureTintOpacities
terrainTextureFileRef.current = terrainTextureFile
  terrainTextureEnabledRef.current = terrainTextureEnabled

  const realisticCoastlineRef = useRef(realisticCoastline)
  realisticCoastlineRef.current = realisticCoastline
  const coastlineDebugRawRef = useRef(coastlineDebugRaw)
  coastlineDebugRawRef.current = coastlineDebugRaw
  const beachStripRef = useRef(beachStrip)
  beachStripRef.current = beachStrip
  const beachColorRef = useRef(beachColor)
  beachColorRef.current = beachColor
  const beachWidthRef = useRef(beachWidth)
  beachWidthRef.current = beachWidth
  const hillsColorRef = useRef(hillsColor)
  hillsColorRef.current = hillsColor
  const mountainsColorRef = useRef(mountainsColor)
  mountainsColorRef.current = mountainsColor
  const elevationTypeBlobStylesRef = useRef(elevationTypeBlobStyles)
  elevationTypeBlobStylesRef.current = elevationTypeBlobStyles
  const reliefShadingOpacityRef = useRef(reliefShadingOpacity)
  reliefShadingOpacityRef.current = reliefShadingOpacity
  const hillshadeEnabledRef = useRef(hillshadeEnabled)
  hillshadeEnabledRef.current = hillshadeEnabled
  const hillshadeAzimuthRef = useRef(hillshadeAzimuth)
  hillshadeAzimuthRef.current = hillshadeAzimuth
  const hillshadeAltitudeRef = useRef(hillshadeAltitude)
  hillshadeAltitudeRef.current = hillshadeAltitude
  const hillshadeIntensityRef = useRef(hillshadeIntensity)
  hillshadeIntensityRef.current = hillshadeIntensity
  const hillshadeModeRef = useRef(hillshadeMode)
  hillshadeModeRef.current = hillshadeMode
  const heightmapMetaRef = useRef(heightmapMeta)
  heightmapMetaRef.current = heightmapMeta
  const hillshadeCanvasRef = useRef<OffscreenCanvas | null>(null)
  const heightmapImgDataRef = useRef<ImageData | null>(null)
  const hillshadeDisabledTerrainsSetRef = useRef(new Set<string>())
  hillshadeDisabledTerrainsSetRef.current = new Set(hillshadeDisabledTerrains)
  const hillshadeDisabledElevClassesSetRef = useRef(new Set<string>())
  hillshadeDisabledElevClassesSetRef.current = new Set(hillshadeDisabledElevClasses)
  const contourCanvasRef = useRef<OffscreenCanvas | null>(null)
  const contoursEnabledRef = useRef(contoursEnabled)
  contoursEnabledRef.current = contoursEnabled
  const contourIntervalRef = useRef(contourInterval)
  contourIntervalRef.current = contourInterval
  const contourBaseElevationRef = useRef(contourBaseElevation)
  contourBaseElevationRef.current = contourBaseElevation
  const contourSmoothPassesRef = useRef(contourSmoothPasses)
  contourSmoothPassesRef.current = contourSmoothPasses
  const contourLineWidthRef = useRef(contourLineWidth)
  contourLineWidthRef.current = contourLineWidth
  const contourIndexEveryRef = useRef(contourIndexEvery)
  contourIndexEveryRef.current = contourIndexEvery
  const contourIndexWidthMultRef = useRef(contourIndexWidthMult)
  contourIndexWidthMultRef.current = contourIndexWidthMult
  const contourColorRef = useRef(contourColor)
  contourColorRef.current = contourColor
  const contourOpacityRef = useRef(contourOpacity)
  contourOpacityRef.current = contourOpacity
  const contourDisabledTerrainsSetRef = useRef(new Set<string>())
  contourDisabledTerrainsSetRef.current = new Set(contourDisabledTerrains)
  const contourDisabledElevClassesSetRef = useRef(new Set<string>())
  contourDisabledElevClassesSetRef.current = new Set(contourDisabledElevClasses)
  const coastlineDPEpsilonRef = useRef(coastlineDPEpsilon)
  coastlineDPEpsilonRef.current = coastlineDPEpsilon
  const coastlineChaikinPassesRef = useRef(coastlineChaikinPasses)
  coastlineChaikinPassesRef.current = coastlineChaikinPasses
  terrainBlobOverridesRef.current = terrainBlobOverrides
  terrainTypeBlobStylesRef.current = terrainTypeBlobStyles
  waterOverridesRef.current = waterOverrides
  terrainEdgePaintEnabledRef.current = terrainEdgePaintEnabled
  paintEdgeBlobRef.current = paintEdgeBlob
  eraseEdgeBlobRef.current = eraseEdgeBlob
  edgeBlobPaintedRef.current = edgeBlobPainted
  elevationHachureEnabledRef.current = elevationHachureEnabled
  elevationShadowEnabledRef.current = elevationShadowEnabled
  elevationShadowOxRef.current = elevationShadowOx
  elevationShadowOyRef.current = elevationShadowOy
  elevationShadowBlRef.current = elevationShadowBl
  elevationShadowOpRef.current = elevationShadowOp
  elevationShadowPsRef.current = elevationShadowPs
  elevationShadowColorRef.current = elevationShadowColor
  slopeEdgesRef.current = slopeEdges
  slopeStyleRef.current = slopeStyle
  slopeSmoothingRef.current = slopeSmoothing
  slopeTickSpacingRef.current = slopeTickSpacing
  slopeTickLengthRef.current = slopeTickLength
  setSlopeEdgeRef.current = setSlopeEdge
  removeSlopeEdgeRef.current = removeSlopeEdge
  batchSetSlopeEdgesRef.current = useMapStore.getState().batchSetSlopeEdges
  batchRemoveSlopeEdgesRef.current = useMapStore.getState().batchRemoveSlopeEdges
  edgeBlobOverridesRef.current = edgeBlobOverrides
  customTerrainsRef.current = customTerrains
  edgeBlobWidthRef.current = edgeBlobWidth
  terrainRenderModeRef.current = terrainRenderMode
  // fieldFreqRef.current = fieldFreq; fieldAmpRef.current = fieldAmp
  // fieldOctavesRef.current = fieldOctaves; fieldPersistenceRef.current = fieldPersistence
  // fieldWildnessRef.current = fieldWildness
  settlementsRef.current = settlements
  settlementTierStylesRef.current = settlementTierStyles
  settlementPlaceTierRef.current = settlementPlaceTier
  addSettlementRef.current = addSettlement
  placeSettlementAtHexRef.current = placeSettlementAtHex
  settlementMoveIndexRef.current = settlementMoveIndex
  setSettlementMoveIndexRef.current = setSettlementMoveIndex
  updateSettlementRef.current = updateSettlement
  deleteSettlementRef.current = deleteSettlement

  const hexIdx = useMemo(
    () => new Map(generatedHexes.map(h => [`${h.q},${h.r}`, h])),
    [generatedHexes],
  )
  const hexIdxRef = useRef(hexIdx)
  hexIdxRef.current = hexIdx

  // Hex center lookup for road/rail chain builders.
  // Depends on generatedMetadata (not generatedHexes) because hex centers are
  // fixed at generation time and never change when terrain is painted —
  // this prevents road/rail chain rebuilds on every terrain paint stroke.
  const hexCenterIdx = useMemo(
    () => new Map(generatedHexes.map(h => [`${h.q},${h.r}`, { center: h.center as [number, number] }])),
    [generatedMetadata], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const blobComponents = useMemo(
    () => computeConnectedComponents(generatedHexes.map(h => ({ q: h.q, r: h.r, terrain: h.terrain }))),
    [generatedHexes],
  )
  const blobComponentsRef = useRef(blobComponents)
  blobComponentsRef.current = blobComponents

  // Per-terrain component maps using terrains[] — so layered hexes group correctly
  const prevBlobCompByTerrainRef = useRef(new Map<string, Map<string, string>>())
  const perTerrainCompCache = useRef(new Map<string, { hexKey: string; components: Map<string, string> }>())
  const blobComponentsByTerrain = useMemo(() => {
    if (isTerrainPainting) return prevBlobCompByTerrainRef.current
    const result = new Map<string, Map<string, string>>()
    const terrainTypes = new Set<string>()
    for (const h of generatedHexes) {
      for (const t of hexTerrainLayers(h)) {
        if (t !== 'clear' && t !== 'water') terrainTypes.add(t)
      }
    }
    for (const t of terrainTypes) {
      const hexesForType = generatedHexes.filter(h => hexTerrainLayers(h).includes(t))
      const hexKey = hexesForType.map(h => `${h.q},${h.r}`).join('|')
      const cached = perTerrainCompCache.current.get(t)
      if (cached?.hexKey === hexKey) {
        result.set(t, cached.components)
      } else {
        const components = computeConnectedComponents(
          hexesForType.map(h => ({ q: h.q, r: h.r, terrain: t }))
        )
        perTerrainCompCache.current.set(t, { hexKey, components })
        result.set(t, components)
      }
    }
    for (const t of perTerrainCompCache.current.keys()) {
      if (!terrainTypes.has(t)) perTerrainCompCache.current.delete(t)
    }
    prevBlobCompByTerrainRef.current = result
    return result
  }, [isTerrainPainting, generatedHexes])
  const blobComponentsByTerrainRef = useRef(blobComponentsByTerrain)
  blobComponentsByTerrainRef.current = blobComponentsByTerrain

  const roadTierGeomMap = useMemo(
    () => {
      const map: Record<number, { wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number; smoothing?: number; centerPull?: number }> = {}
      roadTierGeometry.forEach((g, i) => { if (g) map[i] = g })
      return Object.keys(map).length > 0 ? map : undefined
    },
    [roadTierGeometry],
  )

  // Keep RoadNetwork in sync with hex positions and geometry params
  useEffect(() => {
    roadNetworkRef.current.setHexIdx(hexCenterIdx)
    roadsController.markDirty()
  }, [hexCenterIdx])
  useEffect(() => {
    roadNetworkRef.current.setParams({
      smoothing: roadSmoothing, pathSmoothing: roadPathSmoothing, centerPull: roadCenterPull,
      overrides: roadControlOverrides, chainOverrides: roadChainOverrides,
      snapBindings: roadSnapBindings, tierGeom: roadTierGeomMap,
    })
    roadsController.markDirty()
  }, [roadSmoothing, roadPathSmoothing, roadCenterPull, roadControlOverrides, roadChainOverrides, roadSnapBindings, roadTierGeomMap])
  // Rebuild network from store when edges change externally (undo, load, OSM generate)
  // Skip rebuild if the network already reflects the current edge set (just committed a paint batch)
  useEffect(() => {
    if (roadNetworkRef.current.isEdgesEqual(roadEdges)) return
    roadNetworkRef.current.rebuildAll(roadEdges)
    roadsController.markDirty()
    setRoadDataVersion(v => v + 1)
  }, [roadEdges]) // eslint-disable-line react-hooks/exhaustive-deps

  const railBaseData = useMemo(
    () => {
      // When no rail edges exist return a stable module-level reference so that
      // smoothedRailData, roadsLayer.markDirty(), and settlementsLayer.markDirty()
      // don't fire on every road-paint mouseup (the cascade that causes the 1-2s freeze).
      if (railEdges.length === 0) return EMPTY_RAIL_DATA
      const networkBase = roadNetworkRef.current.getBaseData(
        roadWiggleAmpRef.current, roadWiggleFreqRef.current,
        roadSegmentPropsRef.current, roadHopPropsRef.current, 2
      )
      const roadEdgeMidpoints = new Map(
        networkBase.controlPoints
          .filter(cp => cp.key.startsWith('em|'))
          .map(cp => [cp.key, cp.pos] as [string, [number, number]])
      )
      const roadJunctionPositions = new Map(
        networkBase.controlPoints
          .filter(cp => cp.key.startsWith('ja|'))
          .map(cp => [cp.key.slice(3), cp.pos] as [string, [number, number]])
      )
      const effSmoothing = railGeomOverride?.smoothing ?? railSmoothing
      const effPathSmoothing = railGeomOverride?.pathSmoothing ?? railPathSmoothing
      return buildRailChains(railEdges, roadEdges, hexCenterIdx, roadEdgeMidpoints, roadJunctionPositions, railControlOverrides, 0, 0, effSmoothing, {}, {}, 2, effPathSmoothing)
    },
    // roadDataVersion as dep ensures rebuild when network changes (after undo/store-sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roadDataVersion, railEdges, roadEdges, hexCenterIdx, railControlOverrides, railSmoothing, railPathSmoothing, railGeomOverride],
  )
  const smoothedRailData = useMemo(
    () => applyRailWiggle(railBaseData, railWiggleAmp, railWiggleFreq, railSegmentProps, railHopProps, railWiggleDragging ? 0 : 2, railGeomOverride ?? undefined),
    [railBaseData, railWiggleAmp, railWiggleFreq, railSegmentProps, railHopProps, railWiggleDragging, railGeomOverride],
  )
  const smoothedRailDataRef = useRef(smoothedRailData)
  smoothedRailDataRef.current = smoothedRailData
  const railBaseDataRef = useRef(railBaseData)
  railBaseDataRef.current = railBaseData

  // Returns paper dims with pw/ph frozen at map-generation time so window resize
  // only recenters the paper (changes px/py) without rescaling it.
  const getPaper = useCallback((cssW: number, cssH: number) => {
    const meta = metaRef.current
    if (!meta || cssW === 0) return { pw: 0, ph: 0, px: 0, py: 0 }
    if (!basePaperRef.current || lastFrozenMetaRef.current !== meta) {
      const fitted = computePaper(cssW, cssH, meta)
      basePaperRef.current = { pw: fitted.pw, ph: fitted.ph }
      lastFrozenMetaRef.current = meta
    }
    const { pw, ph } = basePaperRef.current
    return { pw, ph, px: (cssW - pw) / 2, py: (cssH - ph) / 2 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Memoize paper dims, projected hex coords, and default blob geometry outside draw().
  // These are all stable across zoom/pan (which is handled by canvas transform, not coordinate recalculation),
  // so caching them here means draw() skips the expensive recomputation on every scroll/zoom frame.
  const paperDims = useMemo(() => {
    if (!generatedMetadata || frameDims.w === 0) return null
    return getPaper(frameDims.w, frameDims.h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedMetadata, frameDims])
  const paperDimsRef = useRef(paperDims)
  paperDimsRef.current = paperDims

  const getPaperRef = useRef(getPaper)
  getPaperRef.current = getPaper
  const surroundColorRef = useRef(surroundColor)
  surroundColorRef.current = surroundColor

  // Stable pw/ph reference: identity only changes when pw/ph actually change (not on px/py shifts
  // from window resize). projectedHexes depends on this so that resize never triggers blob
  // recomputation — only a new map generation (new metadata → new pw/ph) does.
  const paperSizeStableRef = useRef<{ pw: number; ph: number } | null>(null)
  const paperSizeFrozen = useMemo(() => {
    if (!generatedMetadata || frameDims.w === 0) return null
    const { pw, ph } = getPaper(frameDims.w, frameDims.h)
    const prev = paperSizeStableRef.current
    if (prev && prev.pw === pw && prev.ph === ph) return prev
    const next = { pw, ph }
    paperSizeStableRef.current = next
    return next
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedMetadata, frameDims])

  const hexRadius = useMemo(() => {
    if (!paperDims || !generatedMetadata) return 0
    return generatedMetadata.outer_radius_m * (paperDims.pw / (generatedMetadata.scale_m_per_mm * generatedMetadata.paper_mm[0]))
  }, [paperDims, generatedMetadata])
  const hexRadiusRef = useRef(hexRadius)
  hexRadiusRef.current = hexRadius

  const hexNumbersEnabledRef = useRef(hexNumbersEnabled)
  hexNumbersEnabledRef.current = hexNumbersEnabled
  const showElevationDebugRef = useRef(showElevationDebug)
  showElevationDebugRef.current = showElevationDebug
  const showElevationClassOverlayRef = useRef(showElevationClassOverlay)
  showElevationClassOverlayRef.current = showElevationClassOverlay
  const hexNumberEdgeRef = useRef(hexNumberEdge)
  hexNumberEdgeRef.current = hexNumberEdge
  const hexNumberColorRef = useRef(hexNumberColor)
  hexNumberColorRef.current = hexNumberColor
  const hexNumberFontScaleRef = useRef(hexNumberFontScale)
  hexNumberFontScaleRef.current = hexNumberFontScale

  const resolvedLabelSpecsRef = useRef(resolveLabels(labelPresetId, labelOverrides))
  resolvedLabelSpecsRef.current = resolveLabels(labelPresetId, labelOverrides)

  const mapBgColorRef = useRef(mapBgColor)
  mapBgColorRef.current = mapBgColor
  const mapStyleRef = useRef(mapStyle)
  mapStyleRef.current = mapStyle
  const historicalIconParamsRef = useRef(historicalIconParams)
  historicalIconParamsRef.current = historicalIconParams
  const mapBorderEnabledRef = useRef(mapBorderEnabled)
  mapBorderEnabledRef.current = mapBorderEnabled
  const mapBorderColorRef = useRef(mapBorderColor)
  mapBorderColorRef.current = mapBorderColor
  const mapBorderWidthRef = useRef(mapBorderWidth)
  mapBorderWidthRef.current = mapBorderWidth
  const clipToHexGridRef = useRef(clipToHexGrid)
  clipToHexGridRef.current = clipToHexGrid

  const excludedHexKeysRef = useRef(excludedHexKeys)
  excludedHexKeysRef.current = excludedHexKeys
  const toggleExcludedHexRef = useRef(toggleExcludedHex)
  toggleExcludedHexRef.current = toggleExcludedHex

  const disabledHexKeysRef = useRef(disabledHexKeys)
  disabledHexKeysRef.current = disabledHexKeys
  const toggleDisabledHexRef = useRef(toggleDisabledHex)
  toggleDisabledHexRef.current = toggleDisabledHex
  const autoDisableOceanHexesRef = useRef(autoDisableOceanHexes)
  autoDisableOceanHexesRef.current = autoDisableOceanHexes
  const autoDisabledOceanHexKeysRef = useRef(autoDisabledOceanHexKeys)
  autoDisabledOceanHexKeysRef.current = autoDisabledOceanHexKeys
  const setAutoDisabledOceanHexKeysRef = useRef(setAutoDisabledOceanHexKeys)
  setAutoDisabledOceanHexKeysRef.current = setAutoDisabledOceanHexKeys

  const worldcoverImageElementRef = useRef<HTMLImageElement | null>(null)
  const worldcoverOffscreenRef = useRef<OffscreenCanvas | null>(null)
  const worldcoverImageUrlRef = useRef(worldcoverImageUrl)
  worldcoverImageUrlRef.current = worldcoverImageUrl
  const showWorldcoverOverlayRef = useRef(showWorldcoverOverlay)
  showWorldcoverOverlayRef.current = showWorldcoverOverlay

  const mapImageElementRef = useRef<HTMLImageElement | null>(null)
  const mapImageDataUrlRef = useRef(mapImageDataUrl)
  mapImageDataUrlRef.current = mapImageDataUrl
  const mapImageTransformRef = useRef(mapImageTransform)
  mapImageTransformRef.current = mapImageTransform
  const mapImageOpacityRef = useRef(mapImageOpacity)
  mapImageOpacityRef.current = mapImageOpacity
  const setMapImageTransformRef = useRef(setMapImageTransform)
  setMapImageTransformRef.current = setMapImageTransform
  const dataSourceRef = useRef(dataSource)
  dataSourceRef.current = dataSource

  const hexNumberMap = useMemo(
    () => hexNumbersEnabled && generatedHexes.length > 0
      ? buildHexNumberMap(generatedHexes, hexOrientation, hexNumberStartCorner)
      : new Map<string, string>(),
    [hexNumbersEnabled, generatedHexes, hexOrientation, hexNumberStartCorner],
  )
  const hexNumberMapRef = useRef(hexNumberMap)
  hexNumberMapRef.current = hexNumberMap

  const projectedHexes = useMemo(() => {
    if (!generatedMetadata || !paperSizeFrozen || generatedHexes.length === 0) return []
    const { pw, ph } = paperSizeFrozen
    return generatedHexes.map(hex => {
      const verts = hex.vertices.map(([lon, lat]) =>
        projectToCanvas(lon, lat, generatedMetadata, pw, ph, 0, 0) as [number, number]
      )
      return { hex, verts }
    })
  }, [generatedHexes, generatedMetadata, paperSizeFrozen])
  const projectedHexesRef = useRef(projectedHexes)
  projectedHexesRef.current = projectedHexes

  // hexVertMap: hex key → projected canvas vertices. Needed for edge blob geometry.
  const hexVertMap = useMemo(() => {
    const map = new Map<string, [number, number][]>()
    for (const { hex, verts } of projectedHexes) {
      map.set(`${hex.q},${hex.r}`, verts)
    }
    return map
  }, [projectedHexes])
  const hexVertMapRef = useRef(hexVertMap)
  hexVertMapRef.current = hexVertMap

  // Ocean sea keys: pure-sea hexes (terrain='sea', no clip) that are reachable via
  // flood-fill from any pure-sea hex adjacent to a coastal hex (one with coastline_clip).
  // Inland water bodies form isolated islands with no path to the coast — excluded.
  // Raw projected land polygon boundary — unsmoothed, for debug overlay and as V3 input.
  const rawCoastlineBoundary = useMemo((): [number, number][][] => {
    const raw = generatedMetadata?.coastline_boundary
    if (!raw || raw.length === 0 || !paperDims) return []
    const { pw, ph } = paperDims
    return raw.map(ring =>
      ring.map(([lon, lat]) =>
        projectToCanvas(lon, lat, generatedMetadata!, pw, ph, 0, 0) as [number, number]
      )
    )
  }, [generatedMetadata, paperDims])
  const rawCoastlineBoundaryRef = useRef(rawCoastlineBoundary)
  rawCoastlineBoundaryRef.current = rawCoastlineBoundary

  // Smoothed V3 boundary — DP then Chaikin (closed) applied globally to each ring.
  // The smoothing params are already tracked via their own refs so this memo reruns
  // whenever they change, keeping the offscreen terrain dirty flag in sync.
  const smoothedCoastlineBoundary = useMemo((): [number, number][][] => {
    if (rawCoastlineBoundary.length === 0) return []
    return rawCoastlineBoundary.map(ring => {
      const simplified = coastlineDPEpsilon > 0 ? douglasPeucker(ring, coastlineDPEpsilon) : ring
      return chaikin(simplified, coastlineChaikinPasses, true)
    })
  }, [rawCoastlineBoundary, coastlineDPEpsilon, coastlineChaikinPasses])
  const smoothedCoastlineBoundaryRef = useRef(smoothedCoastlineBoundary)
  smoothedCoastlineBoundaryRef.current = smoothedCoastlineBoundary


  // Shared tier chain data — uses per-chain cache so only structurally changed chains rebuild.
  type _RiverChainV2 = import('../lib/riverChains').RiverChainV2
  const riverTierChainsRaw = useMemo((): [_RiverChainV2[], _RiverChainV2[], _RiverChainV2[]] => {
    const tierEdges: [typeof riverEdges, typeof riverEdges, typeof riverEdges] = [[], [], []]
    for (const e of riverEdges) tierEdges[e.tier ?? 1].push(e)
    return ([0, 1, 2] as const).map(tier => {
      if (tierEdges[tier].length === 0) { riverTierChainCaches.current[tier].clear(); return [] as _RiverChainV2[] }
      const style = riverTierStyles?.[tier]
      const amp  = style?.wiggleAmp     ?? riverWiggleAmp
      const freq = style?.wiggleFreq    ?? riverWiggleFreq
      const sm   = style?.smoothing     ?? riverSmoothing
      const ps   = style?.pathSmoothing ?? riverPathSmoothing
      return buildRiverChainsV2(tierEdges[tier], generatedHexes, riverChainOverrides, freq, amp, sm, riverHopProps, riverSegmentProps, ps, riverTierChainCaches.current[tier])
    }) as [_RiverChainV2[], _RiverChainV2[], _RiverChainV2[]]
  }, [riverEdges, riverTierStyles, riverWiggleFreq, riverWiggleAmp, riverSmoothing, riverPathSmoothing, riverChainOverrides, riverHopProps, riverSegmentProps, generatedHexes])

  // River corridor polygons in canvas coords — computed here (before defaultTerrainBlobs) so the
  // pre-shaping cut can use them. The cut happens on raw hex-outline polygons so the cut edge
  // goes through the full organic shaping pipeline (inset, bump, lobe) just like any other blob edge.
  // Uses riverTierChainsRaw — no extra buildRiverChainsV2 call.
  const riverAutoCorridors = useMemo((): [number, number][][] => {
    if (!riverBlobCutEnabled || riverEdges.length === 0 || generatedHexes.length === 0 || !generatedMetadata || !paperDims) return EMPTY_CORRIDORS
    const { pw, ph } = paperDims
    const meta = generatedMetadata
    const proj = (lonlat: [number, number]): [number, number] =>
      projectToCanvas(lonlat[0], lonlat[1], meta, pw, ph, 0, 0)
    const halfW = hexRadius * riverBlobCutWidth
    const corridors: [number, number][][] = []
    for (const tierChains of riverTierChainsRaw) {
      for (const chain of tierChains) {
        const pts = chain.chain.map(proj)
        if (pts.length < 2) continue
        const upper = offsetPolyline(pts, +halfW)
        const lower = offsetPolyline(pts, -halfW).slice().reverse()
        if (upper.length + lower.length >= 3) corridors.push([...upper, ...lower])
      }
    }
    return corridors
  }, [riverTierChainsRaw, riverBlobCutEnabled, riverBlobCutWidth, riverEdges, generatedHexes, hexRadius, generatedMetadata, paperDims])

  const roadAutoCorridors = useMemo((): [number, number][][] => {
    if (!roadBlobCutEnabled || !generatedMetadata || !paperDims) return EMPTY_CORRIDORS
    const { pw, ph } = paperDims
    const meta = generatedMetadata
    const proj = (pt: [number, number]): [number, number] =>
      projectToCanvas(pt[0], pt[1], meta, pw, ph, 0, 0)
    const halfW = hexRadius * roadBlobCutWidth
    const chains = roadNetworkRef.current.getBaseData(
      roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps, 2,
    ).chains
    const corridors: [number, number][][] = []
    for (const c of chains) {
      const pts = c.chain.map(proj)
      if (pts.length < 2) continue
      const upper = offsetPolyline(pts, +halfW)
      const lower = offsetPolyline(pts, -halfW).slice().reverse()
      if (upper.length + lower.length >= 3) corridors.push([...upper, ...lower])
    }
    return corridors
  }, [roadBlobCutEnabled, roadBlobCutWidth, roadDataVersion, hexRadius, generatedMetadata, paperDims, roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps])

  const prevTerrainBlobsRef = useRef<{ terrain: string; polys: [number, number][][]; blobKeys: string[] }[]>([])
  type TerrainBlobCacheEntry = { hexKey: string; rawPolys: [number, number][][]; hexCenters: [number, number][]; clusterCenters?: [number, number][][]; styleKey: string; blobs: { terrain: string; polys: [number, number][][]; blobKeys: string[] }[]; handleGroups?: Map<string, { edgeKey: string; cx: number; cy: number }[]>; simplifiedPolyGroups?: Map<string, [number, number][][]> }
  const perTerrainBlobCache = useRef(new Map<string, TerrainBlobCacheEntry>())
  const defaultTerrainBlobs = useMemo(() => {
    const _tMemo0 = performance.now()
    if (projectedHexes.length === 0 || hexRadius === 0) return []
    if (isTerrainPainting) return prevTerrainBlobsRef.current
    const overriddenKeys = new Set(Object.keys(terrainBlobOverrides))
    // Pure-sea: terrain=sea with no coastline_clip. When realistic coastline is on these
    // are excluded from blobs — section 6 handles their fill. When off, they enter the sea blob.
    const isPureSea = (h: GeneratedHex) =>
      h.terrain === 'water' && (!h.coastline_clip || h.coastline_clip.length === 0)
    const terrainTypeSet = new Set<string>()
    for (const p of projectedHexes) {
      const h = p.hex as GeneratedHex
      if (realisticCoastline && isPureSea(h)) continue
      for (const t of coastalBlobTerrains(h, realisticCoastline)) {
        if (t !== 'clear' && t !== 'water') terrainTypeSet.add(t)
      }
    }
    const terrainTypes = [...terrainTypeSet]
    blobHandleDataRef.current.clear()
    // Each terrain type is computed independently so cross-terrain blob coupling is impossible.
    const result = terrainTypes.flatMap(terrain => {
      const componentMap = blobComponentsByTerrain.get(terrain) ?? new Map<string, string>()
      const terrainProjected = projectedHexes.filter(p => {
        const h = p.hex as GeneratedHex
        if (realisticCoastline && isPureSea(h)) return false
        const terrains = coastalBlobTerrains(h, realisticCoastline)
        if (!terrains.includes(terrain)) return false
        if (elevationOverridesTerrain && (h.elevation_class === 'hills' || h.elevation_class === 'mountains')) return false
        if (overriddenKeys.size > 0) {
          const ck = componentMap.get(`${h.q},${h.r}`)
          if (ck && overriddenKeys.has(ck)) return false
        }
        return true
      }).map(p => { const h = p.hex as GeneratedHex; return { ...p, hex: { ...p.hex, terrain, q: h.q, r: h.r } } })

      if (terrainProjected.length === 0) {
        perTerrainBlobCache.current.delete(terrain)
        return []
      }
      const ts = terrainTypeBlobStyles[terrain]?.enabled ? terrainTypeBlobStyles[terrain] : null
      const smooth          = ts?.smooth          ?? terrainBlobSmooth
      const offset          = ts?.offset          ?? terrainBlobOffset
      const bump            = ts?.bump            ?? terrainBlobBump
      const sweepFreq       = ts?.sweepFreq       ?? terrainBlobSweepFreq
      const lobeFreq        = ts?.lobeFreq        ?? terrainBlobLobeFreq
      const lobeAmp         = ts?.lobeAmp         ?? terrainBlobLobeAmp
      const lobeThreshold   = ts?.lobeThreshold   ?? terrainBlobLobeThreshold
      const lobeDirection   = ts?.lobeDirection   ?? terrainBlobLobeDirection
      const clusterSize     = ts?.clusterSize     ?? terrainBlobClusterSize

      // Build raw hex centers keyed by "q,r" (needed for canonical key lookup)
      const hexOrigCenterByKey = new Map<string, [number, number]>()
      for (const p of terrainProjected) {
        const h = p.hex as GeneratedHex
        const v = p.verts
        hexOrigCenterByKey.set(`${h.q},${h.r}`, [
          (v[0][0]+v[1][0]+v[2][0]+v[3][0]+v[4][0]+v[5][0]) / 6,
          (v[0][1]+v[1][1]+v[2][1]+v[3][1]+v[4][1]+v[5][1]) / 6,
        ])
      }

      const hexKey = `eot:${elevationOverridesTerrain}|cs:${clusterSize}|` + terrainProjected.map(p => `${(p.hex as GeneratedHex).q},${(p.hex as GeneratedHex).r}`).join('|')
      const canonicalKeySet = new Set([...componentMap.values()])
      const handleKey = [...canonicalKeySet].sort().map(ck => {
        const h = blobHandleOverrides[ck]
        return h && Object.keys(h).length > 0 ? `${ck}:${JSON.stringify(h)}` : ''
      }).filter(Boolean).join('~')
      // Compute terrain bbox for corridor spatial filter
      let bboxMinX = Infinity, bboxMaxX = -Infinity, bboxMinY = Infinity, bboxMaxY = -Infinity
      for (const [cx, cy] of hexOrigCenterByKey.values()) {
        if (cx - hexRadius < bboxMinX) bboxMinX = cx - hexRadius
        if (cx + hexRadius > bboxMaxX) bboxMaxX = cx + hexRadius
        if (cy - hexRadius < bboxMinY) bboxMinY = cy - hexRadius
        if (cy + hexRadius > bboxMaxY) bboxMaxY = cy + hexRadius
      }
      const overlapsBbox = (corridor: [number, number][]) => {
        let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity
        for (const [px, py] of corridor) {
          if (px < cMinX) cMinX = px; if (px > cMaxX) cMaxX = px
          if (py < cMinY) cMinY = py; if (py > cMaxY) cMaxY = py
        }
        return cMaxX >= bboxMinX && cMinX <= bboxMaxX && cMaxY >= bboxMinY && cMinY <= bboxMaxY
      }
      const terrainSeed = terrain.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)
      const relevantRiverCorridors = riverAutoCorridors.filter(overlapsBbox)
      const relevantRoadCorridors  = roadAutoCorridors.filter(overlapsBbox)
      const perturbedRiverCorridors = relevantRiverCorridors.length === 0 ? relevantRiverCorridors
        : perturbCorridorsForTerrain(relevantRiverCorridors, riverBlobCutRoughness, 1 + riverBlobCutRoughness, sweepFreq, hexRadius, hexRadius * riverBlobCutWidth, terrainSeed)
      const perturbedRoadCorridors  = relevantRoadCorridors.length === 0 ? relevantRoadCorridors
        : perturbCorridorsForTerrain(relevantRoadCorridors, roadBlobCutRoughness, 1 + roadBlobCutRoughness, sweepFreq, hexRadius, hexRadius * roadBlobCutWidth, terrainSeed + 1)
      const relevantCorridors = perturbedRiverCorridors.length === 0 && perturbedRoadCorridors.length === 0
        ? EMPTY_CORRIDORS : [...perturbedRiverCorridors, ...perturbedRoadCorridors]
      const corridorKey = `r${relevantRiverCorridors.map(c => `${c.length}:${c[0]?.[0].toFixed(0)},${c[0]?.[1].toFixed(0)}`).join('|')}` +
        `|d${relevantRoadCorridors.map(c => `${c.length}:${c[0]?.[0].toFixed(0)},${c[0]?.[1].toFixed(0)}`).join('|')}`
      const styleKey = `${smooth}|${offset}|${bump}|${sweepFreq}|${lobeFreq}|${lobeAmp}|${lobeThreshold}|${lobeDirection}|${terrainBlobTopoStyle}|${hexRadius}|${JSON.stringify(blobSeeds)}|${handleKey}|${corridorKey}|${riverBlobCutRoughness}|${roadBlobCutRoughness}`
      const cached = perTerrainBlobCache.current.get(terrain)

      // Compute rawPolys (topology cache)
      let rawPolys: [number, number][][]
      let topoClusterCenters: [number, number][][] | undefined
      if (cached?.hexKey === hexKey) {
        rawPolys = cached.rawPolys
        topoClusterCenters = cached.clusterCenters
      } else {
        const topo = buildTerrainBlobTopology(terrainProjected, hexRadius, clusterSize)
        const topoEntry = topo.find(e => e.terrain === terrain)
        rawPolys = topoEntry?.rawPolys ?? []
        topoClusterCenters = topoEntry?.clusterCenters
      }

      // Simplified polys — what handles are generated from and what the dashed overlay shows
      const simplifiedPolys = rawPolys.map(p => {
        const seed = Math.abs(Math.round(p[0][0] * 73 + p[0][1] * 97))
        return shapeInputPolygon(p, terrainBlobTopoStyle, hexRadius, seed)
      })

      // Build vertex handles from simplified poly corners — each vertex is one handle
      const ESNAP = Math.max(2, hexRadius * 0.015)
      const evk = (p: [number, number]) => `${Math.round(p[0]/ESNAP)},${Math.round(p[1]/ESNAP)}`
      const newHandleGroups = new Map<string, { edgeKey: string; cx: number; cy: number }[]>()
      const newSimplifiedPolys = new Map<string, [number, number][][]>()
      const displacedPolys: [number, number][][] = []
      // Stable seeds computed from the pre-displacement first vertex so dragging any handle
      // never changes which noise pattern is applied to the blob.
      const stableSeeds: number[] = []
      for (const poly of simplifiedPolys) {
        if (poly.length < 3) continue
        const [fvx, fvy] = poly[0]
        let polyCk = '', bestD = Infinity
        for (const [hk, [hx, hy]] of hexOrigCenterByKey) {
          const d = (fvx-hx)**2 + (fvy-hy)**2
          if (d < bestD) { bestD = d; polyCk = componentMap.get(hk) ?? hk }
        }
        if (!polyCk) continue
        if (!newHandleGroups.has(polyCk)) newHandleGroups.set(polyCk, [])
        if (!newSimplifiedPolys.has(polyCk)) newSimplifiedPolys.set(polyCk, [])
        newSimplifiedPolys.get(polyCk)!.push(poly)
        const group = newHandleGroups.get(polyCk)!
        const displaced: [number, number][] = []
        for (const v of poly) {
          const edgeKey = evk(v)
          const off = blobHandleOverrides[polyCk]?.[edgeKey]
          const cx = v[0] + (off?.[0] ?? 0) * hexRadius
          const cy = v[1] + (off?.[1] ?? 0) * hexRadius
          group.push({ edgeKey, cx, cy })
          displaced.push([cx, cy])
        }
        displacedPolys.push(displaced)
        stableSeeds.push(Math.abs(Math.round(fvx * 73 + fvy * 97)))
      }
      for (const [ck, handles] of newHandleGroups) {
        blobHandleDataRef.current.set(ck, { terrain, handles, simplifiedPolys: newSimplifiedPolys.get(ck) ?? [] })
      }

      if (cached?.hexKey === hexKey && cached?.styleKey === styleKey) {
        for (const [ck, handles] of cached.handleGroups ?? []) {
          blobHandleDataRef.current.set(ck, { terrain, handles, simplifiedPolys: cached.simplifiedPolyGroups?.get(ck) ?? [] })
        }
        return cached.blobs
      }

      const hexCenters = [...hexOrigCenterByKey.values()]
      const _tBlob0 = performance.now()
      const shaped = shapeTerrainBlobs([{ terrain, rawPolys: displacedPolys, hexCenters, clusterCenters: topoClusterCenters }], smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, hexRadius, blobSeeds, stableSeeds)
      console.log(`[blobUseMemo] shapeTerrainBlobs terrain=${terrain} polys=${displacedPolys.length} took ${(performance.now()-_tBlob0).toFixed(1)}ms`)

      // Cut shaped blobs with the already-perturbed corridors (perturbation happened above).
      const blobs = relevantCorridors.length === 0 ? shaped : shaped.map(entry => {
        const cutPolys: [number, number][][] = []
        const cutKeys: string[] = []
        for (let i = 0; i < entry.polys.length; i++) {
          const pieces = cutRawPolysWithCorridors([entry.polys[i]], relevantCorridors)
          for (const piece of pieces) { cutPolys.push(piece); cutKeys.push(entry.blobKeys[i]) }
        }
        return { ...entry, polys: cutPolys, blobKeys: cutKeys }
      })

      perTerrainBlobCache.current.set(terrain, { hexKey, rawPolys, hexCenters, clusterCenters: topoClusterCenters, styleKey, blobs, handleGroups: newHandleGroups, simplifiedPolyGroups: newSimplifiedPolys })
      return blobs
    })
    for (const t of perTerrainBlobCache.current.keys()) {
      if (!terrainTypeSet.has(t)) perTerrainBlobCache.current.delete(t)
    }
    prevTerrainBlobsRef.current = result
    console.log(`[blobUseMemo] total ${(performance.now()-_tMemo0).toFixed(1)}ms`)
    return result
  }, [isTerrainPainting, projectedHexes, blobComponentsByTerrain, terrainBlobOverrides, terrainTypeBlobStyles, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, terrainBlobTopoStyle, terrainBlobClusterSize, hexRadius, realisticCoastline, blobSeeds, elevationOverridesTerrain, blobHandleOverrides, riverAutoCorridors, roadAutoCorridors, riverBlobCutRoughness, roadBlobCutRoughness])
  const defaultTerrainBlobsRef = useRef(defaultTerrainBlobs)
  defaultTerrainBlobsRef.current = defaultTerrainBlobs

  // Apply blob mask edits (boolean add/subtract regions) to the shaped blobs.
  // Edits are stored in lon/lat and projected to canvas space here so they track pan/zoom.
  // River corridor cuts are now applied upstream in defaultTerrainBlobs (pre-shaping) so
  // the cut edge goes through the full organic pipeline like any other blob edge.
  const defaultTerrainBlobsMasked = useMemo(() => {
    if (blobMaskEdits.length === 0 || !generatedMetadata || !paperDims) return defaultTerrainBlobs
    const { pw, ph } = paperDims
    const meta = generatedMetadata
    const projectFn = (lonlat: [number, number]): [number, number] =>
      projectToCanvas(lonlat[0], lonlat[1], meta, pw, ph, 0, 0)
    const shapeParams = {
      R: hexRadius,
      smooth: terrainBlobSmooth,
      bump: terrainBlobBump,
      sweepFreq: terrainBlobSweepFreq,
      lobeFreq: terrainBlobLobeFreq,
      lobeAmp: terrainBlobLobeAmp,
      lobeThreshold: terrainBlobLobeThreshold,
      lobeDirection: terrainBlobLobeDirection,
    }
    return applyBlobMaskEdits(defaultTerrainBlobs, blobMaskEdits, projectFn, shapeParams)
  }, [defaultTerrainBlobs, blobMaskEdits, generatedMetadata, paperDims, hexRadius, terrainBlobSmooth, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection])
  const defaultTerrainBlobsSplatted = useMemo(() => {
    if (terrainBlobSplatDensity <= 0) return defaultTerrainBlobsMasked
    const shapeParams = {
      R: hexRadius,
      smooth: terrainBlobSmooth,
      bump: terrainBlobBump,
      sweepFreq: terrainBlobSweepFreq,
      lobeFreq: terrainBlobLobeFreq,
      lobeAmp: terrainBlobLobeAmp,
      lobeThreshold: terrainBlobLobeThreshold,
      lobeDirection: terrainBlobLobeDirection,
    }
    return generateBlobSplats(
      defaultTerrainBlobsMasked,
      { splatDensity: terrainBlobSplatDensity, splatSize: terrainBlobSplatSize },
      hexRadius,
      shapeParams,
    )
  }, [defaultTerrainBlobsMasked, terrainBlobSplatDensity, terrainBlobSplatSize, hexRadius, terrainBlobSmooth, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection])
  const defaultTerrainBlobsMaskedRef = useRef(defaultTerrainBlobsSplatted)
  defaultTerrainBlobsMaskedRef.current = defaultTerrainBlobsSplatted

  // ── Background terrain blobs ──────────────────────────────────────────────
  const prevBackgroundBlobsRef = useRef<{ terrain: string; polys: [number, number][][] }[]>([])
  const backgroundBlobCache = useRef(new Map<string, { hexKey: string; blobs: { terrain: string; polys: [number, number][][] }[] }>())
  const defaultBackgroundBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0 || !terrainLayersEnabled) return []
    if (isTerrainPainting) return prevBackgroundBlobsRef.current
    // Group hexes by backgroundTerrain. Include adjacent primary hexes of the same
    // type so the background blob merges seamlessly with the primary blob at edges.
    // Section 3d in drawTerrain clips the paint to background-terrain hexes only
    // so primary terrain hexes aren't double-rendered (which made bg hexes look lighter).
    const bgTypeSet = new Set<string>()
    for (const p of projectedHexes) {
      const h = p.hex as GeneratedHex
      if (elevationOverridesTerrain && (h.elevation_class === 'hills' || h.elevation_class === 'mountains')) continue
      if (h.backgroundTerrain) bgTypeSet.add(h.backgroundTerrain)
    }
    if (bgTypeSet.size === 0) { prevBackgroundBlobsRef.current = []; return [] }
    const result = [...bgTypeSet].flatMap(terrain => {
      const bgProjected = projectedHexes.filter(p => {
        const h = p.hex as GeneratedHex
        if (elevationOverridesTerrain && (h.elevation_class === 'hills' || h.elevation_class === 'mountains')) return false
        return h.backgroundTerrain === terrain || h.terrain === terrain
      }).map(p => { const h = p.hex as GeneratedHex; return { ...p, hex: { ...p.hex, terrain, q: h.q, r: h.r } } })
      if (bgProjected.length === 0) return []
      const hexKey = `eot:${elevationOverridesTerrain}|` + bgProjected.map(p => `${p.hex.q},${p.hex.r}`).join('|')
      const cached = backgroundBlobCache.current.get(terrain)
      if (cached?.hexKey === hexKey) return cached.blobs
      const blobs = buildTerrainBlobsV2(bgProjected, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, hexRadius, terrainBlobTopoStyle, terrainBlobClusterSize)
      backgroundBlobCache.current.set(terrain, { hexKey, blobs })
      return blobs
    })
    prevBackgroundBlobsRef.current = result
    return result
  }, [isTerrainPainting, projectedHexes, hexRadius, terrainLayersEnabled, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, terrainBlobTopoStyle, terrainBlobClusterSize, elevationOverridesTerrain])
  const defaultBackgroundBlobsRef = useRef(defaultBackgroundBlobs)
  defaultBackgroundBlobsRef.current = defaultBackgroundBlobs

  const prevLakeBlobsRef = useRef<{ terrain: string; polys: [number, number][][] }[]>([])
  const lakeBlobCache = useRef<{ hexKey: string; rawPolys: [number, number][][]; hexCenters: [number, number][]; styleKey: string; blobs: { terrain: string; polys: [number, number][][] }[] } | null>(null)
  const defaultWaterBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0) return []
    if (isTerrainPainting) return prevLakeBlobsRef.current
    const waterOverriddenKeys = new Set(Object.keys(waterOverrides))
    const defaultWaterProjected = projectedHexes
      .filter(p => {
        if (p.hex.terrain !== 'water') return false
        const ck = blobComponents.get(`${p.hex.q},${p.hex.r}`)
        return !ck || !waterOverriddenKeys.has(ck)
      })
      .map(p => ({ hex: { ...p.hex, terrain: 'water' }, verts: p.verts }))
    if (defaultWaterProjected.length === 0) {
      lakeBlobCache.current = null
      return prevLakeBlobsRef.current
    }
    const wts = terrainTypeBlobStyles['water']?.enabled ? terrainTypeBlobStyles['water'] : null
    const wSmooth        = wts?.smooth        ?? terrainBlobSmooth
    const wOffset        = wts?.offset        ?? terrainBlobOffset
    const wBump          = wts?.bump          ?? terrainBlobBump
    const wSweepFreq     = wts?.sweepFreq     ?? terrainBlobSweepFreq
    const wLobeFreq      = wts?.lobeFreq      ?? terrainBlobLobeFreq
    const wLobeAmp       = wts?.lobeAmp       ?? terrainBlobLobeAmp
    const wLobeThreshold = wts?.lobeThreshold ?? terrainBlobLobeThreshold
    const wLobeDirection = wts?.lobeDirection ?? terrainBlobLobeDirection

    const hexKey = defaultWaterProjected.map(p => `${p.hex.q},${p.hex.r}`).join('|')
    const styleKey = `${wSmooth}|${wOffset}|${wBump}|${wSweepFreq}|${wLobeFreq}|${wLobeAmp}|${wLobeThreshold}|${wLobeDirection}|${terrainBlobTopoStyle}|${hexRadius}`
    if (lakeBlobCache.current?.hexKey === hexKey && lakeBlobCache.current?.styleKey === styleKey) {
      return lakeBlobCache.current.blobs
    }
    let waterRawPolys: [number, number][][]
    let waterHexCenters: [number, number][]
    if (lakeBlobCache.current?.hexKey === hexKey) {
      waterRawPolys = lakeBlobCache.current.rawPolys
      waterHexCenters = lakeBlobCache.current.hexCenters
    } else {
      const topo = buildTerrainBlobTopology(defaultWaterProjected, hexRadius)
      const entry = topo.find(e => e.terrain === 'water')
      waterRawPolys = entry?.rawPolys ?? []
      waterHexCenters = entry?.hexCenters ?? []
    }
    const shapedWaterPolys = waterRawPolys.map(p => {
      const seed = Math.abs(Math.round(p[0][0] * 73 + p[0][1] * 97))
      return shapeInputPolygon(p, terrainBlobTopoStyle, hexRadius, seed)
    })
    const result = shapeTerrainBlobs([{ terrain: 'water', rawPolys: shapedWaterPolys, hexCenters: waterHexCenters }], wSmooth, wOffset, wBump, wSweepFreq, wLobeFreq, wLobeAmp, wLobeThreshold, wLobeDirection, hexRadius, {})
    lakeBlobCache.current = { hexKey, rawPolys: waterRawPolys, hexCenters: waterHexCenters, styleKey, blobs: result }
    prevLakeBlobsRef.current = result
    return result
  }, [isTerrainPainting, projectedHexes, blobComponents, waterOverrides, terrainTypeBlobStyles, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, terrainBlobTopoStyle, hexRadius])
  const defaultWaterBlobsMasked = useMemo(() => {
    if (blobMaskEdits.length === 0 || !generatedMetadata || !paperDims) return defaultWaterBlobs
    const { pw, ph } = paperDims
    const meta = generatedMetadata
    const projectFn = (lonlat: [number, number]): [number, number] =>
      projectToCanvas(lonlat[0], lonlat[1], meta, pw, ph, 0, 0)
    const wts = terrainTypeBlobStyles['water']?.enabled ? terrainTypeBlobStyles['water'] : null
    const shapeParams = {
      R: hexRadius,
      smooth: wts?.smooth ?? terrainBlobSmooth,
      bump: wts?.bump ?? terrainBlobBump,
      sweepFreq: wts?.sweepFreq ?? terrainBlobSweepFreq,
      lobeFreq: wts?.lobeFreq ?? terrainBlobLobeFreq,
      lobeAmp: wts?.lobeAmp ?? terrainBlobLobeAmp,
      lobeThreshold: wts?.lobeThreshold ?? terrainBlobLobeThreshold,
      lobeDirection: wts?.lobeDirection ?? terrainBlobLobeDirection,
    }
    return applyBlobMaskEdits(defaultWaterBlobs, blobMaskEdits, projectFn, shapeParams)
  }, [defaultWaterBlobs, blobMaskEdits, generatedMetadata, paperDims, hexRadius, terrainTypeBlobStyles, terrainBlobSmooth, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection])
  const defaultWaterBlobsRef = useRef(defaultWaterBlobsMasked)
  defaultWaterBlobsRef.current = defaultWaterBlobsMasked

  const prevElevationBlobsRef = useRef<{ hills: [number, number][][]; mountains: [number, number][][] }>({ hills: [], mountains: [] })
  const elevationBlobsCache = useRef<{ hexKey: string; topoHills: BlobTopologyEntry | null; topoMountains: BlobTopologyEntry | null; styleKey: string; blobs: { hills: [number, number][][]; mountains: [number, number][][] } } | null>(null)
  const defaultElevationBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0) return prevElevationBlobsRef.current
    if (isTerrainPainting) return prevElevationBlobsRef.current
    const { rangeHillsM, rangeMountainsM, medianHillsM, medianMountainsM } = classificationParams
    const liveElevClass = (h: GeneratedHex): 'flat' | 'hills' | 'mountains' | null => {
      if (h.elevation_manual_override) return h.elevation_class
      if (h.terrain === 'water' || h.elevation_range_m == null || h.elevation_median_m == null) return null
      let byRange: 'flat' | 'hills' | 'mountains' = 'flat'
      if (h.elevation_range_m >= rangeMountainsM) byRange = 'mountains'
      else if (h.elevation_range_m >= rangeHillsM) byRange = 'hills'
      let byMedian: 'flat' | 'hills' | 'mountains' = 'flat'
      if (h.elevation_median_m >= medianMountainsM) byMedian = 'mountains'
      else if (h.elevation_median_m >= medianHillsM) byMedian = 'hills'
      const RANK = { flat: 0, hills: 1, mountains: 2 } as const
      return RANK[byRange] >= RANK[byMedian] ? byRange : byMedian
    }
    const hillsStyle = elevationTypeBlobStyles['hills']
    const mountainsStyle = elevationTypeBlobStyles['mountains']
    const hillsClusterSize  = (hillsStyle?.enabled && hillsStyle.clusterSize  != null) ? hillsStyle.clusterSize  : terrainBlobClusterSize
    const mountainsClusterSize = (mountainsStyle?.enabled && mountainsStyle.clusterSize != null) ? mountainsStyle.clusterSize : terrainBlobClusterSize
    const hexKey = `imp:${elevationImportEnabled}|${rangeHillsM},${rangeMountainsM},${medianHillsM},${medianMountainsM}|cs:${hillsClusterSize},${mountainsClusterSize}|` + projectedHexes.map(p => { const h = p.hex as GeneratedHex; const cls = liveElevClass(h); return `${h.q},${h.r}:${cls ?? ''}:${cls === 'mountains' ? 'h' : ''}:${h.elevation_manual_override ? '1' : '0'}` }).join('|')
    const styleKey = `${terrainBlobSmooth}|${terrainBlobOffset}|${terrainBlobBump}|${terrainBlobSweepFreq}|${terrainBlobLobeFreq}|${terrainBlobLobeAmp}|${terrainBlobLobeThreshold}|${terrainBlobLobeDirection}|${terrainBlobTopoStyle}|${hexRadius}|${JSON.stringify(hillsStyle)}|${JSON.stringify(mountainsStyle)}`
    if (elevationBlobsCache.current?.hexKey === hexKey && elevationBlobsCache.current?.styleKey === styleKey) {
      return elevationBlobsCache.current.blobs
    }
    const makePolys = (cls: 'hills' | 'mountains', cachedTopo: BlobTopologyEntry | null | undefined) => {
      const clsStyle = cls === 'hills' ? hillsStyle : mountainsStyle
      const useCustom = clsStyle?.enabled === true
      const smooth        = useCustom ? (clsStyle?.smooth        ?? terrainBlobSmooth)        : terrainBlobSmooth
      const offset        = useCustom ? (clsStyle?.offset        ?? terrainBlobOffset)        : terrainBlobOffset
      const bump          = useCustom ? (clsStyle?.bump          ?? terrainBlobBump)          : terrainBlobBump
      const sweepFreq     = useCustom ? (clsStyle?.sweepFreq     ?? terrainBlobSweepFreq)     : terrainBlobSweepFreq
      const lobeFreq      = useCustom ? (clsStyle?.lobeFreq      ?? terrainBlobLobeFreq)      : terrainBlobLobeFreq
      const lobeAmp       = useCustom ? (clsStyle?.lobeAmp       ?? terrainBlobLobeAmp)       : terrainBlobLobeAmp
      const lobeThreshold = useCustom ? (clsStyle?.lobeThreshold ?? terrainBlobLobeThreshold) : terrainBlobLobeThreshold
      const lobeDirection = useCustom ? (clsStyle?.lobeDirection ?? terrainBlobLobeDirection) : terrainBlobLobeDirection
      const clusterSize   = cls === 'hills' ? hillsClusterSize : mountainsClusterSize
      const elevProjected = projectedHexes
        .filter(p => {
          const h = p.hex as GeneratedHex
          if (!elevationImportEnabled && !h.elevation_manual_override) return false
          const effClass = liveElevClass(h)
          const effBackground = !h.elevation_manual_override && effClass === 'mountains' ? 'hills' : (h.elevation_manual_override ? (h.elevation_background ?? null) : null)
          return effClass === cls || effBackground === cls
        })
        .map(p => ({ ...p, hex: { ...p.hex, terrain: cls } }))
      if (elevProjected.length === 0) return { topo: null, polys: [] as [number, number][][] }
      const topoEntry = elevationBlobsCache.current?.hexKey === hexKey && cachedTopo
        ? cachedTopo
        : (buildTerrainBlobTopology(elevProjected, hexRadius, clusterSize).find(e => e.terrain === cls) ?? null)
      if (!topoEntry) return { topo: null, polys: [] as [number, number][][] }
      const shapedEntry = {
        ...topoEntry,
        rawPolys: topoEntry.rawPolys.map(p => {
          const seed = Math.abs(Math.round(p[0][0] * 73 + p[0][1] * 97))
          return shapeInputPolygon(p, terrainBlobTopoStyle, hexRadius, seed)
        }),
      }
      const shaped = shapeTerrainBlobs([shapedEntry], smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, hexRadius, {})
      return { topo: topoEntry, polys: shaped.find(b => b.terrain === cls)?.polys ?? [] }
    }
    const hillsResult = makePolys('hills', elevationBlobsCache.current?.topoHills)
    const mountainsResult = makePolys('mountains', elevationBlobsCache.current?.topoMountains)
    const blobs = { hills: hillsResult.polys, mountains: mountainsResult.polys }
    elevationBlobsCache.current = { hexKey, topoHills: hillsResult.topo, topoMountains: mountainsResult.topo, styleKey, blobs }
    prevElevationBlobsRef.current = blobs
    return blobs
  }, [isTerrainPainting, projectedHexes, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, terrainBlobTopoStyle, terrainBlobClusterSize, hexRadius, elevationTypeBlobStyles, elevationImportEnabled, classificationParams])
  const defaultElevationBlobsRef = useRef(defaultElevationBlobs)
  defaultElevationBlobsRef.current = defaultElevationBlobs

  const screenPwRef = useRef(0)

  // Compute the paper's screen rect and (lazily) init/update the overlay map
  const snapOverlay = useCallback(() => {
    const meta = metaRef.current
    if (!meta) return
    const { w: cssW, h: cssH } = frameDimsRef.current
    const { pw, ph } = getPaper(cssW, cssH)
    const canvasZoom = zoomRef.current
    const pan = panRef.current

    // Screen-space position of the paper rect (applying the canvas pan/zoom transform)
    const screenW = pw * canvasZoom
    const screenH = ph * canvasZoom
    const screenX = cssW / 2 - screenW / 2 + pan.x
    const screenY = cssH / 2 - screenH / 2 + pan.y
    setOverlayRect({ left: screenX, top: screenY, width: screenW, height: screenH })

    // MapLibre zoom: screenW pixels should span the paper's real-world width.
    const paperWidthM = meta.paper_mm[0] * meta.scale_m_per_mm
    const mlZoom = Math.log2(78271.516 * Math.cos(meta.center[1] * Math.PI / 180) * screenW / paperWidthM)

    // The MapLibre centre should be the paper's visual centre, not the geographic centre.
    // paper_offset_mm shifts the paper relative to the geographic centre.
    const [ox, oy] = meta.paper_offset_mm ?? [0, 0]
    const MPDEG = 111319
    const β = (meta.bearing * Math.PI) / 180
    const cosLat = Math.cos((meta.center[1] * Math.PI) / 180)
    const offE = (ox * Math.cos(β) - oy * Math.sin(β)) * meta.scale_m_per_mm
    const offN = (ox * Math.sin(β) + oy * Math.cos(β)) * meta.scale_m_per_mm
    const overlayCenter: [number, number] = [
      meta.center[0] + offE / (cosLat * MPDEG),
      meta.center[1] + offN / MPDEG,
    ]

    requestAnimationFrame(() => {
      const el = overlayContainerRef.current
      if (!el) return
      if (!overlayMapRef.current) {
        overlayMapRef.current = new maplibregl.Map({
          container: el,
          style: OSM_OVERLAY_STYLE,
          center: overlayCenter,
          zoom: mlZoom,
          bearing: meta.bearing,
          interactive: false,
          attributionControl: false,
        })
      } else {
        overlayMapRef.current.resize()
        overlayMapRef.current.jumpTo({ center: overlayCenter, zoom: mlZoom, bearing: meta.bearing })
      }
    })
  }, [])

  // Space / M: hold to peek
  useEffect(() => {
    let held = false
    const onDown = (e: KeyboardEvent) => {
      if ((e.code !== 'Space' && e.code !== 'KeyM') || held) return
      if (shouldSuppressShortcut(e)) return
      e.preventDefault()
      held = true
      snapOverlay()
      setMapOverlay(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'KeyM') return
      held = false
      setMapOverlay(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [snapOverlay])

  const paintHoverTargetRef = useRef<PaintHoverTarget>(null)
  const strokeTrailRef = useRef<Map<string, NonNullable<PaintHoverTarget>>>(new Map())
  const strokeTypeRef = useRef<'hex' | 'edge' | null>(null)

  type ExportTarget = { canvas: HTMLCanvasElement; pw: number; ph: number }

  const draw = useCallback((exportTarget?: ExportTarget) => {
    if (mapRefsRef.current) drawMap(mapRefsRef.current, exportTarget)
  }, [])
  const drawRef = useRef(draw)
  drawRef.current = draw

  const drawOsmHighlightRef = useRef<(() => void) | null>(null)

  const osmOverlayRefsRef = useRef<OsmOverlayRefs | null>(null)

  const drawOsmHighlight = useCallback(() => {
    if (osmOverlayRefsRef.current) _drawOsmHighlightFn(osmOverlayRefsRef.current)
  }, [])

  drawOsmHighlightRef.current = drawOsmHighlight

  // Resize canvas buffer when frameDims changes, then redraw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || frameDims.w === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = frameDims.w * dpr
    canvas.height = frameDims.h * dpr
    canvas.style.width = `${frameDims.w}px`
    canvas.style.height = `${frameDims.h}px`
    const overlay = osmOverlayCanvasRef.current
    if (overlay) {
      overlay.width = frameDims.w * dpr
      overlay.height = frameDims.h * dpr
      overlay.style.width = `${frameDims.w}px`
      overlay.style.height = `${frameDims.h}px`
    }
    const hl = highlightCanvasRef.current
    if (hl) {
      hl.width = frameDims.w * dpr
      hl.height = frameDims.h * dpr
      hl.style.width = `${frameDims.w}px`
      hl.style.height = `${frameDims.h}px`
    }
    frameDimsRef.current = frameDims
    draw()
  }, [frameDims, draw])

  // Field canvas effect — detached. Restore this useEffect when reactivating field render.
  // See terrainBlobs.ts (buildFieldCanvas) and drawTerrain.ts for the implementation.
  // useEffect(() => { ... }, [generatedHexes, terrainRenderMode, fieldFreq, fieldAmp,
  //   fieldOctaves, fieldPersistence, fieldWildness, terrainColors, terrainTextureScales,
  //   forestTextureVersion, frameDims, draw])

  // Mark terrain layer dirty when terrain-affecting data changes (fills + textures are one layer)
  useEffect(() => { terrainController.markDirty() }, [defaultTerrainBlobsSplatted, defaultTerrainBlobsMasked, defaultTerrainBlobs, defaultWaterBlobsMasked, defaultElevationBlobs, terrainColors, terrainTextureBlendModes, terrainTextureScales, terrainTextureOpacities, terrainTextureTintColors, terrainTextureTintOpacities, terrainTextureFile, terrainTextureEnabled, terrainBlobOverrides, terrainTypeBlobStyles, waterOverrides, terrainRenderMode, hexEdgeMode, generatedHexes, realisticCoastline, coastlineDebugRaw, smoothedCoastlineBoundary, rawCoastlineBoundary, beachStrip, beachColor, beachWidth, hillsColor, mountainsColor, reliefShadingOpacity, coastlineDPEpsilon, coastlineChaikinPasses, edgeBlobPainted, edgeBlobOverrides, edgeBlobWidth, mapStyle, historicalIconParams, elevationTypeBlobStyles, terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth, terrainBlobEffect, elevationOverridesTerrain, slopeEdges, slopeStyle, slopeSmoothing, slopeTickSpacing, slopeTickLength, elevationHachureEnabled, elevationShadowEnabled, elevationShadowOx, elevationShadowOy, elevationShadowBl, elevationShadowOp, elevationShadowPs, elevationShadowColor])
  useEffect(() => { terrainController.markDirty(); draw() }, [hillshadeDisabledTerrains, hillshadeDisabledElevClasses, contourDisabledTerrains, contourDisabledElevClasses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Decode heightmap PNG → ImageData when URL changes, then recompute derived canvases
  useEffect(() => {
    if (!heightmapUrl) {
      heightmapImgDataRef.current = null
      hillshadeCanvasRef.current = null
      contourCanvasRef.current = null
      terrainController.markDirty()
      draw()
      return
    }
    const img = new Image()
    img.onload = () => {
      const tmp = new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
      const ctx = tmp.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      heightmapImgDataRef.current = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight)
      const meta = heightmapMetaRef.current
      if (meta) {
        hillshadeCanvasRef.current = computeHillshade(heightmapImgDataRef.current, meta, {
          azimuth: hillshadeAzimuthRef.current,
          altitude: hillshadeAltitudeRef.current,
          intensity: hillshadeIntensityRef.current,
          mode: hillshadeModeRef.current,
        })
        if (contoursEnabledRef.current) {
          const { pw, ph } = getPaper(frameDimsRef.current.w, frameDimsRef.current.h)
          if (pw > 0 && ph > 0) contourCanvasRef.current = computeContours(heightmapImgDataRef.current, meta, {
            interval: contourIntervalRef.current,
            baseElevation: contourBaseElevationRef.current,
            indexEvery: contourIndexEveryRef.current,
            smoothPasses: contourSmoothPassesRef.current,
            color: contourColorRef.current,
            width: contourLineWidthRef.current,
            indexWidth: contourLineWidthRef.current * contourIndexWidthMultRef.current,
            opacity: contourOpacityRef.current,
          }, pw, ph)
        }
      }
      terrainController.markDirty()
      draw()
    }
    img.src = heightmapUrl
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightmapUrl])

  // Recompute hillshade when params change
  useEffect(() => {
    const imgData = heightmapImgDataRef.current
    const meta = heightmapMetaRef.current
    if (!imgData || !meta) return
    hillshadeCanvasRef.current = computeHillshade(imgData, meta, {
      azimuth: hillshadeAzimuth,
      altitude: hillshadeAltitude,
      intensity: hillshadeIntensity,
      mode: hillshadeMode,
    })
    terrainController.markDirty()
    draw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hillshadeEnabled, hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity, hillshadeMode])

  // Recompute contours when params change — debounced so slider drags don't
  // fire an expensive marching-squares pass on every tick.
  useEffect(() => {
    if (!contoursEnabled) {
      contourCanvasRef.current = null
      terrainController.markDirty()
      draw()
      return
    }
    const tid = setTimeout(() => {
      const imgData = heightmapImgDataRef.current
      const meta = heightmapMetaRef.current
      if (!imgData || !meta || !metaRef.current) return
      const { pw, ph } = getPaper(frameDimsRef.current.w, frameDimsRef.current.h)
      contourCanvasRef.current = computeContours(imgData, meta, {
        interval: contourIntervalRef.current,
        baseElevation: contourBaseElevationRef.current,
        indexEvery: contourIndexEveryRef.current,
        smoothPasses: contourSmoothPassesRef.current,
        color: contourColorRef.current,
        width: contourLineWidthRef.current,
        indexWidth: contourLineWidthRef.current * contourIndexWidthMultRef.current,
        opacity: contourOpacityRef.current,
      }, pw, ph)
      terrainController.markDirty()
      draw()
    }, 200)
    return () => clearTimeout(tid)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contoursEnabled, contourInterval, contourBaseElevation, contourSmoothPasses, contourLineWidth, contourIndexEvery, contourIndexWidthMult, contourColor, contourOpacity])

  // Mark other layer caches dirty when their relevant data changes
  // (hexBorder, buildings, settlements, highlights, hexNumbers handled by startLayerDirtySync)
  useEffect(() => {
    cachedRiverTierChainDataRef.current = riverTierChainsRaw.map(chains =>
      chains.map(c => ({ vertices: c.chain, segKey: c.segKey, hopKeys: c.hopKeys, hopRanges: c.hopRanges }))
    ) as [ChainEntry[], ChainEntry[], ChainEntry[]]
    const rv2 = [...riverTierChainsRaw[0], ...riverTierChainsRaw[1], ...riverTierChainsRaw[2]]
    riverChainsV2Ref.current = rv2
    cachedRiverChainDataRef.current = rv2.map(c => ({ vertices: c.chain, segKey: c.segKey, hopKeys: c.hopKeys, hopRanges: c.hopRanges }))
    computedRiverChainsRef.current = cachedRiverChainDataRef.current
    riverChainCache.chains = cachedRiverChainDataRef.current
    riversController.markDirty()
  }, [riverTierChainsRaw, riverWidthScale, showRiverLabels, riverLabelColor, riverSelectMode, selectedSegmentKeys, riverStyle, selectedHopKey, labelOffsets])
  useEffect(() => { roadsController.markDirty() }, [smoothedRailData, roadTierStyles, railStyle, roadSegmentProps, roadHopProps, selectedRoadSegmentKeys, selectedRoadHopKey, roadSelectMode, railSegmentProps, railHopProps, selectedRailSegmentKeys, selectedRailHopKey, railSelectMode])
  useEffect(() => {
    if (bridgesEnabled) {
      const stableRoadData = roadNetworkRef.current.getBaseData(
        roadWiggleAmpRef.current, roadWiggleFreqRef.current,
        roadSegmentPropsRef.current, roadHopPropsRef.current, 2,
      )
      const riverHWFor = (segKey: string) => {
        const p = riverSegmentPropsRef.current[segKey]
        return p?.width !== undefined ? 1.4 * p.width : 1.4 * riverWidthScaleRef.current
      }
      detectedBridgesRef.current = detectBridges(
        stableRoadData.chains,
        smoothedRailData.chains,
        cachedRiverChainDataRef.current.map(c => ({ vertices: c.vertices, halfWidth: riverHWFor(c.segKey) })),
      )
    } else {
      detectedBridgesRef.current = []
    }
  }, [bridgesEnabled, roadDataVersion, smoothedRailData, riverEdges, generatedHexes])
  // When entering label-drag mode, rebuild label layers so the bbox cache is populated for hit-testing
  useEffect(() => {
    if (activeTool.type === 'label-drag') {
      riversController.markDirty()
      settlementsController.markDirty()
    }
  }, [activeTool.type])

  // Redraw when data changes
  useEffect(() => { draw() }, [defaultElevationBlobs, generatedHexes, hexBorderMode, hexEdgeMode, hexBorderOpacity, hexBorderColor, hexBorderDifference, hexNumbersEnabled, hexNumberEdge, hexNumberColor, hexNumberFontScale, hexNumberStartCorner, hexNumberMap, roadDataVersion, smoothedRailData, showRawOsmRoads, roadNodeEditMode, riverNodeEditMode, riverChainOverrides, riverEdges, riverEditMode, riverWidthScale, riverWiggleFreq, riverWiggleAmp, riverSmoothing, riverPathSmoothing, showRiverLabels, riverLabelColor, riverSegmentProps, riverSelectMode, selectedSegmentKeys, riverTierStyles, riverStyle, riverHopProps, selectedHopKey, defaultTerrainBlobs, defaultWaterBlobsMasked, terrainColors, terrainTextureScales, terrainTextureBlendModes, terrainTextureOpacities, terrainTextureTintColors, terrainTextureTintOpacities, terrainTextureFile, terrainTextureEnabled, terrainBlobOverrides, terrainTypeBlobStyles, waterOverrides, terrainRenderMode, settlements, settlementTierStyles, urbanHexes, urbanStyle, roadTierStyles, railStyle, highlights, highlightedHexes, highlightLines, highlightEdgePaths, iconOverlays, placedIcons, labelOverlays, placedLabels, realisticCoastline, coastlineDebugRaw, smoothedCoastlineBoundary, rawCoastlineBoundary, beachStrip, beachColor, beachWidth, coastlineDPEpsilon, coastlineChaikinPasses, edgeBlobPainted, edgeBlobOverrides, edgeBlobWidth, roadSegmentProps, roadHopProps, selectedRoadSegmentKeys, selectedRoadHopKey, roadSelectMode, railNodeEditMode, railControlOverrides, railSelectMode, railWiggleAmp, railWiggleFreq, railSmoothing, railSegmentProps, railHopProps, selectedRailSegmentKeys, selectedRailHopKey, mapBgColor, mapBorderEnabled, mapBorderColor, mapBorderWidth, clipToHexGrid, excludedHexKeys, disabledHexKeys, autoDisabledOceanHexKeys, megaHexEnabled, megaHexRadius, megaHexColor, megaHexOpacity, megaHexLineWidth, megaHexOriginQ, megaHexOriginR, bridgesEnabled, bridgeStyle, bridgeLengthScale, bridgeTiers, bridgeOverrides, showElevationDebug, showElevationClassOverlay, mapStyle, labelOffsets, labelPresetId, labelOverrides, activeTool, blobEditMode, activeBlobEditId, blobHandleOverrides, blobMaskEdits, defaultTerrainBlobsMasked, draw])

  useEffect(() => { drawOsmHighlight() }, [osmHighlightTier, osmHighlightType, osmSpotlightMode, osmSpotlightTiers, osmRailHighlight, hoveredOsmRiverIdx, drawOsmHighlight])

  useEffect(() => {
    if (!mapImageDataUrl) { mapImageElementRef.current = null; draw(); return }
    const img = new Image()
    img.onload = () => { mapImageElementRef.current = img; draw() }
    img.src = mapImageDataUrl
  }, [mapImageDataUrl, draw])

  useEffect(() => { draw() }, [mapImageTransform, mapImageOpacity, draw])

  useEffect(() => {
    if (!worldcoverImageUrl) {
      worldcoverImageElementRef.current = null
      worldcoverOffscreenRef.current = null
      draw()
      return
    }
    const img = new Image()
    img.onload = () => {
      worldcoverImageElementRef.current = img
      const off = new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
      const octx = off.getContext('2d')!
      octx.drawImage(img, 0, 0)
      worldcoverOffscreenRef.current = off
      draw()
    }
    img.src = worldcoverImageUrl
  }, [worldcoverImageUrl, draw])

  useEffect(() => { draw() }, [showWorldcoverOverlay, draw])
  useEffect(() => { if (dataSource === 'map_image') draw() }, [mapOverlay, dataSource, draw])
  useEffect(() => { requestDraw.fn = draw; return () => { requestDraw.fn = null } }, [draw])

  // Load all terrain textures into a shared cache
  useEffect(() => {
    for (const { id } of TEXTURE_OPTIONS) {
      const img = new Image()
      img.src = TEXTURE_PATHS[id] ?? `/textures/${id}.png`
      img.onload = () => { textureCacheRef.current.set(id, img); terrainController.markDirty(); draw() }
      img.onerror = () => { /* texture not present — silently skip */ }
    }
  }, [draw])

  // Load historical icon images — one batch per terrain. Each terrain's images must all
  // load before they're written to the ref, so a partial set never reaches the renderer.
  useEffect(() => {
    const ICON_PATHS: Record<string, string[]> = {
      woods:       ['tree1.png', 'tree2.png', 'tree3.png'],
      light_woods: ['tree1.png', 'tree2.png', 'tree3.png'],
    }
    for (const [terrain, files] of Object.entries(ICON_PATHS)) {
      const loaded: HTMLImageElement[] = []
      let remaining = files.length
      for (const file of files) {
        const img = new Image()
        img.src = new URL(`../../textures/historical/${file}`, import.meta.url).href
        img.onload = () => {
          loaded.push(img)
          remaining--
          if (remaining === 0) {
            historicalIconSetsRef.current = { ...historicalIconSetsRef.current, [terrain]: loaded }
            terrainController.markDirty()
            draw()
          }
        }
        img.onerror = () => {
          remaining--
          if (remaining === 0 && loaded.length > 0) {
            historicalIconSetsRef.current = { ...historicalIconSetsRef.current, [terrain]: loaded }
            terrainController.markDirty()
            draw()
          }
        }
      }
    }
  }, [draw])


  // ResizeObserver — canvas fills the full container.
  // setFrameDims is debounced (150ms) so rapid window resizing doesn't trigger
  // repeated expensive useMemo recomputes (projectedHexes → terrain blobs → dirty flags).
  const meta = generatedMetadata
  useEffect(() => {
    const el = containerRef.current
    if (!el || !meta) return
    let rafId: number | null = null
    const compute = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setFrameDims({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })
      })
    }
    setFrameDims({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => { ro.disconnect(); if (rafId !== null) cancelAnimationFrame(rafId) }
  }, [meta])

  useEffect(() => {
    return () => {
      terrainController.dispose()
      hexBorderController.dispose()
      highlightsController.dispose()
      riversController.dispose()
      buildingsController.dispose()
      settlementsController.dispose()
      roadsController.dispose()
      hexNumbersController.dispose()
    }
  }, [])

  // Set zoom so 1 CSS pixel = 1/96 inch → physical hex size matches screen
  const zoomToPhysical = useCallback(() => {
    const meta = generatedMetadata
    if (!meta) return
    const { w: cssW, h: cssH } = frameDimsRef.current
    const { pw } = getPaper(cssW, cssH)
    const targetZoom = Math.max(0.2, Math.min(6, meta.paper_mm[0] * 96 / (pw * 25.4)))
    zoomRef.current = targetZoom
    panRef.current = { x: 0, y: 0 }
    terrainController.markDirty()
    hexBorderController.markDirty()
    highlightsController.markDirty()
    riversController.markDirty()
    buildingsController.markDirty()
    settlementsController.markDirty()
    draw()
  }, [generatedMetadata, draw])

  // Wheel zoom — cursor-centred, clamped [0.2, 20]
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      const oldZoom = zoomRef.current
      const factor = e.deltaY < 0 ? 1.12 : 0.9
      const newZoom = Math.max(0.2, Math.min(20, oldZoom * factor))
      const scale = newZoom / oldZoom
      const oldPan = panRef.current
      zoomRef.current = newZoom
      panRef.current = {
        x: cx * (1 - scale) + oldPan.x * scale,
        y: cy * (1 - scale) + oldPan.y * scale,
      }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw() })
      if (mapOverlayRef.current) snapOverlay()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [draw, snapOverlay])

  // Expand mode: fit paper to screen (zoom=1, pan=0) + show slippy map overlay
  useEffect(() => {
    if (expandMode) {
      const meta = metaRef.current
      const { w: cssW, h: cssH } = frameDimsRef.current
      if (!meta || cssW === 0) return
      // Reset to fit-to-screen so the full paper is visible and button positions
      // equal the unzoomed paperDims coords (zoom=1 → no transform needed)
      zoomRef.current = 1
      panRef.current = { x: 0, y: 0 }
      terrainController.markDirty()
      draw()
      const { px, py, pw, ph } = getPaper(cssW, cssH)
      setExpandPaperRect({ px, py, pw, ph })
      snapOverlay()
      setMapOverlay(true)
    } else {
      setMapOverlay(false)
      setExpandPaperRect(null)
    }
  }, [expandMode, draw, snapOverlay])

  // Drag pan (left-click drag or middle-mouse — left is suppressed in paint mode)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1 && e.button !== 0) return
      if (e.button === 0 && (e.target as HTMLElement).tagName !== 'CANVAS') return
      if (e.button === 0 && (terrainPaintModeRef.current || elevationPaintModeRef.current || roadPaintModeRef.current || railPaintModeRef.current || riverEditModeRef.current || activeToolRef.current.type === 'hex-mask' || activeToolRef.current.type === 'mega-hex-origin' || activeToolRef.current.type === 'align-image' || activeToolRef.current.type === 'blob-mask')) return
      if (e.button === 0 && (highlightPaintModeRef.current || highlightLineEraserRef.current)) return
      if (e.button === 0 && draggingCpKeyRef.current) return
      e.preventDefault()
      isPanningRef.current = true
      panStartRef.current = { x: e.clientX, y: e.clientY }
      panOriginRef.current = { ...panRef.current }
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return
      panRef.current = {
        x: panOriginRef.current.x + e.clientX - panStartRef.current.x,
        y: panOriginRef.current.y + e.clientY - panStartRef.current.y,
      }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw() })
      if (mapOverlayRef.current) snapOverlay()
    }
    const onUp = () => {
      isPanningRef.current = false
      el.style.cursor = ''
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draw, snapOverlay])

  // Global Escape key: deactivate the current tool
  const setActiveToolRef = useRef(setActiveTool)
  setActiveToolRef.current = setActiveTool
  const setLabelOffsetRef = useRef(setLabelOffset)
  setLabelOffsetRef.current = setLabelOffset
  const clearLabelOffsetRef = useRef(clearLabelOffset)
  clearLabelOffsetRef.current = clearLabelOffset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (shouldSuppressShortcut(e)) return
      // Restore previous offset if cancelling a label-follow
      const tool = activeToolRef.current
      if (tool.type === 'label-follow') {
        const t = tool as { type: 'label-follow'; id: string; prevDx: number; prevDy: number }
        // Restore previous offset (or clear if there was none before)
        if (t.prevDx !== 0 || t.prevDy !== 0) setLabelOffsetRef.current(t.id, t.prevDx, t.prevDy)
        else clearLabelOffsetRef.current(t.id)
        liveLabelOffsetRef.current = null
      }
      setActiveToolRef.current({ type: 'none' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const clientToLogical = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const { w: cssW, h: cssH } = frameDimsRef.current
    if (!canvas || cssW === 0) return null
    const rect = canvas.getBoundingClientRect()
    const zoom = zoomRef.current, pan = panRef.current
    return {
      lx: (clientX - rect.left - cssW / 2 - pan.x) / zoom + cssW / 2,
      ly: (clientY - rect.top - cssH / 2 - pan.y) / zoom + cssH / 2,
      cssW,
      cssH,
    }
  }, [])
  const clientToLogicalRef = useRef(clientToLogical)
  clientToLogicalRef.current = clientToLogical

  // Unified terrain + edge blob paint with live hover highlight
  const isPaintingRef = useRef(false)
  const lastPaintedKeyRef = useRef<string | null>(null)
  const lastPaintedEdgeKeyRef = useRef<string | null>(null)
  // Deferred paint ops — flushed as a single batch on mouseup to avoid per-hex store updates
  const pendingTerrainPaintRef = useRef<{ q: number; r: number; terrain: string }[]>([])
  const pendingBgPaintRef = useRef<{ q: number; r: number; terrain: string | undefined }[]>([])
  const pendingElevationPaintRef = useRef<{ q: number; r: number; cls: 'flat' | 'hills' | 'mountains' }[]>([])
  const pendingEraseTerrainRef = useRef<{ q: number; r: number }[]>([])
  // Fast hex lookup rebuilt at stroke start (vertices are stable geometry)
  const hexGeomMapRef = useRef<Map<string, { vertices: [number, number][] }>>(new Map())
  const batchOverrideHexTerrainRef = useRef(batchOverrideHexTerrain)
  const batchOverrideHexBackgroundRef = useRef(batchOverrideHexBackground)
  const batchOverrideHexElevationRef = useRef(batchOverrideHexElevation)
  const batchResetHexOverrideRef = useRef(batchResetHexOverride)
  batchOverrideHexTerrainRef.current = batchOverrideHexTerrain
  batchOverrideHexBackgroundRef.current = batchOverrideHexBackground
  batchOverrideHexElevationRef.current = batchOverrideHexElevation
  batchResetHexOverrideRef.current = batchResetHexOverride

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachTerrainPaintHandlers(el, {
      metaRef, hexesRef, frameDimsRef, hexEdgeModeRef,
      terrainEdgePaintEnabledRef, terrainBackgroundPaintEnabledRef,
      terrainPaintModeRef, elevationPaintModeRef,
      edgePaintHoldRef, bgPaintHoldRef,
      isPaintingRef, lastPaintedKeyRef, lastPaintedEdgeKeyRef,
      strokeTrailRef, strokeTypeRef, paintHoverTargetRef,
      pendingTerrainPaintRef, pendingBgPaintRef, pendingElevationPaintRef, pendingEraseTerrainRef,
      hexGeomMapRef, terrainPaintBrushRef, elevationPaintBrushRef,
      edgeBlobPaintedRef, hoverRafRef,
      batchOverrideHexTerrainRef, batchOverrideHexBackgroundRef, batchOverrideHexElevationRef,
      batchResetHexOverrideRef,
      eraseEdgeBlobRef, paintEdgeBlobRef,
      clientToLogical, getPaper, draw, setIsTerrainPainting,
    })
  }, [draw, clientToLogical, getPaper])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachHexDisableHandlers(el, {
      metaRef, hexesRef, activeToolRef, toggleDisabledHexRef, clientToLogical, getPaper,
    })
  }, [clientToLogical, getPaper])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachHexMaskHandlers(el, {
      metaRef, hexesRef, activeToolRef, toggleExcludedHexRef, clientToLogical, getPaper,
    })
  }, [clientToLogical, getPaper])

  // Recompute auto-disabled ocean hexes when coastline setting or hexes change
  useEffect(() => {
    if (autoDisabledOceanHexKeysRef.current.length === 0) return
    const hexes = hexesRef.current
    if (!hexes || hexes.length === 0) return
    const NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
    const hexByKey = new Map(hexes.map(h => [`${h.q},${h.r}`, h]))
    const keys: string[] = []
    for (const h of hexes) {
      if (h.terrain !== 'water') continue
      const touchesLand = NEIGHBORS.some(([dq, dr]) => {
        const nb = hexByKey.get(`${h.q + dq},${h.r + dr}`)
        return nb && nb.terrain !== 'water'
      })
      if (!touchesLand) keys.push(`${h.q},${h.r}`)
    }
    setAutoDisabledOceanHexKeysRef.current(keys)
  }, [realisticCoastline, generatedHexes])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachMegaHexHandlers(el, {
      metaRef, hexesRef, activeToolRef, clientToLogicalRef, setMegaHexOriginRef, getPaper,
    })
  }, [])

  // Road/rail paint — edge between consecutive hexes visited in a stroke
  const prevEdgeHexRef = useRef<{ q: number; r: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachRoadRailPaintHandlers(el, {
      metaRef, hexesRef, hexEdgeModeRef, roadPaintModeRef, railPaintModeRef,
      roadPaintBrushRef, roadPaintEraserRef, railPaintEraserRef,
      isPaintingRef, prevEdgeHexRef,
      paintBufferedAdditionsRef, paintBufferedRemovalsRef,
      railBufferedAdditionsRef, railBufferedRemovalsRef,
      skipExpensiveLayersRef, roadNetworkRef,
      batchAddRoadEdgesRef, batchRemoveRoadEdgesRef,
      addRoadEdgeRef, removeRoadEdgeAllTiersRef,
      batchAddRailEdgesRef, batchRemoveRailEdgesRef,
      addRailEdgeRef, removeRailEdgeRef,
      drawRef, clientToLogical, getPaper, setRoadDataVersion,
    })
  }, [clientToLogical, getPaper])

  // Control point drag
  const draggingCpKeyRef = useRef<string | null>(null)
  const draggingCpGroupKeysRef = useRef<string[]>([])
  const snapPreviewRef = useRef<SnapTarget | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachControlPointDragHandlers(el, {
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
    })
  }, [draw, clientToLogical, getPaper])


  // Highlight line drag-paint
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachHighlightLineHandlers(el, {
      metaRef, hexesRef, hexEdgeModeRef, activePanelRef,
      highlightsRef, highlightLinesRef, activeHighlightIdRef,
      highlightPaintModeRef, highlightLineEraserRef,
      startNewLineSegmentRef, appendHexToLineRef, truncateHighlightLineRef, eraseHexFromLineRef,
      clientToLogical, getPaper,
    })
  }, [clientToLogical, getPaper])

  // Perf HUD — toggle with backtick (`), auto-shows when frames exceed threshold
  const [perfHudVisible, setPerfHudVisible] = useState(false)
  const perfHudRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' && !shouldSuppressShortcut(e)) setPerfHudVisible(v => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const perf = (window as any).__ig2perf
    if (!perf || !perfHudVisible) return
    const id = setInterval(() => {
      const el = perfHudRef.current
      if (!el) return
      const frames: import('../lib/perfMonitor').DrawFrameRecord[] = perf.dump(8)
      if (!frames.length) return
      const last = frames[frames.length - 1]
      const avgMs = frames.reduce((s, f) => s + f.ms, 0) / frames.length
      const fps = avgMs > 0 ? Math.round(1000 / avgMs) : 0
      const slow = avgMs > 30
      const { terrain, rivers, roads, settlements } = last.sectionMs
      const b = last.blitMs
      const totalBlit = b.terrain + b.hexBorder + b.highlights + b.rivers + b.buildings + b.roads + b.settlements
      el.style.borderColor = slow ? '#f55' : '#0f0'
      el.style.color = slow ? '#f88' : '#8f8'
      el.innerHTML =
        `<b>${avgMs.toFixed(0)}ms avg &nbsp; ${fps}fps</b>\n` +
        `rebuilt: ${last.rebuiltLayers.join(',') || 'none'}\n` +
        `terrain  ${terrain.toFixed(0)}ms\n` +
        `rivers   ${rivers.toFixed(0)}ms\n` +
        `roads    ${roads.toFixed(0)}ms\n` +
        `settle   ${settlements.toFixed(0)}ms\n` +
        `─────────────────\n` +
        `blits    ${totalBlit.toFixed(0)}ms total\n` +
        (b.terrain > 1     ? ` T=${b.terrain.toFixed(0)}` : '') +
        (b.hexBorder > 1   ? ` HB=${b.hexBorder.toFixed(0)}` : '') +
        (b.highlights > 1  ? ` HL=${b.highlights.toFixed(0)}` : '') +
        (b.rivers > 1      ? ` Rv=${b.rivers.toFixed(0)}` : '') +
        (b.buildings > 1   ? ` Bld=${b.buildings.toFixed(0)}` : '') +
        (b.roads > 1       ? ` Rd=${b.roads.toFixed(0)}` : '') +
        (b.settlements > 1 ? ` S=${b.settlements.toFixed(0)}` : '') +
        (() => {
          const layerVram = terrainController.estimatedBytes + hexBorderController.estimatedBytes + highlightsController.estimatedBytes + riversController.estimatedBytes + buildingsController.estimatedBytes + settlementsController.estimatedBytes + roadsController.estimatedBytes
          const texStats = getColorTextureCacheStats()
          const totalMB = ((layerVram + texStats.estimatedBytes) / 1024 / 1024).toFixed(0)
          const layerMB = (layerVram / 1024 / 1024).toFixed(0)
          const texMB = (texStats.estimatedBytes / 1024 / 1024).toFixed(0)
          const mem = (performance as any).memory
          const heapMB = mem ? (mem.usedJSHeapSize / 1024 / 1024).toFixed(0) : '?'
          const roadsRebuilds = roadsRebuildCountRef.current
          const bitmapStatus = [
            `T:${terrainController.hasBitmap ? 'B' : 'C'}`,
            `HB:${hexBorderController.hasBitmap ? 'B' : 'C'}`,
            `HL:${highlightsController.hasBitmap ? 'B' : 'C'}`,
            `Rv:${riversController.hasBitmap ? 'B' : 'C'}`,
            `Bld:${buildingsController.hasBitmap ? 'B' : 'C'}`,
            `Rd:${roadsController.hasBitmap ? 'B' : 'C'}`,
            `S:${settlementsController.hasBitmap ? 'B' : 'C'}`,
          ].join(' ')
          return (
            `\n─────────────────\nVRAM ~${totalMB}MB  layers:${layerMB} tex:${texMB}(${texStats.entries})` +
            `\nJS heap ${heapMB}MB  roads ×${roadsRebuilds}` +
            `\n${bitmapStatus}`
          )
        })()
    }, 250)
    return () => clearInterval(id)
  }, [perfHudVisible])

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null)
  const [settlementRename, setSettlementRename] = useState<{ index: number; name: string; x: number; y: number } | null>(null)
  const [blobFlyout, setBlobFlyout] = useState<{
    type: 'terrain' | 'water' | 'edge'
    canonicalKey: string
    terrain?: string
    x: number
    y: number
  } | null>(null)

  const findHexAtClient = useCallback((clientX: number, clientY: number) => {
    const meta = metaRef.current
    if (!meta) return null
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return null
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    const mgPx = meta.margin_mm * (pw / meta.paper_mm[0])
    const inMargin = (verts: [number, number][]) =>
      verts.every(([x, y]) => x >= px + mgPx && x <= px + pw - mgPx && y >= py + mgPx && y <= py + ph - mgPx)
    for (const hex of hexesRef.current) {
      if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (!hex.partial && !inMargin(verts)) continue
      if (pointInPolygon(lx, ly, verts)) return hex
    }
    return null
  }, [clientToLogical])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return attachContextMenuHandlers(el, {
      metaRef, hexesRef, hexRadiusRef,
      settlementsRef, labelBBoxCacheRef, labelOffsetsRef,
      updateSettlementRef, deleteSettlementRef, clearLabelOffsetRef,
      setActiveToolRef,
      roadControlOverridesRef, deleteRoadControlOverrideRef, setRoadControlOverrideRef,
      roadNodeEditModeRef, roadNetworkRef, roadWiggleAmpRef, roadWiggleFreqRef,
      roadSegmentPropsRef, roadHopPropsRef, roadSelectModeRef,
      roadChainOverridesRef, deleteRoadChainOverrideRef,
      hoveredChainRef, setSelectedRoadSegmentKeysRef, setSelectedRoadHopKeyRef,
      railNodeEditModeRef, railControlOverridesRef, deleteRailControlOverrideRef,
      railChainOverridesRef, deleteRailChainOverrideRef,
      smoothedRailDataRef, setSelectedRailSegmentKeysRef, setSelectedRailHopKeyRef,
      riverChainsV2Ref, riverEditModeRef, setSelectedSegmentKeysRef, setSelectedHopKeyRef,
      roadEdgesRef,
      blobComponentsRef, blobComponentsByTerrainRef, defaultTerrainBlobsRef, defaultWaterBlobsRef,
      edgeBlobPaintedRef, hexVertMapRef, randomizeBlobSeedRef, eraseEdgeBlobRef,
      bridgesEnabledRef, detectedBridgesRef, bridgeOverridesRef, bridgeTiersRef,
      setBridgeOverrideRef, clearBridgeOverrideRef,
      clientToLogicalRef, getPaper, findHexAtClient,
      setCtxMenu, setSettlementRename, setBlobFlyout,
    })

  }, [findHexAtClient])

  // Blob handle editing — select blob, drag perimeter vertex/edge handles
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    return attachBlobHandleHandlers(el, {
      zoomRef, hexRadiusRef, blobEditModeRef, activeBlobEditIdRef,
      hoveredBlobCkRef, hoveredVertexHandleRef, hoveredEdgeHandleRef,
      blobHandleDataRef, blobHandleOverridesRef, blobDragLiveRef,
      defaultTerrainBlobsRef, paperDimsRef, rafRef,
      setBlobHandleOverrideRef, setActiveBlobEditIdRef,
      clientToLogicalRef, draw,
    })
  }, [draw])

  useEffect(() => {
    const el = canvasRef.current?.parentElement as HTMLElement | null
    if (!el) return
    return attachSlopeHandlers(el, {
      metaRef, hexesRef, slopeModeRef, slopeHoverTargetRef,
      setSlopeEdgeRef, removeSlopeEdgeRef, batchSetSlopeEdgesRef, batchRemoveSlopeEdgesRef, slopeEdgesRef,
      clientToLogical, getPaper, draw,
    })
  }, [clientToLogical, getPaper, draw])

  // Click → select hex
  const draggedRef = useRef(false)
  const edgeDragRef = useRef<{ mode: 'add' | 'remove'; painted: Set<string>; pendingRiverToggles: Array<[number, number, number, number]> } | null>(null)
  const mouseHandlerRefsRef = useRef<MouseHandlerRefs | null>(null)

  const mapRefsRef = useRef<MapRefs | null>(null)

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mouseHandlerRefsRef.current) handleMouseMove(e, mouseHandlerRefsRef.current)
  }, [])

  const onMouseLeave = useCallback(() => {
    if (mouseHandlerRefsRef.current) handleMouseLeave(mouseHandlerRefsRef.current)
  }, [])


  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mouseHandlerRefsRef.current) handleClick(e, mouseHandlerRefsRef.current)
  }, [])


  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mouseHandlerRefsRef.current) handleDoubleClick(e, mouseHandlerRefsRef.current)
  }, [])

  const alignImageDragRef = useRef<{ startX: number; startY: number; startTX: number; startTY: number } | null>(null)


  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mouseHandlerRefsRef.current) handleMouseDown(e, mouseHandlerRefsRef.current)
  }, [])


  useImperativeHandle(ref, () => ({
    exportBlob: () => new Promise<{ blob: Blob; paperMm: [number, number] } | null>(resolve => {
      const meta = metaRef.current
      if (!meta) { resolve(null); return }
      const PX_PER_MM = 300 / 25.4
      const pw = Math.round(meta.paper_mm[0] * PX_PER_MM)
      const ph = Math.round(meta.paper_mm[1] * PX_PER_MM)
      const offscreen = document.createElement('canvas')
      offscreen.width = pw
      offscreen.height = ph
      draw({ canvas: offscreen, pw, ph })
      offscreen.toBlob(blob => {
        if (!blob) { resolve(null); return }
        resolve({ blob, paperMm: meta.paper_mm as [number, number] })
      }, 'image/png')
    }),

    exportSheets: () => new Promise<{ blob: Blob; paperMm: [number, number] }[] | null>(resolve => {
      const meta = metaRef.current
      if (!meta) { resolve(null); return }
      const grid = pageGridRef.current
      const { colWidths, rowHeights } = grid

      // Single-sheet: fall back to standard export
      if (colWidths.length === 1 && rowHeights.length === 1) {
        const PX_PER_MM = 300 / 25.4
        const pw = Math.round(meta.paper_mm[0] * PX_PER_MM)
        const ph = Math.round(meta.paper_mm[1] * PX_PER_MM)
        const offscreen = document.createElement('canvas')
        offscreen.width = pw
        offscreen.height = ph
        draw({ canvas: offscreen, pw, ph })
        offscreen.toBlob(blob => {
          if (!blob) { resolve(null); return }
          resolve([{ blob, paperMm: meta.paper_mm as [number, number] }])
        }, 'image/png')
        return
      }

      const PX_PER_MM = 300 / 25.4
      const totalWMm = meta.paper_mm[0]
      const totalHMm = meta.paper_mm[1]
      const fullW = Math.round(totalWMm * PX_PER_MM)
      const fullH = Math.round(totalHMm * PX_PER_MM)

      // Render the full combined canvas once at print resolution
      const full = document.createElement('canvas')
      full.width = fullW
      full.height = fullH
      draw({ canvas: full, pw: fullW, ph: fullH })

      // Each seam bleeds by margin_mm on each side so adjacent sheets overlap
      // when physically assembled. Outer edges do not bleed.
      const bleedMm = meta.margin_mm

      const results: { blob: Blob; paperMm: [number, number] }[] = []
      let pending = colWidths.length * rowHeights.length

      let yOffMm = 0
      for (let row = 0; row < rowHeights.length; row++) {
        const cellHMm = rowHeights[row]
        const bleedTop    = row > 0                        ? bleedMm : 0
        const bleedBottom = row < rowHeights.length - 1    ? bleedMm : 0
        let xOffMm = 0
        for (let col = 0; col < colWidths.length; col++) {
          const cellWMm = colWidths[col]
          const cellIdx = row * colWidths.length + col
          const bleedLeft  = col > 0                       ? bleedMm : 0
          const bleedRight = col < colWidths.length - 1    ? bleedMm : 0

          // Source rect in the full render, extended by bleed into neighbours
          const srcX = Math.round((xOffMm - bleedLeft)  * PX_PER_MM)
          const srcY = Math.round((yOffMm - bleedTop)    * PX_PER_MM)
          const srcW = Math.round((cellWMm + bleedLeft + bleedRight)  * PX_PER_MM)
          const srcH = Math.round((cellHMm + bleedTop  + bleedBottom) * PX_PER_MM)

          const sheet = document.createElement('canvas')
          sheet.width = srcW
          sheet.height = srcH
          const sCtx = sheet.getContext('2d')!
          sCtx.drawImage(full, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

          const sheetMm: [number, number] = [cellWMm + bleedLeft + bleedRight, cellHMm + bleedTop + bleedBottom]
          sheet.toBlob(blob => {
            if (blob) results[cellIdx] = { blob, paperMm: sheetMm }
            if (--pending === 0) resolve(results.filter(Boolean).length === colWidths.length * rowHeights.length ? results : null)
          }, 'image/png')

          xOffMm += cellWMm
        }
        yOffMm += cellHMm
      }
    }),
    getPaperRect: () => {
      const meta = metaRef.current
      const { w, h } = frameDimsRef.current
      if (!meta || w === 0) return null
      return getPaper(w, h)
    },
    peekStart: () => { snapOverlay(); setMapOverlay(true) },
    peekEnd: () => setMapOverlay(false),
    zoomToPhysical,
    captureThumb: () => {
      const meta = metaRef.current
      if (!meta) return null
      // Render at screen DPI (96) — no surround, no pan/zoom, just the paper
      const PX_PER_MM = 96 / 25.4
      const fullW = Math.round(meta.paper_mm[0] * PX_PER_MM)
      const fullH = Math.round(meta.paper_mm[1] * PX_PER_MM)
      const MAX = 1800
      const scale = Math.min(1, MAX / fullW)
      const pw = Math.round(fullW * scale)
      const ph = Math.round(fullH * scale)
      const offscreen = document.createElement('canvas')
      offscreen.width = pw
      offscreen.height = ph
      draw({ canvas: offscreen, pw, ph })
      return offscreen.toDataURL('image/jpeg', 0.88)
    },
  }))

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
      if (spotlightRafRef.current !== null) cancelAnimationFrame(spotlightRafRef.current)
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current)
    }
  }, [])

  const drawHighlightPolys = useCallback((polys: [number,number][][], lines?: [number,number][][]) => {
    const hlCanvas = highlightCanvasRef.current
    if (!hlCanvas) return
    const { w: cssW, h: cssH } = frameDimsRef.current
    const dpr = window.devicePixelRatio || 1
    const ctx = hlCanvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, hlCanvas.width, hlCanvas.height)
    const zoom = zoomRef.current, pan = panRef.current
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(cssW / 2 + pan.x, cssH / 2 + pan.y)
    ctx.scale(zoom, zoom)
    ctx.translate(-cssW / 2, -cssH / 2)
    for (const poly of polys) {
      if (poly.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(poly[0][0], poly[0][1])
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1])
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 5 / zoom
      ctx.setLineDash([])
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.5 / zoom
      ctx.setLineDash([5 / zoom, 3 / zoom])
      ctx.stroke()
      ctx.setLineDash([])
    }
    for (const line of (lines ?? [])) {
      if (line.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(line[0][0], line[0][1])
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1])
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 8 / zoom
      ctx.setLineDash([])
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([6 / zoom, 4 / zoom])
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()
  }, [])

  const clearHighlight = useCallback(() => {
    const hlCanvas = highlightCanvasRef.current
    if (!hlCanvas) return
    hlCanvas.getContext('2d')?.clearRect(0, 0, hlCanvas.width, hlCanvas.height)
  }, [])

  const menuItemStyle: CSSProperties = {
    padding: '5px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
    fontFamily: t.mono, fontSize: 11,
  }

  mapRefsRef.current = {
    activeBlobEditIdRef, activeIconOverlayIdRef, activeToolRef, appliedOsmRiverIndicesRef, autoDisabledOceanHexKeysRef, beachColorRef, beachStripRef, beachWidthRef,
    bgPaintHoldRef, blobComponentsByTerrainRef, blobComponentsRef, blobDragLiveRef, blobEditModeRef, blobHandleDataRef, blobHandleOverridesRef, blobMaskDrawingRef,
    blobMaskStrokeRef, bridgeOverridesRef, bridgeLengthScaleRef, bridgeStyleRef, bridgeTiersRef, bridgesEnabledRef, cachedRiverChainDataRef, cachedRiverTierChainDataRef, canvasRef,
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
    megaHexOriginRRef, megaHexRadiusRef, metaRef, mountainsColorRef, osmRiverWaysRef, pageGridRef, paintHoverTargetRef,
    panRef, patternCacheRef, placedIconsRef, placedLabelsRef, projectedHexesRef, railBaseDataRef, railControlOverridesRef, railEdgesRef,
    railGeomOverrideRef, railHopPropsRef, railNodeEditModeRef, railPathSmoothingRef, railSegmentPropsRef, railSmoothingRef, railStyleRef, railWiggleAmpRef,
    railWiggleFreqRef, rawCoastlineBoundaryRef, rawRoadWaysRef, realisticCoastlineRef, reliefShadingOpacityRef, resolvedLabelSpecsRef, riverChainOverridesRef, riverChainsV2Ref,
    riverEdgesRef, riverHopPropsRef, riverNodeEditModeRef, riverPathSmoothingRef, riverSegmentPropsRef, riverSmoothingRef, riverStyleRef, riverTierStylesRef,
    riverWiggleAmpRef, riverWiggleFreqRef, roadCenterPullRef, roadChainOverridesRef, roadControlOverridesRef, roadEdgesRef, roadHopPropsRef, roadNetworkRef,
    roadNodeEditModeRef, roadPathSmoothingRef, roadProjectionCacheRef, roadSegmentPropsRef, roadSmoothingRef, roadTierGeometryRef, roadTierStylesRef, roadWiggleAmpRef,
    roadWiggleFreqRef, roadsRebuildCountRef, screenPwRef, selectedHopKeyRef, selectedSegmentKeysRef, settlementTierStylesRef, settlementsRef, showElevationClassOverlayRef,
    showElevationDebugRef, showRawOsmRoadsRef, showRiverLabelsRef, showWorldcoverOverlayRef, skipExpensiveLayersRef, smoothedCoastlineBoundaryRef, smoothedRailDataRef, snapPreviewRef,
    strokeTrailRef, terrainBackgroundPaintEnabledRef, terrainBlobBumpRef, terrainBlobEffectRef, terrainBlobLobeAmpRef, terrainBlobLobeDirectionRef, terrainBlobLobeFreqRef, terrainBlobLobeThresholdRef,
    terrainBlobOffsetRef, terrainBlobOutlineColorRef, terrainBlobOutlineEnabledRef, terrainBlobOutlineWidthRef, terrainBlobOverridesRef, terrainBlobSmoothRef, terrainBlobSweepFreqRef, terrainBlobTopoStyleRef, terrainBlobClusterSizeRef,
    terrainColorsRef, terrainPaintBrushRef, terrainPaintModeRef, terrainTextureBlendModesRef, terrainTextureEnabledRef, terrainTextureFileRef, terrainTextureOpacitiesRef, terrainTextureScalesRef,
    terrainTextureTintColorsRef, terrainTextureTintOpacitiesRef, terrainTypeBlobStylesRef, textureCacheRef, urbanHexesRef, urbanStyleRef, waterOverridesRef, worldcoverImageElementRef,
    zoomRef, getPaperRef, surroundColorRef,
    edgeDragRef,
    elevationHachureEnabledRef, elevationShadowEnabledRef, elevationShadowOxRef, elevationShadowOyRef, elevationShadowBlRef, elevationShadowOpRef, elevationShadowPsRef, elevationShadowColorRef, slopeEdgesRef, slopeStyleRef, slopeSmoothingRef, slopeTickSpacingRef, slopeTickLengthRef, slopeModeRef, slopeHoverTargetRef,
  } satisfies MapRefs

  osmOverlayRefsRef.current = {
    osmOverlayCanvasRef, metaRef, frameDimsRef,
    osmHighlightTierRef, osmHighlightTypeRef, osmSpotlightModeRef, spotlightCursorRef,
    osmRailHighlightRef, hoveredOsmRiverIdxRef, zoomRef, panRef,
    rawRoadWaysRef, osmRiverWaysRef, rawRailWaysRef,
    osmSpotlightRadiusRef, osmSpotlightTiersRef, getPaperRef,
  } satisfies OsmOverlayRefs

  mouseHandlerRefsRef.current = {
    canvasRef, frameDimsRef, paperDimsRef, zoomRef,
    clientToLogicalRef, getPaperRef, drawRef,
    riverEdgesRef, toggleRiverEdgeRef, batchToggleRiverEdgesRef, highlightEdgePathsRef, setHighlightEdgePathRef,
    activeToolRef, activePanelRef,
    liveLabelOffsetRef, labelBBoxCacheRef, labelDragStateRef, hoveredLabelIdRef,
    labelOffsetsRef, editingLabelRef, setLabelOffsetRef, setActiveToolRef,
    labelOverlaysRef, placedLabelsRef, activeLabelOverlayIdRef,
    placeLabelRef, removeLabelAtRef, moveLabelToRef, labelSnapRef, draggingLabelRef,
    iconOverlaysRef, placedIconsRef, activeIconOverlayIdRef,
    placeIconRef, removeIconAtRef, iconSnapRef, iconPlaceModeRef,
    alignImageDragRef, mapImageTransformRef, setMapImageTransformRef,
    showWorldcoverOverlayRef, worldcoverOffscreenRef,
    osmSpotlightModeRef, spotlightCursorRef, spotlightRafRef, drawOsmHighlightRef,
    metaRef, hexesRef, hexEdgeModeRef, hexRadiusRef, projectedHexesRef,
    hoveredEdgeRef, hoverRafRef, edgeDragRef, draggedRef,
    blobMaskStrokeRef, blobMaskDrawingRef, addBlobMaskEditRef,
    activeHighlightIdRef, highlightsRef, highlightedHexesRef,
    highlightPaintModeRef, setHexHighlightRef, clearHexHighlightRef,
    riverSelectModeRef, riverEditModeRef, riverChainsV2Ref, computedRiverChainsRef,
    selectedSegmentKeysRef, selectedHopKeyRef, setSelectedSegmentKeysRef,
    setSelectedHopKeyRef, toggleSegmentSelectionRef,
    roadSelectModeRef, roadNetworkRef, roadWiggleAmpRef, roadWiggleFreqRef,
    roadSegmentPropsRef, roadHopPropsRef, selectedRoadSegmentKeysRef,
    selectedRoadHopKeyRef, setSelectedRoadSegmentKeysRef, setSelectedRoadHopKeyRef,
    toggleRoadSegmentSelectionRef,
    settlementMoveIndexRef, settlementPlaceTierRef, settlementsRef,
    updateSettlementRef, setSettlementMoveIndexRef, placeSettlementAtHexRef,
    urbanPaintModeRef, toggleUrbanHexRef,
    panRef,
    setWcTooltip, wcTooltip,
    setEditingLabel,
  } satisfies MouseHandlerRefs

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      style={{ flex: 1, overflow: 'hidden', background: '#1a1a2a', position: 'relative', outline: 'none' }}
      onMouseDown={e => { if (e.target === containerRef.current || e.target === canvasRef.current) containerRef.current?.focus() }}
      onClick={() => { setCtxMenu(null); clearHighlight() }}
    >
      {!meta && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', pointerEvents: 'none' }} />
      )}
      <canvas
        ref={canvasRef}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block', cursor: getToolCursor(activeTool, { terrainColors, highlights, settlementTier: settlementPlaceTier, settlementTierStyles }) }}
      />
      <canvas
        ref={osmOverlayCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'block' }}
      />
      <canvas
        ref={highlightCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'block', zIndex: 5 }}
      />
      {/* OSM overlay — hidden in map_image mode (image overlay is drawn on canvas instead) */}
      <div
        ref={overlayContainerRef}
        style={{
          position: 'absolute',
          left: overlayRect?.left ?? 0,
          top: overlayRect?.top ?? 0,
          width: overlayRect?.width ?? 0,
          height: overlayRect?.height ?? 0,
          opacity: (mapOverlay && dataSource === 'osm') ? 0.82 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
          zIndex: 10,
          overflow: 'hidden',
        }}
      />
      {/* Expand mode overlay — edge pill buttons for adding sheets */}
      {expandMode && expandPaperRect && (() => {
        const { px, py, pw, ph } = expandPaperRect
        const GAP = 36
        const edges = ['left', 'right', 'top', 'bottom'] as const
        type Edge = typeof edges[number]
        const isCol = (e: Edge) => e === 'left' || e === 'right'
        const btnCenter: Record<Edge, { x: number; y: number }> = {
          left:   { x: px - GAP,      y: py + ph / 2 },
          right:  { x: px + pw + GAP, y: py + ph / 2 },
          top:    { x: px + pw / 2,   y: py - GAP },
          bottom: { x: px + pw / 2,   y: py + ph + GAP },
        }
        const pillStyle: CSSProperties = {
          position: 'absolute', transform: 'translate(-50%, -50%)',
          background: 'rgba(14,13,11,0.92)', border: '1px solid rgba(180,172,160,0.6)',
          borderRadius: 3, color: '#ddd8d0', fontFamily: 'ui-monospace,monospace',
          fontSize: 11, letterSpacing: 0.5, padding: '5px 11px',
          cursor: 'pointer', userSelect: 'none', pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
            {/* Dim overlay to focus attention */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }} />
            {/* Paper outline */}
            <div style={{
              position: 'absolute', left: px, top: py, width: pw, height: ph,
              boxShadow: '0 0 0 2px rgba(220,210,190,0.7)',
              pointerEvents: 'none',
            }} />
            {/* Edge + buttons — use metadata paper_mm as source of truth for single-sheet maps */}
            {edges.map(edge => {
              const isSingle = pageGrid.colWidths.length === 1 && pageGrid.rowHeights.length === 1
              const effectiveRowHeights = isSingle && generatedMetadata
                ? [generatedMetadata.paper_mm[1]]
                : pageGrid.rowHeights
              const effectiveColWidths = isSingle && generatedMetadata
                ? [generatedMetadata.paper_mm[0]]
                : pageGrid.colWidths
              const opts = isCol(edge)
                ? validColWidthsForRows(effectiveRowHeights)
                : validRowHeightsForCols(effectiveColWidths)
              if (opts.length === 0) return null
              const { x, y } = btnCenter[edge]
              const isVertEdge = edge === 'left' || edge === 'right'
              return opts.map((optMm, i) => {
                const info = isCol(edge)
                  ? cellPaperInfo(optMm, effectiveRowHeights[0])
                  : cellPaperInfo(effectiveColWidths[0], optMm)
                const label = info
                  ? `+ ${info.size} ${info.orientation === 'landscape' ? '↔' : '↕'}`
                  : `+ ${optMm}mm`
                const offset = (i - (opts.length - 1) / 2) * 44
                const btnStyle = isVertEdge
                  ? { ...pillStyle, left: x, top: y + offset }
                  : { ...pillStyle, left: x + offset, top: y }
                return (
                  <button
                    key={`${edge}-${optMm}`}
                    style={{ ...btnStyle, pointerEvents: 'auto' }}
                    onClick={async (e) => {
                      e.stopPropagation()
                      setExpandMode(false)
                      await expandMap(edge, optMm)
                    }}
                  >
                    {label}
                  </button>
                )
              })
            })}
            {/* Done button */}
            <button
              style={{
                ...pillStyle, pointerEvents: 'auto',
                position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(14,13,11,0.94)', border: '1px solid rgba(100,95,88,0.5)',
                color: '#888078',
              }}
              onClick={() => setExpandMode(false)}
            >
              Cancel
            </button>
          </div>
        )
      })()}

      {expandFetchSteps && (() => {
        const stepLabels: Record<string, string> = {
          terrain: 'Terrain', elevation: 'Elevation', roads: 'Roads',
          rivers: 'Rivers', settlements: 'Settlements', rails: 'Rails',
        }
        const entries = Object.entries(expandFetchSteps)
        const allDone = entries.every(([, s]) => s === 'done' || s === 'error')
        return (
          <div style={{
            position: 'absolute', bottom: 24, right: 24, zIndex: 30,
            background: 'rgba(14,13,11,0.92)', border: '1px solid rgba(100,95,88,0.4)',
            borderRadius: 10, padding: '12px 16px', minWidth: 160,
            fontFamily: 'inherit', fontSize: 12, color: '#b8b0a0',
            display: 'flex', flexDirection: 'column', gap: 6,
            opacity: allDone ? 0.6 : 1, transition: 'opacity 0.6s',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#d0c8b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
              Expanding map
            </div>
            {entries.map(([key, status]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, textAlign: 'center', color: status === 'done' ? '#7ab87a' : status === 'error' ? '#c06060' : '#888' }}>
                  {status === 'done' ? '✓' : status === 'error' ? '✗' : '…'}
                </span>
                <span style={{ color: status === 'loading' ? '#d0c8b8' : undefined }}>{stepLabels[key] ?? key}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {editingLabel && (() => {
        const overlay = labelOverlays.find(o => o.id === editingLabel.overlayId)
        const commit = () => {
          updateLabelTextRef.current(editingLabel.overlayId, editingLabel.index, editingLabel.text)
          setEditingLabel(null)
          draw()
        }
        const cancel = () => { setEditingLabel(null); draw() }
        const fontSize = editingLabel.textSize * zoomRef.current
        const lineH = fontSize * 1.25
        const lineCount = (editingLabel.text.match(/\n/g)?.length ?? 0) + 1
        const computedH = lineH * lineCount + fontSize * 0.9
        return (
          <>
            {/* backdrop captures outside clicks — mousedown so it fires before anything else */}
            <div
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); commit() }}
              style={{ position: 'fixed', inset: 0, zIndex: 49 }}
            />
            <textarea
              key={`${editingLabel.overlayId}-${editingLabel.index}`}
              autoFocus
              rows={lineCount}
              value={editingLabel.text}
              onChange={e => setEditingLabel(prev => prev ? { ...prev, text: e.target.value } : null)}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); cancel() }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
              }}
              style={{
                position: 'fixed',
                left: editingLabel.screenX - editingLabel.width / 2,
                top: editingLabel.screenY - computedH / 2,
                minWidth: editingLabel.width,
                width: 'max-content',
                height: computedH,
                background: overlay?.bgColor === 'transparent' ? 'rgba(0,0,20,0.85)' : (overlay?.bgColor ?? '#aa1111'),
                border: '2px solid #5a9e6f',
                borderRadius: 2,
                color: overlay?.textColor ?? '#ffffff',
                fontFamily: 'ui-monospace, monospace',
                fontSize,
                fontWeight: 'bold',
                textAlign: 'center',
                outline: 'none',
                zIndex: 50,
                padding: `${fontSize * 0.45 / 2}px ${fontSize * 0.45}px`,
                boxSizing: 'border-box',
                resize: 'none',
                lineHeight: 1.25,
                overflow: 'hidden',
              }}
            />
          </>
        )
      })()}
      {blobFlyout && (
        <BlobOverrideFlyout
          type={blobFlyout.type}
          canonicalKey={blobFlyout.canonicalKey}
          terrain={blobFlyout.terrain}
          x={blobFlyout.x}
          y={blobFlyout.y}
          onClose={() => setBlobFlyout(null)}
        />
      )}
      {wcTooltip && (
        <div
          style={{
            position: 'fixed',
            left: wcTooltip.x + 14,
            top: wcTooltip.y - 10,
            background: 'rgba(20,20,30,0.88)',
            color: '#f0ece4',
            fontSize: 11,
            fontFamily: 'monospace',
            padding: '3px 8px',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 300,
            whiteSpace: 'nowrap',
          }}
        >
          {wcTooltip.label}
        </div>
      )}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(ctxMenu.x, window.innerWidth - 190),
            top: Math.min(ctxMenu.y, window.innerHeight - 60),
            maxHeight: `${window.innerHeight - Math.min(ctxMenu.y, window.innerHeight - 60) - 10}px`,
            overflowY: 'auto',
            background: t.surface, border: `1px solid ${t.line}`,
            borderRadius: 6, padding: '3px 0', zIndex: 200,
            minWidth: 180, boxShadow: t.shadowFlyout,
            userSelect: 'none',
          }}
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.items.map((item, i) => item.label === '─' ? (
            <div key={i} style={{ borderTop: `1px solid ${t.line2}`, margin: '3px 0' }} />
          ) : (
            <div
              key={i}
              onClick={() => { if (!item.dim) { item.action(); setCtxMenu(null); clearHighlight() } }}
              style={{
                ...menuItemStyle,
                color: item.danger ? '#b05050' : item.dim ? t.inkFaint : t.ink2,
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: item.dim ? 'default' : 'pointer',
              }}
              onMouseEnter={e => {
                if (!item.dim) e.currentTarget.style.background = t.paper
                if (item.highlightPolys?.length || item.highlightLines?.length) drawHighlightPolys(item.highlightPolys ?? [], item.highlightLines)
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                clearHighlight()
              }}
            >
              {item.icon && <CtxIcon type={item.icon} color={item.danger ? '#b05050' : t.inkMute} />}
              {item.color && (
                <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: item.color }} />
              )}
              <span style={{ textTransform: 'capitalize' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
      {settlementRename && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(settlementRename.x, window.innerWidth - 220),
            top: Math.min(settlementRename.y, window.innerHeight - 60),
            background: t.surface, border: `1px solid ${t.line}`,
            borderRadius: 6, padding: '6px 8px', zIndex: 201,
            boxShadow: t.shadowFlyout, display: 'flex', alignItems: 'center', gap: 6,
          }}
          onClick={e => e.stopPropagation()}
        >
          <input
            autoFocus
            value={settlementRename.name}
            onChange={e => setSettlementRename(r => r ? { ...r, name: e.target.value } : r)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (settlementRename.name.trim()) updateSettlement(settlementRename.index, { name: settlementRename.name.trim() })
                setSettlementRename(null)
              }
              if (e.key === 'Escape') setSettlementRename(null)
            }}
            onBlur={() => {
              if (settlementRename.name.trim()) updateSettlement(settlementRename.index, { name: settlementRename.name.trim() })
              setSettlementRename(null)
            }}
            style={{
              background: t.paper, border: `1px solid ${t.line2}`, borderRadius: 4,
              color: t.ink, fontFamily: t.mono, fontSize: 12,
              padding: '3px 6px', width: 160, outline: 'none',
            }}
          />
        </div>
      )}
      {perfHudVisible && (
        <div
          ref={perfHudRef}
          style={{
            position: 'absolute', bottom: 8, right: 8, zIndex: 9999,
            background: 'rgba(0,0,0,0.82)', color: '#8f8',
            fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
            padding: '6px 8px', borderRadius: 4, whiteSpace: 'pre',
            pointerEvents: 'none', border: '1px solid #0f0',
            userSelect: 'none',
          }}
        />
      )}
    </div>
  )
})
