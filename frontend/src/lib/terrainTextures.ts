const textureGlob = {
  ...import.meta.glob('/textures/*.png',  { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('/textures/*.jpg',  { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('/textures/*.jpeg', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>

const KNOWN_LABELS: Record<string, string> = {
  forest:      'Forest',
  lightforest: 'Light Forest',
  marsh:       'Marsh',
  rough:       'Rough',
  fields:      'Fields',
  fields2:     'Fields 2',
  light2:      'Light 2',
  light3:      'Light 3',
  '2clear':    'Clear',
}

function autoLabel(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Maps texture id → URL path (preserves the original extension) */
export const TEXTURE_PATHS: Record<string, string> = {}

export const TEXTURE_OPTIONS = Object.keys(textureGlob)
  .map(path => {
    const filename = path.split('/').pop()!
    const id = filename.replace(/\.(png|jpe?g)$/i, '')
    TEXTURE_PATHS[id] = `/textures/${filename}`
    return { id, label: KNOWN_LABELS[id] ?? autoLabel(id) }
  })
  .sort((a, b) => {
    const aKnown = a.id in KNOWN_LABELS
    const bKnown = b.id in KNOWN_LABELS
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    return a.label.localeCompare(b.label)
  })

export type TextureId = string

export const DEFAULT_TERRAIN_TEXTURES: Record<string, string> = {
  woods:       'forest',
  light_woods: 'lightforest',
  marsh:       'marsh',
  clear:       '2clear',
}

export interface TerrainTextureInput {
  textureCache: Map<string, HTMLImageElement>
  terrainTextureFile: Record<string, string | undefined>
  terrainTextureEnabled: Record<string, boolean | undefined>
  customTerrains: { id: string; textureId?: string }[]
}

export function buildTerrainTextures(p: TerrainTextureInput): Map<string, HTMLImageElement | null> {
  const { textureCache, terrainTextureFile, terrainTextureEnabled, customTerrains } = p
  const map = new Map<string, HTMLImageElement | null>()
  for (const [terrain, defaultId] of Object.entries(DEFAULT_TERRAIN_TEXTURES)) {
    if (terrainTextureEnabled[terrain] === false) continue
    const override = terrainTextureFile[terrain]
    const id = override !== undefined ? override : defaultId
    if (id) map.set(terrain, textureCache.get(id) ?? null)
  }
  for (const [terrain, id] of Object.entries(terrainTextureFile)) {
    if (!map.has(terrain) && id && terrainTextureEnabled[terrain] === true)
      map.set(terrain, textureCache.get(id) ?? null)
  }
  for (const ct of customTerrains) {
    if (terrainTextureEnabled[ct.id] === false) continue
    const override = terrainTextureFile[ct.id]
    const id = override !== undefined ? override : (ct.textureId ?? '')
    if (id && (terrainTextureEnabled[ct.id] === true || ct.textureId))
      map.set(ct.id, textureCache.get(id) ?? null)
  }
  return map
}
