import type { MapStore, ActiveTool, UrbanStyle, RoadEdge } from '../mapStore'
import { DEFAULT_URBAN_STYLE } from '../mapStore'
import { STYLE_PRESET_KEYS } from '../../lib/stylePreset'

export type UiSlice = {
  activePanel: 'terrain' | 'display' | 'features' | 'style' | 'highlights' | 'elevation'
  activeTool: ActiveTool
  urbanHexes: Array<{ q: number; r: number }>
  urbanStyle: UrbanStyle
  urbanPaintMode: 'paint' | 'erase' | null
  hexBorderMode: 'full' | 'stubs' | 'dashed' | 'none'
  hexBorderOpacity: number
  hexBorderColor: string
  hexBorderDifference: boolean
  hexNumbersEnabled: boolean
  hexNumberStartCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  hexNumberEdge: number
  hexNumberColor: string
  hexNumberFontScale: number
  terrainDisplacement: number
  terrainNoiseFrequency: number
  terrainNoiseSeed: number
  terrainNoiseOctaves: number
  illustratedStyle: boolean
  showPaperTexture: boolean
  paperTextureOpacity: number
  showPaperVignette: boolean
  woodsHexStyle: 'default' | 'blob'
  blobSize: number
  blobCount: number
  showBridges: boolean
  urbanDisplayMode: 'plain' | 'polygon' | 'buildings'
  urbanScale: number
  urbanVertexRatio: number
  urbanNoise: number
  urbanBuildingCount: number
  urbanBuildingSize: number
  mapBgColor: string
  mapBorderEnabled: boolean
  mapBorderColor: string
  mapBorderWidth: number
  clipToHexGrid: boolean
  excludedHexKeys: string[]
  disabledHexKeys: string[]
  autoDisabledOceanHexKeys: string[]
  setActivePanel: (panel: 'terrain' | 'display' | 'features' | 'style' | 'elevation') => void
  setActiveTool: (tool: ActiveTool) => void
  toggleUrbanHex: (q: number, r: number) => void
  setUrbanStyle: (style: Partial<UrbanStyle>) => void
  setUrbanPaintMode: (mode: 'paint' | 'erase' | null) => void
  setHexBorderMode: (v: 'full' | 'stubs' | 'dashed' | 'none') => void
  setHexBorderOpacity: (v: number) => void
  setHexBorderColor: (v: string) => void
  setHexBorderDifference: (v: boolean) => void
  setHexNumbersEnabled: (v: boolean) => void
  setHexNumberStartCorner: (v: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void
  setHexNumberEdge: (v: number) => void
  setHexNumberColor: (v: string) => void
  setHexNumberFontScale: (v: number) => void
  setTerrainDisplacement: (v: number) => void
  setTerrainNoiseFrequency: (v: number) => void
  setTerrainNoiseSeed: (v: number) => void
  setTerrainNoiseOctaves: (v: number) => void
  setIllustratedStyle: (v: boolean) => void
  setShowPaperTexture: (v: boolean) => void
  setPaperTextureOpacity: (v: number) => void
  setShowPaperVignette: (v: boolean) => void
  setWoodsHexStyle: (style: 'default' | 'blob') => void
  setBlobSize: (v: number) => void
  setBlobCount: (v: number) => void
  setShowBridges: (v: boolean) => void
  setUrbanDisplayMode: (mode: 'plain' | 'polygon' | 'buildings') => void
  setUrbanScale: (v: number) => void
  setUrbanVertexRatio: (v: number) => void
  setUrbanNoise: (v: number) => void
  setUrbanBuildingCount: (v: number) => void
  setUrbanBuildingSize: (v: number) => void
  setMapBgColor: (v: string) => void
  setMapBorderEnabled: (v: boolean) => void
  setMapBorderColor: (v: string) => void
  setMapBorderWidth: (v: number) => void
  setClipToHexGrid: (v: boolean) => void
  toggleExcludedHex: (key: string, mode: 'exclude' | 'include') => void
  resetExcludedHexes: () => void
  toggleDisabledHex: (key: string, mode: 'disable' | 'enable') => void
  resetDisabledHexes: () => void
  autoDisableOceanHexes: () => void
  setAutoDisabledOceanHexKeys: (keys: string[]) => void
  uiScale: 0.8 | 1.0 | 1.25
  setUiScale: (v: 0.8 | 1.0 | 1.25) => void
  expandMode: boolean
  setExpandMode: (v: boolean) => void
  expandFetchSteps: Record<string, 'loading' | 'done' | 'error'> | null
  setExpandFetchStep: (step: string, status: 'loading' | 'done' | 'error') => void
  clearExpandFetchSteps: () => void
  mapTitle: string
  setMapTitle: (v: string) => void
  mapStyle: 'standard' | 'historical_simple'
  setMapStyle: (v: 'standard' | 'historical_simple') => void
  styleSnapshots: Record<string, Record<string, unknown>>
  historicalIconParams: Record<string, { spacing: number; scale: number; rotRange: number }>
  setHistoricalIconParam: (terrain: string, key: 'spacing' | 'scale' | 'rotRange', value: number) => void
  applyMapPreset: (preset: 'default') => void
  saveProject: () => void
  restoreProject: (data: unknown) => void
}

const STYLE_INITIAL_DEFAULTS: Record<string, Record<string, unknown>> = {
  standard: {
    roadWiggleAmp: 0.20,
    roadWiggleFreq: 0.9,
    railWiggleAmp: 0,
  },
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createUiSlice = (set: Set, get: () => MapStore): UiSlice => ({
  activePanel: 'terrain',
  activeTool: { type: 'none' },
  urbanHexes: [],
  urbanStyle: { ...DEFAULT_URBAN_STYLE },
  urbanPaintMode: null,
  uiScale: 1.0,
  setUiScale: (v) => set({ uiScale: v }),
  expandMode: false,
  setExpandMode: (v) => set({ expandMode: v }),
  expandFetchSteps: null,
  setExpandFetchStep: (step, status) => set(s => ({
    expandFetchSteps: { ...(s.expandFetchSteps ?? {}), [step]: status }
  })),
  clearExpandFetchSteps: () => set({ expandFetchSteps: null }),
  mapTitle: '',
  setMapTitle: (v) => set({ mapTitle: v }),
  mapStyle: 'standard',
  styleSnapshots: {},
  historicalIconParams: {},
  hexBorderMode: 'full',
  hexBorderOpacity: 0.35,
  hexBorderColor: '#000000',
  hexBorderDifference: false,
  hexNumbersEnabled: false,
  hexNumberStartCorner: 'top-left',
  hexNumberEdge: 4,
  hexNumberColor: '#8a8a8a',
  hexNumberFontScale: 1.0,
  terrainDisplacement: 18,
  terrainNoiseFrequency: 6,
  terrainNoiseSeed: 2,
  terrainNoiseOctaves: 3,
  illustratedStyle: false,
  showPaperTexture: false,
  paperTextureOpacity: 0.35,
  showPaperVignette: false,
  woodsHexStyle: 'default',
  blobSize: 0.18,
  blobCount: 7,
  showBridges: false,
  urbanDisplayMode: 'polygon',
  urbanScale: 0.72,
  urbanVertexRatio: 0.75,
  urbanNoise: 0.12,
  urbanBuildingCount: 8,
  urbanBuildingSize: 0.12,
  mapBgColor: '#ffffff',
  mapBorderEnabled: false,
  mapBorderColor: '#000000',
  mapBorderWidth: 1.5,
  clipToHexGrid: false,
  excludedHexKeys: [],
  disabledHexKeys: [],
  autoDisabledOceanHexKeys: [],

  setActivePanel: (panel) => {
    get().setActiveTool({ type: 'none' })
    set({ activePanel: panel, settlementEditMode: false })
  },

  setActiveTool: (tool) => {
    const updates: Partial<MapStore> = { activeTool: tool }

    updates.terrainPaintMode = tool.type === 'terrain'
    if (tool.type === 'terrain') updates.terrainPaintBrush = tool.brush

    updates.elevationPaintMode = tool.type === 'elevation'
    if (tool.type === 'elevation') updates.elevationPaintBrush = tool.brush

    updates.roadPaintMode = tool.type === 'road'
    if (tool.type === 'road') {
      updates.roadPaintBrush = tool.tier
      updates.roadPaintEraser = tool.erasing
      updates.roadsDisplayMode = 'per_hex'
    } else {
      updates.roadPaintEraser = false
    }

    updates.railPaintMode = tool.type === 'rail'
    if (tool.type === 'rail') {
      updates.railPaintEraser = tool.erasing
      updates.railsDisplayMode = 'per_hex'
    } else {
      updates.railPaintEraser = false
    }

    updates.roadNodeEditMode = tool.type === 'node-edit'
    updates.riverNodeEditMode = tool.type === 'river-node-edit'
    updates.railNodeEditMode = tool.type === 'rail-node-edit'

    updates.roadSelectMode = tool.type === 'road-select'
    if (!updates.roadPaintMode && !updates.roadSelectMode) {
      updates.selectedRoadSegmentKeys = []
      updates.selectedRoadHopKey = null
    }

    updates.railSelectMode = tool.type === 'rail-select'
    if (!updates.railSelectMode) {
      updates.selectedRailSegmentKeys = []
      updates.selectedRailHopKey = null
    }

    updates.riverEditMode = tool.type === 'river-paint' || tool.type === 'river-select'
    if (tool.type === 'river-paint') updates.riverPaintTier = tool.tier
    updates.riverSelectMode = tool.type === 'river-select'
    if (!updates.riverEditMode) { updates.selectedSegmentKeys = []; updates.selectedHopKey = null }

    updates.highlightPaintMode = tool.type === 'highlight-paint'
    updates.highlightLineEraser = tool.type === 'highlight-erase' || tool.type === 'highlight-erase-any'
    if (tool.type === 'highlight-paint' || tool.type === 'highlight-erase') {
      updates.activeHighlightId = tool.id
    }
    if (tool.type === 'highlight-erase-any') {
      updates.activeHighlightId = null
    }

    updates.iconPlaceMode = tool.type === 'icon-place'
    updates.iconEraseMode = tool.type === 'icon-erase' || tool.type === 'icon-erase-any'
    if (tool.type === 'icon-place' || tool.type === 'icon-erase') {
      updates.activeIconOverlayId = tool.id
    }
    if (tool.type === 'icon-erase-any') {
      updates.activeIconOverlayId = null
    }

    if (tool.type === 'label-place' || tool.type === 'label-erase') {
      updates.activeLabelOverlayId = tool.id
    }
    if (tool.type !== 'label-place' && tool.type !== 'label-erase') {
      // only clear when switching away from label tools
      if (get().activeTool.type === 'label-place' || get().activeTool.type === 'label-erase') {
        updates.activeLabelOverlayId = null
      }
    }

    updates.urbanPaintMode = tool.type === 'urban' ? tool.mode : null

    updates.blobEditMode = tool.type === 'select'
    if (tool.type !== 'select') updates.activeBlobEditId = null

    set(updates as Partial<MapStore>)
  },

  toggleUrbanHex: (q, r) => {
    const { urbanHexes, urbanPaintMode } = get()
    if (urbanPaintMode === 'erase') {
      set({ urbanHexes: urbanHexes.filter(h => !(h.q === q && h.r === r)) })
    } else {
      if (urbanHexes.some(h => h.q === q && h.r === r)) return
      set({ urbanHexes: [...urbanHexes, { q, r }] })
    }
  },
  setUrbanStyle: (style) => set(s => ({ urbanStyle: { ...s.urbanStyle, ...style } })),
  setUrbanPaintMode: (mode) => set({ urbanPaintMode: mode }),

  setHexBorderMode: (v) => set({ hexBorderMode: v }),
  setHexBorderOpacity: (v) => set({ hexBorderOpacity: v }),
  setHexBorderColor: (v) => set({ hexBorderColor: v }),
  setHexBorderDifference: (v) => set({ hexBorderDifference: v }),
  setHexNumbersEnabled: (v) => set({ hexNumbersEnabled: v }),
  setHexNumberStartCorner: (v) => set({ hexNumberStartCorner: v }),
  setHexNumberEdge: (v) => set({ hexNumberEdge: v }),
  setHexNumberColor: (v) => set({ hexNumberColor: v }),
  setHexNumberFontScale: (v) => set({ hexNumberFontScale: v }),
  setTerrainDisplacement: (v) => set({ terrainDisplacement: v }),
  setTerrainNoiseFrequency: (v) => set({ terrainNoiseFrequency: v }),
  setTerrainNoiseSeed: (v) => set({ terrainNoiseSeed: v }),
  setTerrainNoiseOctaves: (v) => set({ terrainNoiseOctaves: v }),
  setIllustratedStyle: (v) => set({ illustratedStyle: v }),
  setShowPaperTexture: (v) => set({ showPaperTexture: v }),
  setPaperTextureOpacity: (v) => set({ paperTextureOpacity: v }),
  setShowPaperVignette: (v) => set({ showPaperVignette: v }),
  setWoodsHexStyle: (style) => set({ woodsHexStyle: style }),
  setBlobSize: (v) => set({ blobSize: v }),
  setBlobCount: (v) => set({ blobCount: v }),
  setShowBridges: (v) => set({ showBridges: v }),
  setUrbanDisplayMode: (mode) => set({ urbanDisplayMode: mode }),
  setUrbanScale: (v) => set({ urbanScale: v }),
  setUrbanVertexRatio: (v) => set({ urbanVertexRatio: v }),
  setUrbanNoise: (v) => set({ urbanNoise: v }),
  setUrbanBuildingCount: (v) => set({ urbanBuildingCount: v }),
  setUrbanBuildingSize: (v) => set({ urbanBuildingSize: v }),
  setMapBgColor: (v) => set({ mapBgColor: v }),
  setMapBorderEnabled: (v) => set({ mapBorderEnabled: v }),
  setMapBorderColor: (v) => set({ mapBorderColor: v }),
  setMapBorderWidth: (v) => set({ mapBorderWidth: v }),
  setClipToHexGrid: (v) => set({ clipToHexGrid: v }),
  toggleExcludedHex: (key, mode) => set(s => {
    const cur = s.excludedHexKeys
    if (mode === 'exclude') {
      return cur.includes(key) ? {} : { excludedHexKeys: [...cur, key] }
    } else {
      return { excludedHexKeys: cur.filter(k => k !== key) }
    }
  }),
  resetExcludedHexes: () => set({ excludedHexKeys: [] }),
  toggleDisabledHex: (key, mode) => set(s => {
    const cur = s.disabledHexKeys
    if (mode === 'disable') {
      return cur.includes(key) ? {} : { disabledHexKeys: [...cur, key] }
    } else {
      return { disabledHexKeys: cur.filter(k => k !== key) }
    }
  }),
  resetDisabledHexes: () => set({ disabledHexKeys: [], autoDisabledOceanHexKeys: [] }),
  autoDisableOceanHexes: () => set(s => {
    const hexes = s.generatedHexes
    if (!hexes || hexes.length === 0) return {}
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
    return { autoDisabledOceanHexKeys: keys }
  }),
  setAutoDisabledOceanHexKeys: (keys) => set({ autoDisabledOceanHexKeys: keys }),
  setMapStyle: (v) => set(s => {
    const current = s.mapStyle
    if (v === current) return {}
    const snapshot: Record<string, unknown> = {}
    for (const k of STYLE_PRESET_KEYS) {
      if (k === 'mapStyle') continue
      snapshot[k] = (s as Record<string, unknown>)[k]
    }
    const savedSnapshots = { ...s.styleSnapshots, [current]: snapshot }
    const existing = s.styleSnapshots[v]
    if (existing) {
      return { ...existing, mapStyle: v, styleSnapshots: savedSnapshots }
    }
    return { ...(STYLE_INITIAL_DEFAULTS[v] ?? {}), mapStyle: v, styleSnapshots: savedSnapshots }
  }),
  setHistoricalIconParam: (terrain, key, value) => set(s => ({
    historicalIconParams: {
      ...s.historicalIconParams,
      [terrain]: { ...(s.historicalIconParams[terrain] ?? {}), [key]: value },
    },
  })),
  applyMapPreset: (preset) => {
    const presets = {
      default: {
        woodsHexStyle: 'default' as const,
        terrainDisplacement: 18,
        terrainNoiseFrequency: 6,
        terrainNoiseOctaves: 3,
        terrainNoiseSeed: 2,
        riverWidthScale: 1.0,
      },
    }
    set(presets[preset])
  },

  saveProject: () => {
    const s = get()
    const snapshot = {
      version: 40,
      state: {
        step: s.step, paperSize: s.paperSize, orientation: s.orientation,
        pageGrid: s.pageGrid,
        hexSizeMm: s.hexSizeMm, hexOrientation: s.hexOrientation,
        marginMm: s.marginMm, hexEdgeMode: s.hexEdgeMode,
        generatedHexes: s.generatedHexes, generatedMetadata: s.generatedMetadata,
        terrainRules: s.terrainRules, disabledTerrains: Array.from(s.disabledTerrains),
        settlements: s.settlements, settlementsStatus: s.settlementsStatus,
        settlementsLimit: s.settlementsLimit, settlementsTypes: s.settlementsTypes,
        settlementTierThresholds: s.settlementTierThresholds, settlementsAutoPlace: s.settlementsAutoPlace,
        settlementTierStyles: s.settlementTierStyles,
        showSettlementLabels: s.showSettlementLabels,
        settlementLabelFont: s.settlementLabelFont,
        settlementLabelColor: s.settlementLabelColor,
        settlementLabelSizeScale: s.settlementLabelSizeScale,
        settlementLabelOverrides: s.settlementLabelOverrides,
        rawRoadWays: s.rawRoadWays, osmHexPaths: s.osmHexPaths,
        roadEdges: s.roadEdges, roadsDisplayMode: s.roadsDisplayMode,
        roadsVisibleTiers: s.roadsVisibleTiers, roadsStatus: s.roadsStatus,
        rawRailWays: s.rawRailWays, osmRailHexPaths: s.osmRailHexPaths,
        railEdges: s.railEdges, railsFetchTypes: s.railsFetchTypes, railsStatus: s.railsStatus,
        osmRiverWays: s.osmRiverWays, appliedOsmRiverIndices: s.appliedOsmRiverIndices,
        riversOsmStatus: s.riversOsmStatus,
        railStyle: s.railStyle, railControlOverrides: s.railControlOverrides,
        railSnapBindings: s.railSnapBindings, railWiggleAmp: s.railWiggleAmp,
        railWiggleFreq: s.railWiggleFreq, railSmoothing: s.railSmoothing,
        railChainOverrides: s.railChainOverrides, railSegmentProps: s.railSegmentProps,
        railHopProps: s.railHopProps, railPathSmoothing: s.railPathSmoothing,
        railGeomOverride: s.railGeomOverride,
        riverEdges: s.riverEdges,
        riverSegmentProps: s.riverSegmentProps,
        riverHopProps: s.riverHopProps,
        roadSegmentProps: s.roadSegmentProps, roadHopProps: s.roadHopProps,
        roadChainOverrides: s.roadChainOverrides, roadControlOverrides: s.roadControlOverrides,
        roadSnapBindings: s.roadSnapBindings, roadPathSmoothing: s.roadPathSmoothing,
        roadDensityMinChain: s.roadDensityMinChain, roadTierGeometry: s.roadTierGeometry,
        riverStyle: s.riverStyle,
        riverChainOverrides: s.riverChainOverrides,
        riverWiggleAmp: s.riverWiggleAmp, riverWiggleFreq: s.riverWiggleFreq,
        riverTierStyles: s.riverTierStyles,
        riverBlobCutEnabled: s.riverBlobCutEnabled, riverBlobCutWidth: s.riverBlobCutWidth, riverBlobCutRoughness: s.riverBlobCutRoughness,
        roadBlobCutEnabled: s.roadBlobCutEnabled, roadBlobCutWidth: s.roadBlobCutWidth, roadBlobCutRoughness: s.roadBlobCutRoughness,
        riverSmoothing: s.riverSmoothing, riverWidthScale: s.riverWidthScale,
        riverPathSmoothing: s.riverPathSmoothing,
        showRiverLabels: s.showRiverLabels, riverLabelColor: s.riverLabelColor,
        heightmapUrl: s.heightmapUrl,
        elevationStatus: s.elevationStatus,
        classificationParams: s.classificationParams,
        mapStyle: s.mapStyle,
        activePanel: s.activePanel, hexBorderMode: s.hexBorderMode,
        hexBorderOpacity: s.hexBorderOpacity, hexBorderColor: s.hexBorderColor, hexBorderDifference: s.hexBorderDifference,
        terrainDisplacement: s.terrainDisplacement, terrainNoiseFrequency: s.terrainNoiseFrequency,
        terrainNoiseSeed: s.terrainNoiseSeed, terrainNoiseOctaves: s.terrainNoiseOctaves,
        illustratedStyle: s.illustratedStyle,
        roadWiggleAmp: s.roadWiggleAmp, roadWiggleFreq: s.roadWiggleFreq, roadSmoothing: s.roadSmoothing,
        roadTierStyles: s.roadTierStyles,
        woodsHexStyle: s.woodsHexStyle, blobSize: s.blobSize, blobCount: s.blobCount,
        showBridges: s.showBridges, bridgesEnabled: s.bridgesEnabled,
        bridgeStyle: s.bridgeStyle, bridgeTiers: s.bridgeTiers, bridgeOverrides: s.bridgeOverrides,
        urbanHexes: s.urbanHexes, urbanStyle: s.urbanStyle,
        urbanDisplayMode: s.urbanDisplayMode, urbanScale: s.urbanScale,
        urbanVertexRatio: s.urbanVertexRatio, urbanNoise: s.urbanNoise,
        urbanBuildingCount: s.urbanBuildingCount, urbanBuildingSize: s.urbanBuildingSize,
        terrainEdgePaintEnabled: s.terrainEdgePaintEnabled,
        customTerrains: s.customTerrains,
        edgeBlobPainted: s.edgeBlobPainted, edgeBlobWidth: s.edgeBlobWidth,
        edgeBlobOverrides: s.edgeBlobOverrides,
        slopeEdges: s.slopeEdges, slopeStyle: s.slopeStyle, slopeSmoothing: s.slopeSmoothing,
        slopeTickSpacing: s.slopeTickSpacing, slopeTickLength: s.slopeTickLength,
        elevationHachureEnabled: s.elevationHachureEnabled,
        elevationShadowEnabled: s.elevationShadowEnabled,
        elevationShadowOx: s.elevationShadowOx, elevationShadowOy: s.elevationShadowOy,
        elevationShadowBl: s.elevationShadowBl, elevationShadowOp: s.elevationShadowOp,
        elevationShadowPs: s.elevationShadowPs, elevationShadowColor: s.elevationShadowColor,
        terrainBlobOverrides: s.terrainBlobOverrides, terrainTypeBlobStyles: s.terrainTypeBlobStyles,
        terrainBlobSmooth: s.terrainBlobSmooth, terrainBlobOffset: s.terrainBlobOffset,
        terrainBlobBump: s.terrainBlobBump, terrainBlobSweepFreq: s.terrainBlobSweepFreq,
        terrainBlobLobeFreq: s.terrainBlobLobeFreq, terrainBlobLobeAmp: s.terrainBlobLobeAmp,
        terrainBlobLobeThreshold: s.terrainBlobLobeThreshold, terrainBlobLobeDirection: s.terrainBlobLobeDirection,
        terrainBlobTopoStyle: s.terrainBlobTopoStyle,
        terrainBlobSplatDensity: s.terrainBlobSplatDensity,
        terrainBlobSplatSize: s.terrainBlobSplatSize,
        terrainBlobOutlineEnabled: s.terrainBlobOutlineEnabled,
        terrainBlobOutlineColor: s.terrainBlobOutlineColor,
        terrainBlobOutlineWidth: s.terrainBlobOutlineWidth,
        terrainBlobEffect: s.terrainBlobEffect,
        realisticCoastline: s.realisticCoastline, beachStrip: s.beachStrip,
        beachColor: s.beachColor, beachWidth: s.beachWidth,
        hillsColor: s.hillsColor, mountainsColor: s.mountainsColor,
        reliefShadingOpacity: s.reliefShadingOpacity,
        coastlineDPEpsilon: s.coastlineDPEpsilon, coastlineChaikinPasses: s.coastlineChaikinPasses,
        terrainColors: s.terrainColors, terrainTextureScales: s.terrainTextureScales,
        terrainTextureBlendModes: s.terrainTextureBlendModes,
        terrainTextureOpacities: s.terrainTextureOpacities,
        terrainTextureTintColors: s.terrainTextureTintColors,
        terrainTextureTintOpacities: s.terrainTextureTintOpacities,
        terrainTextureFile: s.terrainTextureFile,
        terrainTextureEnabled: s.terrainTextureEnabled,
        terrainRenderMode: s.terrainRenderMode,
        blobSeeds: s.blobSeeds, blobHandleOverrides: s.blobHandleOverrides,
        fieldFreq: s.fieldFreq, fieldAmp: s.fieldAmp, fieldOctaves: s.fieldOctaves,
        fieldPersistence: s.fieldPersistence, fieldWildness: s.fieldWildness,
        waterBlobSmooth: s.waterBlobSmooth, waterBlobOffset: s.waterBlobOffset,
        waterBlobBump: s.waterBlobBump, waterBlobSweepFreq: s.waterBlobSweepFreq,
        waterBlobLobeFreq: s.waterBlobLobeFreq, waterBlobLobeAmp: s.waterBlobLobeAmp,
        waterBlobLobeThreshold: s.waterBlobLobeThreshold, waterBlobLobeDirection: s.waterBlobLobeDirection,
        waterOverrides: s.waterOverrides,
        showPaperTexture: s.showPaperTexture, paperTextureOpacity: s.paperTextureOpacity,
        showPaperVignette: s.showPaperVignette,
        mapBgColor: s.mapBgColor, mapBorderEnabled: s.mapBorderEnabled,
        mapBorderColor: s.mapBorderColor, mapBorderWidth: s.mapBorderWidth,
        clipToHexGrid: s.clipToHexGrid, excludedHexKeys: s.excludedHexKeys,
        hexNumbersEnabled: s.hexNumbersEnabled, hexNumberStartCorner: s.hexNumberStartCorner,
        hexNumberEdge: s.hexNumberEdge, hexNumberColor: s.hexNumberColor,
        hexNumberFontScale: s.hexNumberFontScale,
        megaHexEnabled: s.megaHexEnabled, megaHexRadius: s.megaHexRadius,
        megaHexColor: s.megaHexColor, megaHexOpacity: s.megaHexOpacity,
        megaHexLineWidth: s.megaHexLineWidth, megaHexOriginQ: s.megaHexOriginQ,
        megaHexOriginR: s.megaHexOriginR,
        highlights: s.highlights, highlightedHexes: s.highlightedHexes,
        highlightLines: s.highlightLines, highlightEdgePaths: s.highlightEdgePaths,
        iconOverlays: s.iconOverlays, placedIcons: s.placedIcons,
        labelOverlays: s.labelOverlays, placedLabels: s.placedLabels,
        styleSnapshots: s.styleSnapshots,
      },
    }
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'map.ig2'
    a.click()
    URL.revokeObjectURL(url)
  },

  restoreProject: (data: unknown) => {
    try {
      const parsed = data as { state?: Record<string, unknown>; version?: number }
      const fromVersion = typeof parsed.version === 'number' ? parsed.version : 0
      const raw = { ...(parsed.state ?? (parsed as Record<string, unknown>)) }
      const migrated = migratePersisted(raw, fromVersion) as unknown as MapStore
      rehydrateState(migrated)
      set({
        ...(migrated as Partial<MapStore>),
        undoStack: [], redoStack: [],
        // These are not saved — always reset so old map state doesn't bleed in
        disabledHexKeys: [],
        autoDisabledOceanHexKeys: [],
        worldcoverImageUrl: null,
        showWorldcoverOverlay: false,
        expandMode: false,
      })
    } catch (e) {
      console.error('Failed to restore project:', e)
    }
  },
})

// These are imported by mapStore.ts too — kept here so uiSlice owns persist logic
export function migratePersisted(persisted: unknown, fromVersion: number): Record<string, unknown> {
  const s = persisted as Record<string, unknown>
  if (fromVersion < 2) {
    delete s.riverChains; delete s.riversDisplayMode; delete s.riversStatus
    delete s.riverFeatures; delete s.namedRivers
    if (!s.riverEdges) s.riverEdges = []
  }
  if (fromVersion < 3) {
    delete s.selectedSegmentKey
    s.selectedSegmentKeys = []
  }
  if (fromVersion < 4) {
    if (!s.riverStyle) s.riverStyle = { color: '#5888b0', strokeEnabled: false, strokeColor: '#2a4a6a', strokeWidth: 0.4 }
    delete (s as Record<string, unknown>).canalStyle
    delete (s as Record<string, unknown>).canalEdges
    delete (s as Record<string, unknown>).canalSegmentProps
    delete (s as Record<string, unknown>).canalWidthScale
  }
  if (fromVersion < 5) {
    // if (s.riverFlowStyle === undefined) s.riverFlowStyle = 1  // detached
  }
  if (fromVersion < 7) {
    delete s.riverMeander; delete s.riverMeanderSeed
    delete s.riverStraighten; delete s.riverPathStraighten; delete s.riverWiggleScale
  }
  if (fromVersion < 10) {
    delete s.riverCurveSteps; delete s.riverWobble; delete s.riverDetail
    const tiers = s.settlementTierStyles as Record<string, Record<string, unknown>> | undefined
    if (tiers) {
      for (const ts of Object.values(tiers)) {
        if (ts.buildingAlgorithm === undefined) ts.buildingAlgorithm = 'v2'
        if (ts.buildingV2Size === undefined) ts.buildingV2Size = 2
        if (ts.buildingV2Spacing === undefined) ts.buildingV2Spacing = 1
        if (ts.buildingV2MergeChance === undefined) ts.buildingV2MergeChance = 0.3
      }
    }
  }
  if (fromVersion < 11) {
    const tiers = s.settlementTierStyles as Record<string, Record<string, unknown>> | undefined
    if (tiers) {
      for (const ts of Object.values(tiers)) {
        if (ts.buildingV2DepthVariation === undefined) ts.buildingV2DepthVariation = 0.5
      }
    }
  }
  if (fromVersion < 12) {
    const tiers = s.settlementTierStyles as Record<string, Record<string, unknown>> | undefined
    if (tiers) {
      for (const ts of Object.values(tiers)) {
        if (ts.buildingV2LengthVariation === undefined) ts.buildingV2LengthVariation = 0.5
      }
    }
  }
  if (fromVersion < 13) {
    const tiers = s.settlementTierStyles as Record<string, Record<string, unknown>> | undefined
    if (tiers) {
      for (const ts of Object.values(tiers)) {
        if (ts.buildingV2Rows === undefined) ts.buildingV2Rows = 2
        if (ts.buildingV2RowGap === undefined) ts.buildingV2RowGap = 1
        if (ts.buildingV2DensityFalloff === undefined) ts.buildingV2DensityFalloff = 0.5
      }
    }
  }
  if (fromVersion < 15) {
    if (!s.terrainTypeBlobStyles) s.terrainTypeBlobStyles = {}
  }
  if (fromVersion < 16) {
    if (s.blankMap === undefined) s.blankMap = false
  }
  if (fromVersion < 17) {
    if (s.hexNumbersEnabled === undefined) s.hexNumbersEnabled = false
    if (s.hexNumberStartCorner === undefined) s.hexNumberStartCorner = 'top-left'
    if (s.hexNumberEdge === undefined) s.hexNumberEdge = 4
    if (s.hexNumberColor === undefined) s.hexNumberColor = '#8a8a8a'
    if (s.hexNumberFontScale === undefined) s.hexNumberFontScale = 1.0
  }
  if (fromVersion < 18) {
    if (s.roadDensityMinChain === undefined) s.roadDensityMinChain = 1
  }
  if (fromVersion < 21) {
    delete s.railsDisplayMode
    const t = s.osmSpotlightTiers as boolean[] | undefined
    if (t && t.length === 3) (s.osmSpotlightTiers as boolean[]).push(true)
  }
  if (fromVersion < 22) {
    if (!s.iconOverlays) s.iconOverlays = []
    if (!s.placedIcons) s.placedIcons = {}
  }
  if (fromVersion < 23) {
    const validPatterns = new Set(['none', 'dotted', 'dashed', 'hatched'])
    const highlights = s.highlights as Array<Record<string, unknown>> | undefined
    if (highlights) {
      for (const h of highlights) {
        if (!validPatterns.has(h.linePattern as string)) h.linePattern = 'none'
      }
    }
  }
  if (fromVersion < 24) {
    const highlights = s.highlights as Array<Record<string, unknown>> | undefined
    if (highlights) {
      for (const h of highlights) {
        if (h.linePattern === 'hatched') h.linePattern = 'none'
      }
    }
  }
  if (fromVersion < 25) {
    const highlights = s.highlights as Array<Record<string, unknown>> | undefined
    if (highlights) {
      for (const h of highlights) {
        if (!h.fillPattern) h.fillPattern = 'none'
      }
    }
  }
  if (fromVersion < 26) {
    const highlights = s.highlights as Array<Record<string, unknown>> | undefined
    if (highlights) {
      for (const h of highlights) {
        if (h.fillPatternSpacing == null) h.fillPatternSpacing = h.patternSpacing ?? 1
      }
    }
  }
  if (fromVersion < 27) {
    if (s.mapBgColor === undefined) s.mapBgColor = '#ffffff'
    if (s.mapBorderEnabled === undefined) s.mapBorderEnabled = false
    if (s.mapBorderColor === undefined) s.mapBorderColor = '#000000'
    if (s.mapBorderWidth === undefined) s.mapBorderWidth = 1.5
    if (s.clipToHexGrid === undefined) s.clipToHexGrid = false
    if (s.excludedHexKeys === undefined) s.excludedHexKeys = []
  }
  if (fromVersion < 28) {
    if (s.riverPathSmoothing === undefined) s.riverPathSmoothing = 0
  }
  if (fromVersion < 29) {
    if (s.bridgesEnabled === undefined) s.bridgesEnabled = true
    if (s.bridgeStyle === undefined) s.bridgeStyle = 'plank'
    if (!s.bridgeTiers) s.bridgeTiers = [
      { id: 'bt-0', label: 'Major', color: '#e8c060' },
      { id: 'bt-1', label: 'Minor', color: '#c0b090' },
    ]
    if (!s.bridgeOverrides) s.bridgeOverrides = {}
  }
  if (fromVersion < 30) {
    if (s.megaHexEnabled === undefined) s.megaHexEnabled = false
    if (s.megaHexRadius === undefined) s.megaHexRadius = 1
    if (s.megaHexColor === undefined) s.megaHexColor = '#cc4444'
    if (s.megaHexOpacity === undefined) s.megaHexOpacity = 0.8
    if (s.megaHexLineWidth === undefined) s.megaHexLineWidth = 2
    if (s.megaHexOriginQ === undefined) s.megaHexOriginQ = 0
    if (s.megaHexOriginR === undefined) s.megaHexOriginR = 0
  }
  if (fromVersion < 31) {
    if (!s.roadTierGeometry) s.roadTierGeometry = [null, null, null]
    if (s.railGeomOverride === undefined) s.railGeomOverride = null
    if (s.railPathSmoothing === undefined) s.railPathSmoothing = 0
  }
  if (fromVersion < 32) {
    if (!s.edgeBlobPainted) s.edgeBlobPainted = {}
    if (!s.edgeBlobOverrides) s.edgeBlobOverrides = {}
    if (s.edgeBlobWidth === undefined) s.edgeBlobWidth = 0.25
    // Drop obsolete edge blob shape fields (now inherited from terrain blob params)
    delete s.edgeBlobSmooth; delete s.edgeBlobOffset; delete s.edgeBlobBump
    delete s.edgeBlobSweepFreq; delete s.edgeBlobLobeFreq; delete s.edgeBlobLobeAmp
    delete s.edgeBlobLobeThreshold; delete s.edgeBlobLobeDirection
  }
  if (fromVersion < 33) {
    if (s.terrainEdgePaintEnabled === undefined) s.terrainEdgePaintEnabled = false
  }
  if (fromVersion < 34) {
    // areas state removed in v69
  }
  if (fromVersion < 36) {
    s.bridgeTiers = []
    s.bridgeOverrides = {}
  }
  if (fromVersion < 37) {
    const tiers = s.roadTierStyles as Array<Record<string, unknown>> | undefined
    if (tiers) {
      for (const t of tiers) {
        if (t.caseDash === undefined) t.caseDash = 'solid'
        if (t.fillDash === undefined) t.fillDash = 'solid'
      }
    }
  }
  if (fromVersion < 38) {
    const hexes = s.generatedHexes as Array<Record<string, unknown>> | undefined
    if (hexes) {
      for (const h of hexes) {
        delete h.elevation_m
        delete h.elevation_relief_m
        h.elevation_avg_m = null
        h.elevation_median_m = null
        h.elevation_max_m = null
        h.elevation_min_m = null
        h.elevation_range_m = null
      }
    }
    s.elevationStatus = 'idle'
  }
  if (fromVersion < 39) {
    const hexes = s.generatedHexes as Array<Record<string, unknown>> | undefined
    if (hexes) {
      for (const h of hexes) {
        delete h.elevation_class
        delete h.elevation_manual_override
      }
    }
    delete s.elevationThresholds
    delete s.showReliefHeatmap
    delete s.showElevHeatmap
    delete s.elevationStyle
    delete s.contourInterval
    delete s.elevationPaintMode
    delete s.elevationPaintBrush
  }
  if (fromVersion < 40) {
    const hexes = s.generatedHexes as Array<Record<string, unknown>> | undefined
    if (hexes) {
      for (const h of hexes) {
        if (h.elevation_class === undefined) h.elevation_class = null
      }
    }
    if (!s.classificationParams) {
      s.classificationParams = { mountainsPct: 15, hillsPct: 25, mountainsFloorM: 100, hillsFloorM: 40 }
    }
  }
  if (fromVersion < 41) {
    const p = s.classificationParams as Record<string, unknown> | undefined
    if (p) {
      if (p.mountainsMedianPct === undefined) p.mountainsMedianPct = 20
      if (p.hillsMedianPct === undefined) p.hillsMedianPct = 20
      if (p.mountainsMedianFloorM === undefined) p.mountainsMedianFloorM = 800
      if (p.hillsMedianFloorM === undefined) p.hillsMedianFloorM = 200
    }
  }
  if (fromVersion < 42) {
    const p = s.classificationParams as Record<string, unknown> | undefined
    if (p) {
      if (p.rangeFloorM === undefined) p.rangeFloorM = p.hillsFloorM ?? 50
      if (p.medianFloorM === undefined) p.medianFloorM = p.hillsMedianFloorM ?? 300
      delete p.mountainsFloorM
      delete p.hillsFloorM
      delete p.mountainsMedianPct
      delete p.hillsMedianPct
      delete p.mountainsMedianFloorM
      delete p.hillsMedianFloorM
    }
  }
  if (fromVersion < 43) {
    if (!s.mapStyle) s.mapStyle = 'standard'
    if ((s.mapStyle as string) === 'basic') s.mapStyle = 'standard'
    const hexes = s.generatedHexes as Array<Record<string, unknown>> | undefined
    if (hexes) {
      for (const h of hexes) {
        if (h.elevation_manual_override === undefined) h.elevation_manual_override = false
      }
    }
  }
  if (fromVersion < 44) {
    if (!s.dataSource) s.dataSource = 'osm'
  }
  if (fromVersion < 45) {
    const tiers = s.roadTierStyles as Array<Record<string, unknown>> | undefined
    if (tiers) {
      for (const t of tiers) {
        if (t.roughness === undefined) t.roughness = 0.3
        if (t.bowing === undefined) t.bowing = 0.5
      }
    }
  }

  if (s.hexBorderMode === 'dots') s.hexBorderMode = 'full'
  if (fromVersion < 47) {
    if (!s.styleSnapshots) s.styleSnapshots = {}
  }
  if (fromVersion < 48) {
    s.coastlineDPEpsilon = 1
    s.coastlineChaikinPasses = 2
    s.coastlineCatmullSteps = 1
  }
  if (fromVersion < 49) {
    delete s.coastlineV2
    delete s.coastlineV3
  }
  if (fromVersion < 50) {
    if (!s.customTerrains) s.customTerrains = []
  }
  if (fromVersion < 51) {
    if (!s.disabledHexKeys) s.disabledHexKeys = []
  }
  if (fromVersion < 52) {
    if (!s.autoDisabledOceanHexKeys) s.autoDisabledOceanHexKeys = []
  }
  if (fromVersion < 53) {
    if (s.hillsColor === undefined) s.hillsColor = '#c8b87a'
    if (s.mountainsColor === undefined) s.mountainsColor = '#9a9080'
    if (s.reliefShadingOpacity === undefined) s.reliefShadingOpacity = 0.45
  }
  if (fromVersion < 54) {
    if (!s.pageGrid) {
      const mapMode = s.mapMode as string | undefined
      const diptychJoin = s.diptychJoin as string | undefined
      const orientation = s.orientation as string | undefined
      if (mapMode === 'diptych') {
        const isPortrait = orientation === 'portrait'
        if (diptychJoin === 'long') {
          s.pageGrid = isPortrait ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 }
        } else {
          s.pageGrid = isPortrait ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 }
        }
      } else {
        s.pageGrid = { cols: 1, rows: 1 }
      }
    }
  }
  if (fromVersion < 55) {
    const g = s.pageGrid as unknown as { cols?: number; rows?: number; colWidths?: number[]; rowHeights?: number[] }
    if (g && 'cols' in g && !Array.isArray(g.colWidths)) {
      const paperSize = (s.paperSize as string) ?? 'A3'
      const orientation = (s.orientation as string) ?? 'landscape'
      const PAPER_MM: Record<string, [number, number]> = {
        A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841],
      }
      const [sh, ln] = PAPER_MM[paperSize] ?? [297, 420]
      const [pw, ph] = orientation === 'landscape' ? [ln, sh] : [sh, ln]
      const cols = g.cols ?? 1
      const rows = g.rows ?? 1
      s.pageGrid = { colWidths: Array(cols).fill(pw), rowHeights: Array(rows).fill(ph) }
    }
  }
  if (fromVersion < 59) {
    if (!s.hillshadeDisabledTerrains) s.hillshadeDisabledTerrains = []
    if (!s.hillshadeDisabledElevClasses) s.hillshadeDisabledElevClasses = []
    if (!s.contourDisabledTerrains) s.contourDisabledTerrains = []
    if (!s.contourDisabledElevClasses) s.contourDisabledElevClasses = []
  }
  if (fromVersion < 60) {
    if (s.uiScale === undefined) s.uiScale = 1.0
  }
  if (fromVersion < 61) {
    delete s.settlementLabelFont
    delete s.settlementLabelColor
    delete s.settlementLabelSizeScale
    if (s.labelPresetId === undefined) s.labelPresetId = 'ibm_hybrid'
    if (s.labelOverrides === undefined) s.labelOverrides = {}
  }
  if (fromVersion < 62) {
    if (s.labelOffsets === undefined) s.labelOffsets = {}
  }
  if (fromVersion < 78) {
    // labelOffsets semantics changed: offsets are now relative to icon centre (cx, cy)
    // rather than the auto-placer's best candidate. Clear stale values.
    s.labelOffsets = {}
  }
  if (fromVersion < 65) {
    // backgroundTerrain added to GeneratedHex — no migration needed,
    // existing hexes get undefined (no background) which is correct
  }
