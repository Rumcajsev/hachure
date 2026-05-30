import { useEffect, useRef, useState } from 'react'
import {
  useMapStore, TERRAIN_COLORS, TERRAIN_PRIORITY, MANUAL_ONLY_TERRAINS,
  DEFAULT_THRESHOLDS, DEFAULT_TERRAIN_BLOB,
} from '../../store/mapStore'
import { BLOB_PRESETS, BLOB_PRESET_ORDER, type BlobPresetId, type BlobPresetValues } from '../../store/blobPresets'
import { PALETTE_TERRAIN_GROUPS } from '../../palettes'
import { AddTerrainFlyout } from '../AddTerrainFlyout'
import { useTheme } from '../../context/ThemeContext'
import { shouldSuppressShortcut } from '../../lib/keyboard'
import {
  BrushRow, ElevBrushRow, ToggleRow, ToggleSwitch, DashedAddBtn, MiniSlider, BigColorSwatch, tintBg,
  STRIP_W, FLYOUT_W, StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
} from './sidebar'
import { TEXTURE_OPTIONS, DEFAULT_TERRAIN_TEXTURES } from '../../lib/terrainTextures'

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
  | 'blob-patches'
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

function ShapeSettingsFlyout({ onClose }: { onClose: () => void }) {
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
    terrainBlobClearingChance, setTerrainBlobClearingChance,
    terrainBlobSatelliteChance, setTerrainBlobSatelliteChance,
    terrainBlobPatchSize, setTerrainBlobPatchSize,
    applyTerrainBlobPreset,
  } = useMapStore()

  const storeValues: BlobPresetValues = {
    smooth: terrainBlobSmooth, offset: terrainBlobOffset, bump: terrainBlobBump,
    sweepFreq: terrainBlobSweepFreq, lobeFreq: terrainBlobLobeFreq,
    lobeAmp: terrainBlobLobeAmp, lobeThreshold: terrainBlobLobeThreshold,
    lobeDirection: terrainBlobLobeDirection,
    clearingChance: terrainBlobClearingChance,
    satelliteChance: terrainBlobSatelliteChance,
    patchSize: terrainBlobPatchSize,
  }

  const [local, setLocal] = useState<BlobPresetValues>(storeValues)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!draggingRef.current) setLocal(storeValues)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, Object.values(storeValues))

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const set = (field: keyof BlobPresetValues, val: number) => {
    setLocal(prev => ({ ...prev, [field]: val }))
    draggingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      draggingRef.current = false
      const setters: Record<string, (v: number) => void> = {
        smooth: setTerrainBlobSmooth, offset: setTerrainBlobOffset,
        bump: setTerrainBlobBump, sweepFreq: setTerrainBlobSweepFreq,
        lobeFreq: setTerrainBlobLobeFreq, lobeAmp: setTerrainBlobLobeAmp,
        lobeThreshold: setTerrainBlobLobeThreshold, lobeDirection: setTerrainBlobLobeDirection,
        clearingChance: setTerrainBlobClearingChance,
        satelliteChance: setTerrainBlobSatelliteChance,
        patchSize: setTerrainBlobPatchSize,
      }
      setters[field]?.(val)
    }, 150)
  }

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
    setTerrainBlobClearingChance(DEFAULT_TERRAIN_BLOB.clearingChance)
    setTerrainBlobSatelliteChance(DEFAULT_TERRAIN_BLOB.satelliteChance)
    setTerrainBlobPatchSize(DEFAULT_TERRAIN_BLOB.patchSize)
  }

  return (
    <FlyoutShell
      title="Shape Settings"
      subtitle={isModified ? 'Modified from default' : 'Default for all terrain'}
      onClose={onClose}
    >
      <BlobPresetChips currentValues={local} onSelect={id => {
        const values = BLOB_PRESETS[id].values
        applyTerrainBlobPreset(id)
        setLocal(prev => ({ ...prev, ...values }))
      }} />
      <MiniSlider label="Corner Rounding" display={local.smooth} value={local.smooth} min={0} max={5} step={1} onChange={v => set('smooth', v)} accentColor={t.rust} />
      <MiniSlider label="Waviness" display={`${Math.round(local.bump * 100)}%`} value={Math.round(local.bump * 100)} min={0} max={60} step={1} onChange={v => set('bump', v / 100)} accentColor={t.rust} />
      <MiniSlider label="Inset" display={`${local.offset > 0 ? '+' : ''}${Math.round(local.offset * 100)}%`} value={Math.round(local.offset * 100)} min={-80} max={30} step={1} onChange={v => set('offset', v / 100)} accentColor={t.rust} />
      <MiniSlider label="Wave Scale" display={local.sweepFreq.toFixed(2)} value={Math.round(local.sweepFreq * 100)} min={40} max={100} step={1} onChange={v => set('sweepFreq', v / 100)} accentColor={t.rust} />
      <div style={{ margin: '6px 12px 2px', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Fringe</span>
      </div>
      <MiniSlider label="Scale" display={local.lobeFreq.toFixed(1)} value={Math.round(local.lobeFreq * 10)} min={20} max={50} step={1} onChange={v => set('lobeFreq', v / 10)} />
      <MiniSlider label="Strength" display={`${Math.round(local.lobeAmp * 100)}%`} value={Math.round(local.lobeAmp * 100)} min={0} max={100} step={1} onChange={v => set('lobeAmp', v / 100)} />
      <MiniSlider label="Sparsity" display={`${Math.round(local.lobeThreshold * 100)}%`} value={Math.round(local.lobeThreshold * 100)} min={0} max={40} step={1} onChange={v => set('lobeThreshold', v / 100)} />
      <div style={{ margin: '6px 12px 2px', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Variation</span>
      </div>
      <MiniSlider label="Clearing Chance" display={`${Math.round(local.clearingChance * 100)}%`} value={Math.round(local.clearingChance * 100)} min={0} max={50} step={1} onChange={v => set('clearingChance', v / 100)} />
      <MiniSlider label="Scatter Chance" display={`${Math.round(local.satelliteChance * 100)}%`} value={Math.round(local.satelliteChance * 100)} min={0} max={50} step={1} onChange={v => set('satelliteChance', v / 100)} />
      <MiniSlider label="Patch Size" display={`${Math.round(local.patchSize * 100)}%`} value={Math.round(local.patchSize * 100)} min={5} max={50} step={1} onChange={v => set('patchSize', v / 100)} />
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

// ── Flyout content: classification (import) ─────────────────────────────────

function ClassificationFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { thresholds, setTerrainThreshold, disabledTerrains, toggleTerrainDisabled, terrainColors } = useMapStore()

  return (
    <FlyoutShell title="OSM Classification" subtitle="Terrain type likelihoods" onClose={onClose}>
      <div style={{ padding: '4px 0' }}>
        {SLIDER_TERRAINS.map(terrain => {
          const disabled = disabledTerrains.has(terrain)
          const value = thresholds[terrain] ?? DEFAULT_THRESHOLDS[terrain] ?? 0.25
          const color = terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888'
          return (
            <MiniSlider
              key={terrain}
              label={
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <button
                    onClick={e => { e.stopPropagation(); toggleTerrainDisabled(terrain) }}
                    title={disabled ? 'Enable' : 'Disable'}
                    style={{
                      width: 10, height: 10, flexShrink: 0, cursor: 'pointer', padding: 0,
                      background: disabled ? 'transparent' : color,
                      border: `1px solid ${disabled ? t.line : color}`,
                    }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{terrainLabel(terrain)}</span>
                </div>
              }
              display={`${Math.round(value * 100)}%`}
              value={Math.round(value * 100)}
              min={0} max={100} step={1}
              disabled={disabled}
              accentColor={disabled ? undefined : color}
              onChange={v => setTerrainThreshold(terrain, v / 100)}
            />
          )
        })}
      </div>
    </FlyoutShell>
  )
}

// ── Flyout content: painting options ───────────────────────────────────────

function PaintingOptionsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    terrainEdgePaintEnabled, setTerrainEdgePaintEnabled,
    realisticCoastline, setRealisticCoastline,
    terrainLayersEnabled, setTerrainLayersEnabled,
    beachStrip, setBeachStrip, beachColor, setBeachColor, beachWidth, setBeachWidth,
    coastlineDPEpsilon, setCoastlineDPEpsilon, coastlineChaikinPasses, setCoastlineChaikinPasses,
  } = useMapStore()

  return (
    <FlyoutShell title="Painting Options" onClose={onClose}>
      <div style={{ padding: '4px 0' }}>
        <ToggleRow
          label="Edge painting"
          hint="Drag along a region edge to paint a blob along it."
          checked={terrainEdgePaintEnabled}
          onChange={setTerrainEdgePaintEnabled}
        />
        <ToggleRow
          label="Terrain layers"
          hint="Render each terrain as its own texture layer."
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
            <MiniSlider label="Simplify" display={coastlineDPEpsilon} value={coastlineDPEpsilon} min={0} max={8} step={0.5} onChange={setCoastlineDPEpsilon} />
            <MiniSlider label="Smooth" display={coastlineChaikinPasses} value={coastlineChaikinPasses} min={0} max={6} step={1} onChange={setCoastlineChaikinPasses} />
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
  } = useMapStore()

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
          <div style={{ padding: '4px 12px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
            Step 2 — Classify
          </div>
          <MiniSlider label="Mountains %" display={`${classificationParams.mountainsPct}%`} value={classificationParams.mountainsPct} min={1} max={50} step={1} onChange={v => setClassificationParam('mountainsPct', v)} accentColor='#7a6a5a' />
          <MiniSlider label="Hills %" display={`${classificationParams.hillsPct}%`} value={classificationParams.hillsPct} min={1} max={60} step={1} onChange={v => setClassificationParam('hillsPct', v)} accentColor='#9a8a5a' />
          <MiniSlider label="Min ruggedness" display={`${classificationParams.rangeFloorM}m`} value={classificationParams.rangeFloorM} min={0} max={400} step={10} onChange={v => setClassificationParam('rangeFloorM', v)} />
          <MiniSlider label="Min altitude" display={`${classificationParams.medianFloorM}m`} value={classificationParams.medianFloorM} min={0} max={2000} step={50} onChange={v => setClassificationParam('medianFloorM', v)} />
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
  const {
    hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity,
    setHillshadeAzimuth, setHillshadeAltitude, setHillshadeIntensity,
    hillshadeDisabledTerrains, hillshadeDisabledElevClasses,
    setHillshadeDisabledTerrains, setHillshadeDisabledElevClasses,
    customTerrains,
  } = useMapStore()

  return (
    <FlyoutShell title="Hillshade" onClose={onClose}>
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
    </FlyoutShell>
  )
}

// ── Flyout content: contours ────────────────────────────────────────────────

function ContoursFlyout({ onClose }: { onClose: () => void }) {
  const {
    contoursEnabled, contourInterval, contourLineWidth,
    setContoursEnabled, setContourInterval, setContourLineWidth,
    contourDisabledTerrains, contourDisabledElevClasses,
    setContourDisabledTerrains, setContourDisabledElevClasses,
    customTerrains,
  } = useMapStore()

  return (
    <FlyoutShell title="Contours" onClose={onClose}>
      <ToggleRow label="Enabled" checked={contoursEnabled} onChange={setContoursEnabled} />
      {contoursEnabled && (
        <>
          <MiniSlider label="Interval"   display={`${contourInterval}m`}    value={contourInterval}  min={10} max={500} step={10}   onChange={setContourInterval} />
          <MiniSlider label="Line width" display={contourLineWidth.toFixed(2)} value={contourLineWidth} min={0.5} max={4} step={0.25} onChange={setContourLineWidth} />
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

type BlobLocal = {
  smooth: number; offset: number; bump: number; sweepFreq: number
  lobeFreq: number; lobeAmp: number; lobeThreshold: number; lobeDirection: number
}

function TerrainCogFlyout({ terrain, onClose }: { terrain: string; onClose: () => void }) {
  const tk = useTheme()
  const {
    terrainColors, setTerrainColor,
    terrainTextureScales, setTerrainTextureScale,
    terrainTextureBlendModes, setTerrainTextureBlendMode,
    terrainTextureOpacities, setTerrainTextureOpacity,
    terrainTextureFillOnly, setTerrainTextureFillOnly,
    terrainTextureFile, setTerrainTextureFile,
    terrainTextureEnabled, setTerrainTextureEnabled,
    terrainTypeBlobStyles, setTerrainTypeBlobStyle,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump, terrainBlobSweepFreq,
    terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
  } = useMapStore()

  const color = terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888888'
  const hasDefaultTexture = terrain in DEFAULT_TERRAIN_TEXTURES
  const textureEnabled = terrain in terrainTextureEnabled ? terrainTextureEnabled[terrain] : hasDefaultTexture
  const hasExplicitFile = terrain in terrainTextureFile
  const textureFileId = hasExplicitFile ? (terrainTextureFile[terrain] ?? '') : (DEFAULT_TERRAIN_TEXTURES[terrain] ?? TEXTURE_OPTIONS[0].id)
  const textureScale = terrainTextureScales[terrain] ?? 3
  const textureBlendMode: GlobalCompositeOperation = terrainTextureBlendModes[terrain] ?? 'multiply'
  const textureOpacity = terrainTextureOpacities[terrain] ?? (terrain === 'clear' ? 0.3 : 0.6)
  const fillOnly = terrainTextureFillOnly[terrain] ?? false

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

  const [local, setLocalBlob] = useState<BlobLocal>({
    smooth: storeSmooth, offset: storeOffset, bump: storeBump, sweepFreq: storeSweepFreq,
    lobeFreq: storeLobeFreq, lobeAmp: storeLobeAmp, lobeThreshold: storeLobeThreshold, lobeDirection: storeLobeDirection,
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!draggingRef.current) setLocalBlob({
      smooth: storeSmooth, offset: storeOffset, bump: storeBump, sweepFreq: storeSweepFreq,
      lobeFreq: storeLobeFreq, lobeAmp: storeLobeAmp, lobeThreshold: storeLobeThreshold, lobeDirection: storeLobeDirection,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSmooth, storeOffset, storeBump, storeSweepFreq, storeLobeFreq, storeLobeAmp, storeLobeThreshold, storeLobeDirection])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const setBlob = (field: keyof BlobLocal, val: number) => {
    setLocalBlob(prev => ({ ...prev, [field]: val }))
    draggingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      draggingRef.current = false
      if (overrideEnabled) setTerrainTypeBlobStyle(terrain, { [field]: val })
    }, 150)
  }

  const handleEnableToggle = (checked: boolean) => {
    if (checked) {
      setTerrainTypeBlobStyle(terrain, {
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
    setLocalBlob({ smooth: v.smooth, offset: v.offset, bump: v.bump, sweepFreq: v.sweepFreq, lobeFreq: v.lobeFreq, lobeAmp: v.lobeAmp, lobeThreshold: v.lobeThreshold, lobeDirection: v.lobeDirection })
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
      {sectionLabel('Color')}
      <BigColorSwatch value={color} onChange={v => setTerrainColor(terrain, v)} groups={PALETTE_TERRAIN_GROUPS} />

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px' }}>
            <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2, flexShrink: 0, width: 96 }}>File</span>
            <select
              value={textureFileId}
              onChange={e => setTerrainTextureFile(terrain, e.target.value)}
              style={{
                flex: 1, background: tk.surface, color: tk.ink,
                border: `1px solid ${tk.line}`, borderRadius: 2,
                fontFamily: tk.mono, fontSize: 10, padding: '2px 4px', cursor: 'pointer',
              }}
            >
              {TEXTURE_OPTIONS.map(({ id, label }) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px' }}>
            <span style={{ fontFamily: tk.sans, fontSize: 11, color: tk.ink2 }}>Texture only</span>
            <ToggleSwitch enabled={fillOnly} onChange={v => setTerrainTextureFillOnly(terrain, v)} />
          </div>
          <MiniSlider
            label="Scale"
            display={`${textureScale.toFixed(1)}×`}
            value={Math.round(textureScale * 10)}
            min={5} max={80} step={1}
            onChange={v => setTerrainTextureScale(terrain, v / 10)}
          />
          <MiniSlider
            label="Opacity"
            display={`${Math.round(textureOpacity * 100)}%`}
            value={Math.round(textureOpacity * 100)}
            min={0} max={100} step={1}
            onChange={v => setTerrainTextureOpacity(terrain, v / 100)}
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
              <option value="overlay">Overlay</option>
              <option value="screen">Screen</option>
              <option value="darken">Darken</option>
              <option value="soft-light">Soft Light</option>
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
          <BlobPresetChips currentValues={local} onSelect={applyBlobPreset} />
          <MiniSlider label="Corner Rounding" display={local.smooth} value={local.smooth} min={0} max={5} step={1} onChange={v => setBlob('smooth', v)} />
          <MiniSlider label="Waviness" display={`${Math.round(local.bump * 100)}%`} value={Math.round(local.bump * 100)} min={0} max={60} step={1} onChange={v => setBlob('bump', v / 100)} />
          <MiniSlider label="Inset" display={`${local.offset > 0 ? '+' : ''}${Math.round(local.offset * 100)}%`} value={Math.round(local.offset * 100)} min={-80} max={30} step={1} onChange={v => setBlob('offset', v / 100)} />
          <MiniSlider label="Wave Scale" display={local.sweepFreq.toFixed(2)} value={Math.round(local.sweepFreq * 100)} min={40} max={100} step={1} onChange={v => setBlob('sweepFreq', v / 100)} />
          <div style={{ margin: '6px 12px 2px', borderTop: `1px solid ${tk.line2}`, paddingTop: 8 }}>
            <span style={{ fontFamily: tk.mono, fontSize: 9, letterSpacing: 0.8, color: tk.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Fringe</span>
          </div>
          <MiniSlider label="Scale" display={local.lobeFreq.toFixed(1)} value={Math.round(local.lobeFreq * 10)} min={20} max={50} step={1} onChange={v => setBlob('lobeFreq', v / 10)} />
          <MiniSlider label="Strength" display={`${Math.round(local.lobeAmp * 100)}%`} value={Math.round(local.lobeAmp * 100)} min={0} max={100} step={1} onChange={v => setBlob('lobeAmp', v / 100)} />
          <MiniSlider label="Sparsity" display={`${Math.round(local.lobeThreshold * 100)}%`} value={Math.round(local.lobeThreshold * 100)} min={0} max={40} step={1} onChange={v => setBlob('lobeThreshold', v / 100)} />
        </div>}
      </div>
    </FlyoutShell>
  )
}

// ── BlobEditFlyout ───────────────────────────────────────────────────────────

function BlobEditFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { blobPatches, deleteBlobPatch, terrainColors, activeTool, setActiveTool } = useMapStore()

  return (
    <FlyoutShell title="Blob Edit" onClose={onClose}>
      <div style={{ padding: '6px 12px 4px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint, lineHeight: 1.5 }}>
        Draw freehand shapes to extend or cut terrain blobs.
        {activeTool.type === 'blob-draw' && (
          <span style={{ color: activeTool.mode === 'add' ? '#4a9a5a' : '#c04040' }}>
            {' '}Click and drag to draw. Release to smooth — click or Enter to commit, Escape to cancel.
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, padding: '2px 12px 8px' }}>
        <button
          onClick={() => setActiveTool(activeTool.type === 'blob-draw' && activeTool.mode === 'add' ? { type: 'none' } : { type: 'blob-draw', mode: 'add' })}
          style={{
            flex: 1, padding: '5px 0', fontFamily: t.mono, fontSize: 9.5, letterSpacing: 0.3,
            border: `1px solid ${activeTool.type === 'blob-draw' && activeTool.mode === 'add' ? '#4a9a5a' : t.line}`,
            borderRadius: 4, cursor: 'pointer',
            background: activeTool.type === 'blob-draw' && activeTool.mode === 'add' ? 'rgba(74,154,90,0.15)' : t.surface,
            color: activeTool.type === 'blob-draw' && activeTool.mode === 'add' ? '#4a9a5a' : t.inkMute,
          }}
        >
          + Add
        </button>
        <button
          onClick={() => setActiveTool(activeTool.type === 'blob-draw' && activeTool.mode === 'cut' ? { type: 'none' } : { type: 'blob-draw', mode: 'cut' })}
          style={{
            flex: 1, padding: '5px 0', fontFamily: t.mono, fontSize: 9.5, letterSpacing: 0.3,
            border: `1px solid ${activeTool.type === 'blob-draw' && activeTool.mode === 'cut' ? '#c04040' : t.line}`,
            borderRadius: 4, cursor: 'pointer',
            background: activeTool.type === 'blob-draw' && activeTool.mode === 'cut' ? 'rgba(192,64,64,0.15)' : t.surface,
            color: activeTool.type === 'blob-draw' && activeTool.mode === 'cut' ? '#c04040' : t.inkMute,
          }}
        >
          ✂ Cut
        </button>
      </div>
      {blobPatches.length === 0 ? (
        <div style={{ padding: '4px 12px 8px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}>
          No patches yet.
        </div>
      ) : (
        <div style={{ padding: '0 12px 8px' }}>
          {blobPatches.map(patch => (
            <div key={patch.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
              borderTop: `1px solid ${t.line2}`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: terrainColors[patch.terrain] ?? TERRAIN_COLORS[patch.terrain] ?? '#888', flexShrink: 0 }} />
              <span style={{ fontFamily: t.mono, fontSize: 9, color: t.ink2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {patch.mode === 'cut' ? '✂ ' : '+ '}{patch.terrain.replace(/_/g, ' ')}
              </span>
              <button
                onClick={() => deleteBlobPatch(patch.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: t.mono, fontSize: 11, color: t.inkFaint, lineHeight: 1 }}
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
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
    mapStyle,
    blobPatches,
    heightmapUrl,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutId>(null)
  const [cogTerrain, setCogTerrain] = useState<string | null>(null)
  const [addTerrainOpen, setAddTerrainOpen] = useState(false)
  const [addTerrainAnchorY, setAddTerrainAnchorY] = useState(0)

  const toggleFlyout = (id: NonNullable<FlyoutId>) =>
    setFlyout(prev => prev === id ? null : id)

  const openCog = (terrain: string) => {
    setCogTerrain(terrain)
    setFlyout('t-terrain')
  }

  const selectBrush = (terrain: string) => {
    if (terrainPaintMode && terrainPaintBrush === terrain) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'terrain', brush: terrain })
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

      {addTerrainOpen && (
        <AddTerrainFlyout
          anchorY={addTerrainAnchorY}
          onClose={() => setAddTerrainOpen(false)}
        />
      )}

      <StripShell>

        <V2Divider label="Terrain · imported" />
        {OSM_TERRAINS.map((t, idx) => (
          <BrushRow
            key={t}
            label={terrainLabel(t)}
            color={colorFor(t)}
            active={terrainPaintMode && terrainPaintBrush === t}
            shortcut={String(idx + 1)}
            showCog
            cogOpen={flyout === 't-terrain' && cogTerrain === t}
            onSelect={() => selectBrush(t)}
            onCog={() => openCog(t)}
          />
        ))}
        <TGap />
        <TriggerRow label="Shape settings" active={flyout === 't-shape'} onClick={() => toggleFlyout('t-shape')} />
        <TriggerRow label="Import / classify" active={flyout === 't-import'} onClick={() => toggleFlyout('t-import')} icon={IMPORT_ICON} />
        <TriggerRow label="Painting options" active={flyout === 't-opts'} onClick={() => toggleFlyout('t-opts')} />

        <V2Divider label="Terrain · manual" />
        {MANUAL_TERRAINS.map((t, idx) => (
          <BrushRow
            key={t}
            label={terrainLabel(t)}
            color={colorFor(t)}
            active={terrainPaintMode && terrainPaintBrush === t}
            shortcut={String(OSM_TERRAINS.length + idx + 1)}
            showCog
            cogOpen={flyout === 't-terrain' && cogTerrain === t}
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
            onSelect={() => selectBrush(ct.id)}
            onCog={() => openCog(ct.id)}
          />
        ))}
        <DashedAddBtn
          label="Add terrain"
          dataAttr="data-add-terrain-flyout"
          onClick={e => {
            setAddTerrainAnchorY(e.currentTarget.getBoundingClientRect().top)
            setAddTerrainOpen(o => !o)
          }}
        />

        <V2Divider label="Elevation" />
        {ELEV_BRUSHES.map(({ brush, tier, color, key }) => (
          <ElevBrushRow
            key={brush}
            tier={tier}
            label={brush}
            color={color}
            active={elevationPaintMode && elevationPaintBrush === brush}
            shortcut={key}
            onSelect={() => toggleElev(brush)}
          />
        ))}
        <TGap />
        <TriggerRow label="Import / classify" active={flyout === 'e-import'} onClick={() => toggleFlyout('e-import')} icon={IMPORT_ICON} />
        {heightmapUrl && (
          <>
            <TriggerRow label="Hillshade" active={flyout === 'e-hillshade'} onClick={() => toggleFlyout('e-hillshade')} />
            <TriggerRow label="Contours"  active={flyout === 'e-contours'}  onClick={() => toggleFlyout('e-contours')} />
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

        <V2Divider label="Blob edit" />
        <TriggerRow
          label={`Edit blobs${blobPatches.length > 0 ? ` · ${blobPatches.length}` : ''}`}
          active={flyout === 'blob-patches' || activeTool.type === 'blob-draw'}
          onClick={() => toggleFlyout('blob-patches')}
        />

        <div style={{ height: 8 }} />
      </StripShell>

      {flyout === 't-shape'      && <ShapeSettingsFlyout  onClose={() => setFlyout(null)} />}
      {flyout === 't-import'     && <ClassificationFlyout onClose={() => setFlyout(null)} />}
      {flyout === 't-opts'       && <PaintingOptionsFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'e-import'     && <ElevationFlyout      onClose={() => setFlyout(null)} />}
      {flyout === 'e-hillshade'  && <HilshadeFlyout       onClose={() => setFlyout(null)} />}
      {flyout === 'e-contours'   && <ContoursFlyout       onClose={() => setFlyout(null)} />}
      {flyout === 'blob-patches' && <BlobEditFlyout       onClose={() => { setFlyout(null); setActiveTool({ type: 'none' }) }} />}
      {flyout === 't-terrain' && cogTerrain && (
        <TerrainCogFlyout terrain={cogTerrain} onClose={() => setFlyout(null)} />
      )}

    </div>
  )
}
