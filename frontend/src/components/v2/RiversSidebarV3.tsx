import { useState, useEffect } from 'react'
import {
  useMapStore, DEFAULT_RIVER_STYLE, DEFAULT_CANAL_STYLE, DEFAULT_STROKE_EFFECT,
  DEFAULT_RIVER_TIER_STYLES,
} from '../../store/mapStore'
import type { RiverTier } from '../../store/mapStore'
import { riverChainCache, computeTaperRanges } from '../../lib/riverChains'
import {
  PALETTE_RIVER, PALETTE_RIVER_OUTLINE,
  PALETTE_CANAL, PALETTE_CANAL_OUTLINE,
} from '../../palettes'
import { useTheme } from '../../context/ThemeContext'
import {
  BrushRow, MiniSlider, BigColorSwatch, SegmentedControl, ToggleRow, tintBg,
  StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
} from './sidebar'
import { StrokeEffectPanel } from './StrokeEffectPanel'
import { resolveLabels } from '../../lib/labelPresets'
import { LabelSpecEditorRows } from './LabelSpecEditor'

// ── Colour groups ─────────────────────────────────────────────────────────────

const RIVER_FILL_GROUPS   = [{ label: 'Blue', colors: [...PALETTE_RIVER] }]
const RIVER_STROKE_GROUPS = [{ label: 'Dark', colors: [...PALETTE_RIVER_OUTLINE] }]
const CANAL_FILL_GROUPS   = [{ label: 'Teal', colors: [...PALETTE_CANAL] }]
const CANAL_STROKE_GROUPS = [{ label: 'Dark', colors: [...PALETTE_CANAL_OUTLINE] }]

type FlyoutId = 'river-0' | 'river-1' | 'river-2' | 'shape' | 'osm' | 'segment' | 'river-labels' | null

const TIER_COLORS = ['#6090c8', '#8090b8', '#a0a8c0'] as const

// ── SubLabel ──────────────────────────────────────────────────────────────────

function SubLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 14px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </div>
  )
}

// ── SectionToggle ─────────────────────────────────────────────────────────────

function SectionToggle({ label, enabled, onChange, accentColor }: { label: string; enabled: boolean; onChange: (v: boolean) => void; accentColor?: string }) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px', borderTop: `1px solid ${t.line2}` }}>
      <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: enabled ? (accentColor ?? t.ink2) : t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
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

// ── GlobalShapeFlyout ─────────────────────────────────────────────────────────

export function GlobalShapeFlyout({ onClose }: { onClose: () => void }) {
  const {
    riverWiggleAmp, setRiverWiggleAmp,
    riverWiggleFreq, setRiverWiggleFreq,
    riverSmoothing, setRiverSmoothing,
    riverPathSmoothing, setRiverPathSmoothing,
    riverCornerRounds, setRiverCornerRounds,
    riverPointSpacing, setRiverPointSpacing,
    riverNoiseAmp, setRiverNoiseAmp,
    riverNoiseScale, setRiverNoiseScale,
  } = useMapStore()
  return (
    <FlyoutShell title="Shape defaults" subtitle="applied to all tiers unless overridden" onClose={onClose}>
      <MiniSlider label="Corner rounds" display={String(riverCornerRounds)}          value={riverCornerRounds}                    min={0} max={5}   step={1}    onChange={setRiverCornerRounds} />
      <MiniSlider label="Point spacing" display={riverPointSpacing.toFixed(2)}       value={Math.round(riverPointSpacing * 100)}   min={3} max={30}  step={1}    onChange={v => setRiverPointSpacing(v / 100)} />
      <MiniSlider label="Noise amp"     display={riverNoiseAmp.toFixed(2)}           value={Math.round(riverNoiseAmp * 100)}       min={0} max={100} step={1}    onChange={v => setRiverNoiseAmp(v / 100)} />
      <MiniSlider label="Noise scale"   display={riverNoiseScale.toFixed(1)}         value={Math.round(riverNoiseScale * 10)}      min={2} max={40}  step={1}    onChange={v => setRiverNoiseScale(v / 10)} />
      <MiniSlider label="Wiggle amp"  display={riverWiggleAmp.toFixed(2)}  value={Math.round(riverWiggleAmp * 100)} min={0} max={100} step={1} onChange={v => setRiverWiggleAmp(v / 100)} />
      <MiniSlider label="Wiggle freq" display={riverWiggleFreq.toFixed(1)} value={Math.round(riverWiggleFreq * 10)} min={5} max={100} step={1} onChange={v => setRiverWiggleFreq(v / 10)} />
      <MiniSlider label="Line smooth" display={String(riverSmoothing)}     value={riverSmoothing}     min={2} max={30} step={1} onChange={setRiverSmoothing} />
      <MiniSlider label="Path smooth" display={String(riverPathSmoothing)} value={riverPathSmoothing} min={0} max={50} step={1} onChange={setRiverPathSmoothing} />
    </FlyoutShell>
  )
}

