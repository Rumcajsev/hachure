import { useState, useEffect } from 'react'
import {
  useMapStore, LAKE_COLOR, DEFAULT_RIVER_STYLE, DEFAULT_CANAL_STYLE,
} from '../../store/mapStore'
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
import { resolveLabels } from '../../lib/labelPresets'
import { LabelSpecEditorRows } from './LabelSpecEditor'

// ── Colour groups ─────────────────────────────────────────────────────────────

const RIVER_FILL_GROUPS   = [{ label: 'Blue', colors: [...PALETTE_RIVER] }]
const RIVER_STROKE_GROUPS = [{ label: 'Dark', colors: [...PALETTE_RIVER_OUTLINE] }]
const CANAL_FILL_GROUPS   = [{ label: 'Teal', colors: [...PALETTE_CANAL] }]
const CANAL_STROKE_GROUPS = [{ label: 'Dark', colors: [...PALETTE_CANAL_OUTLINE] }]

type FlyoutId = 'river' | 'canal' | 'lake' | 'osm' | 'auto-lakes' | 'segment' | 'river-labels' | null

// ── SubLabel ──────────────────────────────────────────────────────────────────

function SubLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 14px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </div>
  )
}

// ── RiverStyleFlyout ──────────────────────────────────────────────────────────

function RiverStyleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    riverStyle, setRiverStyle,
    riverWidthScale, setRiverWidthScale,
    riverWiggleAmp, setRiverWiggleAmp,
    riverWiggleFreq, setRiverWiggleFreq,
    riverSmoothing, setRiverSmoothing,
    riverPathSmoothing, setRiverPathSmoothing,
  } = useMapStore()

  const isModified =
    riverStyle.color !== DEFAULT_RIVER_STYLE.color ||
    riverStyle.strokeEnabled !== DEFAULT_RIVER_STYLE.strokeEnabled ||
    riverStyle.strokeColor !== DEFAULT_RIVER_STYLE.strokeColor ||
    riverStyle.strokeWidth !== DEFAULT_RIVER_STYLE.strokeWidth

  return (
    <FlyoutShell title="River Style" subtitle={isModified ? 'modified' : undefined} onClose={onClose}>
      <SubLabel label="Colour" />
      <BigColorSwatch value={riverStyle.color} onChange={c => setRiverStyle({ color: c })} groups={RIVER_FILL_GROUPS} />

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Width" />
        <MiniSlider label="Scale" display={`${riverWidthScale.toFixed(1)}×`} value={Math.round(riverWidthScale * 10)} min={2} max={40} step={1} onChange={v => setRiverWidthScale(v / 10)} />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Wiggle" />
        <MiniSlider label="Amplitude"  display={riverWiggleAmp.toFixed(2)}  value={Math.round(riverWiggleAmp * 100)} min={0}  max={100} step={1} onChange={v => setRiverWiggleAmp(v / 100)} />
        <MiniSlider label="Frequency"  display={riverWiggleFreq.toFixed(1)} value={Math.round(riverWiggleFreq * 10)} min={5}  max={100} step={1} onChange={v => setRiverWiggleFreq(v / 10)} />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Smoothing" />
        <MiniSlider label="Line smooth" display={String(riverSmoothing)}     value={riverSmoothing}     min={2} max={30} step={1} onChange={setRiverSmoothing} />
        <MiniSlider label="Path smooth" display={String(riverPathSmoothing)} value={riverPathSmoothing} min={0} max={50} step={1} onChange={setRiverPathSmoothing} />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <div style={{ padding: '6px 14px 4px' }}>
          <ToggleRow label="Outline" checked={riverStyle.strokeEnabled} onChange={v => setRiverStyle({ strokeEnabled: v })} />
        </div>
        {riverStyle.strokeEnabled && (
          <>
            <SubLabel label="Outline colour" />
            <BigColorSwatch value={riverStyle.strokeColor} onChange={c => setRiverStyle({ strokeColor: c })} groups={RIVER_STROKE_GROUPS} />
            <MiniSlider label="Width" display={`${Math.round(riverStyle.strokeWidth * 100)}%`} value={Math.round(riverStyle.strokeWidth * 100)} min={5} max={100} step={5} onChange={v => setRiverStyle({ strokeWidth: v / 100 })} />
          </>
        )}
      </div>

      {isModified && (
        <div style={{ padding: '8px 14px 0' }}>
          <button
            onClick={() => setRiverStyle({ ...DEFAULT_RIVER_STYLE })}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '3px 8px', letterSpacing: 0.3 }}
          >
            ↺ Reset to defaults
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── CanalStyleFlyout ──────────────────────────────────────────────────────────

function CanalStyleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    canalStyle, setCanalStyle,
    canalWidthScale, setCanalWidthScale,
  } = useMapStore()

  const isModified =
    canalStyle.color !== DEFAULT_CANAL_STYLE.color ||
    canalStyle.strokeEnabled !== DEFAULT_CANAL_STYLE.strokeEnabled ||
    canalStyle.strokeColor !== DEFAULT_CANAL_STYLE.strokeColor ||
    canalStyle.strokeWidth !== DEFAULT_CANAL_STYLE.strokeWidth

  return (
    <FlyoutShell title="Canal Style" subtitle={isModified ? 'modified' : undefined} onClose={onClose}>
      <SubLabel label="Colour" />
      <BigColorSwatch value={canalStyle.color} onChange={c => setCanalStyle({ color: c })} groups={CANAL_FILL_GROUPS} />

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Width" />
        <MiniSlider label="Scale" display={`${canalWidthScale.toFixed(1)}×`} value={Math.round(canalWidthScale * 10)} min={2} max={40} step={1} onChange={v => setCanalWidthScale(v / 10)} />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <div style={{ padding: '6px 14px 4px' }}>
          <ToggleRow label="Outline" checked={canalStyle.strokeEnabled} onChange={v => setCanalStyle({ strokeEnabled: v })} />
        </div>
        {canalStyle.strokeEnabled && (
          <>
            <SubLabel label="Outline colour" />
            <BigColorSwatch value={canalStyle.strokeColor} onChange={c => setCanalStyle({ strokeColor: c })} groups={CANAL_STROKE_GROUPS} />
            <MiniSlider label="Width" display={`${Math.round(canalStyle.strokeWidth * 100)}%`} value={Math.round(canalStyle.strokeWidth * 100)} min={5} max={100} step={5} onChange={v => setCanalStyle({ strokeWidth: v / 100 })} />
          </>
        )}
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

// ── LakeShapeFlyout ───────────────────────────────────────────────────────────

function LakeShapeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    lakeBlobSmooth, setLakeBlobSmooth,
    lakeBlobOffset, setLakeBlobOffset,
    lakeBlobBump, setLakeBlobBump,
    lakeBlobSweepFreq, setLakeBlobSweepFreq,
    lakeBlobLobeFreq, setLakeBlobLobeFreq,
    lakeBlobLobeAmp, setLakeBlobLobeAmp,
    lakeBlobLobeThreshold, setLakeBlobLobeThreshold,
    lakeBlobLobeDirection, setLakeBlobLobeDirection,
  } = useMapStore()

  return (
    <FlyoutShell title="Lake Shape" onClose={onClose}>
      <SubLabel label="Shape" />
      <MiniSlider label="Corner rounding" display={String(lakeBlobSmooth)}                                                            value={lakeBlobSmooth}                      min={0}   max={5}   step={1} onChange={setLakeBlobSmooth} />
      <MiniSlider label="Waviness"        display={`${Math.round(lakeBlobBump * 100)}%`}                                              value={Math.round(lakeBlobBump * 100)}      min={0}   max={60}  step={1} onChange={v => setLakeBlobBump(v / 100)} />
      <MiniSlider label="Inset"           display={`${lakeBlobOffset > 0 ? '+' : ''}${Math.round(lakeBlobOffset * 100)}%`}            value={Math.round(lakeBlobOffset * 100)}    min={-80} max={30}  step={1} onChange={v => setLakeBlobOffset(v / 100)} />
      <MiniSlider label="Wave scale"      display={lakeBlobSweepFreq.toFixed(2)}                                                      value={Math.round(lakeBlobSweepFreq * 100)} min={40}  max={100} step={1} onChange={v => setLakeBlobSweepFreq(v / 100)} />

      <div style={{ borderTop: `1px solid ${t.line2}` }}>
        <SubLabel label="Fringe" />
        <MiniSlider label="Scale"    display={lakeBlobLobeFreq.toFixed(1)}                    value={Math.round(lakeBlobLobeFreq * 10)}       min={20} max={50}  step={1} onChange={v => setLakeBlobLobeFreq(v / 10)} />
        <MiniSlider label="Strength" display={`${Math.round(lakeBlobLobeAmp * 100)}%`}        value={Math.round(lakeBlobLobeAmp * 100)}       min={0}  max={100} step={1} onChange={v => setLakeBlobLobeAmp(v / 100)} />
        <MiniSlider label="Sparsity" display={`${Math.round(lakeBlobLobeThreshold * 100)}%`}  value={Math.round(lakeBlobLobeThreshold * 100)} min={0}  max={40}  step={1} onChange={v => setLakeBlobLobeThreshold(v / 100)} />
        <div style={{ padding: '4px 14px 8px' }}>
          <SegmentedControl
            options={[{ value: 'outward', label: 'Outward' }, { value: 'inward', label: 'Inward' }]}
            value={lakeBlobLobeDirection >= 0 ? 'outward' : 'inward'}
            onChange={v => setLakeBlobLobeDirection(v === 'outward' ? 1 : -1)}
          />
        </div>
      </div>
    </FlyoutShell>
  )
}

