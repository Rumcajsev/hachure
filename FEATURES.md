# IG2 Feature Reference

High-level inventory of every feature in the app. Use this to track what exists, what's active, and what's a candidate for removal.

**Status legend:** ✅ Active · ⚠️ Partial/questionable · 🗑️ Dead/legacy candidate

> **🗑️ No-UI summary** — confirmed dead/orphaned state with no UI controls:
> `terrainDisplacement`, `terrainNoiseFrequency`, `terrainNoiseOctaves`, `illustratedStyle`,
> `fieldFreq/Amp/Octaves/Persistence/Wildness` (all in `uiSlice`),
> `riverCurveSteps`, `riverWobble`, `riverDetail` (bypassed by `RIVER_V2=true` compile flag),
> `roadDensityMinChain`, `contourSmoothPasses`, `contourIndexEvery`, `contourIndexWidthMult`,
> `mapStyle` setter (no UI toggle — always `'standard'`; historical style code is unreachable)

---

## Terrain

| Feature | Status | Notes |
|---|---|---|
| Blob rendering | ✅ | Catmull-Rom smoothing, noise deformation, lobe/sweep patterns |
| Classification rules | ✅ | OSM coverage → terrain type; manual per-hex override |
| Custom terrain types | ✅ | User-defined color + label |
| Edge blobs | ✅ | Blobs bleeding off map edge |
| Texture system | ✅ | Per-terrain texture file, blend mode, opacity, tint, scale |
| Coastline realism | ✅ | Smooth ocean edge treatment |
| Relief shading | ✅ | Subtle per-terrain relief pass |
| Blank map mode | ✅ | Render with no terrain data |
| WorldCover overlay | ✅ | ESA land-cover raster for classification assist |
| Field-mode params | 🗑️ | `fieldFreq/Amp/Octaves/Persistence/Wildness` — in state, setters exist, never read in rendering |

---

## Elevation

| Feature | Status | Notes |
|---|---|---|
| DEM fetching | ✅ | GEBCO/SRTM tile-based heightmap |
| Hillshade | ✅ | Azimuth/altitude/intensity, smooth vs. hard mode, per-terrain/class filters |
| Contour lines | ✅ | Interval, index lines, smoothing, color/opacity |
| Elevation classification | ✅ | Flat/hills/mountains assignment with threshold controls |
| Elevation paint | ✅ | Manually paint elevation class per hex |
| Elevation debug heatmap | ⚠️ | Raw elevation viz — dev tool, no UI to toggle it on |
| Contour smooth passes | 🗑️ | `contourSmoothPasses` — used in rendering, no slider in UI |
| Contour index settings | 🗑️ | `contourIndexEvery`, `contourIndexWidthMult` — used in rendering, no UI controls |

---

## Roads

| Feature | Status | Notes |
|---|---|---|
| OSM road fetching | ✅ | 3-tier system (minor/main/highway) |
| Road paint/erase | ✅ | Brush by tier |
| Node edit mode | ✅ | Drag control points, snap bindings |
| Per-tier geometry | ✅ | cornerRoundness, pathStraightness, centerPull, segmentVariation |
| Per-segment overrides | ✅ | Wiggle amplitude/frequency, hop properties |
| Settlement routing | ✅ | Auto-route roads between settlement hexes |
| Motorway hex detection | ⚠️ | Special corridor logic — unclear if still needed |
| V3 render pipeline | ✅ | Active renderer |
| V2 render pipeline | ⚠️ | Legacy toggle; `roadChainsV2.ts` + `drawRoadsRailsV2.ts` |
| Road density filter | 🗑️ | `roadDensityMinChain` — silently filters roads in rendering, no UI slider |
| V1 chain code (`roadChains.ts`) | 🗑️ | Superseded by V2/V3 |

---

## Rails

| Feature | Status | Notes |
|---|---|---|
| OSM rail fetching | ✅ | Same topology system as roads |
| Rail paint/erase | ✅ | Brush with eraser |
| Node edit mode | ✅ | Same as roads |
| Per-segment overrides | ✅ | Wiggle, smoothing |
| `rails.py` (backend V1) | 🗑️ | `rails_v2.py` is the active backend |

---

## Rivers & Canals

| Feature | Status | Notes |
|---|---|---|
| OSM waterway fetching | ✅ | 3 tiers: stream / river / canal |
| River paint/erase | ✅ | Brush by tier |
| Node edit mode | ✅ | Drag control points |
| Per-segment properties | ✅ | Width, taper, taperRange, wiggle, pathSmoothing |
| V3 shape pipeline | ✅ | cornerRounds, pointSpacing, noiseAmp, noiseScale |
| Chain overrides | ✅ | Per-chain geometry override |
| `riverFlowStyle` / `riverWiggliness` | 🗑️ | Commented out in migrations — effectively removed |
| V1 river params | 🗑️ | `riverCurveSteps`, `riverWobble`, `riverDetail` — `RIVER_V2=true` is a hardcoded compile flag that zeroes these out; they can never have effect |

