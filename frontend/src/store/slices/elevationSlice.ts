import type { MapStore, GeneratedHex, GenerateProgress, ClassificationParams, BlobOverride } from '../mapStore'
import { DEFAULT_CLASSIFICATION_PARAMS } from '../mapStore'
import { classifyElevation as _classify } from '../../lib/elevationClassify'

export type HeightmapMeta = {
  minElev: number
  maxElev: number
  widthM: number
  heightM: number
}

export type ElevationSlice = {
  elevationStatus: 'idle' | 'loading' | 'error' | 'done'
  elevationError: string | null
  elevationProgress: GenerateProgress | null
  showElevationDebug: boolean
  classificationParams: ClassificationParams
  elevationPaintMode: boolean
  elevationPaintBrush: 'flat' | 'hills' | 'mountains'
  heightmapUrl: string | null
  heightmapMeta: HeightmapMeta | null
  hillshadeEnabled: boolean
  hillshadeAzimuth: number
  hillshadeAltitude: number
  hillshadeIntensity: number
  hillshadeMode: 'smooth' | 'hard'
  hillshadeDisabledTerrains: string[]
  hillshadeDisabledElevClasses: string[]
  contoursEnabled: boolean
  contourInterval: number
  contourBaseElevation: number
  contourSmoothPasses: number
  contourLineWidth: number
  contourDisabledTerrains: string[]
  contourDisabledElevClasses: string[]
  elevationImportEnabled: boolean
  setElevationImportEnabled: (v: boolean) => void
  showElevationClassOverlay: boolean
  setShowElevationClassOverlay: (v: boolean) => void
  elevationOverridesTerrain: boolean
  setElevationOverridesTerrain: (v: boolean) => void
  fetchElevation: () => Promise<void>
  setShowElevationDebug: (v: boolean) => void
  setClassificationParam: (key: keyof ClassificationParams, v: number) => void
  classifyElevation: () => void
  setElevationPaintMode: (v: boolean) => void
  setElevationPaintBrush: (v: 'flat' | 'hills' | 'mountains') => void
  overrideHexElevation: (q: number, r: number, cls: 'flat' | 'hills' | 'mountains') => void
  clearElevationOverrides: () => void
  setHillshadeEnabled: (v: boolean) => void
  setHillshadeAzimuth: (v: number) => void
  setHillshadeAltitude: (v: number) => void
  setHillshadeIntensity: (v: number) => void
  setHillshadeMode: (v: 'smooth' | 'hard') => void
  setHillshadeDisabledTerrains: (v: string[]) => void
  setHillshadeDisabledElevClasses: (v: string[]) => void
  setContoursEnabled: (v: boolean) => void
  setContourInterval: (v: number) => void
  setContourBaseElevation: (v: number) => void
  setContourSmoothPasses: (v: number) => void
  setContourLineWidth: (v: number) => void
  setContourDisabledTerrains: (v: string[]) => void
  setContourDisabledElevClasses: (v: string[]) => void
  elevationTypeBlobStyles: Record<string, BlobOverride>
  setElevationTypeBlobStyle: (cls: string, style: Partial<BlobOverride>) => void
}

type Set = (partial: Partial<MapStore> | ((s: MapStore) => Partial<MapStore>)) => void

