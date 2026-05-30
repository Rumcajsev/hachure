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
import { type AreasSlice, createAreasSlice } from './slices/areasSlice'
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

export interface RoadV3TierGeom {
  cornerRoundness: number
  pathStraightness: number
  segmentVariation: number
  variationCharacter: number
}

export const DEFAULT_ROAD_V3_TIER_GEOM: [RoadV3TierGeom, RoadV3TierGeom, RoadV3TierGeom] = [
  { cornerRoundness: 0.8, pathStraightness: 0.8, segmentVariation: 0.00, variationCharacter: 0 },
  { cornerRoundness: 0.6, pathStraightness: 0.5, segmentVariation: 0.06, variationCharacter: 1 },
  { cornerRoundness: 0.3, pathStraightness: 0.2, segmentVariation: 0.12, variationCharacter: 2 },
]

export interface MapArea {
  id: string
  name: string
  color: string
  labelOffset?: [number, number]
}

export interface AreasStyle {
  borderWidth: number
  labelSize: number
  borderColor: string
}

export interface AreasGenParams {
  targetSize: number
  riverWeight: number
  terrainWeight: number
}

export const DEFAULT_AREAS_STYLE: AreasStyle = { borderWidth: 2.0, labelSize: 1.0, borderColor: '#2c1a00' }
export const DEFAULT_AREAS_GEN_PARAMS: AreasGenParams = { targetSize: 8, riverWeight: 0.7, terrainWeight: 2.0 }

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
  clearingChance?: number
  satelliteChance?: number
  patchSize?: number
  textureScale?: number
  enabled?: boolean
  width?: number
}


export interface ClassificationParams {
  mountainsPct: number  // top X% by either signal → mountains
  hillsPct: number      // next Y% by either signal → hills
  rangeFloorM: number   // min range_m for the ruggedness signal to activate
  medianFloorM: number  // min median_m for the height signal to activate
}

export const DEFAULT_CLASSIFICATION_PARAMS: ClassificationParams = {
  mountainsPct: 15,
  hillsPct: 25,
  rangeFloorM: 50,
  medianFloorM: 300,
}

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1'
export type Orientation = 'portrait' | 'landscape'
export type HexOrientation = 'flat' | 'pointy'
export type HexEdgeMode = 'whole' | 'half'

export interface BlobPatch {
  id: string
  terrain: string
  mode: 'add' | 'cut'
  points: [number, number][]
}

export type ActiveTool =
  | { type: 'none' }
  | { type: 'terrain'; brush: string }
  | { type: 'elevation'; brush: 'flat' | 'hills' | 'mountains' }
  | { type: 'lake' }
  | { type: 'road'; tier: 0 | 1 | 2; erasing: boolean }
  | { type: 'rail'; erasing: boolean }
  | { type: 'node-edit' }
  | { type: 'river-node-edit' }
  | { type: 'river-paint' }
  | { type: 'river-select' }
  | { type: 'canal-paint' }
  | { type: 'canal-select' }
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
  | { type: 'areas-draw' }
  | { type: 'areas-erase' }
  | { type: 'align-image' }
  | { type: 'blob-draw'; mode: 'add' | 'cut' }
  | { type: 'label-drag' }

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
  coverage: Record<string, number>
  partial: boolean
  manual_override?: boolean
  backgroundTerrain?: string
  isLake?: boolean
  lakeManualOverride?: boolean
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
  /** Exterior ring(s) of the full WorldCover land polygon, [[lon, lat], …].
   *  Sent before hex clipping so the frontend can smooth it globally. */
  coastline_boundary?: [number, number][][]
}

export const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
}

export const TERRAIN_COLORS: Record<string, string> = {
  clear: '#ede8d5',
  woods: '#4d7a50',
  light_woods: '#8aaa6a',
  rough: '#9e8c6a',
  marsh: '#6b9e8a',
  sea: '#3a6898',
  river: '#7ab0c8',
  beach: '#dfd0a0',
}

export interface CustomTerrain {
  id: string
  name: string
  color: string
  textureId: string | null
}

export const LAKE_COLOR = '#5888b0'

export interface RiverStyleConfig {
  color: string
  strokeEnabled: boolean
  strokeColor: string
  strokeWidth: number
}

export const DEFAULT_RIVER_STYLE: RiverStyleConfig = {
  color: LAKE_COLOR,
  strokeEnabled: false,
  strokeColor: '#2a4a6a',
  strokeWidth: 0.4,
}

