import { useMapStore } from '../store/mapStore'
import type { MapStore } from '../store/mapStore'
import { hexBorderController, hexBorderDeps } from './layers/hexBorderLayer'
import { buildingsController, buildingsDeps } from './layers/buildingsLayer'
import { settlementsController, settlementsDeps } from './layers/settlementsLayer'
import { highlightsController, highlightsDeps } from './layers/highlightsLayer'
import { hexNumbersController, hexNumbersDeps } from './layers/hexNumbersLayer'

type DepSelector = (s: MapStore) => unknown[]

const LAYER_DEPS: [{ markDirty(): void }, DepSelector][] = [
  [hexBorderController,   hexBorderDeps],
  [buildingsController,   buildingsDeps],
  [settlementsController, settlementsDeps],
  [highlightsController,  highlightsDeps],
  [hexNumbersController,  hexNumbersDeps],
]

function shallowChanged(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
  return false
}

/** Subscribe to the store and markDirty() each layer when its declared deps change.
 *  Call once on mount; use the returned function to unsubscribe on unmount. */
export function startLayerDirtySync(): () => void {
  let prev = useMapStore.getState()
  return useMapStore.subscribe((next) => {
    for (const [ctrl, sel] of LAYER_DEPS) {
      if (shallowChanged(sel(prev), sel(next))) ctrl.markDirty()
    }
    prev = next
  })
}
