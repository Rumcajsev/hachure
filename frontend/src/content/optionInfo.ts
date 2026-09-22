export interface OptionInfoEntry {
  title: string
  description: string
  /** Path under public/ (e.g. "/tooltips/road-shape.png"). Omit while unwritten — the tooltip renders without an image slot. */
  image?: string
}

// Keyed by a stable id — namespace by panel, e.g. "panel.roads" for a
// LeftRail button or "roads.roadShape" for a row inside the Roads flyout.
// HoverInfo silently no-ops for any id without an entry here, so wiring
// a row ahead of writing its copy is safe.
export const OPTION_INFO: Partial<Record<string, OptionInfoEntry>> = {
  'roads.roadShape': {
    title: 'Road shape',
    description: 'Controls how road centerlines are drawn between OSM nodes — spline tension, jitter, and corner rounding, set per tier.',
  },
}
