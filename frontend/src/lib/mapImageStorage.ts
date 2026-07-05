/** Persists the uploaded map-image data URL in its own IndexedDB entry, separate
 *  from the main zustand-persisted store. The image can be tens of MB as a base64
 *  string — bundling it into the store's partialize would mean re-serializing and
 *  rewriting the whole store payload on every unrelated state change (every paint
 *  stroke, every slider drag). Writing it once here, only when the image itself
 *  changes, avoids that. */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

const KEY = 'ig2-map-image-data'

export function saveMapImageToStorage(dataUrl: string): void {
  idbSet(KEY, dataUrl).catch(() => {})
}

export function loadMapImageFromStorage(): Promise<string | null> {
  return idbGet<string>(KEY).then((v) => v ?? null).catch(() => null)
}

export function clearMapImageFromStorage(): void {
  idbDel(KEY).catch(() => {})
}