export const createElevationSlice = (set: Set, get: () => MapStore): ElevationSlice => ({
  elevationStatus: 'idle',
  elevationError: null,
  elevationProgress: null,
  showElevationDebug: false,
  classificationParams: { ...DEFAULT_CLASSIFICATION_PARAMS },
  elevationPaintMode: false,
  elevationPaintBrush: 'hills',
  heightmapUrl: null,
  heightmapMeta: null,
  hillshadeEnabled: true,
  hillshadeAzimuth: 315,
  hillshadeAltitude: 45,
  hillshadeIntensity: 0.6,
  hillshadeMode: 'smooth' as const,
  hillshadeDisabledTerrains: [],
  hillshadeDisabledElevClasses: [],
  contoursEnabled: false,
  contourInterval: 50,
  contourBaseElevation: 0,
  contourSmoothPasses: 1,
  contourLineWidth: 1.5,
  contourDisabledTerrains: [],
  contourDisabledElevClasses: [],
  elevationImportEnabled: true,
  setElevationImportEnabled: (v) => set({ elevationImportEnabled: v }),
  showElevationClassOverlay: false,
  setShowElevationClassOverlay: (v) => set({ showElevationClassOverlay: v }),
  elevationOverridesTerrain: false,
  setElevationOverridesTerrain: (v) => set({ elevationOverridesTerrain: v }),

  fetchElevation: async () => {
    const { generatedHexes, generatedMetadata, hexOrientation } = get()
    if (generatedHexes.length === 0 || !generatedMetadata) return

    set({ elevationStatus: 'loading', elevationError: null, elevationProgress: null })

    const { center, bearing, scale_m_per_mm, paper_mm, outer_radius_m } = generatedMetadata

    try {
      const resp = await fetch('/api/generate/elevation-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hexes: generatedHexes,
          center_lon: center[0],
          center_lat: center[1],
          bearing,
          width_m: scale_m_per_mm * paper_mm[0],
          height_m: scale_m_per_mm * paper_mm[1],
          hex_orientation: hexOrientation,
          outer_radius_m,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      if (!resp.body) throw new Error('No response body')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(jsonStr) } catch { continue }

          if (event.step === 'done') {
            const params = get().classificationParams
            const classified = _classify(event.hexes as GeneratedHex[], params)
            const heightmapUrl = event.heightmap_b64
              ? `data:image/png;base64,${event.heightmap_b64}`
              : null
            const heightmapMeta = event.heightmap_b64 ? {
              minElev: event.heightmap_min_elev as number,
              maxElev: event.heightmap_max_elev as number,
              widthM: event.heightmap_width_m as number,
              heightM: event.heightmap_height_m as number,
            } : null
            set({ generatedHexes: classified, elevationStatus: 'done', elevationProgress: null, heightmapUrl, heightmapMeta })
          } else if (event.step === 'error') {
            set({ elevationStatus: 'error', elevationError: event.message as string, elevationProgress: null })
          } else {
            set({ elevationProgress: { step: event.step as string, message: event.message as string, progress: event.progress as number } })
          }
        }
      }
    } catch (e) {
      set({ elevationStatus: 'error', elevationError: String(e), elevationProgress: null })
    }
  },

  setShowElevationDebug: (v) => set({ showElevationDebug: v }),

  setClassificationParam: (key, v) => {
    const next = { ...get().classificationParams, [key]: v }
    const updated = _classify(get().generatedHexes, next)
    set({ classificationParams: next, generatedHexes: updated })
  },

  classifyElevation: () => {
    const { generatedHexes, classificationParams } = get()
    set({ generatedHexes: _classify(generatedHexes, classificationParams) })
  },

  setElevationPaintMode: (v) => set({
    elevationPaintMode: v,
    ...(v ? { terrainPaintMode: false, roadPaintMode: false, railPaintMode: false } : {}),
  }),

  setElevationPaintBrush: (v) => set({ elevationPaintBrush: v }),

  overrideHexElevation: (q, r, cls) => {
    const { generatedHexes } = get()
    const updated = generatedHexes.map(h =>
      h.q === q && h.r === r
        ? { ...h, elevation_class: cls, elevation_background: cls === 'mountains' ? 'hills' : null, elevation_manual_override: true }
        : h
    )
    set({ generatedHexes: updated })
  },

  clearElevationOverrides: () => {
    const { generatedHexes, classificationParams } = get()
    const cleared = generatedHexes.map(h => ({ ...h, elevation_manual_override: false }))
    set({ generatedHexes: _classify(cleared, classificationParams) })
  },

  setHillshadeEnabled: (v) => set({ hillshadeEnabled: v }),
  setHillshadeAzimuth: (v) => set({ hillshadeAzimuth: v }),
  setHillshadeAltitude: (v) => set({ hillshadeAltitude: v }),
  setHillshadeIntensity: (v) => set({ hillshadeIntensity: v }),
  setHillshadeMode: (v) => set({ hillshadeMode: v }),
  setHillshadeDisabledTerrains: (v) => set({ hillshadeDisabledTerrains: v }),
  setHillshadeDisabledElevClasses: (v) => set({ hillshadeDisabledElevClasses: v }),
  setContoursEnabled: (v) => set({ contoursEnabled: v }),
  setContourInterval: (v) => set({ contourInterval: v }),
  setContourBaseElevation: (v) => set({ contourBaseElevation: v }),
  setContourSmoothPasses: (v) => set({ contourSmoothPasses: v }),
  setContourLineWidth: (v) => set({ contourLineWidth: v }),
  setContourDisabledTerrains: (v) => set({ contourDisabledTerrains: v }),
  setContourDisabledElevClasses: (v) => set({ contourDisabledElevClasses: v }),
  elevationTypeBlobStyles: {},
  setElevationTypeBlobStyle: (cls, style) => set(s => ({
    elevationTypeBlobStyles: { ...s.elevationTypeBlobStyles, [cls]: { ...s.elevationTypeBlobStyles[cls], ...style } },
  })),
})
