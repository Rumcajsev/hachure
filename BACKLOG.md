# Backlog

Ideas and things to work on. Add freely — no format required.

---

## Performance

**Debounced localStorage persistence**
Remove Zustand `persist` middleware. Replace with a subscriber that debounces writes (1.5s). Every `set()` becomes a plain in-memory update; localStorage flushes invisibly in background. Flush immediately on `beforeunload`. Need to replicate `persist`'s version/migration logic manually when removing it.

**Incremental road chain cache**
Rivers already cache per-chain geometry (catmullRom + wobble) by `segKey+ptsKey+paramKey`. Roads don't — every paint stroke rebuilds all chain geometry. Apply the same `Map<segId, {ptsKey, paramKey, chain}>` cache inside `RoadNetwork.computeSegmentGeometry()`. Only stale segments rebuild. Reference: `riverChains.ts` cache pattern.

---

## Architecture / Refactor

**Undo/redo reimplementation**
`pushUndoSnapshot` is currently a no-op (disabled due to double-serialize freeze). Reimplement by merging the snapshot into each batch action's single `set()`: extract a pure `makeSnapshot(state)` (no `set()`), call it inside every `batchXxx` action, include the result in that action's single `set({..., undoStack: [...undoStack, snapshot]})`. Batch actions to update: `batchToggleRiverEdges`, `batchAddRoadEdges`, `batchRemoveRoadEdges`, `batchAddRailEdges`, `batchRemoveRailEdges`, `batchOverrideHexTerrain`, `batchOverrideHexBackground`, `batchOverrideHexElevation`.

**TVC component splitting**
`TerrainViewCanvas.tsx` is ~3300 lines, subscribes to nearly the entire store. Split domain subscriptions into per-domain hooks (`useRiverChains`, `useRoadData`, `useTerrainBlobs`, …) each with fine-grained selectors. River chain hook is the suggested proof-of-concept start — most self-contained. Main risk: the RAF loop and draw() rely on refs currently all set inside TVC.

---

## Desktop App

**Incorporate new app icon throughout the UI**
Use the new icon consistently across the app — loading screens, about/settings, any spot that currently shows a placeholder or nothing.

**Top bar navigation and tools overhaul**
The top bar was designed for a browser context. Now that the app runs as an Electron desktop app, it needs a rethink — what controls belong there, how it sits alongside native OS window chrome (title bar, traffic lights on Mac), and whether any functionality should move to native menus. Goal is a top bar that feels at home as a desktop app, not a browser tab.

---

## Map Setup

**Tidy up all entry flows**
Every journey from app launch to the editing stage should feel clean and intentional — no rough edges, jarring transitions, or inconsistent steps across the setup sequence.

**Reference image overlay**
Not a separate starting point — the user should be able to add a reference image freely on top of any map loaded from OSM data, at any time. The image sits as a semi-transparent overlay so the user can trace or align to it while editing. Think of it as an always-available layer, not an onboarding option.

**Multi-sheet preview and setup**
When the map spans multiple sheets, the setup experience is undiscoverable and the preview doesn't clearly communicate it. Two things to fix: (a) make multi-sheet configuration more intuitive to find and understand during setup, and (b) have the preview explicitly show sheet borders and how the hex grid splits across them. The PDF export already handles multi-sheet correctly — the problem is purely in how it's surfaced and previewed during setup.

~~**Better info on grid selection**~~
~~In the hex/paper setup step the dimension values (paper size, hex size, hex count, scale) are cluttered and scattered around the UI. Needs a clean, consolidated layout so all the relevant numbers are readable at a glance.~~ ✓ Done

---

## UX

**First-launch landing animation**
When the app opens for the first time (no saved map), show an animated landing experience rather than a blank editing canvas. Should communicate the app's purpose, feel polished, and transition naturally into the setup flow. Consider what happens on subsequent launches — returning users shouldn't see the full animation every time, but the transition into the app should still feel intentional.

**In-app step-by-step tutorials**
Guided walkthroughs for the core flows (first map setup, terrain editing, export, etc.). Should be contextual — triggered at the right moment, not just a help page — and skippable for returning users. Goal is that someone can pick up the app cold and get to a usable map without reading documentation.

**Loading screen on map load**
When loading a saved map the app shows a blank dark background while it processes. Replace with a proper loading screen or spinner so the user knows something is happening and it hasn't frozen.

**Better OSM data loading experience**
The loading process when fetching OSM data is functional but not informative. It should clearly show what's being fetched and at what stage, with progress that feels responsive rather than opaque. Visually it should look polished — not just a spinner or raw status text. Users shouldn't feel like something has frozen or gone wrong when a fetch is just taking a moment.

**Progressive layer loading — edit while fetching**
When generating a map, unlock editing as soon as base terrain is ready instead of blocking the whole UI until every layer finishes. Settlements, coastline, roads, rivers etc. fetch in parallel and appear as they arrive. Each sidebar panel shows a small loader indicator while its data is still in flight, disappearing once that layer is loaded. Goal: the user can start editing terrain immediately after generation without waiting for the slower OSM queries.

**Bug reporting**
In-app mechanism to submit bug reports — ideally with automatic context attached (app version, current map state snapshot, browser/OS). Keeps feedback low-friction so issues actually get reported.

---

## Data Fetching

