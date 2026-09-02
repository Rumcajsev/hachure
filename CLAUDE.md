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

### Canvas rendering — three-tier model

Rendering is split across three directories:

**`src/lib/` — pure draw functions** (no React, no store imports except types)

| File | What it renders |
|---|---|
| `drawTerrain.ts` | Hex fills, terrain blobs, textures, lakes, coastline |
| `drawHighlights.ts` | Highlight fills, joined borders, line-pattern decorators |
| `drawBuildings.ts` | Building placement algorithm and cache replay |
| `drawRivers.ts` | Rivers and canals with variable-width strokes |
| `drawRoadsRails.ts` | Road tiers, junctions, rail cross/line styles |
| `drawSettlements.ts` | Settlement icons and 8-candidate label placement (`excludeLabelId` param skips one label for overlay use) |
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

**`src/render/` — layer controllers + compositor**

Each layer is a module-level singleton controller in `render/layers/`. Controllers wrap a `LayerCache`, expose `markDirty()`, and have a `draw(ctx, input)` method that handles both the offscreen-cached screen path and the direct export path.

| File | Role |
|---|---|
| `layers/terrainLayer.ts` | Terrain + hillshade + contour offscreen layer |
| `layers/highlightsLayer.ts` | Joined highlights layer |
| `layers/riversLayer.ts` | Rivers/canals layer |
| `layers/buildingsLayer.ts` | Urban buildings layer |
| `layers/settlementsLayer.ts` | Settlement icons + label placement; accepts `excludeLabelId` |
| `layers/roadsLayer.ts` | Roads + rail layer |
| `layers/hexBorderLayer.ts` | Hex grid borders |
| `MapRenderer.ts` | Compositor: calls all 7 controllers in order, handles OSM overlay, active-edit overlay, export path |
| `activeEditOverlay.ts` | Thin OffscreenCanvas overlay for O(1) per-frame label drag; singleton `activeEditOverlay` |
| `osmOverlay.ts` | OSM highlight/spotlight overlay (screen-only) |
| `types.ts` | `LayerController` and `RenderInput` contracts |

**`src/interaction/` — event handlers and tools**

| File | Role |
|---|---|
| `types.ts` | `Tool`, `ToolContext`, `HitTarget` contracts (not yet fully wired) |
| `tools/mouseHandlers.ts` | Main pointer-event dispatcher; each tool section is a separate function |
| `tools/terrainPaintTool.ts` | Terrain + elevation paint logic |
| `tools/roadRailPaintTool.ts` | Road/rail paint stroke |
| `tools/controlPointDragTool.ts` | Road/river CP drag |
| `tools/hexDisableTool.ts` | Hex disable/enable painter |
| `tools/hexMaskTool.ts` | Hex mask painter |
| `tools/blobHandleTool.ts` | Terrain blob handle drag |
| `tools/highlightLineTool.ts` | Highlight line drawing |
| `tools/megaHexTool.ts` | Mega-hex origin placement |
| `tools/contextMenuTool.ts` | Right-click context menu logic |

Tools currently use an `attachXxxHandlers(el, refs)` pattern — not the `Tool` interface from `types.ts`. Migrating them to the interface + `ToolContext` injection is pending.

**`TerrainViewCanvas.tsx`** (~3285 lines) owns refs, hooks, useEffects that mark layers dirty, RAF loop, and wires TVC JSX. It no longer contains any draw logic — that all lives in `render/MapRenderer.ts`. Don't add draw code here; add it in the appropriate `src/lib/` draw function, then use it via the relevant layer controller.

### Offscreen layer caching — `LayerCache`

`src/lib/LayerCache.ts` owns the `OffscreenCanvas` ref, `ImageBitmap` cache, and dirty flag for one layer. Layer controllers (in `render/layers/`) hold a module-level `LayerCache` instance — not a React ref.

