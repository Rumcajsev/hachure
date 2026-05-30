const textureGlob = import.meta.glob('/textures/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

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

export const TEXTURE_OPTIONS = Object.keys(textureGlob)
  .map(path => {
    const id = path.split('/').pop()!.replace(/\.png$/, '')
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
