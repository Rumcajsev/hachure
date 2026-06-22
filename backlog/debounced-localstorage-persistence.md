# Debounced localStorage Persistence

## Status
Not started. Currently Zustand's `persist` middleware serializes the entire store to localStorage synchronously on every `set()` call.

## The problem
Every `set()` call — no matter how small the change — triggers:
1. `JSON.stringify(entireStore)` — can be several MB on large maps
2. `localStorage.setItem(...)` — synchronous, blocks the main thread

For a paint stroke that commits one batch action, this means one full serialization after the undo snapshot (now removed) and one more for the actual edge update. On a large map this is the dominant cost after mouseup.

## The fix
Remove the `persist` middleware from the Zustand store. Replace it with a subscriber that debounces writes:

```ts
// In mapStore.ts, replace persist middleware with:
let persistTimer: ReturnType<typeof setTimeout> | null = null

useMapStore.subscribe((state) => {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    localStorage.setItem('map-store', JSON.stringify(serializeState(state)))
  }, 1500)
})

// Flush immediately on page close so no work is lost
window.addEventListener('beforeunload', () => {
  if (persistTimer) {
    clearTimeout(persistTimer)
    localStorage.setItem('map-store', JSON.stringify(serializeState(useMapStore.getState())))
  }
})
```

## Result
- Every `set()` becomes a plain in-memory JS object update — microseconds
- The user sees the result in the next RAF frame after mouseup
- localStorage write happens 1.5s after the last change, invisibly in background
- No work is lost because `beforeunload` flushes immediately

## Migration concern
The `persist` middleware handles schema versioning and migration (`version`, `migrate` in mapStore.ts). When removing it, the manual serialize/deserialize functions must replicate that logic — read the stored version number, run the same `migratePersisted` steps from `uiSlice.ts`, then apply `rehydrateState`.
