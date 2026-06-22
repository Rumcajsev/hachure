# TerrainViewCanvas Component Splitting

## Status
Not started. Low urgency but high long-term value.

## The problem
`TerrainViewCanvas.tsx` is ~3300 lines. It is a single React component that:
- Subscribes to almost the entire Zustand store
- Owns all refs, all useMemos, all useEffects for every domain (rivers, roads, rails, terrain, settlements, highlights, etc.)
- Re-renders on any store change, re-checking hundreds of useMemo dep arrays each time

Because everything is in one component, a change to `riverEdges` causes React to re-check the deps of `defaultTerrainBlobs`, `smoothedRailData`, `defaultWaterBlobsMasked`, etc. — even though none of those are affected.

## What splitting would look like
Each domain gets its own hook or sub-component that subscribes only to its slice of the store:

```
TerrainViewCanvas (thin compositor — owns canvas ref, RAF loop, draw())
  ├── useRiverChains(riverEdges, params) → chains  [only re-runs when river state changes]
  ├── useRoadData(roadEdges, params) → chains      [only re-runs when road state changes]
  ├── useTerrainBlobs(hexes, params) → blobs       [only re-runs when terrain state changes]
  ├── useSettlements(settlements, params) → data
  └── ...
```

Each hook uses `useMapStore(selector)` with a fine-grained selector so it only re-renders when its specific slice changes.

## Expected benefit
- Painting a river edge only re-renders the river hook, not the terrain blob hook
- `defaultTerrainBlobs` useMemo never runs during river/road painting (it literally isn't in the same render cycle)
- Easier to reason about — each domain's data flow is self-contained

## Risk
This is a large refactor of the most complex file in the codebase. The RAF loop and draw() function in MapRenderer depend on refs that are currently all set inside TVC. Splitting would require careful ref forwarding or a shared ref context.

## Suggested approach when starting
Begin with the river chain hook as a proof of concept — it's the most self-contained domain and we've already touched it recently.
