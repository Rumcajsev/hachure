export class LayerCache {
  private canvas: OffscreenCanvas | null = null
  private dirty = true
  /** True if the most recent prepare() call triggered a rebuild (false = cache hit). */
  lastRebuilt = false

  markDirty(): void {
    this.dirty = true
  }

  // Returns a ready-to-draw context and whether a rebuild happened.
  // Rebuilds only when dirty or paper size changed — pan/zoom never trigger a rebuild.
  // Offscreen canvas is dpr² × CSS size — 2× supersampling on Retina (dpr=2 → 4× CSS pixels).
  // Caller is responsible for setting up scale/translate on the returned ctx when rebuilt=true.
  prepare(pw: number, ph: number, dpr: number): { ctx: OffscreenCanvasRenderingContext2D; rebuilt: boolean } {
    const offZoom = dpr
    const offW = Math.ceil(pw * dpr * offZoom)
    const offH = Math.ceil(ph * dpr * offZoom)
    const sizeMatch = this.canvas !== null && this.canvas.width === offW && this.canvas.height === offH

    if (!this.dirty && sizeMatch) {
      this.lastRebuilt = false
      return { ctx: this.canvas!.getContext('2d')!, rebuilt: false }
    }

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

  blit(mainCtx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    if (this.canvas) mainCtx.drawImage(this.canvas, dx, dy, dw, dh)
  }

  // Releases the offscreen canvas and marks dirty so the next prepare() allocates fresh.
  dispose(): void {
    this.canvas = null
    this.dirty = true
  }
}