export const DEFAULT_CANAL_STYLE: RiverStyleConfig = {
  color: '#6a9a8a',
  strokeEnabled: true,
  strokeColor: '#3a5a4a',
  strokeWidth: 0.5,
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
  ['A4', 'A3', 'A2', 'A1'] as PaperSize[]
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

export const TERRAIN_PRIORITY = ['clear', 'light_woods', 'woods', 'rough', 'marsh', 'sea', 'beach'] as const

/** Terrains that are manual-paint only — excluded from auto-classification sliders. */
export const MANUAL_ONLY_TERRAINS = new Set(['beach'])

export const DEFAULT_THRESHOLDS: Record<string, number> = {
  sea: 0.4,
  marsh: 0.2,
  woods: 0.3,
  light_woods: 0.15,
  rough: 0.25,
  clear: 0,
}

export type RoadDashStyle = 'solid' | 'dashed' | 'dotted'

export interface RoadTierStyle {
  outer: string
  inner: string
  outerW: number
  caseDash: RoadDashStyle
  fillDash: RoadDashStyle
  roughness: number
  bowing: number
}

export const DEFAULT_ROAD_TIER_STYLES: [RoadTierStyle, RoadTierStyle, RoadTierStyle] = [
  { outer: '#ffe8a8', inner: '#b07820', outerW: 4.5, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
  { outer: '#f0e0b8', inner: '#8a5c2a', outerW: 3.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
  { outer: '#d8d8c0', inner: '#606060', outerW: 2.0, caseDash: 'solid', fillDash: 'solid', roughness: 0.3, bowing: 0.5 },
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
  clearingChance: 0,
  satelliteChance: 0,
  patchSize: 0.2,
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

export const DEFAULT_CANAL_GEOM = {
  widthScale: 0.45,
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

export interface OsmRiverWay {
  name: string
  type: 'river' | 'canal'
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
  terrainHexes: Array<{ q: number; r: number; terrain: string; manual_override: boolean; isLake: boolean; elevation_class: 'flat' | 'hills' | 'mountains' | null; elevation_manual_override: boolean }>
  roadEdges: RoadEdge[]
  railEdges: RailEdge[]
  riverEdges: { q1: number; r1: number; q2: number; r2: number }[]
  settlements: Settlement[]
  areas?: MapArea[]
  areaHexes?: Record<string, string>
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
  AreasSlice &
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
  ...createAreasSlice(set, get),
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
    hexSizeMm: s.hexSizeMm,
    hexOrientation: s.hexOrientation,
    marginMm: s.marginMm,
    hexEdgeMode: s.hexEdgeMode,
    generatedHexes: s.generatedHexes,
    generatedMetadata: s.generatedMetadata,
    thresholds: s.thresholds,
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
    canalEdges: s.canalEdges,
    riverSegmentProps: s.riverSegmentProps,
    canalSegmentProps: s.canalSegmentProps,
    riverHopProps: s.riverHopProps,
    riverStyle: s.riverStyle,
    canalStyle: s.canalStyle,
    riverChainOverrides: s.riverChainOverrides,
    // riverFlowStyle / riverWiggliness — detached
    riverCurveSteps: s.riverCurveSteps,
    riverWobble: s.riverWobble,
    riverDetail: s.riverDetail,
    showRiverLabels: s.showRiverLabels,
    riverLabelColor: s.riverLabelColor,
    elevationStatus: s.elevationStatus,
    classificationParams: s.classificationParams,
    hillshadeAzimuth: s.hillshadeAzimuth,
    hillshadeAltitude: s.hillshadeAltitude,
    hillshadeIntensity: s.hillshadeIntensity,
    contoursEnabled: s.contoursEnabled,
    contourInterval: s.contourInterval,
    contourBaseElevation: s.contourBaseElevation,
    contourSmoothPasses: s.contourSmoothPasses,
    contourLineWidth: s.contourLineWidth,
    activePanel: s.activePanel,
    hexBorderMode: s.hexBorderMode,
    terrainDisplacement: s.terrainDisplacement,
    terrainNoiseFrequency: s.terrainNoiseFrequency,
    terrainNoiseSeed: s.terrainNoiseSeed,
    terrainNoiseOctaves: s.terrainNoiseOctaves,
    illustratedStyle: s.illustratedStyle,
    riverWidthScale: s.riverWidthScale,
    canalWidthScale: s.canalWidthScale,
    riverWiggleAmp: s.riverWiggleAmp,
    riverWiggleFreq: s.riverWiggleFreq,
    riverSmoothing: s.riverSmoothing,
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
    roadRenderVersion: s.roadRenderVersion,
    roadV3TierGeom: s.roadV3TierGeom,
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
    edgeBlobSmooth: s.edgeBlobSmooth,
    edgeBlobOffset: s.edgeBlobOffset,
    edgeBlobBump: s.edgeBlobBump,
    edgeBlobSweepFreq: s.edgeBlobSweepFreq,
    edgeBlobLobeFreq: s.edgeBlobLobeFreq,
    edgeBlobLobeAmp: s.edgeBlobLobeAmp,
    edgeBlobLobeThreshold: s.edgeBlobLobeThreshold,
    edgeBlobLobeDirection: s.edgeBlobLobeDirection,
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
    realisticCoastline: s.realisticCoastline,
    beachStrip: s.beachStrip,
    beachColor: s.beachColor,
    beachWidth: s.beachWidth,
    terrainColors: s.terrainColors,
    terrainTextureScales: s.terrainTextureScales,
    terrainRenderMode: s.terrainRenderMode,
    autoLakesEnabled: s.autoLakesEnabled,
    lakeSensitivity: s.lakeSensitivity,
    lakeBlobSmooth: s.lakeBlobSmooth,
    lakeBlobOffset: s.lakeBlobOffset,
    lakeBlobBump: s.lakeBlobBump,
    lakeBlobSweepFreq: s.lakeBlobSweepFreq,
    lakeBlobLobeFreq: s.lakeBlobLobeFreq,
    lakeBlobLobeAmp: s.lakeBlobLobeAmp,
    lakeBlobLobeThreshold: s.lakeBlobLobeThreshold,
    lakeBlobLobeDirection: s.lakeBlobLobeDirection,
    lakeOverrides: s.lakeOverrides,
    highlights: s.highlights,
    highlightedHexes: s.highlightedHexes,
    highlightLines: s.highlightLines,
    highlightEdgePaths: s.highlightEdgePaths,
    areasMode: s.areasMode,
    areas: s.areas,
    areaHexes: s.areaHexes,
    areasStyle: s.areasStyle,
    areasGenParams: s.areasGenParams,
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
  }),
  version: 65,
  migrate: migratePersisted,
  merge: (persisted, current) => rehydrateState({ ...current, ...(persisted as Partial<MapStore>) }),
}))
