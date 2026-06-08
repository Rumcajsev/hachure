import type { StrokeEffect, StrokeDash } from '../../store/mapStore'
import { MiniSlider, BigColorSwatch, SegmentedControl, DetailSection } from './sidebar'

const DASH_OPTIONS: { value: StrokeDash; label: string }[] = [
  { value: 'solid',    label: '——' },
  { value: 'dashed',   label: '- -' },
  { value: 'dotted',   label: '···' },
  { value: 'longdash', label: '— —' },
  { value: 'dashdot',  label: '-·-' },
]

const DEFAULT_GLOW_GROUPS = [{ label: 'Shadow', colors: ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.4)', 'rgba(30,60,30,0.3)', 'rgba(60,40,20,0.3)', 'rgba(20,40,80,0.3)'] }]

interface Props {
  effect: StrokeEffect
  onChange: (patch: Partial<StrokeEffect>) => void
  /** Palette groups for colour pickers */
  colorGroups?: { label: string; colors: string[] }[]
  /** Set false to hide the outline section (roads already have casing) */
  showOutline?: boolean
  /** Set false to hide the fillDash section (not meaningful for polygon blobs) */
  showFillDash?: boolean
}

export function StrokeEffectPanel({ effect, onChange, colorGroups, showOutline = true, showFillDash = true }: Props) {
  return (
    <div>
      <DetailSection
        label="Outer glow"
        toggle={{ enabled: effect.glowEnabled, onChange: v => onChange({ glowEnabled: v }) }}
      >
        <BigColorSwatch
          value={effect.glowColor}
          onChange={c => onChange({ glowColor: c })}
          groups={colorGroups ?? DEFAULT_GLOW_GROUPS}
        />
        <MiniSlider label="Blur radius" display={`${effect.glowBlur}px`}   value={effect.glowBlur}   min={1} max={30} step={1} onChange={v => onChange({ glowBlur: v })} />
        <MiniSlider label="Spread"      display={`${effect.glowSpread}px`}  value={effect.glowSpread} min={0} max={20} step={1} onChange={v => onChange({ glowSpread: v })} />
      </DetailSection>

      {showOutline && (
        <DetailSection
          label="Outline"
          toggle={{ enabled: effect.outlineEnabled, onChange: v => onChange({ outlineEnabled: v }) }}
        >
          <BigColorSwatch
            value={effect.outlineColor}
            onChange={c => onChange({ outlineColor: c })}
            groups={colorGroups ?? []}
          />
          <MiniSlider label="Width" display={`${effect.outlineWidth}px`} value={effect.outlineWidth * 10} min={1} max={100} step={1} onChange={v => onChange({ outlineWidth: v / 10 })} />
          <div style={{ padding: '4px 12px' }}>
            <SegmentedControl options={DASH_OPTIONS} value={effect.outlineDash} onChange={v => onChange({ outlineDash: v as StrokeDash })} />
          </div>
        </DetailSection>
      )}

      {showFillDash && (
        <DetailSection label="Fill dash" toggle={undefined}>
          <div style={{ padding: '4px 12px' }}>
            <SegmentedControl options={DASH_OPTIONS} value={effect.fillDash} onChange={v => onChange({ fillDash: v as StrokeDash })} />
          </div>
        </DetailSection>
      )}
    </div>
  )
}
