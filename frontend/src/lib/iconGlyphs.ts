/** Icon overlay glyphs — all drawn from the Lucide (ISC) icon set. */

export const PICTORIAL_ICON_SHAPES = [
  'target', 'flag', 'anchor', 'plane', 'crosshair', 'radio-tower', 'warehouse', 'factory',
] as const

export type PictorialIconShape = typeof PICTORIAL_ICON_SHAPES[number]

/** The plain geometric markers — filled solid, using Lucide's own (rounded) outlines. */
export const BASE_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star'] as const
export type BaseShape = typeof BASE_SHAPES[number]

/** A symbol's optional filled backdrop. 'none' draws just the glyph outline. */
export const BACKGROUND_SHAPES = ['none', 'circle', 'square', 'triangle', 'diamond'] as const
export type BackgroundShape = typeof BACKGROUND_SHAPES[number]

/** Icon fit as a fraction of the marker radius when it sits on a backdrop, vs. bare (no backdrop). */
export const ICON_GLYPH_FIT = 0.62
export const ICON_GLYPH_FIT_BARE = 0.92
export const ICON_GLYPH_STROKE = 2.2

const arcPath = (cx: number, cy: number, r: number) =>
  `M${cx + r},${cy} A${r},${r} 0 1,1 ${cx - r},${cy} A${r},${r} 0 1,1 ${cx + r},${cy}`

/** Base/background shapes (23x24 viewBox), filled solid — single closed subpath each. */
export const SHAPE_SUBPATHS: Record<BaseShape, string[]> = {
  circle: [arcPath(12, 12, 10)],
  square: ['M5,3 H19 A2,2 0 0 1 21,5 V19 A2,2 0 0 1 19,21 H5 A2,2 0 0 1 3,19 V5 A2,2 0 0 1 5,3 Z'],
  triangle: ['M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'],
  diamond: ['M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
}

export function isBaseShape(shape: string): shape is BaseShape {
  return Object.prototype.hasOwnProperty.call(SHAPE_SUBPATHS, shape)
}

/** Each shape is a list of independent subpaths (23x24 viewBox) — kept separate so a leading
 *  relative moveto in any one of them is never re-interpreted against a previous subpath's endpoint. */
export const ICON_GLYPH_SUBPATHS: Record<PictorialIconShape, string[]> = {
  target: [arcPath(12, 12, 10), arcPath(12, 12, 6), arcPath(12, 12, 2)],
  flag: [
    'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528',
  ],
  anchor: [
    'M12 6v16',
    'm19 13 2-1a9 9 0 0 1-18 0l2 1',
    'M9 11h6',
    arcPath(12, 4, 2),
  ],
  plane: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  crosshair: [
    arcPath(12, 12, 10),
    'M22 12L18 12',
    'M6 12L2 12',
    'M12 6L12 2',
    'M12 22L12 18',
  ],
  'radio-tower': [
    'M4.9 16.1C1 12.2 1 5.8 4.9 1.9',
    'M7.8 4.7a6.14 6.14 0 0 0-.8 7.5',
    arcPath(12, 9, 2),
    'M16.2 4.8c2 2 2.26 5.11.8 7.47',
    'M19.1 1.9a9.96 9.96 0 0 1 0 14.1',
    'M9.5 18h5',
    'm8 22 4-11 4 11',
  ],
  warehouse: [
    'M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11',
    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z',
    'M6 13h12',
    'M6 17h12',
  ],
  factory: [
    'M12 16h.01',
    'M16 16h.01',
    'M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z',
    'M8 16h.01',
  ],
}

export function isPictorialIconShape(shape: string): shape is PictorialIconShape {
  return Object.prototype.hasOwnProperty.call(ICON_GLYPH_SUBPATHS, shape)
}
