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