// ── OsmRiversFlyout ───────────────────────────────────────────────────────────

function OsmRiversFlyout({ onClose }: { onClose: () => void }) {
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

// ── AutoLakesFlyout ───────────────────────────────────────────────────────────

function AutoLakesFlyout({ onClose }: { onClose: () => void }) {
  const { autoLakesEnabled, setAutoLakesEnabled, lakeSensitivity, setLakeSensitivity } = useMapStore()
  return (
    <FlyoutShell title="Auto Lakes" onClose={onClose}>
      <div style={{ padding: '2px 0 4px' }}>
        <ToggleRow label="Detect automatically" checked={autoLakesEnabled} onChange={setAutoLakesEnabled} />
      </div>
      {autoLakesEnabled && (
        <MiniSlider
          label="Sensitivity"
          display={`${Math.round(lakeSensitivity * 100)}%`}
          value={Math.round(lakeSensitivity * 100)}
          min={5} max={95} step={1}
          onChange={v => setLakeSensitivity(v / 100)}
        />
      )}
    </FlyoutShell>
  )
}

// ── SegmentFlyout ─────────────────────────────────────────────────────────────

function SegmentFlyout({ mode, onClose }: { mode: 'river' | 'canal'; onClose: () => void }) {
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

function RiverLabelFlyout({ onClose }: { onClose: () => void }) {
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
    riverEditMode, canalEditMode, lakePaintMode, riverNodeEditMode,
    riverSelectMode, canalSelectMode,
    setActiveTool,
    selectedSegmentKeys, setSelectedSegmentKeys,
    selectedCanalSegmentKeys, setSelectedCanalSegmentKeys,
    riverStyle, canalStyle,
    dataSource,
  } = useMapStore()

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

        <BrushRow
          label="River"
          color={riverStyle.color}
          active={riverEditMode}
          shortcut="1"
          showCog
          cogOpen={flyout === 'river'}
          onSelect={() => setActiveTool(riverEditMode ? { type: 'none' } : { type: 'river-paint' })}
          onCog={() => toggle('river')}
        />
        {riverEditMode && (
          <BrushRow
            label="— select"
            color={riverSelectMode ? riverStyle.color : t.inkFaint}
            active={riverSelectMode}
            onSelect={() => setActiveTool(riverSelectMode ? { type: 'river-paint' } : { type: 'river-select' })}
          />
        )}

        <TGap />

        <BrushRow
          label="Canal"
          color={canalStyle.color}
          active={canalEditMode}
          shortcut="2"
          showCog
          cogOpen={flyout === 'canal'}
          onSelect={() => setActiveTool(canalEditMode ? { type: 'none' } : { type: 'canal-paint' })}
          onCog={() => toggle('canal')}
        />
        {canalEditMode && (
          <BrushRow
            label="— select"
            color={canalSelectMode ? canalStyle.color : t.inkFaint}
            active={canalSelectMode}
            onSelect={() => setActiveTool(canalSelectMode ? { type: 'canal-paint' } : { type: 'canal-select' })}
          />
        )}

        <TGap />

        <BrushRow
          label="Lake"
          color={LAKE_COLOR}
          active={lakePaintMode}
          shortcut="3"
          showCog
          cogOpen={flyout === 'lake'}
          onSelect={() => setActiveTool(lakePaintMode ? { type: 'none' } : { type: 'lake' })}
          onCog={() => toggle('lake')}
        />

        <TGap />

        <BrushRow
          label="Edit nodes"
          color={riverNodeEditMode ? '#8ab8d8' : t.inkFaint}
          active={riverNodeEditMode}
          shortcut="4"
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
        <V2Divider label="Auto lakes" />
        <TriggerRow label="Auto lakes" active={flyout === 'auto-lakes'} onClick={() => toggle('auto-lakes')} />

        <TGap />
        <V2Divider label="Labels" />
        <TriggerRow label="Label Style" active={flyout === 'river-labels'} onClick={() => toggle('river-labels')} />

      </StripShell>

      {flyout === 'river'      && <RiverStyleFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'canal'      && <CanalStyleFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'lake'       && <LakeShapeFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 'osm'        && <OsmRiversFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 'auto-lakes'   && <AutoLakesFlyout   onClose={() => setFlyout(null)} />}
      {flyout === 'river-labels' && <RiverLabelFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 'segment'    && (
        <SegmentFlyout
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
