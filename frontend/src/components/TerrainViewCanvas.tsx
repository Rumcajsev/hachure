import { useRef, useEffect, useCallback, useState, useMemo, forwardRef, useImperativeHandle, type CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore, TERRAIN_COLORS, LAKE_COLOR, TERRAIN_PRIORITY, hexTerrainLayers, edgeBlobCanonicalKey, type GeneratedHex, type RoadTierStyle } from '../store/mapStore'
import { BlobOverrideFlyout } from './BlobOverrideFlyout'
import { hexAdjacent, catmullRom, offsetPolyline, pointInPolygon, distToSeg, douglasPeucker, chaikin } from '../lib/geometry'
import { mulberry32, makePermutation } from '../lib/noise'
import { projectToCanvas, unprojectFromCanvas, computePaper } from '../lib/projection'
import { coastalBlobTerrains, bleedPolygon, buildTerrainBlobsV2, buildTerrainBlobTopology, shapeTerrainBlobs, computeConnectedComponents } from '../lib/terrainBlobs'
import type { BlobTopologyEntry } from '../lib/terrainBlobs'
import { findEdgeChains as findEdgeChainsSync } from '../lib/edgeBlobs'
import { riverChainCache, buildRiverChains, buildRiverChainsV2 } from '../lib/riverChains'

const RIVER_V2 = true
import { drawRivers as _drawRivers } from '../lib/drawRivers'
import { buildRoadChains, buildRailChains, spineSideCpKey, applyRoadWiggle, applyRailWiggle } from '../lib/roadChains'
import { buildRoadChainsV2, applyRoadWiggleV2 } from '../lib/roadChainsV2'
import { buildRoadChainsV3 } from '../lib/roadChainsV3'
import { drawHighlights as _drawHighlights } from '../lib/drawHighlights'
import { drawAreas as _drawAreas } from '../lib/drawAreas'
import { drawIcons as _drawIcons } from '../lib/drawIcons'
import { drawLabels as _drawLabels, getLabelBoxBounds } from '../lib/drawLabels'
import { drawRoadsAndRails as _drawRoadsAndRails } from '../lib/drawRoadsRails'
import { drawRoadsAndRailsV2 as _drawRoadsAndRailsV2 } from '../lib/drawRoadsRailsV2'

import { drawSettlements as _drawSettlements } from '../lib/drawSettlements'
import { drawAllBuildings as _drawAllBuildings, type BuildingCmd } from '../lib/drawBuildings'
import { drawAllBuildingsV2 as _drawAllBuildingsV2 } from '../lib/drawBuildingsV2'
import { drawHexBorders as _drawHexBorders, drawMapBoundary as _drawMapBoundary, drawHexGridMask as _drawHexGridMask, drawExcludedHexOverlay as _drawExcludedHexOverlay } from '../lib/drawHexBorders'
import { drawTerrain as _drawTerrain } from '../lib/drawTerrain'
import { TEXTURE_OPTIONS, TEXTURE_PATHS, DEFAULT_TERRAIN_TEXTURES } from '../lib/terrainTextures'
import { computeHillshade } from '../lib/drawHillshade'
import { computeContours } from '../lib/drawContours'
import { drawHexNumbers as _drawHexNumbers, buildHexNumberMap } from '../lib/drawHexNumbers'
import { getToolCursor } from '../lib/cursors'
import { detectBridges } from '../lib/detectBridges'
import { drawBridges as _drawBridges } from '../lib/drawBridges'
import { drawMegaHexGrid as _drawMegaHexGrid } from '../lib/drawMegaHexGrid'
import { drawElevationDebug as _drawElevationDebug } from '../lib/drawElevationDebug'
import { drawMapImageOverlay } from '../lib/drawMapImageOverlay'
import type { BridgePoint } from '../lib/detectBridges'
import { drawRoadHandles as _drawRoadHandles, drawRailHandles as _drawRailHandles, drawRiverHandles as _drawRiverHandles } from '../lib/drawEditHandles'
import { drawPaperBackground as _drawPaperBackground, drawPaperMargin as _drawPaperMargin } from '../lib/drawPaperChrome'
import { shouldSuppressShortcut } from '../lib/keyboard'
import { resolveLabels } from '../lib/labelPresets'

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

