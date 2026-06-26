import type { StrokeEffect, StrokeDash } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'
import { MiniSlider, ColorChip, SegmentedControl, ToggleSwitch } from './sidebar'

const DASH_OPTIONS: { value: StrokeDash; label: string }[] = [
  { value: 'solid',    label: '——' },
  { value: 'dashed',   label: '- -' },
  { value: 'dotted',   label: '···' },
  { value: 'longdash', label: '— —' },
  { value: 'dashdot',  label: '-·-' },
]

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
      {showOutline && (
        <>
          {divider}
          <SectionToggle label="Outline" enabled={effect.outlineEnabled} onChange={v => onChange({ outlineEnabled: v })} />
          {effect.outlineEnabled && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
                <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint }}>Color</span>
                <ColorChip value={effect.outlineColor} onChange={c => onChange({ outlineColor: c })} groups={colorGroups ?? []} label="Outline color" />
              </div>
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