if (fromVersion < 64) {
    if (s.roadCenterPull === undefined) s.roadCenterPull = 0
    if (Array.isArray(s.roadTierGeometry)) {
      for (const g of s.roadTierGeometry as Array<Record<string, unknown> | null>) {
        if (g && g.centerPull === undefined) g.centerPull = 0
      }
    }
  }
  if (fromVersion < 70) {
    if (s.hillshadeMode === undefined) s.hillshadeMode = 'smooth'
  }
  if (fromVersion < 71) {
    // Unified sea + lake → water terrain type
    const tc = s.terrainColors as Record<string, unknown> | undefined
    if (tc && tc.sea !== undefined && tc.water === undefined) {
      tc.water = tc.sea
      delete tc.sea
    }
    const hexes = s.generatedHexes as Array<Record<string, unknown>> | undefined
    if (hexes) {
      for (const h of hexes) {
        if (h.terrain === 'sea' || h.isLake) h.terrain = 'water'
        delete h.isLake
        delete h.lakeManualOverride
      }
    }
    // Rename lakeBlob* → waterBlob*
    if (s.lakeBlobSmooth !== undefined) { s.waterBlobSmooth = s.lakeBlobSmooth; delete s.lakeBlobSmooth }
    if (s.lakeBlobOffset !== undefined) { s.waterBlobOffset = s.lakeBlobOffset; delete s.lakeBlobOffset }
    if (s.lakeBlobBump !== undefined) { s.waterBlobBump = s.lakeBlobBump; delete s.lakeBlobBump }
    if (s.lakeBlobSweepFreq !== undefined) { s.waterBlobSweepFreq = s.lakeBlobSweepFreq; delete s.lakeBlobSweepFreq }
    if (s.lakeBlobLobeFreq !== undefined) { s.waterBlobLobeFreq = s.lakeBlobLobeFreq; delete s.lakeBlobLobeFreq }
    if (s.lakeBlobLobeAmp !== undefined) { s.waterBlobLobeAmp = s.lakeBlobLobeAmp; delete s.lakeBlobLobeAmp }
    if (s.lakeBlobLobeThreshold !== undefined) { s.waterBlobLobeThreshold = s.lakeBlobLobeThreshold; delete s.lakeBlobLobeThreshold }
    if (s.lakeBlobLobeDirection !== undefined) { s.waterBlobLobeDirection = s.lakeBlobLobeDirection; delete s.lakeBlobLobeDirection }
    if (s.lakeOverrides !== undefined) { s.waterOverrides = s.lakeOverrides; delete s.lakeOverrides }
    delete s.autoLakesEnabled
    delete s.lakeSensitivity
    delete s.lakePaintMode
  }
  if (fromVersion < 72) {
    // thresholds → terrainRules: migrate old per-terrain thresholds into new rules model
    delete s.thresholds
    if (!s.terrainRules) {
      // Import done lazily to avoid circular TDZ at module init
      const { DEFAULT_TERRAIN_RULES } = require('../mapStore')
      s.terrainRules = { ...DEFAULT_TERRAIN_RULES }
    }
    // Coverage was string-keyed before; clear it so hexes reclassify on next load
    const hexes = s.generatedHexes as Array<Record<string, unknown>> | undefined
    if (hexes) {
      for (const h of hexes) {
        if (h.coverage && typeof h.coverage === 'object') {
          const cov = h.coverage as Record<string, unknown>
          const hasStringKeys = Object.keys(cov).some(k => isNaN(Number(k)))
          if (hasStringKeys) h.coverage = {}
        }
      }
    }
  }
  if (fromVersion < 73) {
    delete s.waterBlobSmooth; delete s.waterBlobOffset; delete s.waterBlobBump
    delete s.waterBlobSweepFreq; delete s.waterBlobLobeFreq; delete s.waterBlobLobeAmp
    delete s.waterBlobLobeThreshold; delete s.waterBlobLobeDirection
  }
  if (fromVersion < 74) {
    const DEFAULT_FX = {
      glowEnabled: false, glowColor: 'rgba(0,0,0,0.25)', glowBlur: 6, glowSpread: 3,
      outlineEnabled: false, outlineColor: '#2a4a6a', outlineWidth: 2, outlineDash: 'solid', fillDash: 'solid',
    }
    // Migrate riverStyle: old { strokeEnabled, strokeColor, strokeWidth } → { effect }
    const rs = s.riverStyle as Record<string, unknown> | undefined
    if (rs && rs.strokeEnabled !== undefined) {
      rs.effect = { ...DEFAULT_FX, outlineEnabled: rs.strokeEnabled, outlineColor: rs.strokeColor ?? '#2a4a6a', outlineWidth: typeof rs.strokeWidth === 'number' ? rs.strokeWidth * 5 : 2 }
      delete rs.strokeEnabled; delete rs.strokeColor; delete rs.strokeWidth
    } else if (rs && !rs.effect) {
      rs.effect = { ...DEFAULT_FX }
    }
    // Migrate roadTierStyles: add effect field if missing
    const tiers = s.roadTierStyles as Array<Record<string, unknown>> | undefined
    if (tiers) {
      for (const t of tiers) {
        if (!t.effect) t.effect = { ...DEFAULT_FX }
      }
    }
    // terrainBlobEffect
    if (!s.terrainBlobEffect) s.terrainBlobEffect = { ...DEFAULT_FX }
  }
  if (fromVersion < 75) {
    const DEFAULT_FX = {
      glowEnabled: false, glowColor: 'rgba(0,0,0,0.25)', glowBlur: 6, glowSpread: 3,
      outlineEnabled: false, outlineColor: '#2a4a6a', outlineWidth: 2, outlineDash: 'solid', fillDash: 'solid',
    }
    const WATER_COLOR = '#3a6898'
    if (!s.riverTierStyles) {
      const widthScale = typeof s.riverWidthScale === 'number' ? s.riverWidthScale : 1.0
      // Migrate old single riverStyle → tier 1 (River), tiers 0 and 2 use defaults
      const oldColor = (s.riverStyle as Record<string, unknown> | undefined)?.color as string ?? WATER_COLOR
      s.riverTierStyles = [
        { label: 'Major River', color: oldColor, widthScale: widthScale * 1.5, visible: true, effect: { ...DEFAULT_FX } },
        { label: 'River',       color: oldColor, widthScale: widthScale * 1.0, visible: true, effect: { ...DEFAULT_FX } },
        { label: 'Stream',      color: '#5878a0', widthScale: widthScale * 0.55, visible: true, effect: { ...DEFAULT_FX } },
      ]
    }
    // Tag existing riverEdges with tier 1 (River) so they keep rendering
    const edges = s.riverEdges as Array<Record<string, unknown>> | undefined
    if (edges) {
      for (const e of edges) {
        if (e.tier === undefined) e.tier = 1
      }
    }
  }
  if (fromVersion < 76) {
    // no-op — superseded by v77
  }
  if (fromVersion < 77) {
    // Clear per-tier shape overrides that v76 seeded (they were just copies of
    // global values). Shape is now global-by-default with optional per-tier override.
    const tiers = s.riverTierStyles as Array<Record<string, unknown>> | undefined
    if (tiers) {
      for (const t of tiers) {
        delete t.wiggleAmp; delete t.wiggleFreq
        delete t.smoothing; delete t.pathSmoothing
      }
    }
  }
  if (fromVersion < 81) {
    if (s.riverBlobCutEnabled === undefined) s.riverBlobCutEnabled = false
    if (s.riverBlobCutWidth === undefined) s.riverBlobCutWidth = 0.5
  }
  if (fromVersion < 82) {
    if (s.terrainBlobSplatDensity === undefined) s.terrainBlobSplatDensity = 0
    if (s.terrainBlobSplatSize === undefined) s.terrainBlobSplatSize = 0.3
  }
  if (fromVersion < 86) {
    if (s.roadBlobCutEnabled === undefined) s.roadBlobCutEnabled = false
    if (s.roadBlobCutWidth === undefined) s.roadBlobCutWidth = 0.3
  }
  if (fromVersion < 87) {
    // variance/freqScale superseded by roughness in v88 — no-op
  }
  if (fromVersion < 88) {
    if (s.riverBlobCutRoughness === undefined) s.riverBlobCutRoughness = 0.3
    if (s.roadBlobCutRoughness === undefined) s.roadBlobCutRoughness = 0.3
    delete (s as Record<string, unknown>).riverBlobCutVariance
    delete (s as Record<string, unknown>).riverBlobCutFreqScale
    delete (s as Record<string, unknown>).roadBlobCutVariance
    delete (s as Record<string, unknown>).roadBlobCutFreqScale
    if (!s.slopeEdges) s.slopeEdges = {}
  }
  if (fromVersion < 89) {
    if (!s.slopeStyle) s.slopeStyle = 'hachure'
  }
  if (fromVersion < 90) {
    if (s.slopeSmoothing === undefined) s.slopeSmoothing = false
  }
  if (fromVersion < 91) {
    if (s.slopeTickSpacing === undefined) s.slopeTickSpacing = 0.18
    if (s.slopeTickLength  === undefined) s.slopeTickLength  = 0.22
  }
  if (fromVersion < 92) {
    if (!s.elevationHachureEnabled) s.elevationHachureEnabled = {}
  }
  if (fromVersion < 93) {
    if (!s.elevationShadowEnabled) s.elevationShadowEnabled = {}
    if (!s.elevationShadowColor) s.elevationShadowColor = '#8a6840'
  }
  if (fromVersion < 96) {
    if (s.elevationShadowOx === undefined) s.elevationShadowOx = 14
    if (s.elevationShadowOy === undefined) s.elevationShadowOy = 16
    if (s.elevationShadowBl === undefined) s.elevationShadowBl = 22
    if (s.elevationShadowOp === undefined) s.elevationShadowOp = 30
    if (s.elevationShadowPs === undefined) s.elevationShadowPs = 3
  }
  if (fromVersion < 84) {
    const tiers = s.riverTierStyles as Array<Record<string, unknown>> | undefined
    if (tiers) {
      for (const ts of tiers) {
        delete ts.bankEnabled
        delete ts.bankWidth
        delete ts.bankTerrains
      }
    }
  }
  if (fromVersion < 83) {
    // rawRoadWays, osmHexPaths, rawRailWays, osmRailHexPaths, osmRiverWays,
    // appliedOsmRiverIndices, riversOsmStatus, heightmapUrl added to persist.
    // Missing fields default to slice initialiser values — no fixup needed.
  }
  if (fromVersion < 80) {
    if (!s.blobMaskEdits) s.blobMaskEdits = []
  }
  if (fromVersion < 79) {
    delete (s as Record<string, unknown>).canalEdges
    delete (s as Record<string, unknown>).canalSegmentProps
    delete (s as Record<string, unknown>).canalStyle
    delete (s as Record<string, unknown>).canalWidthScale
    delete (s as Record<string, unknown>).canalEditMode
    delete (s as Record<string, unknown>).canalSelectMode
    delete (s as Record<string, unknown>).selectedCanalSegmentKeys
  }
  if (fromVersion < 69) {
    const cp = s.classificationParams as Record<string, unknown> | undefined
    if (cp) {
      delete cp.mountainsPct
      delete cp.hillsPct
      delete cp.rangeFloorM
      delete cp.medianFloorM
      if (cp.rangeHillsM === undefined) cp.rangeHillsM = 100
      if (cp.rangeMountainsM === undefined) cp.rangeMountainsM = 300
      if (cp.medianHillsM === undefined) cp.medianHillsM = 400
      if (cp.medianMountainsM === undefined) cp.medianMountainsM = 900
    }
  }
  return s
}

export function rehydrateState(state: MapStore): MapStore {
  const dt = state.disabledTerrains
  state.disabledTerrains = dt instanceof Set ? dt : new Set(Array.isArray(dt) ? dt as string[] : [])
  if (state.generateStatus === 'loading') state.generateStatus = 'idle'
  if (state.elevationStatus === 'loading') state.elevationStatus = 'idle'
  if (state.settlementsStatus === 'loading') state.settlementsStatus = 'idle'
  if (state.roadsStatus === 'loading') state.roadsStatus = 'idle'
  if (state.railsStatus === 'loading') state.railsStatus = 'idle'
  if (Array.isArray(state.roadEdges)) {
    state.roadEdges = (state.roadEdges as RoadEdge[]).filter(
      (e) => e.tier === 0 || e.tier === 1 || e.tier === 2
    )
  }
  return state
}
