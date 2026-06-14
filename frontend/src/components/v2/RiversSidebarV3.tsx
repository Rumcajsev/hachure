import { useState, useEffect } from 'react'
import {
  useMapStore, DEFAULT_RIVER_STYLE, DEFAULT_STROKE_EFFECT,
  DEFAULT_RIVER_TIER_STYLES, TERRAIN_COLORS,
} from '../../store/mapStore'
import type { RiverTier } from '../../store/mapStore'
import { riverChainCache, computeTaperRanges } from '../../lib/riverChains'
import {
  PALETTE_RIVER, PALETTE_RIVER_OUTLINE,
} from '../../palettes'
import { useTheme } from '../../context/ThemeContext'
import {
  BrushRow, MiniSlider, BigColorSwatch, SegmentedControl, ToggleRow, tintBg,
  StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
  useDeferredSlider,
} from './sidebar'
import { StrokeEffectPanel } from './StrokeEffectPanel'
import { resolveLabels } from '../../lib/labelPresets'
import { LabelSpecEditorRows } from './LabelSpecEditor'

// ── Colour groups ─────────────────────────────────────────────────────────────

const RIVER_FILL_GROUPS   = [{ label: 'Blue', colors: [...PALETTE_RIVER] }]
const RIVER_STROKE_GROUPS = [{ label: 'Dark', colors: [...PALETTE_RIVER_OUTLINE] }]

type FlyoutId = 'river-0' | 'river-1' | 'river-2' | 'shape' | 'osm' | 'segment' | 'river-labels' | 'terrain-cut' | null

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

// ── TerrainCutFlyout ──────────────────────────────────────────────────────────

