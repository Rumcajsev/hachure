import type { MapStore } from '../mapStore'
import {
  extractStylePreset, type StylePreset,
  BUILTIN_PRESET_MAP,
} from '../../lib/stylePreset'

const STORAGE_KEY = 'ig2-style-presets'
const ACTIVE_PRESET_KEY = 'ig2-active-preset'



export interface StylePresetEntry {
  id: string
  name: string
  createdAt: number
  data: StylePreset
}

export interface PresetsSlice {
  userPresets: StylePresetEntry[]
  activePresetId: string | null
  savePreset: (name: string) => void
  loadPreset: (id: string) => void
  loadBuiltinPreset: (id: string) => void
  deletePreset: (id: string) => void
  exportPreset: (id: string) => void
  importPresetData: (data: unknown) => string | null
}

function loadFromStorage(): StylePresetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StylePresetEntry[]
  } catch {
    return []
  }
}

function saveToStorage(presets: StylePresetEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)) } catch { /* ignore quota errors */ }
}

function loadId(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function saveId(key: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch { /* ignore */ }
}

export function createPresetsSlice(
  set: (partial: Partial<MapStore>) => void,
  get: () => MapStore,
): PresetsSlice {
  return {
    userPresets: loadFromStorage(),
    activePresetId: loadId(ACTIVE_PRESET_KEY),

    savePreset: (name: string) => {
      const entry: StylePresetEntry = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Untitled',
        createdAt: Date.now(),
        data: extractStylePreset(get()),
      }
      const updated = [...get().userPresets, entry]
      saveToStorage(updated)
      saveId(ACTIVE_PRESET_KEY, null)
      set({ userPresets: updated, activePresetId: null })
    },

    loadPreset: (id: string) => {
      const entry = get().userPresets.find(p => p.id === id)
      if (!entry) return
      saveId(ACTIVE_PRESET_KEY, null)
      set({ ...(entry.data as Partial<MapStore>), activePresetId: null })
    },

    loadBuiltinPreset: (id: string) => {
      const preset = BUILTIN_PRESET_MAP[id]
      if (!preset) return
      saveId(ACTIVE_PRESET_KEY, id)
      set({ ...(preset.data as Partial<MapStore>), activePresetId: id })
    },

    deletePreset: (id: string) => {
      const updated = get().userPresets.filter(p => p.id !== id)
      saveToStorage(updated)
      set({ userPresets: updated })
    },

    exportPreset: (id: string) => {
      const entry = get().userPresets.find(p => p.id === id)
      if (!entry) return
      const payload = { type: 'ig2-style-preset', version: 1, name: entry.name, createdAt: entry.createdAt, data: entry.data }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${entry.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.ig2style`
      a.click()
      URL.revokeObjectURL(url)
    },

    importPresetData: (data: unknown) => {
      try {
        const parsed = data as Record<string, unknown>
        if (parsed.type !== 'ig2-style-preset') return 'Not a valid style preset file'
        const entry: StylePresetEntry = {
          id: crypto.randomUUID(),
          name: typeof parsed.name === 'string' ? parsed.name : 'Imported',
          createdAt: Date.now(),
          data: (parsed.data as StylePreset) ?? {},
        }
        const updated = [...get().userPresets, entry]
        saveToStorage(updated)
        set({ userPresets: updated })
        return null
      } catch {
        return 'Failed to import preset'
      }
    },
  }
}
