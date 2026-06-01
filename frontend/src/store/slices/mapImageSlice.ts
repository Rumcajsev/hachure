import type { MapStore, GeneratedHex, GridMetadata } from '../mapStore'
import { combinedDimsMm, mapResolutionMpx } from '../mapStore'

export type ImageTransform = {
  translateX: number  // fraction of paperWidth offset from paper center
  translateY: number  // fraction of paperHeight offset from paper center
  scaleFrac: number   // image width as fraction of paperWidth (1.0 = fills width)
  rotation: number    // degrees
}

export type MapImageSlice = {
  dataSource: 'osm' | 'map_image'
  mapImageDataUrl: string | null
  mapImageNaturalSize: { w: number; h: number } | null
  mapImageTransform: ImageTransform
  mapImageOpacity: number

  setMapImageDataUrl: (url: string, w: number, h: number) => void
  setMapImageTransform: (t: Partial<ImageTransform>) => void
  setMapImageOpacity: (v: number) => void
  clearMapImage: () => void
  startImageImport: () => Promise<void>
  confirmImageAlign: () => void
}

const DEFAULT_TRANSFORM: ImageTransform = { translateX: 0, translateY: 0, scaleFrac: 1, rotation: 0 }

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createMapImageSlice = (set: Set, get: () => MapStore): MapImageSlice => ({
  dataSource: 'osm',
  mapImageDataUrl: null,
  mapImageNaturalSize: null,
  mapImageTransform: DEFAULT_TRANSFORM,
  mapImageOpacity: 0.6,

  setMapImageDataUrl: (url, w, h) => set({
    mapImageDataUrl: url,
    mapImageNaturalSize: { w, h },
    mapImageTransform: DEFAULT_TRANSFORM,
  }),

  setMapImageTransform: (t) => set((s) => ({
    mapImageTransform: { ...s.mapImageTransform, ...t },
  })),

  setMapImageOpacity: (v) => set({ mapImageOpacity: v }),

  clearMapImage: () => set((s) => ({
    dataSource: 'osm',
    mapImageDataUrl: null,
    mapImageNaturalSize: null,
    mapImageTransform: DEFAULT_TRANSFORM,
    roadEdges: [],
    riverEdges: [],
    settlements: [],
    roadsStatus: 'idle',
    settlementsStatus: 'idle',
    generatedHexes: s.generatedHexes.map(h => ({
      ...h,
      terrain: 'clear', terrains: [],
      elevation_class: null,
    })),
    step: s.step === 'image-align' ? 'setup' : s.step,
  })),

  startImageImport: async () => {
    const { paperSize, orientation, pageGrid, hexSizeMm, hexOrientation, bearing, center, zoom, framePixelWidth, marginMm } = get()

    const [cwMm, chMm] = combinedDimsMm(paperSize, orientation, pageGrid)
    const res = mapResolutionMpx(center[1], zoom)
    const aspect = cwMm / chMm
    const effectiveFrameWidth = framePixelWidth > 0
      ? framePixelWidth
      : Math.round(Math.min(window.innerWidth, window.innerHeight * aspect) * 0.85)
    const widthM = effectiveFrameWidth * res
    const heightM = widthM * (chMm / cwMm)

    set({ generateStatus: 'loading', generateError: null, generateProgress: null })
    try {
      const resp = await fetch('/api/generate/grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_lon: center[0], center_lat: center[1],
          bearing, width_m: widthM, height_m: heightM,
          hex_size_mm: hexSizeMm, paper_size: paperSize,
          orientation, hex_orientation: hexOrientation,
          paper_width_mm: cwMm, paper_height_mm: chMm,
          margin_mm: marginMm,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      const placeholder: GeneratedHex[] = data.hexes.map((h: GeneratedHex) => ({
        ...h,
        terrain: 'clear', terrains: [], coverage: {},
        elevation_avg_m: null, elevation_median_m: null,
        elevation_max_m: null, elevation_min_m: null,
        elevation_range_m: null, elevation_class: null,
        elevation_manual_override: false, coastline_clip: null,
      }))
      set({
        step: 'image-align',
        generatedHexes: placeholder,
        generatedMetadata: data.metadata as GridMetadata,
        dataSource: 'map_image',
        generateStatus: 'done',
        generateProgress: null,
        activeTool: { type: 'align-image' },
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
        canalEdges: [],
        riverSegmentProps: {},
        canalSegmentProps: {},
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
        bridgeOverrides: {},
        undoStack: [],
        redoStack: [],
        mapTitle: '',
        activePanel: 'terrain',
      })
    } catch (e) {
      set({ generateStatus: 'error', generateError: String(e), generateProgress: null })
    }
  },

  confirmImageAlign: () => set({
    step: 'terrain',
    dataSource: 'map_image',
    activeTool: { type: 'none' },
  }),
})