---

## Settlements

| Feature | Status | Notes |
|---|---|---|
| OSM settlement fetching | ✅ | Type + population filtering, auto tier assignment |
| Population tier thresholds | ✅ | Configurable cutoffs per tier |
| Custom settlement placement | ✅ | Manually place/move/delete with tier |
| Label preset system | ✅ | Font/size/color per tier, full spec editor |
| Per-settlement label overrides | ✅ | Hide label, dx/dy offset |

---

## Bridges

| Feature | Status | Notes |
|---|---|---|
| Bridge detection | ✅ | Auto-detect road/rail crossings |
| Bridge rendering | ✅ | Plank vs. icon style |
| Per-bridge tier override | ✅ | Manual tier assignment |

---

## Highlights

| Feature | Status | Notes |
|---|---|---|
| Hex fill highlighting | ✅ | Solid color or pattern (dots/dashed/dense/sparse) |
| Line/edge highlighting | ✅ | Hex edge paths with line patterns |
| Paint/erase mode | ✅ | |

---

## Icons & Labels (free-form overlays)

| Feature | Status | Notes |
|---|---|---|
| Custom icon placement | ✅ | Place icons at lon/lat |
| Custom text labels | ✅ | Place/edit free-form text overlays |
| Per-label position offset | ✅ | dx/dy nudge |

---

## Urban Areas

| Feature | Status | Notes |
|---|---|---|
| Urban hex marking | ✅ | Paint hexes as urban |
| Plain fill mode | ✅ | |
| Polygon mode | ✅ | |
| Buildings mode | ✅ | V2 algorithm active |
| Building density/size/noise | ✅ | |
| Buildings V1 algorithm (`drawBuildings.ts`) | 🗑️ | V2 is active; V1 still in codebase |

---

## Hex Display Options

| Feature | Status | Notes |
|---|---|---|
| Hex borders | ✅ | 4 modes: full/stubs/dashed/none; color, opacity, difference toggle |
| Hex numbering | ✅ | Coordinate display; corner, edge distance, color, font scale |
| Terrain displacement/noise | 🗑️ | `terrainDisplacement`, `terrainNoiseFrequency`, `terrainNoiseOctaves` — in state & presets, never read in `TerrainViewCanvas.tsx` or any lib file |
| Illustrated style | 🗑️ | `illustratedStyle` — in state & presets, never read in `TerrainViewCanvas.tsx` or any lib file |
| Paper texture | ✅ | Overlay with opacity + vignette |
| Map background color/border | ✅ | |
| UI scale | ✅ | 0.8 / 1.0 / 1.25 |

---

## Mega-hex Grid

| Feature | Status | Notes |
|---|---|---|
| Overlay grid | ✅ | Larger hex grid over main grid; color/opacity/line width/origin |

---

## Map Image Overlay

| Feature | Status | Notes |
|---|---|---|
| Import & align custom image | ✅ | Translate/scale/rotate, opacity |
| Use image as data source | ⚠️ | Toggle OSM vs. map image — unclear if actively used |

---

## Map Styles

| Feature | Status | Notes |
|---|---|---|
| Standard style | ✅ | Default; hardcoded in practice |
| Historical simple style | 🗑️ | `setMapStyle` is never called from any component — no UI to switch to it; the conditional rendering in TerrainSidebar is unreachable |

---

## Export

| Feature | Status | Notes |
|---|---|---|
| Single-sheet PDF | ✅ | |
| Multi-sheet PDF | ✅ | Page grid layout |

---

## Persistence & Presets

| Feature | Status | Notes |
|---|---|---|
| Undo/redo | ✅ | 50-snapshot stack: terrain, roads, rails, rivers, settlements |
| Style presets | ✅ | Save/load/export/import `.ig2style`; built-in presets |
| localStorage persistence | ✅ | Full state persisted, schema v9 with migrations |

---

## Setup

| Feature | Status | Notes |
|---|---|---|
| Setup wizard | ✅ | Paper size, hex size, orientation, margin, edge treatment |
| Page grid | ✅ | Multi-page layout |
| Viewport positioning | ✅ | Bearing/zoom/center over real-world map |

---

## Backend-only / Infrastructure

| Feature | Status | Notes |
|---|---|---|
| `roads.py` (V1) | 🗑️ | `roads_v2.py` is active |
| `dryrun_waterloo.py` | 🗑️ | Root-level dev script, not part of app |
