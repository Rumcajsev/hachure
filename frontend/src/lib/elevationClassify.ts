import type { GeneratedHex, ClassificationParams } from '../store/mapStore'

type ElevClass = 'flat' | 'hills' | 'mountains'
const RANK: Record<ElevClass, number> = { flat: 0, hills: 1, mountains: 2 }

function pctThreshold(sorted: number[], topPct: number): number {
  const idx = Math.max(0, Math.floor(sorted.length * (1 - topPct / 100)))
  return sorted[idx]
}

export function classifyElevation(
  hexes: GeneratedHex[],
  params: ClassificationParams,
): GeneratedHex[] {
  const active = hexes.filter(
    h => !h.elevation_manual_override
      && h.terrain !== 'sea' && !h.isLake
      && h.elevation_range_m != null
      && h.elevation_median_m != null
  )

  if (active.length === 0) {
    return hexes.map(h => ({ ...h, elevation_class: null }))
  }

  const rangesSorted = active.map(h => h.elevation_range_m!).sort((a, b) => a - b)
  const mediansSorted = active.map(h => h.elevation_median_m!).sort((a, b) => a - b)

  // Same % thresholds applied to both signals
  const mRangeMin = pctThreshold(rangesSorted, params.mountainsPct)
  const hRangeMin = pctThreshold(rangesSorted, params.mountainsPct + params.hillsPct)
  const mMedianMin = pctThreshold(mediansSorted, params.mountainsPct)
  const hMedianMin = pctThreshold(mediansSorted, params.mountainsPct + params.hillsPct)

  return hexes.map(h => {
    if (h.elevation_manual_override) return h
    if (
      h.terrain === 'sea' || h.isLake
      || h.elevation_range_m == null
      || h.elevation_median_m == null
    ) {
      return { ...h, elevation_class: null, elevation_background: null }
    }

    const range = h.elevation_range_m
    const median = h.elevation_median_m

    // Ruggedness signal — only active if range meets the floor
    let byRange: ElevClass = 'flat'
    if (range >= params.rangeFloorM) {
      if (range >= mRangeMin) byRange = 'mountains'
      else if (range >= hRangeMin) byRange = 'hills'
    }

    // Height signal — only active if median meets the floor
    let byMedian: ElevClass = 'flat'
    if (median >= params.medianFloorM) {
      if (median >= mMedianMin) byMedian = 'mountains'
      else if (median >= hMedianMin) byMedian = 'hills'
    }

    const result: ElevClass = RANK[byRange] >= RANK[byMedian] ? byRange : byMedian
    return { ...h, elevation_class: result, elevation_background: result === 'mountains' ? 'hills' : null }
  })
}
