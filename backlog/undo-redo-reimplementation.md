# Undo / Redo Reimplementation

## Status
Disabled. `pushUndoSnapshot` is currently a no-op in `undoSlice.ts`. The undo/redo buttons exist in the UI but are always disabled since the stack never fills.

## Why it was removed
`pushUndoSnapshot` called its own `set()` before the real batch action's `set()`. That caused two full localStorage serializations and two React re-renders per gesture — a measurable freeze after every paint stroke. Removing it made painting visibly snappier.

## How to reimplement correctly
The snapshot must be merged into each batch action's single `set()` call — zero extra cost, one atomic state update.

### Pattern to follow
```ts
// In every batch action (batchToggleRiverEdges, batchAddRoadEdges, etc.):
batchToggleRiverEdges: (pairs, mode) => {
  const { riverEdges, riverPaintTier, undoStack } = get()
  const snapshot = makeSnapshot(get())   // pure, no set()
  const next = /* compute next riverEdges */
  set({
    riverEdges: next,
    undoStack: [...undoStack, snapshot].slice(-MAX_UNDO),
    redoStack: [],
  })
}
```

### Helper to extract
`pushUndoSnapshot` should become a pure `makeSnapshot(state): UndoSnapshot` function (no `set()` call) — used inline by every batch action.

### Batch actions that need updating
- `batchToggleRiverEdges` — riversSlice.ts
- `batchAddRoadEdges` / `batchRemoveRoadEdges` — roadsSlice.ts
- `batchAddRailEdges` / `batchRemoveRailEdges` — railsSlice.ts
- `batchOverrideHexTerrain` / `batchOverrideHexBackground` / `batchOverrideHexElevation` — terrainSlice.ts
- Any future batch actions

### What to delete
- `pushUndoSnapshot` as a store action (the `set()` version)
- The `UndoSlice.pushUndoSnapshot` type entry
