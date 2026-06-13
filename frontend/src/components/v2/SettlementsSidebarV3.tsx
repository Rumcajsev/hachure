import { useState, useEffect } from 'react'
import {
  useMapStore, type SettlementTier,
  DEFAULT_SETTLEMENT_TIER_STYLES, DEFAULT_URBAN_STYLE,
} from '../../store/mapStore'
import { shouldSuppressShortcut } from '../../lib/keyboard'
import {
  PALETTE_SETTLEMENT_FILL, PALETTE_SETTLEMENT_STROKE,
  PALETTE_BUILDINGS, PALETTE_BUILDING_STROKE,
} from '../../palettes'
import { useTheme } from '../../context/ThemeContext'
import {
  BrushRow, MiniSlider, InlineColorSwatch, SegmentedControl,
  StripShell, FlyoutShell, V2Divider, TriggerRow, TGap, ToggleRow,
  useDeferredSlider,
} from './sidebar'
import { resolveLabels } from '../../lib/labelPresets'
import type { LabelCategory, LabelSpec } from '../../lib/labelPresets'
import { LabelSpecEditorRows } from './LabelSpecEditor'

// ── FlyoutState ───────────────────────────────────────────────────────────────

type FlyoutState =
  | { kind: 'tier'; tier: SettlementTier }
  | { kind: 'urban' }
  | { kind: 'osm' }
  | { kind: 'label'; index: number }
  | null

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<SettlementTier, string> = {
  1: 'Tier I', 2: 'Tier II', 3: 'Tier III', 4: 'Tier IV',
}

export function TierIcon({ shape, size, fill, stroke, strokeWidth }: {
  shape: 'circle' | 'square'; size: number; fill: string; stroke: string; strokeWidth: number
}) {
  const s = 14
  const c = s / 2
  const r = Math.min(size, 8)
  return (
    <svg width={s} height={s} style={{ flexShrink: 0 }}>
      {shape === 'circle'
        ? <circle cx={c} cy={c} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        : <rect x={c - r} y={c - r} width={r * 2} height={r * 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      }
    </svg>
  )
}

function statusDot(status: string) {
  const color = status === 'done' ? '#5a9e6f' : status === 'loading' ? '#a0a060' : status === 'error' ? '#9e5a5a' : '#888'
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function fmtPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function SubLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 14px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </div>
  )
}

// ── TierStyleFlyout ───────────────────────────────────────────────────────────

const TIER_CATEGORY_MAP: Record<SettlementTier, LabelCategory> = {
  1: 'cityMajor', 2: 'cityMinor', 3: 'town', 4: 'village',
}

const TIER_PREVIEW_TEXT: Record<SettlementTier, string> = {
  1: 'Berlin', 2: 'Leipzig', 3: 'Goslar', 4: 'Wesel',
}

