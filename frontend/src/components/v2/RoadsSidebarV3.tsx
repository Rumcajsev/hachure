import { useEffect, useRef, useState } from 'react'
import {
  useMapStore,
  DEFAULT_ROAD_TIER_STYLES, DEFAULT_RAIL_STYLE, DEFAULT_ROAD_GEOM, DEFAULT_RAIL_GEOM,
} from '../../store/mapStore'
import type { RoadTierStyle, StrokeDash } from '../../store/mapStore'
import { DEFAULT_STROKE_EFFECT } from '../../store/mapStore'
import { PALETTE_RAIL_LIGHT, PALETTE_RAIL_DARK } from '../../palettes'
import { useTheme } from '../../context/ThemeContext'
import {
  BrushRow, MiniSlider, ColorChip, ColorPickerHost, SegmentedControl, ToggleRow, tintBg,
  STRIP_W, FLYOUT_W, StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
  useDeferredSlider,
} from './sidebar'

// ── Palette groups ─────────────────────────────────────────────────────────────

const ROAD_SURFACE_GROUPS = [
  { label: 'Pale', colors: ['#ffffff', '#f5f0e8', '#f0e8d0', '#e8dcc8'] },
  { label: 'Warm', colors: ['#ffe8a8', '#ffe0a0', '#ffd080', '#f5d878', '#f0e0b8', '#d8d8c0', '#d0cca8'] },
  { label: 'Red',  colors: ['#c83030', '#a02020', '#802020', '#d85050'] },
] as const satisfies { label: string; colors: string[] }[]

const ROAD_CASING_GROUPS = [
  { label: 'Dark', colors: ['#1a1208', '#3a3020', '#4a3820'] },
  { label: 'Warm', colors: ['#6a4828', '#8a5c2a', '#b07820', '#786040', '#a09070', '#606060', '#808060'] },
  { label: 'Red',  colors: ['#5a1010', '#781818', '#380808'] },
] as const satisfies { label: string; colors: string[] }[]

const RAIL_LIGHT_GROUPS = [{ label: 'Light', colors: [...PALETTE_RAIL_LIGHT] }] as const satisfies { label: string; colors: string[] }[]
const RAIL_DARK_GROUPS  = [{ label: 'Dark',  colors: [...PALETTE_RAIL_DARK]  }] as const satisfies { label: string; colors: string[] }[]

// ── Constants ──────────────────────────────────────────────────────────────────

export const ROAD_TIERS = [
  { tier: 0 as const, label: 'Motorway', color: '#b07820' },
  { tier: 1 as const, label: 'Primary',  color: '#8a5c2a' },
  { tier: 2 as const, label: 'Secondary', color: '#606060' },
]

const RAIL_COLOR = '#4a7a9a'

const IMPORT_ICON = (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 1.5v5" /><path d="M2.5 4.5l2.5 2.5 2.5-2.5" /><path d="M1.5 8.5h7" />
  </svg>
)

// ── FlyoutId ───────────────────────────────────────────────────────────────────

type FlyoutId = 'road-style' | 'rail-style' | 'road-shape' | 'rail-shape' | 'road-import' | 'road-image-extract' | 'rail-import' | 'bridges' | 'segment' | null


// ── Flyout section label helper ────────────────────────────────────────────────

function FSectionLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 12px 2px', fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>
      {label}
    </div>
  )
}

function FSectionDivider() {
  const t = useTheme()
  return <div style={{ margin: '6px 12px 4px', borderTop: `1px solid ${t.line2}` }} />
}

// ── RoadTerrainCutFlyout ───────────────────────────────────────────────────────

