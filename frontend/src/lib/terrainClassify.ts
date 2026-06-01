/** Pure terrain classification helpers. No store or React imports. */

// Keep in sync with TERRAIN_PRIORITY in mapStore.ts
const TERRAIN_PRIORITY = ['water', 'marsh', 'woods', 'light_woods', 'rough', 'clear'] as const

export function classifyHex(
  coverage: Record<string, number>,
  thresholds: Record<string, number>,
  disabled: Set<string>,
): string {
  for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
    if (disabled.has(t)) continue
    const coverageKey = t === 'light_woods' ? 'woods' : t
    if ((coverage[coverageKey] ?? 0) >= (thresholds[t] ?? 0.25)) return t
  }
  if (!disabled.has('clear')) return 'clear'
  for (const t of TERRAIN_PRIORITY) {
    if (!disabled.has(t)) return t
  }
  return 'clear'
}

export function classifyHexLayers(
  coverage: Record<string, number>,
  thresholds: Record<string, number>,
  disabled: Set<string>,
): string[] {
  const layers: string[] = []
  for (const t of TERRAIN_PRIORITY.slice(0, -1)) {
    if (disabled.has(t)) continue
    const coverageKey = t === 'light_woods' ? 'woods' : t
    if ((coverage[coverageKey] ?? 0) >= (thresholds[t] ?? 0.25)) layers.push(t)
  }
  return layers
}
