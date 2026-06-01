import type { GeneratedHex, ClassificationParams } from '../store/mapStore'

type ElevClass = 'flat' | 'hills' | 'mountains'
const RANK: Record<ElevClass, number> = { flat: 0, hills: 1, mountains: 2 }

export function classifyElevation(
  hexes: GeneratedHex[],
  params: ClassificationParams,
): GeneratedHex[] {
  return hexes.map(h => {
    if (h.elevation_manual_override) return h
    if (
      h.terrain === 'water'
      || h.elevation_range_m == null
      || h.elevation_median_m == null
    ) {
      return { ...h, elevation_class: null, elevation_background: null }
    }

    const range = h.elevation_range_m
    const median = h.elevation_median_m

    let byRange: ElevClass = 'flat'
    if (range >= params.rangeMountainsM) byRange = 'mountains'
    else if (range >= params.rangeHillsM) byRange = 'hills'

    let byMedian: ElevClass = 'flat'
    if (median >= params.medianMountainsM) byMedian = 'mountains'
    else if (median >= params.medianHillsM) byMedian = 'hills'

    const result: ElevClass = RANK[byRange] >= RANK[byMedian] ? byRange : byMedian
    return { ...h, elevation_class: result, elevation_background: result === 'mountains' ? 'hills' : null }
  })
}
