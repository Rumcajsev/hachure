// ─── Layer contract ───────────────────────────────────────────────────────────

/**
 * Every layer controller must satisfy this shape. TInput is the layer-specific
 * input record passed to draw(). TypeScript enforces the contract when each
 * controller export is annotated `: LayerController<XxxInput>`.
 */
export interface LayerController<TInput = unknown> {
  /** Signal that cached state is stale — next draw() will rebuild. */
  markDirty(): void
  /** True if the most recent draw() triggered a cache rebuild. */
  readonly lastRebuilt: boolean
  /** Draw the layer onto ctx, rebuilding the offscreen cache if dirty. */
  draw(ctx: CanvasRenderingContext2D, input: TInput): void
  /** Release OffscreenCanvas and ImageBitmap resources. */
  dispose(): void
}
