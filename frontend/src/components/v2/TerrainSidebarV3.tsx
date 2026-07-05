import React, { useEffect, useRef, useState } from 'react'
import { WorldCoverClassificationPanel } from '../WorldCoverClassificationPanel'
import { ImageClassificationPanel } from '../ImageClassificationPanel'
import {
  useMapStore, TERRAIN_COLORS, TERRAIN_PRIORITY, MANUAL_ONLY_TERRAINS,
  DEFAULT_TERRAIN_BLOB,
} from '../../store/mapStore'
import { BLOB_PRESETS, BLOB_PRESET_ORDER, type BlobPresetId, type BlobPresetValues } from '../../store/blobPresets'
import { PALETTE_TERRAIN_GROUPS } from '../../palettes'
import { AddTerrainFlyout } from '../AddTerrainFlyout'
import { useTheme } from '../../context/ThemeContext'
import { shouldSuppressShortcut } from '../../lib/keyboard'
import { liveClassParamsRef, requestDraw } from '../../lib/liveClassParamsRef'
import {
  BrushRow, ElevBrushRow, ToggleRow, ToggleSwitch, DashedAddBtn, MiniSlider, ColorChip, ColorPickerHost, tintBg,
  STRIP_W, FLYOUT_W, StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
  useDeferredSlider, SegmentedControl,
} from './sidebar'
import { TEXTURE_OPTIONS, TEXTURE_PATHS, DEFAULT_TERRAIN_TEXTURES } from '../../lib/terrainTextures'

// ── Constants ──────────────────────────────────────────────────────────────

const OSM_TERRAINS   = [...TERRAIN_PRIORITY].filter(t => !MANUAL_ONLY_TERRAINS.has(t))
const MANUAL_TERRAINS = [...TERRAIN_PRIORITY].filter(t => MANUAL_ONLY_TERRAINS.has(t))
const SLIDER_TERRAINS = [...TERRAIN_PRIORITY].filter(t => t !== 'clear' && !MANUAL_ONLY_TERRAINS.has(t))


const ELEV_BRUSHES: { brush: 'flat' | 'hills' | 'mountains'; tier: 0 | 1 | 2; color: string; key: string }[] = [
  { brush: 'flat',      tier: 0, color: '#8a9a7a', key: 'Q' },
  { brush: 'hills',     tier: 1, color: '#9a8a5a', key: 'W' },
  { brush: 'mountains', tier: 2, color: '#7a6a5a', key: 'E' },
]

const terrainLabel = (t: string) => t.replace(/_/g, ' ')

type FlyoutId =
  | 't-shape'
  | 't-import'
  | 't-opts'
  | 'e-import'
  | 'e-hillshade'
  | 'e-contours'
  | 't-terrain'
  | 'e-terrain'
  | 'e-slope'
  | null

// ── Flyout content: blob shape ──────────────────────────────────────────────

function BlobPresetChips({
  currentValues, onSelect,
}: {
  currentValues: BlobPresetValues | null
  onSelect: (id: BlobPresetId) => void
}) {
  const t = useTheme()
  const activePreset = currentValues == null ? null :
    BLOB_PRESET_ORDER.find(id => {
      const p = BLOB_PRESETS[id].values
      return (
        p.smooth === currentValues.smooth &&
        Math.abs(p.offset - currentValues.offset) < 0.001 &&
        Math.abs(p.bump - currentValues.bump) < 0.001 &&
        Math.abs(p.sweepFreq - currentValues.sweepFreq) < 0.001 &&
        Math.abs(p.lobeFreq - currentValues.lobeFreq) < 0.01 &&
        Math.abs(p.lobeAmp - currentValues.lobeAmp) < 0.001 &&
        Math.abs(p.lobeThreshold - currentValues.lobeThreshold) < 0.001 &&
        p.lobeDirection === currentValues.lobeDirection
      )
    }) ?? 'custom'

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 12px 6px' }}>
      {BLOB_PRESET_ORDER.map(id => {
        const active = activePreset === id
        return (
          <button key={id} onClick={() => onSelect(id)} style={{
            padding: '3px 7px',
            fontFamily: t.mono, fontSize: 9, letterSpacing: 0.4,
            background: active ? tintBg(t.rust, 0.15) : 'transparent',
            border: `1px solid ${active ? t.rust : t.line}`,
            color: active ? t.rust : t.inkMute,
            cursor: 'pointer', textTransform: 'uppercase',
          }}>
            {BLOB_PRESETS[id].label}
          </button>
        )
      })}
    </div>
  )
}

