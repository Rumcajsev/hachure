import type { MapStore, UndoSnapshot } from '../mapStore'

const MAX_UNDO = 50

export type UndoSlice = {
  undoStack: UndoSnapshot[]
  redoStack: UndoSnapshot[]
  pushUndoSnapshot: () => void
  undo: () => void
  redo: () => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

const snapHex = ({ q, r, terrain, manual_override, elevation_class, elevation_manual_override }: Parameters<typeof snapHex>[0]) => ({
  q, r, terrain,
  manual_override: manual_override ?? false,
  elevation_class: elevation_class ?? null,
  elevation_manual_override: elevation_manual_override ?? false,
})

const restoreHex = (h: ReturnType<typeof snapHex>, full: MapStore['generatedHexes'][number]) => ({
  ...full,
  terrain: h.terrain,
  manual_override: h.manual_override,
  elevation_class: h.elevation_class,
  elevation_manual_override: h.elevation_manual_override,
})

export const createUndoSlice = (set: Set, get: () => MapStore): UndoSlice => ({
  undoStack: [],
  redoStack: [],

  pushUndoSnapshot: () => {
    const { generatedHexes, roadEdges, railEdges, riverEdges, settlements, undoStack } = get()
    const snap: UndoSnapshot = {
      terrainHexes: generatedHexes.map(snapHex),
      roadEdges: [...roadEdges],
      railEdges: [...railEdges],
      riverEdges: [...riverEdges],
      settlements: [...settlements],
    }
    set({ undoStack: [...undoStack, snap].slice(-MAX_UNDO), redoStack: [] })
  },

  undo: () => {
    const { undoStack, redoStack, generatedHexes, roadEdges, railEdges, riverEdges, settlements } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    const current: UndoSnapshot = {
      terrainHexes: generatedHexes.map(snapHex),
      roadEdges: [...roadEdges],
      railEdges: [...railEdges],
      riverEdges: [...riverEdges],
      settlements: [...settlements],
    }
    const hexMap = new Map(prev.terrainHexes.map(h => [`${h.q},${h.r}`, h]))
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
      generatedHexes: generatedHexes.map(h => {
        const snap = hexMap.get(`${h.q},${h.r}`)
        return snap ? restoreHex(snap, h) : h
      }),
      roadEdges: prev.roadEdges,
      railEdges: prev.railEdges ?? railEdges,
      riverEdges: prev.riverEdges ?? riverEdges,
      settlements: prev.settlements,
    })
  },

  redo: () => {
    const { undoStack, redoStack, generatedHexes, roadEdges, railEdges, riverEdges, settlements } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    const current: UndoSnapshot = {
      terrainHexes: generatedHexes.map(snapHex),
      roadEdges: [...roadEdges],
      railEdges: [...railEdges],
      riverEdges: [...riverEdges],
      settlements: [...settlements],
    }
    const hexMap = new Map(next.terrainHexes.map(h => [`${h.q},${h.r}`, h]))
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, current],
      generatedHexes: generatedHexes.map(h => {
        const snap = hexMap.get(`${h.q},${h.r}`)
        return snap ? restoreHex(snap, h) : h
      }),
      roadEdges: next.roadEdges,
      railEdges: next.railEdges ?? railEdges,
      riverEdges: next.riverEdges ?? riverEdges,
      settlements: next.settlements,
    })
  },
})
