import type { MapStore } from '../mapStore'

export interface BridgeTier {
  id: string
  label: string
  color: string
}

export const DEFAULT_BRIDGE_TIERS: BridgeTier[] = []

export interface BridgesSlice {
  bridgesEnabled: boolean
  bridgeStyle: 'plank' | 'icon'
  bridgeLengthScale: number
  bridgeTiers: BridgeTier[]
  bridgeOverrides: Record<string, string>
  setBridgesEnabled: (v: boolean) => void
  setBridgeStyle: (v: 'plank' | 'icon') => void
  setBridgeLengthScale: (v: number) => void
  updateBridgeTier: (id: string, update: Partial<Omit<BridgeTier, 'id'>>) => void
  addBridgeTier: () => void
  removeBridgeTier: (id: string) => void
  setBridgeOverride: (bridgeId: string, tierId: string) => void
  clearBridgeOverride: (bridgeId: string) => void
}

export function createBridgesSlice(
  set: (fn: (state: MapStore) => Partial<MapStore>) => void,
  _get: () => MapStore,
): BridgesSlice {
  return {
    bridgesEnabled: true,
    bridgeStyle: 'plank',
    bridgeLengthScale: 1.2,
    bridgeTiers: DEFAULT_BRIDGE_TIERS,
    bridgeOverrides: {},

    setBridgesEnabled: (v) => set(() => ({ bridgesEnabled: v })),
    setBridgeStyle: (v) => set(() => ({ bridgeStyle: v })),
    setBridgeLengthScale: (v) => set(() => ({ bridgeLengthScale: v })),

    updateBridgeTier: (id, update) => set((s) => ({
      bridgeTiers: s.bridgeTiers.map(t => t.id === id ? { ...t, ...update } : t),
    })),

    addBridgeTier: () => set((s) => ({
      bridgeTiers: [...s.bridgeTiers, { id: `bt-${Date.now()}`, label: 'Tier', color: '#a0a0a0' }],
    })),

    removeBridgeTier: (id) => set((s) => ({
      bridgeTiers: s.bridgeTiers.filter(t => t.id !== id),
      bridgeOverrides: Object.fromEntries(
        Object.entries(s.bridgeOverrides).filter(([, tierId]) => tierId !== id)
      ),
    })),

    setBridgeOverride: (bridgeId, tierId) => set((s) => ({
      bridgeOverrides: { ...s.bridgeOverrides, [bridgeId]: tierId },
    })),

    clearBridgeOverride: (bridgeId) => set((s) => {
      const next = { ...s.bridgeOverrides }
      delete next[bridgeId]
      return { bridgeOverrides: next }
    }),
  }
}