export function TerrainCutFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { riverBlobCutEnabled, riverBlobCutWidth, setRiverBlobCutEnabled, setRiverBlobCutWidth } = useMapStore()
  const widthSlider = useDeferredSlider(Math.round(riverBlobCutWidth * 100), v => setRiverBlobCutWidth(v / 100))
  return (
    <FlyoutShell title="Terrain cut" subtitle="carve river corridors out of terrain blobs" onClose={onClose}>
      <ToggleRow label="Enabled" checked={riverBlobCutEnabled} onChange={setRiverBlobCutEnabled} />
      <MiniSlider
        label="Width"
        display={(widthSlider.value / 100).toFixed(2) + '×'}
        value={widthSlider.value}
        min={10} max={300} step={5}
        disabled={!riverBlobCutEnabled}
        onChange={widthSlider.onChange}
        onDragEnd={widthSlider.onDragEnd}
      />
      {riverBlobCutEnabled && (
        <div style={{ padding: '4px 14px 8px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint, lineHeight: 1.5 }}>
          Width is a multiple of hex radius. Reactively follows the rendered river path — removing a river restores the terrain.
        </div>
      )}
    </FlyoutShell>
  )
}

// ── GlobalShapeFlyout ─────────────────────────────────────────────────────────

export function GlobalShapeFlyout({ onClose }: { onClose: () => void }) {
  const {
    riverWiggleAmp, setRiverWiggleAmp,
    riverWiggleFreq, setRiverWiggleFreq,
    riverSmoothing, setRiverSmoothing,
    riverPathSmoothing, setRiverPathSmoothing,
  } = useMapStore()
  const ampSlider    = useDeferredSlider(Math.round(riverWiggleAmp * 100), v => setRiverWiggleAmp(v / 100))
  const freqSlider   = useDeferredSlider(Math.round(riverWiggleFreq * 10), v => setRiverWiggleFreq(v / 10))
  const smoothSlider = useDeferredSlider(riverSmoothing, setRiverSmoothing)
  const pathSlider   = useDeferredSlider(riverPathSmoothing, setRiverPathSmoothing)
  return (
    <FlyoutShell title="Shape defaults" subtitle="applied to all tiers unless overridden" onClose={onClose}>
      <MiniSlider label="Wiggle amp"  display={(ampSlider.value / 100).toFixed(2)}  value={ampSlider.value}    min={0} max={100} step={1} onChange={ampSlider.onChange}    onDragEnd={ampSlider.onDragEnd} />
      <MiniSlider label="Wiggle freq" display={(freqSlider.value / 10).toFixed(1)}  value={freqSlider.value}   min={5} max={100} step={1} onChange={freqSlider.onChange}   onDragEnd={freqSlider.onDragEnd} />
      <MiniSlider label="Line smooth" display={String(smoothSlider.value)}           value={smoothSlider.value} min={2} max={30}  step={1} onChange={smoothSlider.onChange} onDragEnd={smoothSlider.onDragEnd} />
      <MiniSlider label="Path smooth" display={String(pathSlider.value)}             value={pathSlider.value}   min={0} max={50}  step={1} onChange={pathSlider.onChange}   onDragEnd={pathSlider.onDragEnd} />
    </FlyoutShell>
  )
}

// ── BankTerrainPicker ─────────────────────────────────────────────────────────

const BANK_TERRAINS = [
  { id: 'woods',       label: 'Woods' },
  { id: 'light_woods', label: 'Light woods' },
  { id: 'rough',       label: 'Rough' },
  { id: 'marsh',       label: 'Marsh' },
  { id: 'beach',       label: 'Beach' },
]

function BankTerrainPicker({ value, onChange, terrainColors }: {
  value: string[]
  onChange: (v: string[]) => void
  terrainColors: Record<string, string>
}) {
  const t = useTheme()
  const toggle = (id: string) => {
    const next = value.includes(id) ? value.filter(x => x !== id) : [...value, id]
    onChange(next)
  }
  return (
    <div style={{ padding: '2px 14px 6px' }}>
      <div style={{ fontFamily: t.mono, fontSize: 8, letterSpacing: 0.6, color: t.inkFaint, textTransform: 'uppercase', marginBottom: 4 }}>
        {value.length === 0 ? 'Show on all terrain' : 'Show only on selected'}
      </div>
      {BANK_TERRAINS.map(({ id, label }) => {
        const active = value.includes(id)
        const color = terrainColors[id] ?? '#888'
        return (
          <div key={id} onClick={() => toggle(id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, border: `1px solid rgba(0,0,0,0.15)` }} />
            <span style={{ fontFamily: t.sans, fontSize: 11, color: active ? t.ink : t.inkMute, flex: 1 }}>{label}</span>
            <div style={{ width: 12, height: 12, borderRadius: 2, border: `1px solid ${active ? t.rust : t.inkFaint}`, background: active ? t.rust : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {active && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1 }}>✓</span>}
            </div>
          </div>
        )
      })}
    </div>
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

  // Per-tier shape sliders cascade into buildRiverChainsV2 + shapeTerrainBlobs —
  // defer all to drag end. Hooks must be called unconditionally (React rules).
  const tierAmpSlider    = useDeferredSlider(Math.round(wiggleAmp * 100),  v => setS({ wiggleAmp: v / 100 }))
  const tierFreqSlider   = useDeferredSlider(Math.round(wiggleFreq * 10),  v => setS({ wiggleFreq: v / 10 }))
  const tierSmoothSlider = useDeferredSlider(smoothing,     v => setS({ smoothing: v }))
  const tierPathSlider   = useDeferredSlider(pathSmoothing, v => setS({ pathSmoothing: v }))

  const { terrainColors } = useMapStore()

  const isModified =
    s.color !== def.color || s.widthScale !== def.widthScale ||
    JSON.stringify(s.effect) !== JSON.stringify(def.effect) ||
    s.wiggleAmp !== undefined || s.wiggleFreq !== undefined ||
    s.smoothing !== undefined || s.pathSmoothing !== undefined ||
    s.bankEnabled || s.bankWidth !== def.bankWidth || (s.bankTerrains?.length ?? 0) > 0

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
      <MiniSlider label="Wiggle amp"  display={(tierAmpSlider.value / 100).toFixed(2)}  value={tierAmpSlider.value}    min={0} max={100} step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={tierAmpSlider.onChange}    onDragEnd={tierAmpSlider.onDragEnd}    disabled={!shapeOverrideEnabled} />
      <MiniSlider label="Wiggle freq" display={(tierFreqSlider.value / 10).toFixed(1)}  value={tierFreqSlider.value}   min={5} max={100} step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={tierFreqSlider.onChange}   onDragEnd={tierFreqSlider.onDragEnd}   disabled={!shapeOverrideEnabled} />
      <MiniSlider label="Line smooth" display={String(tierSmoothSlider.value)}           value={tierSmoothSlider.value} min={2} max={30}  step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={tierSmoothSlider.onChange} onDragEnd={tierSmoothSlider.onDragEnd} disabled={!shapeOverrideEnabled} />
      <MiniSlider label="Path smooth" display={String(tierPathSlider.value)}             value={tierPathSlider.value}   min={0} max={50}  step={1} accentColor={shapeOverrideEnabled ? accentColor : undefined} onChange={tierPathSlider.onChange}   onDragEnd={tierPathSlider.onDragEnd}   disabled={!shapeOverrideEnabled} />

      {/* Bank clearance */}
      <SectionToggle label="Bank clearance" enabled={s.bankEnabled ?? false} onChange={v => setS({ bankEnabled: v })} accentColor={accentColor} />
      {s.bankEnabled && (
        <>
          <MiniSlider label="Width" display={`${s.bankWidth ?? 4}px`} value={s.bankWidth ?? 4} min={1} max={30} step={1} accentColor={accentColor} onChange={v => setS({ bankWidth: v })} />
          <BankTerrainPicker value={s.bankTerrains ?? []} onChange={v => setS({ bankTerrains: v })} terrainColors={{ ...TERRAIN_COLORS, ...terrainColors }} />
        </>
      )}

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



// ── OsmRiversFlyout ───────────────────────────────────────────────────────────

export function OsmRiversFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    osmRiverWays, riversOsmStatus, riversOsmError,
    hoveredOsmRiverIdx, appliedOsmRiverIndices,
    fetchRivers, toggleOsmRiver, setHoveredOsmRiverIdx, clearOsmRivers,
    riverStyle,
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
                const dotColor = riverStyle.color
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

export function RiverSegmentFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    riverWidthScale,
    riverWiggleAmp, riverWiggleFreq,
    riverSegmentProps,
    selectedSegmentKeys,
    setRiverSegmentProp, setRiverSegmentPropMany, clearRiverSegmentPropMany,
    riverHopProps, setRiverHopProp, clearRiverHopProp,
    selectedHopKey, setSelectedHopKey,
  } = useMapStore()

  const selectedKeys  = selectedSegmentKeys
  const segmentProps  = riverSegmentProps
  const baseWidth     = riverWidthScale
  const setProp       = setRiverSegmentProp
  const setPropMany   = setRiverSegmentPropMany
  const clearPropMany = clearRiverSegmentPropMany

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
    riverEditMode, riverPaintTier, riverNodeEditMode,
    riverSelectMode,
    setActiveTool,
    selectedSegmentKeys, setSelectedSegmentKeys,
    riverTierStyles,
    dataSource,
  } = useMapStore()

  const tierStyles = riverTierStyles ?? DEFAULT_RIVER_TIER_STYLES

  const [flyout, setFlyout] = useState<FlyoutId>(null)

  const toggle = (id: NonNullable<FlyoutId>) => setFlyout(prev => prev === id ? null : id)

  useEffect(() => {
    if (selectedSegmentKeys.length > 0) { setFlyout('segment') }
    else if (flyout === 'segment') { setFlyout(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentKeys.length])

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
        <TriggerRow label="Terrain cut" active={flyout === 'terrain-cut'} onClick={() => toggle('terrain-cut')} />

        <TGap />
        <V2Divider label="Labels" />
        <TriggerRow label="Label Style" active={flyout === 'river-labels'} onClick={() => toggle('river-labels')} />

      </StripShell>

      {flyout === 'shape'        && <GlobalShapeFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 'terrain-cut'  && <TerrainCutFlyout   onClose={() => setFlyout(null)} />}
      {flyout === 'river-0' && <RiverTierFlyout tier={0} onClose={() => setFlyout(null)} />}
      {flyout === 'river-1' && <RiverTierFlyout tier={1} onClose={() => setFlyout(null)} />}
      {flyout === 'river-2' && <RiverTierFlyout tier={2} onClose={() => setFlyout(null)} />}
      {flyout === 'osm'          && <OsmRiversFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 'river-labels' && <RiverLabelFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'segment'    && (
        <RiverSegmentFlyout
          onClose={() => setSelectedSegmentKeys([])}
        />
      )}

    </div>
  )
}