type CtxItem = { label: string; action: () => void; danger?: boolean; color?: string; dim?: boolean }

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
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const osmOverlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const textureCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const patternCacheRef = useRef<WeakMap<HTMLImageElement, CanvasPattern>>(new WeakMap())
  const historicalIconSetsRef = useRef<Record<string, HTMLImageElement[]>>({})
  const terrainLayerRef = useRef<OffscreenCanvas | null>(null)
  const terrainDirtyRef = useRef(true)
  const terrainLayerPapWRef = useRef(0)
  const terrainLayerPapHRef = useRef(0)
  const terrainZoomSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Offscreen canvas refs for non-terrain layers
  const hexBorderLayerRef = useRef<OffscreenCanvas | null>(null)
  const hexBorderDirtyRef = useRef(true)
  const hexBorderLayerPapWRef = useRef(0)
  const hexBorderLayerPapHRef = useRef(0)

  const joinedHighlightsLayerRef = useRef<OffscreenCanvas | null>(null)
  const joinedHighlightsDirtyRef = useRef(true)
  const joinedHighlightsLayerPapWRef = useRef(0)
  const joinedHighlightsLayerPapHRef = useRef(0)

  const areasLayerRef = useRef<OffscreenCanvas | null>(null)
  const areasDirtyRef = useRef(true)
  const areasLayerPapWRef = useRef(0)
  const areasLayerPapHRef = useRef(0)

  const riversLayerRef = useRef<OffscreenCanvas | null>(null)
  const riversDirtyRef = useRef(true)
  const riversLayerPapWRef = useRef(0)
  const riversLayerPapHRef = useRef(0)

  const buildingsLayerRef = useRef<OffscreenCanvas | null>(null)
  const buildingsDirtyRef = useRef(true)
  const buildingsLayerPapWRef = useRef(0)
  const buildingsLayerPapHRef = useRef(0)

  const roadsLayerRef = useRef<OffscreenCanvas | null>(null)
  const roadsDirtyRef = useRef(true)
  const roadsLayerPapWRef = useRef(0)
  const roadsLayerPapHRef = useRef(0)

  const settlementsLayerRef = useRef<OffscreenCanvas | null>(null)
  const settlementsDirtyRef = useRef(true)
  const settlementsLayerPapWRef = useRef(0)
  const settlementsLayerPapHRef = useRef(0)
  const [frameDims, setFrameDims] = useState({ w: 0, h: 0 })
  const frameDimsRef = useRef({ w: 0, h: 0 })

  const rafRef = useRef<number | null>(null)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panOriginRef = useRef({ x: 0, y: 0 })

  const [isRoadPainting, setIsRoadPainting] = useState(false)
  const [isTerrainPainting, setIsTerrainPainting] = useState(false)
  const [mapOverlay, setMapOverlay] = useState(false)
  const mapOverlayRef = useRef(false)
  mapOverlayRef.current = mapOverlay
  const [overlayRect, setOverlayRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const overlayContainerRef = useRef<HTMLDivElement>(null)
  const overlayMapRef = useRef<maplibregl.Map | null>(null)

  const {
    generatedHexes, generatedMetadata,
    hexBorderMode, hexEdgeMode, hexBorderOpacity, hexBorderColor, hexBorderDifference,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump,
    terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
    terrainBlobClearingChance, terrainBlobSatelliteChance, terrainBlobPatchSize, terrainBlobFeather,
    terrainColors, terrainTextureScales, terrainTextureBlendModes, terrainTextureOpacities,
    terrainTextureTintColors, terrainTextureTintOpacities,
    terrainTextureFile, terrainTextureEnabled,
    terrainPaintMode, terrainPaintBrush, overrideHexTerrain, resetHexOverride,
    elevationPaintMode, elevationPaintBrush, overrideHexElevation,
    elevationTypeBlobStyles,
    terrainLayersEnabled,
    roadEdges, railEdges, rawRoadWays, rawRailWays, roadTierStyles, railStyle,
    showRawOsmRoads, osmHighlightTier, osmSpotlightMode, osmSpotlightRadius, osmSpotlightTiers,
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
    addRoadEdge, removeRoadHexEdges, removeRoadEdgeAllTiers, addRailEdge, removeRailEdge, removeRailHexEdges,
    activePanel,
    roadControlOverrides, setRoadControlOverride, deleteRoadControlOverride,
    roadSnapBindings, setRoadSnapBinding, deleteRoadSnapBinding,
    roadNodeEditMode,
    roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing, roadCenterPull, roadTierGeometry, roadDensityMinChain, roadWiggleDragging,
    roadRenderVersion, roadV3TierGeom,
    roadChainOverrides, setRoadChainOverride,
    riverEdges, canalEdges,
    riverEditMode, canalEditMode, toggleRiverEdge, toggleCanalEdge,
    riverNodeEditMode, riverChainOverrides, setRiverChainOverride,
    riverHopProps, selectedHopKey, setRiverHopProp, setSelectedHopKey,
    roadSelectMode, selectedRoadSegmentKeys, selectedRoadHopKey,
    setRoadSelectMode, setSelectedRoadSegmentKeys, toggleRoadSegmentSelection,
    setRoadSegmentProp, clearRoadSegmentProp, setRoadHopProp, clearRoadHopProp, setSelectedRoadHopKey,
    roadSegmentProps, roadHopProps,
    showRiverLabels, riverLabelColor,
    riverSegmentProps, canalSegmentProps,
    setRiverSegmentProp, clearRiverSegmentProp,
    riverSelectMode, canalSelectMode,
    selectedSegmentKeys, selectedCanalSegmentKeys,
    setSelectedSegmentKeys, toggleSegmentSelection,
    setSelectedCanalSegmentKeys, toggleCanalSegmentSelection,
    riverStyle, canalStyle,
    lakePaintMode, overrideHexLake,
    lakeBlobSmooth, lakeBlobOffset, lakeBlobBump,
    lakeBlobSweepFreq, lakeBlobLobeFreq, lakeBlobLobeAmp, lakeBlobLobeThreshold, lakeBlobLobeDirection,
    riverWidthScale, canalWidthScale, riverCurveSteps, riverWobble, riverDetail,
    riverWiggleFreq, riverWiggleAmp, riverSmoothing, riverPathSmoothing,
    terrainBlobOverrides, setTerrainBlobOverride,
    terrainTypeBlobStyles,
    lakeOverrides, setLakeOverride,
    edgeBlobPainted,
    paintEdgeBlob, eraseEdgeBlob,
    terrainEdgePaintEnabled,
    terrainBackgroundPaintEnabled, overrideHexBackground,
    customTerrains,
    edgeBlobWidth, edgeBlobOverrides, setEdgeBlobOverride,
    realisticCoastline, coastlineDebugRaw,
    beachStrip, beachColor, beachWidth,
    hillsColor, mountainsColor, reliefShadingOpacity,
    heightmapUrl, heightmapMeta,
    hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity,
    hillshadeDisabledTerrains, hillshadeDisabledElevClasses,
    setHillshadeAzimuth, setHillshadeAltitude, setHillshadeIntensity,
    contoursEnabled, contourInterval, contourBaseElevation, contourSmoothPasses, contourLineWidth,
    contourDisabledTerrains, contourDisabledElevClasses,
    coastlineDPEpsilon, coastlineChaikinPasses,
    terrainRenderMode,
    settlements, settlementTierStyles, settlementPlaceTier, addSettlement, placeSettlementAtHex,
    labelPresetId, labelOverrides,
    settlementMoveIndex, setSettlementMoveIndex, updateSettlement,
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
    bridgesEnabled, bridgeStyle, bridgeTiers, bridgeOverrides, setBridgeOverride, clearBridgeOverride,
    megaHexEnabled, megaHexRadius, megaHexColor, megaHexOpacity, megaHexLineWidth,
    megaHexOriginQ, megaHexOriginR, setMegaHexOrigin,
    areasMode, areas, areaHexes, areasStyle, activeAreaId,
    paintHexArea, eraseHexArea, addArea,
    mapImageDataUrl, mapImageTransform, mapImageOpacity, setMapImageTransform,
    dataSource,
    blobPatches, addBlobPatch, deleteBlobPatch,
    blobSeeds, randomizeBlobSeed,
    labelOffsets, setLabelOffset, clearAllLabelOffsets,
  } = useMapStore()
  // dev-only: expose store for dry-run console injection
  useEffect(() => { (window as any).__mapStore = useMapStore }, [])

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
  const overrideHexBackgroundRef = useRef(overrideHexBackground)
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
  const bridgesDirtyRef = useRef(true)
  const roadPaintModeRef = useRef(roadPaintMode)
  const roadPaintBrushRef = useRef(roadPaintBrush)
  const roadPaintEraserRef = useRef(roadPaintEraser)
  const railPaintModeRef = useRef(railPaintMode)
  const railPaintEraserRef = useRef(railPaintEraser)
  const addRoadEdgeRef = useRef(addRoadEdge)
  const removeRoadHexEdgesRef = useRef(removeRoadHexEdges)
  const removeRoadEdgeAllTiersRef = useRef(removeRoadEdgeAllTiers)
  const addRailEdgeRef = useRef(addRailEdge)
  const removeRailEdgeRef = useRef(removeRailEdge)
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
  // Dense-point hover/drag refs (shared by road node edit and river node edit)
  // handles = sparse edit points (every 5th of the dense catmullRom output)
  const hoveredChainRef = useRef<{ id: string; handles: [number, number][]; kind: 'road' | 'river' | 'rail' } | null>(null)
  const hoveredHandleIdxRef = useRef<number | null>(null)
  const draggingDensePtRef = useRef<{ id: string; handles: [number, number][]; handleIdx: number; kind: 'road' | 'river' } | null>(null)
  const dragLiveDensePosRef = useRef<[number, number] | null>(null)
  const dragLiveOverrideRef = useRef<Record<string, [number, number]>>({})
  const dragRafRef = useRef<number | null>(null)
  const riverEdgesRef = useRef(riverEdges)
  const canalEdgesRef = useRef(canalEdges)
  const riverEditModeRef = useRef(riverEditMode)
  const canalEditModeRef = useRef(canalEditMode)
  const toggleRiverEdgeRef = useRef(toggleRiverEdge)
  const toggleCanalEdgeRef = useRef(toggleCanalEdge)
  const showRiverLabelsRef = useRef(showRiverLabels)
  const riverLabelColorRef = useRef(riverLabelColor)
  const riverSegmentPropsRef = useRef(riverSegmentProps)
  const canalSegmentPropsRef = useRef(canalSegmentProps)
  const riverSelectModeRef = useRef(riverSelectMode)
  const canalSelectModeRef = useRef(canalSelectMode)
  const selectedSegmentKeysRef = useRef(selectedSegmentKeys)
  const selectedCanalSegmentKeysRef = useRef(selectedCanalSegmentKeys)
  const setSelectedSegmentKeysRef = useRef(setSelectedSegmentKeys)
  const setSelectedCanalSegmentKeysRef = useRef(setSelectedCanalSegmentKeys)
  const toggleSegmentSelectionRef = useRef(toggleSegmentSelection)
  const toggleCanalSegmentSelectionRef = useRef(toggleCanalSegmentSelection)
  const riverStyleRef = useRef(riverStyle)
  const canalStyleRef = useRef(canalStyle)
  const computedRiverChainsRef = useRef<{ vertices: [number,number][]; segKey: string }[]>([])
  const computedCanalChainsRef = useRef<{ vertices: [number,number][]; segKey: string }[]>([])
  const lakePaintModeRef = useRef(lakePaintMode)
  const overrideHexLakeRef = useRef(overrideHexLake)
  const lakeBlobSmoothRef = useRef(lakeBlobSmooth)
  const lakeBlobOffsetRef = useRef(lakeBlobOffset)
  const lakeBlobBumpRef = useRef(lakeBlobBump)
  const lakeBlobSweepFreqRef = useRef(lakeBlobSweepFreq)
  const lakeBlobLobeFreqRef = useRef(lakeBlobLobeFreq)
  const lakeBlobLobeAmpRef = useRef(lakeBlobLobeAmp)
  const lakeBlobLobeThresholdRef = useRef(lakeBlobLobeThreshold)
  const lakeBlobLobeDirectionRef = useRef(lakeBlobLobeDirection)
  const riverWidthScaleRef = useRef(riverWidthScale)
  const canalWidthScaleRef = useRef(canalWidthScale)
  const riverCurveStepsRef = useRef(riverCurveSteps)
  const riverWobbleRef = useRef(riverWobble)
  const riverDetailRef = useRef(riverDetail)
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
  const terrainBlobClearingChanceRef = useRef(terrainBlobClearingChance)
  const terrainBlobSatelliteChanceRef = useRef(terrainBlobSatelliteChance)
  const terrainBlobPatchSizeRef = useRef(terrainBlobPatchSize)
  const terrainBlobFeatherRef = useRef(terrainBlobFeather)
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
  const lakeOverridesRef = useRef(lakeOverrides)
  const terrainRenderModeRef = useRef(terrainRenderMode)
  // Field mode refs — detached. Re-add when field render is reactivated.
  // const fieldFreqRef = useRef(fieldFreq)
  // const fieldAmpRef = useRef(fieldAmp)
  // const fieldOctavesRef = useRef(fieldOctaves)
  // const fieldPersistenceRef = useRef(fieldPersistence)
  // const fieldWildnessRef = useRef(fieldWildness)
  // const fieldCanvasRef = useRef<OffscreenCanvas | null>(null)
  // In-progress blob draw polygon (points in logical/canvas coords)
  const [blobDrawState, setBlobDrawState] = useState<{
    points: [number, number][]  // raw freehand stroke points while drawing, smoothed polygon after release
    terrain: string
    drawing: boolean            // true = actively dragging, false = showing smoothed preview before commit
  } | null>(null)
  const blobDrawStateRef = useRef(blobDrawState)
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
  const areasModeRef = useRef(areasMode)
  const areasRef = useRef(areas)
  const areaHexesRef = useRef(areaHexes)
  const areasStyleRef = useRef(areasStyle)
  const activeAreaIdRef = useRef(activeAreaId)
  const paintHexAreaRef = useRef(paintHexArea)
  const eraseHexAreaRef = useRef(eraseHexArea)
  const addAreaRef = useRef(addArea)
  const highlightLineEraserRef = useRef(highlightLineEraser)
  const blobPatchesRef = useRef(blobPatches)
  const addBlobPatchRef = useRef(addBlobPatch)
  const deleteBlobPatchRef = useRef(deleteBlobPatch)
  const randomizeBlobSeedRef = useRef(randomizeBlobSeed)
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
  addRailEdgeRef.current = addRailEdge
  removeRailEdgeRef.current = removeRailEdge
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
  areasModeRef.current = areasMode
  areasRef.current = areas
  areaHexesRef.current = areaHexes
  areasStyleRef.current = areasStyle
  activeAreaIdRef.current = activeAreaId
  paintHexAreaRef.current = paintHexArea
  eraseHexAreaRef.current = eraseHexArea
  addAreaRef.current = addArea
  highlightLineEraserRef.current = highlightLineEraser
  activeToolRef.current = activeTool
  blobPatchesRef.current = blobPatches
  addBlobPatchRef.current = addBlobPatch
  deleteBlobPatchRef.current = deleteBlobPatch
  randomizeBlobSeedRef.current = randomizeBlobSeed
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
  blobDrawStateRef.current = blobDrawState
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
  canalEdgesRef.current = canalEdges
  riverEditModeRef.current = riverEditMode
  canalEditModeRef.current = canalEditMode
  toggleRiverEdgeRef.current = toggleRiverEdge
  toggleCanalEdgeRef.current = toggleCanalEdge
  showRiverLabelsRef.current = showRiverLabels
  riverLabelColorRef.current = riverLabelColor
  riverSegmentPropsRef.current = riverSegmentProps
  canalSegmentPropsRef.current = canalSegmentProps
  riverSelectModeRef.current = riverSelectMode
  canalSelectModeRef.current = canalSelectMode
  selectedSegmentKeysRef.current = selectedSegmentKeys
  selectedCanalSegmentKeysRef.current = selectedCanalSegmentKeys
  setSelectedSegmentKeysRef.current = setSelectedSegmentKeys
  setSelectedCanalSegmentKeysRef.current = setSelectedCanalSegmentKeys
  toggleSegmentSelectionRef.current = toggleSegmentSelection
  toggleCanalSegmentSelectionRef.current = toggleCanalSegmentSelection
  riverStyleRef.current = riverStyle
  canalStyleRef.current = canalStyle
  lakePaintModeRef.current = lakePaintMode
  overrideHexLakeRef.current = overrideHexLake
  lakeBlobSmoothRef.current = lakeBlobSmooth
  lakeBlobOffsetRef.current = lakeBlobOffset
  lakeBlobBumpRef.current = lakeBlobBump
  lakeBlobSweepFreqRef.current = lakeBlobSweepFreq
  lakeBlobLobeFreqRef.current = lakeBlobLobeFreq
  lakeBlobLobeAmpRef.current = lakeBlobLobeAmp
  lakeBlobLobeThresholdRef.current = lakeBlobLobeThreshold
  lakeBlobLobeDirectionRef.current = lakeBlobLobeDirection
  riverWidthScaleRef.current = riverWidthScale
  canalWidthScaleRef.current = canalWidthScale
  riverCurveStepsRef.current = riverCurveSteps
  riverWobbleRef.current = riverWobble
  riverDetailRef.current = riverDetail
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
  terrainBlobClearingChanceRef.current = terrainBlobClearingChance
  terrainBlobSatelliteChanceRef.current = terrainBlobSatelliteChance
  terrainBlobPatchSizeRef.current = terrainBlobPatchSize
  terrainBlobFeatherRef.current = terrainBlobFeather
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
  const hillshadeAzimuthRef = useRef(hillshadeAzimuth)
  hillshadeAzimuthRef.current = hillshadeAzimuth
  const hillshadeAltitudeRef = useRef(hillshadeAltitude)
  hillshadeAltitudeRef.current = hillshadeAltitude
  const hillshadeIntensityRef = useRef(hillshadeIntensity)
  hillshadeIntensityRef.current = hillshadeIntensity
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
  lakeOverridesRef.current = lakeOverrides
  terrainEdgePaintEnabledRef.current = terrainEdgePaintEnabled
  paintEdgeBlobRef.current = paintEdgeBlob
  eraseEdgeBlobRef.current = eraseEdgeBlob
  edgeBlobPaintedRef.current = edgeBlobPainted
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
    () => computeConnectedComponents(generatedHexes.map(h => ({ q: h.q, r: h.r, terrain: h.terrain, isLake: h.isLake ?? false }))),
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
        if (t !== 'clear' && t !== 'lake') terrainTypes.add(t)
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
          hexesForType.map(h => ({ q: h.q, r: h.r, terrain: t, isLake: false as const }))
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

  const roadBaseData = useMemo(
    () => buildRoadChains(roadEdges, hexCenterIdx, roadControlOverrides, 0, 0, roadSmoothing, roadPathSmoothing, roadChainOverrides, {}, {}, roadSnapBindings),
    [roadEdges, hexCenterIdx, roadControlOverrides, roadSmoothing, roadPathSmoothing, roadChainOverrides, roadSnapBindings],
  )

  const smoothedRoadData = useMemo(
    () => {
      const chaikinPasses = (roadWiggleDragging || isRoadPainting) ? 0 : 2
      const data = applyRoadWiggle(roadBaseData, roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps, chaikinPasses)
      if (roadDensityMinChain <= 1) return data
      const chains = data.chains.filter(c => {
        if (c.id.startsWith('stub|')) return true
        const hops = c.hopKeys?.length ?? Math.max(1, (c.baseChain?.length ?? c.chain.length) - 1)
        return hops >= roadDensityMinChain
      })
      return { ...data, chains }
    },
    [roadBaseData, roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps, roadDensityMinChain, roadWiggleDragging, isRoadPainting],
  )
  const smoothedRoadDataRef = useRef(smoothedRoadData)
  smoothedRoadDataRef.current = smoothedRoadData
  const roadBaseDataRef = useRef(roadBaseData)
  roadBaseDataRef.current = roadBaseData

  const railBaseData = useMemo(
    () => {
      const roadEdgeMidpoints = new Map(
        roadBaseData.controlPoints
          .filter(cp => cp.key.startsWith('em|'))
          .map(cp => [cp.key, cp.pos] as [string, [number, number]])
      )
      const roadJunctionPositions = new Map(
        roadBaseData.controlPoints
          .filter(cp => cp.key.startsWith('ja|'))
          .map(cp => [cp.key.slice(3), cp.pos] as [string, [number, number]])
      )
      const effSmoothing = railGeomOverride?.smoothing ?? railSmoothing
      const effPathSmoothing = railGeomOverride?.pathSmoothing ?? railPathSmoothing
      return buildRailChains(railEdges, roadEdges, hexCenterIdx, roadEdgeMidpoints, roadJunctionPositions, railControlOverrides, 0, 0, effSmoothing, {}, {}, 2, effPathSmoothing)
    },
    [railEdges, roadEdges, hexCenterIdx, roadBaseData, railControlOverrides, railSmoothing, railPathSmoothing, railGeomOverride],
  )
  const smoothedRailData = useMemo(
    () => applyRailWiggle(railBaseData, railWiggleAmp, railWiggleFreq, railSegmentProps, railHopProps, railWiggleDragging ? 0 : 2, railGeomOverride ?? undefined),
    [railBaseData, railWiggleAmp, railWiggleFreq, railSegmentProps, railHopProps, railWiggleDragging, railGeomOverride],
  )
  const smoothedRailDataRef = useRef(smoothedRailData)
  smoothedRailDataRef.current = smoothedRailData
  const railBaseDataRef = useRef(railBaseData)
  railBaseDataRef.current = railBaseData

  const roadTierGeomMap = useMemo(
    () => {
      const map: Record<number, { wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number; smoothing?: number; centerPull?: number }> = {}
      roadTierGeometry.forEach((g, i) => { if (g) map[i] = g })
      return Object.keys(map).length > 0 ? map : undefined
    },
    [roadTierGeometry],
  )

  const roadBaseDataV2 = useMemo(
    () => buildRoadChainsV2(roadEdges, hexCenterIdx, roadControlOverrides, 0, 0, roadSmoothing, roadPathSmoothing, roadChainOverrides, {}, {}, roadSnapBindings, 2, roadTierGeomMap, roadCenterPull),
    [roadEdges, hexCenterIdx, roadControlOverrides, roadSmoothing, roadPathSmoothing, roadChainOverrides, roadSnapBindings, roadTierGeomMap, roadCenterPull],
  )
  const smoothedRoadDataV2 = useMemo(
    () => {
      if (!roadBaseDataV2) return null
      const chaikinPasses = (roadWiggleDragging || isRoadPainting) ? 0 : 2
      const data = applyRoadWiggleV2(roadBaseDataV2, roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps, chaikinPasses, roadTierGeomMap)
      if (roadDensityMinChain <= 1) return data
      const chains = data.chains.filter(c => {
        if (c.id.startsWith('stub|')) return true
        const hops = c.hopKeys?.length ?? Math.max(1, (c.baseChain?.length ?? c.chain.length) - 1)
        return hops >= roadDensityMinChain
      })
      return { ...data, chains }
    },
    [roadBaseDataV2, roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps, roadDensityMinChain, roadWiggleDragging, isRoadPainting, roadTierGeomMap],
  )
  const smoothedRoadDataV2Ref = useRef(smoothedRoadDataV2)
  smoothedRoadDataV2Ref.current = smoothedRoadDataV2

  const roadDataV3 = useMemo(
    () => roadRenderVersion === 'v3'
      ? buildRoadChainsV3(roadEdges, hexCenterIdx, roadControlOverrides, roadV3TierGeom)
      : null,
    [roadEdges, hexCenterIdx, roadControlOverrides, roadV3TierGeom, roadRenderVersion],
  )
  const roadDataV3Ref = useRef(roadDataV3)
  roadDataV3Ref.current = roadDataV3
  const roadV3TierGeomRef = useRef(roadV3TierGeom)
  roadV3TierGeomRef.current = roadV3TierGeom
  const roadRenderVersionRef = useRef(roadRenderVersion)
  roadRenderVersionRef.current = roadRenderVersion

  // Memoize paper dims, projected hex coords, and default blob geometry outside draw().
  // These are all stable across zoom/pan (which is handled by canvas transform, not coordinate recalculation),
  // so caching them here means draw() skips the expensive recomputation on every scroll/zoom frame.
  const paperDims = useMemo(() => {
    if (!generatedMetadata || frameDims.w === 0) return null
    return computePaper(frameDims.w, frameDims.h, generatedMetadata)
  }, [generatedMetadata, frameDims])
  const paperDimsRef = useRef(paperDims)
  paperDimsRef.current = paperDims

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
    if (!generatedMetadata || !paperDims || generatedHexes.length === 0) return []
    const { pw, ph, px, py } = paperDims
    return generatedHexes.map(hex => {
      const verts = hex.vertices.map(([lon, lat]) =>
        projectToCanvas(lon, lat, generatedMetadata, pw, ph, px, py) as [number, number]
      )
      return { hex, verts }
    })
  }, [generatedHexes, generatedMetadata, paperDims])
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
  const oceanSeaKeys = useMemo(() => {
    if (!realisticCoastline) return new Set<string>()
    const hexByKey = new Map<string, GeneratedHex>()
    for (const h of generatedHexes) hexByKey.set(`${h.q},${h.r}`, h)
    const NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
    const visited = new Set<string>()
    const queue: string[] = []
    // Seed: pure-sea hexes adjacent to any hex with coastline_clip
    for (const h of generatedHexes) {
      if (!h.coastline_clip || h.coastline_clip.length === 0) continue
      for (const [dq, dr] of NEIGHBORS) {
        const nb = hexByKey.get(`${h.q + dq},${h.r + dr}`)
        if (!nb || nb.terrain !== 'sea' || (nb.coastline_clip?.length ?? 0) > 0) continue
        const nk = `${nb.q},${nb.r}`
        if (!visited.has(nk)) { visited.add(nk); queue.push(nk) }
      }
    }
    // BFS through connected pure-sea hexes
    while (queue.length > 0) {
      const k = queue.pop()!
      const parts = k.split(',')
      const q = parseInt(parts[0]), r = parseInt(parts[1])
      for (const [dq, dr] of NEIGHBORS) {
        const nb = hexByKey.get(`${q + dq},${r + dr}`)
        if (!nb || nb.terrain !== 'sea' || (nb.coastline_clip?.length ?? 0) > 0) continue
        const nk = `${nb.q},${nb.r}`
        if (!visited.has(nk)) { visited.add(nk); queue.push(nk) }
      }
    }
    return visited
  }, [generatedHexes, realisticCoastline])
  const oceanSeaKeysRef = useRef(oceanSeaKeys)
  oceanSeaKeysRef.current = oceanSeaKeys

  // Raw projected land polygon boundary — unsmoothed, for debug overlay and as V3 input.
  const rawCoastlineBoundary = useMemo((): [number, number][][] => {
    const raw = generatedMetadata?.coastline_boundary
    if (!raw || raw.length === 0 || !paperDims) return []
    const { pw, ph, px, py } = paperDims
    return raw.map(ring =>
      ring.map(([lon, lat]) =>
        projectToCanvas(lon, lat, generatedMetadata!, pw, ph, px, py) as [number, number]
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

  const prevTerrainBlobsRef = useRef<{ terrain: string; polys: [number, number][][]; blobKeys: string[] }[]>([])
  type TerrainBlobCacheEntry = { hexKey: string; rawPolys: [number, number][][]; hexCenters: [number, number][]; styleKey: string; blobs: { terrain: string; polys: [number, number][][]; blobKeys: string[] }[] }
  const perTerrainBlobCache = useRef(new Map<string, TerrainBlobCacheEntry>())
  const defaultTerrainBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0) return []
    if (isTerrainPainting) return prevTerrainBlobsRef.current
    const overriddenKeys = new Set(Object.keys(terrainBlobOverrides))
    // Pure-sea: terrain=sea with no coastline_clip. When realistic coastline is on these
    // are excluded from blobs — section 6 handles their fill. When off, they enter the sea blob.
    const isPureSea = (h: GeneratedHex) =>
      h.terrain === 'sea' && (!h.coastline_clip || h.coastline_clip.length === 0)
    const terrainTypeSet = new Set<string>()
    for (const p of projectedHexes) {
      const h = p.hex as GeneratedHex
      if (realisticCoastline && isPureSea(h)) continue
      for (const t of coastalBlobTerrains(h, realisticCoastline)) {
        if (t !== 'clear' && t !== 'lake') terrainTypeSet.add(t)
      }
    }
    const terrainTypes = [...terrainTypeSet]
    // Each terrain type is computed independently so cross-terrain blob coupling is impossible.
    const result = terrainTypes.flatMap(terrain => {
      const componentMap = blobComponentsByTerrain.get(terrain) ?? new Map<string, string>()
      const terrainProjected = projectedHexes.filter(p => {
        const h = p.hex as GeneratedHex
        if (realisticCoastline && isPureSea(h)) return false
        const terrains = coastalBlobTerrains(h, realisticCoastline)
        if (!terrains.includes(terrain)) return false
        if (overriddenKeys.size > 0) {
          const ck = componentMap.get(`${h.q},${h.r}`)
          if (ck && overriddenKeys.has(ck)) return false
        }
        return true
      }).map(p => ({ ...p, hex: { ...p.hex, terrain } }))
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
      const clearingChance  = ts?.clearingChance  ?? terrainBlobClearingChance
      const satelliteChance = ts?.satelliteChance ?? terrainBlobSatelliteChance
      const patchSize       = ts?.patchSize       ?? terrainBlobPatchSize
      const hexKey = terrainProjected.map(p => `${p.hex.q},${p.hex.r}`).join('|')
      const styleKey = `${smooth}|${offset}|${bump}|${sweepFreq}|${lobeFreq}|${lobeAmp}|${lobeThreshold}|${lobeDirection}|${clearingChance}|${satelliteChance}|${patchSize}|${hexRadius}|${JSON.stringify(blobSeeds)}`
      const cached = perTerrainBlobCache.current.get(terrain)
      if (cached?.hexKey === hexKey && cached?.styleKey === styleKey) return cached.blobs
      let rawPolys: [number, number][][]
      let hexCenters: [number, number][]
      if (cached?.hexKey === hexKey) {
        rawPolys = cached.rawPolys
        hexCenters = cached.hexCenters
      } else {
        const topo = buildTerrainBlobTopology(terrainProjected, hexRadius)
        const entry = topo.find(e => e.terrain === terrain)
        rawPolys = entry?.rawPolys ?? []
        hexCenters = entry?.hexCenters ?? []
      }
      const blobs = shapeTerrainBlobs([{ terrain, rawPolys, hexCenters }], smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, hexRadius, clearingChance, satelliteChance, patchSize, blobSeeds)
      perTerrainBlobCache.current.set(terrain, { hexKey, rawPolys, hexCenters, styleKey, blobs })
      return blobs
    })
    for (const t of perTerrainBlobCache.current.keys()) {
      if (!terrainTypeSet.has(t)) perTerrainBlobCache.current.delete(t)
    }
    prevTerrainBlobsRef.current = result
    return result
  }, [isTerrainPainting, projectedHexes, blobComponentsByTerrain, terrainBlobOverrides, terrainTypeBlobStyles, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, terrainBlobClearingChance, terrainBlobSatelliteChance, terrainBlobPatchSize, hexRadius, realisticCoastline, blobSeeds])
  const defaultTerrainBlobsRef = useRef(defaultTerrainBlobs)
  defaultTerrainBlobsRef.current = defaultTerrainBlobs

  // ── Background terrain blobs ──────────────────────────────────────────────
  const prevBackgroundBlobsRef = useRef<{ terrain: string; polys: [number, number][][] }[]>([])
  const backgroundBlobCache = useRef(new Map<string, { hexKey: string; blobs: { terrain: string; polys: [number, number][][] }[] }>())
  const defaultBackgroundBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0 || !terrainLayersEnabled) return []
    if (isTerrainPainting) return prevBackgroundBlobsRef.current
    // Group hexes by backgroundTerrain. Include adjacent primary hexes of the same
    // type so the background blob merges seamlessly with the primary blob at edges.
    const bgTypeSet = new Set<string>()
    for (const p of projectedHexes) {
      const h = p.hex as GeneratedHex
      if (h.backgroundTerrain) bgTypeSet.add(h.backgroundTerrain)
    }
    if (bgTypeSet.size === 0) { prevBackgroundBlobsRef.current = []; return [] }
    const result = [...bgTypeSet].flatMap(terrain => {
      const bgProjected = projectedHexes.filter(p => {
        const h = p.hex as GeneratedHex
        return h.backgroundTerrain === terrain || h.terrain === terrain
      }).map(p => ({ ...p, hex: { ...p.hex, terrain } }))
      if (bgProjected.length === 0) return []
      const hexKey = bgProjected.map(p => `${p.hex.q},${p.hex.r}`).join('|')
      const cached = backgroundBlobCache.current.get(terrain)
      if (cached?.hexKey === hexKey) return cached.blobs
      const blobs = buildTerrainBlobsV2(bgProjected, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, hexRadius)
      backgroundBlobCache.current.set(terrain, { hexKey, blobs })
      return blobs
    })
    prevBackgroundBlobsRef.current = result
    return result
  }, [isTerrainPainting, projectedHexes, hexRadius, terrainLayersEnabled, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection])
  const defaultBackgroundBlobsRef = useRef(defaultBackgroundBlobs)
  defaultBackgroundBlobsRef.current = defaultBackgroundBlobs

  const prevLakeBlobsRef = useRef<{ terrain: string; polys: [number, number][][] }[]>([])
  const lakeBlobCache = useRef<{ hexKey: string; rawPolys: [number, number][][]; hexCenters: [number, number][]; styleKey: string; blobs: { terrain: string; polys: [number, number][][] }[] } | null>(null)
  const defaultLakeBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0) return []
    if (isTerrainPainting) return prevLakeBlobsRef.current
    const lakeOverriddenKeys = new Set(Object.keys(lakeOverrides))
    const defaultLakeProjected = projectedHexes
      .filter(p => {
        if (!(p.hex.isLake ?? false)) return false
        const ck = blobComponents.get(`${p.hex.q},${p.hex.r}`)
        return !ck || !lakeOverriddenKeys.has(ck)
      })
      .map(p => ({ hex: { ...p.hex, terrain: 'lake' }, verts: p.verts }))
    if (defaultLakeProjected.length === 0) {
      lakeBlobCache.current = null
      return prevLakeBlobsRef.current
    }
    const hexKey = defaultLakeProjected.map(p => `${p.hex.q},${p.hex.r}`).join('|')
    const styleKey = `${lakeBlobSmooth}|${lakeBlobOffset}|${lakeBlobBump}|${lakeBlobSweepFreq}|${lakeBlobLobeFreq}|${lakeBlobLobeAmp}|${lakeBlobLobeThreshold}|${lakeBlobLobeDirection}|${hexRadius}`
    if (lakeBlobCache.current?.hexKey === hexKey && lakeBlobCache.current?.styleKey === styleKey) {
      return lakeBlobCache.current.blobs
    }
    let lakeRawPolys: [number, number][][]
    let lakeHexCenters: [number, number][]
    if (lakeBlobCache.current?.hexKey === hexKey) {
      lakeRawPolys = lakeBlobCache.current.rawPolys
      lakeHexCenters = lakeBlobCache.current.hexCenters
    } else {
      const topo = buildTerrainBlobTopology(defaultLakeProjected, hexRadius)
      const entry = topo.find(e => e.terrain === 'lake')
      lakeRawPolys = entry?.rawPolys ?? []
      lakeHexCenters = entry?.hexCenters ?? []
    }
    const result = shapeTerrainBlobs([{ terrain: 'lake', rawPolys: lakeRawPolys, hexCenters: lakeHexCenters }], lakeBlobSmooth, lakeBlobOffset, lakeBlobBump, lakeBlobSweepFreq, lakeBlobLobeFreq, lakeBlobLobeAmp, lakeBlobLobeThreshold, lakeBlobLobeDirection, hexRadius)
    lakeBlobCache.current = { hexKey, rawPolys: lakeRawPolys, hexCenters: lakeHexCenters, styleKey, blobs: result }
    prevLakeBlobsRef.current = result
    return result
  }, [isTerrainPainting, projectedHexes, blobComponents, lakeOverrides, lakeBlobSmooth, lakeBlobOffset, lakeBlobBump, lakeBlobSweepFreq, lakeBlobLobeFreq, lakeBlobLobeAmp, lakeBlobLobeThreshold, lakeBlobLobeDirection, hexRadius])
  const defaultLakeBlobsRef = useRef(defaultLakeBlobs)
  defaultLakeBlobsRef.current = defaultLakeBlobs

  const prevElevationBlobsRef = useRef<{ hills: [number, number][][]; mountains: [number, number][][] }>({ hills: [], mountains: [] })
  const elevationBlobsCache = useRef<{ hexKey: string; topoHills: BlobTopologyEntry | null; topoMountains: BlobTopologyEntry | null; styleKey: string; blobs: { hills: [number, number][][]; mountains: [number, number][][] } } | null>(null)
  const defaultElevationBlobs = useMemo(() => {
    if (projectedHexes.length === 0 || hexRadius === 0) return prevElevationBlobsRef.current
    if (isTerrainPainting) return prevElevationBlobsRef.current
    const hexKey = projectedHexes.map(p => { const h = p.hex as GeneratedHex; return `${h.q},${h.r}:${h.elevation_class ?? ''}:${h.elevation_background ?? ''}` }).join('|')
    const hillsStyle = elevationTypeBlobStyles['hills']
    const mountainsStyle = elevationTypeBlobStyles['mountains']
    const styleKey = `${terrainBlobSmooth}|${terrainBlobOffset}|${terrainBlobBump}|${terrainBlobSweepFreq}|${terrainBlobLobeFreq}|${terrainBlobLobeAmp}|${terrainBlobLobeThreshold}|${terrainBlobLobeDirection}|${hexRadius}|${JSON.stringify(hillsStyle)}|${JSON.stringify(mountainsStyle)}`
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
      const elevProjected = projectedHexes
        .filter(p => {
          const h = p.hex as GeneratedHex
          return h.elevation_class === cls || h.elevation_background === cls
        })
        .map(p => ({ ...p, hex: { ...p.hex, terrain: cls } }))
      if (elevProjected.length === 0) return { topo: null, polys: [] as [number, number][][] }
      const topoEntry = elevationBlobsCache.current?.hexKey === hexKey && cachedTopo
        ? cachedTopo
        : (buildTerrainBlobTopology(elevProjected, hexRadius).find(e => e.terrain === cls) ?? null)
      if (!topoEntry) return { topo: null, polys: [] as [number, number][][] }
      const shaped = shapeTerrainBlobs([topoEntry], smooth, offset, bump, sweepFreq, lobeFreq, lobeAmp, lobeThreshold, lobeDirection, hexRadius)
      return { topo: topoEntry, polys: shaped.find(b => b.terrain === cls)?.polys ?? [] }
    }
    const hillsResult = makePolys('hills', elevationBlobsCache.current?.topoHills)
    const mountainsResult = makePolys('mountains', elevationBlobsCache.current?.topoMountains)
    const blobs = { hills: hillsResult.polys, mountains: mountainsResult.polys }
    elevationBlobsCache.current = { hexKey, topoHills: hillsResult.topo, topoMountains: mountainsResult.topo, styleKey, blobs }
    prevElevationBlobsRef.current = blobs
    return blobs
  }, [isTerrainPainting, projectedHexes, terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection, hexRadius, elevationTypeBlobStyles])
  const defaultElevationBlobsRef = useRef(defaultElevationBlobs)
  defaultElevationBlobsRef.current = defaultElevationBlobs

  const screenPwRef = useRef(0)

  // Compute the paper's screen rect and (lazily) init/update the overlay map
  const snapOverlay = useCallback(() => {
    const meta = metaRef.current
    if (!meta) return
    const { w: cssW, h: cssH } = frameDimsRef.current
    const { pw, ph } = computePaper(cssW, cssH, meta)
    const canvasZoom = zoomRef.current
    const pan = panRef.current

    // Screen-space position of the paper rect (applying the canvas pan/zoom transform)
    const screenW = pw * canvasZoom
    const screenH = ph * canvasZoom
    const screenX = cssW / 2 - screenW / 2 + pan.x
    const screenY = cssH / 2 - screenH / 2 + pan.y
    setOverlayRect({ left: screenX, top: screenY, width: screenW, height: screenH })

    // MapLibre zoom: screenW pixels should span the paper's real-world width.
    // MapLibre GL uses 512px world tiles → constant 78271.516 (same as mapResolutionMpx).
    const paperWidthM = meta.paper_mm[0] * meta.scale_m_per_mm
    const mlZoom = Math.log2(78271.516 * Math.cos(meta.center[1] * Math.PI / 180) * screenW / paperWidthM)

    requestAnimationFrame(() => {
      const el = overlayContainerRef.current
      if (!el) return
      if (!overlayMapRef.current) {
        overlayMapRef.current = new maplibregl.Map({
          container: el,
          style: OSM_OVERLAY_STYLE,
          center: meta.center,
          zoom: mlZoom,
          bearing: meta.bearing,
          interactive: false,
          attributionControl: false,
        })
      } else {
        overlayMapRef.current.resize()
        overlayMapRef.current.jumpTo({ center: meta.center, zoom: mlZoom, bearing: meta.bearing })
      }
    })
  }, [])

  // Spacebar: hold to peek
  useEffect(() => {
    let held = false
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || held) return
      if (shouldSuppressShortcut(e)) return
      e.preventDefault()
      held = true
      snapOverlay()
      setMapOverlay(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      held = false
      setMapOverlay(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [snapOverlay])

  type PaintHoverTarget =
    | { type: 'hex'; q: number; r: number; verts: [number, number][] }
    | { type: 'edge'; p1: [number, number]; p2: [number, number]; edgeKey: string }
    | null
  const paintHoverTargetRef = useRef<PaintHoverTarget>(null)
  const strokeTrailRef = useRef<Map<string, NonNullable<PaintHoverTarget>>>(new Map())
  const strokeTypeRef = useRef<'hex' | 'edge' | null>(null)

  type ExportTarget = { canvas: HTMLCanvasElement; pw: number; ph: number }

  const draw = useCallback((exportTarget?: ExportTarget) => {
    const canvas = exportTarget ? exportTarget.canvas : canvasRef.current
    const meta = metaRef.current
    const hexes = hexesRef.current
    const { w: frameCssW, h: frameCssH } = frameDimsRef.current
    if (!canvas || !meta || (!exportTarget && frameCssW === 0) || hexes.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Reset bbox cache so it's freshly populated by this draw pass
    if (!exportTarget) labelBBoxCacheRef.current = {}

    // When a label is being live-dragged, force the appropriate layer to rebuild
    // so the new position is rendered and the bbox is accurate for hit-testing
    const live = liveLabelOffsetRef.current
    if (!exportTarget && live) {
      if (live.id.startsWith('river:')) riversDirtyRef.current = true
      else if (live.id.startsWith('settlement:')) settlementsDirtyRef.current = true
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
    // Offscreen canvases are capped at zoom=4 equivalent to avoid browser canvas size limits.
    // The main canvas zoom transform handles magnification above that level.
    const offZoom = Math.min(zoom, 4)
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
      : computePaper(frameCssW, frameCssH, meta)
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

    // Paper shadow
    _drawPaperBackground({ ctx, px, py, pw, ph, mapBgColor: mapBgColorRef.current })

    const mmToPx = pw / meta.paper_mm[0]
    const mgPx = meta.margin_mm * mmToPx
    const marginL = px + mgPx, marginR = px + pw - mgPx
    const marginT = py + mgPx, marginB = py + ph - mgPx

    // Full hexes: only draw if all vertices inside margin.
    // Partial hexes: draw clipped at the margin boundary.
    const inMargin = (verts: [number, number][]) =>
      verts.every(([x, y]) => x >= marginL && x <= marginR && y >= marginT && y <= marginB)

    const project = (lon: number, lat: number): [number, number] =>
      projectToCanvas(lon, lat, meta, pw, ph, px, py)

    const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
    const R = meta.outer_radius_m * scalePxPerM

    const buildTerrainTextures = (): Map<string, HTMLImageElement | null> => {
      const map = new Map<string, HTMLImageElement | null>()
      const cache = textureCacheRef.current
      const fileOverrides = terrainTextureFileRef.current
      const enabled = terrainTextureEnabledRef.current
      // Built-in terrains — user override takes precedence; disabled if enabled flag is explicitly false
      for (const [terrain, defaultId] of Object.entries(DEFAULT_TERRAIN_TEXTURES)) {
        if (enabled[terrain] === false) continue
        const override = fileOverrides[terrain]
        const id = override !== undefined ? override : defaultId
        if (id) map.set(terrain, cache.get(id) ?? null)
      }
      // User-assigned textures for terrains without a default — only if explicitly enabled
      for (const [terrain, id] of Object.entries(fileOverrides)) {
        if (!map.has(terrain) && id && enabled[terrain] === true) map.set(terrain, cache.get(id) ?? null)
      }
      // Custom terrains — only if explicitly enabled
      for (const ct of customTerrainsRef.current) {
        if (enabled[ct.id] === false) continue
        const override = fileOverrides[ct.id]
        const id = override !== undefined ? override : (ct.textureId ?? '')
        if (id && (enabled[ct.id] === true || ct.textureId)) map.set(ct.id, cache.get(id) ?? null)
      }
      return map
    }

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
      terrainTextures: buildTerrainTextures(),
      px, py, pw, ph,
      backgroundTerrainBlobs: defaultBackgroundBlobsRef.current,
      defaultTerrainBlobs: defaultTerrainBlobsRef.current,
      defaultLakeBlobs: defaultLakeBlobsRef.current,
      terrainBlobOverrides: terrainBlobOverridesRef.current,
      lakeOverrides: lakeOverridesRef.current,
      blobComponents: blobComponentsRef.current,
      blobComponentsByTerrain: blobComponentsByTerrainRef.current,
      terrainBlobParams: {
        smooth: terrainBlobSmoothRef.current, offset: terrainBlobOffsetRef.current,
        bump: terrainBlobBumpRef.current, sweepFreq: terrainBlobSweepFreqRef.current,
        lobeFreq: terrainBlobLobeFreqRef.current, lobeAmp: terrainBlobLobeAmpRef.current,
        lobeThreshold: terrainBlobLobeThresholdRef.current, lobeDirection: terrainBlobLobeDirectionRef.current,
        clearingChance: terrainBlobClearingChanceRef.current,
        satelliteChance: terrainBlobSatelliteChanceRef.current,
        patchSize: terrainBlobPatchSizeRef.current,
      },
      terrainBlobFeather: terrainBlobFeatherRef.current,
      lakeBlobParams: {
        smooth: lakeBlobSmoothRef.current, offset: lakeBlobOffsetRef.current,
        bump: lakeBlobBumpRef.current, sweepFreq: lakeBlobSweepFreqRef.current,
        lobeFreq: lakeBlobLobeFreqRef.current, lobeAmp: lakeBlobLobeAmpRef.current,
        lobeThreshold: lakeBlobLobeThresholdRef.current, lobeDirection: lakeBlobLobeDirectionRef.current,
        clearingChance: 0, satelliteChance: 0, patchSize: 1,
      },
      hexes: hexesRef.current,
      hexTerrainLayers,
      R,
      realisticCoastline: realisticCoastlineRef.current,
      coastlineDebugRaw: coastlineDebugRawRef.current,
      oceanSeaKeys: oceanSeaKeysRef.current,
      beachStrip: beachStripRef.current,
      beachColor: beachColorRef.current,
      beachWidth: beachWidthRef.current,
      elevationBlobs: defaultElevationBlobsRef.current,
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
      hillshadeCanvas: hillshadeCanvasRef.current,
      hillshadeDisabledTerrains: hillshadeDisabledTerrainsSetRef.current,
      hillshadeDisabledElevClasses: hillshadeDisabledElevClassesSetRef.current,
      contourCanvas: contourCanvasRef.current,
      contourDisabledTerrains: contourDisabledTerrainsSetRef.current,
      contourDisabledElevClasses: contourDisabledElevClassesSetRef.current,
      blobPatches: blobPatchesRef.current,
    }

    // Build offscreen terrain layer when dirty (skipped for export — always renders inline).
    // Skip rebuild while actively painting: blobs are frozen during drag so the terrain
    // visually doesn't change, and rebuilding on every mousemove event (~30ms each) blocks
    // the main thread. The rebuild runs once on mouseup when isPaintingRef goes false.
    if (!isExport) {
      const papW = Math.ceil(pw), papH = Math.ceil(ph)
      if (!isPaintingRef.current && (terrainDirtyRef.current || !terrainLayerRef.current ||
          terrainLayerPapWRef.current !== papW || terrainLayerPapHRef.current !== papH)) {
        const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
        const offscreen = new OffscreenCanvas(offW, offH)
        const oCtx = offscreen.getContext('2d')!
        oCtx.scale(dpr * offZoom, dpr * offZoom)
        oCtx.translate(-px, -py)
        oCtx.save()
        oCtx.beginPath()
        oCtx.rect(px, py, pw, ph)
        oCtx.clip()
        _drawTerrain(oCtx, terrainParams)
        oCtx.restore()
        terrainLayerRef.current = offscreen
        terrainDirtyRef.current = false
        terrainLayerPapWRef.current = papW
        terrainLayerPapHRef.current = papH
      }
    }

    // Draw with paper-edge clip active (clips content at paper boundary)
    ctx.save()
    ctx.beginPath()
    ctx.rect(px, py, pw, ph)
    ctx.clip()

    // Blit terrain layer for screen rendering
    if (!isExport && terrainLayerRef.current) {
      ctx.drawImage(terrainLayerRef.current, px, py, pw, ph)
    }
    if (isExport || !terrainLayerRef.current) {
      let exportTerrainBlobs = terrainParams.defaultTerrainBlobs
      let exportLakeBlobs = terrainParams.defaultLakeBlobs
      if (isExport) {
        const overriddenKeys = new Set(Object.keys(terrainBlobOverridesRef.current))
        const components = blobComponentsRef.current
        const exportRealistic = realisticCoastlineRef.current
        const isPureSea = (h: GeneratedHex) =>
          h.terrain === 'sea' && (!h.coastline_clip || h.coastline_clip.length === 0)
        const terrainTypeSet = new Set<string>()
        for (const p of projected) {
          const h = p.hex as GeneratedHex
          if (exportRealistic && isPureSea(h)) continue
          for (const t of coastalBlobTerrains(h, exportRealistic)) {
            if (t !== 'clear' && t !== 'lake') terrainTypeSet.add(t)
          }
        }
        exportTerrainBlobs = [...terrainTypeSet].flatMap(terrain => {
          const componentMap = blobComponentsByTerrainRef.current.get(terrain) ?? new Map<string, string>()
          const terrainProjected = projected.filter(p => {
            const h = p.hex as GeneratedHex
            if (exportRealistic && isPureSea(h)) return false
            if (!coastalBlobTerrains(h, exportRealistic).includes(terrain)) return false
            if (overriddenKeys.size > 0) {
              const ck = componentMap.get(`${p.hex.q},${p.hex.r}`)
              if (ck && overriddenKeys.has(ck)) return false
            }
            return true
          }).map(p => ({ ...p, hex: { ...p.hex, terrain } }))
          if (terrainProjected.length === 0) return []
          const tsRef = terrainTypeBlobStylesRef.current[terrain]?.enabled ? terrainTypeBlobStylesRef.current[terrain] : null
          return buildTerrainBlobsV2(
            terrainProjected,
            tsRef?.smooth          ?? terrainBlobSmoothRef.current,
            tsRef?.offset          ?? terrainBlobOffsetRef.current,
            tsRef?.bump            ?? terrainBlobBumpRef.current,
            tsRef?.sweepFreq       ?? terrainBlobSweepFreqRef.current,
            tsRef?.lobeFreq        ?? terrainBlobLobeFreqRef.current,
            tsRef?.lobeAmp         ?? terrainBlobLobeAmpRef.current,
            tsRef?.lobeThreshold   ?? terrainBlobLobeThresholdRef.current,
            tsRef?.lobeDirection   ?? terrainBlobLobeDirectionRef.current,
            R,
            tsRef?.clearingChance  ?? terrainBlobClearingChanceRef.current,
            tsRef?.satelliteChance ?? terrainBlobSatelliteChanceRef.current,
            tsRef?.patchSize       ?? terrainBlobPatchSizeRef.current,
          )
        })
        const lakeOverriddenKeys = new Set(Object.keys(lakeOverridesRef.current))
        const defaultLakeProjected = projected
          .filter(p => {
            if (!(p.hex.isLake ?? false)) return false
            const ck = components.get(`${p.hex.q},${p.hex.r}`)
            return !ck || !lakeOverriddenKeys.has(ck)
          })
          .map(p => ({ hex: { ...p.hex, terrain: 'lake' }, verts: p.verts }))
        exportLakeBlobs = defaultLakeProjected.length > 0
          ? buildTerrainBlobsV2(defaultLakeProjected, lakeBlobSmoothRef.current, lakeBlobOffsetRef.current, lakeBlobBumpRef.current, lakeBlobSweepFreqRef.current, lakeBlobLobeFreqRef.current, lakeBlobLobeAmpRef.current, lakeBlobLobeThresholdRef.current, lakeBlobLobeDirectionRef.current, R)
          : []
      }
      _drawTerrain(ctx, { ...terrainParams, backgroundTerrainBlobs: defaultBackgroundBlobsRef.current, defaultTerrainBlobs: exportTerrainBlobs, defaultLakeBlobs: exportLakeBlobs })
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
          px, py, pw, ph,
        })
      }
    }

    // Hex borders — offscreen cached; suppressed in areas mode
    // Difference blend mode must draw directly onto main canvas so it composites against terrain.
    if (borderMode !== 'none' && !areasModeRef.current) {
      if (!isExport && !hexBorderDifferenceRef.current) {
        const papW = Math.ceil(pw), papH = Math.ceil(ph)
        if (hexBorderDirtyRef.current || !hexBorderLayerRef.current ||
            hexBorderLayerPapWRef.current !== papW || hexBorderLayerPapHRef.current !== papH) {
          const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
          const offscreen = new OffscreenCanvas(offW, offH)
          const oCtx = offscreen.getContext('2d')!
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.translate(-px, -py)
          oCtx.save()
          oCtx.beginPath()
          oCtx.rect(px, py, pw, ph)
          oCtx.clip()
          _drawHexBorders(oCtx, projected, borderMode, edgeMode, inMargin, 1, bordersExcludedSet, hexBorderOpacityRef.current, hexBorderColorRef.current, false)
          oCtx.restore()
          hexBorderLayerRef.current = offscreen
          hexBorderDirtyRef.current = false
          hexBorderLayerPapWRef.current = papW
          hexBorderLayerPapHRef.current = papH
        }
        ctx.drawImage(hexBorderLayerRef.current, px, py, pw, ph)
      }
      if (!isExport && hexBorderDifferenceRef.current) {
        _drawHexBorders(ctx, projected, borderMode, edgeMode, inMargin, 1, bordersExcludedSet, hexBorderOpacityRef.current, hexBorderColorRef.current, true)
      }
      if (isExport) {
        _drawHexBorders(ctx, projected, borderMode, edgeMode, inMargin, lineScale, bordersExcludedSet, hexBorderOpacityRef.current, hexBorderColorRef.current, hexBorderDifferenceRef.current)
      }
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

    // Hex numbers
    if (hexNumbersEnabledRef.current && hexNumberMapRef.current.size > 0) {
      _drawHexNumbers({
        ctx,
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

    // Hex highlights — offscreen cached (joined highlights + line highlights)
    {

      if (!isExport) {
        const papW = Math.ceil(pw), papH = Math.ceil(ph)
        if (joinedHighlightsDirtyRef.current || !joinedHighlightsLayerRef.current ||
            joinedHighlightsLayerPapWRef.current !== papW || joinedHighlightsLayerPapHRef.current !== papH) {
          const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
          const offscreen = new OffscreenCanvas(offW, offH)
          const oCtx = offscreen.getContext('2d')!
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.translate(-px, -py)
          _drawHighlights(oCtx, { highlights: highlightsRef.current, highlightedHexes: highlightedHexesRef.current, highlightLines: highlightLinesRef.current, highlightEdgePaths: highlightEdgePathsRef.current, projected, edgeMode, R, project, inMargin })
          joinedHighlightsLayerRef.current = offscreen
          joinedHighlightsDirtyRef.current = false
          joinedHighlightsLayerPapWRef.current = papW
          joinedHighlightsLayerPapHRef.current = papH
        }
        ctx.drawImage(joinedHighlightsLayerRef.current, px, py, pw, ph)
      }
      if (isExport) {
        _drawHighlights(ctx, { highlights: highlightsRef.current, highlightedHexes: highlightedHexesRef.current, highlightLines: highlightLinesRef.current, highlightEdgePaths: highlightEdgePathsRef.current, projected, edgeMode, R, project, inMargin, lineScale })
      }

      // Hover preview for edge-paint mode — drawn directly on ctx, not cached
      if (!isExport) {
        const hov = hoveredEdgeRef.current
        if (hov) {
          const proj = projected.find(p => p.hex.q === hov.hexQ && p.hex.r === hov.hexR)
          if (proj) {
            const v0 = proj.verts[hov.edgeI]
            const v1 = proj.verts[(hov.edgeI + 1) % 6]
            ctx.save()
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'
            ctx.lineWidth = 3
            ctx.lineCap = 'round'
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(v0[0], v0[1])
            ctx.lineTo(v1[0], v1[1])
            ctx.stroke()
            ctx.setLineDash([])
            ctx.restore()
          }
        }
      }
    }

    // Areas — offscreen cached (when areas mode is on)
    if (areasModeRef.current) {
      if (!isExport) {
        const papW = Math.ceil(pw), papH = Math.ceil(ph)
        if (areasDirtyRef.current || !areasLayerRef.current ||
            areasLayerPapWRef.current !== papW || areasLayerPapHRef.current !== papH) {
          const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
          const offscreen = new OffscreenCanvas(offW, offH)
          const oCtx = offscreen.getContext('2d')!
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.translate(-px, -py)
          _drawAreas(oCtx, { areas: areasRef.current, areaHexes: areaHexesRef.current, projected, riverEdges: riverEdgesRef.current, canalEdges: canalEdgesRef.current, edgeMode, inMargin, R, style: areasStyleRef.current, terrainLabelSpec: resolvedLabelSpecsRef.current.terrain })
          areasLayerRef.current = offscreen
          areasDirtyRef.current = false
          areasLayerPapWRef.current = papW
          areasLayerPapHRef.current = papH
        }
        ctx.drawImage(areasLayerRef.current, px, py, pw, ph)
      }
      if (isExport) {
        _drawAreas(ctx, { areas: areasRef.current, areaHexes: areaHexesRef.current, projected, riverEdges: riverEdgesRef.current, canalEdges: canalEdgesRef.current, edgeMode, inMargin, R, style: areasStyleRef.current, terrainLabelSpec: resolvedLabelSpecsRef.current.terrain, lineScale })
      }
    }

    // Rivers — offscreen cached
    const lakeProjCenters = projected
      .filter(({ hex }) => hex.isLake)
      .map(({ verts }) => ({
        px: verts.reduce((s, v) => s + v[0], 0) / 6,
        py: verts.reduce((s, v) => s + v[1], 0) / 6,
      }))

    let riverChainData, canalChainData
    if (RIVER_V2) {
      const rv2 = buildRiverChainsV2(riverEdgesRef.current, hexesRef.current, riverChainOverridesRef.current, riverWiggleFreqRef.current, riverWiggleAmpRef.current, riverSmoothingRef.current, riverHopPropsRef.current, riverSegmentPropsRef.current, riverPathSmoothingRef.current)
      riverChainsV2Ref.current = rv2
      riverChainData = rv2.map(c => ({ vertices: c.chain, segKey: c.segKey, hopKeys: c.hopKeys, hopRanges: c.hopRanges }))
      canalChainData = buildRiverChainsV2(canalEdgesRef.current, hexesRef.current, riverChainOverridesRef.current, riverWiggleFreqRef.current, riverWiggleAmpRef.current, riverSmoothingRef.current, {}, {}, riverPathSmoothingRef.current).map(c => ({ vertices: c.chain, segKey: c.segKey }))
    } else {
      riverChainsV2Ref.current = []
      riverChainData = buildRiverChains(riverEdgesRef.current, hexesRef.current)
      canalChainData = buildRiverChains(canalEdgesRef.current, hexesRef.current)
    }
    computedRiverChainsRef.current = riverChainData
    computedCanalChainsRef.current = canalChainData
    riverChainCache.chains = riverChainData

    // Bridge detection — runs once per data-change (dirty flag), not every frame
    if (bridgesDirtyRef.current) {
      bridgesDirtyRef.current = false
      if (bridgesEnabledRef.current) {
        const roadChains = smoothedRoadDataV2Ref.current
          ? smoothedRoadDataV2Ref.current.chains
          : smoothedRoadDataRef.current.chains
        const riverHWFor = (segKey: string) => {
          const p = riverSegmentPropsRef.current[segKey]
          return p?.width !== undefined ? 1.4 * p.width : 1.4 * riverWidthScaleRef.current
        }
        const canalHWFor = (segKey: string) => {
          const p = canalSegmentPropsRef.current[segKey]
          return p?.width !== undefined ? 1.4 * p.width : 1.4 * canalWidthScaleRef.current
        }
        detectedBridgesRef.current = detectBridges(
          roadChains,
          smoothedRailDataRef.current.chains,
          [
            ...riverChainData.map(c => ({ vertices: c.vertices, halfWidth: riverHWFor(c.segKey) })),
            ...canalChainData.map(c => ({ vertices: c.vertices, halfWidth: canalHWFor(c.segKey) })),
          ],
        )
      } else {
        detectedBridgesRef.current = []
      }
    }

    const riverParams = {
      riverChainData,
      canalChainData,
      riverSegProps: riverSegmentPropsRef.current,
      canalSegProps: canalSegmentPropsRef.current,
      riverStyle: riverStyleRef.current,
      canalStyle: canalStyleRef.current,
      selectedRiverKeys: new Set(selectedSegmentKeysRef.current),
      selectedCanalKeys: new Set(selectedCanalSegmentKeysRef.current),
      riverBaseHW: 1.4 * riverWidthScaleRef.current * lineScale,
      canalBaseHW: 1.4 * canalWidthScaleRef.current * lineScale,
      lakeProjCenters,
      smoothPasses: RIVER_V2 ? 0 : riverCurveStepsRef.current,
      wobbleBroad: RIVER_V2 ? 0 : riverWobbleRef.current * R * 0.5,
      wobbleDetail: RIVER_V2 ? 0 : riverDetailRef.current * R * 0.18,
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
      liveLabelOffset: liveLabelOffsetRef.current ?? undefined,
      labelBBoxOut: labelBBoxCacheRef.current,
    }

    // Compute drag state upfront — needed for both river and road live previews below
    const isDraggingCP = Object.keys(dragLiveOverrideRef.current).length > 0
    const isDraggingRailCP = isDraggingCP && draggingCpKindRef.current === 'rail'
    const liveDenseDrag = draggingDensePtRef.current
    const liveDensePos = dragLiveDensePosRef.current
    const isDraggingRoadDense = !!(liveDenseDrag?.kind === 'road' && liveDensePos)
    const isDraggingRiverDense = !!(liveDenseDrag?.kind === 'river' && liveDensePos)
    const liveChainOverrides = isDraggingRoadDense
      ? { ...roadChainOverridesRef.current, [liveDenseDrag!.id]: liveDenseDrag!.handles.map((p, i) => i === liveDenseDrag!.handleIdx ? liveDensePos! : p) as [number, number][] }
      : roadChainOverridesRef.current
    const isDraggingDense = isDraggingRoadDense

    // During a river node drag, compute live river geometry and bypass the offscreen cache
    let liveRiverParams = riverParams
    if (isDraggingRiverDense && liveDenseDrag && liveDensePos) {
      const liveRiverOverrides = {
        ...riverChainOverridesRef.current,
        [liveDenseDrag.id]: liveDenseDrag.handles.map((p, i) => i === liveDenseDrag.handleIdx ? liveDensePos : p) as [number, number][],
      }
      const liveRv2 = buildRiverChainsV2(riverEdgesRef.current, hexesRef.current, liveRiverOverrides, riverWiggleFreqRef.current, riverWiggleAmpRef.current, riverSmoothingRef.current, riverHopPropsRef.current, riverSegmentPropsRef.current, riverPathSmoothingRef.current)
      liveRiverParams = { ...riverParams, riverChainData: liveRv2.map(c => ({ vertices: c.chain, segKey: c.segKey })) }
    }

    if (!isExport) {
      if (isDraggingRiverDense) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(px, py, pw, ph)
        ctx.clip()
        _drawRivers(ctx, liveRiverParams)
        ctx.restore()
      } else {
        const papW = Math.ceil(pw), papH = Math.ceil(ph)
        if (riversDirtyRef.current || !riversLayerRef.current ||
            riversLayerPapWRef.current !== papW || riversLayerPapHRef.current !== papH) {
          const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
          const offscreen = new OffscreenCanvas(offW, offH)
          const oCtx = offscreen.getContext('2d')!
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.translate(-px, -py)
          oCtx.save()
          oCtx.beginPath()
          oCtx.rect(px, py, pw, ph)
          oCtx.clip()
          _drawRivers(oCtx, riverParams)
          oCtx.restore()
          riversLayerRef.current = offscreen
          riversDirtyRef.current = false
          riversLayerPapWRef.current = papW
          riversLayerPapHRef.current = papH
        }
        ctx.drawImage(riversLayerRef.current, px, py, pw, ph)
      }
    }
    if (isExport) {
      _drawRivers(ctx, liveRiverParams)
    }

    // Urban area buildings + settlement buildings (rendered below roads)
    {
      const { chains: roadChains } = smoothedRoadDataRef.current
      const roadStyles = roadTierStylesRef.current

      // Invalidate geometry cache when inputs that affect building layout change
      {
        const currentZoom = Math.round(zoomRef.current * 10)
        const epoch = lastBuildingCacheEpochRef.current
        if (!epoch ||
            epoch.roadData !== roadBaseDataRef.current ||
            epoch.zoom !== currentZoom ||
            epoch.settlementStyles !== settlementTierStylesRef.current ||
            epoch.urbanStyle !== urbanStyleRef.current) {
          hexBuildingGeoCacheRef.current.clear()
          lastBuildingCacheEpochRef.current = {
            roadData: roadBaseDataRef.current,
            zoom: currentZoom,
            settlementStyles: settlementTierStylesRef.current,
            urbanStyle: urbanStyleRef.current,
          }
        }
      }


      if (!isExport) {
        const papW = Math.ceil(pw), papH = Math.ceil(ph)
        if (buildingsDirtyRef.current || !buildingsLayerRef.current ||
            buildingsLayerPapWRef.current !== papW || buildingsLayerPapHRef.current !== papH) {
          // Clear geometry cache so buildings are re-generated into the new offscreen context
          hexBuildingGeoCacheRef.current.clear()
          const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
          const offscreen = new OffscreenCanvas(offW, offH)
          const oCtx = offscreen.getContext('2d')!
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.translate(-px, -py)
          oCtx.save()
          oCtx.beginPath()
          oCtx.rect(px, py, pw, ph)
          oCtx.clip()
          _drawAllBuildings(oCtx, { hexes: hexesRef.current, urbanHexes: urbanHexesRef.current, urbanStyle: urbanStyleRef.current, settlements: settlementsRef.current, settlementTierStyles: settlementTierStylesRef.current, roadChains, roadTierStyles: roadTierStylesRef.current, hexBuildingGeoCache: hexBuildingGeoCacheRef.current, project })
          _drawAllBuildingsV2(oCtx, { hexes: hexesRef.current, urbanHexes: urbanHexesRef.current, urbanStyle: urbanStyleRef.current, settlements: settlementsRef.current, settlementTierStyles: settlementTierStylesRef.current, roadChains, roadTierStyles: roadTierStylesRef.current, project })
          oCtx.restore()
          buildingsLayerRef.current = offscreen
          buildingsDirtyRef.current = false
          buildingsLayerPapWRef.current = papW
          buildingsLayerPapHRef.current = papH
        }
        ctx.drawImage(buildingsLayerRef.current, px, py, pw, ph)
      }
      if (isExport) {
        _drawAllBuildings(ctx, { hexes: hexesRef.current, urbanHexes: urbanHexesRef.current, urbanStyle: urbanStyleRef.current, settlements: settlementsRef.current, settlementTierStyles: settlementTierStylesRef.current, roadChains, roadTierStyles: roadTierStylesRef.current, hexBuildingGeoCache: hexBuildingGeoCacheRef.current, project })
        _drawAllBuildingsV2(ctx, { hexes: hexesRef.current, urbanHexes: urbanHexesRef.current, urbanStyle: urbanStyleRef.current, settlements: settlementsRef.current, settlementTierStyles: settlementTierStylesRef.current, roadChains, roadTierStyles: roadTierStylesRef.current, project })
      }
    }

    // During a CP drag, compute road geometry with the live position directly — no store update,
    // no React re-render cycle, no useMemo. On drop, the store is updated once for the full rebuild.
    const liveTierGeomMap = (() => {
      const map: Record<number, { wiggleAmp?: number; wiggleFreq?: number; pathSmoothing?: number; smoothing?: number; centerPull?: number }> = {}
      roadTierGeometryRef.current.forEach((g, i) => { if (g) map[i] = g })
      return Object.keys(map).length > 0 ? map : undefined
    })()

    const liveRoadData = roadRenderVersionRef.current === 'v3'
      ? (isDraggingCP
          ? buildRoadChainsV3(
              roadEdgesRef.current,
              hexIdxRef.current as Map<string, { center: [number, number] }>,
              { ...roadControlOverridesRef.current, ...dragLiveOverrideRef.current },
              roadV3TierGeomRef.current,
            )
          : roadDataV3Ref.current ?? smoothedRoadDataRef.current)
      : isDraggingCP
        ? buildRoadChainsV2(
            roadEdgesRef.current,
            hexIdxRef.current as Map<string, { center: [number, number] }>,
            { ...roadControlOverridesRef.current, ...dragLiveOverrideRef.current },
            roadWiggleAmpRef.current,
            roadWiggleFreqRef.current,
            roadSmoothingRef.current,
            roadPathSmoothingRef.current,
            roadChainOverridesRef.current,
            roadSegmentPropsRef.current,
            roadHopPropsRef.current,
            undefined,
            0,
            liveTierGeomMap,
            roadCenterPullRef.current,
          )
        : isDraggingDense
          ? buildRoadChainsV2(
              roadEdgesRef.current,
              hexIdxRef.current as Map<string, { center: [number, number] }>,
              roadControlOverridesRef.current,
              roadWiggleAmpRef.current,
              roadWiggleFreqRef.current,
              roadSmoothingRef.current,
              roadPathSmoothingRef.current,
              liveChainOverrides,
              roadSegmentPropsRef.current,
              roadHopPropsRef.current,
              undefined,
              0,
              liveTierGeomMap,
              roadCenterPullRef.current,
            )
          : smoothedRoadDataV2Ref.current ?? smoothedRoadDataRef.current

    const liveRailGeomOverride = railGeomOverrideRef.current ?? undefined
    const liveRailData = isDraggingRailCP
      ? applyRailWiggle(
          buildRailChains(
            railEdgesRef.current,
            roadEdgesRef.current,
            hexIdxRef.current as Map<string, { center: [number, number] }>,
            new Map(roadBaseDataRef.current.controlPoints.filter(cp => cp.key.startsWith('em|')).map(cp => [cp.key, cp.pos] as [string, [number, number]])),
            new Map(roadBaseDataRef.current.controlPoints.filter(cp => cp.key.startsWith('ja|')).map(cp => [cp.key.slice(3), cp.pos] as [string, [number, number]])),
            { ...railControlOverridesRef.current, ...dragLiveOverrideRef.current },
            0, 0,
            liveRailGeomOverride?.smoothing ?? railSmoothingRef.current,
            {}, {}, 2,
            liveRailGeomOverride?.pathSmoothing ?? railPathSmoothingRef.current,
          ),
          railWiggleAmpRef.current,
          railWiggleFreqRef.current,
          railSegmentPropsRef.current,
          railHopPropsRef.current,
          0,
          liveRailGeomOverride,
        )
      : smoothedRailDataRef.current

    // Road chains + Rail chains — offscreen cached together
    {
      const { chains: roadChains, junctions } = liveRoadData
      const tierStyles = roadTierStylesRef.current

      if (!isExport) {
        if (isDraggingCP || isDraggingDense) {
          // Bypass offscreen cache during drag — draw directly so the road bends live
          ctx.save()
          ctx.beginPath()
          ctx.rect(px, py, pw, ph)
          ctx.clip()
          _drawRoadsAndRails(ctx, { roadChains, junctions, railChains: liveRailData.chains, tierStyles, railStyle: railStyleRef.current, project })
          ctx.restore()
        } else {
          const papW = Math.ceil(pw), papH = Math.ceil(ph)
          if (roadsDirtyRef.current || !roadsLayerRef.current ||
              roadsLayerPapWRef.current !== papW || roadsLayerPapHRef.current !== papH) {
            const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
            const offscreen = new OffscreenCanvas(offW, offH)
            const oCtx = offscreen.getContext('2d')!
            oCtx.scale(dpr * offZoom, dpr * offZoom)
            oCtx.translate(-px, -py)
            oCtx.save()
            oCtx.beginPath()
            oCtx.rect(px, py, pw, ph)
            oCtx.clip()
            _drawRoadsAndRails(oCtx, { roadChains, junctions, railChains: liveRailData.chains, tierStyles, railStyle: railStyleRef.current, project })
            oCtx.restore()
            roadsLayerRef.current = offscreen
            roadsDirtyRef.current = false
            roadsLayerPapWRef.current = papW
            roadsLayerPapHRef.current = papH
          }
          ctx.drawImage(roadsLayerRef.current, px, py, pw, ph)
        }
      }
      if (isExport) {
        const scaledTierStyles = tierStyles.map(s => ({ ...s, outerW: s.outerW * lineScale })) as [RoadTierStyle, RoadTierStyle, RoadTierStyle]
        const scaledRailStyle = { ...railStyleRef.current, thickness: railStyleRef.current.thickness * lineScale }
        _drawRoadsAndRails(ctx, { roadChains, junctions, railChains: liveRailData.chains, tierStyles: scaledTierStyles, railStyle: scaledRailStyle, project, mapStyle: mapStyleRef.current })
      }

      // Debug: raw OSM way overlay (screen-only, never exported)
      if (!isExport && showRawOsmRoadsRef.current) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(px, py, pw, ph)
        ctx.clip()
        if (showRawOsmRoadsRef.current) {
          const tierColor = ['rgba(220,50,50,0.9)', 'rgba(220,140,30,0.9)', 'rgba(180,180,30,0.85)']
          const tierWidth = [2.5, 1.5, 1]
          const hwTier: Record<string, number> = {
            motorway: 0, motorway_link: 0, trunk: 0, trunk_link: 0,
            primary: 1, primary_link: 1,
            secondary: 2, secondary_link: 2, tertiary: 2, tertiary_link: 2,
          }
          for (const way of rawRoadWaysRef.current) {
            if (way.coords.length < 2) continue
            const tier = hwTier[way.highway] ?? 2
            ctx.beginPath()
            ctx.strokeStyle = tierColor[tier]
            ctx.lineWidth = tierWidth[tier]
            const [x0, y0] = project(way.coords[0][0], way.coords[0][1])
            ctx.moveTo(x0, y0)
            for (let i = 1; i < way.coords.length; i++) {
              const [x, y] = project(way.coords[i][0], way.coords[i][1])
              ctx.lineTo(x, y)
            }
            ctx.stroke()
          }
        }
        ctx.restore()
      }

    }

    // Bridges — drawn on top of rivers and roads
    if (bridgesEnabledRef.current && detectedBridgesRef.current.length > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(px, py, pw, ph)
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
    if (riverNodeEditModeRef.current && RIVER_V2) {
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

    // Settlements — offscreen cached
    {

      if (!isExport) {
        const papW = Math.ceil(pw), papH = Math.ceil(ph)
        if (settlementsDirtyRef.current || !settlementsLayerRef.current ||
            settlementsLayerPapWRef.current !== papW || settlementsLayerPapHRef.current !== papH) {
          const offW = Math.ceil(pw * dpr * offZoom), offH = Math.ceil(ph * dpr * offZoom)
          const offscreen = new OffscreenCanvas(offW, offH)
          const oCtx = offscreen.getContext('2d')!
          oCtx.scale(dpr * offZoom, dpr * offZoom)
          oCtx.translate(-px, -py)
          oCtx.save()
          oCtx.beginPath()
          oCtx.rect(px, py, pw, ph)
          oCtx.clip()
          const activeRoadChainsS = smoothedRoadDataV2Ref.current ? smoothedRoadDataV2Ref.current.chains : smoothedRoadDataRef.current.chains
          _drawSettlements(oCtx, { settlements: settlementsRef.current, tierStyles: settlementTierStylesRef.current, labelSpecs: resolvedLabelSpecsRef.current, roadChains: activeRoadChainsS, railChains: smoothedRailDataRef.current.chains, project, hexCenterOf: (q, r) => { const h = hexesRef.current.find(h => h.q === q && h.r === r); return h ? project(h.center[0], h.center[1]) : null }, hexRadiusPx: hexRadiusRef.current, labelOffsets: labelOffsetsRef.current, liveLabelOffset: liveLabelOffsetRef.current ?? undefined, labelBBoxOut: labelBBoxCacheRef.current })
          oCtx.restore()
          settlementsLayerRef.current = offscreen
          settlementsDirtyRef.current = false
          settlementsLayerPapWRef.current = papW
          settlementsLayerPapHRef.current = papH
        }
        ctx.drawImage(settlementsLayerRef.current, px, py, pw, ph)
      }
      if (isExport) {
        const activeRoadChainsS = smoothedRoadDataV2Ref.current ? smoothedRoadDataV2Ref.current.chains : smoothedRoadDataRef.current.chains
        _drawSettlements(ctx, { settlements: settlementsRef.current, tierStyles: settlementTierStylesRef.current, labelSpecs: resolvedLabelSpecsRef.current, roadChains: activeRoadChainsS, railChains: smoothedRailDataRef.current.chains, project, hexCenterOf: (q, r) => { const h = hexesRef.current.find(h => h.q === q && h.r === r); return h ? project(h.center[0], h.center[1]) : null }, hexRadiusPx: hexRadiusRef.current, labelOffsets: labelOffsetsRef.current })
      }
    }

    // Icons — drawn on top of all layers
    {
      const snap = !isExport && iconPlaceModeRef.current && iconSnapRef.current
        ? { overlayId: activeIconOverlayIdRef.current!, lon: iconSnapRef.current[0], lat: iconSnapRef.current[1] }
        : undefined
      _drawIcons({ ctx, iconOverlays: iconOverlaysRef.current, placedIcons: placedIconsRef.current, project, R, inMargin, snapPreview: snap })
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
      })
    }

    // Cover excluded hexes with background color (on top of all content, inside paper clip)
    if (excludedSet.size > 0) {
      _drawExcludedHexOverlay(ctx, projected, excludedSet, mapBgColorRef.current)
    }

    // Elevation paint hover highlight
    if (!isExport && elevationPaintModeRef.current) {
      const hoverTarget = paintHoverTargetRef.current
      if (hoverTarget?.type === 'hex') {
        const brushColor: Record<string, string> = { flat: '#3a7a3a', hills: '#7a7a30', mountains: '#7a4a20' }
        ctx.save()
        ctx.globalAlpha = 0.45
        ctx.fillStyle = brushColor[elevationPaintBrushRef.current] ?? '#888888'
        ctx.beginPath()
        const { verts } = hoverTarget
        ctx.moveTo(verts[0][0], verts[0][1])
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    // Paint stroke trail — all hexes/edges touched during the current drag stroke
    if (!isExport && terrainPaintModeRef.current && strokeTrailRef.current.size > 0) {
      const brush = terrainPaintBrushRef.current
      const rawColor = terrainColorsRef.current[brush] ?? TERRAIN_COLORS[brush] ?? '#888888'
      ctx.save()
      for (const target of strokeTrailRef.current.values()) {
        if (target.type === 'hex') {
          ctx.globalAlpha = 0.35
          ctx.fillStyle = rawColor
          ctx.beginPath()
          const { verts } = target
          ctx.moveTo(verts[0][0], verts[0][1])
          for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.globalAlpha = 0.55
          ctx.strokeStyle = rawColor
          ctx.lineWidth = R * 0.40
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(target.p1[0], target.p1[1])
          ctx.lineTo(target.p2[0], target.p2[1])
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // Paint hover highlight (screen only — shows what clicking would paint)
    if (!isExport && terrainPaintModeRef.current) {
      const hoverTarget = paintHoverTargetRef.current
      if (hoverTarget) {
        const brush = terrainPaintBrushRef.current
        const rawColor = terrainColorsRef.current[brush] ?? TERRAIN_COLORS[brush] ?? '#888888'
        ctx.save()
        if (hoverTarget.type === 'hex') {
          ctx.globalAlpha = 0.40
          ctx.fillStyle = rawColor
          ctx.beginPath()
          const { verts } = hoverTarget
          ctx.moveTo(verts[0][0], verts[0][1])
          for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.globalAlpha = 0.70
          ctx.strokeStyle = rawColor
          ctx.lineWidth = R * 0.40
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(hoverTarget.p1[0], hoverTarget.p1[1])
          ctx.lineTo(hoverTarget.p2[0], hoverTarget.p2[1])
          ctx.stroke()
        }
        ctx.restore()
      }
    }


    ctx.restore() // clip

    // Hex grid mask — covers margin area (paper minus hex polygons) with background color
    if (clipToHexGridRef.current && projected.length > 0) {
      _drawHexGridMask(ctx, projected, edgeMode, inMargin, px, py, pw, ph, mapBgColorRef.current, excludedSet)
    }

    // Map border — stroke along the outer boundary of the hex grid
    if (mapBorderEnabledRef.current && projected.length > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(px, py, pw, ph)
      ctx.clip()
      _drawMapBoundary(ctx, projected, edgeMode, inMargin, mapBorderColorRef.current, mapBorderWidthRef.current, lineScale, excludedSet)
      ctx.restore()
    }

    if (!exportTarget) {
      // Margin indicator + diptych seam (screen only)
      _drawPaperMargin({
        ctx, px, py, pw, ph, mgPx, zoom,
        pageGrid: pageGridRef.current,
      })

      // Label-drag handles — drawn on top of everything while the tool is active
      if (activeToolRef.current.type === 'label-drag') {
        ctx.save()
        const cache = labelBBoxCacheRef.current
        for (const [id, bbox] of Object.entries(cache)) {
          const isHovered = id === hoveredLabelIdRef.current
          const isDragging = id === labelDragStateRef.current?.id
          ctx.save()
          ctx.translate(bbox.cx, bbox.cy)
          ctx.rotate(bbox.angle)
          ctx.strokeStyle = isDragging ? '#e06030' : isHovered ? '#4a90d9' : 'rgba(80,120,200,0.6)'
          ctx.lineWidth = (isDragging || isHovered ? 1.5 : 1) / zoom
          ctx.setLineDash(isDragging ? [] : [3 / zoom, 2 / zoom])
          ctx.strokeRect(-bbox.hw, -bbox.hh, bbox.hw * 2, bbox.hh * 2)
          ctx.setLineDash([])
          // Center crosshair dot
          ctx.fillStyle = isDragging ? '#e06030' : isHovered ? '#4a90d9' : 'rgba(80,120,200,0.7)'
          ctx.beginPath()
          ctx.arc(0, 0, 2.5 / zoom, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        ctx.restore()
      }
    }

    ctx.restore() // pan/zoom
    drawOsmHighlightRef.current?.()
  }, [])

  const drawOsmHighlightRef = useRef<(() => void) | null>(null)

  const drawOsmHighlight = useCallback(() => {
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
    const spotlight = osmSpotlightModeRef.current
    const cursor = spotlightCursorRef.current
    const railHighlight = osmRailHighlightRef.current
    const hoveredRiverIdx = hoveredOsmRiverIdxRef.current

    if (!spotlight && ht === null && !railHighlight && hoveredRiverIdx === null) return
    if (spotlight && !cursor) return

    const zoom = zoomRef.current
    const pan = panRef.current
    const { pw, ph, px, py } = computePaper(frameCssW, frameCssH, meta)
    const mmToPx = pw / meta.paper_mm[0]
    const mgPx = meta.margin_mm * mmToPx
    const marginL = px + mgPx, marginR = px + pw - mgPx
    const marginT = py + mgPx, marginB = py + ph - mgPx

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
      canal: ['rgba(40,200,180,0.2)', 'rgba(60,220,200,0.9)'],
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
    } else if (ht !== null || railHighlight || hoveredRiverIdx !== null) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(px, py, pw, ph)
      ctx.clip()
      if (ht !== null) drawWays([ht])
      if (railHighlight) drawRailRawWays()
      if (hoveredRiverIdx !== null) drawHoveredRiverWay(hoveredRiverIdx)
      ctx.restore()
    }

    ctx.restore()
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
    frameDimsRef.current = frameDims
    draw()
  }, [frameDims, draw])

  // Field canvas effect — detached. Restore this useEffect when reactivating field render.
  // See terrainBlobs.ts (buildFieldCanvas) and drawTerrain.ts for the implementation.
  // useEffect(() => { ... }, [generatedHexes, terrainRenderMode, fieldFreq, fieldAmp,
  //   fieldOctaves, fieldPersistence, fieldWildness, terrainColors, terrainTextureScales,
  //   forestTextureVersion, frameDims, draw])

  // Mark terrain layer dirty when terrain-affecting data changes
  useEffect(() => { terrainDirtyRef.current = true }, [defaultTerrainBlobs, defaultLakeBlobs, defaultElevationBlobs, terrainColors, terrainTextureScales, terrainTextureBlendModes, terrainTextureOpacities, terrainTextureTintColors, terrainTextureTintOpacities, terrainTextureFile, terrainTextureEnabled, terrainBlobOverrides, terrainTypeBlobStyles, lakeOverrides, terrainRenderMode, hexEdgeMode, generatedHexes, realisticCoastline, coastlineDebugRaw, smoothedCoastlineBoundary, rawCoastlineBoundary, beachStrip, beachColor, beachWidth, hillsColor, mountainsColor, reliefShadingOpacity, coastlineDPEpsilon, coastlineChaikinPasses, edgeBlobPainted, edgeBlobOverrides, edgeBlobWidth, mapStyle, historicalIconParams, blobPatches, elevationTypeBlobStyles, terrainBlobFeather])
  useEffect(() => { terrainDirtyRef.current = true; draw() }, [hillshadeDisabledTerrains, hillshadeDisabledElevClasses, contourDisabledTerrains, contourDisabledElevClasses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Decode heightmap PNG → ImageData when URL changes, then recompute derived canvases
  useEffect(() => {
    if (!heightmapUrl) {
      heightmapImgDataRef.current = null
      hillshadeCanvasRef.current = null
      contourCanvasRef.current = null
      terrainDirtyRef.current = true
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
        })
        if (contoursEnabledRef.current) {
          const { pw, ph } = computePaper(frameDimsRef.current.w, frameDimsRef.current.h, metaRef.current!)
          contourCanvasRef.current = computeContours(heightmapImgDataRef.current, meta, {
            interval: contourIntervalRef.current,
            baseElevation: contourBaseElevationRef.current,
            indexEvery: 5,
            smoothPasses: contourSmoothPassesRef.current,
            color: '#6b5a3a',
            width: contourLineWidthRef.current,
            indexWidth: contourLineWidthRef.current * 2,
            opacity: 0.7,
          }, pw, ph)
        }
      }
      terrainDirtyRef.current = true
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
    })
    terrainDirtyRef.current = true
    draw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity])

  // Recompute contours when params change
  useEffect(() => {
    const imgData = heightmapImgDataRef.current
    const meta = heightmapMetaRef.current
    if (!imgData || !meta || !metaRef.current) return
    if (!contoursEnabled) {
      contourCanvasRef.current = null
    } else {
      const { pw, ph } = computePaper(frameDimsRef.current.w, frameDimsRef.current.h, metaRef.current)
      contourCanvasRef.current = computeContours(imgData, meta, {
        interval: contourInterval,
        baseElevation: contourBaseElevation,
        indexEvery: 5,
        smoothPasses: contourSmoothPasses,
        color: '#6b5a3a',
        width: contourLineWidth,
        indexWidth: contourLineWidth * 2,
        opacity: 0.7,
      }, pw, ph)
    }
    terrainDirtyRef.current = true
    draw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contoursEnabled, contourInterval, contourBaseElevation, contourSmoothPasses, contourLineWidth])

  // Mark other layer caches dirty when their relevant data changes
  useEffect(() => { hexBorderDirtyRef.current = true }, [hexBorderMode, hexEdgeMode, hexBorderOpacity, hexBorderColor, hexBorderDifference, generatedHexes, excludedHexKeys, disabledHexKeys, autoDisabledOceanHexKeys])
  useEffect(() => { riversDirtyRef.current = true }, [riverEdges, canalEdges, riverWidthScale, canalWidthScale, riverCurveSteps, riverWobble, riverDetail, riverWiggleFreq, riverWiggleAmp, riverSmoothing, riverPathSmoothing, showRiverLabels, riverLabelColor, riverSegmentProps, canalSegmentProps, riverSelectMode, canalSelectMode, selectedSegmentKeys, selectedCanalSegmentKeys, riverStyle, canalStyle, riverHopProps, selectedHopKey, labelOffsets])
  useEffect(() => { buildingsDirtyRef.current = true }, [urbanHexes, urbanStyle, settlements, settlementTierStyles, roadBaseData])
  useEffect(() => { bridgesDirtyRef.current = true }, [bridgesEnabled, smoothedRoadData, smoothedRoadDataV2, smoothedRailData, riverEdges, canalEdges, generatedHexes])
  useEffect(() => { roadsDirtyRef.current = true }, [smoothedRoadData, smoothedRailData, roadTierStyles, railStyle, roadSegmentProps, roadHopProps, selectedRoadSegmentKeys, selectedRoadHopKey, roadSelectMode, railControlOverrides, railWiggleAmp, railWiggleFreq, railSmoothing, railSegmentProps, railHopProps, selectedRailSegmentKeys, selectedRailHopKey, railSelectMode, showRawOsmRoads, mapStyle])
  useEffect(() => { settlementsDirtyRef.current = true }, [settlements, settlementTierStyles, labelPresetId, labelOverrides, smoothedRoadData, smoothedRailData, labelOffsets])
  // When entering label-drag mode, rebuild label layers so the bbox cache is populated for hit-testing
  useEffect(() => {
    if (activeTool.type === 'label-drag') {
      riversDirtyRef.current = true
      settlementsDirtyRef.current = true
    }
  }, [activeTool.type])

  // Redraw when data changes
  useEffect(() => { draw() }, [generatedHexes, hexBorderMode, hexEdgeMode, hexBorderOpacity, hexBorderColor, hexBorderDifference, hexNumbersEnabled, hexNumberEdge, hexNumberColor, hexNumberFontScale, hexNumberStartCorner, hexNumberMap, smoothedRoadData, smoothedRailData, showRawOsmRoads, roadNodeEditMode, riverNodeEditMode, riverChainOverrides, riverEdges, canalEdges, riverEditMode, canalEditMode, riverWidthScale, canalWidthScale, riverCurveSteps, riverWobble, riverDetail, riverWiggleFreq, riverWiggleAmp, riverSmoothing, riverPathSmoothing, showRiverLabels, riverLabelColor, riverSegmentProps, canalSegmentProps, riverSelectMode, canalSelectMode, selectedSegmentKeys, selectedCanalSegmentKeys, riverStyle, canalStyle, riverHopProps, selectedHopKey, defaultTerrainBlobs, defaultLakeBlobs, terrainColors, terrainTextureScales, terrainTextureBlendModes, terrainTextureOpacities, terrainTextureTintColors, terrainTextureTintOpacities, terrainTextureFile, terrainTextureEnabled, terrainBlobOverrides, terrainTypeBlobStyles, lakeOverrides, terrainRenderMode, settlements, settlementTierStyles, urbanHexes, urbanStyle, roadTierStyles, railStyle, highlights, highlightedHexes, highlightLines, highlightEdgePaths, iconOverlays, placedIcons, labelOverlays, placedLabels, realisticCoastline, coastlineDebugRaw, smoothedCoastlineBoundary, rawCoastlineBoundary, beachStrip, beachColor, beachWidth, coastlineDPEpsilon, coastlineChaikinPasses, edgeBlobPainted, edgeBlobOverrides, edgeBlobWidth, roadSegmentProps, roadHopProps, selectedRoadSegmentKeys, selectedRoadHopKey, roadSelectMode, railNodeEditMode, railControlOverrides, railSelectMode, railWiggleAmp, railWiggleFreq, railSmoothing, railSegmentProps, railHopProps, selectedRailSegmentKeys, selectedRailHopKey, mapBgColor, mapBorderEnabled, mapBorderColor, mapBorderWidth, clipToHexGrid, excludedHexKeys, disabledHexKeys, autoDisabledOceanHexKeys, megaHexEnabled, megaHexRadius, megaHexColor, megaHexOpacity, megaHexLineWidth, megaHexOriginQ, megaHexOriginR, areasMode, areas, areaHexes, areasStyle, bridgesEnabled, bridgeStyle, bridgeTiers, bridgeOverrides, showElevationDebug, mapStyle, labelOffsets, activeTool, draw])

  useEffect(() => { drawOsmHighlight() }, [osmHighlightTier, osmSpotlightMode, osmSpotlightTiers, osmRailHighlight, hoveredOsmRiverIdx, drawOsmHighlight])

  // Blob draw freehand stroke overlay
  useEffect(() => {
    const overlayCanvas = osmOverlayCanvasRef.current
    if (!overlayCanvas) return
    const ctx = overlayCanvas.getContext('2d')
    if (!ctx) return

    if (!blobDrawState || blobDrawState.points.length === 0) {
      drawOsmHighlightRef.current?.()
      return
    }

    drawOsmHighlightRef.current?.()

    const meta = metaRef.current
    const { w: cssW, h: cssH } = frameDimsRef.current
    if (!meta || cssW === 0) return
    const dpr = window.devicePixelRatio || 1
    const zoom = zoomRef.current, pan = panRef.current

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.translate(cssW / 2 + pan.x, cssH / 2 + pan.y)
    ctx.scale(zoom, zoom)
    ctx.translate(-cssW / 2, -cssH / 2)

    const pts = blobDrawState.points
    const isCut = (activeToolRef.current as ActiveTool).type === 'blob-draw' &&
      (activeToolRef.current as { type: 'blob-draw'; mode: string }).mode === 'cut'
    const strokeColor = isCut ? 'rgba(220,50,50,0.9)' : 'rgba(40,160,80,0.9)'
    const fillColor   = isCut ? 'rgba(220,50,50,0.13)' : 'rgba(40,160,80,0.11)'

    if (blobDrawState.drawing) {
      // While dragging: draw raw open stroke
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([])
      ctx.stroke()
    } else {
      // After release: show smoothed filled polygon
      if (pts.length >= 3) {
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
        ctx.closePath()
        ctx.fillStyle = fillColor
        ctx.fill()
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = 1.5 / zoom
        ctx.setLineDash([4 / zoom, 3 / zoom])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    ctx.restore()
  }, [blobDrawState, drawOsmHighlight])

  useEffect(() => {
    if (!mapImageDataUrl) { mapImageElementRef.current = null; draw(); return }
    const img = new Image()
    img.onload = () => { mapImageElementRef.current = img; draw() }
    img.src = mapImageDataUrl
  }, [mapImageDataUrl, draw])

  useEffect(() => { draw() }, [mapImageTransform, mapImageOpacity, draw])
  useEffect(() => { if (dataSource === 'map_image') draw() }, [mapOverlay, dataSource, draw])

  // Load all terrain textures into a shared cache
  useEffect(() => {
    for (const { id } of TEXTURE_OPTIONS) {
      const img = new Image()
      img.src = TEXTURE_PATHS[id] ?? `/textures/${id}.png`
      img.onload = () => { textureCacheRef.current.set(id, img); terrainDirtyRef.current = true; draw() }
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
            terrainDirtyRef.current = true
            draw()
          }
        }
        img.onerror = () => {
          remaining--
          if (remaining === 0 && loaded.length > 0) {
            historicalIconSetsRef.current = { ...historicalIconSetsRef.current, [terrain]: loaded }
            terrainDirtyRef.current = true
            draw()
          }
        }
      }
    }
  }, [draw])

  // Invalidate highlights offscreen layer whenever highlight data changes
  useEffect(() => { joinedHighlightsDirtyRef.current = true }, [highlights, highlightedHexes, highlightLines, highlightEdgePaths])
  useEffect(() => { areasDirtyRef.current = true }, [areas, areaHexes, areasStyle, areasMode, riverEdges, canalEdges])

  // ResizeObserver — canvas fills the full container
  const meta = generatedMetadata
  useEffect(() => {
    const el = containerRef.current
    if (!el || !meta) return
    const compute = () => {
      setFrameDims({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [meta])

  // Set zoom so 1 CSS pixel = 1/96 inch → physical hex size matches screen
  const zoomToPhysical = useCallback(() => {
    const meta = generatedMetadata
    if (!meta) return
    const { w: cssW, h: cssH } = frameDimsRef.current
    const { pw } = computePaper(cssW, cssH, meta)
    const targetZoom = Math.max(0.2, Math.min(6, meta.paper_mm[0] * 96 / (pw * 25.4)))
    zoomRef.current = targetZoom
    panRef.current = { x: 0, y: 0 }
    terrainDirtyRef.current = true
    hexBorderDirtyRef.current = true
    joinedHighlightsDirtyRef.current = true
    riversDirtyRef.current = true
    buildingsDirtyRef.current = true
    roadsDirtyRef.current = true
    settlementsDirtyRef.current = true
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
      // Rebuild all offscreen layers at settled zoom for crisp quality
      if (terrainZoomSettleRef.current !== null) clearTimeout(terrainZoomSettleRef.current)
      terrainZoomSettleRef.current = setTimeout(() => {
        terrainZoomSettleRef.current = null
        terrainDirtyRef.current = true
        hexBorderDirtyRef.current = true
        joinedHighlightsDirtyRef.current = true
        riversDirtyRef.current = true
        buildingsDirtyRef.current = true
        roadsDirtyRef.current = true
        settlementsDirtyRef.current = true
        draw()
      }, 150)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (terrainZoomSettleRef.current !== null) clearTimeout(terrainZoomSettleRef.current)
    }
  }, [draw, snapOverlay])

  // Drag pan (left-click drag or middle-mouse — left is suppressed in paint mode)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1 && e.button !== 0) return
      if (e.button === 0 && (e.target as HTMLElement).tagName !== 'CANVAS') return
      if (e.button === 0 && (terrainPaintModeRef.current || elevationPaintModeRef.current || roadPaintModeRef.current || railPaintModeRef.current || riverEditModeRef.current || lakePaintModeRef.current || activeToolRef.current.type === 'hex-mask' || activeToolRef.current.type === 'mega-hex-origin' || activeToolRef.current.type === 'align-image')) return
      if (e.button === 0 && activePanelRef.current === 'highlights' && (highlightPaintModeRef.current || highlightLineEraserRef.current)) return
      if (e.button === 0 && activePanelRef.current === 'areas' && (activeToolRef.current.type === 'areas-draw' || activeToolRef.current.type === 'areas-erase')) return
      if (e.button === 0 && activeToolRef.current.type === 'blob-draw') return
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (shouldSuppressShortcut(e)) return
      setActiveToolRef.current({ type: 'none' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sparseHandles = (chain: [number, number][], step = 5): [number, number][] => {
    const out: [number, number][] = []
    for (let i = 0; i < chain.length; i += step) out.push(chain[i])
    if (out[out.length - 1] !== chain[chain.length - 1]) out.push(chain[chain.length - 1])
    return out
  }

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

  const computeHoverTarget = useCallback((clientX: number, clientY: number): PaintHoverTarget => {
    const meta = metaRef.current
    if (!meta) return null
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return null
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
    const scalePxPerM = pw / (meta.scale_m_per_mm * meta.paper_mm[0])
    const R = meta.outer_radius_m * scalePxPerM
    const mgPx = meta.margin_mm * (pw / meta.paper_mm[0])
    const inMarginCheck = (verts: [number, number][]) =>
      verts.every(([x, y]) => x >= px + mgPx && x <= px + pw - mgPx && y >= py + mgPx && y <= py + ph - mgPx)

    const HEX_DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
    const SNAP = 2
    const vk2 = (p: [number, number]) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`

    const hexMap = new Map<string, GeneratedHex>()
    for (const hex of hexesRef.current) hexMap.set(`${hex.q},${hex.r}`, hex)

    if (terrainEdgePaintEnabledRef.current) {
      const threshold = R * 0.35
      let bestDist = threshold
      let bestEdge: { p1: [number, number]; p2: [number, number]; edgeKey: string } | null = null

      for (const hex of hexesRef.current) {
        if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py) as [number, number])
        const cx = verts.reduce((s, v) => s + v[0], 0) / 6
        const cy = verts.reduce((s, v) => s + v[1], 0) / 6
        if (Math.hypot(lx - cx, ly - cy) > R * 2) continue

        for (const [dq, dr] of HEX_DIRS) {
          const nq = hex.q + dq, nr = hex.r + dr
          const neighbor = hexMap.get(`${nq},${nr}`)
          if (!neighbor) continue
          const nverts = neighbor.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py) as [number, number])
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

      if (bestEdge) {
        return { type: 'edge', p1: bestEdge.p1, p2: bestEdge.p2, edgeKey: bestEdge.edgeKey }
      }
    }

    for (const hex of hexesRef.current) {
      if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py) as [number, number])
      if (!hex.partial && !inMarginCheck(verts)) continue
      if (pointInPolygon(lx, ly, verts)) {
        return { type: 'hex', q: hex.q, r: hex.r, verts }
      }
    }

    return null
  }, [clientToLogical])

  // Clear hover when paint mode is deactivated
  useEffect(() => {
    if (!terrainPaintMode && !elevationPaintMode && paintHoverTargetRef.current !== null) {
      paintHoverTargetRef.current = null
      draw()
    }
  }, [terrainPaintMode, elevationPaintMode, draw])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const hoverKey = (t: PaintHoverTarget) => {
      if (!t) return null
      if (t.type === 'hex') return `hex:${t.q},${t.r}`
      return `edge:${t.edgeKey}`
    }

    const executePaint = (target: PaintHoverTarget) => {
      if (!target) return
      if (strokeTypeRef.current !== null && target.type !== strokeTypeRef.current) return
      if (target.type === 'hex') {
        const key = `${target.q},${target.r}`
        if (key !== lastPaintedKeyRef.current) {
          lastPaintedKeyRef.current = key
          strokeTrailRef.current.set(`hex:${key}`, target)
          if (elevationPaintModeRef.current) {
            overrideHexElevationRef.current(target.q, target.r, elevationPaintBrushRef.current)
          } else if (terrainBackgroundPaintEnabledRef.current) {
            const brush = terrainPaintBrushRef.current
            overrideHexBackgroundRef.current(target.q, target.r, brush === 'clear' ? undefined : brush)
          } else {
            overrideHexTerrainRef.current(target.q, target.r, terrainPaintBrushRef.current)
          }
        }
      } else {
        if (target.edgeKey !== lastPaintedEdgeKeyRef.current) {
          lastPaintedEdgeKeyRef.current = target.edgeKey
          strokeTrailRef.current.set(`edge:${target.edgeKey}`, target)
          const brush = terrainPaintBrushRef.current
          // 'clear' paints a paper-colored ribbon to visually trim terrain blob edges.
          // Painting clear over an already-clear edge erases it (toggle).
          if (brush === 'clear' && edgeBlobPaintedRef.current[target.edgeKey] === 'clear') {
            eraseEdgeBlobRef.current(target.edgeKey)
          } else {
            paintEdgeBlobRef.current(target.edgeKey, brush)
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
      if (changed) draw()
    }

    const onUp = () => {
      if (isPaintingRef.current && (terrainPaintModeRef.current || elevationPaintModeRef.current)) setIsTerrainPainting(false)
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

    el.addEventListener('mousedown', onDown)
    el.addEventListener('mouseleave', onLeave)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      el.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [computeHoverTarget, draw])

  // Hex disable paint — mark/unmark any hex as impassable by click-drag
  const hexDisablePaintAtClient = useCallback((clientX: number, clientY: number, mode: 'disable' | 'enable', lastKey: { v: string | null }) => {
    const meta = metaRef.current
    if (!meta) return
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
    for (const hex of hexesRef.current) {
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (pointInPolygon(lx, ly, verts)) {
        const key = `${hex.q},${hex.r}`
        if (key !== lastKey.v) {
          lastKey.v = key
          toggleDisabledHexRef.current(key, mode)
        }
        break
      }
    }
  }, [clientToLogical])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let active = false
    let mode: 'disable' | 'enable' = 'disable'
    const lastKey = { v: null as string | null }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      const tool = activeToolRef.current
      if (tool.type !== 'hex-disable') return
      active = true
      mode = tool.mode
      lastKey.v = null
      hexDisablePaintAtClient(e.clientX, e.clientY, mode, lastKey)
    }
    const onMove = (e: MouseEvent) => {
      if (!active) return
      hexDisablePaintAtClient(e.clientX, e.clientY, mode, lastKey)
    }
    const onUp = () => { active = false }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [hexDisablePaintAtClient])

  // Hex mask paint — exclude/include hexes by click-drag
  const hexMaskPaintAtClient = useCallback((clientX: number, clientY: number, mode: 'exclude' | 'include', lastKey: { v: string | null }) => {
    const meta = metaRef.current
    if (!meta) return
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
    for (const hex of hexesRef.current) {
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (pointInPolygon(lx, ly, verts)) {
        const key = `${hex.q},${hex.r}`
        if (key !== lastKey.v) {
          lastKey.v = key
          toggleExcludedHexRef.current(key, mode)
        }
        break
      }
    }
  }, [clientToLogical])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let active = false
    let mode: 'exclude' | 'include' = 'exclude'
    const lastKey = { v: null as string | null }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      const tool = activeToolRef.current
      if (tool.type !== 'hex-mask') return
      active = true
      mode = tool.mode
      lastKey.v = null
      hexMaskPaintAtClient(e.clientX, e.clientY, mode, lastKey)
    }
    const onMove = (e: MouseEvent) => {
      if (!active) return
      hexMaskPaintAtClient(e.clientX, e.clientY, mode, lastKey)
    }
    const onUp = () => { active = false }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [hexMaskPaintAtClient])

  // Recompute auto-disabled ocean hexes when coastline setting or hexes change
  useEffect(() => {
    if (autoDisabledOceanHexKeysRef.current.length === 0) return
    const hexes = hexesRef.current
    if (!hexes || hexes.length === 0) return
    const NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
    const hexByKey = new Map(hexes.map(h => [`${h.q},${h.r}`, h]))
    const keys: string[] = []
    for (const h of hexes) {
      if (h.terrain !== 'sea') continue
      const touchesLand = NEIGHBORS.some(([dq, dr]) => {
        const nb = hexByKey.get(`${h.q + dq},${h.r + dr}`)
        return nb && nb.terrain !== 'sea'
      })
      if (!touchesLand) keys.push(`${h.q},${h.r}`)
    }
    setAutoDisabledOceanHexKeysRef.current(keys)
  }, [realisticCoastline, generatedHexes])

  // Mega hex origin drag — click or drag to place the lattice origin on a hex
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let active = false
    const setAtClient = (clientX: number, clientY: number) => {
      const meta = metaRef.current
      if (!meta) return
      const logical = clientToLogicalRef.current(clientX, clientY)
      if (!logical) return
      const { lx, ly, cssW, cssH } = logical
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
      for (const hex of hexesRef.current) {
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
        if (pointInPolygon(lx, ly, verts)) {
          setMegaHexOriginRef.current(hex.q, hex.r)
          break
        }
      }
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      if (activeToolRef.current.type !== 'mega-hex-origin') return
      active = true
      setAtClient(e.clientX, e.clientY)
    }
    const onMove = (e: MouseEvent) => {
      if (!active) return
      setAtClient(e.clientX, e.clientY)
    }
    const onUp = () => { active = false }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Road/rail paint — edge between consecutive hexes visited in a stroke
  const prevEdgeHexRef = useRef<{ q: number; r: number } | null>(null)

  const roadRailPaintAtClient = useCallback((clientX: number, clientY: number) => {
    const meta = metaRef.current
    if (!meta) return
    const logical = clientToLogical(clientX, clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
    const mgPx = meta.margin_mm * (pw / meta.paper_mm[0])
    const marginL = px + mgPx, marginR = px + pw - mgPx
    const marginT = py + mgPx, marginB = py + ph - mgPx
    const inMargin = (verts: [number, number][]) =>
      verts.every(([x, y]) => x >= marginL && x <= marginR && y >= marginT && y <= marginB)

    for (const hex of hexesRef.current) {
      if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
      const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
      if (!hex.partial && !inMargin(verts)) continue
      if (!pointInPolygon(lx, ly, verts)) continue

      const isRoad = roadPaintModeRef.current
      const isRail = railPaintModeRef.current

      if (isRoad) {
        const tier = roadPaintBrushRef.current
        const eraser = roadPaintEraserRef.current
        const prev = prevEdgeHexRef.current
        if (eraser) {
          if (prev && (prev.q !== hex.q || prev.r !== hex.r) && hexAdjacent(prev.q, prev.r, hex.q, hex.r)) {
            removeRoadEdgeAllTiersRef.current(prev.q, prev.r, hex.q, hex.r)
          }
        } else {
          if (prev && (prev.q !== hex.q || prev.r !== hex.r) && hexAdjacent(prev.q, prev.r, hex.q, hex.r)) {
            addRoadEdgeRef.current(prev.q, prev.r, hex.q, hex.r, tier)
          }
        }
      } else if (isRail) {
        const eraser = railPaintEraserRef.current
        const prev = prevEdgeHexRef.current
        if (prev && (prev.q !== hex.q || prev.r !== hex.r) && hexAdjacent(prev.q, prev.r, hex.q, hex.r)) {
          if (eraser) {
            removeRailEdgeRef.current(prev.q, prev.r, hex.q, hex.r)
          } else {
            addRailEdgeRef.current(prev.q, prev.r, hex.q, hex.r)
          }
        }
      }

      prevEdgeHexRef.current = { q: hex.q, r: hex.r }
      break
    }
  }, [clientToLogical])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      if (!roadPaintModeRef.current && !railPaintModeRef.current) return
      isPaintingRef.current = true
      setIsRoadPainting(true)
      prevEdgeHexRef.current = null
      roadRailPaintAtClient(e.clientX, e.clientY)
    }
    const onMove = (e: MouseEvent) => {
      if (!isPaintingRef.current) return
      if (!roadPaintModeRef.current && !railPaintModeRef.current) return
      roadRailPaintAtClient(e.clientX, e.clientY)
    }
    const onUp = () => { isPaintingRef.current = false; setIsRoadPainting(false) }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [roadRailPaintAtClient])

  // Control point drag
  const draggingCpKeyRef = useRef<string | null>(null)
  const draggingCpGroupKeysRef = useRef<string[]>([])
  type SnapTarget = { kind: 'sibling'; key: string; pos: [number, number] } | { kind: 'road'; emKey: string; pos: [number, number] }
  const snapPreviewRef = useRef<SnapTarget | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      if (!roadNodeEditModeRef.current && !riverNodeEditModeRef.current && !railNodeEditModeRef.current) return
      const meta = metaRef.current
      const { w: cssW, h: cssH } = frameDimsRef.current
      if (!meta || cssW === 0) return
      const logical = clientToLogical(e.clientX, e.clientY)
      if (!logical) return
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
      const { controlPoints } = smoothedRoadDataRef.current

      const dissolvedHexesHit = new Set<string>()
      for (const key of Object.keys(roadControlOverridesRef.current)) {
        if (key.startsWith('jt|')) dissolvedHexesHit.add(key.split('|')[1])
      }

      const currentZoom = zoomRef.current ?? 1

      // Road CP hit test — road only
      if (roadNodeEditModeRef.current) {
        // Build jt| groups for hit testing (same grouping as draw)
        const jtDotsHit = controlPoints.filter(cp => cp.key.startsWith('jt|') && dissolvedHexesHit.has(cp.key.split('|')[1]))
        const jtGroupsHit: { keys: string[]; pos: [number, number] }[] = []
        for (const cp of jtDotsHit) {
          const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
          let merged = false
          for (const g of jtGroupsHit) {
            const [gx, gy] = projectToCanvas(g.pos[0], g.pos[1], meta, pw, ph, px, py)
            if (Math.hypot(cx - gx, cy - gy) < 2) { g.keys.push(cp.key); merged = true; break }
          }
          if (!merged) jtGroupsHit.push({ keys: [cp.key], pos: cp.pos })
        }
        const hitR = 10 / currentZoom
        for (const g of jtGroupsHit) {
          const [cx, cy] = projectToCanvas(g.pos[0], g.pos[1], meta, pw, ph, px, py)
          if (Math.hypot(logical.lx - cx, logical.ly - cy) <= hitR) {
            draggingCpKeyRef.current = g.keys[0]
            draggingCpGroupKeysRef.current = g.keys
            draggingCpKindRef.current = 'road'
            e.stopPropagation()
            return
          }
        }
        const junctions = controlPoints.filter(cp => cp.key.startsWith('ja|') && !dissolvedHexesHit.has(cp.key.slice(3)))
        const edges = controlPoints.filter(cp => cp.key.startsWith('em|'))
        for (const [cps, hitRScreen] of [[junctions, 10], [edges, 8]] as const) {
          const r = (hitRScreen as number) / currentZoom
          for (const cp of cps) {
            const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
            if (Math.hypot(logical.lx - cx, logical.ly - cy) <= r) {
              draggingCpKeyRef.current = cp.key
              draggingCpGroupKeysRef.current = [cp.key]
              draggingCpKindRef.current = 'road'
              e.stopPropagation()
              return
            }
          }
        }
      }

      // Rail CP hit test
      if (railNodeEditModeRef.current) {
        const { controlPoints: railCPs } = railBaseDataRef.current
        const hitR = 10 / currentZoom
        for (const cp of railCPs) {
          const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
          if (Math.hypot(logical.lx - cx, logical.ly - cy) <= hitR) {
            draggingCpKeyRef.current = cp.key
            draggingCpGroupKeysRef.current = [cp.key]
            draggingCpKindRef.current = 'rail'
            e.stopPropagation()
            return
          }
        }
      }

      // River chain handle grab
      const handleHitR = 8 / currentZoom
      if (riverNodeEditModeRef.current) {
        for (const c of riverChainsV2Ref.current) {
          const existingHandles = riverChainOverridesRef.current[c.segKey]
          const handles = existingHandles ?? sparseHandles(c.baseChain)
          for (let i = 1; i < handles.length - 1; i++) {
            const [cx, cy] = projectToCanvas(handles[i][0], handles[i][1], meta, pw, ph, px, py)
            if (Math.hypot(logical.lx - cx, logical.ly - cy) <= handleHitR) {
              draggingDensePtRef.current = { id: c.segKey, handles: [...handles], handleIdx: i, kind: 'river' }
              dragLiveDensePosRef.current = handles[i]
              hoveredChainRef.current = null
              hoveredHandleIdxRef.current = null
              e.stopPropagation()
              return
            }
          }
        }
      }
    }

    const SNAP_SIBLING_PX = 14
    const SNAP_ROAD_PX = 16

    const checkSnap = (dragKey: string, livePos: [number, number], meta: ReturnType<typeof metaRef.current>, pw: number, ph: number, px: number, py: number): SnapTarget | null => {
      if (!dragKey.startsWith('jt|') || !meta) return null
      const parts = dragKey.split('|')
      if (parts.length !== 3) return null
      const hexKey = parts[1]
      const zoom = zoomRef.current ?? 1
      const [dpx, dpy] = projectToCanvas(livePos[0], livePos[1], meta, pw, ph, px, py)

      // Sibling jt| snap (same junction, different arm)
      const siblings = smoothedRoadDataRef.current.controlPoints.filter(
        cp => cp.key.startsWith('jt|') && cp.key.split('|')[1] === hexKey && cp.key !== dragKey
      )
      const sibThresh = SNAP_SIBLING_PX / zoom
      for (const sib of siblings) {
        const [sx, sy] = projectToCanvas(sib.pos[0], sib.pos[1], meta, pw, ph, px, py)
        if (Math.hypot(dpx - sx, dpy - sy) <= sibThresh)
          return { kind: 'sibling', key: sib.key, pos: sib.pos }
      }

      // Road snap — nearest em| control point. These are stable hex-edge midpoints that
      // don't shift with wiggle/smoothing, so the connection is permanent.
      const roadThresh = SNAP_ROAD_PX / zoom
      let bestDist = roadThresh, bestEmKey: string | null = null, bestEmPos: [number, number] | null = null
      for (const cp of smoothedRoadDataRef.current.controlPoints) {
        if (!cp.key.startsWith('em|')) continue
        const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
        const dist = Math.hypot(dpx - cx, dpy - cy)
        if (dist < bestDist) { bestDist = dist; bestEmKey = cp.key; bestEmPos = cp.pos }
      }
      if (bestEmKey && bestEmPos) return { kind: 'road', emKey: bestEmKey, pos: bestEmPos }

      return null
    }

    const scheduleRedraw = () => {
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => { dragRafRef.current = null; draw() })
      }
    }

    const distToSegment2D = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) return Math.hypot(px - ax, py - ay)
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    }

    const onMove = (e: MouseEvent) => {
      const meta = metaRef.current
      const { w: cssW, h: cssH } = frameDimsRef.current
      if (!meta || cssW === 0) return
      const logical = clientToLogical(e.clientX, e.clientY)
      if (!logical) return
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)

      // CP drag — move all keys in the group together
      if (draggingCpKeyRef.current) {
        const lonLat = unprojectFromCanvas(logical.lx, logical.ly, meta, pw, ph, px, py)
        const groupOverrides: Record<string, [number, number]> = {}
        for (const k of draggingCpGroupKeysRef.current) groupOverrides[k] = lonLat
        dragLiveOverrideRef.current = { ...dragLiveOverrideRef.current, ...groupOverrides }
        snapPreviewRef.current = checkSnap(draggingCpKeyRef.current, lonLat, meta, pw, ph, px, py)
        scheduleRedraw()
        return
      }

      // Dense point drag
      if (draggingDensePtRef.current) {
        dragLiveDensePosRef.current = unprojectFromCanvas(logical.lx, logical.ly, meta, pw, ph, px, py)
        scheduleRedraw()
        return
      }

      // Hover detection: find nearest chain, then nearest dot
      const currentZoom = zoomRef.current ?? 1
      const chainHoverR = 12 / currentZoom
      const dotHoverR = 8 / currentZoom

      let bestChainDist = chainHoverR
      let bestChain: { id: string; baseChain: [number, number][]; kind: 'road' | 'river' | 'rail' } | null = null

      if (roadNodeEditModeRef.current) {
        const { chains } = smoothedRoadDataRef.current
        for (const c of chains) {
          if (c.id.startsWith('stub|')) continue
          for (let i = 0; i < c.chain.length - 1; i++) {
            const [ax, ay] = projectToCanvas(c.chain[i][0], c.chain[i][1], meta, pw, ph, px, py)
            const [bx, by] = projectToCanvas(c.chain[i + 1][0], c.chain[i + 1][1], meta, pw, ph, px, py)
            const d = distToSegment2D(logical.lx, logical.ly, ax, ay, bx, by)
            if (d < bestChainDist) { bestChainDist = d; bestChain = { id: c.id, baseChain: c.baseChain, kind: 'road' } }
          }
        }
      }

      if (riverNodeEditModeRef.current) {
        for (const c of riverChainsV2Ref.current) {
          for (let i = 0; i < c.chain.length - 1; i++) {
            const [ax, ay] = projectToCanvas(c.chain[i][0], c.chain[i][1], meta, pw, ph, px, py)
            const [bx, by] = projectToCanvas(c.chain[i + 1][0], c.chain[i + 1][1], meta, pw, ph, px, py)
            const d = distToSegment2D(logical.lx, logical.ly, ax, ay, bx, by)
            if (d < bestChainDist) { bestChainDist = d; bestChain = { id: c.segKey, baseChain: c.baseChain, kind: 'river' } }
          }
        }
      }

      if (railNodeEditModeRef.current) {
        for (const c of smoothedRailDataRef.current.chains) {
          for (let i = 0; i < c.chain.length - 1; i++) {
            const [ax, ay] = projectToCanvas(c.chain[i][0], c.chain[i][1], meta, pw, ph, px, py)
            const [bx, by] = projectToCanvas(c.chain[i + 1][0], c.chain[i + 1][1], meta, pw, ph, px, py)
            const d = distToSegment2D(logical.lx, logical.ly, ax, ay, bx, by)
            if (d < bestChainDist) { bestChainDist = d; bestChain = { id: c.id, baseChain: c.baseChain, kind: 'rail' } }
          }
        }
      }

      if (!roadNodeEditModeRef.current && !riverNodeEditModeRef.current && !railNodeEditModeRef.current) return

      let bestHandles: [number, number][] | null = null
      let bestHandleIdx: number | null = null
      if (bestChain) {
        const existing = bestChain.kind === 'road'
          ? roadChainOverridesRef.current[bestChain.id]
          : bestChain.kind === 'rail'
            ? railChainOverridesRef.current[bestChain.id]
            : riverChainOverridesRef.current[bestChain.id]
        bestHandles = existing ?? sparseHandles(bestChain.baseChain)
        let bestDotDist = dotHoverR
        for (let i = 1; i < bestHandles.length - 1; i++) {
          const [cx, cy] = projectToCanvas(bestHandles[i][0], bestHandles[i][1], meta, pw, ph, px, py)
          const d = Math.hypot(logical.lx - cx, logical.ly - cy)
          if (d < bestDotDist) { bestDotDist = d; bestHandleIdx = i }
        }
      }

      const prevId = hoveredChainRef.current?.id
      const prevIdx = hoveredHandleIdxRef.current
      hoveredChainRef.current = bestChain ? { id: bestChain.id, handles: bestHandles!, kind: bestChain.kind } : null
      hoveredHandleIdxRef.current = bestHandleIdx
      if (prevId !== bestChain?.id || prevIdx !== bestHandleIdx) scheduleRedraw()
    }

    const onUp = (e: MouseEvent) => {
      // Dense handle drag commit
      const denseDrag = draggingDensePtRef.current
      const denseFinalPos = dragLiveDensePosRef.current
      if (denseDrag && denseFinalPos) {
        const newHandles = denseDrag.handles.map((p, i) => i === denseDrag.handleIdx ? denseFinalPos : p) as [number, number][]
        if (denseDrag.kind === 'river') {
          setRiverChainOverrideRef.current(denseDrag.id, newHandles)
          riversDirtyRef.current = true
        } else {
          setRoadChainOverrideRef.current(denseDrag.id, newHandles)
          roadsDirtyRef.current = true
        }
      }
      draggingDensePtRef.current = null
      dragLiveDensePosRef.current = null

      // CP drag commit
      const dragKey = draggingCpKeyRef.current
      const groupKeys = draggingCpGroupKeysRef.current
      const snap = snapPreviewRef.current
      const finalPos = dragKey ? dragLiveOverrideRef.current[dragKey] : null
      draggingCpKeyRef.current = null
      draggingCpGroupKeysRef.current = []
      snapPreviewRef.current = null
      if (dragRafRef.current !== null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null }
      dragLiveOverrideRef.current = {}
      if (dragKey && snap && draggingCpKindRef.current !== 'rail') {
        const snapPos = snap.pos
        for (const k of groupKeys) {
          setRoadControlOverrideRef.current(k, snapPos)
          if (snap.kind === 'road') setRoadSnapBindingRef.current(k, snap.emKey)
          else deleteRoadSnapBindingRef.current(k)
        }
        if (snap.kind === 'sibling') {
          setRoadControlOverrideRef.current(snap.key, snapPos)
          deleteRoadSnapBindingRef.current(snap.key)
        }
      } else if (dragKey && finalPos) {
        if (draggingCpKindRef.current === 'rail') {
          for (const k of groupKeys) {
            setRailControlOverrideRef.current(k, finalPos)
          }
        } else {
          for (const k of groupKeys) {
            setRoadControlOverrideRef.current(k, finalPos)
            deleteRoadSnapBindingRef.current(k)
          }
        }
      }
      draggingCpKindRef.current = null
    }

    const onLeave = () => {
      if (hoveredChainRef.current || hoveredHandleIdxRef.current !== null) {
        hoveredChainRef.current = null
        hoveredHandleIdxRef.current = null
        scheduleRedraw()
      }
    }

    el.addEventListener('mousedown', onDown, { capture: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousedown', onDown, { capture: true })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      el.removeEventListener('mouseleave', onLeave)
      hoveredChainRef.current = null
      hoveredHandleIdxRef.current = null
    }
  }, [draw, clientToLogical])

  // Lake paint mode — click/drag to mark or unmark hexes as lakes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let painting = false
    let addMode: boolean | null = null
    let lastPainted: string | null = null

    const hexAtClient = (clientX: number, clientY: number) => {
      const meta = metaRef.current
      if (!meta) return null
      const logical = clientToLogical(clientX, clientY)
      if (!logical) return null
      const { lx, ly, cssW, cssH } = logical
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
      for (const hex of hexesRef.current) {
        if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
        if (pointInPolygon(lx, ly, verts)) return hex
      }
      return null
    }

    const onDown = (e: MouseEvent) => {
      if (!lakePaintModeRef.current) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      e.stopPropagation()
      const hex = hexAtClient(e.clientX, e.clientY)
      if (!hex) return
      painting = true
      addMode = !hex.isLake
      lastPainted = `${hex.q},${hex.r}`
      overrideHexLakeRef.current(hex.q, hex.r, addMode)
    }

    const onMove = (e: MouseEvent) => {
      if (!painting || addMode === null) return
      const hex = hexAtClient(e.clientX, e.clientY)
      if (!hex) return
      const key = `${hex.q},${hex.r}`
      if (key === lastPainted) return
      lastPainted = key
      if (addMode && !hex.isLake) overrideHexLakeRef.current(hex.q, hex.r, true)
      if (!addMode && hex.isLake) overrideHexLakeRef.current(hex.q, hex.r, false)
    }

    const onUp = () => { painting = false; addMode = null; lastPainted = null }

    el.addEventListener('mousedown', onDown, { capture: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown, { capture: true })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draw, clientToLogical])

  // Highlight line drag-paint — road-like: segment only created on first hex-to-hex move,
  // single clicks store nothing; backtrack-to-erase within current stroke; no global uniqueness.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let painting = false
    let prevHex: { q: number; r: number } | null = null  // hex under cursor at mousedown
    let segmentStarted = false                            // true once first move created the segment
    let lastPainted: string | null = null

    const hexAtClient = (clientX: number, clientY: number) => {
      const meta = metaRef.current
      if (!meta) return null
      const logical = clientToLogical(clientX, clientY)
      if (!logical) return null
      const { lx, ly, cssW, cssH } = logical
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
      for (const hex of hexesRef.current) {
        if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
        if (pointInPolygon(lx, ly, verts)) return hex
      }
      return null
    }

    const appendOrPop = (hex: { q: number; r: number }, hlId: string) => {
      const key = `${hex.q},${hex.r}`
      if (key === lastPainted) return
      lastPainted = key

      if (!segmentStarted) {
        // First move away from the mousedown hex — create segment now
        startNewLineSegmentRef.current(hlId)
        if (prevHex) appendHexToLineRef.current(hlId, prevHex.q, prevHex.r)
        appendHexToLineRef.current(hlId, hex.q, hex.r)
        segmentStarted = true
        return
      }

      // Segment in progress: close loop if returning to first hex, backtrack if revisiting any other hex, else append
      const segs = highlightLinesRef.current[hlId] ?? []
      const lastSeg = segs.length > 0 ? segs[segs.length - 1] : []
      const idx = lastSeg.lastIndexOf(key)
      if (idx !== -1) {
        if (idx === 0 && lastSeg.length >= 3) {
          // Close the loop: append first hex to complete the circuit, then finish this segment
          appendHexToLineRef.current(hlId, hex.q, hex.r)
          segmentStarted = false
          prevHex = hex
        } else {
          // Segments with < 2 hexes are deleted entirely (auto-cleanup on full backtrack)
          truncateHighlightLineRef.current(hlId, idx < 2 ? 0 : idx)
          if (idx < 2) { segmentStarted = false; prevHex = hex }
        }
      } else {
        appendHexToLineRef.current(hlId, hex.q, hex.r)
      }
    }

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const hlId = activeHighlightIdRef.current
      if (!hlId) return
      const hl = highlightsRef.current.find(h => h.id === hlId)
      if (hl?.mode !== 'line') return
      if (activePanelRef.current !== 'highlights') return
      const isEraser = highlightLineEraserRef.current
      if (!isEraser && !highlightPaintModeRef.current) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      e.stopPropagation()
      painting = true
      segmentStarted = false
      prevHex = hexAtClient(e.clientX, e.clientY)
      lastPainted = prevHex ? `${prevHex.q},${prevHex.r}` : null
      if (!isEraser && prevHex) {
        const segs = highlightLinesRef.current[hlId] ?? []
        const lastSeg = segs.length > 0 ? segs[segs.length - 1] : []
        if (lastSeg.length > 0 && lastSeg[lastSeg.length - 1] === lastPainted) {
          segmentStarted = true  // continue existing segment tail
        }
      }
      if (isEraser && prevHex) eraseHexFromLineRef.current(hlId, prevHex.q, prevHex.r)
    }

    const onMove = (e: MouseEvent) => {
      if (!painting) return
      const hlId = activeHighlightIdRef.current
      if (!hlId) return
      const hex = hexAtClient(e.clientX, e.clientY)
      if (!hex) return
      if (highlightLineEraserRef.current) {
        const key = `${hex.q},${hex.r}`
        if (key === lastPainted) return
        lastPainted = key
        eraseHexFromLineRef.current(hlId, hex.q, hex.r)
      } else {
        appendOrPop(hex, hlId)
      }
    }

    const onUp = () => { painting = false; prevHex = null; segmentStarted = false; lastPainted = null }

    el.addEventListener('mousedown', onDown, { capture: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown, { capture: true })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [clientToLogical])

  // Area draw/erase drag — click empty hex to create new area, drag from existing to expand it
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let painting = false
    let dragAreaId: string | null = null
    let eraseMode = false
    let lastPainted: string | null = null

    const AREA_COLORS = ['#5a3a1a', '#1a3a5a', '#1a5a3a', '#5a1a3a', '#3a5a1a', '#3a1a5a', '#5a4a3a', '#1a5a5a']
    const TERRAIN_NAMES: Record<string, string> = {
      woods: 'Woods', light_woods: 'Forest', rough: 'Hills', marsh: 'Marsh', sea: 'Sea', clear: 'Fields',
    }

    const hexAtClient = (clientX: number, clientY: number) => {
      const meta = metaRef.current
      if (!meta) return null
      const logical = clientToLogical(clientX, clientY)
      if (!logical) return null
      const { lx, ly, cssW, cssH } = logical
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
      for (const hex of hexesRef.current) {
        if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py))
        if (pointInPolygon(lx, ly, verts)) return hex
      }
      return null
    }

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      if (activePanelRef.current !== 'areas') return
      const tool = activeToolRef.current
      if (tool.type !== 'areas-draw' && tool.type !== 'areas-erase') return
      e.stopPropagation()
      const hex = hexAtClient(e.clientX, e.clientY)
      if (!hex) return
      painting = true
      eraseMode = tool.type === 'areas-erase'
      const key = `${hex.q},${hex.r}`
      lastPainted = key
      if (eraseMode) {
        eraseHexAreaRef.current(hex.q, hex.r)
      } else {
        const existingId = areaHexesRef.current[key]
        if (existingId) {
          dragAreaId = existingId
          setActiveAreaIdRef.current(existingId)
        } else {
          const idx = areasRef.current.length
          const color = AREA_COLORS[idx % AREA_COLORS.length]
          const name = TERRAIN_NAMES[hex.terrain] ?? `Area ${idx + 1}`
          const newId = addAreaRef.current(name, color)
          paintHexAreaRef.current(hex.q, hex.r, newId)
          dragAreaId = newId
          setActiveAreaIdRef.current(newId)
        }
      }
    }

    const onMove = (e: MouseEvent) => {
      if (!painting) return
      const hex = hexAtClient(e.clientX, e.clientY)
      if (!hex) return
      const key = `${hex.q},${hex.r}`
      if (key === lastPainted) return
      lastPainted = key
      if (eraseMode) {
        eraseHexAreaRef.current(hex.q, hex.r)
      } else if (dragAreaId) {
        paintHexAreaRef.current(hex.q, hex.r, dragAreaId)
      }
    }

    const onUp = () => { painting = false; dragAreaId = null; eraseMode = false; lastPainted = null }

    el.addEventListener('mousedown', onDown, { capture: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown, { capture: true })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [clientToLogical])

  // Blob draw tool — freehand drag to draw, auto-detect terrain, simplify + smooth on release
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const tool = activeToolRef.current
    if (tool.type !== 'blob-draw') return

    // Min distance between sampled points during drag (canvas-logical px)
    const SAMPLE_DIST = 4
    let rawPoints: [number, number][] = []
    let isDown = false
    let terrain = ''
    let lastSampled: [number, number] | null = null

    const detectTerrain = (lx: number, ly: number, meta: typeof metaRef.current, pw: number, ph: number, px: number, py: number): string => {
      const mgPx = meta!.margin_mm * (pw / meta!.paper_mm[0])
      const inMarginFn = (verts: [number, number][]) =>
        verts.every(([x, y]) => x >= px + mgPx && x <= px + pw - mgPx && y >= py + mgPx && y <= py + ph - mgPx)
      for (const hex of hexesRef.current) {
        if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
        const verts = hex.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta!, pw, ph, px, py))
        if (!hex.partial && !inMarginFn(verts)) continue
        if (pointInPolygon(lx, ly, verts) && hex.terrain !== 'sea' && hex.terrain !== 'clear') return hex.terrain
      }
      // Fallback: nearest non-sea/clear hex
      let bestD = Infinity, best = ''
      for (const hex of hexesRef.current) {
        if (hex.terrain === 'sea' || hex.terrain === 'clear') continue
        const cx = hex.vertices.reduce((s, v) => s + v[0], 0) / hex.vertices.length
        const cy = hex.vertices.reduce((s, v) => s + v[1], 0) / hex.vertices.length
        const [cx2, cy2] = projectToCanvas(cx, cy, meta!, pw, ph, px, py)
        const d = Math.hypot(lx - cx2, ly - cy2)
        if (d < bestD) { bestD = d; best = hex.terrain }
      }
      return best
    }

    const smoothAndCommit = (pts: [number, number][], terr: string) => {
      if (pts.length < 3) { setBlobDrawState(null); return }
      // Light denoise only — DP removes micro-jitter, 1 Chaikin pass rounds sharp corners
      const simplified = douglasPeucker(pts, 3)
      if (simplified.length < 3) { setBlobDrawState(null); return }
      const smoothed = chaikin(simplified, 1, true)
      setBlobDrawState({ points: smoothed, terrain: terr, drawing: false })
    }

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((activeToolRef.current as ActiveTool).type !== 'blob-draw') return
      e.stopPropagation()
      const meta = metaRef.current
      if (!meta) return
      const logical = clientToLogical(e.clientX, e.clientY)
      if (!logical) return
      const { lx, ly, cssW, cssH } = logical
      const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
      const cur = blobDrawStateRef.current

      // If there's a smoothed (non-drawing) preview, a click commits it
      if (cur && !cur.drawing) {
        const drawTool = activeToolRef.current as { type: 'blob-draw'; mode: 'add' | 'cut' }
        addBlobPatchRef.current({
          id: `bp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          terrain: cur.terrain,
          mode: drawTool.mode,
          points: cur.points,
        })
        setBlobDrawState(null)
        return
      }

      terrain = detectTerrain(lx, ly, meta, pw, ph, px, py)
      if (!terrain) return
      isDown = true
      rawPoints = [[lx, ly]]
      lastSampled = [lx, ly]
      setBlobDrawState({ points: [[lx, ly]], terrain, drawing: true })
    }

    const onMove = (e: MouseEvent) => {
      if (!isDown) return
      const logical = clientToLogical(e.clientX, e.clientY)
      if (!logical) return
      const { lx, ly } = logical
      const pt: [number, number] = [lx, ly]
      if (lastSampled && Math.hypot(lx - lastSampled[0], ly - lastSampled[1]) < SAMPLE_DIST) return
      rawPoints.push(pt)
      lastSampled = pt
      setBlobDrawState(prev => prev ? { ...prev, points: [...rawPoints] } : null)
    }

    const onUp = () => {
      if (!isDown) return
      isDown = false
      smoothAndCommit(rawPoints, terrain)
    }

    const onKey = (e: KeyboardEvent) => {
      if ((activeToolRef.current as ActiveTool).type !== 'blob-draw') return
      if (e.key === 'Escape') {
        e.preventDefault()
        isDown = false
        rawPoints = []
        setBlobDrawState(null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cur = blobDrawStateRef.current
        if (!cur) return
        if (cur.drawing) {
          isDown = false
          smoothAndCommit(rawPoints, terrain)
        } else {
          const drawTool = activeToolRef.current as { type: 'blob-draw'; mode: 'add' | 'cut' }
          addBlobPatchRef.current({
            id: `bp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            terrain: cur.terrain,
            mode: drawTool.mode,
            points: cur.points,
          })
          setBlobDrawState(null)
        }
      }
    }

    el.addEventListener('mousedown', onDown, { capture: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('mousedown', onDown, { capture: true })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      setBlobDrawState(null)
    }
  }, [activeTool, clientToLogical])

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null)
  const [blobFlyout, setBlobFlyout] = useState<{
    type: 'terrain' | 'lake' | 'edge'
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
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
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
    const onContextMenu = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      e.preventDefault()
      const hex = findHexAtClient(e.clientX, e.clientY)
      const items: CtxItem[] = []

      if (hex && activePanelRef.current === 'roads') {
        const hexKey = `${hex.q},${hex.r}`
        const overrides = roadControlOverridesRef.current
        const allKeys = Object.keys(overrides)
        const touchingKeys = allKeys.filter(k =>
          k === `ja|${hexKey}` ||
          (k.startsWith('jt|') && k.split('|')[1] === hexKey) ||
          (k.startsWith(`em|`) && (k.includes(`|${hexKey}|`) || k.endsWith(`|${hexKey}`)))
        )
        const isJunction = touchingKeys.some(k => k.startsWith('ja|'))
        const hasOverrides = touchingKeys.length > 0

        if (hasOverrides) {
          items.push({
            label: 'Revert to default',
            action: () => touchingKeys.forEach(k => deleteRoadControlOverrideRef.current(k)),
            danger: true,
          })
        }

        // Revert shape: available when the hovered chain has a manual shape override
        const hovChainId = hoveredChainRef.current?.id
        if (hovChainId && roadChainOverridesRef.current[hovChainId]) {
          items.push({
            label: 'Revert shape',
            action: () => { deleteRoadChainOverrideRef.current(hovChainId); roadsDirtyRef.current = true },
            danger: true,
          })
        }

        // Dissolve junction: create an individual jt| arm override for every road arm,
        // all starting at the current junction centre — then each can be dragged freely.
        const h = hexesRef.current.find(hx => hx.q === hex.q && hx.r === hex.r)
        const armNeighbors = [...new Set(
          roadEdgesRef.current
            .filter(e => (e.q1 === hex.q && e.r1 === hex.r) || (e.q2 === hex.q && e.r2 === hex.r))
            .map(e => e.q1 === hex.q && e.r1 === hex.r ? `${e.q2},${e.r2}` : `${e.q1},${e.r1}`)
        )]
        if (armNeighbors.length > 2) {
          const isAlreadyDissolved = armNeighbors.every(nk => !!roadControlOverridesRef.current[`jt|${hexKey}|${nk}`])
          if (!isAlreadyDissolved) {
            items.push({
              label: 'Dissolve junction',
              action: () => {
                const juncCenter: [number, number] =
                  roadControlOverridesRef.current[`ja|${hexKey}`] as [number, number] ??
                  h?.center as [number, number]
                if (!juncCenter) return
                for (const nk of armNeighbors) {
                  const [nq, nr] = nk.split(',').map(Number)
                  const nh = hexesRef.current.find(hx => hx.q === nq && hx.r === nr)
                  if (nh) {
                    const dx = nh.center[0] - juncCenter[0], dy = nh.center[1] - juncCenter[1]
                    setRoadControlOverrideRef.current(`jt|${hexKey}|${nk}`, [juncCenter[0] + dx * 0.2, juncCenter[1] + dy * 0.2])
                  } else {
                    setRoadControlOverrideRef.current(`jt|${hexKey}|${nk}`, juncCenter)
                  }
                }
              },
            })
          } else {
            // Junction is fully dissolved — offer to dissolve any connected groups
            const jtCpsForHex = (smoothedRoadDataRef.current.controlPoints ?? [])
              .filter(cp => cp.key.startsWith('jt|') && cp.key.split('|')[1] === hexKey)
            const meta = metaRef.current
            const { w: cssW2, h: cssH2 } = frameDimsRef.current
            if (meta && cssW2 > 0) {
              const { pw, ph, px, py } = computePaper(cssW2, cssH2, meta)
              const groups: { keys: string[]; pos: [number, number] }[] = []
              for (const cp of jtCpsForHex) {
                const [cx, cy] = projectToCanvas(cp.pos[0], cp.pos[1], meta, pw, ph, px, py)
                let merged = false
                for (const g of groups) {
                  const [gx, gy] = projectToCanvas(g.pos[0], g.pos[1], meta, pw, ph, px, py)
                  if (Math.hypot(cx - gx, cy - gy) < 2) { g.keys.push(cp.key); merged = true; break }
                }
                if (!merged) groups.push({ keys: [cp.key], pos: cp.pos })
              }
              const connectedGroups = groups.filter(g => g.keys.length >= 2)
              if (connectedGroups.length > 0) {
                items.push({
                  label: 'Dissolve group',
                  action: () => {
                    for (const g of connectedGroups) {
                      for (const key of g.keys) {
                        const nk = key.split('|')[2]
                        const [nq, nr] = nk.split(',').map(Number)
                        const nh = hexesRef.current.find(hx => hx.q === nq && hx.r === nr)
                        const dx = (nh?.center[0] ?? g.pos[0]) - g.pos[0]
                        const dy = (nh?.center[1] ?? g.pos[1]) - g.pos[1]
                        setRoadControlOverrideRef.current(key, [g.pos[0] + dx * 0.2, g.pos[1] + dy * 0.2])
                      }
                    }
                  },
                })
              }
            }
          }
        }


      }

      // Road segment/hop editing via right-click
      if (activePanelRef.current === 'roads' && !roadNodeEditModeRef.current) {
        const meta2 = metaRef.current
        const logical2 = meta2 ? clientToLogicalRef.current(e.clientX, e.clientY) : null
        if (meta2 && logical2) {
          const { lx: lx2, ly: ly2, cssW: cssW2, cssH: cssH2 } = logical2
          const { pw: pw2, ph: ph2, px: px2, py: py2 } = computePaper(cssW2, cssH2, meta2)
          const R2 = hexRadiusRef.current
          const roadChains = smoothedRoadDataRef.current.chains

          let bestChain: typeof roadChains[0] | null = null
          let bestDist = Infinity
          for (const chain of roadChains) {
            if (chain.id.startsWith('stub|')) continue
            const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2)) as [number, number][]
            for (let i = 0; i < pxPts.length - 1; i++) {
              const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
              const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
              const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
              const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
              if (dist < bestDist) { bestDist = dist; bestChain = chain }
            }
          }

          if (bestDist < R2 * 0.7 && bestChain) {
            const pxPts = bestChain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2)) as [number, number][]
            let bestHopKey: string | null = null, bestHopDist = Infinity
            if (bestChain.hopKeys && bestChain.hopRanges) {
              for (let h = 0; h < bestChain.hopKeys.length; h++) {
                const [hs, he] = bestChain.hopRanges[h]
                for (let i = hs; i < he; i++) {
                  const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
                  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
                  const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
                  const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
                  if (dist < bestHopDist) { bestHopDist = dist; bestHopKey = bestChain!.hopKeys![h] }
                }
              }
            }

            const cap = bestChain, capHop = bestHopKey
            if (items.length > 0) items.push({ label: '─', action: () => {} })
            items.push({
              label: 'Edit segment',
              action: () => {
                setActiveToolRef.current({ type: 'road-select' })
                setSelectedRoadSegmentKeysRef.current([cap.id])
                setSelectedRoadHopKeyRef.current(null)
              },
            })
            if (capHop) {
              items.push({
                label: 'Edit hop here',
                action: () => {
                  setActiveToolRef.current({ type: 'road-select' })
                  setSelectedRoadSegmentKeysRef.current([cap.id])
                  setSelectedRoadHopKeyRef.current(capHop)
                },
              })
            }
          }
        }
        if (roadSelectModeRef.current) {
          if (items.length > 0) items.push({ label: '─', action: () => {} })
          items.push({ label: 'Exit editing', action: () => setActiveToolRef.current({ type: 'none' }) })
        }
      }

      // Rail segment/hop editing via right-click
      if (activePanelRef.current === 'roads' && !railNodeEditModeRef.current) {
        const meta2 = metaRef.current
        const logical2 = meta2 ? clientToLogicalRef.current(e.clientX, e.clientY) : null
        if (meta2 && logical2) {
          const { lx: lx2, ly: ly2, cssW: cssW2, cssH: cssH2 } = logical2
          const { pw: pw2, ph: ph2, px: px2, py: py2 } = computePaper(cssW2, cssH2, meta2)
          const R2 = hexRadiusRef.current
          const railChains = smoothedRailDataRef.current.chains

          let bestRailChain: typeof railChains[0] | null = null
          let bestRailDist = Infinity
          for (const chain of railChains) {
            const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2)) as [number, number][]
            for (let i = 0; i < pxPts.length - 1; i++) {
              const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
              const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
              const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
              const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
              if (dist < bestRailDist) { bestRailDist = dist; bestRailChain = chain }
            }
          }

          if (bestRailDist < R2 * 0.7 && bestRailChain) {
            const pxPts = bestRailChain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2)) as [number, number][]
            let bestHopKey: string | null = null, bestHopDist = Infinity
            if (bestRailChain.hopKeys && bestRailChain.hopRanges) {
              for (let h = 0; h < bestRailChain.hopKeys.length; h++) {
                const [hs, he] = bestRailChain.hopRanges[h]
                for (let i = hs; i < he; i++) {
                  const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
                  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
                  const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
                  const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
                  if (dist < bestHopDist) { bestHopDist = dist; bestHopKey = bestRailChain!.hopKeys![h] }
                }
              }
            }

            const cap = bestRailChain, capHop = bestHopKey
            if (items.length > 0) items.push({ label: '─', action: () => {} })
            items.push({
              label: 'Edit rail segment',
              action: () => {
                setActiveToolRef.current({ type: 'rail-select' })
                setSelectedRailSegmentKeysRef.current([cap.id])
                setSelectedRailHopKeyRef.current(null)
              },
            })
            if (capHop) {
              items.push({
                label: 'Edit rail hop here',
                action: () => {
                  setActiveToolRef.current({ type: 'rail-select' })
                  setSelectedRailSegmentKeysRef.current([cap.id])
                  setSelectedRailHopKeyRef.current(capHop)
                },
              })
            }
          }
        }
      }

      // Rail node overrides revert in right-click
      if (hex && activePanelRef.current === 'roads' && railNodeEditModeRef.current) {
        const hexKey = `${hex.q},${hex.r}`
        const railOverrides = railControlOverridesRef.current
        const railTouchingKeys = Object.keys(railOverrides).filter(k =>
          k === `ja|${hexKey}` ||
          (k.startsWith('em|') && (k.includes(`|${hexKey}|`) || k.endsWith(`|${hexKey}`)))
        )
        if (railTouchingKeys.length > 0) {
          items.push({
            label: 'Revert rail to default',
            action: () => railTouchingKeys.forEach(k => deleteRailControlOverrideRef.current(k)),
            danger: true,
          })
        }
        const hovRailChainId = hoveredChainRef.current?.kind === 'rail' ? hoveredChainRef.current?.id : null
        if (hovRailChainId && railChainOverridesRef.current[hovRailChainId]) {
          items.push({
            label: 'Revert rail shape',
            action: () => { deleteRailChainOverrideRef.current(hovRailChainId); roadsDirtyRef.current = true },
            danger: true,
          })
        }
      }

      // River segment/hop editing — right-click near a river when in rivers panel
      if (activePanelRef.current === 'rivers' && riverChainsV2Ref.current.length > 0) {
        const meta2 = metaRef.current
        const logical2 = meta2 ? clientToLogicalRef.current(e.clientX, e.clientY) : null
        if (meta2 && logical2) {
          const { lx: lx2, ly: ly2, cssW: cssW2, cssH: cssH2 } = logical2
          const { pw: pw2, ph: ph2, px: px2, py: py2 } = computePaper(cssW2, cssH2, meta2)
          const R2 = hexRadiusRef.current

          let bestChain: typeof riverChainsV2Ref.current[0] | null = null
          let bestSegDist = Infinity
          for (const chain of riverChainsV2Ref.current) {
            const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2)) as [number, number][]
            for (let i = 0; i < pxPts.length - 1; i++) {
              const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
              const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
              const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
              const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
              if (dist < bestSegDist) { bestSegDist = dist; bestChain = chain }
            }
          }

          if (bestSegDist < R2 * 0.7 && bestChain) {
            const pxPts = bestChain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2)) as [number, number][]
            let bestHopKey: string | null = null, bestHopDist = Infinity
            for (let h = 0; h < bestChain.hopKeys.length; h++) {
              const [hs, he] = bestChain.hopRanges[h]
              for (let i = hs; i < he; i++) {
                const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
                const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
                const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
                const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
                if (dist < bestHopDist) { bestHopDist = dist; bestHopKey = bestChain.hopKeys[h] }
              }
            }

            const capturedChain = bestChain, capturedHopKey = bestHopKey
            if (items.length > 0) items.push({ label: '─', action: () => {} })
            items.push({
              label: 'Edit segment',
              action: () => {
                setActiveToolRef.current({ type: 'river-select' })
                setSelectedSegmentKeysRef.current([capturedChain.segKey])
                setSelectedHopKeyRef.current(null)
              },
            })
            if (capturedHopKey) {
              items.push({
                label: 'Edit hop here',
                action: () => {
                  setActiveToolRef.current({ type: 'river-select' })
                  setSelectedSegmentKeysRef.current([capturedChain.segKey])
                  setSelectedHopKeyRef.current(capturedHopKey)
                },
              })
            }
          }
        }
      }
      if (riverEditModeRef.current) {
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({
          label: 'Exit editing',
          action: () => setActiveToolRef.current({ type: 'none' }),
        })
      }

      // Blob/lake/river editing — available in any panel
      if (hex) {
        const hexKey = `${hex.q},${hex.r}`
        const storedHexForBlob = hexesRef.current.find(h => h.q === hex.q && h.r === hex.r)
        if (hex.isLake ?? false) {
          const canonicalKey = blobComponentsRef.current.get(hexKey)
          if (canonicalKey) {
            items.push({
              label: 'Edit lake…',
              action: () => setBlobFlyout({ type: 'lake', canonicalKey, x: e.clientX, y: e.clientY }),
            })
          }
        } else if (storedHexForBlob) {
          const editableLayers = hexTerrainLayers(storedHexForBlob).filter(t => t !== 'sea')
          for (const t of editableLayers) {
            const componentMap = blobComponentsByTerrainRef.current.get(t)
            const canonicalKey = componentMap?.get(hexKey)
            if (!canonicalKey) continue
            items.push({
              label: `Edit ${t.replace(/_/g, ' ')} blob…`,
              action: () => setBlobFlyout({ type: 'terrain', canonicalKey, terrain: t, x: e.clientX, y: e.clientY }),
            })
          }
        }
        // Edge blob chains near click point
        if (Object.keys(edgeBlobPaintedRef.current).length > 0) {
          const meta3 = metaRef.current
          const logical3 = meta3 ? clientToLogicalRef.current(e.clientX, e.clientY) : null
          if (meta3 && logical3) {
            const { lx: lx3, ly: ly3, cssW: cW3, cssH: cH3 } = logical3
            const { pw: pw3, ph: ph3, px: px3, py: py3 } = computePaper(cW3, cH3, meta3)
            const R3 = hexRadiusRef.current
            const threshold3 = R3 * 0.35
            const hexMap3 = new Map<string, GeneratedHex>()
            for (const h of hexesRef.current) hexMap3.set(`${h.q},${h.r}`, h)
            const HEX_DIRS3: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
            const SNAP3 = 2
            const vk3 = (p: [number, number]) => `${Math.round(p[0] / SNAP3)},${Math.round(p[1] / SNAP3)}`
            let nearestEdgeKey: string | null = null
            let nearestEdgeDist = threshold3
            for (const h of hexesRef.current) {
              const hv = h.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta3, pw3, ph3, px3, py3) as [number, number])
              const cx3 = hv.reduce((s, v) => s + v[0], 0) / 6
              const cy3 = hv.reduce((s, v) => s + v[1], 0) / 6
              if (Math.hypot(lx3 - cx3, ly3 - cy3) > R3 * 2) continue
              for (const [dq3, dr3] of HEX_DIRS3) {
                const nq3 = h.q + dq3, nr3 = h.r + dr3
                if (!hexMap3.has(`${nq3},${nr3}`)) continue
                const ek3 = edgeBlobCanonicalKey(h.q, h.r, nq3, nr3)
                if (!edgeBlobPaintedRef.current[ek3]) continue
                const nv = hexMap3.get(`${nq3},${nr3}`)!.vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta3, pw3, ph3, px3, py3) as [number, number])
                const nkeys3 = new Set(nv.map(vk3))
                const shared3 = hv.filter(v => nkeys3.has(vk3(v)))
                if (shared3.length < 2) continue
                const d3 = distToSeg([lx3, ly3], shared3[0], shared3[1])
                if (d3 < nearestEdgeDist) { nearestEdgeDist = d3; nearestEdgeKey = ek3 }
              }
            }
            if (nearestEdgeKey) {
              const ek = nearestEdgeKey
              const terrain3 = edgeBlobPaintedRef.current[ek]
              // Find chain key for this edge
              const chains3 = findEdgeChainsSync(edgeBlobPaintedRef.current, hexVertMapRef.current)
              const chain3 = chains3.find(c => c.edgeKeys.includes(ek))
              const chainKey3 = chain3?.chainKey ?? ek
              items.push({
                label: `Edit edge ${terrain3?.replace(/_/g, ' ') ?? 'blob'}…`,
                action: () => setBlobFlyout({ type: 'edge', canonicalKey: chainKey3, terrain: terrain3, x: e.clientX, y: e.clientY }),
              })
              items.push({
                label: 'Erase edge blob',
                action: () => eraseEdgeBlobRef.current(ek),
                danger: true,
              })
            }
          }
        }
        if (items.length > 0) items.push({ label: '─', action: () => {} })
      }

      if (hex && activePanelRef.current === 'terrain') {
        const storedHex = hexesRef.current.find(h => h.q === hex.q && h.r === hex.r)
        const isOverridden = !!(storedHex?.manual_override)
        if (isOverridden) {
          items.push({
            label: 'Revert to default',
            action: () => resetHexOverrideRef.current(hex.q, hex.r),
            danger: true,
          })
          items.push({ label: '─', action: () => {} })
        }
        for (const terrain of TERRAIN_PRIORITY) {
          const isCurrent = hex.terrain === terrain
          items.push({
            label: terrain.replace(/_/g, ' '),
            action: () => overrideHexTerrainRef.current(hex.q, hex.r, terrain),
            color: terrainColorsRef.current[terrain] ?? '#888',
            dim: isCurrent,
          } as CtxItem)
        }
      }

      // Bridge tier assignment — right-click near any detected bridge
      if (bridgesEnabledRef.current && detectedBridgesRef.current.length > 0) {
        const meta2 = metaRef.current
        const logical2 = meta2 ? clientToLogicalRef.current(e.clientX, e.clientY) : null
        if (meta2 && logical2) {
          const { lx: lx2, ly: ly2, cssW: cssW2, cssH: cssH2 } = logical2
          const { pw: pw2, ph: ph2, px: px2, py: py2 } = computePaper(cssW2, cssH2, meta2)
          const R2 = hexRadiusRef.current

          let nearestBridge: BridgePoint | null = null
          let nearestDist = Infinity
          for (const bridge of detectedBridgesRef.current) {
            const [bx, by] = projectToCanvas(bridge.pos[0], bridge.pos[1], meta2, pw2, ph2, px2, py2)
            const dist = Math.hypot(lx2 - bx, ly2 - by)
            if (dist < nearestDist) { nearestDist = dist; nearestBridge = bridge }
          }

          if (nearestBridge && nearestDist < R2 * 0.6) {
            const captured = nearestBridge
            const currentTierId = bridgeOverridesRef.current[captured.id]
            if (items.length > 0) items.push({ label: '─', action: () => {} })
            items.push({ label: 'Bridge tier', action: () => {}, dim: true })
            items.push({
              label: 'Default (no marker)',
              action: () => clearBridgeOverrideRef.current(captured.id),
              dim: !currentTierId,
            })
            for (const tier of bridgeTiersRef.current) {
              items.push({
                label: tier.label,
                color: tier.color,
                action: () => setBridgeOverrideRef.current(captured.id, tier.id),
                dim: tier.id === currentTierId,
              })
            }
          }
        }
      }

      // Terrain blob randomize
      if (activePanelRef.current === 'terrain') {
        const logical2 = clientToLogicalRef.current(e.clientX, e.clientY)
        if (logical2) {
          const { lx: lx2, ly: ly2 } = logical2
          const allBlobs = defaultTerrainBlobsRef.current
          let hitBlobKey: string | null = null
          outer: for (const entry of allBlobs) {
            for (let i = 0; i < entry.polys.length; i++) {
              if (pointInPolygon(lx2, ly2, entry.polys[i])) {
                hitBlobKey = entry.blobKeys[i] ?? null
                break outer
              }
            }
          }
          if (hitBlobKey) {
            const captured = hitBlobKey
            if (items.length > 0) items.push({ label: '─', action: () => {} })
            items.push({ label: 'Randomize blob', action: () => randomizeBlobSeedRef.current(captured) })
          }
        }
      }

      if (items.length > 0) setCtxMenu({ x: e.clientX, y: e.clientY, items })
    }
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [findHexAtClient])

  // Click → select hex
  const draggedRef = useRef(false)
  const edgeDragRef = useRef<{ mode: 'add' | 'remove'; painted: Set<string> } | null>(null)
  const isEdgePaintActive = useCallback((): 'highlight' | 'river' | 'canal' | false => {
    if (riverEditModeRef.current && !riverSelectModeRef.current) return 'river'
    if (canalEditModeRef.current && !canalSelectModeRef.current) return 'canal'
    if (activePanelRef.current !== 'highlights') return false
    if (!highlightPaintModeRef.current) return false
    const hlId = activeHighlightIdRef.current
    if (!hlId) return false
    const hl = highlightsRef.current.find(h => h.id === hlId)
    return hl?.mode === 'edge' ? 'highlight' : false
  }, [])

  // Shared edge paint logic used by both click and drag. forceMode keeps the
  // whole drag stroke consistently adding or removing rather than toggling.
  // Returns the effective action taken ('add'|'remove'), or null if no-op.
  const paintEdge = useCallback((
    hexQ: number, hexR: number, edgeI: number,
    forceMode?: 'add' | 'remove',
  ): 'add' | 'remove' | null => {
    const edgePaintMode = isEdgePaintActive()
    if (!edgePaintMode) return null
    const hex = hexesRef.current.find(h => h.q === hexQ && h.r === hexR)
    if (!hex) return null

    const geoV0 = hex.vertices[edgeI] as [number, number]
    const geoV1 = hex.vertices[(edgeI + 1) % 6] as [number, number]

    const VKEY_EPS = 0.00015
    const vk = (v: [number, number]) =>
      `${Math.round(v[0] / (VKEY_EPS * 0.5))},${Math.round(v[1] / (VKEY_EPS * 0.5))}`
    const vEq = (a: [number, number], b: [number, number]) => vk(a) === vk(b)

    if (edgePaintMode === 'river' || edgePaintMode === 'canal') {
      const EPS = 1e-5
      const neighbor = hexesRef.current.find(h => {
        if (h.q === hexQ && h.r === hexR) return false
        const verts = h.vertices as [number, number][]
        let hasV0 = false, hasV1 = false
        for (const v of verts) {
          if (Math.abs(v[0] - geoV0[0]) < EPS && Math.abs(v[1] - geoV0[1]) < EPS) hasV0 = true
          if (Math.abs(v[0] - geoV1[0]) < EPS && Math.abs(v[1] - geoV1[1]) < EPS) hasV1 = true
        }
        return hasV0 && hasV1
      })
      if (!neighbor) return null

      const ek = (q1: number, r1: number, q2: number, r2: number) => {
        const s1 = `${q1},${r1}`, s2 = `${q2},${r2}`
        return s1 < s2 ? `${s1}|${s2}` : `${s2}|${s1}`
      }
      const k = ek(hexQ, hexR, neighbor.q, neighbor.r)
      const edges = edgePaintMode === 'river' ? riverEdgesRef.current : canalEdgesRef.current
      const exists = edges.some(e => ek(e.q1, e.r1, e.q2, e.r2) === k)

      if (forceMode === 'add' && exists) return 'add'
      if (forceMode === 'remove' && !exists) return 'remove'

      if (edgePaintMode === 'river')
        toggleRiverEdgeRef.current(hexQ, hexR, neighbor.q, neighbor.r)
      else
        toggleCanalEdgeRef.current(hexQ, hexR, neighbor.q, neighbor.r)
      riversDirtyRef.current = true
      return exists ? 'remove' : 'add'
    } else {
      // Highlight edge paint
      const hlId = activeHighlightIdRef.current!
      const segments = highlightEdgePathsRef.current[hlId] ?? []
      const ck0 = vk(geoV0), ck1 = vk(geoV1)
      const edgeIdx = (seg: [number, number][]) => {
        for (let i = 0; i < seg.length - 1; i++) {
          if ((vk(seg[i]) === ck0 && vk(seg[i + 1]) === ck1) ||
              (vk(seg[i]) === ck1 && vk(seg[i + 1]) === ck0)) return i
        }
        return -1
      }
      const segIdx = segments.findIndex(s => edgeIdx(s) !== -1)
      const exists = segIdx !== -1

      if (forceMode === 'add' && exists) return 'add'
      if (forceMode === 'remove' && !exists) return 'remove'

      let nextSegments: [number, number][][]
      if (exists) {
        nextSegments = []
        for (let si = 0; si < segments.length; si++) {
          if (si !== segIdx) { nextSegments.push(segments[si]); continue }
          const seg = segments[si]
          const ei = edgeIdx(seg)
          const before = seg.slice(0, ei + 1) as [number, number][]
          const after = seg.slice(ei + 1) as [number, number][]
          if (before.length >= 2) nextSegments.push(before)
          if (after.length >= 2) nextSegments.push(after)
        }
      } else {
        const lastSeg = segments.length > 0 ? segments[segments.length - 1] : []
        let newLastSeg: [number, number][] | null = null
        let appendNew = false
        if (lastSeg.length === 0) {
          newLastSeg = [geoV0, geoV1]
        } else if (vEq(lastSeg[lastSeg.length - 1], geoV0)) {
          newLastSeg = [...lastSeg, geoV1]
        } else if (vEq(lastSeg[lastSeg.length - 1], geoV1)) {
          newLastSeg = [...lastSeg, geoV0]
        } else if (vEq(lastSeg[0], geoV0)) {
          newLastSeg = [geoV1, ...lastSeg]
        } else if (vEq(lastSeg[0], geoV1)) {
          newLastSeg = [geoV0, ...lastSeg]
        } else {
          appendNew = true
        }
        if (appendNew) {
          nextSegments = [...segments, [geoV0, geoV1]]
        } else if (newLastSeg!.length <= 1) {
          nextSegments = segments.slice(0, -1)
        } else {
          nextSegments = [...segments.slice(0, -1), newLastSeg!]
        }
      }
      setHighlightEdgePathRef.current(hlId, nextSegments)
      joinedHighlightsDirtyRef.current = true
      return exists ? 'remove' : 'add'
    }
  }, [isEdgePaintActive])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Label drag — live preview and hover highlight
    if (activeToolRef.current.type === 'label-drag') {
      const logical = clientToLogicalRef.current(e.clientX, e.clientY)
      if (logical) {
        const { lx, ly } = logical
        if (labelDragStateRef.current) {
          const { id, startLx, startLy, startDx, startDy } = labelDragStateRef.current
          liveLabelOffsetRef.current = { id, dx: startDx + (lx - startLx), dy: startDy + (ly - startLy) }
          draw()
        } else {
          // Hover detection
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
            draw()
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
    if (osmSpotlightModeRef.current) {
      const logical = clientToLogical(e.clientX, e.clientY)
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
    if (iconPlaceModeRef.current && activePanelRef.current === 'highlights') {
      const logical = clientToLogical(e.clientX, e.clientY)
      if (logical) {
        const { lx, ly, cssW, cssH } = logical
        const meta = metaRef.current
        if (meta) {
          const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
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
              if (d < bestDist) {
                bestDist = d
                best = unprojectFromCanvas(mx2, my2, meta, pw, ph, px, py) as [number, number]
              }
            }
          }
          iconSnapRef.current = best ?? unprojectFromCanvas(lx, ly, meta, pw, ph, px, py) as [number, number]
          draw()
        }
      }
      return
    }
    if (activeToolRef.current.type === 'label-place' && activePanelRef.current === 'highlights') {
      const logical = clientToLogical(e.clientX, e.clientY)
      if (logical) {
        const { lx, ly, cssW, cssH } = logical
        const meta = metaRef.current
        if (meta) {
          const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
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
              if (d < bestDist) {
                bestDist = d
                best = unprojectFromCanvas(mx2, my2, meta, pw, ph, px, py) as [number, number]
              }
            }
          }
          labelSnapRef.current = best ?? unprojectFromCanvas(lx, ly, meta, pw, ph, px, py) as [number, number]
          draw()
        }
      }
      return
    }
    if (!isEdgePaintActive()) {
      if (hoveredEdgeRef.current !== null) {
        hoveredEdgeRef.current = null
        draw()
      }
      return
    }
    const logical = clientToLogical(e.clientX, e.clientY)
    if (!logical) return
    const { lx: mx, ly: my } = logical

    // Find nearest edge midpoint among all projected hexes
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
        hoverRafRef.current = requestAnimationFrame(() => { hoverRafRef.current = null; draw() })
      }

      // Apply drag paint to each new edge entered during a drag stroke
      if (best && edgeDragRef.current) {
        const paintKey = `${best.hexQ},${best.hexR},${best.edgeI}`
        if (!edgeDragRef.current.painted.has(paintKey)) {
          edgeDragRef.current.painted.add(paintKey)
          paintEdge(best.hexQ, best.hexR, best.edgeI, edgeDragRef.current.mode)
        }
      }
    }
  }, [isEdgePaintActive, paintEdge, draw, clientToLogical])

  const onMouseLeave = useCallback(() => {
    if (osmSpotlightModeRef.current) {
      spotlightCursorRef.current = null
      drawOsmHighlightRef.current?.()
    }
    if (hoveredEdgeRef.current !== null) {
      hoveredEdgeRef.current = null
      draw()
    }
  }, [draw])

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editingLabelRef.current) return
    if (draggedRef.current) return
    const meta = metaRef.current
    if (!meta) return
    const logical = clientToLogical(e.clientX, e.clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
    const mmToPx = pw / meta.paper_mm[0]
    const mgPx = meta.margin_mm * mmToPx
    const marginL = px + mgPx, marginR = px + pw - mgPx
    const marginT = py + mgPx, marginB = py + ph - mgPx
    const inMargin = (verts: [number, number][]) =>
      verts.every(([x, y]) => x >= marginL && x <= marginR && y >= marginT && y <= marginB)
    // Generic segment select helper
    const pickSegment = (
      chains: { vertices: [number,number][]; segKey: string }[],
      shiftHeld: boolean,
      currentKeys: string[],
      setKeys: (k: string[]) => void,
      toggleKey: (k: string) => void,
    ) => {
      const R = hexRadiusRef.current
      let bestKey: string | null = null, bestDist = Infinity
      for (const { vertices, segKey } of chains) {
        const pxPts = vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number,number][]
        for (let i = 0; i < pxPts.length - 1; i++) {
          const [ax, ay] = pxPts[i], [bx, by] = pxPts[i+1]
          const dx = bx - ax, dy = by - ay, len2 = dx*dx + dy*dy
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx-ax)*dx + (ly-ay)*dy) / len2)) : 0
          const dist = Math.hypot(lx - (ax + t*dx), ly - (ay + t*dy))
          if (dist < bestDist) { bestDist = dist; bestKey = segKey }
        }
      }
      const threshold = R * 0.6
      if (bestDist < threshold && bestKey) {
        if (shiftHeld) {
          toggleKey(bestKey)
        } else if (currentKeys.length === 1 && currentKeys[0] === bestKey) {
          setKeys([])  // clicking the already-selected segment deselects it
        } else {
          setKeys([bestKey])
        }
      } else if (!shiftHeld) {
        setKeys([])
      }
    }
    // River select mode
    if (riverSelectModeRef.current && riverEditModeRef.current) {
      const shiftHeld = e.shiftKey
      const cmdHeld = e.metaKey || e.ctrlKey
      if (cmdHeld && RIVER_V2 && selectedSegmentKeysRef.current.length > 0) {
        // Cmd+click: find nearest hop within selected segment(s)
        const R = hexRadiusRef.current
        let bestHopKey: string | null = null, bestDist = Infinity
        for (const chain of riverChainsV2Ref.current) {
          if (!selectedSegmentKeysRef.current.includes(chain.segKey)) continue
          const pxPts = chain.chain.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number,number][]
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
        if (bestDist < R * 0.6 && bestHopKey) {
          setSelectedHopKeyRef.current(selectedHopKeyRef.current === bestHopKey ? null : bestHopKey)
        } else {
          setSelectedHopKeyRef.current(null)
        }
        draw(); return
      }
      // Check if click is near any river chain; if not and nothing is selected, exit mode
      const R2 = hexRadiusRef.current
      let nearestDist = Infinity
      for (const { vertices } of computedRiverChainsRef.current) {
        const pxPts = vertices.map(([lon, lat]) => projectToCanvas(lon, lat, meta, pw, ph, px, py)) as [number,number][]
        for (let i = 0; i < pxPts.length - 1; i++) {
          const [ax, ay] = pxPts[i], [bx, by] = pxPts[i+1]
          const dx = bx-ax, dy = by-ay, len2 = dx*dx+dy*dy
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx-ax)*dx+(ly-ay)*dy)/len2)) : 0
          nearestDist = Math.min(nearestDist, Math.hypot(lx-(ax+t*dx), ly-(ay+t*dy)))
        }
      }
      if (!shiftHeld && nearestDist >= R2 * 0.6) {
        setSelectedSegmentKeysRef.current([])
        setSelectedHopKeyRef.current(null)
        setActiveToolRef.current({ type: 'none' })
        draw(); return
      }
      pickSegment(computedRiverChainsRef.current, shiftHeld,
        selectedSegmentKeysRef.current,
        setSelectedSegmentKeysRef.current, toggleSegmentSelectionRef.current)
      setSelectedHopKeyRef.current(null)
      draw(); return
    }
    // Canal select mode
    if (canalSelectModeRef.current && canalEditModeRef.current) {
      const shiftHeld = e.shiftKey
      pickSegment(computedCanalChainsRef.current, shiftHeld,
        selectedCanalSegmentKeysRef.current,
        setSelectedCanalSegmentKeysRef.current, toggleCanalSegmentSelectionRef.current)
      draw(); return
    }

    // Road select mode
    if (roadSelectModeRef.current) {
      const shiftHeld = e.shiftKey
      const cmdHeld = e.metaKey || e.ctrlKey
      const R2 = hexRadiusRef.current
      const roadChains = smoothedRoadDataRef.current.chains

      if (cmdHeld && selectedRoadSegmentKeysRef.current.length > 0) {
        // Cmd+click: find nearest hop in selected road segments
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
        if (bestDist < R2 * 0.6 && bestHopKey) {
          setSelectedRoadHopKeyRef.current(selectedRoadHopKeyRef.current === bestHopKey ? null : bestHopKey)
        } else {
          setSelectedRoadHopKeyRef.current(null)
        }
        draw(); return
      }

      // Normal segment pick (find nearest chain)
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

      // If clicking empty space, exit select mode
      if (!shiftHeld && bestDist >= R2 * 0.6) {
        setSelectedRoadSegmentKeysRef.current([])
        setSelectedRoadHopKeyRef.current(null)
        setActiveToolRef.current({ type: 'none' })
        draw(); return
      }

      if (bestDist < R2 * 0.6 && bestId) {
        if (shiftHeld) {
          toggleRoadSegmentSelectionRef.current(bestId)
        } else if (selectedRoadSegmentKeysRef.current.length === 1 && selectedRoadSegmentKeysRef.current[0] === bestId) {
          setSelectedRoadSegmentKeysRef.current([])
        } else {
          setSelectedRoadSegmentKeysRef.current([bestId])
        }
        setSelectedRoadHopKeyRef.current(null)
      } else if (!shiftHeld) {
        setSelectedRoadSegmentKeysRef.current([])
        setSelectedRoadHopKeyRef.current(null)
      }
      draw(); return
    }

    // Edge-paint click: use the snapped hovered edge, not the hex under cursor
    if (isEdgePaintActive() && hoveredEdgeRef.current) {
      const { hexQ, hexR, edgeI } = hoveredEdgeRef.current
      paintEdge(hexQ, hexR, edgeI)
      return
    }

    // Icon placement / erase
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
              if (Math.hypot(lx - ix, ly - iy) < removeRadius) {
                removeIconAtRef.current(overlayId, i)
                return
              }
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
            if (Math.hypot(lx - ix, ly - iy) < removeRadius) {
              removeIconAtRef.current(overlayId, i)
              return
            }
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
            if (Math.hypot(lx - ix, ly - iy) < removeRadius) {
              removeIconAtRef.current(overlay.id, i)
              return
            }
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
              if (Math.hypot(lx - ix, ly - iy) < removeRadius) {
                removeLabelAtRef.current(overlayId, i)
                return
              }
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
            if (Math.hypot(lx - ix, ly - iy) < removeRadius) {
              removeLabelAtRef.current(overlayId, i)
              return
            }
          }
        }
        return
      }
    }

    for (const hex of hexesRef.current) {
      if (hexEdgeModeRef.current === 'whole' && hex.partial) continue
      const verts = hex.vertices.map(([lon, lat]) =>
        projectToCanvas(lon, lat, meta, pw, ph, px, py)
      )
      if (!hex.partial && !inMargin(verts)) continue
      if (pointInPolygon(lx, ly, verts)) {
        if (activePanelRef.current === 'highlights') {
          const tool = activeToolRef.current
          if (tool.type === 'highlight-paint') {
            const hlId = activeHighlightIdRef.current
            if (hlId) {
              const hl = highlightsRef.current.find(h => h.id === hlId)
              if (hl?.mode === 'area') {
                const key = `${hex.q},${hex.r}`
                if (highlightedHexesRef.current[key] === hlId) {
                  clearHexHighlightRef.current(hex.q, hex.r)
                } else {
                  setHexHighlightRef.current(hex.q, hex.r, hlId)
                }
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
                if (highlightedHexesRef.current[key] === hlId) {
                  clearHexHighlightRef.current(hex.q, hex.r)
                }
              }
            }
            return
          }
          if (tool.type === 'highlight-erase-any') {
            const key = `${hex.q},${hex.r}`
            if (highlightedHexesRef.current[key]) {
              clearHexHighlightRef.current(hex.q, hex.r)
            }
            return
          }
        }
        if (activePanelRef.current === 'settlements' && urbanPaintModeRef.current !== null) {
          toggleUrbanHexRef.current(hex.q, hex.r)
          return
        }
        if (activePanelRef.current === 'settlements') {
          const moveIdx = settlementMoveIndexRef.current
          if (moveIdx !== null) {
            updateSettlementRef.current(moveIdx, { hex_q: hex.q, hex_r: hex.r })
            setSettlementMoveIndexRef.current(null)
          } else {
            const tier = settlementPlaceTierRef.current
            if (!tier) return
            const existing = settlementsRef.current
            const existingIdx = existing.findIndex(s => s.hex_q === hex.q && s.hex_r === hex.r)
            if (existingIdx !== -1) {
              updateSettlementRef.current(existingIdx, { tier })
            } else {
              placeSettlementAtHexRef.current(hex.q, hex.r, hex.vertices as [number, number][], hex.center as [number, number], tier)
            }
          }
          return
        }
      }
    }
  }, [clientToLogical])

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const logical = clientToLogical(e.clientX, e.clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const meta = metaRef.current
    const canvas = canvasRef.current
    if (!meta || !canvas) return
    const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
    const rect = canvas.getBoundingClientRect()
    const zoom = zoomRef.current, pan = panRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    for (const overlay of labelOverlaysRef.current) {
      const labels = placedLabelsRef.current[overlay.id] ?? []
      for (let i = 0; i < labels.length; i++) {
        const { lon, lat, text } = labels[i]
        const [canvX, canvY] = projectToCanvas(lon, lat, meta, pw, ph, px, py)
        const { bx, by, bw, bh } = getLabelBoxBounds(ctx, canvX, canvY, text || overlay.name, overlay)
        if (lx >= bx && lx <= bx + bw && ly >= by && ly <= by + bh) {
          const screenX = rect.left + (canvX - cssW / 2) * zoom + cssW / 2 + pan.x
          const screenY = rect.top + (canvY - cssH / 2) * zoom + cssH / 2 + pan.y
          setEditingLabel({
            overlayId: overlay.id,
            index: i,
            text: text,
            screenX,
            screenY,
            width: Math.max(80, bw * zoom),
            height: bh * zoom,
            textSize: overlay.textSize,
          })
          draw()
          return
        }
      }
    }
  }, [clientToLogical, draw])

  const alignImageDragRef = useRef<{ startX: number; startY: number; startTX: number; startTY: number } | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    if (editingLabelRef.current) return
    draggedRef.current = false

    // Label-drag tool — start dragging the label under the cursor
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
              draw()
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mouseup', onUp)
            break
          }
        }
      }
      return
    }

    // Align-image drag — move historical map overlay
    if (activeToolRef.current.type === 'align-image') {
      const t = mapImageTransformRef.current
      alignImageDragRef.current = { startX: e.clientX, startY: e.clientY, startTX: t.translateX, startTY: t.translateY }
      const onUp = () => { alignImageDragRef.current = null; window.removeEventListener('mouseup', onUp) }
      window.addEventListener('mouseup', onUp)
      return
    }

    // Label drag — detect if mousedown is over a placed label in label-place mode
    if (activeToolRef.current.type === 'label-place' && activePanelRef.current === 'highlights') {
      const logical = clientToLogicalRef.current(e.clientX, e.clientY)
      if (logical) {
        const { lx, ly, cssW, cssH } = logical
        const meta = metaRef.current
        const canvas = canvasRef.current
        if (meta && canvas) {
          const { pw, ph, px, py } = computePaper(cssW, cssH, meta)
          const ctx = canvas.getContext('2d')
          if (ctx) {
            for (const overlay of labelOverlaysRef.current) {
              const labels = placedLabelsRef.current[overlay.id] ?? []
              for (let i = 0; i < labels.length; i++) {
                const { lon, lat, text } = labels[i]
                const [cx, cy] = projectToCanvas(lon, lat, meta, pw, ph, px, py)
                const { bx, by, bw, bh } = getLabelBoxBounds(ctx, cx, cy, text || overlay.name, overlay)
                if (lx >= bx && lx <= bx + bw && ly >= by && ly <= by + bh) {
                  draggingLabelRef.current = { overlayId: overlay.id, index: i }
                  draggedRef.current = true  // suppress click placement
                  const onUp = () => {
                    const snap = labelSnapRef.current
                    const dl = draggingLabelRef.current
                    if (dl && snap) {
                      moveLabelToRef.current(dl.overlayId, dl.index, snap[0], snap[1])
                    }
                    draggingLabelRef.current = null
                    draw()
                    window.removeEventListener('mouseup', onUp)
                  }
                  window.addEventListener('mouseup', onUp)
                  return
                }
              }
            }
          }
        }
      }
    }

    // Start an edge drag stroke if we're in edge-paint mode with a hovered edge
    if (isEdgePaintActive() && hoveredEdgeRef.current) {
      const { hexQ, hexR, edgeI } = hoveredEdgeRef.current
      const paintKey = `${hexQ},${hexR},${edgeI}`
      const firstAction = paintEdge(hexQ, hexR, edgeI)
      if (firstAction) {
        edgeDragRef.current = { mode: firstAction, painted: new Set([paintKey]) }
        draggedRef.current = true  // suppress the subsequent onClick
      }
      const onUp = () => {
        edgeDragRef.current = null
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mouseup', onUp)
      return
    }

    const startX = e.clientX, startY = e.clientY
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) {
        draggedRef.current = true
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [isEdgePaintActive, paintEdge])

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

      const results: { blob: Blob; paperMm: [number, number] }[] = []
      let pending = colWidths.length * rowHeights.length

      let yOffMm = 0
      for (let row = 0; row < rowHeights.length; row++) {
        const cellHMm = rowHeights[row]
        let xOffMm = 0
        for (let col = 0; col < colWidths.length; col++) {
          const cellWMm = colWidths[col]
          const cellIdx = row * colWidths.length + col

          // Pixel bounds for this cell within the full render
          const srcX = Math.round(xOffMm * PX_PER_MM)
          const srcY = Math.round(yOffMm * PX_PER_MM)
          const srcW = Math.round(cellWMm * PX_PER_MM)
          const srcH = Math.round(cellHMm * PX_PER_MM)

          const sheet = document.createElement('canvas')
          sheet.width = srcW
          sheet.height = srcH
          const sCtx = sheet.getContext('2d')!
          sCtx.drawImage(full, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

          sheet.toBlob(blob => {
            if (blob) results[cellIdx] = { blob, paperMm: [cellWMm, cellHMm] }
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
      return computePaper(w, h, meta)
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

  const menuItemStyle: CSSProperties = {
    padding: '5px 14px', cursor: 'pointer', color: '#a0a0c0', whiteSpace: 'nowrap',
  }

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', background: '#1a1a2a', position: 'relative' }}
      onClick={() => setCtxMenu(null)}
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
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(ctxMenu.x, window.innerWidth - 190),
            top: Math.min(ctxMenu.y, window.innerHeight - 60),
            maxHeight: `${window.innerHeight - Math.min(ctxMenu.y, window.innerHeight - 60) - 10}px`,
            overflowY: 'auto',
            background: '#0e0f18', border: '1px solid #2a2a4a',
            borderRadius: 4, padding: '3px 0', zIndex: 200,
            fontFamily: 'ui-monospace, monospace', fontSize: 12,
            minWidth: 170, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            userSelect: 'none',
          }}
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.items.map((item, i) => item.label === '─' ? (
            <div key={i} style={{ borderTop: '1px solid #1e1f2e', margin: '3px 0' }} />
          ) : (
            <div
              key={i}
              onClick={() => { if (!item.dim) { item.action(); setCtxMenu(null) } }}
              style={{
                ...menuItemStyle,
                color: item.danger ? '#9e5a5a' : item.dim ? '#3a3a5a' : '#a0a0c0',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: item.dim ? 'default' : 'pointer',
              }}
              onMouseEnter={e => { if (!item.dim) e.currentTarget.style.background = '#1a1a2e' }}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.color && (
                <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: item.color }} />
              )}
              <span style={{ textTransform: 'capitalize' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
