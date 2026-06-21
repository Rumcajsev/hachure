/**
 * Thin OffscreenCanvas that sits above all cached layers during a drag.
 * Redrawn every frame (one item only) — never committed to a bitmap.
 */
export class ActiveEditOverlay {
  private canvas: OffscreenCanvas | null = null
  private _isActive = false

  get isActive(): boolean { return this._isActive }

  /** Clear + resize if needed, set up paper-space transform, return the context to draw into. */
  begin(pw: number, ph: number, dpr: number): OffscreenCanvasRenderingContext2D {
    const offZoom = dpr
    const w = Math.ceil(pw * dpr * offZoom)
    const h = Math.ceil(ph * dpr * offZoom)
    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas = new OffscreenCanvas(w, h)
    }
    const ctx = this.canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.scale(dpr * offZoom, dpr * offZoom)
    this._isActive = true
    return ctx
  }

  /** Copy overlay onto the main canvas. No-op if not active. */
  blit(mainCtx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    if (this._isActive && this.canvas) mainCtx.drawImage(this.canvas, dx, dy, dw, dh)
  }

  /** Mark overlay inactive — canvas memory is retained for the next drag. */
  end(): void {
    this._isActive = false
  }

  dispose(): void {
    this._isActive = false
    this.canvas = null
  }
}

export const activeEditOverlay = new ActiveEditOverlay()
