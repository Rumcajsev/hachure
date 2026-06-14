import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

import { type SetupSlice, createSetupSlice } from './slices/setupSlice'
import { type TerrainSlice, createTerrainSlice } from './slices/terrainSlice'
import { type ElevationSlice, createElevationSlice } from './slices/elevationSlice'
import { type SettlementsSlice, createSettlementsSlice } from './slices/settlementsSlice'
import { type RoadsSlice, createRoadsSlice } from './slices/roadsSlice'
import { type RailsSlice, createRailsSlice } from './slices/railsSlice'
import { type RiversSlice, createRiversSlice } from './slices/riversSlice'
import { type HighlightsSlice, createHighlightsSlice } from './slices/highlightsSlice'
import { type IconsSlice, createIconsSlice } from './slices/iconsSlice'
import { type LabelsSlice, createLabelsSlice } from './slices/labelsSlice'
import { type UndoSlice, createUndoSlice } from './slices/undoSlice'
import { type UiSlice, createUiSlice, migratePersisted, rehydrateState } from './slices/uiSlice'
import { type BridgesSlice, createBridgesSlice } from './slices/bridgesSlice'
import { type MegaHexSlice, createMegaHexSlice } from './slices/megaHexSlice'
import { type PresetsSlice, createPresetsSlice } from './slices/presetsSlice'
import { type MapImageSlice, createMapImageSlice } from './slices/mapImageSlice'
import { type LabelOffsetsSlice, createLabelOffsetsSlice } from './slices/labelOffsetsSlice'
export type { LabelBBox } from './slices/labelOffsetsSlice'
import type { LabelSpec } from '../lib/labelPresets'

export interface RoadGeomOverride {
  wiggleAmp: number
  wiggleFreq: number
  pathSmoothing: number
  smoothing: number
  centerPull: number
}

export interface RailGeomOverride {
  wiggleAmp: number
  wiggleFreq: number
  pathSmoothing: number
  smoothing: number
}

export interface BlobOverride {
  terrain?: string
  color?: string
  smooth?: number
  offset?: number
  bump?: number
  sweepFreq?: number
  lobeFreq?: number
  lobeAmp?: number
  lobeThreshold?: number
  lobeDirection?: number
  simplify?: number
  textureScale?: number
  enabled?: boolean
  width?: number
  // Legacy fields — kept for migration; use effect instead
  outlineEnabled?: boolean
  outlineColor?: string
  outlineWidth?: number
  effect?: Partial<StrokeEffect>
}


export type BlobMaskEdit = {
  id: string
  terrain: string
  type: 'subtract' | 'add'
  polygon: [number, number][]  // WGS84 lon/lat coordinates
}

export interface ClassificationParams {
  rangeHillsM: number     // min relief (range) to qualify as hills
  rangeMountainsM: number // min relief (range) to qualify as mountains
  medianHillsM: number    // min altitude (median) to qualify as hills
  medianMountainsM: number // min altitude (median) to qualify as mountains
}

export const DEFAULT_CLASSIFICATION_PARAMS: ClassificationParams = {
  rangeHillsM: 100,
  rangeMountainsM: 300,
  medianHillsM: 400,
  medianMountainsM: 900,
}

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'
export type Orientation = 'portrait' | 'landscape'
export type HexOrientation = 'flat' | 'pointy'
export type HexEdgeMode = 'whole' | 'half'

export type ActiveTool =
  | { type: 'none' }
  | { type: 'terrain'; brush: string }
  | { type: 'elevation'; brush: 'flat' | 'hills' | 'mountains' }
  | { type: 'water' }
  | { type: 'road'; tier: 0 | 1 | 2; erasing: boolean }
  | { type: 'rail'; erasing: boolean }
  | { type: 'node-edit' }
  | { type: 'river-node-edit' }
  | { type: 'river-paint'; tier: RiverTier }
  | { type: 'river-select' }
  | { type: 'highlight-paint'; id: string }
  | { type: 'highlight-erase'; id: string }
  | { type: 'highlight-erase-any' }
  | { type: 'icon-place'; id: string }
  | { type: 'icon-erase'; id: string }
  | { type: 'icon-erase-any' }
  | { type: 'label-place'; id: string }
  | { type: 'label-erase'; id: string }
  | { type: 'urban'; mode: 'paint' | 'erase' }
  | { type: 'road-select' }
  | { type: 'rail-node-edit' }
  | { type: 'rail-select' }
  | { type: 'hex-mask'; mode: 'exclude' | 'include' }
  | { type: 'hex-disable'; mode: 'disable' | 'enable' }
  | { type: 'mega-hex-origin' }
  | { type: 'align-image' }
  | { type: 'label-drag' }
  /** Label follows cursor until left-click confirms placement or Escape cancels.
   *  dx/dy are stored relative to the icon centre (cx, cy), not the auto-placer output. */
  | { type: 'label-follow'; id: string; iconCx: number; iconCy: number; prevDx: number; prevDy: number }
  | { type: 'blob-mask'; mode: 'add' | 'subtract'; terrain: string }

