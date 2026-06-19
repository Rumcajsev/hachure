export class LayerCache {
  private canvas: OffscreenCanvas | null = null
  private bitmap: ImageBitmap | null = null
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
    this.bitmap?.close()
    this.bitmap = this.canvas.transferToImageBitmap()
    this.canvas = null  // free the now-blank canvas GPU backing; bitmap holds all the data
  }

  blit(mainCtx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    const source = this.bitmap ?? this.canvas
    if (source) mainCtx.drawImage(source, dx, dy, dw, dh)
  }

  /** The current rasterized content — bitmap if committed, canvas if still drawing, null if never built. */
  get source(): ImageBitmap | OffscreenCanvas | null { return this.bitmap ?? this.canvas }

  /** Whether the last blit used a pre-rasterized ImageBitmap (true) or raw OffscreenCanvas (false). */
  get hasBitmap(): boolean { return this.bitmap !== null }

  /** RGBA bytes allocated for this layer's live GPU resources (bitmap + canvas if both exist). */
  get estimatedBytes(): number {
    const bitmapBytes = this.bitmap ? this.bitmap.width * this.bitmap.height * 4 : 0
    const canvasBytes = this.canvas ? this.canvas.width * this.canvas.height * 4 : 0
    return bitmapBytes + canvasBytes
  }

  // Releases all GPU resources and marks dirty so the next prepare() allocates fresh.
  dispose(): void {
    this.bitmap?.close()
    this.bitmap = null
    this.canvas = null
    this.dirty = true
  }
}
