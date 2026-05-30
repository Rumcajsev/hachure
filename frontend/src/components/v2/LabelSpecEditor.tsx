import { useTheme } from '../../context/ThemeContext'
import type { LabelSpec } from '../../lib/labelPresets'

export const FONT_OPTIONS = [
  { label: 'IBM Plex Serif',        value: '"IBM Plex Serif", Georgia, serif' },
  { label: 'Cormorant Garamond',    value: '"Cormorant Garamond", Georgia, serif' },
  { label: 'Cinzel',                value: '"Cinzel", Georgia, serif' },
  { label: 'Cinzel Decorative',     value: '"Cinzel Decorative", Georgia, serif' },
  { label: 'Crimson Pro',           value: '"Crimson Pro", Georgia, serif' },
  { label: 'EB Garamond',           value: '"EB Garamond", Georgia, serif' },
  { label: 'GFS Didot',             value: '"GFS Didot", Georgia, serif' },
  { label: 'DM Serif Display',      value: '"DM Serif Display", Georgia, serif' },
  { label: 'Spectral',              value: '"Spectral", Georgia, serif' },
  { label: 'Playfair Display',      value: '"Playfair Display", Georgia, serif' },
  { label: 'Libre Baskerville',     value: '"Libre Baskerville", Georgia, serif' },
  { label: 'Arvo',                  value: '"Arvo", Georgia, serif' },
  { label: 'IM Fell English',       value: '"IM Fell English", serif' },
  { label: 'Almendra',              value: '"Almendra", Georgia, serif' },
  { label: 'Georgia (system)',      value: 'Georgia, serif' },
  { label: 'IBM Plex Sans Cond.',   value: '"IBM Plex Sans Condensed", sans-serif' },
  { label: 'Oswald',                value: '"Oswald", sans-serif' },
  { label: 'Teko',                  value: '"Teko", sans-serif' },
  { label: 'Fjalla One',            value: '"Fjalla One", sans-serif' },
  { label: 'PT Sans Narrow',        value: '"PT Sans Narrow", sans-serif' },
  { label: 'Roboto Condensed',      value: '"Roboto Condensed", sans-serif' },
  { label: 'Raleway',               value: '"Raleway", sans-serif' },
  { label: 'Cabin Condensed',       value: '"Cabin Condensed", sans-serif' },
  { label: 'Source Code Pro',       value: '"Source Code Pro", monospace' },
]

/**
 * Renders font/color/size/style controls for a single LabelSpec.
 * Wrap in a padding container as needed by the parent flyout.
 */
export function LabelSpecEditorRows({
  spec,
  previewText = 'Sample text',
  onChange,
  onReset,
  hasOverride,
}: {
  spec: LabelSpec
  previewText?: string
  onChange: (p: Partial<LabelSpec>) => void
  onReset?: () => void
  hasOverride?: boolean
}) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>Font</span>
        <select
          value={spec.family}
          onChange={e => onChange({ family: e.target.value })}
          style={{ flex: 1, fontFamily: t.mono, fontSize: 9.5, background: t.paper2, color: t.ink, border: `1px solid ${t.line}`, padding: '3px 4px' }}
        >
          {FONT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>Color</span>
        <input type="color" value={spec.color} onChange={e => onChange({ color: e.target.value })}
          style={{ width: 26, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
        <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute }}>{spec.color}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>Size</span>
        <input type="range" min={0.4} max={2.0} step={0.05} value={spec.sizeScale}
          onChange={e => onChange({ sizeScale: parseFloat(e.target.value) })}
          style={{ flex: 1 }} />
        <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute, width: 28 }}>{spec.sizeScale.toFixed(2)}×</span>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['italic', 'uppercase'] as const).map(key => (
          <button key={key} onClick={() => onChange({ [key]: !spec[key] })} style={{
            padding: '2px 8px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.3,
            background: spec[key] ? t.ink : 'transparent',
            color: spec[key] ? t.surface : t.inkMute,
            border: `1px solid ${spec[key] ? t.ink : t.line}`,
            cursor: 'pointer',
          }}>
            {key === 'italic' ? 'Italic' : 'UPPERCASE'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>Spacing</span>
        <input type="range" min={0} max={0.5} step={0.01} value={spec.letterSpacing}
          onChange={e => onChange({ letterSpacing: parseFloat(e.target.value) })}
          style={{ flex: 1 }} />
        <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute, width: 34 }}>{spec.letterSpacing.toFixed(2)}em</span>
      </div>

      <div style={{
        padding: '6px 10px', background: t.paper2, border: `1px solid ${t.line}`,
        fontFamily: spec.family.split(',')[0].replace(/"/g, ''),
        fontSize: Math.round(14 * spec.sizeScale),
        fontStyle: spec.italic ? 'italic' : 'normal',
        fontWeight: spec.weight,
        color: spec.color,
        letterSpacing: `${spec.letterSpacing}em`,
        textTransform: spec.uppercase ? 'uppercase' : 'none',
      }}>
        {previewText}
      </div>

      {hasOverride && onReset && (
        <button onClick={onReset} style={{
          alignSelf: 'flex-end', padding: '2px 10px', fontFamily: t.mono, fontSize: 9,
          background: 'transparent', color: t.inkMute, border: `1px solid ${t.line}`, cursor: 'pointer',
        }}>
          ↺ Reset to preset
        </button>
      )}
    </div>
  )
}