export type MapMode = 'single' | 'diptych'
export type DiptychJoin = 'long' | 'short'

export interface PageGrid {
  colWidths: number[]   // mm width of each column
  rowHeights: number[]  // mm height of each row
}

export interface Hex {
  q: number
  r: number
  center: [number, number]
  vertices: [number, number][]
  partial: boolean
  terrain: string
}

export interface GeneratedHex {
  q: number
  r: number
  center: [number, number]
  vertices: [number, number][]
  terrain: string
  terrains: string[]
  coverage: Record<number, number>
  partial: boolean
  manual_override?: boolean
  backgroundTerrain?: string
  elevation_avg_m: number | null
  elevation_median_m: number | null
  elevation_max_m: number | null
  elevation_min_m: number | null
  elevation_range_m: number | null
  elevation_class: 'flat' | 'hills' | 'mountains' | null
  elevation_manual_override?: boolean
  coastline_clip?: [number, number][][] | null
  ai_confidence?: number
  ai_notes?: string
}

export function hexTerrainLayers(h: GeneratedHex): string[] {
  if (h.terrains) return h.terrains
  return h.terrain === 'clear' ? [] : [h.terrain]
}

export interface GridMetadata {
  hex_count: number
  hex_size_km: number
  scale_m_per_mm: number
  outer_radius_m: number
  center: [number, number]
  bearing: number
  paper_mm: [number, number]
  margin_mm: number
  /** How far the paper's visual centre is offset from the geographic centre, in mm.
   *  [+x, +y] = paper centre is x mm to the right and y mm up of the geographic centre.
   *  Absent (or [0,0]) means the paper is centred on the geographic centre (normal case).
   *  Accumulated across multiple expand operations. */
  paper_offset_mm?: [number, number]
  /** Exterior ring(s) of the full WorldCover land polygon, [[lon, lat], …].
   *  Sent before hex clipping so the frontend can smooth it globally. */
  coastline_boundary?: [number, number][][]
}

export const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
}

export const TERRAIN_COLORS: Record<string, string> = {
  clear: '#ede8d5',
  woods: '#4d7a50',
  light_woods: '#8aaa6a',
  rough: '#9e8c6a',
  marsh: '#6b9e8a',
  water: '#3a6898',
  river: '#7ab0c8',
  beach: '#dfd0a0',
}

export interface CustomTerrain {
  id: string
  name: string
  color: string
  textureId: string | null
}

export const WATER_COLOR = '#3a6898'

// ── Universal stroke/glow effect ─────────────────────────────────────────────

export type StrokeDash = 'solid' | 'dashed' | 'dotted' | 'longdash' | 'dashdot'

export interface StrokeEffect {
  // Outer glow — blurred halo rendered behind the feature
  glowEnabled: boolean
  glowColor:   string   // use rgba for subtlety, e.g. 'rgba(0,0,0,0.3)'
  glowBlur:    number   // blur radius in canvas px
  glowSpread:  number   // extra half-width beyond feature edge (px)

  // Hard outline — sharp border drawn behind the feature fill
  outlineEnabled: boolean
  outlineColor:   string
  outlineWidth:   number   // extra px beyond feature edge
  outlineDash:    StrokeDash

  // Fill dash — the dash pattern applied to the main fill stroke
  fillDash: StrokeDash
}

export const DEFAULT_STROKE_EFFECT: StrokeEffect = {
  glowEnabled:    false,
  glowColor:      'rgba(0,0,0,0.25)',
  glowBlur:       6,
  glowSpread:     3,
  outlineEnabled: false,
  outlineColor:   '#2a4a6a',
  outlineWidth:   2,
  outlineDash:    'solid',
  fillDash:       'solid',
}

// ── River tiers ───────────────────────────────────────────────────────────────

export type RiverTier = 0 | 1 | 2

export interface RiverTierStyle {
  label:          string
  color:          string
  widthScale:     number   // multiplier on the base half-width
  visible:        boolean
  effect:         StrokeEffect
  // Shape override — undefined means inherit from global river shape settings
  wiggleAmp?:     number
  wiggleFreq?:    number
  smoothing?:     number
  pathSmoothing?: number
  // Bank clearance
  bankEnabled:    boolean
  bankWidth:      number    // extra half-width on each side (canvas px)
  bankTerrains:   string[]  // terrain types that trigger bank; empty = show everywhere
}

const DEFAULT_BANK = { bankEnabled: false, bankWidth: 4, bankTerrains: [] as string[] }

export const DEFAULT_RIVER_TIER_STYLES: [RiverTierStyle, RiverTierStyle, RiverTierStyle] = [
  { label: 'Major River', color: WATER_COLOR, widthScale: 1.5,  visible: true, effect: { ...DEFAULT_STROKE_EFFECT }, ...DEFAULT_BANK },
  { label: 'River',       color: WATER_COLOR, widthScale: 1.0,  visible: true, effect: { ...DEFAULT_STROKE_EFFECT }, ...DEFAULT_BANK },
  { label: 'Stream',      color: '#5878a0',   widthScale: 0.55, visible: true, effect: { ...DEFAULT_STROKE_EFFECT }, ...DEFAULT_BANK },
]

