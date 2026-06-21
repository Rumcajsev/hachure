import type { GeneratedHex, GridMetadata } from '../store/mapStore'

// ─── Layer contract ───────────────────────────────────────────────────────────

export interface LayerController {
  markDirty(): void
  /** Allocate / reuse offscreen canvas. Returns ctx when a rebuild is needed. */
  prepare(pw: number, ph: number, dpr: number): { ctx: OffscreenCanvasRenderingContext2D; rebuilt: boolean }
  /** Transfer offscreen canvas to ImageBitmap after drawing is complete. */
  commitRebuild(): void
  /** Blit cached bitmap/canvas onto the main context. */
  blit(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void
  dispose(): void
  readonly lastRebuilt: boolean
}

// ─── Render input ─────────────────────────────────────────────────────────────

/**
 * All data a layer draw call needs, passed explicitly so layers have no
 * direct imports from the component or the store.
 * Extended as layers are extracted in Phase 2–3.
 */
export interface RenderInput {
  // Paper / viewport
  pw: number
  ph: number
  dpr: number
  offZoom: number
  pan: { x: number; y: number }
  zoom: number
  isExport: boolean

  // Scene
  meta: GridMetadata
  hexes: GeneratedHex[]

  // Cross-layer flags
  skipExpensiveLayers: boolean
}