**Key behaviour:**
- `markDirty()` schedules a rebuild on the next `prepare()` call
- `prepare(pw, ph, dpr)` returns `{ ctx, rebuilt }` — `rebuilt=false` is a cache hit (pan/zoom don't trigger rebuilds)
- `commitRebuild()` transfers the canvas to an `ImageBitmap` (GPU rasterise); canvas is freed
- `blit()` draws `bitmap ?? prevBitmap ?? canvas` — `prevBitmap` is the stale bitmap kept visible during a rebuild so there's no blank flash
- `dispose()` closes both bitmaps and frees the canvas

**Pattern for a new layer controller:**

```ts
// render/layers/myLayer.ts
const cache = new LayerCache()

export const myLayerController = {
  markDirty(): void { cache.markDirty() },
  dispose(): void { cache.dispose() },

  draw(ctx: CanvasRenderingContext2D, input: MyLayerInput): void {
    const { pw, ph, dpr, isExport, ...drawParams } = input
    if (!isExport) {
      const { ctx: oCtx, rebuilt } = cache.prepare(pw, ph, dpr)
      if (rebuilt) {
        oCtx.scale(dpr * dpr, dpr * dpr)  // offZoom = dpr
        drawMyLayer(oCtx, drawParams)
        cache.commitRebuild()
      }
      cache.blit(ctx, 0, 0, pw, ph)
      return
    }
    drawMyLayer(ctx, drawParams)
  },
}
```

The `dpr` supersampling factor (`offZoom = dpr`) lives in the caller's `scale()` call. `prepare()` already bakes the canvas size — don't cap or re-apply dpr elsewhere.

### Active-edit overlay — `render/activeEditOverlay.ts`

During a label drag (or any single-item edit that would otherwise rebuild an entire layer per frame), use the `activeEditOverlay` singleton instead:

1. On first drag frame (`!activeEditOverlay.isActive`): call `layerController.markDirty()` once, passing `excludeLabelId` so the layer rebuilds *without* the dragged item.
2. Every drag frame: `const oCtx = activeEditOverlay.begin(pw, ph, dpr)` → draw the one item at its live position → `activeEditOverlay.blit(mainCtx, 0, 0, pw, ph)`.
3. On drag end: `layerController.markDirty()` (without excludeLabelId) + `activeEditOverlay.end()`.

This makes drag cost O(1) regardless of scene size. Currently wired for settlement label drag only.

### Terrain blob pipeline — two separate paths

`terrainBlobs.ts` exposes two entry points and they are used in **different contexts**:

- **`buildTerrainBlobsV2`** — used by the export path (`MapRenderer.ts`) and the per-component blob-override path inside `drawTerrain.ts` (section 4b). It runs `buildTerrainBlobTopology` → `shapeInputPolygon` → `shapeTerrainBlobs` internally.
- **`buildTerrainBlobTopology` + `shapeTerrainBlobs` called separately** — used by the interactive render path inside TVC's `defaultTerrainBlobs` useMemo. TVC calls topology first, then does its own intermediate work (handle displacement, corridor cutting, topo style, stable seeds), then calls `shapeTerrainBlobs` with a **manually constructed** topology entry.

**Rule: when adding a field to `BlobTopologyEntry` or `shapeTerrainBlobs` inputs, you must wire it in both paths.** Fixing `buildTerrainBlobTopology` or `buildTerrainBlobsV2` alone has no effect on the interactive render. Always grep for all call sites of `shapeTerrainBlobs` before implementing topology changes.

The TVC path also maintains its own two-level cache (`perTerrainBlobCache`): `hexKey` guards the topology (rawPolys), `styleKey` guards the shaping (final polys). Adding topology-derived data (like `clusterCenters`) requires updating both the cache entry type and the cache read/write at both levels.

### Zustand store — batch updates

The `persist` middleware serializes the **entire store to localStorage on every `set()` call**. Calling a store action N times in a loop (e.g. on mouseup after a paint stroke) causes N full JSON serializations, N React re-renders, and N undo snapshots — this is the main source of multi-second freezes after paint strokes.

**Rule: never call store actions in a loop.** If a user gesture (paint stroke, batch import, multi-select edit) needs to write N items, accumulate them during the gesture and flush with a single `set()` at the end.

**Pattern:**
1. During the gesture (mousemove): push items into a local buffer (`useRef` array) — no store writes.
2. On gesture end (mouseup): call one `batchXxx` action that applies the whole buffer in a single `set()`.
3. The `batchXxx` action: call `pushUndoSnapshot()` once, compute the full next state, then one `set({ ... })`.

Existing batch actions to follow as examples: `batchToggleRiverEdges` in `riversSlice.ts`, `batchAddRoadEdges` / `batchRemoveRoadEdges` in `roadsSlice.ts`, `batchAddRailEdges` / `batchRemoveRailEdges` in `railsSlice.ts`, and `batchOverrideHexTerrain` / `batchOverrideHexBackground` / `batchOverrideHexElevation` in `terrainSlice.ts`.

---

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

## Electron desktop app

The app ships as a macOS `.app` (and Windows `.exe`) via Electron. The Python backend runs as a frozen PyInstaller binary (the "sidecar") that Electron spawns on startup.

### Development workflow

During active development, never build the DMG. Use two terminals:

```bash
# Terminal 1 — Python backend (auto-reloads on file save)
cd backend && .venv/bin/uvicorn main:app --reload

# Terminal 2 — Electron window with Vite HMR
cd frontend && npm run electron:dev
```

The Electron window loads from Vite's dev server (`localhost:5173`). Frontend changes appear instantly via HMR. Backend changes reload automatically via uvicorn. This is identical to browser-based dev, just in a window.

### Building a distributable DMG

Run these three steps in order from `backend/`:

```bash
# 1. Freeze the Python sidecar
cd backend && .venv/bin/pyinstaller sidecar.spec --noconfirm

# 2. Build frontend + package into DMG (from frontend/)
cd frontend && npm run electron:build
```

Output: `release/IG2 Hex Map-<version>-arm64.dmg`

On first install, macOS will block the app (unsigned). Bypass once with:
```bash
xattr -d com.apple.quarantine "/Applications/IG2 Hex Map.app"
```

### How the sidecar works

- `backend/main.py` accepts `--port PORT` and `--dist-dir PATH` as CLI args
- On startup it prints `IG2_READY:<port>` to stdout; Electron reads this to know when to open the window
- In production, FastAPI serves the built frontend from `--dist-dir` as static files
- `backend/sidecar.spec` is the PyInstaller spec — edit it when adding new backend dependencies
- The frozen binary goes into `release/<platform>/IG2 Hex Map.app/Contents/Resources/sidecar/`
- The built frontend goes into `…/Resources/frontend-dist/`

### API routes

All backend routes use `/api/` prefix (e.g. `/api/generate/terrain-stream`). In dev, Vite proxies `/api/...` to `localhost:8000` without rewriting the path. In production the sidecar serves `/api/...` directly. Do not strip the `/api` prefix in the Vite proxy config.

### Adding new textures

Texture files must live in `frontend/public/textures/` (not `frontend/textures/`) so Vite copies them into `dist/textures/` and the sidecar can serve them. The `frontend/textures/` directory is the legacy location — use `public/textures/` as the single source of truth.

---

## Working style

- **Commit after every logical change.** Each self-contained fix, feature, or refactor gets its own commit before moving on. This makes reverting any single step a simple `git reset --hard <sha>` without losing unrelated work.
- Before starting a multi-step task, commit (or ask the user to commit) the current working state as a checkpoint.

---

## Conventions

- No comments unless the *why* is non-obvious (hidden constraint, workaround, subtle invariant)
- Slices own their domain's state and actions fully — cross-slice mutations go through `set()` on the full store, which is fine
- Keep `mapStore.ts` to shared types/constants/exports only — no logic there
- **Three-tier rendering model:** pixel math goes in `src/lib/draw*.ts` (pure functions); offscreen caching + export branching goes in `src/render/layers/*.ts` (module singletons); the compositor order goes in `src/render/MapRenderer.ts`. Don't collapse tiers — no draw logic in components, no store access in lib files.
- **New lib files are cheap — use them.** One rendering domain = one file. Don't append unrelated logic to an existing lib file just because it's convenient.
- **`MapRenderer.drawMap()` is a pure render pass — no heavy computation inline.** Any derived data must be computed outside it, behind its own dirty flag and cache ref. A `useEffect` in TVC watches inputs and marks layers dirty; `drawMap()` checks dirty flags, rebuilds caches if needed, then blits. Never add unconditional computation inside `drawMap()` — it runs every RAF frame.
