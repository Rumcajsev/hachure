import type { ActiveTool, GeneratedHex, GridMetadata } from '../store/mapStore'

// ─── Tool context (injected by TerrainViewCanvas) ────────────────────────────

/**
 * Everything a tool needs to operate. Passed in on every event so tools are
 * stateless where possible and never import the component directly.
 */
export interface ToolContext {
  /** Trigger a full compositor redraw. */
  draw(): void

  viewport: {
    /** Convert a CSS-space client point to logical (paper-mm) coordinates.
     *  Returns null when outside the paper. */
    clientToLogical(clientX: number, clientY: number): { x: number; y: number } | null
    zoomRef: React.RefObject<number>
    panRef: React.RefObject<{ x: number; y: number }>
  }

  scene: {
    metaRef: React.RefObject<GridMetadata | null>
    hexesRef: React.RefObject<GeneratedHex[]>
    hexRadiusRef: React.RefObject<number>
  }
}

// ─── Tool contract ────────────────────────────────────────────────────────────

/**
 * One tool per file under interaction/tools/. Each handles pointer events and
 * translates them into store mutations. No drawing, no layer knowledge.
 * Returns true from onDown when the event is consumed (stops dispatcher).
 */
export interface Tool {
  readonly type: ActiveTool['type']
  onDown(e: PointerEvent, ctx: ToolContext): boolean
  onMove(e: PointerEvent, ctx: ToolContext): void
  onUp(e: PointerEvent, ctx: ToolContext): void
  onClick(e: MouseEvent, ctx: ToolContext): void
}

// ─── Hit testing ─────────────────────────────────────────────────────────────

export type HitTarget =
  | { kind: 'hex'; q: number; r: number }
  | { kind: 'road-node'; segKey: string; nodeIndex: number }
  | { kind: 'river-node'; segKey: string; nodeIndex: number }
  | { kind: 'settlement'; id: string }
  | { kind: 'none' }
