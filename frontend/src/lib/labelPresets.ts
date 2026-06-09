/** Label typography system — specs per category and built-in presets. */

export type LabelCategory =
  | 'cityMajor'
  | 'cityMinor'
  | 'town'
  | 'village'
  | 'water'
  | 'terrain'
  | 'hexRef'

export interface LabelSpec {
  family: string
  sizeScale: number
  weight: 300 | 400 | 600 | 700
  italic: boolean
  uppercase: boolean
  letterSpacing: number  // em
  color: string
}

export interface LabelPreset {
  id: string
  name: string
  mapStyleDefault?: 'standard' | 'historical_simple'
  specs: Record<LabelCategory, LabelSpec>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function spec(
  family: string,
  sizeScale: number,
  weight: LabelSpec['weight'],
  italic: boolean,
  uppercase: boolean,
  letterSpacing: number,
  color: string,
): LabelSpec {
  return { family, sizeScale, weight, italic, uppercase, letterSpacing, color }
}

// ── Built-in presets ───────────────────────────────────────────────────────────

// Order matches the HTML body: 01, 02, 03, 04, 06, 08, 09, 10, 11, 12, 14, 15, 16
// Approaches 05 (Editorial), 07 (État-Major), 13 (Age of Sail), 17 (Schoolbook)
// were defined in CSS but not shown in the comparison document — excluded.
export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: 'classic_cartographic',
    name: 'Classic',
    mapStyleDefault: 'historical_simple',
    specs: {
      cityMajor: spec('"Cinzel", Georgia, serif',            0.97, 400, false, true,  0.16, '#1a130a'),
      cityMinor: spec('"Crimson Pro", Georgia, serif',       0.86, 600, false, false, 0.02, '#221808'),
      town:      spec('"Crimson Pro", Georgia, serif',       0.78, 400, false, false, 0.01, '#3a2e18'),
      village:   spec('"Crimson Pro", Georgia, serif',       0.70, 300, false, false, 0.01, '#4a3e28'),
      water:     spec('"EB Garamond", Georgia, serif',       0.71, 400, true,  false, 0.06, '#3a6878'),
      terrain:   spec('"Cormorant Garamond", Georgia, serif', 0.71, 300, true,  true,  0.08, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',        0.62, 300, false, false, 0.00, '#666050'),
    },
  },
  {
    id: 'gmt_wargame',
    name: 'GMT Wargame',
    specs: {
      cityMajor: spec('"Libre Baskerville", Georgia, serif', 0.93, 700, false, true,  0.10, '#181410'),
      cityMinor: spec('"Arvo", Georgia, serif',              0.85, 700, false, false, 0.02, '#282018'),
      town:      spec('"Arvo", Georgia, serif',              0.77, 400, false, false, 0.01, '#383028'),
      village:   spec('"Arvo", Georgia, serif',              0.68, 400, false, false, 0.01, '#484038'),
      water:     spec('"Libre Baskerville", Georgia, serif', 0.70, 400, true,  false, 0.04, '#3a6878'),
      terrain:   spec('"Libre Baskerville", Georgia, serif', 0.70, 400, true,  false, 0.06, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',        0.62, 300, false, false, 0.00, '#666050'),
    },
  },
  {
    id: 'military_ops',
    name: 'Military Ops',
    specs: {
      cityMajor: spec('"Oswald", sans-serif',                0.93, 500, false, true,  0.14, '#1a1a14'),
      cityMinor: spec('"PT Sans Narrow", sans-serif',        0.85, 700, false, false, 0.03, '#282820'),
      town:      spec('"PT Sans Narrow", sans-serif',        0.77, 400, false, false, 0.02, '#383830'),
      village:   spec('"PT Sans Narrow", sans-serif',        0.69, 400, false, false, 0.01, '#484840'),
      water:     spec('"Oswald", sans-serif',                0.69, 300, true,  false, 0.05, '#3a6878'),
      terrain:   spec('"Oswald", sans-serif',                0.67, 300, false, true,  0.12, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',        0.62, 400, false, false, 0.00, '#686858'),
    },
  },
  {
    id: 'ibm_hybrid',
    name: 'IBM Plex',
    mapStyleDefault: 'standard',
    specs: {
      cityMajor: spec('"IBM Plex Serif", Georgia, serif',    1.00, 600, false, true,  0.08, '#1a1a14'),
      cityMinor: spec('"IBM Plex Serif", Georgia, serif',    0.86, 600, false, false, 0.02, '#2a2a1e'),
      town:      spec('"IBM Plex Sans Condensed", sans-serif', 0.79, 400, false, false, 0.03, '#3a3a2e'),
      village:   spec('"IBM Plex Sans Condensed", sans-serif', 0.72, 300, false, false, 0.02, '#4a4a3e'),
      water:     spec('"IBM Plex Serif", Georgia, serif',    0.74, 300, true,  false, 0.04, '#4a7898'),
      terrain:   spec('"IBM Plex Sans Condensed", sans-serif', 0.71, 300, true,  true,  0.10, '#5a7040'),
      hexRef:    spec('"IBM Plex Sans Condensed", monospace', 0.65, 300, false, false, 0.00, '#888878'),
    },
  },
  {
    id: 'ordnance_survey',
    name: 'Ordnance Survey',
    specs: {
      cityMajor: spec('"Playfair Display", Georgia, serif',   0.93, 700, false, true,  0.08, '#181410'),
      cityMinor: spec('"Playfair Display", Georgia, serif',   0.85, 700, false, false, 0.02, '#28201a'),
      town:      spec('"Playfair Display", Georgia, serif',   0.77, 400, false, false, 0.01, '#383028'),
      village:   spec('"Playfair Display", Georgia, serif',   0.68, 400, false, false, 0.01, '#484038'),
      water:     spec('"Playfair Display", Georgia, serif',   0.68, 400, true,  false, 0.03, '#3a6878'),
      terrain:   spec('"Playfair Display", Georgia, serif',   0.67, 400, true,  true,  0.05, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',         0.62, 300, false, false, 0.00, '#666050'),
    },
  },
  {
    id: 'imperial',
    name: 'Imperial Russian',
    specs: {
      cityMajor: spec('"IM Fell English", Georgia, serif',    0.93, 400, false, true,  0.06, '#18100a'),
      cityMinor: spec('"IM Fell English", Georgia, serif',    0.85, 400, false, false, 0.02, '#22180a'),
      town:      spec('"IM Fell English", Georgia, serif',    0.77, 400, false, false, 0.01, '#382a14'),
      village:   spec('"IM Fell English", Georgia, serif',    0.68, 400, false, false, 0.01, '#48381e'),
      water:     spec('"IM Fell English", Georgia, serif',    0.68, 400, true,  false, 0.05, '#3a6878'),
      terrain:   spec('"IM Fell English", Georgia, serif',    0.67, 400, true,  true,  0.06, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',         0.62, 300, false, false, 0.00, '#666050'),
    },
  },
  {
    id: 'wwii_german',
    name: 'WWII German',
    specs: {
      cityMajor: spec('"Teko", sans-serif',                   0.97, 400, false, true,  0.18, '#1a1a14'),
      cityMinor: spec('"Teko", sans-serif',                   0.88, 500, false, true,  0.06, '#282820'),
      town:      spec('"Teko", sans-serif',                   0.79, 400, false, true,  0.04, '#383830'),
      village:   spec('"Roboto Condensed", sans-serif',       0.71, 300, false, false, 0.04, '#484840'),
      water:     spec('"Roboto Condensed", sans-serif',       0.70, 300, true,  false, 0.06, '#3a6878'),
      terrain:   spec('"Teko", sans-serif',                   0.67, 300, false, true,  0.18, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',         0.62, 400, false, false, 0.00, '#686858'),
    },
  },
  {
    id: 'wwii_allied',
    name: 'WWII Allied',
    specs: {
      cityMajor: spec('"Fjalla One", sans-serif',             0.93, 400, false, true,  0.10, '#1a1a14'),
      cityMinor: spec('"Fjalla One", sans-serif',             0.84, 400, false, true,  0.04, '#282820'),
      town:      spec('"PT Sans Narrow", sans-serif',         0.78, 700, false, false, 0.02, '#383830'),
      village:   spec('"PT Sans Narrow", sans-serif',         0.70, 400, false, false, 0.01, '#484840'),
      water:     spec('"PT Sans Narrow", sans-serif',         0.68, 400, true,  false, 0.04, '#3a6878'),
      terrain:   spec('"PT Sans Narrow", sans-serif',         0.67, 400, false, true,  0.10, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',         0.62, 400, false, false, 0.00, '#686858'),
    },
  },
  {
    id: 'soviet_topo',
    name: 'Soviet Topo',
    specs: {
      cityMajor: spec('"IBM Plex Sans Condensed", sans-serif', 0.91, 600, false, true,  0.20, '#141414'),
      cityMinor: spec('"IBM Plex Sans Condensed", sans-serif', 0.81, 600, false, true,  0.08, '#242420'),
      town:      spec('"IBM Plex Sans Condensed", sans-serif', 0.74, 400, false, true,  0.06, '#383830'),
      village:   spec('"IBM Plex Sans Condensed", sans-serif', 0.67, 300, false, false, 0.04, '#484840'),
      water:     spec('"IBM Plex Sans Condensed", sans-serif', 0.67, 300, true,  false, 0.08, '#3a6878'),
      terrain:   spec('"IBM Plex Sans Condensed", sans-serif', 0.65, 300, false, true,  0.16, '#4a6030'),
      hexRef:    spec('"IBM Plex Sans Condensed", monospace',  0.62, 300, false, false, 0.00, '#686858'),
    },
  },
  {
    id: 'art_deco',
    name: 'Art Deco',
    specs: {
      cityMajor: spec('"Raleway", sans-serif',                0.93, 300, false, true,  0.22, '#1a130a'),
      cityMinor: spec('"Libre Baskerville", Georgia, serif',  0.85, 700, false, false, 0.02, '#221808'),
      town:      spec('"Libre Baskerville", Georgia, serif',  0.77, 400, false, false, 0.01, '#382a14'),
      village:   spec('"Raleway", sans-serif',                0.70, 400, false, false, 0.06, '#483818'),
      water:     spec('"Libre Baskerville", Georgia, serif',  0.68, 400, true,  false, 0.04, '#3a6878'),
      terrain:   spec('"Raleway", sans-serif',                0.67, 300, false, true,  0.20, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',         0.62, 300, false, false, 0.00, '#666050'),
    },
  },
  {
    id: 'cold_war_nato',
    name: 'Cold War NATO',
    specs: {
      cityMajor: spec('"Cabin Condensed", sans-serif',        0.91, 600, false, true,  0.22, '#141814'),
      cityMinor: spec('"Cabin Condensed", sans-serif',        0.81, 600, false, true,  0.10, '#242820'),
      town:      spec('"Cabin Condensed", sans-serif',        0.74, 400, false, true,  0.08, '#343830'),
      village:   spec('"Cabin Condensed", sans-serif',        0.67, 400, false, true,  0.06, '#444840'),
      water:     spec('"IBM Plex Sans Condensed", sans-serif', 0.67, 300, true,  false, 0.08, '#3a6878'),
      terrain:   spec('"Cabin Condensed", sans-serif',        0.65, 400, false, true,  0.20, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',         0.62, 400, false, false, 0.00, '#606858'),
    },
  },
  {
    id: 'modern_gmt',
    name: 'Modern GMT',
    specs: {
      cityMajor: spec('"Spectral", Georgia, serif',           0.93, 600, false, true,  0.10, '#18140a'),
      cityMinor: spec('"Spectral", Georgia, serif',           0.85, 600, false, false, 0.02, '#221a0e'),
      town:      spec('"Spectral", Georgia, serif',           0.77, 400, false, false, 0.01, '#382e18'),
      village:   spec('"Raleway", sans-serif',                0.70, 400, false, false, 0.04, '#483c1c'),
      water:     spec('"Spectral", Georgia, serif',           0.68, 300, true,  false, 0.05, '#3a6878'),
      terrain:   spec('"Raleway", sans-serif',                0.67, 300, false, true,  0.14, '#4a6030'),
      hexRef:    spec('"IBM Plex Sans Condensed", monospace', 0.62, 300, false, false, 0.00, '#686858'),
    },
  },
  {
    id: 'copperplate_atlas',
    name: 'Copperplate',
    specs: {
      cityMajor: spec('"GFS Didot", Georgia, serif',         0.97, 400, false, true,  0.22, '#18120a'),
      cityMinor: spec('"Cormorant Garamond", Georgia, serif', 0.86, 600, true,  false, 0.02, '#221808'),
      town:      spec('"Cormorant Garamond", Georgia, serif', 0.78, 400, true,  false, 0.01, '#3a2e18'),
      village:   spec('"Cormorant Garamond", Georgia, serif', 0.70, 300, true,  false, 0.01, '#4a3e28'),
      water:     spec('"Cormorant Garamond", Georgia, serif', 0.70, 300, true,  false, 0.08, '#3a6878'),
      terrain:   spec('"GFS Didot", Georgia, serif',         0.68, 400, true,  true,  0.16, '#4a6030'),
      hexRef:    spec('"Source Code Pro", monospace',        0.62, 300, false, false, 0.00, '#666050'),
    },
  },
]

export const LABEL_PRESET_MAP: Record<string, LabelPreset> = Object.fromEntries(
  LABEL_PRESETS.map(p => [p.id, p])
)

export const DEFAULT_LABEL_PRESET_BY_STYLE: Record<string, string> = {
  standard: 'ibm_hybrid',
  historical_simple: 'classic_cartographic',
}

export const DEFAULT_LABEL_PRESET_ID = 'ibm_hybrid'

/** Merge preset specs with per-category overrides. */
export function resolveLabels(
  presetId: string,
  overrides: Partial<Record<LabelCategory, Partial<LabelSpec>>>,
): Record<LabelCategory, LabelSpec> {
  const preset = LABEL_PRESET_MAP[presetId] ?? LABEL_PRESETS[0]
  const result = {} as Record<LabelCategory, LabelSpec>
  for (const cat of Object.keys(preset.specs) as LabelCategory[]) {
    result[cat] = { ...preset.specs[cat], ...(overrides[cat] ?? {}) }
  }
  return result
}

/** Build a canvas font string from a LabelSpec and a base px size. */
export function specToFont(s: LabelSpec, basePx: number): string {
  const px = Math.max(5, basePx * s.sizeScale)
  const style = s.italic ? 'italic ' : ''
  return `${style}${s.weight} ${px}px ${s.family}`
}
