# Incremental Road Chain Cache

## Status
Not started. Rivers already have this (commit 63e6e1a). Roads do not.

## Background
Roads already have `RoadNetwork` — an incremental graph structure that handles `addEdge`/`removeEdge` during painting and only rebuilds affected segments. So the graph topology phase is already incremental.

What is NOT cached: the per-chain geometry build — catmullRom interpolation + `applyWobble` (two-band Perlin wiggle). This runs for ALL chains whenever `roadDataVersion` changes (i.e. after every paint stroke mouseup), even though only 1–2 chains changed.

## What rivers did (the model to follow)
In `riverChains.ts`, `buildRiverChainsV2` was split into:
1. **Topology phase** — graph scan → raw control points per chain (always runs, fast)
2. **Build phase** — catmullRom + wiggle per chain (cached by `segKey + ptsKey + paramKey`)

The cache (`RiverChainCache`) is a `Map<segKey, {ptsKey, paramKey, chain}>`. On each call, chains whose control points and params are unchanged are instant cache hits.

## What to do for roads
`RoadNetwork.getBaseData()` currently recomputes all chain geometry when `_baseDataStale` is true. The same cache approach can be applied inside `RoadNetwork`:

- Add a `Map<segId, {ptsKey, paramKey, chain: RoadChain}>` cache inside `RoadNetwork`
- In `computeSegmentGeometry()`, check the cache before running catmullRom + applyWobble
- On `addEdge`/`removeEdge`, only mark the affected segment's cache entry stale (already tracked via `segments` map)
- `getBaseData()` only rebuilds stale segments

## Expected benefit
On a road-heavy map with ~200 chains, painting 3 edges currently rebuilds all 200. With the cache, only the 1–2 affected chains rebuild. `applyWobble` uses Perlin noise which is moderately expensive at non-zero amplitude.

## Relevant files
- `frontend/src/lib/roadNetwork.ts` — `RoadNetwork` class, `computeSegmentGeometry()`
- `frontend/src/lib/roadChains.ts` — `applyWobble`, `buildRoadChains`
- `frontend/src/lib/riverChains.ts` — reference implementation of the cache pattern
