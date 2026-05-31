import type { MapStore } from '../store/mapStore'

// ── Key lists ──────────────────────────────────────────────────────────────────

/** Color-only keys — swappable independently of structural style. */
export const COLOR_PALETTE_KEYS: string[] = [
  'terrainColors',
  'beachColor',
  'mapBgColor',
  'mapBorderColor',
  'riverStyle',
  'canalStyle',
  'riverLabelColor',
  'hexNumberColor',
  'megaHexColor',
]

/** All store keys that constitute a "style preset" — visual settings, not map data. */
export const STYLE_PRESET_KEYS: string[] = [
  // Terrain appearance
  'thresholds',
  'terrainColors', 'terrainTextureScales', 'terrainTextureOpacities', 'terrainTextureBlendModes',
  'terrainTextureFile', 'terrainTextureEnabled', 'terrainRenderMode',
  'terrainDisplacement', 'terrainNoiseFrequency', 'terrainNoiseSeed', 'terrainNoiseOctaves',
  'woodsHexStyle', 'blobSize', 'blobCount',
  'illustratedStyle', 'realisticCoastline', 'beachStrip', 'beachColor', 'beachWidth',
  'terrainTypeBlobStyles',
  'terrainBlobSmooth', 'terrainBlobOffset', 'terrainBlobBump',
  'terrainBlobSweepFreq', 'terrainBlobLobeFreq', 'terrainBlobLobeAmp',
  'terrainBlobLobeThreshold', 'terrainBlobLobeDirection',
  'terrainEdgePaintEnabled',
  'edgeBlobWidth',
  'autoLakesEnabled', 'lakeSensitivity',
  'lakeBlobSmooth', 'lakeBlobOffset', 'lakeBlobBump',
  'lakeBlobSweepFreq', 'lakeBlobLobeFreq', 'lakeBlobLobeAmp',
  'lakeBlobLobeThreshold', 'lakeBlobLobeDirection',
  // Settlements
  'settlementTierStyles', 'settlementTierThresholds', 'settlementsAutoPlace',
  'settlementsLimit', 'settlementsTypes',
  'showSettlementLabels', 'labelPresetId', 'labelOverrides',
  // Roads
  'roadsDisplayMode', 'roadsVisibleTiers',
  'roadTierStyles', 'roadTierGeometry',
  'roadWiggleAmp', 'roadWiggleFreq', 'roadSmoothing', 'roadPathSmoothing', 'roadDensityMinChain',
  // Rails
  'railStyle', 'railGeomOverride',
  'railWiggleAmp', 'railWiggleFreq', 'railSmoothing', 'railPathSmoothing', 'railsFetchTypes',
  // Rivers
  'riverStyle', 'canalStyle',
  'riverWidthScale', 'canalWidthScale',
  'riverCurveSteps', 'riverWobble', 'riverDetail',
  'riverWiggleAmp', 'riverWiggleFreq', 'riverSmoothing',
  'showRiverLabels', 'riverLabelColor',
  // Bridges
  'bridgesEnabled', 'bridgeStyle', 'bridgeTiers', 'showBridges',
  // Urban
  'urbanStyle', 'urbanDisplayMode', 'urbanScale', 'urbanVertexRatio',
  'urbanNoise', 'urbanBuildingCount', 'urbanBuildingSize',
  // Display
  'hexBorderMode',
  'hexNumbersEnabled', 'hexNumberStartCorner', 'hexNumberEdge', 'hexNumberColor', 'hexNumberFontScale',
  'showPaperTexture', 'paperTextureOpacity', 'showPaperVignette',
  'mapBgColor', 'mapBorderEnabled', 'mapBorderColor', 'mapBorderWidth', 'clipToHexGrid',
  'megaHexEnabled', 'megaHexRadius', 'megaHexColor', 'megaHexOpacity', 'megaHexLineWidth',
  // Global style
  'mapStyle',
  // Areas style
  'areasStyle',
]

/** Keys compared when deciding if a preset is "edited" — colour keys excluded
 *  so that swapping a palette doesn't mark the preset as modified. */
const STYLE_STRUCTURAL_KEYS = STYLE_PRESET_KEYS.filter(k => !COLOR_PALETTE_KEYS.includes(k))

// ── Style preset ───────────────────────────────────────────────────────────────

export type StylePreset = Record<string, unknown>
export type ColorPalette = Record<string, unknown>

