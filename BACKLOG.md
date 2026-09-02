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

## Map Setup

**Tidy up all entry flows**
Every journey from app launch to the editing stage should feel clean and intentional — no rough edges, jarring transitions, or inconsistent steps across the setup sequence.

**Reference image overlay**
Not a separate starting point — the user should be able to add a reference image freely on top of any map loaded from OSM data, at any time. The image sits as a semi-transparent overlay so the user can trace or align to it while editing. Think of it as an always-available layer, not an onboarding option.

**Better info on grid selection**
In the hex/paper setup step the dimension values (paper size, hex size, hex count, scale) are cluttered and scattered around the UI. Needs a clean, consolidated layout so all the relevant numbers are readable at a glance.

---

## Editing

**Map Peek — fix shortcut reliability**
Bottom-corner button that toggles a semi-transparent OSM map overlay on top of the generated hex map. Shortcut was `Space`, now meant to be `M`. Currently `Space` always works, `M` works only sometimes — likely a focus issue where the key listener only fires when the canvas has focus. Fix: register the `M` listener at the `window`/`document` level (same as `Space`) so it fires regardless of what element has focus. Remove `Space` as a trigger once `M` is reliable.

---