/** Maps OSM waterway type string to river tier (0=Major River, 1=River, 2=Stream) */
export function waterwayTypeToTier(type: string): RiverTier {
  if (type === 'river') return 0
  if (type === 'stream') return 1
  return 2
}

// Legacy — kept so old persisted state and canal style still load
export interface RiverStyleConfig {
  color:  string
  effect: StrokeEffect
}

export const DEFAULT_RIVER_STYLE: RiverStyleConfig = {
  color:  WATER_COLOR,
  effect: { ...DEFAULT_STROKE_EFFECT, outlineEnabled: false, outlineColor: '#2a4a6a', outlineWidth: 0.4 },
}

export function paperDimsMm(size: PaperSize, orientation: Orientation): [number, number] {
  const [s, l] = PAPER_MM[size]
  return orientation === 'landscape' ? [l, s] : [s, l]
}

export function pageGridTotalMm(grid: PageGrid): [number, number] {
  return [
    grid.colWidths.reduce((a, b) => a + b, 0),
    grid.rowHeights.reduce((a, b) => a + b, 0),
  ]
}

// Legacy alias kept for any remaining call sites during transition
export function combinedDimsMm(
  _size: PaperSize,
  _orientation: Orientation,
  pageGrid: PageGrid,
): [number, number] {
  return pageGridTotalMm(pageGrid)
}

// All A-size dimension pairs [width, height] in mm (both orientations)
const A_SIZE_DIMS: { size: PaperSize; orientation: Orientation; w: number; h: number }[] = (
  ['A4', 'A3', 'A2', 'A1', 'A0'] as PaperSize[]
).flatMap(size => {
  const [s, l] = PAPER_MM[size]
  return [
    { size, orientation: 'landscape' as Orientation, w: l, h: s },
    { size, orientation: 'portrait'  as Orientation, w: s, h: l },
  ]
})

// Returns the paper size/orientation for a cell of given mm dimensions (null if none match)
export function cellPaperInfo(
  colW: number, rowH: number,
): { size: PaperSize; orientation: Orientation } | null {
  const match = A_SIZE_DIMS.find(d => Math.abs(d.w - colW) < 0.5 && Math.abs(d.h - rowH) < 0.5)
  return match ? { size: match.size, orientation: match.orientation } : null
}

// Column widths (mm) that form a valid A-size paper with every existing row height
export function validColWidthsForRows(rowHeights: number[]): number[] {
  const candidates = [...new Set(A_SIZE_DIMS.map(d => d.w))]
  return candidates.filter(w =>
    rowHeights.every(h => A_SIZE_DIMS.some(d => Math.abs(d.w - w) < 0.5 && Math.abs(d.h - h) < 0.5))
  ).sort((a, b) => a - b)
}

// Row heights (mm) that form a valid A-size paper with every existing column width
export function validRowHeightsForCols(colWidths: number[]): number[] {
  const candidates = [...new Set(A_SIZE_DIMS.map(d => d.h))]
  return candidates.filter(h =>
    colWidths.every(w => A_SIZE_DIMS.some(d => Math.abs(d.w - w) < 0.5 && Math.abs(d.h - h) < 0.5))
  ).sort((a, b) => a - b)
}

// Build a uniform PageGrid from a paper size (all cells the same size)
export function uniformPageGrid(
  size: PaperSize, orientation: Orientation,
  cols = 1, rows = 1,
): PageGrid {
  const [pw, ph] = paperDimsMm(size, orientation)
  return {
    colWidths:  Array(cols).fill(pw),
    rowHeights: Array(rows).fill(ph),
  }
}

export const FRAME_MARGIN = 0.86