function ShapeSettingsFlyout({ onClose, usedAs }: { onClose: () => void; usedAs: Record<string, string> }) {
  const t = useTheme()
  const {
    terrainBlobSmooth, setTerrainBlobSmooth,
    terrainBlobOffset, setTerrainBlobOffset,
    terrainBlobBump, setTerrainBlobBump,
    terrainBlobSweepFreq, setTerrainBlobSweepFreq,
    terrainBlobLobeFreq, setTerrainBlobLobeFreq,
    terrainBlobLobeAmp, setTerrainBlobLobeAmp,
    terrainBlobLobeThreshold, setTerrainBlobLobeThreshold,
    terrainBlobLobeDirection, setTerrainBlobLobeDirection,
    terrainBlobTopoStyle, setTerrainBlobTopoStyle,
    terrainBlobClusterSize, setTerrainBlobClusterSize,
    terrainBlobSplatDensity, setTerrainBlobSplatDensity,
    terrainBlobSplatSize, setTerrainBlobSplatSize,
    terrainBlobOutlineEnabled, setTerrainBlobOutlineEnabled,
    terrainBlobOutlineColor, setTerrainBlobOutlineColor,
    terrainBlobOutlineWidth, setTerrainBlobOutlineWidth,
    edgeBlobWidth, setEdgeBlobWidth,
    edgeBlobBlend, setEdgeBlobBlend,
    applyTerrainBlobPreset,
  } = useMapStore()

  // All blob shape sliders trigger the full shapeTerrainBlobs pipeline — defer to drag end.
  const smoothSlider   = useDeferredSlider(terrainBlobSmooth,    setTerrainBlobSmooth)
  const bumpSlider     = useDeferredSlider(Math.round(terrainBlobBump * 100), v => setTerrainBlobBump(v / 100))
  const offsetSlider   = useDeferredSlider(Math.round(terrainBlobOffset * 100), v => setTerrainBlobOffset(v / 100))
  const fringeRef      = useRef(terrainBlobLobeAmp)
  const [fringeLocal, setFringeLocal] = useState(Math.round(terrainBlobLobeAmp * 100))
  useEffect(() => { setFringeLocal(Math.round(terrainBlobLobeAmp * 100)); fringeRef.current = terrainBlobLobeAmp }, [terrainBlobLobeAmp])
  const clusterSizeSlider  = useDeferredSlider(terrainBlobClusterSize, setTerrainBlobClusterSize)
  const splatDensitySlider = useDeferredSlider(Math.round(terrainBlobSplatDensity * 10), v => setTerrainBlobSplatDensity(v / 10))
  const splatSizeSlider    = useDeferredSlider(Math.round(terrainBlobSplatSize * 100),   v => setTerrainBlobSplatSize(v / 100))
  const topoSlider         = useDeferredSlider(Math.round(terrainBlobTopoStyle * 10),  v => setTerrainBlobTopoStyle(v / 10))

  const isModified =
    terrainBlobSmooth !== DEFAULT_TERRAIN_BLOB.smooth ||
    terrainBlobOffset !== DEFAULT_TERRAIN_BLOB.offset ||
    terrainBlobBump !== DEFAULT_TERRAIN_BLOB.bump ||
    terrainBlobSweepFreq !== DEFAULT_TERRAIN_BLOB.sweepFreq

  const handleReset = () => {
    setTerrainBlobSmooth(DEFAULT_TERRAIN_BLOB.smooth)
    setTerrainBlobOffset(DEFAULT_TERRAIN_BLOB.offset)
    setTerrainBlobBump(DEFAULT_TERRAIN_BLOB.bump)
    setTerrainBlobSweepFreq(DEFAULT_TERRAIN_BLOB.sweepFreq)
    setTerrainBlobLobeFreq(DEFAULT_TERRAIN_BLOB.lobeFreq)
    setTerrainBlobLobeAmp(DEFAULT_TERRAIN_BLOB.lobeAmp)
    setTerrainBlobLobeThreshold(DEFAULT_TERRAIN_BLOB.lobeThreshold)
    setTerrainBlobLobeDirection(DEFAULT_TERRAIN_BLOB.lobeDirection)
  }

  return (
    <FlyoutShell
      title="Default Shape"
      subtitle={isModified ? 'Modified from default' : 'Default for all terrain'}
      onClose={onClose}
    >
      <BlobPresetChips currentValues={{
        smooth: terrainBlobSmooth, offset: terrainBlobOffset, bump: terrainBlobBump,
        sweepFreq: terrainBlobSweepFreq, lobeFreq: terrainBlobLobeFreq,
        lobeAmp: terrainBlobLobeAmp, lobeThreshold: terrainBlobLobeThreshold,
        lobeDirection: terrainBlobLobeDirection,
      }} onSelect={id => applyTerrainBlobPreset(id)} />
      <MiniSlider label="Topo style"     display={topoSlider.value === 0 ? 'off' : `${Math.round(topoSlider.value) / 10}×`}                               value={topoSlider.value}      min={0}   max={30}  step={1}    onChange={topoSlider.onChange}         onDragEnd={topoSlider.onDragEnd}         accentColor={t.rust} />
      <MiniSlider label="Cluster size"   display={clusterSizeSlider.value === 0 ? 'off' : `${clusterSizeSlider.value} hexes`}                             value={clusterSizeSlider.value} min={0} max={20}  step={1}    onChange={clusterSizeSlider.onChange} onDragEnd={clusterSizeSlider.onDragEnd} accentColor={t.rust} />
      <MiniSlider label="Corner Rounding" display={Math.round(smoothSlider.value * 4) / 4}                                                                 value={smoothSlider.value}    min={0}   max={2}   step={0.25} onChange={smoothSlider.onChange}       onDragEnd={smoothSlider.onDragEnd}       accentColor={t.rust} />
      <MiniSlider label="Waviness"       display={`${bumpSlider.value}%`}                                                                                  value={bumpSlider.value}      min={0}   max={60}  step={1}    onChange={bumpSlider.onChange}         onDragEnd={bumpSlider.onDragEnd}         accentColor={t.rust} />
      <MiniSlider label="Inset"          display={`${offsetSlider.value > 0 ? '+' : ''}${offsetSlider.value}%`}                                            value={offsetSlider.value}    min={-80} max={30}  step={1}    onChange={offsetSlider.onChange}       onDragEnd={offsetSlider.onDragEnd}       accentColor={t.rust} />
      <MiniSlider label="Fringe" display={`${fringeLocal}%`} value={fringeLocal} min={0} max={100} step={1}
        onChange={v => { fringeRef.current = v / 100; setFringeLocal(v) }}
        onDragEnd={() => { const amp = fringeRef.current; setTerrainBlobLobeAmp(amp); setTerrainBlobLobeFreq(2.0 + amp * 3.0); setTerrainBlobLobeThreshold(0) }}
        accentColor={t.rust}
      />
      <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Splats</span>
        <ToggleSwitch enabled={terrainBlobSplatDensity > 0} onChange={on => setTerrainBlobSplatDensity(on ? 3 : 0)} />
      </div>
      {terrainBlobSplatDensity > 0 && <>
        <MiniSlider label="Satellites" display={`${Math.round(splatDensitySlider.value) / 10}`} value={splatDensitySlider.value} min={1} max={20} step={1} onChange={splatDensitySlider.onChange} onDragEnd={splatDensitySlider.onDragEnd} />
        <MiniSlider label="Sat. size"  display={`${splatSizeSlider.value}%`}                    value={splatSizeSlider.value}    min={10} max={80} step={5} onChange={splatSizeSlider.onChange}   onDragEnd={splatSizeSlider.onDragEnd} />
      </>}
      <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Blob outline</span>
        <ToggleSwitch enabled={terrainBlobOutlineEnabled} onChange={setTerrainBlobOutlineEnabled} />
      </div>
      {terrainBlobOutlineEnabled && <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint }}>Color</span>
          <ColorChip value={terrainBlobOutlineColor} onChange={setTerrainBlobOutlineColor} groups={PALETTE_TERRAIN_GROUPS} usedAs={usedAs} label="Outline color" />
        </div>
        <MiniSlider label="Width" display={`${terrainBlobOutlineWidth}px`} value={terrainBlobOutlineWidth} min={0.5} max={8} step={0.5} onChange={setTerrainBlobOutlineWidth} />
      </>}
      <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 2px' }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Edge blob</span>
      </div>
      <MiniSlider label="Default width" display={`${Math.round(edgeBlobWidth * 100)}%`} value={Math.round(edgeBlobWidth * 100)} min={5} max={80} step={1} onChange={v => setEdgeBlobWidth(v / 100)} />
      <MiniSlider label="Blend" display={`${edgeBlobBlend.toFixed(1)}×`} value={Math.round(edgeBlobBlend * 10)} min={10} max={40} step={1} onChange={v => setEdgeBlobBlend(v / 10)} />
      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={handleReset}
            style={{
              width: '100%', padding: '4px 0', background: 'none',
              border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer',
              fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5,
            }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ClassificationFlyout replaced by WorldCoverClassificationPanel (wider sidebar panel)

// ── Flyout content: painting options ───────────────────────────────────────

function PaintingOptionsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    realisticCoastline, setRealisticCoastline,
    terrainLayersEnabled, setTerrainLayersEnabled,
    beachStrip, setBeachStrip, beachColor, setBeachColor, beachWidth, setBeachWidth,
    coastlineDPEpsilon, setCoastlineDPEpsilon, coastlineChaikinPasses, setCoastlineChaikinPasses,
  } = useMapStore()
  const coastlineSimplifySlider = useDeferredSlider(coastlineDPEpsilon, setCoastlineDPEpsilon)
  const coastlineSmoothSlider   = useDeferredSlider(coastlineChaikinPasses, setCoastlineChaikinPasses)

  return (
    <FlyoutShell title="Painting Options" onClose={onClose}>
      <div style={{ padding: '4px 0' }}>
        <ToggleRow
          label="Background fringe"
          hint="Render background terrain blobs. Turn off to see foreground only."
          checked={terrainLayersEnabled}
          onChange={setTerrainLayersEnabled}
        />
      </div>
      <div style={{ borderTop: `1px solid ${t.line2}`, marginTop: 4, paddingTop: 4 }}>
        <div style={{ padding: '6px 12px 4px', fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
          Coastline
        </div>
        <ToggleRow
          label="Realistic coastline"
          hint="Wavy sea / land boundary."
          checked={realisticCoastline}
          onChange={setRealisticCoastline}
        />
        {realisticCoastline && (
          <>
            <MiniSlider label="Simplify" display={coastlineSimplifySlider.value} value={coastlineSimplifySlider.value} min={0} max={8} step={0.5} onChange={coastlineSimplifySlider.onChange} onDragEnd={coastlineSimplifySlider.onDragEnd} />
            <MiniSlider label="Smooth"   display={coastlineSmoothSlider.value}   value={coastlineSmoothSlider.value}   min={0} max={6} step={1}   onChange={coastlineSmoothSlider.onChange}   onDragEnd={coastlineSmoothSlider.onDragEnd} />
            <ToggleRow label="Beach strip" checked={beachStrip} onChange={setBeachStrip} />
            {beachStrip && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px' }}>
                  <span style={{ fontFamily: t.sans, fontSize: 11, color: t.ink2 }}>Color</span>
                  <input
                    type="color" value={beachColor}
                    onChange={e => setBeachColor(e.target.value)}
                    style={{ width: 26, height: 18, border: `1px solid ${t.line}`, background: 'none', cursor: 'pointer', padding: 0 }}
                  />
                  <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkMute }}>{beachColor}</span>
                </div>
                <MiniSlider label="Beach width" display={`${Math.round(beachWidth * 100)}%`} value={Math.round(beachWidth * 100)} min={1} max={25} step={1} onChange={v => setBeachWidth(v / 100)} />
              </>
            )}
          </>
        )}
      </div>
    </FlyoutShell>
  )
}

// ── Flyout content: elevation import / classify ────────────────────────────

function ElevationFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    generatedHexes,
    elevationStatus, elevationError, elevationProgress,
    showElevationDebug, setShowElevationDebug,
    classificationParams, setClassificationParam,
    fetchElevation, dataSource,
    elevationImportEnabled, setElevationImportEnabled,
    elevationOverridesTerrain, setElevationOverridesTerrain,
    setShowElevationClassOverlay,
  } = useMapStore()

  // Local state for sliders — updated live during drag, committed to store on mouseup
  const [localParams, setLocalParams] = useState(classificationParams)
  const localParamsRef = useRef(localParams)
  useEffect(() => {
    setLocalParams(classificationParams)
    localParamsRef.current = classificationParams
  }, [classificationParams])

  const handleParamChange = (key: keyof typeof classificationParams, v: number) => {
    const next = { ...localParamsRef.current, [key]: v }
    localParamsRef.current = next
    setLocalParams(next)
    liveClassParamsRef.current = next
    requestDraw.fn?.()
  }

  const commitParam = (key: keyof typeof classificationParams) => {
    setClassificationParam(key, localParamsRef.current[key])
    liveClassParamsRef.current = null
    setShowElevationClassOverlay(false)
  }

  const showOverlay = () => {
    liveClassParamsRef.current = localParamsRef.current
    setShowElevationClassOverlay(true)
  }
  const hideOverlay = () => setShowElevationClassOverlay(false)

  const hasData = generatedHexes.some(h => h.elevation_avg_m != null)
  const fetchedCount = generatedHexes.filter(h => h.elevation_avg_m != null).length
  const isLoading = elevationStatus === 'loading'
  const noHexes = generatedHexes.length === 0

  const flatCount      = hasData ? generatedHexes.filter(h => h.elevation_class === 'flat').length      : 0
  const hillsCount     = hasData ? generatedHexes.filter(h => h.elevation_class === 'hills').length     : 0
  const mountainsCount = hasData ? generatedHexes.filter(h => h.elevation_class === 'mountains').length : 0

  return (
    <FlyoutShell title="Elevation" subtitle={hasData ? `${fetchedCount} hexes fetched` : undefined} onClose={onClose}>
      {dataSource === 'osm' && (
        <div style={{ padding: '4px 12px 8px' }}>
          <div style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Step 1 — Fetch data
          </div>
          <button
            onClick={() => fetchElevation()}
            disabled={isLoading || noHexes}
            style={{
              width: '100%', padding: '5px 0', background: 'none',
              border: `1px solid ${isLoading ? t.line : t.rust}`,
              color: isLoading ? t.inkFaint : t.rust,
              cursor: isLoading || noHexes ? 'not-allowed' : 'pointer',
              fontFamily: t.mono, fontSize: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {isLoading ? 'Fetching…' : hasData ? '✓ Elevation fetched' : 'Fetch elevation data'}
          </button>
          {isLoading && elevationProgress && (
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 2, background: t.line2, marginBottom: 3 }}>
                <div style={{ height: '100%', background: t.rust, width: `${elevationProgress.progress}%`, transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 10, color: t.inkMute }}>{elevationProgress.message}</div>
            </div>
          )}
          {elevationStatus === 'error' && elevationError && (
            <div style={{ fontFamily: t.mono, fontSize: 10, color: '#9e5a5a', marginTop: 4 }}>{elevationError}</div>
          )}
        </div>
      )}

      {hasData && (
        <div style={{ borderTop: `1px solid ${t.line2}`, paddingTop: 4 }}>
          <div style={{ padding: '4px 12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
              Step 2 — Classify
            </div>
            <ToggleSwitch enabled={elevationImportEnabled} onChange={setElevationImportEnabled} />
          </div>
          <MiniSlider label="Hills Δ ≥" display={`${localParams.rangeHillsM}m`} value={localParams.rangeHillsM} min={10} max={500} step={10} onChange={v => handleParamChange('rangeHillsM', v)} accentColor='#9a8a5a' onDragStart={showOverlay} onDragEnd={() => commitParam('rangeHillsM')} />
          <MiniSlider label="Hills alt ≥" display={`${localParams.medianHillsM}m`} value={localParams.medianHillsM} min={0} max={2000} step={50} onChange={v => handleParamChange('medianHillsM', v)} accentColor='#9a8a5a' onDragStart={showOverlay} onDragEnd={() => commitParam('medianHillsM')} />
          <MiniSlider label="Mtns Δ ≥" display={`${localParams.rangeMountainsM}m`} value={localParams.rangeMountainsM} min={50} max={1000} step={25} onChange={v => handleParamChange('rangeMountainsM', v)} accentColor='#7a6a5a' onDragStart={showOverlay} onDragEnd={() => commitParam('rangeMountainsM')} />
          <MiniSlider label="Mtns alt ≥" display={`${localParams.medianMountainsM}m`} value={localParams.medianMountainsM} min={100} max={4000} step={50} onChange={v => handleParamChange('medianMountainsM', v)} accentColor='#7a6a5a' onDragStart={showOverlay} onDragEnd={() => commitParam('medianMountainsM')} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: '6px 12px 2px' }}>
            {[
              { label: 'Flat',  count: flatCount,      color: '#5a7a5a' },
              { label: 'Hills', count: hillsCount,     color: '#7a8a5a' },
              { label: 'Mtns',  count: mountainsCount, color: '#8a6a3a' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ background: t.paper2, padding: '4px 2px', textAlign: 'center' }}>
                <div style={{ fontFamily: t.mono, fontSize: 9, color, marginBottom: 1 }}>{label}</div>
                <div style={{ fontFamily: t.mono, fontSize: 9, color: t.inkMute }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasData && (
        <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 0' }}>
          <ToggleRow label="Elevation overrides terrain" checked={elevationOverridesTerrain} onChange={setElevationOverridesTerrain} />
          <ToggleRow label="Show avg / max per hex" checked={showElevationDebug} onChange={setShowElevationDebug} />
        </div>
      )}
    </FlyoutShell>
  )
}

// ── Shared sub-component: terrain + elevation-class visibility filter ────────

const ELEV_CLASS_LABELS = ['flat', 'hills', 'mountains'] as const

function TerrainVisibilityFilter({
  disabledTerrains,
  disabledElevClasses,
  onChangeTerrain,
  onChangeElevClass,
  customTerrains,
}: {
  disabledTerrains: string[]
  disabledElevClasses: string[]
  onChangeTerrain: (v: string[]) => void
  onChangeElevClass: (v: string[]) => void
  customTerrains: { id: string; name: string }[]
}) {
  const t = useTheme()
  const allTerrains = [...TERRAIN_PRIORITY, ...customTerrains.map(ct => ct.id)]
  const labelFor = (id: string) => {
    const ct = customTerrains.find(c => c.id === id)
    return ct ? ct.name : terrainLabel(id)
  }
  const toggleTerrain = (id: string, enabled: boolean) =>
    onChangeTerrain(enabled ? disabledTerrains.filter(t => t !== id) : [...disabledTerrains, id])
  const toggleElevClass = (cls: string, enabled: boolean) =>
    onChangeElevClass(enabled ? disabledElevClasses.filter(c => c !== cls) : [...disabledElevClasses, cls])

  return (
    <>
      <div style={{ borderTop: `1px solid ${t.line2}`, paddingTop: 4 }}>
        <div style={{ padding: '4px 12px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
          Show on terrains
        </div>
        {allTerrains.map(id => (
          <ToggleRow
            key={id}
            label={labelFor(id)}
            checked={!disabledTerrains.includes(id)}
            onChange={v => toggleTerrain(id, v)}
          />
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${t.line2}`, paddingTop: 4 }}>
        <div style={{ padding: '4px 12px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
          Show on elevation class
        </div>
        {ELEV_CLASS_LABELS.map(cls => (
          <ToggleRow
            key={cls}
            label={cls}
            checked={!disabledElevClasses.includes(cls)}
            onChange={v => toggleElevClass(cls, v)}
          />
        ))}
      </div>
    </>
  )
}

// ── Flyout content: hillshade ───────────────────────────────────────────────

function HilshadeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    hillshadeEnabled, setHillshadeEnabled,
    hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity, hillshadeMode,
    setHillshadeAzimuth, setHillshadeAltitude, setHillshadeIntensity, setHillshadeMode,
    hillshadeDisabledTerrains, hillshadeDisabledElevClasses,
    setHillshadeDisabledTerrains, setHillshadeDisabledElevClasses,
    customTerrains,
  } = useMapStore()

  return (
    <FlyoutShell title="Hillshade" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px 6px' }}>
        <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Enabled</span>
        <ToggleSwitch enabled={hillshadeEnabled} onChange={setHillshadeEnabled} />
      </div>
      {hillshadeEnabled && <>
        <ToggleRow label="Hard shadows" checked={hillshadeMode === 'hard'} onChange={v => setHillshadeMode(v ? 'hard' : 'smooth')} />
        <MiniSlider label="Sun azimuth"  display={`${hillshadeAzimuth}°`}        value={hillshadeAzimuth}  min={0} max={360} step={5}    onChange={setHillshadeAzimuth} />
        <MiniSlider label="Sun altitude" display={`${hillshadeAltitude}°`}       value={hillshadeAltitude} min={5} max={85}  step={5}    onChange={setHillshadeAltitude} />
        <MiniSlider label="Intensity"    display={hillshadeIntensity.toFixed(2)} value={hillshadeIntensity} min={0} max={1} step={0.05} onChange={setHillshadeIntensity} />
        <TerrainVisibilityFilter
          disabledTerrains={hillshadeDisabledTerrains}
          disabledElevClasses={hillshadeDisabledElevClasses}
          onChangeTerrain={setHillshadeDisabledTerrains}
          onChangeElevClass={setHillshadeDisabledElevClasses}
          customTerrains={customTerrains}
        />
      </>}
    </FlyoutShell>
  )
}

// ── Flyout content: contours ────────────────────────────────────────────────

function ContoursFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    contoursEnabled, contourInterval, contourLineWidth,
    contourOpacity, contourBaseElevation, contourSmoothPasses,
    contourIndexEvery, contourIndexWidthMult, contourColor,
    setContoursEnabled, setContourInterval, setContourLineWidth,
    setContourOpacity, setContourBaseElevation, setContourSmoothPasses,
    setContourIndexEvery, setContourIndexWidthMult, setContourColor,
    contourDisabledTerrains, contourDisabledElevClasses,
    setContourDisabledTerrains, setContourDisabledElevClasses,
    customTerrains,
  } = useMapStore()

  return (
    <FlyoutShell title="Contours" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px 6px' }}>
        <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Enabled</span>
        <ToggleSwitch enabled={contoursEnabled} onChange={setContoursEnabled} />
      </div>
      {contoursEnabled && (
        <>
          <MiniSlider label="Interval"        display={`${contourInterval}m`}          value={contourInterval}       min={10}  max={500} step={10}   onChange={setContourInterval} />
          <MiniSlider label="Base elev"       display={`${contourBaseElevation}m`}      value={contourBaseElevation}  min={-500} max={4000} step={10} onChange={setContourBaseElevation} />
          <MiniSlider label="Line width"      display={contourLineWidth.toFixed(2)}     value={contourLineWidth}      min={0.5} max={4}    step={0.25} onChange={setContourLineWidth} />
          <MiniSlider label="Opacity"         display={contourOpacity.toFixed(2)}       value={contourOpacity}        min={0.1} max={1}    step={0.05} onChange={setContourOpacity} />
          <MiniSlider label="Index every"     display={`${contourIndexEvery}`}          value={contourIndexEvery}     min={2}   max={10}   step={1}    onChange={setContourIndexEvery} />
          <MiniSlider label="Index width ×"   display={contourIndexWidthMult.toFixed(1)} value={contourIndexWidthMult} min={1}   max={4}    step={0.5}  onChange={setContourIndexWidthMult} />
          <MiniSlider label="Smooth passes"   display={`${contourSmoothPasses}`}        value={contourSmoothPasses}   min={0}   max={6}    step={1}    onChange={setContourSmoothPasses} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Color</span>
            <input type="color" value={contourColor} onChange={e => setContourColor(e.target.value)}
              style={{ width: 28, height: 18, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
          </div>
        </>
      )}
      <TerrainVisibilityFilter
        disabledTerrains={contourDisabledTerrains}
        disabledElevClasses={contourDisabledElevClasses}
        onChangeTerrain={setContourDisabledTerrains}
        onChangeElevClass={setContourDisabledElevClasses}
        customTerrains={customTerrains}
      />
    </FlyoutShell>
  )
}

// ── Flyout content: per-terrain settings ───────────────────────────────────

function TexturePickerPopover({
  options, selectedId, onSelect, anchorRef, onClose,
}: {
  options: typeof TEXTURE_OPTIONS
  selectedId: string
  onSelect: (id: string) => void
  anchorRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const tk = useTheme()
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const rect = anchorRef.current?.getBoundingClientRect()
  if (!rect) return null

  const popW = 204
  let left = rect.left
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8

  const spaceBelow = window.innerHeight - rect.bottom - 8
  const spaceAbove = rect.top - 8
  const above = spaceBelow < 180 && spaceAbove > spaceBelow
  const maxHeight = Math.min(above ? spaceAbove : spaceBelow, window.innerHeight - 16)

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        top: above ? rect.top - 4 : rect.bottom + 4,
        transform: above ? 'translateY(-100%)' : undefined,
        left,
        width: popW,
        maxHeight,
        overflowY: 'auto',
        background: tk.surface,
        border: `1px solid ${tk.line}`,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: 8,
        zIndex: 200,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        alignContent: 'start',
      }}
    >
      {options.map(({ id, label }) => {
        const selected = selectedId === id
        return (
          <div
            key={id}
            onClick={() => { onSelect(id); onClose() }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer', borderRadius: 4, padding: 3,
              border: selected ? `2px solid ${tk.accent ?? tk.ink}` : `2px solid transparent`,
              background: selected ? `${tk.accent ?? tk.ink}18` : 'transparent',
            }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 3, overflow: 'hidden', border: `1px solid ${tk.line}`, background: '#e8e0d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={TEXTURE_PATHS[id] ?? `/textures/${id}.png`} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', mixBlendMode: 'multiply', transform: 'scale(6)', transformOrigin: 'center' }} />
            </div>
            <span style={{ fontFamily: tk.mono, fontSize: 8, color: selected ? (tk.accent ?? tk.ink) : tk.ink2, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TerrainCogFlyout({ terrain, onClose, usedAs }: { terrain: string; onClose: () => void; usedAs: Record<string, string> }) {
  const tk = useTheme()
  const [texturePickerOpen, setTexturePickerOpen] = useState(false)
  const texturePickerAnchorRef = useRef<HTMLDivElement>(null)
  const {
    terrainColors, setTerrainColor,
    terrainTextureScales, setTerrainTextureScale,
    terrainTextureBlendModes, setTerrainTextureBlendMode,
    terrainTextureOpacities, setTerrainTextureOpacity,
    terrainTextureFile, setTerrainTextureFile,
    terrainTextureEnabled, setTerrainTextureEnabled,
    terrainTypeBlobStyles, setTerrainTypeBlobStyle,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq,
    terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
    terrainBlobClusterSize,
    terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth,
    edgeBlobWidth, edgeBlobBlend,
    activeTool, setActiveTool,
    blobMaskEdits, clearBlobMaskEdits,
  } = useMapStore()

  const color = terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888888'
  const hasDefaultTexture = terrain in DEFAULT_TERRAIN_TEXTURES
  const textureEnabled = terrain in terrainTextureEnabled ? terrainTextureEnabled[terrain] : hasDefaultTexture
  const hasExplicitFile = terrain in terrainTextureFile
  const textureFileId = hasExplicitFile ? (terrainTextureFile[terrain] ?? '') : (DEFAULT_TERRAIN_TEXTURES[terrain] ?? TEXTURE_OPTIONS[0].id)
  const textureScale = terrainTextureScales[terrain] ?? 3
  const textureBlendMode: GlobalCompositeOperation = terrainTextureBlendModes[terrain] ?? 'multiply'
  const textureOpacity = terrainTextureOpacities[terrain] ?? (terrain === 'clear' ? 0.3 : 0.6)

  const typeStyle = terrainTypeBlobStyles[terrain]
  const overrideEnabled = typeStyle?.enabled ?? false

  const storeSmooth        = overrideEnabled ? (typeStyle?.smooth        ?? terrainBlobSmooth)        : terrainBlobSmooth
  const storeOffset        = overrideEnabled ? (typeStyle?.offset        ?? terrainBlobOffset)        : terrainBlobOffset
  const storeBump          = overrideEnabled ? (typeStyle?.bump          ?? terrainBlobBump)          : terrainBlobBump
  const storeSweepFreq     = overrideEnabled ? (typeStyle?.sweepFreq     ?? terrainBlobSweepFreq)     : terrainBlobSweepFreq
  const storeLobeFreq      = overrideEnabled ? (typeStyle?.lobeFreq      ?? terrainBlobLobeFreq)      : terrainBlobLobeFreq
  const storeLobeAmp       = overrideEnabled ? (typeStyle?.lobeAmp       ?? terrainBlobLobeAmp)       : terrainBlobLobeAmp
  const storeLobeThreshold = overrideEnabled ? (typeStyle?.lobeThreshold ?? terrainBlobLobeThreshold) : terrainBlobLobeThreshold
  const storeLobeDirection = overrideEnabled ? (typeStyle?.lobeDirection ?? terrainBlobLobeDirection) : terrainBlobLobeDirection
  const storeClusterSize   = overrideEnabled ? (typeStyle?.clusterSize   ?? terrainBlobClusterSize)   : terrainBlobClusterSize
  // Per-terrain blob sliders trigger shapeTerrainBlobs on every store write — defer all to drag end.
  const cogSmoothSlider   = useDeferredSlider(storeSmooth,                    v => { if (overrideEnabled) setTerrainTypeBlobStyle(terrain, { smooth: v }) })
  const cogBumpSlider     = useDeferredSlider(Math.round(storeBump * 100),    v => { if (overrideEnabled) setTerrainTypeBlobStyle(terrain, { bump: v / 100 }) })
  const cogOffsetSlider      = useDeferredSlider(Math.round(storeOffset * 100),  v => { if (overrideEnabled) setTerrainTypeBlobStyle(terrain, { offset: v / 100 }) })
  const cogClusterSizeSlider = useDeferredSlider(storeClusterSize, v => { if (overrideEnabled) setTerrainTypeBlobStyle(terrain, { clusterSize: v }) })
  const texScaleSlider    = useDeferredSlider(Math.round(textureScale * 10),    v => setTerrainTextureScale(terrain, v / 10))
  const texOpacitySlider  = useDeferredSlider(Math.round(textureOpacity * 100), v => setTerrainTextureOpacity(terrain, v / 100))
  const cogFringeRef      = useRef(storeLobeAmp)
  const [cogFringeLocal, setCogFringeLocal] = useState(Math.round(storeLobeAmp * 100))
  useEffect(() => { setCogFringeLocal(Math.round(storeLobeAmp * 100)); cogFringeRef.current = storeLobeAmp }, [storeLobeAmp])

  const handleEnableToggle = (checked: boolean) => {
    if (checked) {
      const hasCustomValues = typeStyle != null && (
        typeStyle.smooth != null || typeStyle.offset != null || typeStyle.bump != null
      )
      setTerrainTypeBlobStyle(terrain, hasCustomValues ? { enabled: true } : {
        enabled: true,
        smooth: terrainBlobSmooth, offset: terrainBlobOffset, bump: terrainBlobBump,
        sweepFreq: terrainBlobSweepFreq, lobeFreq: terrainBlobLobeFreq,
        lobeAmp: terrainBlobLobeAmp, lobeThreshold: terrainBlobLobeThreshold,
        lobeDirection: terrainBlobLobeDirection,
      })
    } else {
      setTerrainTypeBlobStyle(terrain, { enabled: false })
    }
  }

  const applyBlobPreset = (id: BlobPresetId) => {
    const v = BLOB_PRESETS[id].values
    setTerrainTypeBlobStyle(terrain, { smooth: v.smooth, offset: v.offset, bump: v.bump, sweepFreq: v.sweepFreq, lobeFreq: v.lobeFreq, lobeAmp: v.lobeAmp, lobeThreshold: v.lobeThreshold, lobeDirection: v.lobeDirection })
  }

  const sectionLabel = (label: string) => (
    <div style={{ padding: '6px 12px 2px', fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>
      {label}
    </div>
  )

  return (
    <FlyoutShell
      title={terrainLabel(terrain)}
      subtitle={overrideEnabled ? 'Custom blob shape active' : 'Using default blob shape'}
      onClose={onClose}
    >
      {/* Color */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px' }}>
        {sectionLabel('Color')}
        <ColorChip value={color} onChange={v => setTerrainColor(terrain, v)} groups={PALETTE_TERRAIN_GROUPS} usedAs={usedAs} label="Terrain color" />
      </div>

      {/* Texture */}
      <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Texture</span>
          <ToggleSwitch enabled={textureEnabled} onChange={v => {
            setTerrainTextureEnabled(terrain, v)
            if (v && !(terrain in terrainTextureFile) && !hasDefaultTexture) setTerrainTextureFile(terrain, TEXTURE_OPTIONS[0].id)
          }} />
        </div>
        {textureEnabled && <div>
          <div
            ref={texturePickerAnchorRef}
            onClick={() => setTexturePickerOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2, flexShrink: 0, width: 96 }}>File</span>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              background: tk.surface, border: `1px solid ${tk.line}`, borderRadius: 2,
              padding: '2px 6px',
            }}>
              <div style={{ width: 16, height: 16, borderRadius: 2, overflow: 'hidden', background: '#e8e0d0', flexShrink: 0 }}>
                <img src={TEXTURE_PATHS[textureFileId] ?? `/textures/${textureFileId}.png`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', mixBlendMode: 'multiply' }} />
              </div>
              <span style={{ fontFamily: tk.mono, fontSize: 10, color: tk.ink, flex: 1 }}>
                {TEXTURE_OPTIONS.find(o => o.id === textureFileId)?.label ?? textureFileId}
              </span>
              <span style={{ fontFamily: tk.mono, fontSize: 9, color: tk.inkFaint }}>▾</span>
            </div>
          </div>
          {texturePickerOpen && (
            <TexturePickerPopover
              options={TEXTURE_OPTIONS}
              selectedId={textureFileId}
              onSelect={id => setTerrainTextureFile(terrain, id)}
              anchorRef={texturePickerAnchorRef}
              onClose={() => setTexturePickerOpen(false)}
            />
          )}
          <MiniSlider
            label="Scale"
            display={`${(texScaleSlider.value / 10).toFixed(1)}×`}
            value={texScaleSlider.value}
            min={5} max={100} step={1}
            onChange={texScaleSlider.onChange}
            onDragEnd={texScaleSlider.onDragEnd}
          />
          <MiniSlider
            label="Opacity"
            display={`${texOpacitySlider.value}%`}
            value={texOpacitySlider.value}
            min={0} max={100} step={1}
            onChange={texOpacitySlider.onChange}
            onDragEnd={texOpacitySlider.onDragEnd}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px' }}>
            <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2, flexShrink: 0, width: 96 }}>Mode</span>
            <select
              value={textureBlendMode}
              onChange={e => setTerrainTextureBlendMode(terrain, e.target.value as GlobalCompositeOperation | 'color' | 'color-bg')}
              style={{
                flex: 1, background: tk.surface, color: tk.ink,
                border: `1px solid ${tk.line}`, borderRadius: 2,
                fontFamily: tk.mono, fontSize: 10, padding: '2px 4px', cursor: 'pointer',
              }}
            >
              <option value="color">Marks</option>
              <option value="color-bg">Background</option>
              <option disabled>──────────</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
            </select>
          </div>
        </div>}
      </div>

      {/* Blob shape override */}
      <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Custom blob shape</span>
          <ToggleSwitch enabled={overrideEnabled} onChange={handleEnableToggle} />
        </div>
        {overrideEnabled && <div>
          <BlobPresetChips currentValues={{ smooth: storeSmooth, offset: storeOffset, bump: storeBump, sweepFreq: storeSweepFreq, lobeFreq: storeLobeFreq, lobeAmp: storeLobeAmp, lobeThreshold: storeLobeThreshold, lobeDirection: storeLobeDirection }} onSelect={applyBlobPreset} />
          <MiniSlider label="Corner Rounding" display={Math.round(cogSmoothSlider.value * 4) / 4}                                          value={cogSmoothSlider.value}    min={0}   max={2}   step={0.25} onChange={cogSmoothSlider.onChange}   onDragEnd={cogSmoothSlider.onDragEnd} />
          <MiniSlider label="Waviness"        display={`${cogBumpSlider.value}%`}                                                          value={cogBumpSlider.value}      min={0}   max={60}  step={1}    onChange={cogBumpSlider.onChange}     onDragEnd={cogBumpSlider.onDragEnd} />
          <MiniSlider label="Inset"           display={`${cogOffsetSlider.value > 0 ? '+' : ''}${cogOffsetSlider.value}%`}                value={cogOffsetSlider.value}    min={-80} max={30}  step={1}    onChange={cogOffsetSlider.onChange}   onDragEnd={cogOffsetSlider.onDragEnd} />
          <MiniSlider label="Fringe" display={`${cogFringeLocal}%`} value={cogFringeLocal} min={0} max={100} step={1}
            onChange={v => { cogFringeRef.current = v / 100; setCogFringeLocal(v) }}
            onDragEnd={() => { if (overrideEnabled) { const amp = cogFringeRef.current; setTerrainTypeBlobStyle(terrain, { lobeAmp: amp, lobeFreq: 2.0 + amp * 3.0, lobeThreshold: 0 }) } }}
          />
          <MiniSlider label="Cluster size" display={cogClusterSizeSlider.value === 0 ? 'off' : `${cogClusterSizeSlider.value} hexes`} value={cogClusterSizeSlider.value} min={0} max={20} step={1} onChange={cogClusterSizeSlider.onChange} onDragEnd={cogClusterSizeSlider.onDragEnd} />
          <div style={{ margin: '6px 12px 2px', borderTop: `1px solid ${tk.line2}`, paddingTop: 8 }}>
            <span style={{ fontFamily: tk.mono, fontSize: 9, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Edge painting</span>
          </div>
          <MiniSlider
            label="Width"
            display={typeStyle?.width != null ? `${Math.round(typeStyle.width * 100)}%` : 'default'}
            value={Math.round((typeStyle?.width ?? edgeBlobWidth) * 100)}
            min={5} max={80} step={1}
            onChange={v => setTerrainTypeBlobStyle(terrain, { width: v / 100 })}
          />
          <MiniSlider
            label="Blend"
            display={typeStyle?.blend != null ? `${typeStyle.blend.toFixed(1)}×` : 'default'}
            value={Math.round((typeStyle?.blend ?? edgeBlobBlend) * 10)}
            min={5} max={40} step={1}
            onChange={v => setTerrainTypeBlobStyle(terrain, { blend: v / 10 })}
          />
        </div>}
      </div>

      {/* Blob outline */}
      <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>Blob outline</span>
          <ToggleSwitch
            enabled={typeStyle?.outlineEnabled ?? terrainBlobOutlineEnabled}
            onChange={v => setTerrainTypeBlobStyle(terrain, { outlineEnabled: v })}
          />
        </div>
        {(typeStyle?.outlineEnabled ?? terrainBlobOutlineEnabled) && <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <span style={{ fontFamily: tk.mono, fontSize: 10, color: tk.inkFaint }}>Color</span>
            <ColorChip
              value={typeStyle?.outlineColor ?? terrainBlobOutlineColor}
              onChange={v => setTerrainTypeBlobStyle(terrain, { outlineColor: v })}
              groups={PALETTE_TERRAIN_GROUPS}
              usedAs={usedAs}
              label="Outline color"
            />
          </div>
          <MiniSlider
            label="Width"
            display={`${typeStyle?.outlineWidth ?? terrainBlobOutlineWidth}px`}
            value={typeStyle?.outlineWidth ?? terrainBlobOutlineWidth}
            min={0.5} max={8} step={0.5}
            onChange={v => setTerrainTypeBlobStyle(terrain, { outlineWidth: v })}
          />
        </>}
      </div>

      {/* Blob mask editing */}
      {(() => {
        const isMaskActive = activeTool.type === 'blob-mask' && (activeTool as Extract<typeof activeTool, { type: 'blob-mask' }>).terrain === terrain
        const activeMode = isMaskActive ? (activeTool as Extract<typeof activeTool, { type: 'blob-mask' }>).mode : null
        const editCount = blobMaskEdits.filter(e => e.terrain === terrain).length

        const activate = (mode: 'add' | 'subtract') => {
          if (isMaskActive && activeMode === mode) setActiveTool({ type: 'none' })
          else setActiveTool({ type: 'blob-mask', mode, terrain })
        }

        const btnStyle = (active: boolean, danger = false): React.CSSProperties => ({
          flex: 1, padding: '5px 0',
          fontFamily: tk.mono, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase',
          background: active ? (danger ? 'rgba(255,80,80,0.15)' : 'rgba(80,200,120,0.12)') : 'transparent',
          color: active ? (danger ? '#f88' : '#6da') : tk.inkMute,
          border: `1px solid ${active ? (danger ? '#f88' : '#6da') : tk.line}`,
          marginLeft: -1, cursor: 'pointer',
          position: 'relative', zIndex: active ? 1 : 0,
        })

        return (
          <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px' }}>
              <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Blob regions</span>
              {editCount > 0 && (
                <button onClick={() => clearBlobMaskEdits(terrain)} style={{
                  background: 'none', border: 'none', fontFamily: tk.mono, fontSize: 9,
                  color: tk.inkMute, cursor: 'pointer', padding: 0, letterSpacing: 0.3,
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = tk.rust)}
                  onMouseLeave={e => (e.currentTarget.style.color = tk.inkMute)}
                >
                  clear {editCount}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', margin: '0 12px 8px' }}>
              <button style={btnStyle(activeMode === 'add')} onClick={() => activate('add')}>+ Add</button>
              <button style={btnStyle(activeMode === 'subtract', true)} onClick={() => activate('subtract')}>− Subtract</button>
            </div>
            {isMaskActive && (
              <div style={{ padding: '0 12px 6px', fontFamily: tk.mono, fontSize: 9, color: tk.inkFaint, lineHeight: 1.5 }}>
                Draw a closed shape on the map{activeMode === 'subtract' ? ' to cut out' : ' to add'}.
              </div>
            )}
          </div>
        )
      })()}

    </FlyoutShell>
  )
}

// ── Flyout content: elevation class settings ────────────────────────────────

function ElevationCogFlyout({ cls, defaultColor, onClose, usedAs }: { cls: 'hills' | 'mountains'; defaultColor: string; onClose: () => void; usedAs: Record<string, string> }) {
  const tk = useTheme()
  const [texturePickerOpen, setTexturePickerOpen] = useState(false)
  const texturePickerAnchorRef = useRef<HTMLDivElement>(null)
  const {
    terrainColors, setTerrainColor,
    terrainTextureScales, setTerrainTextureScale,
    terrainTextureBlendModes, setTerrainTextureBlendMode,
    terrainTextureOpacities, setTerrainTextureOpacity,
    terrainTextureFile, setTerrainTextureFile,
    terrainTextureEnabled, setTerrainTextureEnabled,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq,
    terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
    terrainBlobClusterSize,
    terrainBlobOutlineEnabled, terrainBlobOutlineColor, terrainBlobOutlineWidth,
    elevationTypeBlobStyles, setElevationTypeBlobStyle,
    elevationHachureEnabled, setElevationHachureEnabled,
    elevationShadowEnabled, setElevationShadowEnabled,
    elevationShadowBl, setElevationShadowBl,
    elevationShadowOp, setElevationShadowOp,
    elevationShadowPs, setElevationShadowPs,
    elevationShadowColor, setElevationShadowColor,
  } = useMapStore()

  const color = terrainColors[cls] ?? defaultColor
  const textureEnabled = terrainTextureEnabled[cls] === true
  const textureFileId = terrainTextureFile[cls] ?? TEXTURE_OPTIONS[0].id
  const textureScale = terrainTextureScales[cls] ?? 3
  const textureBlendMode: GlobalCompositeOperation = terrainTextureBlendModes[cls] ?? 'multiply'
  const textureOpacity = terrainTextureOpacities[cls] ?? 0.5

  const typeStyle = elevationTypeBlobStyles[cls]
  const overrideEnabled = typeStyle?.enabled ?? false

  const storeSmooth        = overrideEnabled ? (typeStyle?.smooth        ?? terrainBlobSmooth)        : terrainBlobSmooth
  const storeOffset        = overrideEnabled ? (typeStyle?.offset        ?? terrainBlobOffset)        : terrainBlobOffset
  const storeBump          = overrideEnabled ? (typeStyle?.bump          ?? terrainBlobBump)          : terrainBlobBump
  const storeSweepFreq     = overrideEnabled ? (typeStyle?.sweepFreq     ?? terrainBlobSweepFreq)     : terrainBlobSweepFreq
  const storeLobeFreq      = overrideEnabled ? (typeStyle?.lobeFreq      ?? terrainBlobLobeFreq)      : terrainBlobLobeFreq
  const storeLobeAmp       = overrideEnabled ? (typeStyle?.lobeAmp       ?? terrainBlobLobeAmp)       : terrainBlobLobeAmp
  const storeLobeThreshold = overrideEnabled ? (typeStyle?.lobeThreshold ?? terrainBlobLobeThreshold) : terrainBlobLobeThreshold
  const storeLobeDirection = overrideEnabled ? (typeStyle?.lobeDirection ?? terrainBlobLobeDirection) : terrainBlobLobeDirection
  const storeClusterSize   = overrideEnabled ? (typeStyle?.clusterSize   ?? terrainBlobClusterSize)   : terrainBlobClusterSize
  const cogSmoothSlider       = useDeferredSlider(storeSmooth,                   v => { if (overrideEnabled) setElevationTypeBlobStyle(cls, { smooth: v }) })
  const cogBumpSlider         = useDeferredSlider(Math.round(storeBump * 100),   v => { if (overrideEnabled) setElevationTypeBlobStyle(cls, { bump: v / 100 }) })
  const cogOffsetSlider       = useDeferredSlider(Math.round(storeOffset * 100), v => { if (overrideEnabled) setElevationTypeBlobStyle(cls, { offset: v / 100 }) })
  const cogClusterSizeSlider  = useDeferredSlider(storeClusterSize,              v => { if (overrideEnabled) setElevationTypeBlobStyle(cls, { clusterSize: v }) })
  const texScaleSlider        = useDeferredSlider(Math.round(textureScale * 10),        v => setTerrainTextureScale(cls, v / 10))
  const texOpacitySlider      = useDeferredSlider(Math.round(textureOpacity * 100),     v => setTerrainTextureOpacity(cls, v / 100))
  const cogFringeRef = useRef(storeLobeAmp)
  const [cogFringeLocal, setCogFringeLocal] = useState(Math.round(storeLobeAmp * 100))
  useEffect(() => { setCogFringeLocal(Math.round(storeLobeAmp * 100)); cogFringeRef.current = storeLobeAmp }, [storeLobeAmp])

  const handleEnableToggle = (checked: boolean) => {
    if (checked) {
      setElevationTypeBlobStyle(cls, {
        enabled: true,
        smooth: terrainBlobSmooth, offset: terrainBlobOffset, bump: terrainBlobBump,
        sweepFreq: terrainBlobSweepFreq, lobeFreq: terrainBlobLobeFreq,
        lobeAmp: terrainBlobLobeAmp, lobeThreshold: terrainBlobLobeThreshold,
        lobeDirection: terrainBlobLobeDirection, clusterSize: terrainBlobClusterSize,
      })
    } else {
      setElevationTypeBlobStyle(cls, { enabled: false })
    }
  }

  const applyBlobPreset = (id: BlobPresetId) => {
    const v = BLOB_PRESETS[id].values
    setElevationTypeBlobStyle(cls, { smooth: v.smooth, offset: v.offset, bump: v.bump, sweepFreq: v.sweepFreq, lobeFreq: v.lobeFreq, lobeAmp: v.lobeAmp, lobeThreshold: v.lobeThreshold, lobeDirection: v.lobeDirection })
  }

  const sectionLabel = (label: string) => (
    <div style={{ padding: '6px 12px 2px', fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>
      {label}
    </div>
  )

  return (
    <FlyoutShell
      title={cls.charAt(0).toUpperCase() + cls.slice(1)}
      subtitle={overrideEnabled ? 'Custom blob shape active' : 'Using default blob shape'}
      onClose={onClose}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px' }}>
        {sectionLabel('Color')}
        <ColorChip value={color} onChange={v => setTerrainColor(cls, v)} groups={PALETTE_TERRAIN_GROUPS} usedAs={usedAs} label="Terrain color" />
      </div>

      <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Texture</span>
          <ToggleSwitch enabled={textureEnabled} onChange={v => {
            setTerrainTextureEnabled(cls, v)
            if (v && !(cls in terrainTextureFile)) setTerrainTextureFile(cls, TEXTURE_OPTIONS[0].id)
          }} />
        </div>
        {textureEnabled && (
          <div>
            <div
              ref={texturePickerAnchorRef}
              onClick={() => setTexturePickerOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2, flexShrink: 0, width: 96 }}>File</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: tk.surface, border: `1px solid ${tk.line}`, borderRadius: 2, padding: '2px 6px' }}>
                <div style={{ width: 16, height: 16, borderRadius: 2, overflow: 'hidden', background: '#e8e0d0', flexShrink: 0 }}>
                  <img src={TEXTURE_PATHS[textureFileId] ?? `/textures/${textureFileId}.png`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', mixBlendMode: 'multiply' }} />
                </div>
                <span style={{ fontFamily: tk.mono, fontSize: 10, color: tk.ink, flex: 1 }}>
                  {TEXTURE_OPTIONS.find(o => o.id === textureFileId)?.label ?? textureFileId}
                </span>
                <span style={{ fontFamily: tk.mono, fontSize: 9, color: tk.inkFaint }}>▾</span>
              </div>
            </div>
            {texturePickerOpen && (
              <TexturePickerPopover
                options={TEXTURE_OPTIONS}
                selectedId={textureFileId}
                onSelect={id => setTerrainTextureFile(cls, id)}
                anchorRef={texturePickerAnchorRef}
                onClose={() => setTexturePickerOpen(false)}
              />
            )}
            <MiniSlider label="Scale"   display={`${(texScaleSlider.value / 10).toFixed(1)}×`} value={texScaleSlider.value}   min={5} max={100} step={1} onChange={texScaleSlider.onChange}   onDragEnd={texScaleSlider.onDragEnd} />
            <MiniSlider label="Opacity" display={`${texOpacitySlider.value}%`}                 value={texOpacitySlider.value} min={0} max={100} step={1} onChange={texOpacitySlider.onChange} onDragEnd={texOpacitySlider.onDragEnd} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px' }}>
              <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2, flexShrink: 0, width: 96 }}>Mode</span>
              <select value={textureBlendMode} onChange={e => setTerrainTextureBlendMode(cls, e.target.value as GlobalCompositeOperation | 'color' | 'color-bg')}
                style={{ flex: 1, background: tk.surface, color: tk.ink, border: `1px solid ${tk.line}`, borderRadius: 2, fontFamily: tk.mono, fontSize: 10, padding: '2px 4px', cursor: 'pointer' }}>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Custom blob shape</span>
          <ToggleSwitch enabled={overrideEnabled} onChange={handleEnableToggle} />
        </div>
        {overrideEnabled && (
          <div>
            <BlobPresetChips currentValues={{ smooth: storeSmooth, offset: storeOffset, bump: storeBump, sweepFreq: storeSweepFreq, lobeFreq: storeLobeFreq, lobeAmp: storeLobeAmp, lobeThreshold: storeLobeThreshold, lobeDirection: storeLobeDirection }} onSelect={applyBlobPreset} />
            <MiniSlider label="Cluster size"    display={cogClusterSizeSlider.value === 0 ? 'off' : `${cogClusterSizeSlider.value} hexes`} value={cogClusterSizeSlider.value} min={0} max={20} step={1} onChange={cogClusterSizeSlider.onChange} onDragEnd={cogClusterSizeSlider.onDragEnd} />
            <MiniSlider label="Corner Rounding" display={cogSmoothSlider.value}                                                              value={cogSmoothSlider.value}      min={0} max={5}   step={1} onChange={cogSmoothSlider.onChange}        onDragEnd={cogSmoothSlider.onDragEnd} />
            <MiniSlider label="Waviness"        display={`${cogBumpSlider.value}%`}                                                          value={cogBumpSlider.value}        min={0} max={60}  step={1} onChange={cogBumpSlider.onChange}          onDragEnd={cogBumpSlider.onDragEnd} />
            <MiniSlider label="Inset"           display={`${cogOffsetSlider.value > 0 ? '+' : ''}${cogOffsetSlider.value}%`}                 value={cogOffsetSlider.value}      min={-80} max={30} step={1} onChange={cogOffsetSlider.onChange}       onDragEnd={cogOffsetSlider.onDragEnd} />
            <MiniSlider label="Fringe" display={`${cogFringeLocal}%`} value={cogFringeLocal} min={0} max={100} step={1}
              onChange={v => { cogFringeRef.current = v / 100; setCogFringeLocal(v) }}
              onDragEnd={() => { const amp = cogFringeRef.current; if (overrideEnabled) setElevationTypeBlobStyle(cls, { lobeAmp: amp, lobeFreq: 2.0 + amp * 3.0, lobeThreshold: 0 }) }}
            />
          </div>
        )}
      </div>

      {/* Blob outline */}
      <div style={{ borderTop: `1px solid ${tk.line2}`, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>Blob outline</span>
          <ToggleSwitch
            enabled={typeStyle?.outlineEnabled ?? terrainBlobOutlineEnabled}
            onChange={v => setElevationTypeBlobStyle(cls, { outlineEnabled: v })}
          />
        </div>
        {(typeStyle?.outlineEnabled ?? terrainBlobOutlineEnabled) && <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <span style={{ fontFamily: tk.mono, fontSize: 10, color: tk.inkFaint }}>Color</span>
            <ColorChip
              value={typeStyle?.outlineColor ?? terrainBlobOutlineColor}
              onChange={v => setElevationTypeBlobStyle(cls, { outlineColor: v })}
              groups={PALETTE_TERRAIN_GROUPS}
              usedAs={usedAs}
              label="Outline color"
            />
          </div>
          <MiniSlider
            label="Width"
            display={`${typeStyle?.outlineWidth ?? terrainBlobOutlineWidth}px`}
            value={typeStyle?.outlineWidth ?? terrainBlobOutlineWidth}
            min={0.5} max={8} step={0.5}
            onChange={v => setElevationTypeBlobStyle(cls, { outlineWidth: v })}
          />
        </>}
      </div>
      <div style={{ borderTop: `1px solid ${tk.line2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Hachure</span>
          <ToggleSwitch
            enabled={elevationHachureEnabled[cls] ?? false}
            onChange={v => setElevationHachureEnabled(cls, v)}
          />
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${tk.line2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Shadow</span>
          <ToggleSwitch
            enabled={elevationShadowEnabled[cls] ?? false}
            onChange={v => setElevationShadowEnabled(cls, v)}
          />
        </div>
        {(elevationShadowEnabled[cls] ?? false) && <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <span style={{ fontFamily: tk.mono, fontSize: 10, color: tk.inkFaint }}>Color</span>
            <ColorChip value={elevationShadowColor} onChange={setElevationShadowColor} groups={PALETTE_TERRAIN_GROUPS} usedAs={usedAs} label="Shadow color" />
          </div>
          <MiniSlider label="Blur" display={`${elevationShadowBl}`} value={elevationShadowBl} min={4} max={50} step={1} onChange={setElevationShadowBl} />
          <MiniSlider label="Opacity" display={`${elevationShadowOp}%`} value={elevationShadowOp} min={5} max={80} step={1} onChange={setElevationShadowOp} />
          <MiniSlider label="Passes" display={`${elevationShadowPs}`} value={elevationShadowPs} min={1} max={5} step={1} onChange={setElevationShadowPs} />
        </>}
      </div>
    </FlyoutShell>
  )
}

// ── Slope cog flyout ────────────────────────────────────────────────────────

function SlopeCogFlyout({ onClose, usedAs }: { onClose: () => void; usedAs: Record<string, string> }) {
  const tk = useTheme()
  const {
    slopeStyle, setSlopeStyle,
    slopeSmoothing, setSlopeSmoothing,
    slopeTickSpacing, setSlopeTickSpacing,
    slopeTickLength, setSlopeTickLength,
    elevationShadowBl, setElevationShadowBl,
    elevationShadowOp, setElevationShadowOp,
    elevationShadowPs, setElevationShadowPs,
    elevationShadowColor, setElevationShadowColor,
  } = useMapStore()

  const spacingSlider = useDeferredSlider(
    Math.round(slopeTickSpacing * 100),
    v => setSlopeTickSpacing(v / 100),
  )
  const lengthSlider = useDeferredSlider(
    Math.round(slopeTickLength * 100),
    v => setSlopeTickLength(v / 100),
  )

  const sectionLabel = (label: string) => (
    <div style={{ padding: '6px 12px 2px', fontFamily: tk.mono, fontSize: 8.5, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>
      {label}
    </div>
  )

  return (
    <FlyoutShell title="Slope" onClose={onClose}>
      {sectionLabel('Style')}
      <div style={{ padding: '4px 12px 10px' }}>
        <SegmentedControl
          options={[
            { value: 'hachure', label: 'Hachure' },
            { value: 'shading', label: 'Shading' },
            { value: 'contour', label: 'Contour' },
          ]}
          value={slopeStyle}
          onChange={setSlopeStyle}
        />
      </div>
      {slopeStyle === 'hachure' && <>
        <div style={{ borderTop: `1px solid ${tk.line2}` }}>
          {sectionLabel('Hachure')}
          <MiniSlider
            label="Spacing"
            display={`${spacingSlider.value}%`}
            value={spacingSlider.value}
            min={10} max={50} step={1}
            onChange={spacingSlider.onChange}
            onDragEnd={spacingSlider.onDragEnd}
          />
          <MiniSlider
            label="Length"
            display={`${lengthSlider.value}%`}
            value={lengthSlider.value}
            min={10} max={50} step={1}
            onChange={lengthSlider.onChange}
            onDragEnd={lengthSlider.onDragEnd}
          />
        </div>
      </>}
      <div style={{ borderTop: `1px solid ${tk.line2}` }}>
        {sectionLabel('Chain smoothing')}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 10px' }}>
          <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2 }}>Smooth connected edges</span>
          <ToggleSwitch enabled={slopeSmoothing} onChange={setSlopeSmoothing} />
        </div>
      </div>
      {slopeStyle === 'shading' && <div style={{ borderTop: `1px solid ${tk.line2}` }}>
        {sectionLabel('Shadow')}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
          <span style={{ fontFamily: tk.mono, fontSize: 10, color: tk.inkFaint }}>Color</span>
          <ColorChip value={elevationShadowColor} onChange={setElevationShadowColor} groups={PALETTE_TERRAIN_GROUPS} usedAs={usedAs} label="Shadow color" />
        </div>
        <MiniSlider label="Blur" display={`${elevationShadowBl}`} value={elevationShadowBl} min={4} max={50} step={1} onChange={setElevationShadowBl} />
        <MiniSlider label="Opacity" display={`${elevationShadowOp}%`} value={elevationShadowOp} min={5} max={80} step={1} onChange={setElevationShadowOp} />
        <MiniSlider label="Passes" display={`${elevationShadowPs}`} value={elevationShadowPs} min={1} max={5} step={1} onChange={setElevationShadowPs} />
      </div>}
    </FlyoutShell>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

const IMPORT_ICON = (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 1.5v5" /><path d="M2.5 4.5l2.5 2.5 2.5-2.5" /><path d="M1.5 8.5h7" />
  </svg>
)

export function TerrainSidebarV3() {
  const t = useTheme()
  const {
    terrainPaintMode, terrainPaintBrush,
    elevationPaintMode, elevationPaintBrush,
    activeTool, setActiveTool,
    terrainColors, customTerrains,
    terrainTypeBlobStyles,
    elevationTypeBlobStyles,
    mapStyle,
    heightmapUrl,
    elevationStatus,
    hillshadeEnabled,
    contoursEnabled,
    slopeStyle,
    dataSource,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutId>(null)
  const [cogTerrain, setCogTerrain] = useState<string | null>(null)
  const [cogElevBrush, setCogElevBrush] = useState<'hills' | 'mountains' | null>(null)
  const [addTerrainOpen, setAddTerrainOpen] = useState(false)
  const [addTerrainAnchorY, setAddTerrainAnchorY] = useState(0)

  const usedAs: Record<string, string> = {}
  const allTerrainEntries = [
    ...Object.entries(TERRAIN_COLORS).map(([k]) => ({ id: k, label: terrainLabel(k) })),
    ...customTerrains.map(ct => ({ id: ct.id, label: ct.name })),
  ]
  for (const { id, label } of allTerrainEntries) {
    const color = (terrainColors[id] ?? TERRAIN_COLORS[id] ?? '').toLowerCase()
    if (color) usedAs[color] = label
  }

  const toggleFlyout = (id: NonNullable<FlyoutId>) =>
    setFlyout(prev => prev === id ? null : id)

  const openCog = (terrain: string) => {
    setCogTerrain(terrain)
    setFlyout('t-terrain')
  }

  const openElevCog = (cls: 'hills' | 'mountains') => {
    if (flyout === 'e-terrain' && cogElevBrush === cls) { setFlyout(null); return }
    setCogElevBrush(cls)
    setFlyout('e-terrain')
  }

  const selectBrush = (terrain: string) => {
    if (terrainPaintMode && terrainPaintBrush === terrain) setActiveTool({ type: 'none' })
    else { setActiveTool({ type: 'terrain', brush: terrain }); setCogTerrain(terrain) }
  }

  const toggleElev = (brush: 'flat' | 'hills' | 'mountains') => {
    if (elevationPaintMode && elevationPaintBrush === brush) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'elevation', brush })
  }

  const colorFor = (t: string) => terrainColors[t] ?? TERRAIN_COLORS[t] ?? '#888'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (shouldSuppressShortcut(e)) return
      if (flyout) {
        if (e.key === 'Escape') setFlyout(null)
        return
      }
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TERRAIN_PRIORITY.length) selectBrush(TERRAIN_PRIORITY[idx])
      else if (e.key === 'Escape') setActiveTool({ type: 'none' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainPaintMode, terrainPaintBrush, flyout])

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
    <ColorPickerHost>

      {addTerrainOpen && (
        <AddTerrainFlyout
          anchorY={addTerrainAnchorY}
          onClose={() => setAddTerrainOpen(false)}
        />
      )}

      <StripShell>

        <V2Divider label="Terrain" />
        {[...OSM_TERRAINS, ...MANUAL_TERRAINS].map((t, idx) => (
          <BrushRow
            key={t}
            label={terrainLabel(t)}
            color={colorFor(t)}
            active={terrainPaintMode && terrainPaintBrush === t}
            shortcut={String(idx + 1)}
            showCog
            cogOpen={flyout === 't-terrain' && cogTerrain === t}
            customShape={terrainTypeBlobStyles[t]?.enabled === true}
            onSelect={() => selectBrush(t)}
            onCog={() => openCog(t)}
          />
        ))}
        {customTerrains.map(ct => (
          <BrushRow
            key={ct.id}
            label={ct.name}
            color={ct.color}
            active={terrainPaintMode && terrainPaintBrush === ct.id}
            showCog
            cogOpen={flyout === 't-terrain' && cogTerrain === ct.id}
            customShape={terrainTypeBlobStyles[ct.id]?.enabled === true}
            onSelect={() => selectBrush(ct.id)}
            onCog={() => openCog(ct.id)}
          />
        ))}
        <BrushRow
          label="Eraser"
          color="#cc4444"
          active={terrainPaintMode && terrainPaintBrush === 'eraser'}
          onSelect={() => selectBrush('eraser')}
        />
        <DashedAddBtn
          label="Add terrain"
          dataAttr="data-add-terrain-flyout"
          onClick={e => {
            setAddTerrainAnchorY(e.currentTarget.getBoundingClientRect().top)
            setAddTerrainOpen(o => !o)
          }}
        />
        <TGap />
        <TriggerRow label="Default shape" active={flyout === 't-shape'} onClick={() => toggleFlyout('t-shape')} />
        <TriggerRow label={dataSource === 'osm' ? 'WorldCover rules' : 'Image color rules'} active={flyout === 't-import'} onClick={() => toggleFlyout('t-import')} icon={IMPORT_ICON} />
        <TriggerRow label="Painting options" active={flyout === 't-opts'} onClick={() => toggleFlyout('t-opts')} />

        <V2Divider label="Elevation" />
        {ELEV_BRUSHES.map(({ brush, tier, color, key }) => {
          const displayColor = terrainColors[brush] ?? color
          const hasCog = brush !== 'flat'
          return (
            <ElevBrushRow
              key={brush}
              tier={tier}
              label={brush}
              color={displayColor}
              active={elevationPaintMode && elevationPaintBrush === brush}
              shortcut={key}
              showCog={hasCog}
              cogOpen={flyout === 'e-terrain' && cogElevBrush === brush}
              customShape={elevationTypeBlobStyles[brush]?.enabled === true}
              onSelect={() => toggleElev(brush)}
              onCog={hasCog ? () => openElevCog(brush as 'hills' | 'mountains') : undefined}
            />
          )
        })}
        <TGap />
        <ElevBrushRow
          tier={2}
          label="slope"
          color="#8a6a40"
          active={activeTool.type === 'slope'}
          shortcut="S"
          showCog
          cogOpen={flyout === 'e-slope'}
          customShape={slopeStyle !== 'hachure'}
          onSelect={() => activeTool.type === 'slope' ? setActiveTool({ type: 'none' }) : setActiveTool({ type: 'slope' })}
          onCog={() => toggleFlyout('e-slope')}
        />
        <TGap />
        <TriggerRow label="Import / classify" active={flyout === 'e-import'} onClick={() => toggleFlyout('e-import')} icon={IMPORT_ICON} />
        {(heightmapUrl || elevationStatus === 'done') && (
          <>
            <TriggerRow label="Hillshade" active={flyout === 'e-hillshade'} onClick={() => toggleFlyout('e-hillshade')} enabled={hillshadeEnabled} />
            <TriggerRow label="Contours"  active={flyout === 'e-contours'}  onClick={() => toggleFlyout('e-contours')}  enabled={contoursEnabled} />
          </>
        )}

        {mapStyle === 'historical_simple' && (
          <>
            <V2Divider label="Historical icons" />
            <div style={{ padding: '2px 10px 6px', fontFamily: t.mono, fontSize: 9, color: t.inkMute }}>
              PNG icons stamped in terrain blobs
            </div>
          </>
        )}

        <div style={{ height: 8 }} />
      </StripShell>

      {flyout === 't-shape'      && <ShapeSettingsFlyout      onClose={() => setFlyout(null)} usedAs={usedAs} />}
      {flyout === 't-import'     && (dataSource === 'osm'
        ? <WorldCoverClassificationPanel onClose={() => setFlyout(null)} />
        : <ImageClassificationPanel onClose={() => setFlyout(null)} />)}
      {flyout === 't-opts'       && <PaintingOptionsFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'e-import'     && <ElevationFlyout      onClose={() => setFlyout(null)} />}
      {flyout === 'e-hillshade'  && <HilshadeFlyout       onClose={() => setFlyout(null)} />}
      {flyout === 'e-contours'   && <ContoursFlyout       onClose={() => setFlyout(null)} />}
      {flyout === 't-terrain' && cogTerrain && (
        <TerrainCogFlyout key={cogTerrain} terrain={cogTerrain} onClose={() => setFlyout(null)} usedAs={usedAs} />
      )}
      {flyout === 'e-terrain' && cogElevBrush && (
        <ElevationCogFlyout
          cls={cogElevBrush}
          defaultColor={ELEV_BRUSHES.find(b => b.brush === cogElevBrush)?.color ?? '#888'}
          onClose={() => setFlyout(null)}
          usedAs={usedAs}
        />
      )}
      {flyout === 'e-slope' && <SlopeCogFlyout onClose={() => setFlyout(null)} usedAs={usedAs} />}

    </ColorPickerHost>
    </div>
  )
}
