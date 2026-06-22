/** Pure terrain classification helpers. No store or React imports. */

import type { TerrainRules } from '../store/mapStore'

// Keep in sync with TERRAIN_PRIORITY in mapStore.ts
const TERRAIN_PRIORITY = ['water', 'marsh', 'woods', 'light_woods', 'rough', 'clear'] as const

export function classifyHex(
  coverage: Record<number, number>,
  rules: TerrainRules,
  disabled: Set<string>,
  realisticCoastline: boolean = false,
): string {
  if (realisticCoastline) {
    let totalLand = 0
    const landOnly: Record<number, number> = {}
    for (const key of Object.keys(coverage)) {
      const c = Number(key)
      if (c !== 0 && c !== 80) { landOnly[c] = coverage[c]; totalLand += coverage[c] }
    }
    if (totalLand > 0) {
      const norm: Record<number, number> = {}
      for (const key of Object.keys(landOnly)) { const c = Number(key); norm[c] = landOnly[c] / totalLand }
      for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
        if (t === 'water' || disabled.has(t)) continue
        for (const rule of (rules[t] ?? [])) {
          if (rule.classCode === 0 || rule.classCode === 80) continue
          if ((norm[rule.classCode] ?? 0) >= rule.threshold) return t
        }
      }
    }
    return 'clear'
  }

  for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
    if (disabled.has(t)) continue
    for (const rule of (rules[t] ?? [])) {
      if ((coverage[rule.classCode] ?? 0) >= rule.threshold) return t
    }
  }
  if (!disabled.has('clear')) return 'clear'
  for (const t of TERRAIN_PRIORITY) {
    if (!disabled.has(t)) return t
  }
  return 'clear'
}

export function classifyHexLayers(
  coverage: Record<number, number>,
  rules: TerrainRules,
  disabled: Set<string>,
  realisticCoastline: boolean = false,
): string[] {
  if (realisticCoastline) {
    let totalLand = 0
    const landOnly: Record<number, number> = {}
    for (const key of Object.keys(coverage)) {
      const c = Number(key)
      if (c !== 0 && c !== 80) { landOnly[c] = coverage[c]; totalLand += coverage[c] }
    }
    const norm: Record<number, number> = {}
    if (totalLand > 0) {
      for (const key of Object.keys(landOnly)) { const c = Number(key); norm[c] = landOnly[c] / totalLand }
    }
    const layers: string[] = []
    for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
      if (t === 'water' || disabled.has(t)) continue
      for (const rule of (rules[t] ?? [])) {
        if (rule.classCode === 0 || rule.classCode === 80) continue
        if ((norm[rule.classCode] ?? 0) >= rule.threshold) { layers.push(t); break }
      }
    }
    return layers
  }

  const layers: string[] = []
  for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
    if (disabled.has(t)) continue
    for (const rule of (rules[t] ?? [])) {
      if ((coverage[rule.classCode] ?? 0) >= rule.threshold) { layers.push(t); break }
    }
  }
  return layers
}
