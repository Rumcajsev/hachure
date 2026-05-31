import { useEffect, useRef, useState } from 'react'
import {
  useMapStore, TERRAIN_COLORS, TERRAIN_PRIORITY, MANUAL_ONLY_TERRAINS,
  DEFAULT_THRESHOLDS, DEFAULT_TERRAIN_BLOB,
} from '../../store/mapStore'
import { BLOB_PRESETS, BLOB_PRESET_ORDER, type BlobPresetId, type BlobPresetValues } from '../../store/blobPresets'
import { PALETTE_TERRAIN_GROUPS } from '../../palettes'
import { AddTerrainFlyout } from '../AddTerrainFlyout'
import { TK } from '../../theme'
import { HISTORICAL_ICON_TERRAIN_DEFAULTS } from '../../lib/drawHistoricalIcons'
import {
  SidebarShell, SidebarHeader, SidebarSection, SidebarDetailHeader, DetailSection, DetailViewShell,
  BrushRow, ElevBrushRow, ToggleRow, FlyoutBtn, DashedAddBtn, SectionDivider, MiniSlider, BigColorSwatch, tintBg,
} from './sidebar'
import { shouldSuppressShortcut } from '../../lib/keyboard'

const OSM_TERRAINS  = [...TERRAIN_PRIORITY].filter(t => !MANUAL_ONLY_TERRAINS.has(t))
const MANUAL_TERRAINS = [...TERRAIN_PRIORITY].filter(t => MANUAL_ONLY_TERRAINS.has(t))
const SLIDER_TERRAINS = [...TERRAIN_PRIORITY].filter(t => t !== 'clear' && !MANUAL_ONLY_TERRAINS.has(t))
const TEXTURED_TERRAINS = new Set(['clear', 'woods', 'light_woods', 'beach'])

const ELEV_BRUSHES: { brush: 'flat' | 'hills' | 'mountains'; tier: 0 | 1 | 2; color: string; key: string }[] = [
  { brush: 'flat',      tier: 0, color: '#8a9a7a', key: 'Q' },
  { brush: 'hills',     tier: 1, color: '#9a8a5a', key: 'W' },
  { brush: 'mountains', tier: 2, color: '#7a6a5a', key: 'E' },
]

const terrainLabel = (t: string) => t.replace(/_/g, ' ')

type ViewId = 'list' | 'terrain-settings' | 'brush' | 'classification' | 'edge-blob' | 'coastline' | 'elevation' | 'historical-icons'

// ── BlobPresetChips ───────────────────────────────────────────────────────────

