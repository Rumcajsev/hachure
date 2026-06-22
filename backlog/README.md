# Backlog

Future work items, each with enough context to pick up cold.

## Performance

| File | Topic |
|------|-------|
| [undo-redo-reimplementation.md](undo-redo-reimplementation.md) | Reimplement undo atomically — merge snapshot into each batch action's single `set()` |
| [debounced-localstorage-persistence.md](debounced-localstorage-persistence.md) | Decouple localStorage writes from state updates — write 1.5s after last change, not synchronously |
| [incremental-road-chain-cache.md](incremental-road-chain-cache.md) | Cache per-chain catmullRom+wiggle in RoadNetwork, same pattern as rivers |

## Architecture

| File | Topic |
|------|-------|
| [tvc-component-splitting.md](tvc-component-splitting.md) | Split TerrainViewCanvas into domain hooks so river/road changes don't re-check terrain blob deps |
