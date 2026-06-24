import type {
  MapStore, GeneratedHex, GridMetadata, GenerateProgress, BlobOverride,
  ActiveTool, CustomTerrain, TerrainRules, ClassRule, StrokeEffect, BlobMaskEdit,
} from '../mapStore'
import {
  DEFAULT_TERRAIN_RULES,
  DEFAULT_TERRAIN_BLOB, DEFAULT_EDGE_BLOB, DEFAULT_LAKE_BLOB,
  DEFAULT_STROKE_EFFECT,
  pageGridTotalMm, mapResolutionMpx,
} from '../mapStore'
import { type BlobPresetId, BLOB_PRESETS } from '../blobPresets'
import { classifyHex, classifyHexLayers } from '../../lib/terrainClassify'

export type TerrainSlice = {
  generatedHexes: GeneratedHex[]
  generatedMetadata: GridMetadata | null
  generateStatus: 'idle' | 'loading' | 'error' | 'done'
  generateError: string | null
  terrainRules: TerrainRules
  disabledTerrains: Set<string>
  generateProgress: GenerateProgress | null
  terrainLayersEnabled: boolean
  // Terrain blob style
  terrainBlobSmooth: number
  terrainBlobOffset: number
  terrainBlobBump: number
  terrainBlobSweepFreq: number
  terrainBlobLobeFreq: number
  terrainBlobLobeAmp: number
  terrainBlobLobeThreshold: number
  terrainBlobLobeDirection: number
  terrainBlobTopoStyle: number
  terrainBlobClusterSize: number
  terrainBlobSplatDensity: number
  terrainBlobSplatSize: number
  terrainBlobOutlineEnabled: boolean
  terrainBlobOutlineColor: string
  terrainBlobOutlineWidth: number
  terrainBlobEffect: StrokeEffect
  realisticCoastline: boolean
  coastlineDebugRaw: boolean
  beachStrip: boolean
  beachColor: string
  beachWidth: number
  hillsColor: string
  mountainsColor: string
  reliefShadingOpacity: number
  coastlineDPEpsilon: number
  coastlineChaikinPasses: number
  terrainColors: Record<string, string>
  terrainTextureScales: Record<string, number>
  terrainTextureBlendModes: Record<string, GlobalCompositeOperation | 'color' | 'color-bg'>
  terrainTextureOpacities: Record<string, number>
  terrainTextureTintColors: Record<string, string>
  terrainTextureTintOpacities: Record<string, number>
  terrainTextureFile: Record<string, string>
  terrainTextureEnabled: Record<string, boolean>
  terrainBlobOverrides: Record<string, BlobOverride>
  terrainTypeBlobStyles: Record<string, BlobOverride>
  // Terrain render mode (field mode detached — see terrainBlobs.ts / drawTerrain.ts)
  terrainRenderMode: 'blob'
  // fieldFreq: number; fieldAmp: number; fieldOctaves: number
  // fieldPersistence: number; fieldWildness: Record<string, number>
  // Terrain paint
  terrainPaintMode: boolean
  terrainPaintBrush: string
  terrainEdgePaintEnabled: boolean
  terrainBackgroundPaintEnabled: boolean
  // Edge blob paint + state
  edgeBlobPainted: Record<string, string>
  edgeBlobWidth: number
  edgeBlobOverrides: Record<string, BlobOverride>
  // Custom terrain types
  customTerrains: CustomTerrain[]
  addCustomTerrain: (terrain: CustomTerrain) => void
  updateCustomTerrain: (id: string, updates: Partial<CustomTerrain>) => void
  removeCustomTerrain: (id: string) => void
  // Blank map
  blankMap: boolean
  setBlankMap: (v: boolean) => void
  waterOverrides: Record<string, BlobOverride>
  // Actions
  resetToSetup: () => void
  generateMap: () => Promise<void>
  expandMap: (edge: 'left' | 'right' | 'top' | 'bottom', newMm: number) => Promise<void>
  setClassRule: (terrain: string, classCode: number, rule: ClassRule | null) => void
  setTerrainRules: (rules: TerrainRules) => void
  setGenerateProgress: (p: GenerateProgress | null) => void
  reclassify: () => void
  toggleTerrainDisabled: (terrain: string) => void
  overrideHexTerrain: (q: number, r: number, terrain: string) => void
  batchOverrideHexTerrain: (ops: { q: number; r: number; terrain: string }[]) => void
  batchOverrideHexBackground: (ops: { q: number; r: number; terrain: string | undefined }[]) => void
  addHexTerrainLayer: (q: number, r: number, terrain: string) => void
  removeHexTerrainLayer: (q: number, r: number, terrain: string) => void
  resetHexOverride: (q: number, r: number) => void
  batchResetHexOverride: (ops: { q: number; r: number }[]) => void
  setTerrainLayersEnabled: (v: boolean) => void
  setTerrainBlobSmooth: (v: number) => void
  setTerrainBlobOffset: (v: number) => void
  setTerrainBlobBump: (v: number) => void
  setTerrainBlobSweepFreq: (v: number) => void
  setTerrainBlobLobeFreq: (v: number) => void
  setTerrainBlobLobeAmp: (v: number) => void
  setTerrainBlobLobeThreshold: (v: number) => void
  setTerrainBlobLobeDirection: (v: number) => void
  setTerrainBlobTopoStyle: (v: number) => void
  setTerrainBlobClusterSize: (v: number) => void
  setTerrainBlobSplatDensity: (v: number) => void
  setTerrainBlobSplatSize: (v: number) => void
  setTerrainBlobOutlineEnabled: (v: boolean) => void
  setTerrainBlobOutlineColor: (v: string) => void
  setTerrainBlobOutlineWidth: (v: number) => void
  setTerrainBlobEffect: (v: Partial<StrokeEffect>) => void
  applyTerrainBlobPreset: (id: BlobPresetId) => void
  setRealisticCoastline: (v: boolean) => void
  setCoastlineDebugRaw: (v: boolean) => void
  setBeachStrip: (v: boolean) => void
  setBeachColor: (v: string) => void
  setBeachWidth: (v: number) => void
  setHillsColor: (v: string) => void
  setMountainsColor: (v: string) => void
  setReliefShadingOpacity: (v: number) => void
  setCoastlineDPEpsilon: (v: number) => void
  setCoastlineChaikinPasses: (v: number) => void
  setTerrainColor: (terrain: string, color: string) => void
  setTerrainTextureScale: (terrain: string, scale: number) => void
  setTerrainTextureBlendMode: (terrain: string, mode: GlobalCompositeOperation | 'color' | 'color-bg') => void
  setTerrainTextureOpacity: (terrain: string, opacity: number) => void
  setTerrainTextureTintColor: (terrain: string, color: string) => void
  setTerrainTextureTintOpacity: (terrain: string, opacity: number) => void
  setTerrainTextureFile: (terrain: string, fileId: string) => void
  setTerrainTextureEnabled: (terrain: string, v: boolean) => void
  setTerrainBlobOverride: (key: string, override: BlobOverride | null) => void
  setTerrainTypeBlobStyle: (terrain: string, style: BlobOverride | null) => void
  setTerrainRenderMode: (v: 'blob') => void
  // setFieldFreq: (v: number) => void; setFieldAmp: (v: number) => void
  // setFieldOctaves: (v: number) => void; setFieldPersistence: (v: number) => void
  // setFieldWildness: (terrain: string, v: number) => void
  setTerrainPaintMode: (v: boolean) => void
  setTerrainPaintBrush: (v: string) => void
  setTerrainEdgePaintEnabled: (v: boolean) => void
  setTerrainBackgroundPaintEnabled: (v: boolean) => void
  overrideHexBackground: (q: number, r: number, terrain: string | undefined) => void
  paintEdgeBlob: (edgeKey: string, terrain: string) => void
  eraseEdgeBlob: (edgeKey: string) => void
  setEdgeBlobWidth: (v: number) => void
  setEdgeBlobOverride: (key: string, override: BlobOverride | null) => void
  setWaterOverride: (key: string, override: BlobOverride | null) => void
  blobSeeds: Record<string, number>
  randomizeBlobSeed: (terrain: string) => void
  // Blob handle editing
  blobEditMode: boolean
  activeBlobEditId: string | null
  blobHandleOverrides: Record<string, Record<string, [number, number]>>
  setBlobEditMode: (v: boolean) => void
  setActiveBlobEditId: (id: string | null) => void
  setBlobHandleOverride: (canonicalKey: string, hexKey: string, offset: [number, number] | null) => void
  clearBlobHandleOverrides: (canonicalKey: string) => void
  // Blob mask edits (boolean add/subtract regions in world space)
  blobMaskEdits: BlobMaskEdit[]
  addBlobMaskEdit: (edit: BlobMaskEdit) => void
  removeBlobMaskEdit: (id: string) => void
  clearBlobMaskEdits: (terrain?: string) => void
  // WorldCover raw overlay
  worldcoverImageUrl: string | null
  showWorldcoverOverlay: boolean
  setShowWorldcoverOverlay: (v: boolean) => void
}

