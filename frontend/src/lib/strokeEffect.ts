/** Universal stroke effect renderer. Pure canvas — no React or store imports. */

import type { StrokeEffect, StrokeDash, BlobOverride } from '../store/mapStore'
import { DEFAULT_STROKE_EFFECT } from '../store/mapStore'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function dashArray(dash: StrokeDash, w: number): number[] {
  switch (dash) {
    case 'dashed':   return [w * 2.5, w * 1.5]
    case 'dotted':   return [w * 0.5, w * 1.5]
    case 'longdash': return [w * 5,   w * 2]
    case 'dashdot':  return [w * 4,   w * 1.5, w * 0.5, w * 1.5]
    default:         return []
  }
}

/**
 * Resolve a StrokeEffect from a BlobOverride, falling back to a global effect.
 * Handles legacy outlineEnabled/Color/Width fields transparently.
 */
export function resolveBlobEffect(
  override: BlobOverride | undefined,
  globalEffect: StrokeEffect,
  legacyOutlineEnabled: boolean,
  legacyOutlineColor: string,
  legacyOutlineWidth: number,
): StrokeEffect {
  const base: StrokeEffect = override?.effect
    ? { ...globalEffect, ...override.effect }
    : globalEffect
  const outlineEnabled = override?.outlineEnabled ?? legacyOutlineEnabled
  const outlineColor   = override?.outlineColor   ?? legacyOutlineColor
  const outlineWidth   = override?.outlineWidth   ?? legacyOutlineWidth
  return {
    ...base,
    outlineEnabled: base.outlineEnabled || outlineEnabled,
    outlineColor:   base.outlineEnabled ? base.outlineColor : outlineColor,
    outlineWidth:   base.outlineEnabled ? base.outlineWidth : outlineWidth,
  }
}