export function extractStylePreset(s: MapStore): StylePreset {
  const result: StylePreset = {}
  for (const k of STYLE_PRESET_KEYS) result[k] = (s as Record<string, unknown>)[k]
  return result
}

export function extractColorPalette(s: MapStore): ColorPalette {
  const result: ColorPalette = {}
  for (const k of COLOR_PALETTE_KEYS) result[k] = (s as Record<string, unknown>)[k]
  return result
}

// ── Built-in presets ───────────────────────────────────────────────────────────

export interface BuiltinPreset {
  id: string
  name: string
  description: string
  defaultPaletteId: string
  data: StylePreset
}

const SETTLEMENT_TIERS_DEFAULT = {
  1: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 6, fillColor: '#c0392b', strokeColor: '#ffffff', strokeWidth: 1.2, buildingCount: 29, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  2: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 4.5, fillColor: '#2c3e50', strokeColor: '#ffffff', strokeWidth: 1.0, buildingCount: 18, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  3: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 3.0, fillColor: '#34495e', strokeColor: '#ffffff', strokeWidth: 0.8, buildingCount: 10, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  4: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 2.0, fillColor: '#7f8c8d', strokeColor: '#ffffff', strokeWidth: 0.6, buildingCount: 4, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
}

const ROAD_TIERS_DEFAULT = [
  { outer: '#ffe8a8', inner: '#b07820', outerW: 4.5, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
  { outer: '#f0e0b8', inner: '#8a5c2a', outerW: 3.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
  { outer: '#d8d8c0', inner: '#606060', outerW: 2.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
]

const URBAN_STYLE_DEFAULT = {
  buildingCount: 29, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2,
  angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2,
  buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0,
}

function baseStructural(): StylePreset {
  return {
    thresholds: { sea: 0.4, marsh: 0.2, woods: 0.3, light_woods: 0.15, rough: 0.25, clear: 0 },
    terrainTextureScales: { clear: 3, woods: 3, light_woods: 8 },
    terrainTextureOpacities: { light_woods: 1.0 },
    terrainTextureBlendModes: { light_woods: 'color' },
    terrainTextureFile: {},
    terrainTextureEnabled: {},
    terrainRenderMode: 'blob',
    terrainDisplacement: 18,
    terrainNoiseFrequency: 6,
    terrainNoiseSeed: 2,
    terrainNoiseOctaves: 3,
    terrainBlobSmooth: 0,
    terrainBlobOffset: -0.10,
    terrainBlobBump: 0.47,
    terrainBlobSweepFreq: 1.0,
    terrainBlobLobeFreq: 4.1,
    terrainBlobLobeAmp: 0.49,
    terrainBlobLobeThreshold: 0.08,
    terrainBlobLobeDirection: -1,
    terrainTypeBlobStyles: {},
    illustratedStyle: false,
    realisticCoastline: false,
    beachStrip: false,
    beachWidth: 0.06,
    woodsHexStyle: 'default',
    blobSize: 0.18,
    blobCount: 7,
    terrainEdgePaintEnabled: false,
    edgeBlobWidth: 0.25,
    autoLakesEnabled: false,
    lakeSensitivity: 0.4,
    lakeBlobSmooth: 2,
    lakeBlobOffset: -0.15,
    lakeBlobBump: 0.15,
    lakeBlobSweepFreq: 0.6,
    lakeBlobLobeFreq: 2.8,
    lakeBlobLobeAmp: 0.4,
    lakeBlobLobeThreshold: 0.20,
    lakeBlobLobeDirection: 1,
    settlementTierStyles: SETTLEMENT_TIERS_DEFAULT,
    settlementTierThresholds: [50000, 10000, 2000],
    settlementsAutoPlace: 5,
    settlementsLimit: 50,
    settlementsTypes: ['city', 'town', 'village'],
    showSettlementLabels: true,
    labelPresetId: 'ibm_hybrid',
    labelOverrides: {},
    roadsDisplayMode: 'per_hex',
    roadsVisibleTiers: [true, true, true],
    roadTierStyles: ROAD_TIERS_DEFAULT,
    roadTierGeometry: [null, null, null],
    roadWiggleAmp: 0.20,
    roadWiggleFreq: 0.9,
    roadSmoothing: 10,
    roadPathSmoothing: 0,
    roadDensityMinChain: 1,
    railStyle: { thickness: 2.5, innerColor: '#f0ece4', outerColor: '#1a1a1a', railStyle: 'classic' },
    railGeomOverride: null,
    railWiggleAmp: 0,
    railWiggleFreq: 2.5,
    railSmoothing: 10,
    railPathSmoothing: 0,
    railsFetchTypes: ['rail'],
    riverWidthScale: 1.0,
    canalWidthScale: 0.45,
    riverCurveSteps: 3,
    riverWobble: 0,
    riverDetail: 0,
    riverWiggleAmp: 0.25,
    riverWiggleFreq: 2.5,
    riverSmoothing: 10,
    showRiverLabels: true,
    bridgesEnabled: true,
    bridgeStyle: 'plank',
    bridgeTiers: [],
    showBridges: false,
    urbanStyle: URBAN_STYLE_DEFAULT,
    urbanDisplayMode: 'polygon',
    urbanScale: 0.72,
    urbanVertexRatio: 0.75,
    urbanNoise: 0.12,
    urbanBuildingCount: 8,
    urbanBuildingSize: 0.12,
    hexBorderMode: 'full',
    hexNumbersEnabled: false,
    hexNumberStartCorner: 'top-left',
    hexNumberEdge: 4,
    hexNumberFontScale: 1.0,
    showPaperTexture: false,
    paperTextureOpacity: 0.35,
    showPaperVignette: false,
    mapBorderEnabled: false,
    mapBorderWidth: 1.5,
    clipToHexGrid: false,
    megaHexEnabled: false,
    megaHexRadius: 1,
    megaHexOpacity: 0.8,
    megaHexLineWidth: 2,
    mapStyle: 'standard',
    areasStyle: { borderWidth: 2.0, labelSize: 1.0, borderColor: '#2c1a00' },
  }
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Modern topographic style',
    defaultPaletteId: 'summer',
    data: { ...baseStructural() },
  },
]

export const BUILTIN_PRESET_MAP: Record<string, BuiltinPreset> = Object.fromEntries(
  BUILTIN_PRESETS.map(p => [p.id, p])
)

// ── Built-in colour palettes ───────────────────────────────────────────────────

export interface BuiltinPalette {
  id: string
  name: string
  description: string
  swatches: string[]  // 3–4 representative hex colours shown as a preview
  data: ColorPalette
}

export const BUILTIN_PALETTES: BuiltinPalette[] = [
  {
    id: 'summer',
    name: 'Summer',
    description: 'Balanced greens and blues',
    swatches: ['#ede8d5', '#4d7a50', '#3a6898', '#9e8c6a'],
    data: {
      terrainColors: { clear: '#ede8d5', woods: '#4d7a50', light_woods: '#8aaa6a', rough: '#9e8c6a', marsh: '#6b9e8a', sea: '#3a6898', river: '#7ab0c8', beach: '#dfd0a0' },
      beachColor: '#e4d5a0',
      mapBgColor: '#ffffff',
      mapBorderColor: '#000000',
      riverStyle: { color: '#5888b0', strokeEnabled: false, strokeColor: '#2a4a6a', strokeWidth: 0.4 },
      canalStyle: { color: '#6a9a8a', strokeEnabled: true, strokeColor: '#3a5a4a', strokeWidth: 0.5 },
      riverLabelColor: '#2a5a8a',
      hexNumberColor: '#8a8a8a',
      megaHexColor: '#cc4444',
    },
  },
]

export const BUILTIN_PALETTE_MAP: Record<string, BuiltinPalette> = Object.fromEntries(
  BUILTIN_PALETTES.map(p => [p.id, p])
)

// ── Edited detection ───────────────────────────────────────────────────────────

/** True if any structural (non-colour) key diverges from the preset's defaults. */
export function isPresetEdited(state: MapStore, presetId: string | null): boolean {
  if (!presetId) return false
  const preset = BUILTIN_PRESET_MAP[presetId]
  if (!preset) return false
  const s = state as Record<string, unknown>
  for (const k of STYLE_STRUCTURAL_KEYS) {
    if (JSON.stringify(s[k]) !== JSON.stringify(preset.data[k])) return true
  }
  return false
}

/** True if any colour key diverges from the palette's values. */
export function isPaletteEdited(state: MapStore, paletteId: string | null): boolean {
  if (!paletteId) return false
  const palette = BUILTIN_PALETTE_MAP[paletteId]
  if (!palette) return false
  const s = state as Record<string, unknown>
  for (const k of COLOR_PALETTE_KEYS) {
    if (JSON.stringify(s[k]) !== JSON.stringify(palette.data[k])) return true
  }
  return false
}
