import type { MapStore } from '../mapStore'

export type LabelBBox = {
  cx: number     // label text centre x in CSS-pixel / project space
  cy: number     // label text centre y
  hw: number     // half-width
  hh: number     // half-height
  angle: number  // rotation in radians (0 for most labels, non-zero for river labels)
  iconCx?: number // settlement icon centre x (set for settlement labels only)
  iconCy?: number // settlement icon centre y
}

export type LabelOffsetsSlice = {
  labelOffsets: Record<string, { dx: number; dy: number }>
  setLabelOffset: (id: string, dx: number, dy: number) => void
  clearLabelOffset: (id: string) => void
  clearAllLabelOffsets: () => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createLabelOffsetsSlice = (set: Set): LabelOffsetsSlice => ({
  labelOffsets: {},

  setLabelOffset: (id, dx, dy) =>
    set(s => ({ labelOffsets: { ...s.labelOffsets, [id]: { dx, dy } } })),

  clearLabelOffset: (id) =>
    set(s => { const { [id]: _, ...rest } = s.labelOffsets; return { labelOffsets: rest } }),

  clearAllLabelOffsets: () => set({ labelOffsets: {} }),
})