import { TERRAIN_COLORS } from '../mapStore'

/** Auto-classify a hex terrain, stripping background sub-types from the primary
 *  layers array so they don't join the wrong blob.
 *  Rule: woods + light_woods in same hex → light_woods becomes backgroundTerrain,
 *  removed from terrains so the hex only participates in the woods primary blob. */
function classifyWithBackground(
  terrain: string, allTerrains: string[],
): { terrains: string[]; backgroundTerrain: string | undefined } {
  if (terrain === 'woods' && allTerrains.includes('light_woods')) {
    return { terrains: allTerrains.filter(t => t !== 'light_woods'), backgroundTerrain: 'light_woods' }
  }
  return { terrains: allTerrains, backgroundTerrain: undefined }
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createTerrainSlice = (set: Set, get: () => MapStore): TerrainSlice => ({
  generatedHexes: [],
  generatedMetadata: null,
  generateStatus: 'idle',
  generateError: null,
  terrainRules: { ...DEFAULT_TERRAIN_RULES },
  disabledTerrains: new Set<string>(),
  generateProgress: null,
  terrainLayersEnabled: true,

  terrainBlobSmooth: DEFAULT_TERRAIN_BLOB.smooth,
  terrainBlobOffset: DEFAULT_TERRAIN_BLOB.offset,
  terrainBlobBump: DEFAULT_TERRAIN_BLOB.bump,
  terrainBlobSweepFreq: DEFAULT_TERRAIN_BLOB.sweepFreq,
  terrainBlobLobeFreq: DEFAULT_TERRAIN_BLOB.lobeFreq,
  terrainBlobLobeAmp: DEFAULT_TERRAIN_BLOB.lobeAmp,
  terrainBlobLobeThreshold: DEFAULT_TERRAIN_BLOB.lobeThreshold,
  terrainBlobLobeDirection: DEFAULT_TERRAIN_BLOB.lobeDirection,
  terrainBlobTopoStyle: DEFAULT_TERRAIN_BLOB.topoStyle,
  terrainBlobClusterSize: 0,
  terrainBlobSplatDensity: 0,
  terrainBlobSplatSize: 0.3,
  terrainBlobOutlineEnabled: false,
  terrainBlobOutlineColor: '#000000',
  terrainBlobOutlineWidth: 1,
  terrainBlobEffect: { ...DEFAULT_STROKE_EFFECT },
  realisticCoastline: false,
  coastlineDebugRaw: false,
  beachStrip: false,
  beachColor: '#e4d5a0',
  beachWidth: 0.06,
  hillsColor: '#c8b87a',
  mountainsColor: '#9a9080',
  reliefShadingOpacity: 0.45,
  coastlineDPEpsilon: 1,
  coastlineChaikinPasses: 2,
  terrainColors: { ...TERRAIN_COLORS },
  terrainTextureScales: { clear: 3, woods: 3, light_woods: 3 },
  terrainTextureBlendModes: {},
  terrainTextureOpacities: {},
  terrainTextureTintColors: {},
  terrainTextureTintOpacities: {},
  terrainTextureFile: {},
  terrainTextureEnabled: {},
  terrainBlobOverrides: {},
  terrainTypeBlobStyles: {},

  terrainRenderMode: 'blob',
  // fieldFreq / fieldAmp / fieldOctaves / fieldPersistence / fieldWildness — detached

  terrainPaintMode: false,
  terrainPaintBrush: 'clear',
  terrainEdgePaintEnabled: false,
  terrainBackgroundPaintEnabled: false,

  edgeBlobPainted: {},
  edgeBlobWidth: 0.25,
  edgeBlobOverrides: {},

  customTerrains: [],
  addCustomTerrain: (terrain) => set(s => ({ customTerrains: [...s.customTerrains, terrain] })),
  updateCustomTerrain: (id, updates) => set(s => ({
    customTerrains: s.customTerrains.map(t => t.id === id ? { ...t, ...updates } : t),
  })),
  removeCustomTerrain: (id) => set(s => ({ customTerrains: s.customTerrains.filter(t => t.id !== id) })),

  blankMap: false,

  setBlankMap: (v) => set({ blankMap: v }),

  waterOverrides: {},

  blobSeeds: {},
  blobEditMode: false,
  activeBlobEditId: null,
  blobHandleOverrides: {},
  blobMaskEdits: [],
  worldcoverImageUrl: null,
  showWorldcoverOverlay: false,
  setShowWorldcoverOverlay: (v) => set({ showWorldcoverOverlay: v }),

  resetToSetup: () => set({
    step: 'setup',
    dataSource: 'osm',
    mapImageDataUrl: null,
    generatedHexes: [],
    generatedMetadata: null,
    generateStatus: 'idle',
    generateError: null,
    generateProgress: null,
    settlements: [],
    settlementsStatus: 'idle',
    settlementsError: null,
    showSettlementLabels: true,
    settlementLabelFont: 'classic',
    settlementLabelColor: '#1a1008',
    settlementLabelSizeScale: 1.0,
    settlementLabelOverrides: {},
    settlementEditMode: false,
    settlementPlaceTarget: null,
    settlementMoveIndex: null,
    settlementPlaceTier: null,
    rawRoadWays: [],
    osmHexPaths: [],
    roadEdges: [],
    roadsDisplayMode: 'per_hex',
    roadsVisibleTiers: [true, true, true],
    roadsStatus: 'idle',
    roadsError: null,
    rawRailWays: [],
    osmRailHexPaths: [],
    railEdges: [],
    railsStatus: 'idle',
    railsError: null,
    railPaintMode: false,
    railPaintEraser: false,
    activeTool: { type: 'none' } as ActiveTool,
    osmRiverWays: [],
    appliedOsmRiverIndices: [],
    riverEdges: [],
    riverEditMode: false,
    elevationStatus: 'idle',
    elevationError: null,
    elevationProgress: null,
    terrainPaintMode: false,
    roadPaintMode: false,
    roadPaintEraser: false,
    highlightedHexes: {},
    highlightLines: {},
    highlightEdgePaths: {},
    highlightPaintMode: false,
    highlightLineEraser: false,
    highlights: [],
    edgeBlobPainted: {},
    edgeBlobOverrides: {},
    terrainBlobOverrides: {},
    waterOverrides: {},
    blobHandleOverrides: {},
    activeBlobEditId: null,
    blobEditMode: false,
    blobMaskEdits: [],
    urbanHexes: [],
    excludedHexKeys: [],
    disabledHexKeys: [],
    autoDisabledOceanHexKeys: [],
    riverSegmentProps: {},
    riverChainOverrides: {},
    riverHopProps: {},
    roadChainOverrides: {},
    roadControlOverrides: {},
    roadSnapBindings: {},
    roadSegmentProps: {},
    roadHopProps: {},
    railChainOverrides: {},
    railControlOverrides: {},
    railSnapBindings: {},
    railSegmentProps: {},
    railHopProps: {},
    bridgeOverrides: {},
    areas: [],
    areaHexes: {},
    iconOverlays: [],
    placedIcons: {},
    labelOverlays: [],
    placedLabels: {},
    undoStack: [],
    redoStack: [],
    mapTitle: '',
    activePanel: 'terrain',
  }),

  generateMap: async () => {
    const { paperSize, orientation, pageGrid, hexSizeMm, hexOrientation, marginMm, bearing, center, zoom, framePixelWidth, blankMap, realisticCoastline } = get()
    if (framePixelWidth === 0 && !blankMap) return

    const [cwMm, chMm] = pageGridTotalMm(pageGrid)

    let widthM: number, heightM: number, usedCenter: [number, number], usedBearing: number
    if (blankMap) {
      const mPerMm = 1000 / hexSizeMm
      widthM = cwMm * mPerMm
      heightM = chMm * mPerMm
      usedCenter = [0, 0]
      usedBearing = 0
    } else {
      const res = mapResolutionMpx(center[1], zoom)
      widthM = framePixelWidth * res
      heightM = widthM * (chMm / cwMm)
      usedCenter = center
      usedBearing = bearing
    }

    set({
      generateStatus: 'loading',
      generateError: null,
      generateProgress: null,
      generatedHexes: [],
      generatedMetadata: null,
      // Clear all previous map content so a new map always starts clean
      settlements: [],
      settlementsStatus: 'idle',
      settlementsError: null,
      settlementLabelOverrides: {},
      settlementEditMode: false,
      settlementPlaceTarget: null,
      settlementMoveIndex: null,
      settlementPlaceTier: null,
      rawRoadWays: [],
      roadEdges: [],
      roadsStatus: 'idle',
      roadsError: null,
      rawRailWays: [],
      railEdges: [],
      railsStatus: 'idle',
      railsError: null,
      riverEdges: [],
      riverSegmentProps: {},
      riverChainOverrides: {},
      riverHopProps: {},
      roadChainOverrides: {},
      roadControlOverrides: {},
      roadSnapBindings: {},
      roadSegmentProps: {},
      roadHopProps: {},
      railChainOverrides: {},
      railControlOverrides: {},
      railSnapBindings: {},
      railSegmentProps: {},
      railHopProps: {},
      elevationStatus: 'idle',
      elevationError: null,
      elevationProgress: null,
      highlights: [],
      highlightedHexes: {},
      highlightLines: {},
      highlightEdgePaths: {},
      highlightPaintMode: false,
      highlightLineEraser: false,
      areas: [],
      areaHexes: {},
      iconOverlays: [],
      placedIcons: {},
      labelOverlays: [],
      placedLabels: {},
      urbanHexes: [],
      excludedHexKeys: [],
      disabledHexKeys: [],
      autoDisabledOceanHexKeys: [],
      edgeBlobPainted: {},
      edgeBlobOverrides: {},
      terrainBlobOverrides: {},
      waterOverrides: {},
      blobHandleOverrides: {},
      activeBlobEditId: null,
      blobEditMode: false,
      bridgeOverrides: {},
      undoStack: [],
      redoStack: [],
      mapTitle: '',
      activeTool: { type: 'none' } as ActiveTool,
      activePanel: 'terrain',
      worldcoverImageUrl: null,
      showWorldcoverOverlay: false,
    })

    const { terrainRules: currentRules } = get()
    const requestBody = {
      center_lon: usedCenter[0],
      center_lat: usedCenter[1],
      bearing: usedBearing,
      width_m: widthM,
      height_m: heightM,
      hex_size_mm: hexSizeMm,
      paper_size: paperSize,
      orientation,
      hex_orientation: hexOrientation,
      margin_mm: marginMm,
      paper_width_mm: cwMm,
      paper_height_mm: chMm,
      terrain_rules: currentRules,
      realistic_coastline: realisticCoastline,
    }

    try {
      const resp = await fetch('/api/generate/terrain-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      if (!resp.ok) throw new Error(await resp.text())
      if (!resp.body) throw new Error('No response body')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let shouldStop = false

      while (!shouldStop) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (shouldStop) break
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(jsonStr) } catch { continue }

          const step = event.step as string
          const message = event.message as string
          const progress = event.progress as number

          if (step === 'done') {
            const { terrainRules, disabledTerrains, realisticCoastline } = get()
            const rawHexes = event.hexes as GeneratedHex[]
            const reclassified = rawHexes.map((h) => {
              const terrain = classifyHex(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline)
              const { terrains, backgroundTerrain } = classifyWithBackground(terrain, classifyHexLayers(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline))
              return { ...h, terrain, terrains, backgroundTerrain }
            })
            set({
              step: 'terrain',
              dataSource: 'osm',
              generateStatus: 'done',
              generatedHexes: reclassified,
              generatedMetadata: event.metadata as GridMetadata,
              generateProgress: null,
              highlightedHexes: {},
              highlightLines: {},
              highlightEdgePaths: {},
              highlightPaintMode: false,
            })
            // Fetch the WorldCover PNG in the background — revoke any previous blob URL
            fetch('/api/generate/worldcover-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            }).then(r => r.ok ? r.blob() : null).then(blob => {
              if (!blob) return
              const prev = get().worldcoverImageUrl
              if (prev) URL.revokeObjectURL(prev)
              set({ worldcoverImageUrl: URL.createObjectURL(blob) })
            }).catch(() => { /* non-critical */ })
          } else if (step === 'grid' && Array.isArray(event.hexes)) {
            const raw = event.hexes as Array<{ q: number; r: number; center: [number, number]; vertices: [number, number][]; partial: boolean }>
            const placeholder: GeneratedHex[] = raw.map((h) => ({
              ...h,
              terrain: 'clear',
              terrains: [],
              coverage: {},
              elevation_avg_m: null,
              elevation_median_m: null,
              elevation_max_m: null,
              elevation_min_m: null,
              elevation_range_m: null,
              elevation_class: null,
              elevation_manual_override: false,
              coastline_clip: null,
            }))
            if (get().blankMap) {
              set({
                step: 'terrain',
                dataSource: 'osm',
                generatedMetadata: event.metadata as GridMetadata,
                generatedHexes: placeholder,
                generateStatus: 'done',
                generateProgress: null,
                highlightedHexes: {},
                highlightLines: {},
                highlightEdgePaths: {},
                highlightPaintMode: false,
              })
              reader.cancel()
              shouldStop = true
              break
            }
            set({
              step: 'terrain',
              generatedMetadata: event.metadata as GridMetadata,
              generatedHexes: placeholder,
              generateProgress: { step, message, progress },
              highlightedHexes: {},
              highlightLines: {},
              highlightEdgePaths: {},
              highlightPaintMode: false,
            })
          } else if (step === 'classify' && Array.isArray(event.hexes)) {
            const { terrainRules, disabledTerrains, realisticCoastline, generatedHexes: prev } = get()
            const rawHexes = event.hexes as GeneratedHex[]
            const updates = new Map(rawHexes.map((h) => {
              const terrain = classifyHex(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline)
              const { terrains, backgroundTerrain } = classifyWithBackground(terrain, classifyHexLayers(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline))
              return [`${h.q},${h.r}`, { ...h, terrain, terrains, backgroundTerrain }]
            }))
            set({
              generateProgress: { step, message, progress },
              generatedHexes: prev.map((h) => updates.get(`${h.q},${h.r}`) ?? h),
            })
          } else if (step === 'error') {
            set({ generateStatus: 'error', generateError: message, generateProgress: null })
          } else {
            set({ generateProgress: { step, message, progress } })
          }
        }
      }
    } catch (e) {
      set({ generateStatus: 'error', generateError: String(e), generateProgress: null })
    }
  },

  setGenerateProgress: (p) => set({ generateProgress: p }),

  expandMap: async (edge, newMm) => {
    const { generatedHexes, generatedMetadata, pageGrid, paperSize, orientation, hexSizeMm, hexOrientation, marginMm, terrainRules, disabledTerrains, realisticCoastline } = get()
    if (!generatedMetadata) return

    const scale = generatedMetadata.scale_m_per_mm
    const R_m = generatedMetadata.outer_radius_m
    const flatTop = hexOrientation === 'flat'
    const [ox, oy] = generatedMetadata.paper_offset_mm ?? [0, 0]
    const [metaPwMm, metaPhMm] = generatedMetadata.paper_mm

    // For single-sheet maps, pageGrid may be stale — always trust generatedMetadata.paper_mm
    const baseGrid = (pageGrid.colWidths.length === 1 && pageGrid.rowHeights.length === 1)
      ? { colWidths: [metaPwMm], rowHeights: [metaPhMm] }
      : pageGrid

    let newPageGrid: typeof pageGrid
    if (edge === 'left')        newPageGrid = { ...baseGrid, colWidths: [newMm, ...baseGrid.colWidths] }
    else if (edge === 'right')  newPageGrid = { ...baseGrid, colWidths: [...baseGrid.colWidths, newMm] }
    else if (edge === 'top')    newPageGrid = { ...baseGrid, rowHeights: [newMm, ...baseGrid.rowHeights] }
    else                        newPageGrid = { ...baseGrid, rowHeights: [...baseGrid.rowHeights, newMm] }

    const newCwMm = newPageGrid.colWidths.reduce((a, b) => a + b, 0)
    const newChMm = newPageGrid.rowHeights.reduce((a, b) => a + b, 0)

    // Center stays FIXED. paper_offset_mm accumulates to keep original content on its side.
    const newOffset: [number, number] = [
      ox + (edge === 'right' ? newMm / 2 : edge === 'left' ? -newMm / 2 : 0),
      oy + (edge === 'top'   ? newMm / 2 : edge === 'bottom' ? -newMm / 2 : 0),
    ]

    // Current paper edges in paper-x/y metres from geographic centre (using current offset)
    // right/top edges = where existing territory ends; new hexes beyond this are kept
    const curRightM  = (metaPwMm / 2 + ox) * scale
    const curLeftM   = (-metaPwMm / 2 + ox) * scale
    const curTopM    = (metaPhMm / 2 + oy) * scale
    const curBottomM = (-metaPhMm / 2 + oy) * scale

    // Axial hex centre in paper-space metres (replicates backend axial_to_paper_m)
    const axialToPaperM = (q: number, r: number): [number, number] =>
      flatTop
        ? [1.5 * R_m * q, R_m * Math.sqrt(3) * (r + q / 2)]
        : [R_m * Math.sqrt(3) * (q + r / 2), 1.5 * R_m * r]

    // Is this hex in the correct new-territory zone? (beyond existing edge, within tolerance)
    const isNewTerritory = (q: number, r: number): boolean => {
      const [px, py] = axialToPaperM(q, r)
      if (edge === 'right')  return px > curRightM  - R_m
      if (edge === 'left')   return px < curLeftM   + R_m
      if (edge === 'top')    return py > curTopM    - R_m
      return                        py < curBottomM + R_m  // bottom
    }

    // Old hexes keyed by q,r — unchanged (centre is fixed, coordinate system is stable)
    const existingByKey = new Map(generatedHexes.map(h => [`${h.q},${h.r}`, h]))

    set({ generateStatus: 'loading', generateError: null, generateProgress: null, pageGrid: newPageGrid })

    // The paper is asymmetric around the fixed geographic centre (paper_offset_mm accounts for it).
    // The backend generates hexes symmetrically, so request enough to cover the furthest edge.
    // reqW/H are the symmetric dimensions needed; actual paper_mm is still newCwMm × newChMm.
    const reqWMm = 2 * (newCwMm / 2 + Math.abs(newOffset[0]))
    const reqHMm = 2 * (newChMm / 2 + Math.abs(newOffset[1]))

    const requestBody = {
      center_lon: generatedMetadata.center[0],
      center_lat: generatedMetadata.center[1],
      bearing: generatedMetadata.bearing,
      width_m: reqWMm * scale,
      height_m: reqHMm * scale,
      hex_size_mm: hexSizeMm,
      paper_size: paperSize,
      orientation,
      hex_orientation: hexOrientation,
      margin_mm: marginMm,
      paper_width_mm: reqWMm,
      paper_height_mm: reqHMm,
      terrain_rules: terrainRules,
      realistic_coastline: realisticCoastline,
    }

    try {
      const resp = await fetch('/api/generate/terrain-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      if (!resp.ok) throw new Error(await resp.text())
      if (!resp.body) throw new Error('No response body')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(jsonStr) } catch { continue }

          if (event.step === 'progress') {
            set({ generateProgress: { message: event.message as string, progress: event.progress as number } })
          } else if (event.step === 'grid' && Array.isArray(event.hexes)) {
            // Show placeholder hexes for the new territory while streaming
            const raw = event.hexes as Array<{ q: number; r: number; center: [number, number]; vertices: [number, number][]; partial: boolean }>
            const newPlaceholders = raw
              .filter(h => !existingByKey.has(`${h.q},${h.r}`) && isNewTerritory(h.q, h.r))
              .map(h => ({
                ...h, terrain: 'clear', terrains: [], coverage: {},
                elevation_avg_m: null, elevation_median_m: null, elevation_max_m: null,
                elevation_min_m: null, elevation_range_m: null, elevation_class: null,
                elevation_manual_override: false, coastline_clip: null,
              } as GeneratedHex))
            // Update partial flags on old border hexes that are now interior
            const updatedExisting = generatedHexes.map(h => {
              const match = raw.find(rh => rh.q === h.q && rh.r === h.r)
              return match ? { ...h, partial: match.partial } : h
            })
            const backendMeta = event.metadata as GridMetadata
            set({
              generatedHexes: [...updatedExisting, ...newPlaceholders],
              // Override paper_mm with actual combined dims (backend got the oversized request)
              generatedMetadata: { ...backendMeta, paper_mm: [newCwMm, newChMm], paper_offset_mm: newOffset },
            })
          } else if (event.step === 'done') {
            const rawHexes = event.hexes as GeneratedHex[]
            const merged = new Map(existingByKey)

            for (const h of rawHexes) {
              const key = `${h.q},${h.r}`
              if (existingByKey.has(key)) {
                // Existing hex: preserve all terrain/elevation data, just update partial flag
                merged.set(key, { ...existingByKey.get(key)!, partial: h.partial })
              } else if (isNewTerritory(h.q, h.r)) {
                // New hex in correct zone: classify and add
                const terrain = classifyHex(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline)
                const { terrains, backgroundTerrain } = classifyWithBackground(terrain, classifyHexLayers(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline))
                merged.set(key, { ...h, terrain, terrains, backgroundTerrain })
              }
              // Hexes on the wrong side of the original paper are discarded
            }

            const backendMeta = event.metadata as GridMetadata
            set({
              generateStatus: 'done',
              generatedHexes: [...merged.values()],
              // Override paper_mm with actual combined dims; inject paper_offset_mm
              generatedMetadata: { ...backendMeta, paper_mm: [newCwMm, newChMm], paper_offset_mm: newOffset },
              generateProgress: null,
              // Clear stale state
              undoStack: [],
              redoStack: [],
              worldcoverImageUrl: null,
              showWorldcoverOverlay: false,
              appliedOsmRiverIndices: [],
              motorwayHexes: [],
              motorwayHexesStatus: 'idle',
              settlementLabelOverrides: {},
            })

            // Re-fetch all layers for the expanded area
            const { setExpandFetchStep, clearExpandFetchSteps } = get()
            set({ expandFetchSteps: { terrain: 'done', elevation: 'loading', roads: 'loading', rivers: 'loading', settlements: 'loading', rails: 'loading' } } as Parameters<typeof set>[0])

            const run = async (key: string, fn: () => Promise<void>) => {
              try { await fn(); setExpandFetchStep(key, 'done') }
              catch { setExpandFetchStep(key, 'error') }
            }

            Promise.all([
              run('elevation',   () => get().fetchElevation()),
              run('roads',       () => get().fetchRoads()),
              run('rivers',      () => get().fetchRivers()),
              run('settlements', () => get().fetchSettlements()),
              run('rails',       () => get().fetchRails()),
            ]).then(() => { setTimeout(() => clearExpandFetchSteps(), 1200) })
          }
        }
      }
    } catch (e) {
      set({ generateStatus: 'error', generateError: String(e), generateProgress: null })
    }
  },

  setClassRule: (terrain, classCode, rule) => {
    const { terrainRules, generatedHexes, disabledTerrains, realisticCoastline } = get()
    const existing = terrainRules[terrain] ?? []
    const next: TerrainRules = {
      ...terrainRules,
      [terrain]: rule === null
        ? existing.filter(r => r.classCode !== classCode)
        : existing.some(r => r.classCode === classCode)
          ? existing.map(r => r.classCode === classCode ? rule : r)
          : [...existing, rule],
    }
    const updated = generatedHexes.map((h) => {
      if (h.manual_override) return h
      const t = classifyHex(h.coverage ?? {}, next, disabledTerrains, realisticCoastline)
      const { terrains, backgroundTerrain } = classifyWithBackground(t, classifyHexLayers(h.coverage ?? {}, next, disabledTerrains, realisticCoastline))
      return { ...h, terrain: t, terrains, backgroundTerrain }
    })
    set({ terrainRules: next, generatedHexes: updated })
  },

  setTerrainRules: (rules) => {
    const { generatedHexes, disabledTerrains, realisticCoastline } = get()
    const updated = generatedHexes.map((h) => {
      if (h.manual_override) return h
      const t = classifyHex(h.coverage ?? {}, rules, disabledTerrains, realisticCoastline)
      const { terrains, backgroundTerrain } = classifyWithBackground(t, classifyHexLayers(h.coverage ?? {}, rules, disabledTerrains, realisticCoastline))
      return { ...h, terrain: t, terrains, backgroundTerrain }
    })
    set({ terrainRules: rules, generatedHexes: updated })
  },

  reclassify: () => {
    const { generatedHexes, terrainRules, disabledTerrains, realisticCoastline } = get()
    if (generatedHexes.length === 0) return
    const updated = generatedHexes.map((h) => {
      if (h.manual_override) return h
      const t = classifyHex(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline)
      const { terrains, backgroundTerrain } = classifyWithBackground(t, classifyHexLayers(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline))
      return { ...h, terrain: t, terrains, backgroundTerrain }
    })
    set({ generatedHexes: updated })
  },

  toggleTerrainDisabled: (terrain) => {
    const { disabledTerrains, generatedHexes, terrainRules, realisticCoastline } = get()
    const next = new Set(disabledTerrains)
    if (next.has(terrain)) next.delete(terrain)
    else next.add(terrain)
    const updated = generatedHexes.map((h) => {
      if (h.manual_override) return h
      const t = classifyHex(h.coverage ?? {}, terrainRules, next, realisticCoastline)
      const { terrains, backgroundTerrain } = classifyWithBackground(t, classifyHexLayers(h.coverage ?? {}, terrainRules, next, realisticCoastline))
      return { ...h, terrain: t, terrains, backgroundTerrain }
    })
    set({ disabledTerrains: next, generatedHexes: updated })
  },

  overrideHexTerrain: (q, r, terrain) => {
    const { generatedHexes } = get()
    const terrains = terrain === 'clear' ? [] : [terrain]
    const updated = generatedHexes.map((h) =>
      h.q === q && h.r === r
        ? { ...h, terrain, terrains, backgroundTerrain: undefined, manual_override: true }
        : h
    )
    set({ generatedHexes: updated })
  },

  batchOverrideHexTerrain: (ops) => {
    if (!ops.length) return
    const { generatedHexes } = get()
    const overrideMap = new Map(ops.map(op => [`${op.q},${op.r}`, op.terrain]))
    const updated = generatedHexes.map((h) => {
      const terrain = overrideMap.get(`${h.q},${h.r}`)
      if (terrain === undefined) return h
      const terrains = terrain === 'clear' ? [] : [terrain]
      return { ...h, terrain, terrains, backgroundTerrain: undefined, manual_override: true }
    })
    set({ generatedHexes: updated })
  },

  batchOverrideHexBackground: (ops) => {
    if (!ops.length) return
    const { generatedHexes } = get()
    const overrideMap = new Map(ops.map(op => [`${op.q},${op.r}`, op.terrain]))
    const updated = generatedHexes.map((h) => {
      if (!overrideMap.has(`${h.q},${h.r}`)) return h
      return { ...h, backgroundTerrain: overrideMap.get(`${h.q},${h.r}`), manual_override: true }
    })
    set({ generatedHexes: updated })
  },

  addHexTerrainLayer: (q, r, terrain) => {
    if (terrain === 'clear') return
    const { generatedHexes } = get()
    const updated = generatedHexes.map((h) => {
      if (h.q !== q || h.r !== r) return h
      const layers = h.terrains ?? (h.terrain === 'clear' ? [] : [h.terrain])
      if (layers.includes(terrain)) return h
      return { ...h, terrains: [...layers, terrain], backgroundTerrain: undefined, manual_override: true }
    })
    set({ generatedHexes: updated })
  },

  removeHexTerrainLayer: (q, r, terrain) => {
    const { generatedHexes } = get()
    const updated = generatedHexes.map((h) => {
      if (h.q !== q || h.r !== r) return h
      const layers = h.terrains ?? (h.terrain === 'clear' ? [] : [h.terrain])
      const next = layers.filter(t => t !== terrain)
      return { ...h, terrains: next, backgroundTerrain: undefined, manual_override: true }
    })
    set({ generatedHexes: updated })
  },

  setTerrainLayersEnabled: (v) => set({ terrainLayersEnabled: v }),

  resetHexOverride: (q, r) => {
    get().pushUndoSnapshot()
    const { generatedHexes, terrainRules, disabledTerrains, realisticCoastline } = get()
    const hex = generatedHexes.find((h) => h.q === q && h.r === r)
    if (!hex) return
    const terrain = classifyHex(hex.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline)
    const { terrains, backgroundTerrain } = classifyWithBackground(terrain, classifyHexLayers(hex.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline))
    const updated = generatedHexes.map((h) =>
      h.q === q && h.r === r
        ? { ...h, terrain, terrains, backgroundTerrain, manual_override: false }
        : h
    )
    set({ generatedHexes: updated })
  },

  batchResetHexOverride: (ops) => {
    if (!ops.length) return
    const { generatedHexes, terrainRules, disabledTerrains, realisticCoastline } = get()
    const opSet = new Set(ops.map(op => `${op.q},${op.r}`))
    const updated = generatedHexes.map((h) => {
      if (!opSet.has(`${h.q},${h.r}`)) return h
      const terrain = classifyHex(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline)
      const { terrains, backgroundTerrain } = classifyWithBackground(terrain, classifyHexLayers(h.coverage ?? {}, terrainRules, disabledTerrains, realisticCoastline))
      return { ...h, terrain, terrains, backgroundTerrain, manual_override: false }
    })
    set({ generatedHexes: updated })
  },

  setTerrainBlobSmooth: (v) => set({ terrainBlobSmooth: v }),
  setTerrainBlobOffset: (v) => set({ terrainBlobOffset: v }),
  setTerrainBlobBump: (v) => set({ terrainBlobBump: v }),
  setTerrainBlobSweepFreq: (v) => set({ terrainBlobSweepFreq: v }),
  setTerrainBlobLobeFreq: (v) => set({ terrainBlobLobeFreq: v }),
  setTerrainBlobLobeAmp: (v) => set({ terrainBlobLobeAmp: v }),
  setTerrainBlobLobeThreshold: (v) => set({ terrainBlobLobeThreshold: v }),
  setTerrainBlobLobeDirection: (v) => set({ terrainBlobLobeDirection: v }),
  setTerrainBlobTopoStyle: (v) => set({ terrainBlobTopoStyle: v }),
  setTerrainBlobClusterSize: (v) => set({ terrainBlobClusterSize: v }),
  setTerrainBlobSplatDensity: (v) => set({ terrainBlobSplatDensity: v }),
  setTerrainBlobSplatSize: (v) => set({ terrainBlobSplatSize: v }),
  setTerrainBlobOutlineEnabled: (v) => set({ terrainBlobOutlineEnabled: v }),
  setTerrainBlobOutlineColor: (v) => set({ terrainBlobOutlineColor: v }),
  setTerrainBlobOutlineWidth: (v) => set({ terrainBlobOutlineWidth: v }),
  setTerrainBlobEffect: (v) => set(s => ({ terrainBlobEffect: { ...s.terrainBlobEffect, ...v } })),
  applyTerrainBlobPreset: (id) => {
    const values = BLOB_PRESETS[id].values
    set({
      terrainBlobSmooth: values.smooth,
      terrainBlobOffset: values.offset,
      terrainBlobBump: values.bump,
      terrainBlobSweepFreq: values.sweepFreq,
      terrainBlobLobeFreq: values.lobeFreq,
      terrainBlobLobeAmp: values.lobeAmp,
      terrainBlobLobeThreshold: values.lobeThreshold,
      terrainBlobLobeDirection: values.lobeDirection,
    })
  },
  setRealisticCoastline: (v) => {
    const { generatedHexes, terrainRules, disabledTerrains } = get()
    if (generatedHexes.length === 0) { set({ realisticCoastline: v }); return }
    const updated = generatedHexes.map((h) => {
      if (h.manual_override) return h
      const t = classifyHex(h.coverage ?? {}, terrainRules, disabledTerrains, v)
      const { terrains, backgroundTerrain } = classifyWithBackground(t, classifyHexLayers(h.coverage ?? {}, terrainRules, disabledTerrains, v))
      return { ...h, terrain: t, terrains, backgroundTerrain }
    })
    set({ realisticCoastline: v, generatedHexes: updated })
  },
  setCoastlineDebugRaw: (v) => set({ coastlineDebugRaw: v }),
  setBeachStrip: (v) => set({ beachStrip: v }),
  setBeachColor: (v) => set({ beachColor: v }),
  setBeachWidth: (v) => set({ beachWidth: v }),
  setHillsColor: (v) => set({ hillsColor: v }),
  setMountainsColor: (v) => set({ mountainsColor: v }),
  setReliefShadingOpacity: (v) => set({ reliefShadingOpacity: v }),
  setCoastlineDPEpsilon: (v) => set({ coastlineDPEpsilon: v }),
  setCoastlineChaikinPasses: (v) => set({ coastlineChaikinPasses: v }),
  setTerrainColor: (terrain, color) => set((s) => ({ terrainColors: { ...s.terrainColors, [terrain]: color } })),
  setTerrainTextureScale: (terrain, scale) => set((s) => ({ terrainTextureScales: { ...s.terrainTextureScales, [terrain]: scale } })),
  setTerrainTextureBlendMode: (terrain, mode) => set((s) => ({ terrainTextureBlendModes: { ...s.terrainTextureBlendModes, [terrain]: mode } })),
  setTerrainTextureOpacity: (terrain, opacity) => set((s) => ({ terrainTextureOpacities: { ...s.terrainTextureOpacities, [terrain]: opacity } })),
  setTerrainTextureTintColor: (terrain, color) => set((s) => ({ terrainTextureTintColors: { ...s.terrainTextureTintColors, [terrain]: color } })),
  setTerrainTextureTintOpacity: (terrain, opacity) => set((s) => ({ terrainTextureTintOpacities: { ...s.terrainTextureTintOpacities, [terrain]: opacity } })),
  setTerrainTextureFile: (terrain, fileId) => set((s) => ({ terrainTextureFile: { ...s.terrainTextureFile, [terrain]: fileId } })),
  setTerrainTextureEnabled: (terrain, v) => set((s) => ({ terrainTextureEnabled: { ...s.terrainTextureEnabled, [terrain]: v } })),

  setTerrainBlobOverride: (key, override) => set((s) => {
    if (override === null) {
      const { [key]: _, ...rest } = s.terrainBlobOverrides
      return { terrainBlobOverrides: rest }
    }
    const merged = { ...s.terrainBlobOverrides[key], ...override }
    const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as BlobOverride
    if (Object.keys(cleaned).length === 0) {
      const { [key]: _, ...rest } = s.terrainBlobOverrides
      return { terrainBlobOverrides: rest }
    }
    return { terrainBlobOverrides: { ...s.terrainBlobOverrides, [key]: cleaned } }
  }),

  setTerrainTypeBlobStyle: (terrain, style) => set((s) => {
    if (style === null) {
      const { [terrain]: _, ...rest } = s.terrainTypeBlobStyles
      return { terrainTypeBlobStyles: rest }
    }
    return { terrainTypeBlobStyles: { ...s.terrainTypeBlobStyles, [terrain]: { ...s.terrainTypeBlobStyles[terrain], ...style } } }
  }),

  setTerrainRenderMode: (v) => set({ terrainRenderMode: v }),
  // setFieldFreq / setFieldAmp / setFieldOctaves / setFieldPersistence / setFieldWildness — detached

  setTerrainPaintMode: (v) => set({ terrainPaintMode: v, ...(v ? { roadPaintMode: false, railPaintMode: false, elevationPaintMode: false } : {}) }),
  setTerrainPaintBrush: (v) => set({ terrainPaintBrush: v }),
  setTerrainEdgePaintEnabled: (v) => set({ terrainEdgePaintEnabled: v }),
  setTerrainBackgroundPaintEnabled: (v) => set({ terrainBackgroundPaintEnabled: v }),
  overrideHexBackground: (q, r, terrain) => {
    const { generatedHexes } = get()
    const updated = generatedHexes.map((h) =>
      h.q === q && h.r === r ? { ...h, backgroundTerrain: terrain, manual_override: true } : h
    )
    set({ generatedHexes: updated })
  },

  paintEdgeBlob: (edgeKey, terrain) => set((s) => ({
    edgeBlobPainted: { ...s.edgeBlobPainted, [edgeKey]: terrain },
  })),
  eraseEdgeBlob: (edgeKey) => set((s) => {
    const { [edgeKey]: _, ...rest } = s.edgeBlobPainted
    return { edgeBlobPainted: rest }
  }),
  setEdgeBlobWidth: (v) => set({ edgeBlobWidth: v }),
  setEdgeBlobOverride: (key, override) => set((s) => {
    if (override === null) {
      const { [key]: _, ...rest } = s.edgeBlobOverrides
      return { edgeBlobOverrides: rest }
    }
    const merged = { ...s.edgeBlobOverrides[key], ...override }
    const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as BlobOverride
    if (Object.keys(cleaned).length === 0) {
      const { [key]: _, ...rest } = s.edgeBlobOverrides
      return { edgeBlobOverrides: rest }
    }
    return { edgeBlobOverrides: { ...s.edgeBlobOverrides, [key]: cleaned } }
  }),

  setWaterOverride: (key, override) => set((s) => {
    if (override === null) {
      const { [key]: _, ...rest } = s.waterOverrides
      return { waterOverrides: rest }
    }
    const merged = { ...s.waterOverrides[key], ...override }
    const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as BlobOverride
    if (Object.keys(cleaned).length === 0) {
      const { [key]: _, ...rest } = s.waterOverrides
      return { waterOverrides: rest }
    }
    return { waterOverrides: { ...s.waterOverrides, [key]: cleaned } }
  }),

  randomizeBlobSeed: (terrain) => set((s) => ({ blobSeeds: { ...s.blobSeeds, [terrain]: (Math.random() * 0x7fffffff) | 0 } })),

  setBlobEditMode: (v) => set({ blobEditMode: v, ...(!v ? { activeBlobEditId: null } : {}) }),
  setActiveBlobEditId: (id) => set({ activeBlobEditId: id }),
  setBlobHandleOverride: (ck, hk, offset) => set((s) => {
    if (offset === null) {
      const inner = { ...s.blobHandleOverrides[ck] }
      delete inner[hk]
      if (Object.keys(inner).length === 0) {
        const { [ck]: _, ...rest } = s.blobHandleOverrides
        return { blobHandleOverrides: rest }
      }
      return { blobHandleOverrides: { ...s.blobHandleOverrides, [ck]: inner } }
    }
    return { blobHandleOverrides: { ...s.blobHandleOverrides, [ck]: { ...s.blobHandleOverrides[ck], [hk]: offset } } }
  }),
  clearBlobHandleOverrides: (ck) => set((s) => {
    const { [ck]: _, ...rest } = s.blobHandleOverrides
    return { blobHandleOverrides: rest }
  }),

  addBlobMaskEdit: (edit) => set((s) => ({ blobMaskEdits: [...s.blobMaskEdits, edit] })),
  removeBlobMaskEdit: (id) => set((s) => ({ blobMaskEdits: s.blobMaskEdits.filter(e => e.id !== id) })),
  clearBlobMaskEdits: (terrain) => set((s) => ({
    blobMaskEdits: terrain ? s.blobMaskEdits.filter(e => e.terrain !== terrain) : [],
  })),
})
