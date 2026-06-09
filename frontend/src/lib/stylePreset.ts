import type { MapStore } from '../store/mapStore'

// ── Key lists ──────────────────────────────────────────────────────────────────

/** All store keys that constitute a "style preset" — visual settings, not map data. */
export const STYLE_PRESET_KEYS: string[] = [
  // Colours (formerly a separate palette)
  'terrainColors',
  'beachColor',
  'mapBgColor',
  'mapBorderColor',
  'riverStyle',
  'canalStyle',
  'riverLabelColor',
  'hexNumberColor',
  'megaHexColor',
  // Terrain appearance
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

// ── Style preset ───────────────────────────────────────────────────────────────

export type StylePreset = Record<string, unknown>

export function extractStylePreset(s: MapStore): StylePreset {
  const result: StylePreset = {}
  for (const k of STYLE_PRESET_KEYS) result[k] = (s as Record<string, unknown>)[k]
  return result
}

// ── Built-in presets ───────────────────────────────────────────────────────────

export interface BuiltinPreset {
  id: string
  name: string
  description: string
  swatches: string[]
  data: StylePreset
}

const SETTLEMENT_TIERS_DEFAULT = {
  1: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 6, fillColor: '#c0392b', strokeColor: '#ffffff', strokeWidth: 1.2, buildingCount: 29, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  2: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 4.5, fillColor: '#2c3e50', strokeColor: '#ffffff', strokeWidth: 1.0, buildingCount: 18, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  3: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 3.0, fillColor: '#34495e', strokeColor: '#ffffff', strokeWidth: 0.8, buildingCount: 10, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  4: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 2.0, fillColor: '#7f8c8d', strokeColor: '#ffffff', strokeWidth: 0.6, buildingCount: 4, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
}

const ROAD_TIERS_DEFAULT = [
  { outer: '#ede8d5', inner: '#a02020', outerW: 3.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
  { outer: '#ede8d5', inner: '#6b6b6b', outerW: 2.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
  { outer: '#606060', inner: '#ede8d5', outerW: 1.5, caseDash: 'dashed', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
]

const URBAN_STYLE_DEFAULT = {
  buildingCount: 29, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2,
  angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2,
  buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0,
}

function baseStructural(): StylePreset {
  return {
    terrainTextureScales: { clear: 1.6, woods: 6, light_woods: 7, rough: 10, marsh: 4 },
    terrainTextureOpacities: { light_woods: 1, woods: 0.5, marsh: 0.6, clear: 0.1 },
    terrainTextureBlendModes: { light_woods: 'color', woods: 'multiply', rough: 'multiply', marsh: 'multiply', clear: 'multiply' },
    terrainTextureFile: { rough: 'rough', clear: '2clear' },
    terrainTextureEnabled: { rough: false, clear: false },
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
    terrainTypeBlobStyles: {
      woods: { enabled: true, smooth: 0, offset: -0.25, bump: 0.4, sweepFreq: 0.65, lobeFreq: 4, lobeAmp: 0.52, lobeThreshold: 0, lobeDirection: -1 },
      light_woods: { enabled: true, smooth: 1, offset: 0.1, bump: 0.19, sweepFreq: 0.45, lobeFreq: 4, lobeAmp: 0.2, lobeThreshold: 0, lobeDirection: -1 },
      marsh: { enabled: true, smooth: 0, offset: 0, bump: 0.3, sweepFreq: 0.45, lobeFreq: 3, lobeAmp: 0.4, lobeThreshold: 0, lobeDirection: -1 },
    },
    illustratedStyle: false,
    realisticCoastline: false,
    beachStrip: false,
    beachWidth: 0.06,
    woodsHexStyle: 'default',
    blobSize: 0.18,
    blobCount: 7,
    terrainEdgePaintEnabled: false,
    edgeBlobWidth: 0.25,
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
    // Colours
    terrainColors: { clear: '#ede8d5', woods: '#8aaa6a', light_woods: '#b8cc88', rough: '#9e8c6a', marsh: '#7ab0a0', water: '#3a6898', river: '#7ab0c8', beach: '#dfd0a0' },
    beachColor: '#e4d5a0',
    mapBgColor: '#ffffff',
    mapBorderColor: '#000000',
    riverStyle: { color: '#5888b0', strokeEnabled: false, strokeColor: '#2a4a6a', strokeWidth: 0.4 },
    canalStyle: { color: '#6a9a8a', strokeEnabled: true, strokeColor: '#3a5a4a', strokeWidth: 0.5 },
    riverLabelColor: '#2a5a8a',
    hexNumberColor: '#8a8a8a',
    megaHexColor: '#cc4444',
  }
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Modern topographic style with summer greens',
    swatches: ['#ede8d5', '#8aaa6a', '#3a6898', '#9e8c6a'],
    data: { ...baseStructural() },
  },
  {
    id: 'winter',
    name: 'Winter',
    description: 'Cool whites with lightforest texture on clear terrain',
    swatches: ['#fafafa', '#5b8b5e', '#3a6898', '#9e8c6a'],
    data: {
      ...baseStructural(),
      terrainColors: { clear: '#fafafa', woods: '#5b8b5e', light_woods: '#8aaa6a', rough: '#9e8c6a', marsh: '#7ab0a0', water: '#3a6898', river: '#7ab0c8', beach: '#dfd0a0' },
      terrainTextureScales: { clear: 10, woods: 6, light_woods: 7.5, rough: 10, marsh: 4 },
      terrainTextureOpacities: { light_woods: 0.6, woods: 0.5, marsh: 0.6, clear: 0.59 },
      terrainTextureBlendModes: { light_woods: 'color', woods: 'multiply', rough: 'multiply', marsh: 'multiply', clear: 'overlay' },
      terrainTextureFile: { rough: 'rough', clear: 'lightforest' },
      terrainTextureEnabled: { rough: false, clear: true },
      roadTierStyles: [
        { outer: '#fdfdfd', inner: '#a02020', outerW: 3.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
        { outer: '#fdfdfd', inner: '#6b6b6b', outerW: 2.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
        { outer: '#606060', inner: '#fafafa', outerW: 1.5, caseDash: 'dashed', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
      ],
    },
  },
]

export const BUILTIN_PRESET_MAP: Record<string, BuiltinPreset> = Object.fromEntries(
  BUILTIN_PRESETS.map(p => [p.id, p])
)


// ── Edited detection ───────────────────────────────────────────────────────────

/** True if any key diverges from the preset's defaults. */
export function isPresetEdited(state: MapStore, presetId: string | null): boolean {
  if (!presetId) return false
  const preset = BUILTIN_PRESET_MAP[presetId]
  if (!preset) return false
  const s = state as Record<string, unknown>
  for (const k of STYLE_PRESET_KEYS) {
    if (JSON.stringify(s[k]) !== JSON.stringify(preset.data[k])) return true
  }
  return false
}
