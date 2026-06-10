# CLAUDE.md

## What this project is

IG2 is a print-ready hex map generator for board game wargaming cartography. The user positions a viewport over a real-world slippy map, chooses paper format and hex size, then generates a hex grid with terrain, elevation, settlements, roads, rails, rivers, and highlights — all sourced from OpenStreetMap and elevation APIs. The output is a styled SVG/canvas render that can be exported as a PDF.

**Two-step flow:**
1. **Setup** — paper size, hex size, orientation, margin, edge treatment. Locked after generation.
2. **Terrain** — everything else: generate map, fetch OSM layers, paint/edit, style, export.

The left sidebar shows domain panels (Terrain, Roads, Settlements, Rivers, Highlights, Display). Each panel has generation controls at the top and style/paint tools below.

---

## Frontend architecture

### Zustand store — slice pattern

`src/store/mapStore.ts` is the single store, but all state and actions live in domain slices under `src/store/slices/`. Each slice exports a `XxxSlice` type and a `createXxxSlice(set, get)` factory. `MapStore` is the intersection of all slice types.

Slices import types and constants from `mapStore.ts` using circular imports:
- `import type { MapStore }` — safe, erased at compile time
- `import { someConstant }` — safe **only inside function bodies** (called after module init)
- **Never access a circular-imported `const` at module top level** — it hits the temporal dead zone and causes a white screen. We learned this the hard way with `LAKE_COLOR` in `riversSlice.ts`.

### Persist / migration

State is persisted to localStorage via Zustand's `persist` middleware. Current schema version: **9**. When adding new persisted state:
1. Bump `version` in `mapStore.ts`
2. Add a migration step in `uiSlice.ts → migratePersisted()`
3. `rehydrateState()` (also in `uiSlice.ts`) handles post-load fixups (e.g. `disabledTerrains` is serialized as array, restored as `Set`)

### Canvas rendering — lib files

All rendering logic lives in `src/lib/`, not in components. Each file is pure canvas — no React, no store imports except types:

| File | What it renders |
|---|---|
| `drawTerrain.ts` | Hex fills, terrain blobs, textures, lakes, coastline |
| `drawHighlights.ts` | Highlight fills, joined borders, line-pattern decorators |
| `drawBuildings.ts` | Building placement algorithm and cache replay |
| `drawRivers.ts` | Rivers and canals with variable-width strokes |
| `drawRoadsRails.ts` | Road tiers, junctions, rail cross/line styles |
| `drawSettlements.ts` | Settlement icons and 8-candidate label placement |
| `drawHexBorders.ts` | Hex grid border stroke/dot modes |

Supporting geometry and data libs:

| File | What it contains |
|---|---|
| `geometry.ts` | Math: hexAdjacent, catmullRom, chaikin, offsetPolyline, pointInPolygon, … |
| `noise.ts` | Perlin noise, mulberry32, perturbation helpers |
| `projection.ts` | projectToCanvas, unprojectFromCanvas, computePaper |
| `terrainBlobs.ts` | Blob geometry generation (V1/V2), field canvas, coastline runs |
| `riverChains.ts` | Chain topology (buildRiverChains), smoothing, wobble, taper ordering |
| `roadChains.ts` | Catmull-Rom road/rail chain splines, junction detection |

**`TerrainViewCanvas.tsx`** (~2400 lines) is now only refs, hooks, effects, the draw compositor, and JSX. Don't add rendering logic there — put it in the appropriate lib file or create a new one.

**Rule: new canvas rendering logic always goes in `src/lib/`, never inline in a component.** Each lib function takes an explicit params struct so it's testable and reusable without React.

### Shared UI primitives — `src/components/ui.tsx`

`SliderRow`, `ResetButton`, and `SectionLabel` live in `ui.tsx`. **Before writing any of these patterns inline, import from there.** If a new pattern appears in more than one place, add it to `ui.tsx` instead of duplicating it.

- `SliderRow` — label+value header with either a built-in `<input type="range">` (pass `min/max/step/onChange`) or custom children
- `ResetButton` — `↺` icon; `confirm={true}` (default) = two-step "Sure?", `confirm={false}` = immediate
- `SectionLabel` — uppercase sidebar section header with optional `action` slot on the right

---

## Backend architecture

FastAPI + async Python. Two shared utility modules every service should use:

- `services/geometry.py` — `compute_bbox()`, `make_lonlat_to_hex()`, `polyline_to_hex_sequence()`, `smooth_hex_path()`, `METERS_PER_DEGREE`
- `services/overpass.py` — `post_overpass(query, timeout)` with retry across 3 mirror endpoints

All request configs inherit from `BaseRegionConfig` in `models.py` (`center_lon`, `center_lat`, `bearing`, `width_m`, `height_m`). Don't duplicate these fields in new endpoints.

Terrain generation and elevation use SSE streaming (`/terrain-stream`, `/elevation-stream`) for progressive hex updates.

---

## Working style

- **Commit after every logical change.** Each self-contained fix, feature, or refactor gets its own commit before moving on. This makes reverting any single step a simple `git reset --hard <sha>` without losing unrelated work.
- Before starting a multi-step task, commit (or ask the user to commit) the current working state as a checkpoint.

---

## Conventions

- No comments unless the *why* is non-obvious (hidden constraint, workaround, subtle invariant)
- Slices own their domain's state and actions fully — cross-slice mutations go through `set()` on the full store, which is fine
- Keep `mapStore.ts` to shared types/constants/exports only — no logic there
- **Canvas rendering belongs in `src/lib/`, not in components.** If you're writing a `for` loop that touches a `CanvasRenderingContext2D`, it goes in a lib file with an explicit params struct, not inline in a `useCallback`
- **New lib files are cheap — use them.** One rendering domain = one file. Don't append unrelated logic to an existing lib file just because it's convenient
- **`draw()` is a pure render pass — no heavy computation inline.** Any derived data that feeds into `draw()` must be computed outside it, behind its own dirty flag and cache ref. The pattern: a `useEffect` watches the relevant inputs and marks a dirty flag; `draw()` checks the flag, rebuilds the cache if needed, then reads from the cache. Never move computation into `draw()` unconditionally — it runs on every frame (pan, zoom, any interaction) and will cause lag.