export function RoadTerrainCutFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { roadBlobCutEnabled, roadBlobCutWidth, roadBlobCutRoughness,
    setRoadBlobCutEnabled, setRoadBlobCutWidth, setRoadBlobCutRoughness } = useMapStore()
  const widthSlider     = useDeferredSlider(Math.round(roadBlobCutWidth * 100), v => setRoadBlobCutWidth(v / 100))
  const roughnessSlider = useDeferredSlider(Math.round(roadBlobCutRoughness * 100), v => setRoadBlobCutRoughness(v / 100))
  return (
    <FlyoutShell title="Terrain cut" subtitle="carve road corridors out of terrain blobs" onClose={onClose}>
      <ToggleRow label="Enabled" checked={roadBlobCutEnabled} onChange={setRoadBlobCutEnabled} />
      <MiniSlider label="Width"     display={(widthSlider.value / 100).toFixed(2) + '×'} value={widthSlider.value}     min={1} max={100} step={1} disabled={!roadBlobCutEnabled} onChange={widthSlider.onChange}     onDragEnd={widthSlider.onDragEnd} />
      <MiniSlider label="Roughness" display={`${roughnessSlider.value}%`}                 value={roughnessSlider.value} min={0} max={100} step={1} disabled={!roadBlobCutEnabled} onChange={roughnessSlider.onChange} onDragEnd={roughnessSlider.onDragEnd} />
      {roadBlobCutEnabled && (
        <div style={{ padding: '4px 14px 8px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint, lineHeight: 1.5 }}>
          Width is a multiple of hex radius. Roughness 0% = straight edge.
        </div>
      )}
    </FlyoutShell>
  )
}

// ── RoadShapeFlyout ────────────────────────────────────────────────────────────

export function RoadShapeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    roadWiggleAmp, setRoadWiggleAmp,
    roadWiggleFreq, setRoadWiggleFreq,
    roadPathSmoothing, setRoadPathSmoothing,
    roadSmoothing, setRoadSmoothing,
    roadCenterPull, setRoadCenterPull,
  } = useMapStore()

  const wiggleAmpSlider = useDeferredSlider(Math.round(roadWiggleAmp * 100), v => setRoadWiggleAmp(v / 100))
  const wiggleFreqSlider = useDeferredSlider(Math.round(roadWiggleFreq * 10), v => setRoadWiggleFreq(v / 10))
  const pathSlider   = useDeferredSlider(roadPathSmoothing, setRoadPathSmoothing)
  const smoothSlider = useDeferredSlider(roadSmoothing, setRoadSmoothing)
  const pullSlider   = useDeferredSlider(Math.round(roadCenterPull * 100), v => setRoadCenterPull(v / 100))

  const isModified =
    roadWiggleAmp !== DEFAULT_ROAD_GEOM.wiggleAmp ||
    roadWiggleFreq !== DEFAULT_ROAD_GEOM.wiggleFreq ||
    roadPathSmoothing !== DEFAULT_ROAD_GEOM.pathSmoothing ||
    roadSmoothing !== DEFAULT_ROAD_GEOM.smoothing ||
    roadCenterPull !== DEFAULT_ROAD_GEOM.centerPull

  const handleReset = () => {
    setRoadWiggleAmp(DEFAULT_ROAD_GEOM.wiggleAmp)
    setRoadWiggleFreq(DEFAULT_ROAD_GEOM.wiggleFreq)
    setRoadPathSmoothing(DEFAULT_ROAD_GEOM.pathSmoothing)
    setRoadSmoothing(DEFAULT_ROAD_GEOM.smoothing)
    setRoadCenterPull(DEFAULT_ROAD_GEOM.centerPull)
  }

  return (
    <FlyoutShell title="Road shape" subtitle={isModified ? 'Modified from default' : 'Default for all tiers'} onClose={onClose}>
      <FSectionDivider />
      <MiniSlider label="Wiggle amp"   display={`${wiggleAmpSlider.value}%`}              value={wiggleAmpSlider.value}  min={0} max={100} step={1}  accentColor={t.rust} onChange={wiggleAmpSlider.onChange}  onDragEnd={wiggleAmpSlider.onDragEnd} />
      <MiniSlider label="Wiggle freq"  display={(wiggleFreqSlider.value / 10).toFixed(1)} value={wiggleFreqSlider.value} min={1} max={50} step={1}  accentColor={t.rust} onChange={wiggleFreqSlider.onChange} onDragEnd={wiggleFreqSlider.onDragEnd} />
      <MiniSlider label="Path smooth"  display={pathSlider.value}   value={pathSlider.value}   min={0} max={50}  step={1}  accentColor={t.rust} onChange={pathSlider.onChange}   onDragEnd={pathSlider.onDragEnd} />
      <MiniSlider label="Line smooth"  display={smoothSlider.value} value={smoothSlider.value} min={0} max={30}  step={1}  accentColor={t.rust} onChange={smoothSlider.onChange} onDragEnd={smoothSlider.onDragEnd} />
      <MiniSlider label="Center pull"  display={`${pullSlider.value}%`} value={pullSlider.value} min={0} max={100} step={1}  accentColor={t.rust} onChange={pullSlider.onChange}   onDragEnd={pullSlider.onDragEnd} />
      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={handleReset}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── RailShapeFlyout ────────────────────────────────────────────────────────────

export function RailShapeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    railWiggleAmp, setRailWiggleAmp,
    railWiggleFreq, setRailWiggleFreq,
    railPathSmoothing, setRailPathSmoothing,
    railSmoothing, setRailSmoothing,
  } = useMapStore()

  const wiggleAmpSlider  = useDeferredSlider(Math.round(railWiggleAmp * 100), v => setRailWiggleAmp(v / 100))
  const wiggleFreqSlider = useDeferredSlider(Math.round(railWiggleFreq * 10), v => setRailWiggleFreq(v / 10))
  const pathSlider   = useDeferredSlider(railPathSmoothing, setRailPathSmoothing)
  const smoothSlider = useDeferredSlider(railSmoothing, setRailSmoothing)

  const isModified =
    railWiggleAmp !== DEFAULT_RAIL_GEOM.wiggleAmp ||
    railWiggleFreq !== DEFAULT_RAIL_GEOM.wiggleFreq ||
    railPathSmoothing !== DEFAULT_RAIL_GEOM.pathSmoothing ||
    railSmoothing !== DEFAULT_RAIL_GEOM.smoothing

  const handleReset = () => {
    setRailWiggleAmp(DEFAULT_RAIL_GEOM.wiggleAmp)
    setRailWiggleFreq(DEFAULT_RAIL_GEOM.wiggleFreq)
    setRailPathSmoothing(DEFAULT_RAIL_GEOM.pathSmoothing)
    setRailSmoothing(DEFAULT_RAIL_GEOM.smoothing)
  }

  return (
    <FlyoutShell title="Rail shape" subtitle={isModified ? 'Modified from default' : 'Default'} onClose={onClose}>
      <MiniSlider label="Wiggle amp"  display={`${wiggleAmpSlider.value}%`}              value={wiggleAmpSlider.value}  min={0} max={100} step={1} accentColor={RAIL_COLOR} onChange={wiggleAmpSlider.onChange}  onDragEnd={wiggleAmpSlider.onDragEnd} />
      <MiniSlider label="Wiggle freq" display={(wiggleFreqSlider.value / 10).toFixed(1)} value={wiggleFreqSlider.value} min={1} max={50} step={1} accentColor={RAIL_COLOR} onChange={wiggleFreqSlider.onChange} onDragEnd={wiggleFreqSlider.onDragEnd} />
      <MiniSlider label="Path smooth" display={pathSlider.value}   value={pathSlider.value}   min={0} max={50}  step={1} accentColor={RAIL_COLOR} onChange={pathSlider.onChange}   onDragEnd={pathSlider.onDragEnd} />
      <MiniSlider label="Line smooth" display={smoothSlider.value} value={smoothSlider.value} min={0} max={30}  step={1} accentColor={RAIL_COLOR} onChange={smoothSlider.onChange} onDragEnd={smoothSlider.onDragEnd} />
      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={handleReset}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── RoadStyleFlyout ────────────────────────────────────────────────────────────

const DASH_OPTIONS: { value: StrokeDash; label: string }[] = [
  { value: 'solid',    label: '——' },
  { value: 'dashed',   label: '- -' },
  { value: 'dotted',   label: '···' },
  { value: 'longdash', label: '— —' },
  { value: 'dashdot',  label: '-·-' },
]

function SectionToggle({ label, enabled, onChange, accentColor }: { label: string; enabled: boolean; onChange: (v: boolean) => void; accentColor?: string }) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 4px', borderTop: `1px solid ${t.line2}` }}>
      <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: enabled ? (accentColor ?? t.ink2) : t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </span>
      <button
        onClick={() => onChange(!enabled)}
        style={{ width: 30, height: 16, flexShrink: 0, background: enabled ? t.ink : t.line, border: 'none', cursor: 'pointer', padding: 0, position: 'relative' }}
      >
        <div style={{ position: 'absolute', top: 3, left: enabled ? 15 : 3, width: 10, height: 10, background: t.surface, transition: 'left 0.12s ease' }} />
      </button>
    </div>
  )
}