export function mapResolutionMpx(lat: number, zoom: number): number {
  return (78271.516 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
}

export const TERRAIN_PRIORITY = ['clear', 'light_woods', 'woods', 'rough', 'marsh', 'water', 'beach'] as const

/** Terrains that are manual-paint only — excluded from auto-classification sliders. */
export const MANUAL_ONLY_TERRAINS = new Set(['beach'])

export interface ClassRule {
  classCode: number
  threshold: number
}

/** terrain → list of WorldCover class rules. A hex qualifies if ANY rule fires. */
export type TerrainRules = Record<string, ClassRule[]>

export const DEFAULT_TERRAIN_RULES: TerrainRules = {
  water:       [{ classCode: 80, threshold: 0.5 }, { classCode: 0, threshold: 0.5 }],
  marsh:       [{ classCode: 90, threshold: 0.25 }, { classCode: 95, threshold: 0.25 }],
  woods:       [{ classCode: 10, threshold: 0.65 }],
  light_woods: [{ classCode: 10, threshold: 0.5 }, { classCode: 20, threshold: 0.25 }],
  rough:       [{ classCode: 60, threshold: 0.3 }, { classCode: 70, threshold: 0.3 }, { classCode: 100, threshold: 0.3 }],
}

export const WORLDCOVER_CLASSES: { code: number; name: string; color: string }[] = [
  { code: 10,  name: 'Tree cover',            color: '#2d6a2d' },
  { code: 20,  name: 'Shrubland',             color: '#a3c46c' },
  { code: 30,  name: 'Grassland',             color: '#d4e89a' },
  { code: 40,  name: 'Cropland',              color: '#e8d87a' },
  { code: 50,  name: 'Built-up',              color: '#c0a882' },
  { code: 60,  name: 'Bare / sparse veg',     color: '#b8a882' },
  { code: 70,  name: 'Snow and ice',          color: '#e8f0f8' },
  { code: 80,  name: 'Permanent water',       color: '#3a6898' },
  { code: 90,  name: 'Herbaceous wetland',    color: '#6b9e8a' },
  { code: 95,  name: 'Mangroves',             color: '#4a8a6a' },
  { code: 100, name: 'Moss and lichen',       color: '#9aaa7a' },
]

export type RoadDashStyle = 'solid' | 'dashed' | 'dotted'

export interface RoadTierStyle {
  outer: string
  inner: string
  outerW: number
  // Legacy dash fields kept for migration; effect.outlineDash / effect.fillDash take over
  caseDash: RoadDashStyle
  fillDash: RoadDashStyle
  roughness: number
  bowing: number
  effect: StrokeEffect
}

export const DEFAULT_ROAD_TIER_STYLES: [RoadTierStyle, RoadTierStyle, RoadTierStyle] = [
  { outer: '#ffe8a8', inner: '#b07820', outerW: 4.5, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5, effect: { ...DEFAULT_STROKE_EFFECT } },
  { outer: '#f0e0b8', inner: '#8a5c2a', outerW: 3.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5, effect: { ...DEFAULT_STROKE_EFFECT } },
  { outer: '#d8d8c0', inner: '#606060', outerW: 2.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5, effect: { ...DEFAULT_STROKE_EFFECT } },
]

export interface RailStyle {
  thickness: number
  innerColor: string
  outerColor: string
  railStyle: 'classic' | 'cross'
}

export const DEFAULT_RAIL_STYLE: RailStyle = {
  thickness: 2.5,
  innerColor: '#f0ece4',
  outerColor: '#1a1a1a',
  railStyle: 'classic',
}

export const DEFAULT_TERRAIN_BLOB = {
  smooth: 0,
  offset: -0.10,
  bump: 0.47,
  sweepFreq: 1.0,
  lobeFreq: 4.1,
  lobeAmp: 0.49,
  lobeThreshold: 0.08,
  lobeDirection: -1 as const,
  simplify: 0,
  topoStyle: 0,
}

export const DEFAULT_EDGE_BLOB = {
  ...DEFAULT_TERRAIN_BLOB,
  width: 0.25,
}

export const DEFAULT_LAKE_BLOB = {
  smooth: 2,
  offset: -0.15,
  bump: 0.15,
  sweepFreq: 0.6,
  lobeFreq: 2.8,
  lobeAmp: 0.4,
  lobeThreshold: 0.20,
  lobeDirection: 1 as const,
}

// Field render defaults — detached from active use, kept for future reuse.
// export const DEFAULT_FIELD_RENDER = {
//   fieldFreq: 0.3, fieldAmp: 0.8, fieldOctaves: 3, fieldPersistence: 0.5,
// }

export const DEFAULT_RIVER_GEOM = {
  widthScale: 1.0,
  wiggleAmp: 0.25,
  wiggleFreq: 2.5,
  smoothing: 10,
  pathSmoothing: 0,
}

export const DEFAULT_ROAD_GEOM = {
  wiggleAmp: 0.20,
  wiggleFreq: 0.9,
  pathSmoothing: 0,
  smoothing: 10,
  centerPull: 0,
}

export const DEFAULT_RAIL_GEOM = {
  wiggleAmp: 0,
  wiggleFreq: 2.5,
  pathSmoothing: 0,
  smoothing: 10,
}

export const LABEL_FONTS = {
  classic: { name: 'Classic',  family: "Georgia, 'Times New Roman', serif" },
  antique: { name: 'Antique',  family: "'IM Fell English', Palatino, 'Book Antiqua', serif" },
  modern:  { name: 'Modern',   family: "'Oswald', 'Arial Narrow', Arial, sans-serif" },
} as const

export type SettlementTier = 1 | 2 | 3 | 4

export interface UrbanStyle {
  buildingCount: number
  roadSetback: number
  slotSpacing: number
  backRowProbability: number
  backRowGap: number
  angleJitter: number
  lShapeProbability: number
  buildingSizeMin: number
  buildingSizeMax: number
  buildingColor: string
  buildingStrokeColor: string
  buildingStrokeWidth: number
}

export const DEFAULT_URBAN_STYLE: UrbanStyle = {
  buildingCount: 29,
  roadSetback: 0,
  slotSpacing: 0.5,
  backRowProbability: 0.25,
  backRowGap: 2,
  angleJitter: 0.20,
  lShapeProbability: 0.05,
  buildingSizeMin: 1.5,
  buildingSizeMax: 2,
  buildingColor: '#5a6040',
  buildingStrokeColor: '#3a4020',
  buildingStrokeWidth: 0,
}

export interface SettlementTierStyle {
  displayMode: 'icon' | 'buildings'
  buildingAlgorithm: 'v1' | 'v2'
  shape: 'circle' | 'square'
  size: number
  fillColor: string
  strokeColor: string
  strokeWidth: number
  buildingCount: number
  roadSetback: number
  slotSpacing: number
  backRowProbability: number
  backRowGap: number
  angleJitter: number
  lShapeProbability: number
  buildingSizeMin: number
  buildingSizeMax: number
  buildingV2Size: number
  buildingV2Spacing: number
  buildingV2MergeChance: number
  buildingColor: string
  buildingStrokeColor: string
  buildingStrokeWidth: number
}

export const DEFAULT_SETTLEMENT_TIER_STYLES: Record<SettlementTier, SettlementTierStyle> = {
  1: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 6,   fillColor: '#c0392b', strokeColor: '#ffffff', strokeWidth: 1.2, buildingCount: 29, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  2: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 4.5, fillColor: '#2c3e50', strokeColor: '#ffffff', strokeWidth: 1.0, buildingCount: 18, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  3: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 3.0, fillColor: '#34495e', strokeColor: '#ffffff', strokeWidth: 0.8, buildingCount: 10, roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
  4: { displayMode: 'icon', buildingAlgorithm: 'v2', shape: 'circle', size: 2.0, fillColor: '#7f8c8d', strokeColor: '#ffffff', strokeWidth: 0.6, buildingCount: 4,  roadSetback: 0, slotSpacing: 0.5, backRowProbability: 0.25, backRowGap: 2, angleJitter: 0.20, lShapeProbability: 0.05, buildingSizeMin: 1.5, buildingSizeMax: 2, buildingV2Size: 2, buildingV2Spacing: 1, buildingV2MergeChance: 0.3, buildingColor: '#5a6040', buildingStrokeColor: '#3a4020', buildingStrokeWidth: 0 },
}

export interface Settlement {
  name: string
  type: 'city' | 'town' | 'village'
  population: number
  lon: number
  lat: number
  hex_q: number | null
  hex_r: number | null
  included: boolean
  isCustom?: boolean
  tier?: SettlementTier
  labelOverride?: Partial<LabelSpec>
}

export interface IconOverlay {
  id: string
  name: string
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star'
  fillColor: string
  strokeColor: string
  strokeWidth: number
  size: number
}

export interface LabelOverlay {
  id: string
  name: string
  textColor: string
  bgColor: string
  strokeColor: string
  strokeWidth: number
  textSize: number
  opacity: number
}

export interface HexHighlight {
  id: string
  name: string
  color: string
  mode: 'area' | 'edge' | 'line'
  fillEnabled: boolean
  fillOpacity: number
  strokeEnabled: boolean
  strokeOpacity: number
  strokeWidth: number
  joinNeighbors: boolean
  smoothing: number
  fillPattern: 'none' | 'hatched'
  fillPatternSpacing: number
  linePattern: 'none' | 'dotted' | 'dashed' | 'dashdot'
  linePatternSide: 'left' | 'right' | 'center'
  patternSpacing: number
}

export interface RawRoadWay {
  highway: string
  coords: [number, number][]
}

export interface HexRoadPath {
  highway: string
  hexes: [number, number][]
}

export interface RoadHex {
  q: number
  r: number
  highway: string
  connections: { q: number; r: number }[]
}

export const TIER_HIGHWAYS: [string[], string[], string[]] = [
  ['motorway', 'trunk'],
  ['primary', 'secondary'],
  ['tertiary'],
]

export const HIGHWAY_TO_TIER: Record<string, 0 | 1 | 2> = {
  motorway: 0, trunk: 0,
  primary: 1, secondary: 1,
  tertiary: 2,
}

export interface RoadEdge {
  q1: number
  r1: number
  q2: number
  r2: number
  tier: 0 | 1 | 2
  manual?: boolean
}

export function edgeBlobCanonicalKey(q1: number, r1: number, q2: number, r2: number): string {
  const a = `${q1},${r1}`, b = `${q2},${r2}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function roadEdgeCanonicalKey(q1: number, r1: number, q2: number, r2: number, tier: 0 | 1 | 2): string {
  const a = `${q1},${r1}`, b = `${q2},${r2}`
  return `${tier}:${a < b ? `${a}|${b}` : `${b}|${a}`}`
}

export interface RiverEdge {
  q1: number; r1: number; q2: number; r2: number
  tier?: RiverTier   // undefined = legacy, treated as tier 1
}

export interface OsmRiverWay {
  name: string
  type: string   // OSM waterway tag: 'river' | 'stream' | 'drain' | 'canal' | …
  coords: [number, number][]
  segments: [number, number][][]
  edges: { q1: number; r1: number; q2: number; r2: number }[]
  width_multiplier: number
}

export interface RawRailWay {
  railway: string
  coords: [number, number][]
}

export interface HexRailPath {
  railway: string
  hexes: [number, number][]
}

export interface RailHex {
  q: number
  r: number
  railway: string
  connections: { q: number; r: number }[]
}

export interface RailEdge {
  q1: number
  r1: number
  q2: number
  r2: number
  manual?: boolean
}

export function railEdgeCanonicalKey(q1: number, r1: number, q2: number, r2: number): string {
  const a = `${q1},${r1}`, b = `${q2},${r2}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export interface UndoSnapshot {
  terrainHexes: Array<{ q: number; r: number; terrain: string; manual_override: boolean; elevation_class: 'flat' | 'hills' | 'mountains' | null; elevation_manual_override: boolean }>
  roadEdges: RoadEdge[]
  railEdges: RailEdge[]
  riverEdges: RiverEdge[]
  settlements: Settlement[]
}

export interface GenerateProgress {
  step: string
  message: string
  progress: number
}

export type MapStore =
  SetupSlice &
  TerrainSlice &
  ElevationSlice &
  SettlementsSlice &
  RoadsSlice &
  RailsSlice &
  RiversSlice &
  HighlightsSlice &
  IconsSlice &
  LabelsSlice &
  UndoSlice &
  UiSlice &
  BridgesSlice &
  MegaHexSlice &
  PresetsSlice &
  MapImageSlice &
  LabelOffsetsSlice

export const useMapStore = create<MapStore>()(persist((set, get) => ({
  ...createSetupSlice(set, get),
  ...createTerrainSlice(set, get),
  ...createElevationSlice(set, get),
  ...createSettlementsSlice(set, get),
  ...createRoadsSlice(set, get),
  ...createRailsSlice(set, get),
  ...createRiversSlice(set, get),
  ...createHighlightsSlice(set, get),
  ...createIconsSlice(set, get),
  ...createLabelsSlice(set, get),
  ...createUndoSlice(set, get),
  ...createUiSlice(set, get),
  ...createBridgesSlice(set, get),
  ...createMegaHexSlice(set),
  ...createPresetsSlice(set, get),
  ...createMapImageSlice(set, get),
  ...createLabelOffsetsSlice(set),
}), {
  name: 'ig2-map-store',
  storage: createJSONStorage(() => ({
    getItem: (name) => idbGet(name).catch(() => null),
    setItem: (name, value) => idbSet(name, value).catch(() => {}),
    removeItem: (name) => idbDel(name).catch(() => {}),
  })),
  partialize: (s) => ({
    step: s.step,
    paperSize: s.paperSize,
    orientation: s.orientation,
    pageGrid: s.pageGrid,
    hexSizeMm: s.hexSizeMm,
    hexOrientation: s.hexOrientation,
    marginMm: s.marginMm,
    hexEdgeMode: s.hexEdgeMode,
    generatedHexes: s.generatedHexes,
    generatedMetadata: s.generatedMetadata,
    terrainRules: s.terrainRules,
    disabledTerrains: Array.from(s.disabledTerrains) as unknown as Set<string>,
    settlements: s.settlements,
    settlementsStatus: s.settlementsStatus,
    settlementsLimit: s.settlementsLimit,
    settlementsTypes: s.settlementsTypes,
    settlementTierThresholds: s.settlementTierThresholds,
    settlementsAutoPlace: s.settlementsAutoPlace,
    settlementTierStyles: s.settlementTierStyles,
    showSettlementLabels: s.showSettlementLabels,
    settlementLabelFont: s.settlementLabelFont,
    settlementLabelColor: s.settlementLabelColor,
    settlementLabelSizeScale: s.settlementLabelSizeScale,
    settlementLabelOverrides: s.settlementLabelOverrides,
    roadEdges: s.roadEdges,
    roadsDisplayMode: s.roadsDisplayMode,

    roadsVisibleTiers: s.roadsVisibleTiers,
    roadsStatus: s.roadsStatus,
    railEdges: s.railEdges,
    railsFetchTypes: s.railsFetchTypes,
    railsStatus: s.railsStatus,
    riverEdges: s.riverEdges,
    riverSegmentProps: s.riverSegmentProps,
    riverHopProps: s.riverHopProps,
    riverStyle: s.riverStyle,
    riverChainOverrides: s.riverChainOverrides,
    // riverFlowStyle / riverWiggliness — detached
    riverCurveSteps: s.riverCurveSteps,
    riverWobble: s.riverWobble,
    riverDetail: s.riverDetail,
    showRiverLabels: s.showRiverLabels,
    riverLabelColor: s.riverLabelColor,
    elevationStatus: s.elevationStatus,
    classificationParams: s.classificationParams,
    hillshadeEnabled: s.hillshadeEnabled,
    hillshadeAzimuth: s.hillshadeAzimuth,
    hillshadeAltitude: s.hillshadeAltitude,
    hillshadeIntensity: s.hillshadeIntensity,
    hillshadeMode: s.hillshadeMode,
    hillshadeDisabledTerrains: s.hillshadeDisabledTerrains,
    hillshadeDisabledElevClasses: s.hillshadeDisabledElevClasses,
    contoursEnabled: s.contoursEnabled,
    contourInterval: s.contourInterval,
    contourBaseElevation: s.contourBaseElevation,
    contourSmoothPasses: s.contourSmoothPasses,
    contourLineWidth: s.contourLineWidth,
    contourIndexEvery: s.contourIndexEvery,
    contourIndexWidthMult: s.contourIndexWidthMult,
    contourColor: s.contourColor,
    contourOpacity: s.contourOpacity,
    contourDisabledTerrains: s.contourDisabledTerrains,
    contourDisabledElevClasses: s.contourDisabledElevClasses,
    elevationImportEnabled: s.elevationImportEnabled,
    elevationOverridesTerrain: s.elevationOverridesTerrain,
    elevationTypeBlobStyles: s.elevationTypeBlobStyles,
    heightmapMeta: s.heightmapMeta,
    activePanel: s.activePanel,
    mapStyle: s.mapStyle,
    hexBorderMode: s.hexBorderMode,
    hexBorderOpacity: s.hexBorderOpacity,
    hexBorderColor: s.hexBorderColor,
    hexBorderDifference: s.hexBorderDifference,
    terrainDisplacement: s.terrainDisplacement,
    terrainNoiseFrequency: s.terrainNoiseFrequency,
    terrainNoiseSeed: s.terrainNoiseSeed,
    terrainNoiseOctaves: s.terrainNoiseOctaves,
    illustratedStyle: s.illustratedStyle,
    riverTierStyles: s.riverTierStyles,
    riverWidthScale: s.riverWidthScale,
    riverWiggleAmp: s.riverWiggleAmp,
    riverWiggleFreq: s.riverWiggleFreq,
    riverSmoothing: s.riverSmoothing,
    riverPathSmoothing: s.riverPathSmoothing,
    riverBlobCutEnabled: s.riverBlobCutEnabled,
    riverBlobCutWidth: s.riverBlobCutWidth,
    roadWiggleAmp: s.roadWiggleAmp,
    roadWiggleFreq: s.roadWiggleFreq,
    roadSmoothing: s.roadSmoothing,
    roadSegmentProps: s.roadSegmentProps,
    roadHopProps: s.roadHopProps,
    roadTierStyles: s.roadTierStyles,
    roadChainOverrides: s.roadChainOverrides,
    roadControlOverrides: s.roadControlOverrides,
    roadSnapBindings: s.roadSnapBindings,
    roadPathSmoothing: s.roadPathSmoothing,
    roadCenterPull: s.roadCenterPull,
    roadDensityMinChain: s.roadDensityMinChain,
    railStyle: s.railStyle,
    railControlOverrides: s.railControlOverrides,
    railSnapBindings: s.railSnapBindings,
    railWiggleAmp: s.railWiggleAmp,
    railWiggleFreq: s.railWiggleFreq,
    railSmoothing: s.railSmoothing,
    railChainOverrides: s.railChainOverrides,
    railSegmentProps: s.railSegmentProps,
    railHopProps: s.railHopProps,
    railPathSmoothing: s.railPathSmoothing,
    railGeomOverride: s.railGeomOverride,
    roadTierGeometry: s.roadTierGeometry,
    woodsHexStyle: s.woodsHexStyle,
    blobSize: s.blobSize,
    blobCount: s.blobCount,
    showBridges: s.showBridges,
    urbanHexes: s.urbanHexes,
    urbanStyle: s.urbanStyle,
    urbanDisplayMode: s.urbanDisplayMode,
    urbanScale: s.urbanScale,
    urbanVertexRatio: s.urbanVertexRatio,
    urbanNoise: s.urbanNoise,
    urbanBuildingCount: s.urbanBuildingCount,
    urbanBuildingSize: s.urbanBuildingSize,
    terrainEdgePaintEnabled: s.terrainEdgePaintEnabled,
    edgeBlobPainted: s.edgeBlobPainted,
    edgeBlobWidth: s.edgeBlobWidth,
    edgeBlobOverrides: s.edgeBlobOverrides,
    terrainBlobOverrides: s.terrainBlobOverrides,
    terrainTypeBlobStyles: s.terrainTypeBlobStyles,
    terrainBlobSmooth: s.terrainBlobSmooth,
    terrainBlobOffset: s.terrainBlobOffset,
    terrainBlobBump: s.terrainBlobBump,
    terrainBlobSweepFreq: s.terrainBlobSweepFreq,
    terrainBlobLobeFreq: s.terrainBlobLobeFreq,
    terrainBlobLobeAmp: s.terrainBlobLobeAmp,
    terrainBlobLobeThreshold: s.terrainBlobLobeThreshold,
    terrainBlobLobeDirection: s.terrainBlobLobeDirection,
    terrainBlobSimplify: s.terrainBlobSimplify,
    terrainBlobTopoStyle: s.terrainBlobTopoStyle,
    terrainBlobSplatDensity: s.terrainBlobSplatDensity,
    terrainBlobSplatSize: s.terrainBlobSplatSize,
    terrainBlobHoleDensity: s.terrainBlobHoleDensity,
    terrainBlobHoleSize: s.terrainBlobHoleSize,
    terrainBlobOutlineEnabled: s.terrainBlobOutlineEnabled,
    terrainBlobOutlineColor: s.terrainBlobOutlineColor,
    terrainBlobOutlineWidth: s.terrainBlobOutlineWidth,
    terrainBlobEffect: s.terrainBlobEffect,
    realisticCoastline: s.realisticCoastline,
    beachStrip: s.beachStrip,
    beachColor: s.beachColor,
    beachWidth: s.beachWidth,
    hillsColor: s.hillsColor,
    mountainsColor: s.mountainsColor,
    reliefShadingOpacity: s.reliefShadingOpacity,
    coastlineDPEpsilon: s.coastlineDPEpsilon,
    coastlineChaikinPasses: s.coastlineChaikinPasses,
    terrainColors: s.terrainColors,
    terrainTextureScales: s.terrainTextureScales,
    terrainTextureBlendModes: s.terrainTextureBlendModes,
    terrainTextureOpacities: s.terrainTextureOpacities,
    terrainTextureTintColors: s.terrainTextureTintColors,
    terrainTextureTintOpacities: s.terrainTextureTintOpacities,
    terrainTextureFile: s.terrainTextureFile,
    terrainTextureEnabled: s.terrainTextureEnabled,
    terrainRenderMode: s.terrainRenderMode,
    customTerrains: s.customTerrains,
    blobSeeds: s.blobSeeds,
    blobHandleOverrides: s.blobHandleOverrides,
    blobMaskEdits: s.blobMaskEdits,
    waterBlobSmooth: s.waterBlobSmooth,
    waterBlobOffset: s.waterBlobOffset,
    waterBlobBump: s.waterBlobBump,
    waterBlobSweepFreq: s.waterBlobSweepFreq,
    waterBlobLobeFreq: s.waterBlobLobeFreq,
    waterBlobLobeAmp: s.waterBlobLobeAmp,
    waterBlobLobeThreshold: s.waterBlobLobeThreshold,
    waterBlobLobeDirection: s.waterBlobLobeDirection,
    waterOverrides: s.waterOverrides,
    highlights: s.highlights,
    highlightedHexes: s.highlightedHexes,
    highlightLines: s.highlightLines,
    highlightEdgePaths: s.highlightEdgePaths,
    iconOverlays: s.iconOverlays,
    placedIcons: s.placedIcons,
    labelOverlays: s.labelOverlays,
    placedLabels: s.placedLabels,
    showPaperTexture: s.showPaperTexture,
    paperTextureOpacity: s.paperTextureOpacity,
    showPaperVignette: s.showPaperVignette,
    bridgesEnabled: s.bridgesEnabled,
    bridgeStyle: s.bridgeStyle,
    bridgeTiers: s.bridgeTiers,
    bridgeOverrides: s.bridgeOverrides,
    mapBgColor: s.mapBgColor,
    mapBorderEnabled: s.mapBorderEnabled,
    mapBorderColor: s.mapBorderColor,
    mapBorderWidth: s.mapBorderWidth,
    clipToHexGrid: s.clipToHexGrid,
    excludedHexKeys: s.excludedHexKeys,
    disabledHexKeys: s.disabledHexKeys,
    autoDisabledOceanHexKeys: s.autoDisabledOceanHexKeys,
    hexNumbersEnabled: s.hexNumbersEnabled,
    hexNumberStartCorner: s.hexNumberStartCorner,
    hexNumberEdge: s.hexNumberEdge,
    hexNumberColor: s.hexNumberColor,
    hexNumberFontScale: s.hexNumberFontScale,
    megaHexEnabled: s.megaHexEnabled,
    megaHexRadius: s.megaHexRadius,
    megaHexColor: s.megaHexColor,
    megaHexOpacity: s.megaHexOpacity,
    megaHexLineWidth: s.megaHexLineWidth,
    megaHexOriginQ: s.megaHexOriginQ,
    megaHexOriginR: s.megaHexOriginR,
    dataSource: s.dataSource,
    mapImageTransform: s.mapImageTransform,
    mapImageOpacity: s.mapImageOpacity,
    mapTitle: s.mapTitle,
    labelOffsets: s.labelOffsets,
    labelPresetId: s.labelPresetId,
    labelOverrides: s.labelOverrides,
  }),
  version: 82,
  migrate: migratePersisted,
  merge: (persisted, current) => rehydrateState({ ...current, ...(persisted as Partial<MapStore>) }),
}))
