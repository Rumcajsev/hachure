import type { StrokeEffect, StrokeDash } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'
import { MiniSlider, BigColorSwatch, SegmentedControl, ToggleSwitch } from './sidebar'

const DASH_OPTIONS: { value: StrokeDash; label: string }[] = [
  { value: 'solid',    label: '——' },
  { value: 'dashed',   label: '- -' },
  { value: 'dotted',   label: '···' },
  { value: 'longdash', label: '— —' },
  { value: 'dashdot',  label: '-·-' },
]

const DEFAULT_GLOW_GROUPS = [{
  label: 'Shadow',
  colors: ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.4)', 'rgba(30,60,30,0.3)', 'rgba(60,40,20,0.3)', 'rgba(20,40,80,0.3)'],
}]

function SectionToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px' }}>
      <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase', color: enabled ? t.ink2 : t.inkFaint }}>
        {label}
      </span>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 14px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </div>
  )
}

interface Props {
  effect: StrokeEffect
  onChange: (patch: Partial<StrokeEffect>) => void
  /** Palette groups for colour pickers */
  colorGroups?: { label: string; colors: string[] }[]
  /** Set false to hide the outline section */
  showOutline?: boolean
  /** Set false to hide the fillDash section */
  showFillDash?: boolean
}

export function StrokeEffectPanel({ effect, onChange, colorGroups, showOutline = true, showFillDash = true }: Props) {
  const t = useTheme()
  const divider = <div style={{ borderTop: `1px solid ${t.line2}` }} />

  return (
    <div>
      {divider}
      <SectionToggle label="Outer glow" enabled={effect.glowEnabled} onChange={v => onChange({ glowEnabled: v })} />
      {effect.glowEnabled && (
        <>
          <BigColorSwatch value={effect.glowColor} onChange={c => onChange({ glowColor: c })} groups={colorGroups ?? DEFAULT_GLOW_GROUPS} />
          <MiniSlider label="Blur" display={`${effect.glowBlur}px`}   value={effect.glowBlur}   min={1} max={30} step={1} onChange={v => onChange({ glowBlur: v })} />
          <MiniSlider label="Spread" display={`${effect.glowSpread}px`} value={effect.glowSpread} min={0} max={20} step={1} onChange={v => onChange({ glowSpread: v })} />
        </>
      )}

      {showOutline && (
        <>
          {divider}
          <SectionToggle label="Outline" enabled={effect.outlineEnabled} onChange={v => onChange({ outlineEnabled: v })} />
          {effect.outlineEnabled && (
            <>
              <BigColorSwatch value={effect.outlineColor} onChange={c => onChange({ outlineColor: c })} groups={colorGroups ?? []} />
              <MiniSlider label="Width" display={`${effect.outlineWidth}px`} value={effect.outlineWidth * 10} min={1} max={100} step={1} onChange={v => onChange({ outlineWidth: v / 10 })} />
              <SectionLabel label="Dash" />
              <div style={{ padding: '4px 12px 8px' }}>
                <SegmentedControl options={DASH_OPTIONS} value={effect.outlineDash} onChange={v => onChange({ outlineDash: v as StrokeDash })} />
              </div>
            </>
          )}
        </>
      )}

      {showFillDash && (
        <>
          {divider}
          <SectionLabel label="Fill dash" />
          <div style={{ padding: '4px 12px 8px' }}>
            <SegmentedControl options={DASH_OPTIONS} value={effect.fillDash} onChange={v => onChange({ fillDash: v as StrokeDash })} />
          </div>
        </>
      )}
    </div>
  )
}