export function RoadStyleFlyout({ tier, onClose }: { tier: 0 | 1 | 2; onClose: () => void }) {
  const t = useTheme()
  const {
    mapStyle,
    roadTierStyles, setRoadTierStyle,
    roadWiggleAmp, roadWiggleFreq, roadPathSmoothing, roadSmoothing, roadCenterPull,
    roadTierGeometry, setRoadTierGeometry, clearRoadTierGeometry,
  } = useMapStore()

  const s = roadTierStyles[tier]
  const def = DEFAULT_ROAD_TIER_STYLES[tier]
  const { label: tierLabel, color: tierColor } = ROAD_TIERS[tier]

  const geomOverride = roadTierGeometry[tier]
  const overrideEnabled = geomOverride !== null
  const globalGeom = { wiggleAmp: roadWiggleAmp, wiggleFreq: roadWiggleFreq, pathSmoothing: roadPathSmoothing, smoothing: roadSmoothing, centerPull: roadCenterPull }
  const effectiveGeom = geomOverride ?? globalGeom

  // Per-tier geom sliders all flow through roadTierGeomMap → buildRoadChains,
  // so defer each to commit only on drag end.
  const tierWiggleAmpSlider  = useDeferredSlider(Math.round(effectiveGeom.wiggleAmp * 100), v => setRoadTierGeometry(tier, { wiggleAmp: v / 100 }))
  const tierWiggleFreqSlider = useDeferredSlider(Math.round(effectiveGeom.wiggleFreq * 10),  v => setRoadTierGeometry(tier, { wiggleFreq: v / 10 }))
  const tierPathSlider       = useDeferredSlider(effectiveGeom.pathSmoothing, v => setRoadTierGeometry(tier, { pathSmoothing: v }))
  const tierSmoothSlider     = useDeferredSlider(effectiveGeom.smoothing,     v => setRoadTierGeometry(tier, { smoothing: v }))
  const tierPullSlider       = useDeferredSlider(Math.round(effectiveGeom.centerPull * 100), v => setRoadTierGeometry(tier, { centerPull: v / 100 }))

  const fx = s.effect ?? DEFAULT_STROKE_EFFECT
  const setFx = (patch: Partial<typeof fx>) => setRoadTierStyle(tier, { effect: { ...fx, ...patch } })

  const isModified =
    s.outer !== def.outer || s.inner !== def.inner || s.outerW !== def.outerW ||
    s.caseDash !== def.caseDash || s.fillDash !== def.fillDash ||
    JSON.stringify(fx) !== JSON.stringify(def.effect ?? DEFAULT_STROKE_EFFECT)

  return (
    <FlyoutShell
      title={tierLabel}
      subtitle={isModified ? 'Modified from default' : 'Default style'}
      onClose={onClose}
    >
      {/* ── Always-on: thickness + surface + fill dash ── */}
      <MiniSlider label="Thickness" display={s.outerW.toFixed(1)} value={s.outerW * 10} min={5} max={100} step={5} accentColor={tierColor} onChange={v => setRoadTierStyle(tier, { outerW: v / 10 })} />
      <FSectionDivider />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
        <FSectionLabel label="Surface" />
        <ColorChip value={s.inner} onChange={v => setRoadTierStyle(tier, { inner: v })} groups={ROAD_SURFACE_GROUPS} label="Surface color" />
      </div>
      <FSectionLabel label="Fill stroke" />
      <div style={{ padding: '4px 12px 8px' }}>
        <SegmentedControl options={DASH_OPTIONS} value={(fx.fillDash ?? s.fillDash) as StrokeDash} onChange={v => setFx({ fillDash: v as StrokeDash })} />
      </div>

      {/* ── Outline (casing) ── */}
      <SectionToggle label="Outline" enabled={fx.outlineEnabled} onChange={v => setFx({ outlineEnabled: v })} accentColor={tierColor} />
      {fx.outlineEnabled && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <FSectionLabel label="Casing" />
            <ColorChip value={s.outer} onChange={v => setRoadTierStyle(tier, { outer: v })} groups={ROAD_CASING_GROUPS} label="Casing color" />
          </div>
          <FSectionLabel label="Stroke" />
          <div style={{ padding: '4px 12px 8px' }}>
            <SegmentedControl options={DASH_OPTIONS} value={(fx.outlineDash ?? s.caseDash) as StrokeDash} onChange={v => setFx({ outlineDash: v as StrokeDash })} />
          </div>
        </>
      )}

      {/* ── Geometry override ── */}
      <SectionToggle
        label="Geometry override"
        enabled={overrideEnabled}
        onChange={v => v ? setRoadTierGeometry(tier, { ...globalGeom }) : clearRoadTierGeometry(tier)}
        accentColor={tierColor}
      />
      {overrideEnabled && (
        <>
          <MiniSlider label="Wiggle amp"  display={`${tierWiggleAmpSlider.value}%`}           value={tierWiggleAmpSlider.value}  min={0} max={100} step={1} accentColor={tierColor} onChange={tierWiggleAmpSlider.onChange}  onDragEnd={tierWiggleAmpSlider.onDragEnd} />
          <MiniSlider label="Wiggle freq" display={(tierWiggleFreqSlider.value / 10).toFixed(1)} value={tierWiggleFreqSlider.value}  min={1} max={50} step={1} accentColor={tierColor} onChange={tierWiggleFreqSlider.onChange} onDragEnd={tierWiggleFreqSlider.onDragEnd} />
          <MiniSlider label="Path smooth" display={tierPathSlider.value}                       value={tierPathSlider.value}       min={0} max={50}  step={1} accentColor={tierColor} onChange={tierPathSlider.onChange}       onDragEnd={tierPathSlider.onDragEnd} />
          <MiniSlider label="Line smooth" display={tierSmoothSlider.value}                     value={tierSmoothSlider.value}     min={0} max={30}  step={1} accentColor={tierColor} onChange={tierSmoothSlider.onChange}     onDragEnd={tierSmoothSlider.onDragEnd} />
          <MiniSlider label="Center pull" display={`${tierPullSlider.value}%`}                 value={tierPullSlider.value}       min={0} max={100} step={1} accentColor={tierColor} onChange={tierPullSlider.onChange}       onDragEnd={tierPullSlider.onDragEnd} />
        </>
      )}

      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={() => setRoadTierStyle(tier, { ...def })}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── RailStyleFlyout ────────────────────────────────────────────────────────────

export function RailStyleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    railStyle, setRailStyle,
    railWiggleAmp, railWiggleFreq, railPathSmoothing, railSmoothing,
    railGeomOverride, setRailGeomOverride, clearRailGeomOverride,
  } = useMapStore()

  const def = DEFAULT_RAIL_STYLE
  const globalGeom = { wiggleAmp: railWiggleAmp, wiggleFreq: railWiggleFreq, pathSmoothing: railPathSmoothing, smoothing: railSmoothing }
  const effectiveGeom = railGeomOverride ?? globalGeom
  const overrideEnabled = railGeomOverride !== null

  const isModified =
    railStyle.thickness !== def.thickness ||
    railStyle.innerColor !== def.innerColor ||
    railStyle.outerColor !== def.outerColor ||
    railStyle.railStyle !== def.railStyle

  return (
    <FlyoutShell title="Rail" subtitle={isModified ? 'Modified from default' : 'Default style'} onClose={onClose}>
      <div style={{ padding: '4px 12px' }}>
        <SegmentedControl
          options={[{ value: 'classic', label: 'Classic' }, { value: 'cross', label: 'Cross' }]}
          value={railStyle.railStyle}
          onChange={s => setRailStyle({ railStyle: s })}
        />
      </div>
      <MiniSlider label="Thickness" display={railStyle.thickness.toFixed(1)} value={railStyle.thickness * 10} min={5} max={80} step={5} accentColor={RAIL_COLOR} onChange={v => setRailStyle({ thickness: v / 10 })} />
      {railStyle.railStyle === 'classic' && (
        <>
          <FSectionDivider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <FSectionLabel label="Inner color" />
            <ColorChip value={railStyle.innerColor} onChange={v => setRailStyle({ innerColor: v })} groups={RAIL_LIGHT_GROUPS} label="Inner color" />
          </div>
        </>
      )}
      <FSectionDivider />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
        <FSectionLabel label={railStyle.railStyle === 'classic' ? 'Outer color' : 'Line color'} />
        <ColorChip value={railStyle.outerColor} onChange={v => setRailStyle({ outerColor: v })} groups={RAIL_DARK_GROUPS} label="Outer color" />
      </div>

      <FSectionDivider />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px' }}>
        <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Geometry override</span>
        <button
          onClick={() => {
            if (overrideEnabled) clearRailGeomOverride()
            else setRailGeomOverride({ ...globalGeom })
          }}
          style={{
            width: 30, height: 16, flexShrink: 0,
            background: overrideEnabled ? t.ink : t.line,
            border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: 3, left: overrideEnabled ? 15 : 3,
            width: 10, height: 10, background: t.surface, transition: 'left 0.12s ease',
          }} />
        </button>
      </div>
      <div style={{ opacity: overrideEnabled ? 1 : 0.35, pointerEvents: overrideEnabled ? 'auto' : 'none' }}>
        <MiniSlider label="Wiggle amp"  display={`${Math.round(effectiveGeom.wiggleAmp * 100)}%`} value={Math.round(effectiveGeom.wiggleAmp * 100)} min={0} max={100} step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ wiggleAmp: v / 100 })} />
        <MiniSlider label="Wiggle freq" display={effectiveGeom.wiggleFreq.toFixed(1)}              value={Math.round(effectiveGeom.wiggleFreq * 10)} min={1} max={50} step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ wiggleFreq: v / 10 })} />
        <MiniSlider label="Path smooth" display={effectiveGeom.pathSmoothing}                      value={effectiveGeom.pathSmoothing}               min={0} max={50}  step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ pathSmoothing: v })} />
        <MiniSlider label="Line smooth" display={effectiveGeom.smoothing}                          value={effectiveGeom.smoothing}                   min={0} max={30}  step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ smoothing: v })} />
      </div>

      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={() => setRailStyle({ ...def })}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── Road type rows ──────────────────────────────────────────────────────────────