// ── RiverTierFlyout ───────────────────────────────────────────────────────────

export function RiverTierFlyout({ tier, onClose }: { tier: RiverTier; onClose: () => void }) {
  const t = useTheme()
  const {
    riverTierStyles, setRiverTierStyle,
  } = useMapStore()

  const s = riverTierStyles?.[tier] ?? DEFAULT_RIVER_TIER_STYLES[tier]
  const def = DEFAULT_RIVER_TIER_STYLES[tier]
  const setS = (patch: Partial<typeof s>) => setRiverTierStyle(tier, patch)
  const fx = s.effect ?? DEFAULT_STROKE_EFFECT
  const setFx = (patch: Partial<typeof fx>) => setS({ effect: { ...fx, ...patch } })
  const accentColor = TIER_COLORS[tier]

  const shapeOverrideEnabled = s.wiggleAmp !== undefined
  const {
    riverWiggleAmp, riverWiggleFreq, riverSmoothing, riverPathSmoothing,
  } = useMapStore()
  // Use tier override if set, else fall back to global
  const wiggleAmp     = s.wiggleAmp     ?? riverWiggleAmp
  const wiggleFreq    = s.wiggleFreq    ?? riverWiggleFreq
  const smoothing     = s.smoothing     ?? riverSmoothing
  const pathSmoothing = s.pathSmoothing ?? riverPathSmoothing

  const isModified =
    s.color !== def.color || s.widthScale !== def.widthScale ||
    JSON.stringify(s.effect) !== JSON.stringify(def.effect) ||
    s.wiggleAmp !== undefined || s.wiggleFreq !== undefined ||
    s.smoothing !== undefined || s.pathSmoothing !== undefined

  return (
    <FlyoutShell title={s.label} subtitle={isModified ? 'modified' : undefined} onClose={onClose}>
      {/* Always-on: colour + width */}
      <BigColorSwatch value={s.color} onChange={c => setS({ color: c })} groups={RIVER_FILL_GROUPS} />
      <MiniSlider label="Width" display={`${s.widthScale.toFixed(2)}×`} value={Math.round(s.widthScale * 100)} min={10} max={300} step={5} accentColor={accentColor} onChange={v => setS({ widthScale: v / 100 })} />

      {/* Outline */}
      <SectionToggle label="Outline" enabled={fx.outlineEnabled} onChange={v => setFx({ outlineEnabled: v })} accentColor={accentColor} />
      {fx.outlineEnabled && (
        <>
          <BigColorSwatch value={fx.outlineColor} onChange={c => setFx({ outlineColor: c })} groups={RIVER_STROKE_GROUPS} />
          <MiniSlider label="Width" display={`${fx.outlineWidth.toFixed(1)}px`} value={fx.outlineWidth * 10} min={1} max={60} step={1} accentColor={accentColor} onChange={v => setFx({ outlineWidth: v / 10 })} />
        </>
      )}

      {/* Outer glow */}
      <SectionToggle label="Outer glow" enabled={fx.glowEnabled} onChange={v => setFx({ glowEnabled: v })} accentColor={accentColor} />
      {fx.glowEnabled && (
        <>
          <BigColorSwatch value={fx.glowColor} onChange={c => setFx({ glowColor: c })} groups={[{ label: 'Shadow', colors: ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(20,40,80,0.25)', 'rgba(0,30,60,0.35)'] }]} />
          <MiniSlider label="Blur"   display={`${fx.glowBlur}px`}   value={fx.glowBlur}   min={1} max={30} step={1} accentColor={accentColor} onChange={v => setFx({ glowBlur: v })} />
          <MiniSlider label="Spread" display={`${fx.glowSpread}px`} value={fx.glowSpread} min={0} max={20} step={1} accentColor={accentColor} onChange={v => setFx({ glowSpread: v })} />
        </>
      )}

      {/* Shape override */}
      <SectionToggle
        label="Shape override"
        enabled={shapeOverrideEnabled}
        accentColor={accentColor}
        onChange={v => {
          if (v) setS({ wiggleAmp: riverWiggleAmp, wiggleFreq: riverWiggleFreq, smoothing: riverSmoothing, pathSmoothing: riverPathSmoothing })
          else   setS({ wiggleAmp: undefined, wiggleFreq: undefined, smoothing: undefined, pathSmoothing: undefined })
        }}
      />
      <MiniSlider label="Wiggle amp"  display={wiggleAmp.toFixed(2)}  value={Math.round(wiggleAmp * 100)} min={0} max={100} step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={v => setS({ wiggleAmp: v / 100 })} disabled={!shapeOverrideEnabled} />
      <MiniSlider label="Wiggle freq" display={wiggleFreq.toFixed(1)} value={Math.round(wiggleFreq * 10)} min={5} max={100} step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={v => setS({ wiggleFreq: v / 10 })} disabled={!shapeOverrideEnabled} />
      <MiniSlider label="Line smooth" display={String(smoothing)}     value={smoothing}     min={2} max={30} step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={v => setS({ smoothing: v })} disabled={!shapeOverrideEnabled} />
      <MiniSlider label="Path smooth" display={String(pathSmoothing)} value={pathSmoothing} min={0} max={50} step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={v => setS({ pathSmoothing: v })} disabled={!shapeOverrideEnabled} />

      {isModified && (
        <div style={{ margin: '8px 14px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={() => setRiverTierStyle(tier, { ...def })}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── CanalStyleFlyout ──────────────────────────────────────────────────────────

export function CanalStyleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    canalStyle, setCanalStyle,
    canalWidthScale, setCanalWidthScale,
  } = useMapStore()

  const isModified =
    canalStyle.color !== DEFAULT_CANAL_STYLE.color ||
    JSON.stringify(canalStyle.effect) !== JSON.stringify(DEFAULT_CANAL_STYLE.effect)

  return (
    <FlyoutShell title="Canal Style" subtitle={isModified ? 'modified' : undefined} onClose={onClose}>
      <SubLabel label="Colour" />
      <BigColorSwatch value={canalStyle.color} onChange={c => setCanalStyle({ color: c })} groups={CANAL_FILL_GROUPS} />

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Width" />
        <MiniSlider label="Scale" display={`${canalWidthScale.toFixed(1)}×`} value={Math.round(canalWidthScale * 10)} min={2} max={40} step={1} onChange={v => setCanalWidthScale(v / 10)} />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <StrokeEffectPanel
          effect={canalStyle.effect ?? DEFAULT_STROKE_EFFECT}
          onChange={patch => setCanalStyle({ effect: { ...(canalStyle.effect ?? DEFAULT_STROKE_EFFECT), ...patch } })}
          colorGroups={[{ label: 'Canal', colors: [...CANAL_STROKE_GROUPS[0].colors] }]}
        />
      </div>

      {isModified && (
        <div style={{ padding: '8px 14px 0' }}>
          <button
            onClick={() => setCanalStyle({ ...DEFAULT_CANAL_STYLE })}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '3px 8px', letterSpacing: 0.3 }}
          >
            ↺ Reset to defaults
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}


// ── OsmRiversFlyout ───────────────────────────────────────────────────────────

export function OsmRiversFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    osmRiverWays, riversOsmStatus, riversOsmError,
    hoveredOsmRiverIdx, appliedOsmRiverIndices,
    fetchRivers, toggleOsmRiver, setHoveredOsmRiverIdx, clearOsmRivers,
    riverStyle, canalStyle,
  } = useMapStore()

  const [listOpen, setListOpen] = useState(false)

  useEffect(() => {
    if (riversOsmStatus === 'done' && osmRiverWays.length > 0) setListOpen(true)
  }, [riversOsmStatus, osmRiverWays.length])

  const loading = riversOsmStatus === 'loading'

  return (
    <FlyoutShell title="OSM Rivers" onClose={onClose}>
      <div style={{ padding: '4px 14px 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => fetchRivers()}
          disabled={loading}
          style={{
            flex: 1, padding: '5px 0',
            background: 'none',
            border: `1px solid ${loading ? t.line : t.rust}`,
            color: loading ? t.inkFaint : t.rust,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
          }}
        >
          {loading ? 'fetching…' : 'Fetch Rivers'}
        </button>
        {riversOsmStatus === 'done' && (
          <button
            onClick={clearOsmRivers}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}
          >
            clear
          </button>
        )}
      </div>

      {riversOsmStatus === 'error' && riversOsmError && (
        <div style={{ padding: '2px 14px 4px', fontFamily: t.sans, fontSize: 10.5, color: t.rust }}>{riversOsmError}</div>
      )}
      {riversOsmStatus === 'done' && osmRiverWays.length === 0 && (
        <div style={{ padding: '2px 14px 4px', fontFamily: t.sans, fontSize: 10.5, color: t.inkMute }}>No named rivers found.</div>
      )}
      {riversOsmStatus === 'done' && osmRiverWays.length > 0 && (
        <>
          <button
            onClick={() => setListOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: t.mono, fontSize: 10, color: t.inkMute, letterSpacing: 0.3,
              textAlign: 'left',
            }}
          >
            <span>{osmRiverWays.length} river{osmRiverWays.length !== 1 ? 's' : ''}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              style={{ transform: listOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }}
            >
              <path d="M2 3.5l3 3 3-3" />
            </svg>
          </button>
          {listOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 14px 8px' }}>
              {osmRiverWays.map((way, idx) => {
                const applied = appliedOsmRiverIndices.includes(idx)
                const hovered = hoveredOsmRiverIdx === idx
                const dotColor = way.type === 'river' ? riverStyle.color : canalStyle.color
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredOsmRiverIdx(idx)}
                    onMouseLeave={() => setHoveredOsmRiverIdx(null)}
                    onClick={() => toggleOsmRiver(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 8px', cursor: 'pointer',
                      background: hovered ? tintBg(dotColor, 0.08) : 'transparent',
                      border: `1px solid ${applied ? dotColor : 'transparent'}`,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: applied ? dotColor : t.line }} />
                    <span style={{ flex: 1, fontFamily: t.sans, fontSize: 11, color: applied ? t.ink : t.inkMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {way.name || `(unnamed ${way.type})`}
                    </span>
                    {applied && <span style={{ fontSize: 9, color: dotColor, flexShrink: 0 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </FlyoutShell>
  )
}


// ── SegmentFlyout ─────────────────────────────────────────────────────────────

export function RiverSegmentFlyout({ mode, onClose }: { mode: 'river' | 'canal'; onClose: () => void }) {
  const t = useTheme()
  const {
    riverWidthScale, canalWidthScale,
    riverWiggleAmp, riverWiggleFreq,
    riverSegmentProps, canalSegmentProps,
    selectedSegmentKeys, selectedCanalSegmentKeys,
    setRiverSegmentProp, setRiverSegmentPropMany, clearRiverSegmentPropMany,
    setCanalSegmentProp, setCanalSegmentPropMany, clearCanalSegmentPropMany,
    riverHopProps, setRiverHopProp, clearRiverHopProp,
    selectedHopKey, setSelectedHopKey,
  } = useMapStore()

  const isRiver      = mode === 'river'
  const selectedKeys  = isRiver ? selectedSegmentKeys       : selectedCanalSegmentKeys
  const segmentProps  = isRiver ? riverSegmentProps         : canalSegmentProps
  const baseWidth     = isRiver ? riverWidthScale           : canalWidthScale
  const setProp       = isRiver ? setRiverSegmentProp       : setCanalSegmentProp
  const setPropMany   = isRiver ? setRiverSegmentPropMany   : setCanalSegmentPropMany
  const clearPropMany = isRiver ? clearRiverSegmentPropMany : clearCanalSegmentPropMany

  const n             = selectedKeys.length
  const firstProps    = segmentProps[selectedKeys[0]]
  const widthVal      = firstProps?.width       ?? baseWidth
  const taperVal      = firstProps?.taper       ?? 0
  const taperRange    = (firstProps?.taperRange ?? [0, 1]) as [number, number]
  const taperFlipped  = taperRange[0] > taperRange[1]
  const wiggleAmp     = firstProps?.wiggleAmp   ?? riverWiggleAmp
  const wiggleFreq    = firstProps?.wiggleFreq  ?? riverWiggleFreq
  const pathSmooth    = (firstProps as { pathSmoothing?: number } | undefined)?.pathSmoothing ?? 0

  const anyOverride = selectedKeys.some(k => segmentProps[k] !== undefined)
  const hp = isRiver && selectedHopKey ? riverHopProps[selectedHopKey] : null
  const hopHasOverride = !!hp

  return (
    <FlyoutShell
      title={`${n} segment${n !== 1 ? 's' : ''}`}
      subtitle={`${mode} · ${anyOverride ? 'modified' : 'default'}`}
      onClose={onClose}
    >
      {anyOverride && (
        <div style={{ padding: '0 14px 4px' }}>
          <button
            onClick={() => { clearPropMany(selectedKeys); if (isRiver) setSelectedHopKey(null) }}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '2px 8px', letterSpacing: 0.3 }}
          >
            ↺ Reset overrides
          </button>
        </div>
      )}

      <SubLabel label="Width" />
      <MiniSlider
        label="Scale"
        display={`${Math.round(widthVal * 100)}%${firstProps?.width !== undefined ? ' ●' : ''}`}
        value={Math.round(widthVal * 100)}
        min={25} max={400} step={5}
        onChange={v => setPropMany(selectedKeys, { width: v / 100 })}
      />

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 2px' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Taper</span>
          <button
            onClick={() => {
              for (const key of selectedKeys) {
                const tr = (segmentProps[key]?.taperRange ?? [0, 1]) as [number, number]
                setProp(key, { taperRange: [tr[1], tr[0]] })
              }
            }}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 10, padding: '1px 6px', lineHeight: 1.4 }}
          >
            ⇄ flip
          </button>
        </div>
        <MiniSlider
          label={taperFlipped ? 'Wide → narrow' : 'Narrow → wide'}
          display={`${Math.round(taperVal * 100)}%${firstProps?.taper !== undefined ? ' ●' : ''}`}
          value={Math.round(taperVal * 100)}
          min={0} max={100} step={5}
          onChange={v => {
            const taper = v / 100
            if (selectedKeys.length === 1) {
              setProp(selectedKeys[0], { taper, taperRange: taperFlipped ? [1, 0] : [0, 1] })
            } else {
              const ranges = computeTaperRanges(selectedKeys, riverChainCache.chains)
              for (const key of selectedKeys) {
                const tr = (ranges[key] ?? [0, 1]) as [number, number]
                setProp(key, { taper, taperRange: taperFlipped ? [tr[1], tr[0]] : tr })
              }
            }
          }}
        />
      </div>

      {isRiver && (
        <div style={{ borderTop: `1px solid ${t.line2}` }}>
          <SubLabel label="Wiggle" />
          <MiniSlider label="Amplitude"   display={`${Math.round(wiggleAmp * 100)}%${firstProps?.wiggleAmp !== undefined ? ' ●' : ''}`}                                value={Math.round(wiggleAmp * 100)}  min={0} max={100} step={1} onChange={v => setRiverSegmentPropMany(selectedKeys, { wiggleAmp: v / 100 })} />
          <MiniSlider label="Frequency"   display={`${wiggleFreq.toFixed(1)}${firstProps?.wiggleFreq !== undefined ? ' ●' : ''}`}                                      value={Math.round(wiggleFreq * 10)} min={5} max={100} step={1} onChange={v => setRiverSegmentPropMany(selectedKeys, { wiggleFreq: v / 10 })} />
          <MiniSlider label="Path smooth" display={`${pathSmooth}${(firstProps as { pathSmoothing?: number } | undefined)?.pathSmoothing !== undefined ? ' ●' : ''}`}  value={pathSmooth} min={0} max={50} step={1} onChange={v => setRiverSegmentPropMany(selectedKeys, { pathSmoothing: v } as Parameters<typeof setRiverSegmentPropMany>[1])} />
        </div>
      )}

      {isRiver && selectedHopKey && (() => {
        const ampVal  = hp?.wiggleAmp  ?? wiggleAmp
        const freqVal = hp?.wiggleFreq ?? wiggleFreq
        const hopW    = hp?.width ?? 1
        const hopT    = hp?.taper ?? 0
        return (
          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 2px' }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
                Hop{hopHasOverride ? ' ●' : ''}
              </span>
              {hopHasOverride && (
                <button
                  onClick={() => { clearRiverHopProp(selectedHopKey); setSelectedHopKey(null) }}
                  style={{ background: 'none', border: 'none', color: t.inkFaint, cursor: 'pointer', fontFamily: t.mono, fontSize: 9 }}
                >
                  ↺ reset
                </button>
              )}
            </div>
            <MiniSlider label="Width"       display={`${Math.round(hopW * 100)}%`}        value={Math.round(hopW * 100)}   min={25} max={400} step={5} onChange={v => setRiverHopProp(selectedHopKey, { width: v / 100 })} />
            <MiniSlider label="Taper"       display={`${Math.round(hopT * 100)}%`}         value={Math.round(hopT * 100)}   min={0}  max={100} step={5} onChange={v => setRiverHopProp(selectedHopKey, { taper: v / 100 })} />
            <MiniSlider label="Wiggle amp"  display={`${Math.round(ampVal * 100)}%`}       value={Math.round(ampVal * 100)} min={0}  max={100} step={1} onChange={v => setRiverHopProp(selectedHopKey, { wiggleAmp: v / 100 })} />
            <MiniSlider label="Wiggle freq" display={freqVal.toFixed(1)}                   value={Math.round(freqVal * 10)} min={5}  max={100} step={1} onChange={v => setRiverHopProp(selectedHopKey, { wiggleFreq: v / 10 })} />
          </div>
        )
      })()}
    </FlyoutShell>
  )
}

// ── RiverLabelFlyout ──────────────────────────────────────────────────────────

export function RiverLabelFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    showRiverLabels, setShowRiverLabels,
    labelPresetId, labelOverrides, setLabelCategoryOverride, resetLabelCategoryOverride,
    labelOffsets, clearAllLabelOffsets,
  } = useMapStore()
  const resolved = resolveLabels(labelPresetId, labelOverrides)
  const override = labelOverrides['water']
  const spec = resolved['water']
  const hasOverride = !!override && Object.keys(override).length > 0
  const hasAnyOffset = Object.keys(labelOffsets).length > 0

  return (
    <FlyoutShell title="River Labels" onClose={onClose}>
      <div style={{ padding: '4px 0 4px' }}>
        <ToggleRow label="Show river labels" checked={showRiverLabels} onChange={setShowRiverLabels} />
      </div>
      {hasAnyOffset && (
        <div style={{ padding: '4px 14px 8px', borderTop: `1px solid ${t.line2}` }}>
          <button
            onClick={clearAllLabelOffsets}
            title="Reset all label positions"
            style={{ width: '100%', padding: '5px 10px', borderRadius: 4, border: `1px solid ${t.line}`, background: t.bg2, color: t.inkFaint, fontFamily: t.mono, fontSize: 11, cursor: 'pointer' }}
          >
            ↺ Reset all positions
          </button>
        </div>
      )}
      <div style={{ padding: '8px 14px 12px', borderTop: `1px solid ${t.line2}` }}>
        <LabelSpecEditorRows
          spec={spec}
          previewText="River Danube"
          onChange={p => setLabelCategoryOverride('water', p)}
          onReset={() => resetLabelCategoryOverride('water')}
          hasOverride={hasOverride}
        />
      </div>
    </FlyoutShell>
  )
}

// ── RiversSidebarV3 ───────────────────────────────────────────────────────────

export function RiversSidebarV3() {
  const t = useTheme()
  const {
    riverEditMode, riverPaintTier, canalEditMode, riverNodeEditMode,
    riverSelectMode, canalSelectMode,
    setActiveTool,
    selectedSegmentKeys, setSelectedSegmentKeys,
    selectedCanalSegmentKeys, setSelectedCanalSegmentKeys,
    riverTierStyles, riverStyle, canalStyle,
    dataSource,
  } = useMapStore()

  const tierStyles = riverTierStyles ?? DEFAULT_RIVER_TIER_STYLES

  const [flyout, setFlyout] = useState<FlyoutId>(null)
  const [segmentMode, setSegmentMode] = useState<'river' | 'canal'>('river')

  const toggle = (id: NonNullable<FlyoutId>) => setFlyout(prev => prev === id ? null : id)

  useEffect(() => {
    if (selectedSegmentKeys.length > 0) { setSegmentMode('river'); setFlyout('segment') }
    else if (selectedCanalSegmentKeys.length > 0) { setSegmentMode('canal'); setFlyout('segment') }
    else if (flyout === 'segment') { setFlyout(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentKeys.length, selectedCanalSegmentKeys.length])

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <StripShell>

        <V2Divider label="Paint" />

        {([0, 1, 2] as const).map((tier, i) => (
          <BrushRow
            key={tier}
            label={tierStyles[tier].label}
            color={tierStyles[tier].color}
            active={riverEditMode && riverPaintTier === tier}
            shortcut={(['Q', 'W', 'E'] as const)[i]}
            showCog
            cogOpen={flyout === `river-${tier}`}
            onSelect={() => setActiveTool(riverEditMode && riverPaintTier === tier ? { type: 'none' } : { type: 'river-paint', tier })}
            onCog={() => toggle(`river-${tier}` as FlyoutId)}
          />
        ))}
        {riverEditMode && (
          <BrushRow
            label="— select"
            color={riverSelectMode ? tierStyles[1].color : t.inkFaint}
            active={riverSelectMode}
            onSelect={() => setActiveTool(riverSelectMode ? { type: 'river-paint', tier: riverPaintTier } : { type: 'river-select' })}
          />
        )}

        <TGap />

        <BrushRow
          label="Edit nodes"
          color={riverNodeEditMode ? '#8ab8d8' : t.inkFaint}
          active={riverNodeEditMode}
          onSelect={() => setActiveTool(riverNodeEditMode ? { type: 'none' } : { type: 'river-node-edit' })}
        />

        {dataSource === 'osm' && (
          <>
            <TGap />
            <V2Divider label="OSM" />
            <TriggerRow label="Fetch rivers" active={flyout === 'osm'} onClick={() => toggle('osm')} />
          </>
        )}

        <TGap />
        <V2Divider label="Style" />
        <TriggerRow label="Shape defaults" active={flyout === 'shape'} onClick={() => toggle('shape')} />

        <TGap />
        <V2Divider label="Labels" />
        <TriggerRow label="Label Style" active={flyout === 'river-labels'} onClick={() => toggle('river-labels')} />

      </StripShell>

      {flyout === 'shape'   && <GlobalShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'river-0' && <RiverTierFlyout tier={0} onClose={() => setFlyout(null)} />}
      {flyout === 'river-1' && <RiverTierFlyout tier={1} onClose={() => setFlyout(null)} />}
      {flyout === 'river-2' && <RiverTierFlyout tier={2} onClose={() => setFlyout(null)} />}
      {flyout === 'osm'          && <OsmRiversFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 'river-labels' && <RiverLabelFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'segment'    && (
        <RiverSegmentFlyout
          mode={segmentMode}
          onClose={() => {
            if (segmentMode === 'river') setSelectedSegmentKeys([])
            else setSelectedCanalSegmentKeys([])
          }}
        />
      )}

    </div>
  )
}