**Scale-aware OSM data fetching**
The current fetch pipeline uses the same OSM queries regardless of map scale. At small scales (a city district, a battlefield — hexes covering 1–5 km), minor streams, footpaths, and local roads are meaningful and should be included. At large scales (a country or continent — hexes covering 50–200 km), those same queries return enormous noise and miss the point: only major rivers, motorways, and large settlements matter.

This needs a proper design pass covering:
- What the meaningful scale thresholds are and how to detect them from hex size + paper dimensions
- Which OSM tags/filters to apply at each tier (e.g. `waterway=river` only vs. including `waterway=stream`; `highway=motorway|trunk` only vs. including secondary roads)
- Whether Overpass queries should change, or whether the backend fetches everything and filters server-side, or both
- How elevation resolution should scale (lower-res DEM at large scales is both sufficient and faster)
- Edge cases: a medium-scale map where some features are relevant and others aren't

Goal is a robust, principled system — not ad-hoc thresholds bolted on later. Worth reviewing what OSM and similar tools do at each zoom level as reference.

---

## Source Data

**Source data preview**
A uniform way to inspect or visualise the raw OSM/elevation data that each map element was derived from — before hex-fitting, before user edits. Rough scope:
- Per-hex: what terrain type the source data originally classified it as (not what the user painted), potentially as a full heatmap overlay across the grid
- Per-river: the original OSM polyline geometry before it was snapped to hex edges
- Per-road: the original OSM geometry and its original classification (motorway, primary, secondary, etc.) before any user overrides

Could be a visual toggle/overlay mode, a click-to-inspect panel, or both — left open for design exploration. Main value: understanding why a feature was classified or routed a particular way, and debugging unexpected hex assignments.

**Vector (non-hexified) rendering of rivers and roads**
Instead of snapping rivers and roads to the hex grid, render them directly as geographic vector lines — the raw OSM polylines projected onto the canvas, styled but not hex-aligned. The hex map stays intact underneath; these features simply draw over it as smooth curves.

This gives the user a hybrid option: some features hexified, others rendered precisely. Shares the same underlying mechanism as the overlay mode in *Import and display political or regional borders* (see Borders section) — both are geographic polylines drawn without hex-fitting. Implementation likely converges on a shared vector overlay layer.

---

## Borders / Boundary Import

**Import and display political or regional borders**
Let the user import GeoJSON (or similar) files containing country, regional, or custom boundary lines — e.g. from Natural Earth or national open-data sources. Two display modes:

- **Overlay mode** — the border geometry is projected and drawn as-is on top of the map, the same way an SVG outline would be. Useful when the user wants precise geographic accuracy and doesn't care about hex alignment.
- **Hex-fit mode** — the border polyline is snapped to hex edges, producing a crisp border that follows the grid (analogous to how rivers are built from hex edge sequences). The result becomes a first-class map element the user can style.

**UI placement is unresolved.** Options: (a) a new **Borders** panel in the left sidebar alongside Rivers, Highlights, etc., (b) a broader **Overlays** section that also absorbs the reference image overlay, or (c) folded into Highlights since highlights already represent user-drawn geometry. Hex-fit borders would need their own layer controller in `render/layers/`; overlay-mode borders could reuse or extend the existing OSM overlay mechanism.

---

## Map Types

**Alternative map types: point-to-point and area maps**
The hex map is the primary editing environment and data source. Once a hex map is built, the user can switch into two additional modes — each auto-derived from the hex data, then refined:
- **Point-to-point** — settlements and key terrain features become nodes; roads and natural corridors become connections. The user merges, splits, or repositions nodes and redraws connections on top of the terrain art.
- **Area maps** — contiguous hex groups of similar terrain are clustered into irregular named zones. The user adjusts boundaries, merges or splits areas, and names them.

No re-fetching required. The hex map stays intact underneath — these are views into the same data, not separate maps.

---

## Elevation

**Elevation system UX overhaul**
The underlying elevation data and rendering works well. What needs rethinking is the whole editing flow around it — what's enabled by default on a fresh map, what the initial look is, how the user discovers and adjusts elevation settings, and what the interaction model feels like. The data pipeline stays; the defaults, controls, and flow get a proper design pass.

---

## Settlements

**Settlement generation overhaul**
Current town and village rendering looks poor and has performance issues. Rewrite the generation so settlements feel grounded in the map — buildings and layout orient toward nearby roads and rivers rather than being placed arbitrarily. Larger settlements should read differently from small villages. Performance fix is a prerequisite: generation should not re-run unless the settlement data actually changes.

---

## Editing

**River editing flow overhaul**
Currently rivers are added from OSM data and then styled globally after the fact. The flow should support per-river inline editing — when adding or selecting a river you can immediately set its properties (width, character, etc.) without having to apply changes across all rivers later. Quick-add stays quick, but individual control is available at the point of interaction rather than as a separate post-process step.

**Map Peek — fix shortcut reliability**
Bottom-corner button that toggles a semi-transparent OSM map overlay on top of the generated hex map. Shortcut was `Space`, now meant to be `M`. Currently `Space` always works, `M` works only sometimes — likely a focus issue where the key listener only fires when the canvas has focus. Fix: register the `M` listener at the `window`/`document` level (same as `Space`) so it fires regardless of what element has focus. Remove `Space` as a trigger once `M` is reliable.

---