const ROAD_TYPE_ROWS: { highway: string; label: string; tier: 0 | 1 | 2 }[] = [
  { highway: 'motorway',  label: 'Motorway',  tier: 0 },
  { highway: 'trunk',     label: 'Trunk',     tier: 0 },
  { highway: 'primary',   label: 'Primary',   tier: 1 },
  { highway: 'secondary', label: 'Secondary', tier: 1 },
  { highway: 'tertiary',  label: 'Tertiary',  tier: 2 },
]

const TIER_LABELS = ['T0', 'T1', 'T2'] as const

// ── OsmRoadsFlyout ─────────────────────────────────────────────────────────────

export function OsmRoadsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    roadTypeFetchStatus, fetchRoadType, applyRoadType,
    osmHexPaths, clearRoads,
    osmHighlightType, setOsmHighlightType,
    showRawOsmRoads, setShowRawOsmRoads,
  } = useMapStore()

  const anyFetched = osmHexPaths.length > 0

  return (
    <FlyoutShell title="Fetch from OSM" onClose={onClose}>
      <FSectionDivider />
      {ROAD_TYPE_ROWS.map(({ highway, label, tier }) => {
        const status = roadTypeFetchStatus[highway] ?? 'idle'
        const loading = status === 'loading'
        const fetched = status === 'done'
        const hasPaths = osmHexPaths.some(p => p.highway === highway)
        return (
          <div key={highway} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px' }}>
            <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkMute, width: 66 }}>{label}</span>
            <span style={{
              fontFamily: t.mono, fontSize: 7.5, letterSpacing: 0.3,
              color: t.inkFaint, border: `1px solid ${t.line2}`, padding: '1px 4px', borderRadius: 2,
            }}>
              {TIER_LABELS[tier]}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => fetchRoadType(highway)}
              disabled={loading}
              style={{
                padding: '3px 8px', background: 'none',
                border: `1px solid ${loading ? t.line : fetched ? t.line : t.rust}`,
                color: loading ? t.inkFaint : fetched ? t.inkFaint : t.rust,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.2,
              }}
            >
              {loading ? '…' : fetched ? '✓' : 'fetch'}
            </button>
            <button
              onClick={() => applyRoadType(highway)}
              onMouseEnter={() => hasPaths && setOsmHighlightType(highway)}
              onMouseLeave={() => setOsmHighlightType(null)}
              disabled={!hasPaths}
              style={{
                padding: '3px 8px', background: osmHighlightType === highway ? tintBg(t.rust, 0.1) : 'none',
                border: `1px solid ${hasPaths ? (osmHighlightType === highway ? t.rust : t.rust) : t.line2}`,
                color: hasPaths ? t.rust : t.inkFaint,
                cursor: hasPaths ? 'pointer' : 'default',
                fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.2,
              }}
            >
              apply
            </button>
          </div>
        )
      })}

      {anyFetched && (
        <>
          <FSectionDivider />
          <ToggleRow label="Show raw OSM roads" checked={showRawOsmRoads} onChange={setShowRawOsmRoads} />
          <div style={{ padding: '2px 12px 8px', textAlign: 'right' }}>
            <button
              onClick={clearRoads}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}
            >
              clear all fetched
            </button>
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── RoadImageColorChip ────────────────────────────────────────────────────────────

function RoadImageColorChip({
  color, tolerance, onToleranceChange, onRemove, onPreviewStart,
}: {
  color: string
  tolerance: number
  onToleranceChange: (v: number) => void
  onRemove: () => void
  onPreviewStart: () => void
}) {
  const t = useTheme()
  const [localPct, setLocalPct] = useState(tolerance)
  const draggingRef = useRef(false)
  const localRef = useRef(tolerance)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevTolerance = useRef(tolerance)
  if (prevTolerance.current !== tolerance && !draggingRef.current) {
    prevTolerance.current = tolerance
    localRef.current = tolerance
    setLocalPct(tolerance)
  }

  return (
    <div
      style={{
        padding: '4px 8px',
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        marginBottom: 4,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 16, marginBottom: 4 }}>
        <div style={{ width: 12, height: 12, background: color, flexShrink: 0, borderRadius: 2, border: `1px solid ${t.line}` }} />
        <span style={{ fontSize: 10, fontFamily: t.mono, color: t.inkMute }}>{color}</span>
      </div>
      <MiniSlider
        label="tolerance"
        display={`${localPct}`}
        value={localPct}
        min={0} max={150} step={1}
        accentColor={color}
        onChange={v => {
          localRef.current = v
          setLocalPct(v)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null
            onToleranceChange(localRef.current)
          }, 150)
        }}
        onDragStart={() => { draggingRef.current = true; onPreviewStart() }}
        onDragEnd={() => {
          draggingRef.current = false
          if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
          onToleranceChange(localRef.current)
        }}
      />
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          position: 'absolute', top: 4, right: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.inkMute, fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}
      >×</button>
    </div>
  )
}

