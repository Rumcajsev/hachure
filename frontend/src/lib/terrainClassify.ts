/** Pure terrain classification helpers. No store or React imports. */

import type { TerrainRules } from '../store/mapStore'

// Keep in sync with TERRAIN_PRIORITY in mapStore.ts
const TERRAIN_PRIORITY = ['water', 'marsh', 'woods', 'light_woods', 'rough', 'clear'] as const

export function classifyHex(
  coverage: Record<number, number>,
  rules: TerrainRules,
  disabled: Set<string>,
): string {
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
): string[] {
  const layers: string[] = []
  for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
    if (disabled.has(t)) continue
    for (const rule of (rules[t] ?? [])) {
      if ((coverage[rule.classCode] ?? 0) >= rule.threshold) {
        layers.push(t)
        break
      }
    }
  }
  return layers
}
