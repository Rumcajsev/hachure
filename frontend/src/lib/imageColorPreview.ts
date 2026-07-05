/** Cheap live preview of what a tiered color swatch currently matches on the source
 *  map image — raw per-pixel classification (no skeletonize/trace), rendered as a
 *  translucent tier-colored mask so the tolerance slider gets instant feedback.
 *  No store or React imports. */

import { classifyPixels, type TieredLineSwatch } from './imageLineExtract'

const PREVIEW_ALPHA = 140

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

/** Builds an RGBA mask the same size as imgData: transparent where no swatch
 *  matches, tierColors[tier] at PREVIEW_ALPHA where it does. */
export function buildColorPreviewMask(
  imgData: ImageData,
  swatches: TieredLineSwatch[],
  tierColors: [string, string, string],
  eraseMask?: Uint8Array | null,
): ImageData {
  const { width, height } = imgData
  const out = new ImageData(width, height)
  if (swatches.length === 0) return out
  const classified = classifyPixels(imgData, swatches, eraseMask)
  const rgbByTier = tierColors.map(hexToRgbTuple)
  for (let i = 0; i < classified.length; i++) {
    const tier = classified[i]
    if (tier < 0) continue
    const [r, g, b] = rgbByTier[tier]
    const idx = i * 4
    out.data[idx] = r
    out.data[idx + 1] = g
    out.data[idx + 2] = b
    out.data[idx + 3] = PREVIEW_ALPHA
  }
  return out
}