// ── RoadImageExtractFlyout ───────────────────────────────────────────────────────
// Step-by-step wizard: pick a tier -> pick color(s) + tune tolerance -> trace + review
// -> confirm & apply -> back to tier picker. One tier's pipeline must be confirmed (or
// abandoned via "back to tiers") before moving to the next.

export function RoadImageExtractFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    mapImageDataUrl, activeTool, setActiveTool,
    roadImageSwatches, updateRoadImageSwatchTolerance, removeRoadImageSwatch,
    extractedRoadWays, roadImageExtractStatus, extractRoadsFromImage, applyExtractedRoadTier,
    setRoadImageExtractPreviewOpen, setRoadImagePreview, setRoadImagePreviewTier,
    roadImageEraseHexKeys, clearRoadImageEraseHexKeys,
  } = useMapStore()

  const [wizardTier, setWizardTier] = useState<0 | 1 | 2 | null>(null)
  const [wizardStep, setWizardStep] = useState<'color' | 'trace'>('color')
  const [appliedTiers, setAppliedTiers] = useState<Set<0 | 1 | 2>>(new Set())

  // Drives the live color-match/traced-line overlay on the canvas (see imageColorPreview.ts
  // and drawRoadLineTracePreview.ts) — only worth computing while this flyout is open.
  useEffect(() => {
    setRoadImageExtractPreviewOpen(true)
    return () => {
      setRoadImageExtractPreviewOpen(false)
      setRoadImagePreview(null, null)
      setRoadImagePreviewTier(null)
    }
  }, [setRoadImageExtractPreviewOpen, setRoadImagePreview, setRoadImagePreviewTier])

  // Only one preview mode is live at a time — drop whichever one this step isn't using.
  useEffect(() => {
    if (wizardStep !== 'trace') setRoadImagePreviewTier(null)
    if (wizardStep !== 'color') setRoadImagePreview(null, null)
  }, [wizardStep, wizardTier, setRoadImagePreview, setRoadImagePreviewTier])

  const extracting = roadImageExtractStatus === 'extracting'

  const goToTier = (tier: 0 | 1 | 2) => {
    setActiveTool({ type: 'none' })
    setWizardTier(tier)
    setWizardStep('color')
  }

  const backToTierSelect = () => {
    setActiveTool({ type: 'none' })
    setWizardTier(null)
  }

  const handlePickColor = (tier: 0 | 1 | 2) => {
    const alreadyPicking = activeTool.type === 'image-eyedropper' && activeTool.target === 'road' && activeTool.tier === tier
    setActiveTool(alreadyPicking ? { type: 'none' } : { type: 'image-eyedropper', target: 'road', tier })
  }

  const handleToggleErase = () => {
    const alreadyErasing = activeTool.type === 'image-eraser'
    setActiveTool(alreadyErasing ? { type: 'none' } : { type: 'image-eraser', target: 'road' })
  }

  const runTrace = (tier: 0 | 1 | 2) => {
    setActiveTool({ type: 'none' })
    extractRoadsFromImage(tier)
    setRoadImagePreviewTier(tier)
  }

  const handleConfirmApply = () => {
    if (wizardTier === null) return
    applyExtractedRoadTier(wizardTier)
    setAppliedTiers(prev => new Set(prev).add(wizardTier))
    setWizardTier(null)
  }

  if (!mapImageDataUrl) {
    return (
      <FlyoutShell title="Extract from image" onClose={onClose}>
        <div style={{ padding: '10px 12px', fontFamily: t.mono, fontSize: 9, color: t.inkMute, lineHeight: 1.4 }}>
          Align a historical map image first (see Terrain panel) before extracting roads.
        </div>
      </FlyoutShell>
    )
  }

  // ── Step: pick which tier to work on ────────────────────────────────────
  if (wizardTier === null) {
    return (
      <FlyoutShell title="Extract from image" subtitle="one tier at a time — color, trace, confirm" onClose={onClose}>
        <FSectionDivider />
        <FSectionLabel label="Tiers" />
        <div style={{ padding: '4px 12px 10px' }}>
          {ROAD_TIERS.map(({ tier, label, color }) => {
            const done = appliedTiers.has(tier)
            return (
              <button
                key={tier}
                onClick={() => goToTier(tier)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 8px', marginBottom: 6,
                  background: 'none', border: `1px solid ${done ? color : t.line}`,
                  borderLeft: `3px solid ${color}`,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: 10, height: 10, background: color, borderRadius: 1, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: t.mono, fontSize: 11, color: t.ink }}>{label}</span>
                <span style={{ fontFamily: t.mono, fontSize: 9, color: done ? color : t.inkFaint }}>
                  {done ? 'done — redo' : 'start →'}
                </span>
              </button>
            )
          })}
        </div>
      </FlyoutShell>
    )
  }

  // ── Steps: color + tolerance, then trace + review, for the chosen tier ──
  const tierInfo = ROAD_TIERS.find(rt => rt.tier === wizardTier)!
  const tierSwatches = roadImageSwatches.filter(s => s.tier === wizardTier)
  const pickActive = activeTool.type === 'image-eyedropper' && activeTool.target === 'road' && activeTool.tier === wizardTier
  const eraseActive = activeTool.type === 'image-eraser'
  const tracedCount = extractedRoadWays.filter(w => w.tier === wizardTier).length

  return (
    <FlyoutShell
      title={`Extract — ${tierInfo.label}`}
      subtitle={wizardStep === 'color' ? 'step 1/2 — pick colors' : 'step 2/2 — review trace'}
      onClose={onClose}
    >
      <div style={{ padding: '6px 12px 0' }}>
        <button
          onClick={backToTierSelect}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkMute }}
        >← back to tiers</button>
      </div>

      {wizardStep === 'color' && (
        <>
          <FSectionDivider />
          <div style={{ padding: '4px 12px' }}>
            <button
              onClick={() => handlePickColor(wizardTier)}
              style={{
                width: '100%', padding: '6px 0', marginBottom: 8,
                background: pickActive ? tintBg(tierInfo.color, 0.2) : 'none',
                border: `1px solid ${pickActive ? tierInfo.color : t.line}`,
                color: pickActive ? tierInfo.color : t.ink,
                borderRadius: 3, cursor: 'pointer',
                fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
              }}
            >
              {pickActive ? 'Click a line on the map…' : `Eyedropper a ${tierInfo.label.toLowerCase()} color`}
            </button>
            {tierSwatches.length === 0 ? (
              <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, lineHeight: 1.4 }}>
                No color yet. Click the eyedropper above, then click a {tierInfo.label.toLowerCase()} line on the source map image.
              </div>
            ) : (
              tierSwatches.map(s => (
                <RoadImageColorChip
                  key={s.id}
                  color={s.color}
                  tolerance={s.tolerance}
                  onToleranceChange={v => updateRoadImageSwatchTolerance(s.id, v)}
                  onRemove={() => removeRoadImageSwatch(s.id)}
                  onPreviewStart={() => setRoadImagePreview(s.id, 'raw')}
                />
              ))
            )}
          </div>
          <FSectionDivider />
          <div style={{ padding: '4px 12px' }}>
            <button
              onClick={handleToggleErase}
              style={{
                width: '100%', padding: '6px 0', marginBottom: 4,
                background: eraseActive ? tintBg(t.rust, 0.2) : 'none',
                border: `1px solid ${eraseActive ? t.rust : t.line}`,
                color: eraseActive ? t.rust : t.ink,
                borderRadius: 3, cursor: 'pointer',
                fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
              }}
            >
              {eraseActive ? 'Erasing — click or drag hexes…' : 'Erase false positives'}
            </button>
            <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, lineHeight: 1.4 }}>
              Hover to highlight a hex, click (or drag) to blank out everything inside it — good for stray marks, labels, or symbols that match this color.
            </div>
            {roadImageEraseHexKeys.length > 0 && (
              <div style={{ paddingTop: 4 }}>
                <button
                  onClick={clearRoadImageEraseHexKeys}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.3 }}
                >
                  ↺ clear erased hexes ({roadImageEraseHexKeys.length})
                </button>
              </div>
            )}
          </div>
          <FSectionDivider />
          <div style={{ padding: '4px 12px 8px' }}>
            <button
              onClick={() => { setWizardStep('trace'); runTrace(wizardTier) }}
              disabled={tierSwatches.length === 0}
              style={{
                width: '100%', padding: '6px 0',
                background: 'none',
                border: `1px solid ${tierSwatches.length > 0 ? t.rust : t.line}`,
                color: tierSwatches.length > 0 ? t.rust : t.inkFaint,
                cursor: tierSwatches.length > 0 ? 'pointer' : 'not-allowed',
                fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
              }}
            >
              Next: trace →
            </button>
          </div>
        </>
      )}

      {wizardStep === 'trace' && (
        <>
          <FSectionDivider />
          <div style={{ padding: '4px 12px', fontFamily: t.mono, fontSize: 9, color: t.inkMute, lineHeight: 1.4 }}>
            {extracting
              ? 'Tracing…'
              : `${tracedCount} line${tracedCount === 1 ? '' : 's'} traced. Yellow overlay on the map shows what will be applied.`}
          </div>
          <div style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
            <button
              onClick={() => setWizardStep('color')}
              style={{ flex: 1, padding: '5px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9.5 }}
            >
              ← adjust color
            </button>
            <button
              onClick={() => runTrace(wizardTier)}
              disabled={extracting}
              style={{ flex: 1, padding: '5px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: extracting ? 'not-allowed' : 'pointer', fontFamily: t.mono, fontSize: 9.5 }}
            >
              retrace
            </button>
          </div>
          <div style={{ padding: '0 12px 10px' }}>
            <button
              onClick={handleConfirmApply}
              disabled={extracting || tracedCount === 0}
              style={{
                width: '100%', padding: '6px 0',
                background: 'none',
                border: `1px solid ${tracedCount > 0 && !extracting ? t.rust : t.line}`,
                color: tracedCount > 0 && !extracting ? t.rust : t.inkFaint,
                cursor: tracedCount > 0 && !extracting ? 'pointer' : 'not-allowed',
                fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
              }}
            >
              Confirm — apply to map
            </button>
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── OsmRailsFlyout ─────────────────────────────────────────────────────────────

export function OsmRailsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    railsStatus, fetchRails, clearRails,
    osmRailHexPaths, osmRailHighlight, setOsmRailHighlight, applyOsmRails,
  } = useMapStore()

  const loading = railsStatus === 'loading'
  const done = railsStatus === 'done'

  return (
    <FlyoutShell title="Fetch rails from OSM" onClose={onClose}>
      <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6 }}>
        <button
          onClick={fetchRails}
          disabled={loading}
          style={{
            flex: 1, padding: '5px 0', background: 'none',
            border: `1px solid ${loading ? t.line : RAIL_COLOR}`,
            color: loading ? t.inkFaint : RAIL_COLOR,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
          }}
        >
          {loading ? 'fetching…' : done ? '✓ Rails fetched' : 'Fetch rails'}
        </button>
        {done && (
          <button
            onClick={clearRails}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}
          >
            clear
          </button>
        )}
      </div>

      {done && osmRailHexPaths.length > 0 && (
        <div style={{ padding: '4px 12px' }}>
          <button
            onClick={applyOsmRails}
            onMouseEnter={() => setOsmRailHighlight(true)}
            onMouseLeave={() => setOsmRailHighlight(false)}
            style={{
              width: '100%', padding: '5px 0',
              background: osmRailHighlight ? tintBg(RAIL_COLOR, 0.1) : 'transparent',
              border: `1px solid ${osmRailHighlight ? RAIL_COLOR : t.line}`,
              color: osmRailHighlight ? RAIL_COLOR : t.inkMute,
              cursor: 'pointer', fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
            }}
          >
            Apply rails
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── BridgesFlyout ──────────────────────────────────────────────────────────────

export function BridgesFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    bridgesEnabled, setBridgesEnabled,
    bridgeStyle, setBridgeStyle,
    bridgeLengthScale, setBridgeLengthScale,
    bridgeTiers, updateBridgeTier, addBridgeTier, removeBridgeTier,
  } = useMapStore()
  const lengthSlider = useDeferredSlider(Math.round(bridgeLengthScale * 100), v => setBridgeLengthScale(v / 100))

  return (
    <FlyoutShell title="Bridges" onClose={onClose}>
      <ToggleRow label="Enabled" hint="Render bridge symbols on road crossings." checked={bridgesEnabled} onChange={setBridgesEnabled} />
      {bridgesEnabled && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Style" />
          <div style={{ padding: '4px 12px' }}>
            <SegmentedControl
              options={[{ value: 'plank', label: 'Plank' }, { value: 'icon', label: 'Icon' }]}
              value={bridgeStyle}
              onChange={setBridgeStyle}
            />
          </div>
          <FSectionDivider />
          <FSectionLabel label="Size" />
          <MiniSlider label="Length" display={(lengthSlider.value / 100).toFixed(2) + '×'} value={lengthSlider.value} min={80} max={400} step={5} onChange={lengthSlider.onChange} onDragEnd={lengthSlider.onDragEnd} />
          <FSectionDivider />
          <FSectionLabel label="Tiers" />
          {bridgeTiers.map((bt, idx) => (
            <div key={bt.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px' }}>
              <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint, width: 14, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
              <input
                type="color"
                value={bt.color}
                onChange={e => updateBridgeTier(bt.id, { color: e.target.value })}
                style={{ width: 22, height: 18, border: `1px solid ${t.line}`, padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }}
              />
              <input
                type="text"
                value={bt.label}
                onChange={e => updateBridgeTier(bt.id, { label: e.target.value })}
                style={{
                  flex: 1, minWidth: 0, background: t.paper, border: `1px solid ${t.line}`,
                  color: t.ink2, fontSize: 11, padding: '2px 6px', fontFamily: t.sans, outline: 'none',
                }}
              />
              <button
                onClick={() => removeBridgeTier(bt.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: t.inkFaint, fontSize: 13, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = t.rust)}
                onMouseLeave={e => (e.currentTarget.style.color = t.inkFaint)}
              >×</button>
            </div>
          ))}
          {bridgeTiers.length < 5 && (
            <div style={{ padding: '4px 12px' }}>
              <button
                onClick={addBridgeTier}
                style={{
                  width: '100%', padding: '4px 0',
                  background: 'transparent', border: `1px dashed ${t.line}`,
                  color: t.inkFaint, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5,
                }}
              >
                + Add tier
              </button>
            </div>
          )}
        </>
      )}
    </FlyoutShell>
  )
}

// ── SegmentFlyout ──────────────────────────────────────────────────────────────

export function RoadSegmentFlyout({ mode, onClose }: { mode: 'road' | 'rail'; onClose: () => void }) {
  const t = useTheme()
  const {
    roadWiggleAmp, roadWiggleFreq,
    railWiggleAmp, railWiggleFreq,
    roadSegmentProps, railSegmentProps,
    roadHopProps, railHopProps,
    selectedRoadSegmentKeys, selectedRailSegmentKeys,
    selectedRoadHopKey, selectedRailHopKey,
    setSelectedRoadHopKey, setSelectedRailHopKey,
    setRoadSegmentProp, clearRoadSegmentProp,
    setRailSegmentProp, clearRailSegmentProp,
    setRoadHopProp, clearRoadHopProp,
    setRailHopProp, clearRailHopProp,
  } = useMapStore()

  const isRoad = mode === 'road'
  const accentColor = isRoad ? t.rust : RAIL_COLOR
  const selectedKeys = isRoad ? selectedRoadSegmentKeys : selectedRailSegmentKeys
  const segmentProps = isRoad ? roadSegmentProps : railSegmentProps
  const hopProps = isRoad ? roadHopProps : railHopProps
  const selectedHopKey = isRoad ? selectedRoadHopKey : selectedRailHopKey
  const globalAmp = isRoad ? roadWiggleAmp : railWiggleAmp
  const globalFreq = isRoad ? roadWiggleFreq : railWiggleFreq
  const setProp = isRoad ? setRoadSegmentProp : setRailSegmentProp
  const clearProp = isRoad ? clearRoadSegmentProp : clearRailSegmentProp
  const setHopProp = isRoad ? setRoadHopProp : setRailHopProp
  const clearHopProp = isRoad ? clearRoadHopProp : clearRailHopProp
  const setSelectedHopKey = isRoad ? setSelectedRoadHopKey : setSelectedRailHopKey

  const firstProps = segmentProps[selectedKeys[0]]
  const segAmp = firstProps?.wiggleAmp ?? globalAmp
  const segFreq = firstProps?.wiggleFreq ?? globalFreq
  const hasSegOverride = selectedKeys.some(k => segmentProps[k] !== undefined)

  const hopP = selectedHopKey ? hopProps[selectedHopKey] : null
  const hopAmp = hopP?.wiggleAmp ?? (firstProps?.wiggleAmp ?? globalAmp)
  const hopFreq = hopP?.wiggleFreq ?? (firstProps?.wiggleFreq ?? globalFreq)
  const hasHopOverride = !!hopP

  return (
    <FlyoutShell
      title={`${selectedKeys.length} segment${selectedKeys.length !== 1 ? 's' : ''}`}
      subtitle={hasSegOverride ? 'Custom wiggle active' : 'Default shape'}
      onClose={onClose}
    >
      <FSectionLabel label="Wiggle" />
      <div style={{ padding: '0 12px 2px', fontFamily: t.sans, fontSize: 10.5, color: t.inkMute, lineHeight: 1.5 }}>
        Per-segment override. Reverts to default when cleared.
      </div>
      <MiniSlider
        label="Amplitude"
        display={`${Math.round(segAmp * 100)}%`}
        value={Math.round(segAmp * 100)}
        min={0} max={100} step={1}
        accentColor={accentColor}
        onChange={v => selectedKeys.forEach(k => setProp(k, { wiggleAmp: v / 100 }))}
      />
      <MiniSlider
        label="Frequency"
        display={segFreq.toFixed(1)}
        value={Math.round(segFreq * 10)}
        min={1} max={50} step={1}
        accentColor={accentColor}
        onChange={v => selectedKeys.forEach(k => setProp(k, { wiggleFreq: v / 10 }))}
      />
      {hasSegOverride && (
        <div style={{ padding: '4px 12px 0' }}>
          <button
            onClick={() => { selectedKeys.forEach(k => clearProp(k)); setSelectedHopKey(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.3 }}
          >
            ↺ reset segments
          </button>
        </div>
      )}

      {selectedHopKey && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Hop wiggle" />
          <div style={{ padding: '0 12px 2px', fontFamily: t.sans, fontSize: 10.5, color: t.inkMute, lineHeight: 1.5 }}>
            Override for this specific hop point.
          </div>
          <MiniSlider
            label="Amplitude"
            display={`${Math.round(hopAmp * 100)}%`}
            value={Math.round(hopAmp * 100)}
            min={0} max={100} step={1}
            accentColor={accentColor}
            onChange={v => setHopProp(selectedHopKey, { wiggleAmp: v / 100 })}
          />
          <MiniSlider
            label="Frequency"
            display={hopFreq.toFixed(1)}
            value={Math.round(hopFreq * 10)}
            min={1} max={50} step={1}
            accentColor={accentColor}
            onChange={v => setHopProp(selectedHopKey, { wiggleFreq: v / 10 })}
          />
          {hasHopOverride && (
            <div style={{ padding: '4px 12px 0' }}>
              <button
                onClick={() => { clearHopProp(selectedHopKey); setSelectedHopKey(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.3 }}
              >
                ↺ reset hop
              </button>
            </div>
          )}
        </>
      )}
    </FlyoutShell>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RoadsSidebarV3() {
  const {
    roadPaintMode, roadPaintBrush, roadPaintEraser,
    railPaintMode, railPaintEraser,
    roadNodeEditMode, railNodeEditMode,
    roadSelectMode,
    railSelectMode,
    setActiveTool,
    selectedRoadSegmentKeys, setSelectedRoadSegmentKeys,
    selectedRailSegmentKeys, setSelectedRailSegmentKeys,
    dataSource,
    bridgesEnabled,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutId>(null)
  const [cogTier, setCogTier] = useState<0 | 1 | 2>(0)
  const [segmentMode, setSegmentMode] = useState<'road' | 'rail'>('road')

  const toggleFlyout = (id: NonNullable<FlyoutId>) =>
    setFlyout(prev => prev === id ? null : id)

  // Auto-open segment flyout when a segment is selected
  useEffect(() => {
    if (selectedRoadSegmentKeys.length > 0) {
      setSegmentMode('road')
      setFlyout('segment')
    } else if (selectedRailSegmentKeys.length > 0) {
      setSegmentMode('rail')
      setFlyout('segment')
    } else if (flyout === 'segment') {
      setFlyout(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoadSegmentKeys.length, selectedRailSegmentKeys.length])

  const selectRoadBrush = (tier: 0 | 1 | 2) => {
    if (roadPaintMode && roadPaintBrush === tier && !roadPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'road', tier, erasing: false })
  }
  const selectRoadEraser = () => {
    if (roadPaintMode && roadPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'road', tier: roadPaintBrush, erasing: true })
  }
  const selectRailBrush = () => {
    if (railPaintMode && !railPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'rail', erasing: false })
  }
  const selectRailEraser = () => {
    if (railPaintMode && railPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'rail', erasing: true })
  }

  const t = useTheme()

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
    <ColorPickerHost>
      <StripShell>

        <V2Divider label="Roads" />
        {ROAD_TIERS.map(({ tier, label, color }) => (
          <BrushRow
            key={tier}
            label={label}
            color={color}
            active={roadPaintMode && roadPaintBrush === tier && !roadPaintEraser}
            shortcut={String(tier + 1)}
            showCog
            cogOpen={flyout === 'road-style' && cogTier === tier}
            onSelect={() => selectRoadBrush(tier)}
            onCog={() => { setCogTier(tier); setFlyout('road-style') }}
          />
        ))}
        <BrushRow
          label="Eraser"
          color={t.inkFaint}
          active={roadPaintMode && roadPaintEraser}
          shortcut="E"
          onSelect={selectRoadEraser}
        />
        <BrushRow
          label="Edit nodes"
          color={roadNodeEditMode ? '#b07820' : t.inkFaint}
          active={roadNodeEditMode}
          onSelect={() => setActiveTool(roadNodeEditMode ? { type: 'none' } : { type: 'node-edit' })}
        />
        {roadSelectMode && (
          <div style={{ padding: '1px 8px 4px', fontFamily: t.mono, fontSize: 8.5, color: t.inkMute, lineHeight: 1.4 }}>
            click road to select
          </div>
        )}
        <TGap />
        <TriggerRow label="Road shape" active={flyout === 'road-shape'} onClick={() => toggleFlyout('road-shape')} />
        <TriggerRow label="Terrain cut" active={flyout === 'road-terrain-cut'} onClick={() => toggleFlyout('road-terrain-cut')} />
        {dataSource === 'osm' && (
          <TriggerRow label="Fetch from OSM" active={flyout === 'road-import'} icon={IMPORT_ICON} onClick={() => toggleFlyout('road-import')} />
        )}
        {dataSource === 'map_image' && (
          <TriggerRow label="Extract from image" active={flyout === 'road-image-extract'} icon={IMPORT_ICON} onClick={() => toggleFlyout('road-image-extract')} />
        )}

        <V2Divider label="Rails" />
        <BrushRow
          label="Rail"
          color={RAIL_COLOR}
          active={railPaintMode && !railPaintEraser}
          showCog
          cogOpen={flyout === 'rail-style'}
          onSelect={selectRailBrush}
          onCog={() => setFlyout('rail-style')}
        />
        <BrushRow
          label="Eraser"
          color={t.inkFaint}
          active={railPaintMode && railPaintEraser}
          onSelect={selectRailEraser}
        />
        <BrushRow
          label="Edit nodes"
          color={railNodeEditMode ? '#4a7a9a' : t.inkFaint}
          active={railNodeEditMode}
          onSelect={() => setActiveTool(railNodeEditMode ? { type: 'none' } : { type: 'rail-node-edit' })}
        />
        {railSelectMode && (
          <div style={{ padding: '1px 8px 4px', fontFamily: t.mono, fontSize: 8.5, color: t.inkMute, lineHeight: 1.4 }}>
            right-click rail to select
          </div>
        )}
        <TGap />
        <TriggerRow label="Rail shape" active={flyout === 'rail-shape'} onClick={() => toggleFlyout('rail-shape')} />
        {dataSource === 'osm' && (
          <TriggerRow label="Fetch from OSM" active={flyout === 'rail-import'} icon={IMPORT_ICON} onClick={() => toggleFlyout('rail-import')} />
        )}

        <V2Divider label="Bridges" />
        <TriggerRow label="Bridge settings" active={flyout === 'bridges'} onClick={() => toggleFlyout('bridges')} enabled={bridgesEnabled} />

        <div style={{ height: 8 }} />
      </StripShell>

      {flyout === 'road-style' && <RoadStyleFlyout tier={cogTier} onClose={() => setFlyout(null)} />}
      {flyout === 'rail-style' && <RailStyleFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'road-shape' && <RoadShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'road-terrain-cut' && <RoadTerrainCutFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'rail-shape' && <RailShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'road-import' && <OsmRoadsFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'road-image-extract' && <RoadImageExtractFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'rail-import' && <OsmRailsFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'bridges' && <BridgesFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'segment' && (
        <RoadSegmentFlyout
          mode={segmentMode}
          onClose={() => {
            if (segmentMode === 'road') setSelectedRoadSegmentKeys([])
            else setSelectedRailSegmentKeys([])
            setFlyout(null)
          }}
        />
      )}
    </ColorPickerHost>
    </div>
  )
}