export function TierStyleFlyout({ tier, onClose }: { tier: SettlementTier; onClose: () => void }) {
  const t = useTheme()
  const {
    settlementTierStyles, setSettlementTierStyle,
    labelPresetId, labelOverrides, setLabelCategoryOverride, resetLabelCategoryOverride,
  } = useMapStore()
  const style = settlementTierStyles[tier]
  const cat = TIER_CATEGORY_MAP[tier]
  const labelSpec = resolveLabels(labelPresetId, labelOverrides)[cat]
  const labelOverride = labelOverrides[cat]
  const hasLabelOverride = !!labelOverride && Object.keys(labelOverride).length > 0

  // Building algorithm sliders all trigger settlement canvas rebuilds —
  // defer to drag end. All hooks called unconditionally (React rules).
  const v2SizeSlider        = useDeferredSlider(style.buildingV2Size,         v => setSettlementTierStyle(tier, { buildingV2Size: v }))
  const v2CountSlider       = useDeferredSlider(style.buildingCount,           v => setSettlementTierStyle(tier, { buildingCount: v }))
  const v2SpacingSlider     = useDeferredSlider(style.buildingV2Spacing,       v => setSettlementTierStyle(tier, { buildingV2Spacing: v }))
  const v2MergeSlider       = useDeferredSlider(style.buildingV2MergeChance,   v => setSettlementTierStyle(tier, { buildingV2MergeChance: v }))
  const v1CountSlider       = useDeferredSlider(style.buildingCount,           v => setSettlementTierStyle(tier, { buildingCount: v }))
  const v1SetbackSlider     = useDeferredSlider(style.roadSetback,             v => setSettlementTierStyle(tier, { roadSetback: v }))
  const v1SpacingSlider     = useDeferredSlider(style.slotSpacing,             v => setSettlementTierStyle(tier, { slotSpacing: v }))
  const v1BackGapSlider     = useDeferredSlider(style.backRowGap,              v => setSettlementTierStyle(tier, { backRowGap: v }))
  const v1BackProbSlider    = useDeferredSlider(style.backRowProbability,      v => setSettlementTierStyle(tier, { backRowProbability: v }))
  const v1JitterSlider      = useDeferredSlider(style.angleJitter,             v => setSettlementTierStyle(tier, { angleJitter: v }))
  const v1SizeMinSlider     = useDeferredSlider(style.buildingSizeMin,         v => setSettlementTierStyle(tier, { buildingSizeMin: v }))
  const v1SizeMaxSlider     = useDeferredSlider(style.buildingSizeMax,         v => setSettlementTierStyle(tier, { buildingSizeMax: v }))

  return (
    <FlyoutShell title={TIER_LABELS[tier]} onClose={onClose}>
      <div style={{ padding: '4px 14px 2px' }}>
        <button
          onClick={() => setSettlementTierStyle(tier, { ...DEFAULT_SETTLEMENT_TIER_STYLES[tier] })}
          style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '2px 8px', letterSpacing: 0.3 }}
        >
          ↺ Reset to defaults
        </button>
      </div>

      <SubLabel label="Display" />
      <div style={{ padding: '2px 14px 8px' }}>
        <SegmentedControl
          options={[{ value: 'icon', label: 'Icon' }, { value: 'buildings', label: 'Buildings' }]}
          value={style.displayMode}
          onChange={m => setSettlementTierStyle(tier, { displayMode: m })}
        />
      </div>

      {style.displayMode === 'icon' && (
        <div style={{ borderTop: `1px solid ${t.line2}` }}>
          <SubLabel label="Shape" />
          <div style={{ padding: '2px 14px 8px' }}>
            <SegmentedControl
              options={[{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }]}
              value={style.shape}
              onChange={s => setSettlementTierStyle(tier, { shape: s })}
            />
          </div>
          <MiniSlider label="Size" display={String(style.size)} value={style.size} min={1} max={12} step={0.5} onChange={v => setSettlementTierStyle(tier, { size: v })} />

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label="Fill" />
            <div style={{ padding: '2px 14px 8px' }}>
              <InlineColorSwatch value={style.fillColor} onChange={v => setSettlementTierStyle(tier, { fillColor: v })} palette={PALETTE_SETTLEMENT_FILL} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label="Stroke" />
            <div style={{ padding: '2px 14px 6px' }}>
              <InlineColorSwatch value={style.strokeColor} onChange={v => setSettlementTierStyle(tier, { strokeColor: v })} palette={PALETTE_SETTLEMENT_STROKE} />
            </div>
            <MiniSlider label="Width" display={`${style.strokeWidth}px`} value={style.strokeWidth} min={0} max={3} step={0.1} onChange={v => setSettlementTierStyle(tier, { strokeWidth: v })} />
          </div>
        </div>
      )}

      {style.displayMode === 'buildings' && (
        <div style={{ borderTop: `1px solid ${t.line2}` }}>
          <SubLabel label="Algorithm" />
          <div style={{ padding: '2px 14px 8px' }}>
            <SegmentedControl
              options={[{ value: 'v1', label: 'V1' }, { value: 'v2', label: 'V2' }]}
              value={style.buildingAlgorithm}
              onChange={alg => setSettlementTierStyle(tier, { buildingAlgorithm: alg })}
            />
          </div>

          {style.buildingAlgorithm === 'v2' && (
            <>
              <MiniSlider label="Size"         display={`${v2SizeSlider.value}px`}                          value={v2SizeSlider.value}      min={0.5} max={20}  step={0.5}  onChange={v2SizeSlider.onChange}    onDragEnd={v2SizeSlider.onDragEnd} />
              <MiniSlider label="Count"        display={String(v2CountSlider.value)}                         value={v2CountSlider.value}     min={1}   max={80}  step={1}    onChange={v2CountSlider.onChange}   onDragEnd={v2CountSlider.onDragEnd} />
              <MiniSlider label="Spacing"      display={`${v2SpacingSlider.value}px`}                        value={v2SpacingSlider.value}   min={0}   max={20}  step={0.5}  onChange={v2SpacingSlider.onChange} onDragEnd={v2SpacingSlider.onDragEnd} />
              <MiniSlider label="Merge chance" display={`${Math.round(v2MergeSlider.value * 100)}%`}         value={v2MergeSlider.value}     min={0}   max={1}   step={0.05} onChange={v2MergeSlider.onChange}   onDragEnd={v2MergeSlider.onDragEnd} />
            </>
          )}

          {style.buildingAlgorithm === 'v1' && (
            <>
              <MiniSlider label="Count"      display={String(v1CountSlider.value)}                       value={v1CountSlider.value}    min={1}    max={40}   step={1}    onChange={v1CountSlider.onChange}    onDragEnd={v1CountSlider.onDragEnd} />
              <MiniSlider label="Setback"    display={`${v1SetbackSlider.value}px`}                      value={v1SetbackSlider.value}  min={0}    max={20}   step={0.5}  onChange={v1SetbackSlider.onChange}  onDragEnd={v1SetbackSlider.onDragEnd} />
              <MiniSlider label="Spacing"    display={`${v1SpacingSlider.value.toFixed(1)}×`}            value={v1SpacingSlider.value}  min={0.5}  max={3}    step={0.1}  onChange={v1SpacingSlider.onChange}  onDragEnd={v1SpacingSlider.onDragEnd} />
              <MiniSlider label="Back gap"   display={`${v1BackGapSlider.value}px`}                      value={v1BackGapSlider.value}  min={2}    max={40}   step={1}    onChange={v1BackGapSlider.onChange}  onDragEnd={v1BackGapSlider.onDragEnd} />
              <MiniSlider label="Back prob"  display={`${Math.round(v1BackProbSlider.value * 100)}%`}    value={v1BackProbSlider.value} min={0}    max={1}    step={0.05} onChange={v1BackProbSlider.onChange} onDragEnd={v1BackProbSlider.onDragEnd} />
              <MiniSlider label="Jitter"     display={`${v1JitterSlider.value.toFixed(2)} rad`}          value={v1JitterSlider.value}   min={0}    max={1.57} step={0.01} onChange={v1JitterSlider.onChange}   onDragEnd={v1JitterSlider.onDragEnd} />
              <MiniSlider label="Size min"   display={`${v1SizeMinSlider.value}px`}                      value={v1SizeMinSlider.value}  min={1}    max={20}   step={0.5}  onChange={v1SizeMinSlider.onChange}  onDragEnd={v1SizeMinSlider.onDragEnd} />
              <MiniSlider label="Size max"   display={`${v1SizeMaxSlider.value}px`}                      value={v1SizeMaxSlider.value}  min={1}    max={20}   step={0.5}  onChange={v1SizeMaxSlider.onChange}  onDragEnd={v1SizeMaxSlider.onDragEnd} />
            </>
          )}

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label="Fill" />
            <div style={{ padding: '2px 14px 6px' }}>
              <InlineColorSwatch value={style.buildingColor} onChange={v => setSettlementTierStyle(tier, { buildingColor: v })} palette={PALETTE_BUILDINGS} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label="Stroke" />
            <div style={{ padding: '2px 14px 6px' }}>
              <InlineColorSwatch value={style.buildingStrokeColor} onChange={v => setSettlementTierStyle(tier, { buildingStrokeColor: v })} palette={PALETTE_BUILDING_STROKE} />
            </div>
            <MiniSlider label="Width" display={`${style.buildingStrokeWidth}px`} value={style.buildingStrokeWidth} min={0} max={2} step={0.1} onChange={v => setSettlementTierStyle(tier, { buildingStrokeWidth: v })} />
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${t.line}` }}>
        <SubLabel label="Label" />
        <div style={{ padding: '2px 14px 12px' }}>
          <LabelSpecEditorRows
            spec={labelSpec}
            previewText={TIER_PREVIEW_TEXT[tier]}
            onChange={p => setLabelCategoryOverride(cat, p)}
            onReset={() => resetLabelCategoryOverride(cat)}
            hasOverride={hasLabelOverride}
          />
        </div>
      </div>
    </FlyoutShell>
  )
}

// ── UrbanStyleFlyout ──────────────────────────────────────────────────────────

export function UrbanStyleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { urbanStyle, setUrbanStyle } = useMapStore()
  const s = urbanStyle

  return (
    <FlyoutShell title="Urban Style" onClose={onClose}>
      <div style={{ padding: '4px 14px 2px' }}>
        <button
          onClick={() => setUrbanStyle({ ...DEFAULT_URBAN_STYLE })}
          style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '2px 8px', letterSpacing: 0.3 }}
        >
          ↺ Reset to defaults
        </button>
      </div>
      <MiniSlider label="Count"      display={String(s.buildingCount)}                       value={s.buildingCount}       min={1}    max={50}   step={1}    onChange={v => setUrbanStyle({ buildingCount: v })} />
      <MiniSlider label="Setback"    display={`${s.roadSetback}px`}                          value={s.roadSetback}         min={0}    max={20}   step={0.5}  onChange={v => setUrbanStyle({ roadSetback: v })} />
      <MiniSlider label="Spacing"    display={`${s.slotSpacing.toFixed(1)}×`}                value={s.slotSpacing}         min={0.5}  max={3}    step={0.1}  onChange={v => setUrbanStyle({ slotSpacing: v })} />
      <MiniSlider label="Back gap"   display={`${s.backRowGap}px`}                           value={s.backRowGap}          min={2}    max={40}   step={1}    onChange={v => setUrbanStyle({ backRowGap: v })} />
      <MiniSlider label="Back prob"  display={`${Math.round(s.backRowProbability * 100)}%`}  value={s.backRowProbability}  min={0}    max={1}    step={0.05} onChange={v => setUrbanStyle({ backRowProbability: v })} />
      <MiniSlider label="Jitter"     display={`${s.angleJitter.toFixed(2)} rad`}             value={s.angleJitter}         min={0}    max={1.57} step={0.01} onChange={v => setUrbanStyle({ angleJitter: v })} />
      <MiniSlider label="Size min"   display={`${s.buildingSizeMin}px`}                      value={s.buildingSizeMin}     min={1}    max={20}   step={0.5}  onChange={v => setUrbanStyle({ buildingSizeMin: v })} />
      <MiniSlider label="Size max"   display={`${s.buildingSizeMax}px`}                      value={s.buildingSizeMax}     min={1}    max={20}   step={0.5}  onChange={v => setUrbanStyle({ buildingSizeMax: v })} />

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Fill" />
        <div style={{ padding: '2px 14px 6px' }}>
          <InlineColorSwatch value={s.buildingColor} onChange={v => setUrbanStyle({ buildingColor: v })} palette={PALETTE_BUILDINGS} />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Stroke" />
        <div style={{ padding: '2px 14px 6px' }}>
          <InlineColorSwatch value={s.buildingStrokeColor} onChange={v => setUrbanStyle({ buildingStrokeColor: v })} palette={PALETTE_BUILDING_STROKE} />
        </div>
        <MiniSlider label="Width" display={`${s.buildingStrokeWidth}px`} value={s.buildingStrokeWidth} min={0} max={2} step={0.1} onChange={v => setUrbanStyle({ buildingStrokeWidth: v })} />
      </div>
    </FlyoutShell>
  )
}

// ── OsmSettlementsFlyout ──────────────────────────────────────────────────────

export function OsmSettlementsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    settlements, settlementTierStyles,
    settlementsStatus, settlementsError,
    fetchSettlements, clearSettlements,
    toggleSettlementPlaced,
    settlementsLimit, setSettlementsLimit,
    placeAllSettlements, removeAllSettlements,
    dataSource: _ds,
  } = useMapStore()

  const osmSettlements = settlements.map((s, i) => ({ s, i })).filter(({ s }) => !s.isCustom)
  const loading = settlementsStatus === 'loading'

  return (
    <FlyoutShell title="From OSM" onClose={onClose}>
      <div style={{ padding: '4px 14px 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {statusDot(settlementsStatus)}
        <span style={{ fontFamily: t.sans, fontSize: 11, color: t.inkMute, flex: 1 }}>Settlements</span>
        {settlementsStatus === 'done' && (
          <button
            onClick={clearSettlements}
            style={{ background: 'none', border: 'none', color: t.inkFaint, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: 0 }}
          >
            clear
          </button>
        )}
      </div>

      <div style={{ padding: '4px 14px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.sans, fontSize: 11, color: t.inkMute, flexShrink: 0 }}>Limit</span>
        <input
          type="number" min={1} max={500}
          value={settlementsLimit}
          onChange={e => setSettlementsLimit(Math.max(1, Math.min(500, Number(e.target.value))))}
          style={{
            width: 52, padding: '2px 4px',
            background: t.paper2, border: `1px solid ${t.line}`,
            color: t.ink, fontFamily: t.mono, fontSize: 11,
          }}
        />
      </div>

      <div style={{ padding: '0 14px 6px' }}>
        <button
          onClick={fetchSettlements}
          disabled={loading}
          style={{
            width: '100%', padding: '5px 0',
            background: 'none',
            border: `1px solid ${loading ? t.line : t.rust}`,
            color: loading ? t.inkFaint : t.rust,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
          }}
        >
          {loading ? 'fetching…' : 'Fetch Settlements'}
        </button>
      </div>

      {settlementsStatus === 'error' && settlementsError && (
        <div style={{ padding: '0 14px 4px', fontFamily: t.sans, fontSize: 10.5, color: t.rust }}>{settlementsError}</div>
      )}

      {settlementsStatus === 'done' && osmSettlements.length > 0 && (
        <>
          <div style={{ padding: '4px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkMute }}>
              {osmSettlements.filter(({ s }) => s.hex_q !== null).length}/{osmSettlements.length} on map
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={placeAllSettlements}
                style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '1px 6px', letterSpacing: 0.3 }}
              >
                all
              </button>
              <button
                onClick={removeAllSettlements}
                style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '1px 6px', letterSpacing: 0.3 }}
              >
                none
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px 8px' }}>
            {osmSettlements.map(({ s, i }) => {
              const placed = s.hex_q !== null
              const tier = (s.tier ?? 4) as SettlementTier
              const ts = settlementTierStyles[tier]
              return (
                <div
                  key={i}
                  onClick={() => toggleSettlementPlaced(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 5px', cursor: 'pointer',
                    background: placed ? 'rgba(74,138,74,0.12)' : 'transparent',
                    border: `1px solid ${placed ? 'rgba(74,138,74,0.3)' : 'transparent'}`,
                  }}
                >
                  <TierIcon shape={ts.shape} size={ts.size} fill={ts.fillColor} stroke={ts.strokeColor} strokeWidth={ts.strokeWidth} />
                  <span style={{ flex: 1, fontFamily: t.sans, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: placed ? t.ink : t.inkMute }}>
                    {s.name}
                  </span>
                  <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, flexShrink: 0 }}>{fmtPop(s.population)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── SettlementsSidebarV3 ──────────────────────────────────────────────────────

export function SettlementLabelFlyout({ index, onClose }: { index: number; onClose: () => void }) {
  const { settlements, updateSettlement, labelPresetId, labelOverrides } = useMapStore()
  const s = settlements[index]
  if (!s) return null

  const tier = (s.tier ?? (s.type === 'city' ? 1 : s.type === 'town' ? 3 : 4)) as SettlementTier
  const catKey = TIER_CATEGORY_MAP[tier]
  const resolved = resolveLabels(labelPresetId, labelOverrides)
  const base = resolved[catKey]
  const override = s.labelOverride ?? {}
  const merged: LabelSpec = { ...base, ...override }
  const hasOverride = Object.keys(override).length > 0

  return (
    <FlyoutShell title={`Label — ${s.name}`} onClose={onClose}>
      <div style={{ padding: '6px 14px 10px' }}>
        <LabelSpecEditorRows
          spec={merged}
          previewText={s.name}
          onChange={p => updateSettlement(index, { labelOverride: { ...override, ...p } })}
          onReset={() => updateSettlement(index, { labelOverride: undefined })}
          hasOverride={hasOverride}
        />
      </div>
    </FlyoutShell>
  )
}

export function SettlementsSidebarV3() {
  const t = useTheme()
  const {
    settlements,
    settlementPlaceTier, setSettlementPlaceTier,
    settlementTierStyles,
    deleteSettlement, updateSettlement,
    settlementMoveIndex, setSettlementMoveIndex,
    urbanHexes, urbanPaintMode,
    showSettlementLabels, setShowSettlementLabels,
    dataSource,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutState>(null)
  const [editingName, setEditingName] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  const allPlaced = settlements.filter(s => s.isCustom && s.hex_q !== null)

  const openTier = (tier: SettlementTier) =>
    setFlyout(prev => prev?.kind === 'tier' && prev.tier === tier ? null : { kind: 'tier', tier })

  const selectTier = (tier: SettlementTier) => {
    setSettlementPlaceTier(settlementPlaceTier === tier ? null : tier)
    setSettlementMoveIndex(null)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldSuppressShortcut(e)) return
      if (e.key === '1') selectTier(1)
      else if (e.key === '2') selectTier(2)
      else if (e.key === '3') selectTier(3)
      else if (e.key === '4') selectTier(4)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementPlaceTier])

  const startRename = (index: number, name: string) => {
    setEditingName(index)
    setEditingNameValue(name)
  }

  const commitRename = (index: number) => {
    if (editingNameValue.trim()) updateSettlement(index, { name: editingNameValue.trim() })
    setEditingName(null)
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <StripShell>

        <V2Divider label="Place" />
        {([1, 2, 3, 4] as SettlementTier[]).map(tier => {
          const ts = settlementTierStyles[tier]
          return (
            <BrushRow
              key={tier}
              label={TIER_LABELS[tier]}
              color={ts.fillColor || ts.strokeColor}
              active={settlementPlaceTier === tier}
              shortcut={String(tier)}
              showCog
              cogOpen={flyout?.kind === 'tier' && flyout.tier === tier}
              onSelect={() => selectTier(tier)}
              onCog={() => openTier(tier)}
            />
          )
        })}

        <TGap />
        <V2Divider label={`Urban (${urbanHexes.length})`} />
        <BrushRow
          label="Paint"
          color="#5a8a5a"
          active={urbanPaintMode === 'paint'}
          onSelect={() => setActiveTool(urbanPaintMode === 'paint' ? { type: 'none' } : { type: 'urban', mode: 'paint' })}
        />
        <BrushRow
          label="Erase"
          color="#8a5a5a"
          active={urbanPaintMode === 'erase'}
          onSelect={() => setActiveTool(urbanPaintMode === 'erase' ? { type: 'none' } : { type: 'urban', mode: 'erase' })}
        />
        <TriggerRow label="Style…" active={flyout?.kind === 'urban'} onClick={() => setFlyout(prev => prev?.kind === 'urban' ? null : { kind: 'urban' })} />

        <TGap />
        <V2Divider label={`Placed (${allPlaced.length})`} />
        {allPlaced.length === 0 && (
          <div style={{ padding: '4px 10px', fontFamily: t.sans, fontSize: 10, color: t.inkFaint, fontStyle: 'italic' }}>
            click a tier then a hex
          </div>
        )}
        {settlements.map((s, i) => {
          if (!s.isCustom) return null
          const ts = settlementTierStyles[(s.tier ?? 2) as SettlementTier]
          const isMoving = settlementMoveIndex === i
          return (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: '16px 1fr 18px 18px 18px',
                alignItems: 'center', gap: 4,
                padding: '4px 8px', borderBottom: `1px solid ${t.line2}`,
              }}
            >
              <TierIcon shape={ts.shape} size={ts.size} fill={ts.fillColor} stroke={ts.strokeColor} strokeWidth={ts.strokeWidth} />
              {editingName === i ? (
                <input
                  autoFocus
                  value={editingNameValue}
                  onChange={e => setEditingNameValue(e.target.value)}
                  onBlur={() => commitRename(i)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditingName(null) }}
                  style={{
                    flex: 1, background: t.paper2, border: `1px solid ${t.line}`,
                    color: t.ink, fontFamily: t.sans, fontSize: 10.5, padding: '1px 4px',
                    minWidth: 0,
                  }}
                />
              ) : (
                <span
                  style={{ fontFamily: t.sans, fontSize: 10.5, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', minWidth: 0 }}
                  onDoubleClick={() => startRename(i, s.name)}
                  title="Double-click to rename"
                >
                  {s.name}
                </span>
              )}
              <button
                onClick={() => isMoving ? setSettlementMoveIndex(null) : setSettlementMoveIndex(i)}
                title={isMoving ? 'Cancel move' : 'Move'}
                style={{
                  background: isMoving ? t.paper2 : 'none',
                  border: `1px solid ${isMoving ? t.line : 'transparent'}`,
                  color: isMoving ? t.ink : t.inkFaint,
                  cursor: 'pointer', padding: '1px 2px', fontSize: 9, fontFamily: t.mono,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >↔</button>
              <button
                onClick={() => setFlyout(prev => prev?.kind === 'label' && prev.index === i ? null : { kind: 'label', index: i })}
                title="Label style"
                style={{
                  background: flyout?.kind === 'label' && flyout.index === i ? t.paper2 : 'none',
                  border: `1px solid ${flyout?.kind === 'label' && flyout.index === i ? t.line : 'transparent'}`,
                  color: s.labelOverride && Object.keys(s.labelOverride).length > 0 ? '#7de0a0' : t.inkFaint,
                  cursor: 'pointer', padding: '1px 2px', fontSize: 9, fontFamily: t.mono,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >T</button>
              <button
                onClick={() => deleteSettlement(i)}
                title="Delete"
                style={{ background: 'none', border: 'none', color: t.inkFaint, cursor: 'pointer', padding: '1px 2px', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>
          )
        })}

        {dataSource === 'osm' && (
          <>
            <TGap />
            <V2Divider label="OSM" />
            <TriggerRow label="Settlements" active={flyout?.kind === 'osm'} onClick={() => setFlyout(prev => prev?.kind === 'osm' ? null : { kind: 'osm' })} />
          </>
        )}

        <TGap />
        <V2Divider label="Labels" />
        <ToggleRow label="Show labels" checked={showSettlementLabels} onChange={setShowSettlementLabels} />

      </StripShell>

      {flyout?.kind === 'tier' && (
        <TierStyleFlyout tier={flyout.tier} onClose={() => setFlyout(null)} />
      )}
      {flyout?.kind === 'urban' && (
        <UrbanStyleFlyout onClose={() => setFlyout(null)} />
      )}
      {flyout?.kind === 'osm' && (
        <OsmSettlementsFlyout onClose={() => setFlyout(null)} />
      )}
      {flyout?.kind === 'label' && (
        <SettlementLabelFlyout index={flyout.index} onClose={() => setFlyout(null)} />
      )}

    </div>
  )
}
