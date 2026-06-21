export class LayerCache {
  private canvas: OffscreenCanvas | null = null
  private bitmap: ImageBitmap | null = null
  private prevBitmap: ImageBitmap | null = null
  private dirty = true
  /** True if the most recent prepare() call triggered a rebuild (false = cache hit). */
  lastRebuilt = false

  markDirty(): void {
    this.dirty = true
  }

  // Returns a ready-to-draw context and whether a rebuild happened.
  // Rebuilds only when dirty or bitmap is missing/wrong size — pan/zoom never trigger a rebuild.
  // Offscreen canvas is dpr² × CSS size — 2× supersampling on Retina (dpr=2 → 4× CSS pixels).
  // Caller is responsible for setting up scale/translate on the returned ctx when rebuilt=true.
  prepare(pw: number, ph: number, dpr: number): { ctx: OffscreenCanvasRenderingContext2D; rebuilt: boolean } {
    const offZoom = dpr
    const offW = Math.ceil(pw * dpr * offZoom)
    const offH = Math.ceil(ph * dpr * offZoom)

    // Cache hit: bitmap holds fresh content at the right size, canvas was freed after commitRebuild()
    if (!this.dirty && this.bitmap !== null && this.bitmap.width === offW && this.bitmap.height === offH) {
      this.lastRebuilt = false
      return { ctx: null!, rebuilt: false }
    }

    // Stash current bitmap as stale fallback — blit() will show it until commitRebuild() swaps in the new one
    this.prevBitmap?.close()
    this.prevBitmap = this.bitmap
    this.bitmap = null

    // Need to rebuild: allocate or reuse canvas
    const sizeMatch = this.canvas !== null && this.canvas.width === offW && this.canvas.height === offH
    let ctx: OffscreenCanvasRenderingContext2D
    if (sizeMatch) {
      ctx = this.canvas!.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, offW, offH)
    } else {
      this.canvas = new OffscreenCanvas(offW, offH)
      ctx = this.canvas.getContext('2d')!
    }

    this.dirty = false
    this.lastRebuilt = true
    return { ctx, rebuilt: true }
  }

  // Called after the caller finishes drawing into the ctx returned by prepare().
  // Transfers the OffscreenCanvas to an ImageBitmap — forces immediate GPU rasterization
  // so that blit() becomes a simple texture copy instead of a display-list replay.
  // The canvas is then nulled: its GPU backing is freed, leaving only the bitmap in VRAM.
  // Must be called exactly once per rebuild, after all drawing is complete.
  commitRebuild(): void {
    if (!this.canvas) return
    this.prevBitmap?.close()
    this.prevBitmap = null
    this.bitmap = this.canvas.transferToImageBitmap()
    this.canvas = null
  }

  blit(mainCtx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    const source = this.bitmap ?? this.prevBitmap ?? this.canvas
    if (source) mainCtx.drawImage(source, dx, dy, dw, dh)
  }

  /** The current rasterized content — newest committed bitmap, stale bitmap during rebuild, or canvas. */
  get source(): ImageBitmap | OffscreenCanvas | null { return this.bitmap ?? this.prevBitmap ?? this.canvas }

  /** Whether the last blit used a pre-rasterized ImageBitmap (true) or raw OffscreenCanvas (false). */
  get hasBitmap(): boolean { return this.bitmap !== null }

  /** RGBA bytes allocated for this layer's live GPU resources. */
  get estimatedBytes(): number {
    const bitmapBytes = this.bitmap ? this.bitmap.width * this.bitmap.height * 4 : 0
    const prevBytes = this.prevBitmap ? this.prevBitmap.width * this.prevBitmap.height * 4 : 0
    const canvasBytes = this.canvas ? this.canvas.width * this.canvas.height * 4 : 0
    return bitmapBytes + prevBytes + canvasBytes
  }

  // Releases all GPU resources and marks dirty so the next prepare() allocates fresh.
  dispose(): void {
    this.bitmap?.close()
    this.prevBitmap?.close()
    this.bitmap = null
    this.prevBitmap = null
    this.canvas = null
    this.dirty = true
  }
}
