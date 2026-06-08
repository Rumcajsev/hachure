import type { StrokeEffect, StrokeDash } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'
import { MiniSlider, BigColorSwatch, SegmentedControl, ToggleRow } from './sidebar'

const DASH_OPTIONS: { value: StrokeDash; label: string }[] = [
  { value: 'solid',    label: '——' },
  { value: 'dashed',   label: '- -' },
  { value: 'dotted',   label: '···' },
  { value: 'longdash', label: '— —' },
  { value: 'dashdot',  label: '-·-' },
]

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
  /** Palette groups for outline/glow colour pickers */
  colorGroups?: { label: string; colors: string[] }[]
  /** Whether to show the fillDash option (not relevant for polygon blobs) */
  showFillDash?: boolean
}

export function StrokeEffectPanel({ effect, onChange, colorGroups, showFillDash = true }: Props) {
  const t = useTheme()
  const divider = <div style={{ borderTop: `1px solid ${t.line2}`, margin: '4px 0' }} />

  return (
    <div>
      {/* ── Outer glow ── */}
      <div style={{ padding: '6px 14px 4px' }}>
        <ToggleRow label="Outer glow" checked={effect.glowEnabled} onChange={v => onChange({ glowEnabled: v })} />
      </div>
      {effect.glowEnabled && (
        <>
          <SectionLabel label="Glow colour" />
          <BigColorSwatch value={effect.glowColor} onChange={c => onChange({ glowColor: c })} groups={colorGroups ?? [{ label: 'Shadow', colors: ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.4)', 'rgba(30,60,30,0.3)', 'rgba(60,40,20,0.3)', 'rgba(20,40,80,0.3)'] }]} />
          <MiniSlider label="Blur radius" display={`${effect.glowBlur}px`}  value={effect.glowBlur}   min={1} max={30} step={1} onChange={v => onChange({ glowBlur: v })} />
          <MiniSlider label="Spread"      display={`${effect.glowSpread}px`} value={effect.glowSpread} min={0} max={20} step={1} onChange={v => onChange({ glowSpread: v })} />
        </>
      )}

      {divider}

      {/* ── Hard outline ── */}
      <div style={{ padding: '6px 14px 4px' }}>
        <ToggleRow label="Outline" checked={effect.outlineEnabled} onChange={v => onChange({ outlineEnabled: v })} />
      </div>
      {effect.outlineEnabled && (
        <>
          <SectionLabel label="Outline colour" />
          <BigColorSwatch value={effect.outlineColor} onChange={c => onChange({ outlineColor: c })} groups={colorGroups ?? []} />
          <MiniSlider label="Width" display={`${effect.outlineWidth}px`} value={effect.outlineWidth * 10} min={1} max={100} step={1} onChange={v => onChange({ outlineWidth: v / 10 })} />
          <SectionLabel label="Outline dash" />
          <div style={{ padding: '4px 12px' }}>
            <SegmentedControl options={DASH_OPTIONS} value={effect.outlineDash} onChange={v => onChange({ outlineDash: v as StrokeDash })} />
          </div>
        </>
      )}

      {showFillDash && (
        <>
          {divider}
          <SectionLabel label="Fill dash" />
          <div style={{ padding: '4px 12px' }}>
            <SegmentedControl options={DASH_OPTIONS} value={effect.fillDash} onChange={v => onChange({ fillDash: v as StrokeDash })} />
          </div>
        </>
      )}
    </div>
  )
}
