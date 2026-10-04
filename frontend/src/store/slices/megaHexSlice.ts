import type { MapStore } from '../mapStore'

export type MegaHexLinePattern = 'none' | 'dotted' | 'dashed' | 'dashdot'

export interface MegaHexSlice {
  megaHexEnabled: boolean
  megaHexRadius: number
  megaHexColor: string
  megaHexOpacity: number
  megaHexLineWidth: number
  megaHexLinePattern: MegaHexLinePattern
  megaHexPatternSpacing: number
  megaHexOriginQ: number
  megaHexOriginR: number
  setMegaHexEnabled: (v: boolean) => void
  setMegaHexRadius: (v: number) => void
  setMegaHexColor: (v: string) => void
  setMegaHexOpacity: (v: number) => void
  setMegaHexLineWidth: (v: number) => void
  setMegaHexLinePattern: (v: MegaHexLinePattern) => void
  setMegaHexPatternSpacing: (v: number) => void
  setMegaHexOrigin: (q: number, r: number) => void
}

export function createMegaHexSlice(
  set: (partial: Partial<MapStore>) => void,
): MegaHexSlice {
  return {
    megaHexEnabled: false,
    megaHexRadius: 1,
    megaHexColor: '#cc4444',
    megaHexOpacity: 0.8,
    megaHexLineWidth: 2,
    megaHexLinePattern: 'none',
    megaHexPatternSpacing: 1,
    megaHexOriginQ: 0,
    megaHexOriginR: 0,
    setMegaHexEnabled: (v) => set({ megaHexEnabled: v }),
    setMegaHexRadius: (v) => set({ megaHexRadius: v }),
    setMegaHexColor: (v) => set({ megaHexColor: v }),
    setMegaHexOpacity: (v) => set({ megaHexOpacity: v }),
    setMegaHexLineWidth: (v) => set({ megaHexLineWidth: v }),
    setMegaHexLinePattern: (v) => set({ megaHexLinePattern: v }),
    setMegaHexPatternSpacing: (v) => set({ megaHexPatternSpacing: v }),
    setMegaHexOrigin: (q, r) => set({ megaHexOriginQ: q, megaHexOriginR: r }),
  }
}
