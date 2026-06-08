/** Universal stroke/glow effect renderer. Pure canvas — no React or store imports. */

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
 * Render a glow halo for a set of filled polygons.
 * Draws each poly onto an offscreen, blurs it, composites behind existing content.
 */
export function drawPolyGlow(
  ctx: Ctx,
  polys: [number, number][][],
  color: string,
  blurPx: number,
  spreadPx: number,
  bounds: { x: number; y: number; w: number; h: number },
): void {
  if (polys.length === 0 || blurPx <= 0) return
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
  const pad = blurPx + spreadPx + 2
  const offX = Math.floor(bounds.x - pad)
  const offY = Math.floor(bounds.y - pad)
  const w = Math.ceil(bounds.x + bounds.w + pad) - offX
  const h = Math.ceil(bounds.y + bounds.h + pad) - offY
  const wd = Math.round(w * dpr)
  const hd = Math.round(h * dpr)
  if (wd <= 0 || hd <= 0) return

  const solid = new OffscreenCanvas(wd, hd)
  const sCtx = solid.getContext('2d')!
  sCtx.scale(dpr, dpr)
  sCtx.translate(-offX, -offY)
  sCtx.fillStyle = color
  if (spreadPx > 0) {
    // Slightly expand each poly by drawing with a wide line join before fill
    sCtx.lineJoin = 'round'
    sCtx.lineWidth = spreadPx * 2
    sCtx.strokeStyle = color
  }
  for (const poly of polys) {
    if (poly.length < 3) continue
    sCtx.beginPath()
    sCtx.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) sCtx.lineTo(poly[i][0], poly[i][1])
    sCtx.closePath()
    sCtx.fill()
    if (spreadPx > 0) sCtx.stroke()
  }

  const blurred = new OffscreenCanvas(wd, hd)
  const bCtx = blurred.getContext('2d')!
  bCtx.filter = `blur(${blurPx * dpr}px)`
  bCtx.drawImage(solid, 0, 0)

  ctx.drawImage(blurred, offX, offY, w, h)
}

/**
 * Render a glow halo for a polyline (river / road).
 * Caller provides a drawFn that strokes the path at the given half-width.
 * The glow is composited before calling drawFn so it sits behind the fill.
 */
export function drawLineGlow(
  ctx: Ctx,
  effect: StrokeEffect,
  halfWidth: number,
  bounds: { x: number; y: number; w: number; h: number },
  drawStrokeFn: (ctx: Ctx, halfWidth: number, color: string) => void,
): void {
  if (!effect.glowEnabled || effect.glowBlur <= 0) return
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
  const totalHW = halfWidth + effect.glowSpread
  const pad = effect.glowBlur + totalHW + 2
  const offX = Math.floor(bounds.x - pad)
  const offY = Math.floor(bounds.y - pad)
  const w = Math.ceil(bounds.x + bounds.w + pad) - offX
  const h = Math.ceil(bounds.y + bounds.h + pad) - offY
  const wd = Math.round(w * dpr)
  const hd = Math.round(h * dpr)
  if (wd <= 0 || hd <= 0) return

  const solid = new OffscreenCanvas(wd, hd)
  const sCtx = solid.getContext('2d')!
  sCtx.scale(dpr, dpr)
  sCtx.translate(-offX, -offY)
  drawStrokeFn(sCtx, totalHW, effect.glowColor)

  const blurred = new OffscreenCanvas(wd, hd)
  const bCtx = blurred.getContext('2d')!
  bCtx.filter = `blur(${effect.glowBlur * dpr}px)`
  bCtx.drawImage(solid, 0, 0)

  ctx.drawImage(blurred, offX, offY, w, h)
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