function BlobPresetChips({
  currentValues,
  onSelect,
}: {
  currentValues: BlobPresetValues | null
  onSelect: (id: BlobPresetId) => void
}) {
  const activePreset: BlobPresetId | 'custom' | null = currentValues == null
    ? null
    : BLOB_PRESET_ORDER.find(id => {
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 14px 8px' }}>
      {BLOB_PRESET_ORDER.map(id => {
        const active = activePreset === id
        return (
          <button key={id} onClick={() => onSelect(id)} style={{
            padding: '3px 8px',
            fontFamily: TK.mono, fontSize: 9.5, letterSpacing: 0.4,
            background: active ? tintBg(TK.rust, 0.15) : 'transparent',
            border: `1px solid ${active ? TK.rust : TK.line}`,
            color: active ? TK.rust : TK.inkMute,
            cursor: 'pointer',
            textTransform: 'uppercase' as const,
          }}>
            {BLOB_PRESETS[id].label}
          </button>
        )
      })}
      <button style={{
        padding: '3px 8px',
        fontFamily: TK.mono, fontSize: 9.5, letterSpacing: 0.4,
        background: activePreset === 'custom' ? tintBg(TK.rust, 0.15) : 'transparent',
        border: `1px solid ${activePreset === 'custom' ? TK.rust : TK.line}`,
        color: activePreset === 'custom' ? TK.rust : TK.inkFaint,
        cursor: 'default',
        textTransform: 'uppercase' as const,
      }}>
        Custom
      </button>
    </div>
  )
}

// ── BlobSlidersContent ────────────────────────────────────────────────────────
// Shared slider block used both by BlobView and inline in TerrainSettingsView.

type BlobValues = {
  smooth: number; offset: number; bump: number; sweepFreq: number;
  lobeFreq: number; lobeAmp: number; lobeThreshold: number; lobeDirection: number;
}
type BlobSetters = { [K in keyof BlobValues]: (v: number) => void }

function BlobSlidersContent({ storeValues, setters, accentColor }: {
  storeValues: BlobValues
  setters: BlobSetters
  accentColor?: string
}) {
  const [local, setLocal] = useState<BlobValues>(storeValues)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!draggingRef.current) setLocal(storeValues)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, Object.values(storeValues))

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const set = (field: keyof BlobValues, val: number) => {
    setLocal(prev => ({ ...prev, [field]: val }))
    draggingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { draggingRef.current = false; setters[field](val) }, 150)
  }

  const color = accentColor ?? TK.inkMute

  return (
    <>
      <MiniSlider label="Corner Rounding" display={local.smooth} value={local.smooth} min={0} max={5} step={1} onChange={v => set('smooth', v)} accentColor={accentColor} />
      <MiniSlider label="Waviness" display={`${Math.round(local.bump * 100)}%`} value={Math.round(local.bump * 100)} min={0} max={60} step={1} onChange={v => set('bump', v / 100)} accentColor={accentColor} />
      <MiniSlider label="Inset" display={`${local.offset > 0 ? '+' : ''}${Math.round(local.offset * 100)}%`} value={Math.round(local.offset * 100)} min={-80} max={30} step={1} onChange={v => set('offset', v / 100)} accentColor={accentColor} />
      <MiniSlider label="Wave Scale" display={local.sweepFreq.toFixed(2)} value={Math.round(local.sweepFreq * 100)} min={40} max={100} step={1} onChange={v => set('sweepFreq', v / 100)} accentColor={accentColor} />
      <div style={{ margin: '6px 14px 2px', borderTop: `1px solid ${TK.line2}`, paddingTop: 8 }}>
        <span style={{ fontFamily: TK.mono, fontSize: 9, letterSpacing: 0.8, color: TK.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Fringe</span>
      </div>
      <MiniSlider label="Scale" display={local.lobeFreq.toFixed(1)} value={Math.round(local.lobeFreq * 10)} min={20} max={50} step={1} onChange={v => set('lobeFreq', v / 10)} />
      <MiniSlider label="Strength" display={`${Math.round(local.lobeAmp * 100)}%`} value={Math.round(local.lobeAmp * 100)} min={0} max={100} step={1} onChange={v => set('lobeAmp', v / 100)} />
      <MiniSlider label="Sparsity" display={`${Math.round(local.lobeThreshold * 100)}%`} value={Math.round(local.lobeThreshold * 100)} min={0} max={40} step={1} onChange={v => set('lobeThreshold', v / 100)} />
    </>
  )
}

function DefaultBlobSlidersInline() {
  const {
    terrainBlobSmooth, setTerrainBlobSmooth, terrainBlobOffset, setTerrainBlobOffset,
    terrainBlobBump, setTerrainBlobBump, terrainBlobSweepFreq, setTerrainBlobSweepFreq,
    terrainBlobLobeFreq, setTerrainBlobLobeFreq, terrainBlobLobeAmp, setTerrainBlobLobeAmp,
    terrainBlobLobeThreshold, setTerrainBlobLobeThreshold, terrainBlobLobeDirection, setTerrainBlobLobeDirection,
    applyTerrainBlobPreset,
  } = useMapStore()

  const storeValues: BlobPresetValues = {
    smooth: terrainBlobSmooth, offset: terrainBlobOffset, bump: terrainBlobBump,
    sweepFreq: terrainBlobSweepFreq, lobeFreq: terrainBlobLobeFreq, lobeAmp: terrainBlobLobeAmp,
    lobeThreshold: terrainBlobLobeThreshold, lobeDirection: terrainBlobLobeDirection,
  }

  return (
    <>
      <BlobPresetChips currentValues={storeValues} onSelect={applyTerrainBlobPreset} />
      <BlobSlidersContent
        storeValues={storeValues}
        setters={{ smooth: setTerrainBlobSmooth, offset: setTerrainBlobOffset, bump: setTerrainBlobBump, sweepFreq: setTerrainBlobSweepFreq, lobeFreq: setTerrainBlobLobeFreq, lobeAmp: setTerrainBlobLobeAmp, lobeThreshold: setTerrainBlobLobeThreshold, lobeDirection: setTerrainBlobLobeDirection }}
        accentColor={TK.rust}
      />
    </>
  )
}

function EdgeBlobSlidersInline() {
  const { edgeBlobWidth, setEdgeBlobWidth } = useMapStore()
  return (
    <MiniSlider label="Width" display={`${Math.round(edgeBlobWidth * 100)}%`} value={Math.round(edgeBlobWidth * 100)} min={5} max={80} step={1} onChange={v => setEdgeBlobWidth(v / 100)} />
  )
}

// ── Detail shell ──────────────────────────────────────────────────────────────

// ── BlobView ──────────────────────────────────────────────────────────────────

function BlobView({ terrain, onBack }: { terrain: string | null; onBack: () => void }) {
  const {
    terrainColors, setTerrainColor,
    terrainTextureScales, setTerrainTextureScale,
    terrainTypeBlobStyles, setTerrainTypeBlobStyle,
    terrainBlobSmooth, setTerrainBlobSmooth,
    terrainBlobOffset, setTerrainBlobOffset,
    terrainBlobBump, setTerrainBlobBump,
    terrainBlobSweepFreq, setTerrainBlobSweepFreq,
    terrainBlobLobeFreq, setTerrainBlobLobeFreq,
    terrainBlobLobeAmp, setTerrainBlobLobeAmp,
    terrainBlobLobeThreshold, setTerrainBlobLobeThreshold,
    terrainBlobLobeDirection, setTerrainBlobLobeDirection,
    applyTerrainBlobPreset,
  } = useMapStore()

  const isDefaults = terrain === null
  const color = terrain ? (terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888888') : '#7a9e7a'
  const hasTexture = terrain ? TEXTURED_TERRAINS.has(terrain) : false
  const textureScale = terrain ? (terrainTextureScales[terrain] ?? 3) : 3

  const typeStyle = terrain ? terrainTypeBlobStyles[terrain] : null
  const overrideEnabled = typeStyle?.enabled ?? false

  const isModified = isDefaults
    ? (terrainBlobSmooth !== DEFAULT_TERRAIN_BLOB.smooth ||
       terrainBlobOffset !== DEFAULT_TERRAIN_BLOB.offset ||
       terrainBlobBump !== DEFAULT_TERRAIN_BLOB.bump ||
       terrainBlobSweepFreq !== DEFAULT_TERRAIN_BLOB.sweepFreq ||
       terrainBlobLobeFreq !== DEFAULT_TERRAIN_BLOB.lobeFreq ||
       terrainBlobLobeAmp !== DEFAULT_TERRAIN_BLOB.lobeAmp ||
       terrainBlobLobeThreshold !== DEFAULT_TERRAIN_BLOB.lobeThreshold ||
       terrainBlobLobeDirection !== DEFAULT_TERRAIN_BLOB.lobeDirection)
    : overrideEnabled

  const handleReset = () => {
    if (isDefaults) {
      setTerrainBlobSmooth(DEFAULT_TERRAIN_BLOB.smooth)
      setTerrainBlobOffset(DEFAULT_TERRAIN_BLOB.offset)
      setTerrainBlobBump(DEFAULT_TERRAIN_BLOB.bump)
      setTerrainBlobSweepFreq(DEFAULT_TERRAIN_BLOB.sweepFreq)
      setTerrainBlobLobeFreq(DEFAULT_TERRAIN_BLOB.lobeFreq)
      setTerrainBlobLobeAmp(DEFAULT_TERRAIN_BLOB.lobeAmp)
      setTerrainBlobLobeThreshold(DEFAULT_TERRAIN_BLOB.lobeThreshold)
      setTerrainBlobLobeDirection(DEFAULT_TERRAIN_BLOB.lobeDirection)
    } else if (terrain) {
      setTerrainTypeBlobStyle(terrain, { enabled: false })
    }
  }

  const storeSmooth        = overrideEnabled ? (typeStyle?.smooth        ?? terrainBlobSmooth)        : terrainBlobSmooth
  const storeOffset        = overrideEnabled ? (typeStyle?.offset        ?? terrainBlobOffset)        : terrainBlobOffset
  const storeBump          = overrideEnabled ? (typeStyle?.bump          ?? terrainBlobBump)          : terrainBlobBump
  const storeSweepFreq     = overrideEnabled ? (typeStyle?.sweepFreq     ?? terrainBlobSweepFreq)     : terrainBlobSweepFreq
  const storeLobeFreq      = overrideEnabled ? (typeStyle?.lobeFreq      ?? terrainBlobLobeFreq)      : terrainBlobLobeFreq
  const storeLobeAmp       = overrideEnabled ? (typeStyle?.lobeAmp       ?? terrainBlobLobeAmp)       : terrainBlobLobeAmp
  const storeLobeThreshold = overrideEnabled ? (typeStyle?.lobeThreshold ?? terrainBlobLobeThreshold) : terrainBlobLobeThreshold
  const storeLobeDirection = overrideEnabled ? (typeStyle?.lobeDirection ?? terrainBlobLobeDirection) : terrainBlobLobeDirection

  const [local, setLocal] = useState({
    smooth: storeSmooth, offset: storeOffset, bump: storeBump, sweepFreq: storeSweepFreq,
    lobeFreq: storeLobeFreq, lobeAmp: storeLobeAmp, lobeThreshold: storeLobeThreshold, lobeDirection: storeLobeDirection,
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!draggingRef.current) setLocal({
      smooth: storeSmooth, offset: storeOffset, bump: storeBump, sweepFreq: storeSweepFreq,
      lobeFreq: storeLobeFreq, lobeAmp: storeLobeAmp, lobeThreshold: storeLobeThreshold, lobeDirection: storeLobeDirection,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSmooth, storeOffset, storeBump, storeSweepFreq, storeLobeFreq, storeLobeAmp, storeLobeThreshold, storeLobeDirection])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const commitBlob = (field: string, val: number) => {
    if (isDefaults) {
      const setters: Record<string, (v: number) => void> = {
        smooth: setTerrainBlobSmooth, offset: setTerrainBlobOffset, bump: setTerrainBlobBump,
        sweepFreq: setTerrainBlobSweepFreq, lobeFreq: setTerrainBlobLobeFreq,
        lobeAmp: setTerrainBlobLobeAmp, lobeThreshold: setTerrainBlobLobeThreshold,
        lobeDirection: setTerrainBlobLobeDirection,
      }
      setters[field]?.(val)
    } else if (terrain && overrideEnabled) {
      setTerrainTypeBlobStyle(terrain, { [field]: val })
    }
  }

  const setBlob = (field: string, val: number) => {
    setLocal(prev => ({ ...prev, [field]: val }))
    draggingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      draggingRef.current = false
      commitBlob(field, val)
    }, 150)
  }

  const handlePresetSelect = (id: BlobPresetId) => {
    const values = BLOB_PRESETS[id].values
    if (isDefaults) {
      applyTerrainBlobPreset(id)
    } else if (terrain) {
      setTerrainTypeBlobStyle(terrain, { enabled: true, ...values })
    }
    setLocal(prev => ({ ...prev, ...values }))
  }

  const chipsValues: BlobPresetValues | null = (isDefaults || overrideEnabled) ? local : null

  const handleEnableToggle = (checked: boolean) => {
    if (!terrain) return
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

  const controlsDisabled = !isDefaults && !overrideEnabled

  const blobSliders = (
    <>
      <BlobPresetChips currentValues={chipsValues} onSelect={handlePresetSelect} />
      <div style={{ opacity: controlsDisabled ? 0.4 : 1, pointerEvents: controlsDisabled ? 'none' : 'auto' }}>
        <MiniSlider label="Corner Rounding" display={local.smooth} value={local.smooth} min={0} max={5} step={1} onChange={v => setBlob('smooth', v)} />
        <MiniSlider label="Waviness" display={`${Math.round(local.bump * 100)}%`} value={Math.round(local.bump * 100)} min={0} max={60} step={1} onChange={v => setBlob('bump', v / 100)} />
        <MiniSlider label="Inset" display={`${local.offset > 0 ? '+' : ''}${Math.round(local.offset * 100)}%`} value={Math.round(local.offset * 100)} min={-80} max={30} step={1} onChange={v => setBlob('offset', v / 100)} />
        <MiniSlider label="Wave Scale" display={local.sweepFreq.toFixed(2)} value={Math.round(local.sweepFreq * 100)} min={40} max={100} step={1} onChange={v => setBlob('sweepFreq', v / 100)} />
        <div style={{ margin: '6px 14px 2px', borderTop: `1px solid ${TK.line2}`, paddingTop: 8 }}>
          <span style={{ fontFamily: TK.mono, fontSize: 9, letterSpacing: 0.8, color: TK.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Fringe</span>
        </div>
        <MiniSlider label="Scale" display={local.lobeFreq.toFixed(1)} value={Math.round(local.lobeFreq * 10)} min={20} max={50} step={1} onChange={v => setBlob('lobeFreq', v / 10)} />
        <MiniSlider label="Strength" display={`${Math.round(local.lobeAmp * 100)}%`} value={Math.round(local.lobeAmp * 100)} min={0} max={100} step={1} onChange={v => setBlob('lobeAmp', v / 100)} />
        <MiniSlider label="Sparsity" display={`${Math.round(local.lobeThreshold * 100)}%`} value={Math.round(local.lobeThreshold * 100)} min={0} max={40} step={1} onChange={v => setBlob('lobeThreshold', v / 100)} />
      </div>
    </>
  )

  return (
    <DetailViewShell header={
      <SidebarDetailHeader
        title={isDefaults ? 'Default blob shape' : terrainLabel(terrain!)}
        onBack={onBack}
        status={isModified ? 'modified' : 'default'}
        onReset={handleReset}
      />
    }>
      {!isDefaults && (
        <DetailSection label="Color">
          <BigColorSwatch value={color} onChange={v => setTerrainColor(terrain!, v)} groups={PALETTE_TERRAIN_GROUPS} />
        </DetailSection>
      )}

      {!isDefaults && hasTexture && (
        <DetailSection label="Texture">
          <MiniSlider label="Scale" display={`${textureScale.toFixed(1)}×`} value={Math.round(textureScale * 10)} min={5} max={80} step={1} onChange={v => setTerrainTextureScale(terrain!, v / 10)} />
        </DetailSection>
      )}

      <DetailSection
        label={isDefaults ? 'Blob shape' : 'Custom blob shape'}
        toggle={!isDefaults ? { enabled: overrideEnabled, onChange: handleEnableToggle } : undefined}
      >
        {blobSliders}
      </DetailSection>
    </DetailViewShell>
  )
}

// ── ClassificationView ────────────────────────────────────────────────────────

function ClassificationView({ onBack }: { onBack: () => void }) {
  const { thresholds, setTerrainThreshold, disabledTerrains, toggleTerrainDisabled, terrainColors } = useMapStore()

  return (
    <DetailViewShell header={<SidebarDetailHeader title="OSM Classification" onBack={onBack} />}>
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
                      border: `1px solid ${disabled ? TK.line : color}`,
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
    </DetailViewShell>
  )
}

// ── CoastlineView ─────────────────────────────────────────────────────────────

function CoastlineView({ onBack }: { onBack: () => void }) {
  const {
    coastlineDebugRaw, setCoastlineDebugRaw,
    beachStrip, setBeachStrip,
    beachColor, setBeachColor,
    beachWidth, setBeachWidth,
    coastlineDPEpsilon, setCoastlineDPEpsilon,
    coastlineChaikinPasses, setCoastlineChaikinPasses,
  } = useMapStore()

  return (
    <DetailViewShell header={<SidebarDetailHeader title="Coastline" onBack={onBack} />}>
      <DetailSection label="Smoothing">
        <MiniSlider label="Simplify" display={coastlineDPEpsilon} value={coastlineDPEpsilon} min={0} max={8} step={0.5} onChange={setCoastlineDPEpsilon} />
        <MiniSlider label="Smooth" display={coastlineChaikinPasses} value={coastlineChaikinPasses} min={0} max={6} step={1} onChange={setCoastlineChaikinPasses} />
      </DetailSection>
      <DetailSection label="Beach strip">
        <ToggleRow label="Enable beach strip" checked={beachStrip} onChange={setBeachStrip} />
        <div style={{ opacity: beachStrip ? 1 : 0.4, pointerEvents: beachStrip ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 14px' }}>
            <span style={{ fontFamily: TK.sans, fontSize: 11, color: TK.ink2 }}>Color</span>
            <input
              type="color" value={beachColor}
              onChange={e => setBeachColor(e.target.value)}
              style={{ width: 28, height: 20, border: `1px solid ${TK.line}`, background: 'none', cursor: 'pointer', padding: 0 }}
            />
            <span style={{ fontFamily: TK.mono, fontSize: 10.5, color: TK.inkMute }}>{beachColor}</span>
          </div>
          <MiniSlider label="Width" display={`${Math.round(beachWidth * 100)}%`} value={Math.round(beachWidth * 100)} min={1} max={25} step={1} onChange={v => setBeachWidth(v / 100)} />
        </div>
      </DetailSection>
      <DetailSection label="Debug">
        <ToggleRow label="Raw data overlay" checked={coastlineDebugRaw} onChange={setCoastlineDebugRaw} />
      </DetailSection>
    </DetailViewShell>
  )
}

// ── EdgeBlobView ──────────────────────────────────────────────────────────────

function EdgeBlobView({ onBack }: { onBack: () => void }) {
  const { edgeBlobWidth, setEdgeBlobWidth } = useMapStore()

  return (
    <DetailViewShell header={<SidebarDetailHeader title="Edge blob shape" onBack={onBack} />}>
      <DetailSection label="Shape">
        <MiniSlider label="Width" display={`${Math.round(edgeBlobWidth * 100)}%`} value={Math.round(edgeBlobWidth * 100)} min={5} max={80} step={1} onChange={v => setEdgeBlobWidth(v / 100)} />
      </DetailSection>
    </DetailViewShell>
  )
}

// ── ElevationView ─────────────────────────────────────────────────────────────

function ElevationView({ onBack }: { onBack: () => void }) {
  const {
    generatedHexes,
    elevationStatus, elevationError, elevationProgress,
    showElevationDebug, setShowElevationDebug,
    classificationParams, setClassificationParam,
    heightmapUrl,
    hillshadeAzimuth, hillshadeAltitude, hillshadeIntensity,
    setHillshadeAzimuth, setHillshadeAltitude, setHillshadeIntensity,
    contoursEnabled, contourInterval, contourBaseElevation, contourSmoothPasses, contourLineWidth,
    setContoursEnabled, setContourInterval, setContourBaseElevation, setContourSmoothPasses, setContourLineWidth,
    fetchElevation,
    dataSource,
  } = useMapStore()

  const hasData = generatedHexes.some(h => h.elevation_avg_m != null)
  const fetchedCount = generatedHexes.filter(h => h.elevation_avg_m != null).length
  const isLoading = elevationStatus === 'loading'
  const noHexes = generatedHexes.length === 0
  const pctSum = classificationParams.mountainsPct + classificationParams.hillsPct

  const flatCount      = hasData ? generatedHexes.filter(h => h.elevation_class === 'flat').length      : 0
  const hillsCount     = hasData ? generatedHexes.filter(h => h.elevation_class === 'hills').length     : 0
  const mountainsCount = hasData ? generatedHexes.filter(h => h.elevation_class === 'mountains').length : 0

  return (
    <DetailViewShell header={<SidebarDetailHeader title="Elevation" onBack={onBack} />}>
      {dataSource === 'osm' && (
        <DetailSection label="Data">
          <div style={{ padding: '2px 14px 6px' }}>
            <button
              onClick={() => fetchElevation()}
              disabled={isLoading || noHexes}
              style={{
                width: '100%', padding: '6px 0', background: 'none',
                border: `1px solid ${isLoading ? TK.line : TK.rust}`,
                color: isLoading ? TK.inkFaint : TK.rust,
                cursor: isLoading || noHexes ? 'not-allowed' : 'pointer',
                fontFamily: TK.sans, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                background: elevationStatus === 'done'    ? '#5a9e6f'
                          : elevationStatus === 'loading' ? '#a0a060'
                          : elevationStatus === 'error'   ? '#9e5a5a'
                          : TK.inkFaint,
              }} />
              {isLoading ? 'Fetching…' : 'Fetch elevation data'}
            </button>
            {isLoading && elevationProgress && (
              <div style={{ marginTop: 6 }}>
                <div style={{ height: 2, background: TK.line2, marginBottom: 3 }}>
                  <div style={{ height: '100%', background: TK.rust, width: `${elevationProgress.progress}%`, transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontFamily: TK.mono, fontSize: 10, color: TK.inkMute }}>{elevationProgress.message}</div>
              </div>
            )}
            {elevationStatus === 'error' && elevationError && (
              <div style={{ fontFamily: TK.mono, fontSize: 10, color: '#9e5a5a', marginTop: 4 }}>{elevationError}</div>
            )}
            {elevationStatus === 'done' && (
              <div style={{ fontFamily: TK.mono, fontSize: 10, color: TK.inkMute, marginTop: 4 }}>
                {fetchedCount} / {generatedHexes.length} hexes
              </div>
            )}
          </div>
        </DetailSection>
      )}

      {hasData && (
        <DetailSection label="Classification">
          {pctSum > 95 && (
            <div style={{ padding: '0 14px 6px', fontFamily: TK.mono, fontSize: 10, color: '#9e5a5a' }}>
              Mountains + hills &gt; 95% — flat hexes will be scarce
            </div>
          )}
          <MiniSlider label="Mountains %" display={`${classificationParams.mountainsPct}%`} value={classificationParams.mountainsPct} min={1} max={50} step={1} onChange={v => setClassificationParam('mountainsPct', v)} />
          <MiniSlider label="Hills %" display={`${classificationParams.hillsPct}%`} value={classificationParams.hillsPct} min={1} max={60} step={1} onChange={v => setClassificationParam('hillsPct', v)} />
          <MiniSlider label="Min ruggedness" display={`${classificationParams.rangeFloorM}m`} value={classificationParams.rangeFloorM} min={0} max={400} step={10} onChange={v => setClassificationParam('rangeFloorM', v)} />
          <MiniSlider label="Min altitude" display={`${classificationParams.medianFloorM}m`} value={classificationParams.medianFloorM} min={0} max={2000} step={50} onChange={v => setClassificationParam('medianFloorM', v)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: '6px 14px 0' }}>
            {[
              { label: 'Flat', count: flatCount,      color: '#5a7a5a' },
              { label: 'Hills', count: hillsCount,    color: '#7a8a5a' },
              { label: 'Mtns', count: mountainsCount, color: '#8a6a3a' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ background: TK.paper2, padding: '4px 2px', textAlign: 'center' }}>
                <div style={{ fontFamily: TK.mono, fontSize: 9, color, marginBottom: 1 }}>{label}</div>
                <div style={{ fontFamily: TK.mono, fontSize: 9, color: TK.inkMute }}>{count}</div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {heightmapUrl && (
        <DetailSection label="Hillshade">
          <MiniSlider label="Sun azimuth" display={`${hillshadeAzimuth}°`} value={hillshadeAzimuth} min={0} max={360} step={5} onChange={setHillshadeAzimuth} />
          <MiniSlider label="Sun altitude" display={`${hillshadeAltitude}°`} value={hillshadeAltitude} min={5} max={85} step={5} onChange={setHillshadeAltitude} />
          <MiniSlider label="Intensity" display={hillshadeIntensity.toFixed(2)} value={hillshadeIntensity} min={0} max={1} step={0.05} onChange={setHillshadeIntensity} />
        </DetailSection>
      )}

      {heightmapUrl && (
        <DetailSection label="Contours">
          <ToggleRow label="Enabled" value={contoursEnabled} onChange={setContoursEnabled} />
          {contoursEnabled && (
            <>
              <MiniSlider label="Base elevation" display={`${contourBaseElevation}m`} value={contourBaseElevation} min={0} max={2000} step={50} onChange={setContourBaseElevation} />
              <MiniSlider label="Interval" display={`${contourInterval}m`} value={contourInterval} min={10} max={500} step={10} onChange={setContourInterval} />
              <MiniSlider label="Line width" display={String(contourLineWidth)} value={contourLineWidth} min={0.5} max={4} step={0.25} onChange={setContourLineWidth} />
              <ToggleRow label="Smooth" value={contourSmoothPasses > 0} onChange={v => setContourSmoothPasses(v ? 1 : 0)} />
            </>
          )}
        </DetailSection>
      )}

      {hasData && (
        <DetailSection label="Debug">
          <div style={{ padding: '0 14px 4px' }}>
            <div
              onClick={() => setShowElevationDebug(!showElevationDebug)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <div style={{
                width: 14, height: 14,
                background: showElevationDebug ? TK.ink : 'transparent',
                border: `1px solid ${showElevationDebug ? TK.ink : TK.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {showElevationDebug && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none" stroke={TK.surface} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 3.5l2.5 2.5L8 1" />
                  </svg>
                )}
              </div>
              <span style={{ fontFamily: TK.sans, fontSize: 12, color: TK.ink2 }}>Show avg / max per hex</span>
            </div>
          </div>
        </DetailSection>
      )}
    </DetailViewShell>
  )
}

// ── HistoricalIconsView ───────────────────────────────────────────────────────

const HISTORICAL_ICON_TERRAINS: { terrain: string; label: string }[] = [
  { terrain: 'woods',       label: 'Woods' },
  { terrain: 'light_woods', label: 'Light woods' },
]

function HistoricalIconsView({ onBack }: { onBack: () => void }) {
  const { historicalIconParams, setHistoricalIconParam } = useMapStore()

  return (
    <DetailViewShell header={<SidebarDetailHeader title="Historical icons" onBack={onBack} />}>
      {HISTORICAL_ICON_TERRAINS.map(({ terrain, label }) => {
        const defaults = HISTORICAL_ICON_TERRAIN_DEFAULTS[terrain] ?? { spacing: 0.85, scale: 0.40, rotRange: 0.4 }
        const p = { ...defaults, ...historicalIconParams[terrain] }
        return (
          <DetailSection key={terrain} label={label}>
            <MiniSlider
              label="Spacing"
              display={p.spacing.toFixed(2)}
              value={p.spacing}
              min={0.3} max={2.0} step={0.05}
              onChange={v => setHistoricalIconParam(terrain, 'spacing', v)}
            />
            <MiniSlider
              label="Scale"
              display={p.scale.toFixed(2)}
              value={p.scale}
              min={0.1} max={1.5} step={0.05}
              onChange={v => setHistoricalIconParam(terrain, 'scale', v)}
            />
            <MiniSlider
              label="Rotation range"
              display={`${(p.rotRange * 180 / Math.PI).toFixed(0)}°`}
              value={p.rotRange}
              min={0} max={Math.PI * 2} step={0.05}
              onChange={v => setHistoricalIconParam(terrain, 'rotRange', v)}
            />
          </DetailSection>
        )
      })}
    </DetailViewShell>
  )
}

// ── TerrainSettingsView ───────────────────────────────────────────────────────

function TerrainSettingsView({ onBack }: {
  onBack: () => void
}) {
  const {
    thresholds, setTerrainThreshold, disabledTerrains, toggleTerrainDisabled, terrainColors,
    realisticCoastline, setRealisticCoastline,
    coastlineDebugRaw, setCoastlineDebugRaw,
    beachStrip, setBeachStrip, beachColor, setBeachColor, beachWidth, setBeachWidth,
    coastlineDPEpsilon, setCoastlineDPEpsilon, coastlineChaikinPasses, setCoastlineChaikinPasses,
  } = useMapStore()

  return (
    <DetailViewShell header={<SidebarDetailHeader title="Settings" onBack={onBack} />}>

      <DetailSection label="Classification" hint="How likely each terrain type is to appear during generation.">
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
                      border: `1px solid ${disabled ? TK.line : color}`,
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
      </DetailSection>

      <DetailSection label="Default blob shape" hint="How terrain blobs look across the whole map by default.">
        <DefaultBlobSlidersInline />
      </DetailSection>

      <DetailSection label="Edge blob shape" hint="How blobs look when painting along region edges.">
        <EdgeBlobSlidersInline />
      </DetailSection>

      <DetailSection
        label="Coastline"
        hint="How the sea and land boundary looks, with an optional beach strip."
        toggle={{ enabled: realisticCoastline, onChange: setRealisticCoastline }}
      >
        <MiniSlider label="Simplify" display={coastlineDPEpsilon} value={coastlineDPEpsilon} min={0} max={8} step={0.5} onChange={setCoastlineDPEpsilon} />
        <MiniSlider label="Smooth" display={coastlineChaikinPasses} value={coastlineChaikinPasses} min={0} max={6} step={1} onChange={setCoastlineChaikinPasses} />
        <ToggleRow label="Beach strip" checked={beachStrip} onChange={setBeachStrip} />
        {beachStrip && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px' }}>
              <span style={{ fontFamily: TK.sans, fontSize: 11, color: TK.ink2 }}>Color</span>
              <input type="color" value={beachColor} onChange={e => setBeachColor(e.target.value)}
                style={{ width: 28, height: 20, border: `1px solid ${TK.line}`, background: 'none', cursor: 'pointer', padding: 0 }} />
              <span style={{ fontFamily: TK.mono, fontSize: 10.5, color: TK.inkMute }}>{beachColor}</span>
            </div>
            <MiniSlider label="Beach width" display={`${Math.round(beachWidth * 100)}%`} value={Math.round(beachWidth * 100)} min={1} max={25} step={1} onChange={v => setBeachWidth(v / 100)} />
          </>
        )}
        <ToggleRow label="Raw data overlay" checked={coastlineDebugRaw} onChange={setCoastlineDebugRaw} />
      </DetailSection>

    </DetailViewShell>
  )
}

// ── TerrainSidebarV2 ──────────────────────────────────────────────────────────

export function TerrainSidebarV2() {
  const {
    terrainPaintMode, terrainPaintBrush,
    elevationPaintMode, elevationPaintBrush,
    activeTool, setActiveTool,
    terrainLayersEnabled, setTerrainLayersEnabled,
    realisticCoastline, setRealisticCoastline,
    terrainEdgePaintEnabled, setTerrainEdgePaintEnabled,
    terrainColors, customTerrains,
    mapStyle,
  } = useMapStore()

  const [viewId, setViewId] = useState<ViewId>('list')
  const [brushTerrain, setBrushTerrain] = useState<string | null>(null)
  const [backTarget, setBackTarget] = useState<ViewId>('list')
  const [addTerrainOpen, setAddTerrainOpen] = useState(false)
  const [addTerrainAnchorY, setAddTerrainAnchorY] = useState(0)

  const goBack = () => setViewId(backTarget)
  const goBackToList = () => { setBackTarget('list'); setViewId('list') }
  const openBrush = (t: string | null) => { setBrushTerrain(t); setBackTarget('list'); setViewId('brush') }

  const selectBrush = (terrain: string) => {
    if (terrainPaintMode && terrainPaintBrush === terrain) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'terrain', brush: terrain })
  }

  const toggleElev = (brush: 'flat' | 'hills' | 'mountains') => {
    if (elevationPaintMode && elevationPaintBrush === brush) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'elevation', brush })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (shouldSuppressShortcut(e)) return
      if (viewId !== 'list') {
        if (e.key === 'Escape') goBackToList()
        return
      }
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TERRAIN_PRIORITY.length) selectBrush(TERRAIN_PRIORITY[idx])
      else if (e.key === 'Escape') setActiveTool({ type: 'none' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainPaintMode, terrainPaintBrush, viewId])

  if (viewId === 'brush')             return <BlobView terrain={brushTerrain} onBack={goBack} />
  if (viewId === 'terrain-settings')  return (
    <TerrainSettingsView onBack={goBackToList} />
  )
  if (viewId === 'classification') return <ClassificationView onBack={goBack} />
  if (viewId === 'coastline')      return <CoastlineView onBack={goBack} />
  if (viewId === 'edge-blob')      return <EdgeBlobView onBack={goBack} />
  if (viewId === 'elevation')        return <ElevationView onBack={goBack} />
  if (viewId === 'historical-icons') return <HistoricalIconsView onBack={goBack} />

  const filterBrush = (_t: string) => true
  const colorFor = (t: string) => terrainColors[t] ?? TERRAIN_COLORS[t] ?? '#888'

  return (
    <>
      {addTerrainOpen && (
        <AddTerrainFlyout anchorY={addTerrainAnchorY} onClose={() => setAddTerrainOpen(false)} />
      )}

      <SidebarShell>
        <SidebarHeader title="Terrain" />

        {/* Terrain brushes */}
        <SidebarSection
          label="OSM Terrain"
          action={
            <button onClick={() => setViewId('terrain-settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: TK.mono, fontSize: 9, color: TK.inkMute, letterSpacing: 0.3 }}>
              settings ›
            </button>
          }
        >
          {/* Brush list — overflow-y ready for when list grows */}
          <div style={{ overflowY: 'auto' }}>
            {OSM_TERRAINS.filter(filterBrush).map((t, idx) => (
              <BrushRow
                key={t}
                label={terrainLabel(t)}
                color={colorFor(t)}
                active={terrainPaintMode && terrainPaintBrush === t}
                shortcut={String(idx + 1)}
                showCog
                cogOpen={false}
                onSelect={() => selectBrush(t)}
                onCog={() => openBrush(t)}
              />
            ))}

            <SectionDivider />
            <div style={{ padding: '5px 14px 2px', fontFamily: TK.mono, fontSize: 9, letterSpacing: 0.8, color: TK.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>
              Manual
            </div>

            {MANUAL_TERRAINS.map((t, idx) => (
              <BrushRow
                key={t}
                label={terrainLabel(t)}
                color={colorFor(t)}
                active={terrainPaintMode && terrainPaintBrush === t}
                shortcut={String(OSM_TERRAINS.length + idx + 1)}
                showCog
                cogOpen={false}
                onSelect={() => selectBrush(t)}
                onCog={() => openBrush(t)}
              />
            ))}

            {customTerrains.length > 0 && <SectionDivider />}

            {customTerrains.map(ct => (
              <BrushRow
                key={ct.id}
                label={ct.name}
                color={ct.color}
                active={terrainPaintMode && terrainPaintBrush === ct.id}
                showCog
                cogOpen={false}
                onSelect={() => selectBrush(ct.id)}
                onCog={() => openBrush(ct.id)}
              />
            ))}
          </div>

          <DashedAddBtn
            label="Add terrain"
            dataAttr="data-add-terrain-flyout"
            onClick={e => { setAddTerrainAnchorY(e.currentTarget.getBoundingClientRect().top); setAddTerrainOpen(o => !o) }}
          />
        </SidebarSection>

        {/* Elevation brushes */}
        <SidebarSection
          label="Elevation"
          action={
            <button onClick={() => setViewId('elevation')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: TK.mono, fontSize: 9, color: TK.inkMute, letterSpacing: 0.3 }}>
              thresholds ›
            </button>
          }
        >
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
        </SidebarSection>

        {/* Historical icons (historical style only) */}
        {mapStyle === 'historical_simple' && (
          <SidebarSection
            label="Historical icons"
            action={
              <button onClick={() => setViewId('historical-icons')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: TK.mono, fontSize: 9, color: TK.inkMute, letterSpacing: 0.3 }}>
                configure ›
              </button>
            }
          >
            <div style={{ padding: '2px 14px 6px', fontFamily: TK.mono, fontSize: 10, color: TK.inkMute }}>
              PNG icons stamped inside terrain blobs
            </div>
          </SidebarSection>
        )}

        {/* Settings */}
        <SidebarSection label="Settings">
          <ToggleRow
            label="Edge painting"
            hint="Drag along a region edge to paint a blob along it."
            checked={terrainEdgePaintEnabled}
            onChange={setTerrainEdgePaintEnabled}
          />
          <ToggleRow
            label="Realistic coastline"
            hint="Wavy inflection on sea / land boundary."
            checked={realisticCoastline}
            onChange={v => { setRealisticCoastline(v); if (!v && viewId === 'coastline') setViewId('list') }}
          />
          <ToggleRow
            label="Terrain layers"
            hint="Render each terrain as its own texture layer."
            checked={terrainLayersEnabled}
            onChange={setTerrainLayersEnabled}
          />
        </SidebarSection>
      </SidebarShell>
    </>
  )
}
