import { useEffect, useRef, useState } from 'react'
import { useMapStore, TERRAIN_COLORS } from '../store/mapStore'
import { ColorSwatch } from './ColorSwatch'
import { PALETTE_TERRAIN } from '../palettes'
import { FlyoutContainer, FlyoutHeader, ToggleButtonGroup, EnabledSection } from './ui'

const TEXTURED_TERRAINS = new Set(['clear', 'woods', 'light_woods', 'beach'])

interface Props {
  terrain?: string  // undefined = defaults mode
  anchorY: number
  onClose: () => void
}

export function TerrainSettingsFlyout({ terrain, anchorY, onClose }: Props) {
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
  } = useMapStore()

  const isDefaults = terrain === undefined

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-terrain-flyout]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const color = terrain ? (terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888888') : '#7a9e7a'
  const hasTexture = terrain ? TEXTURED_TERRAINS.has(terrain) : false
  const textureScale = terrain ? (terrainTextureScales[terrain] ?? 3) : 3
  // hasWildness / wildness — field mode detached, always false now
  const showBlobSection = true

  const typeStyle = terrain ? terrainTypeBlobStyles[terrain] : null
  const overrideEnabled = typeStyle?.enabled ?? false

  const blobVals = {
    smooth: overrideEnabled ? (typeStyle?.smooth ?? terrainBlobSmooth) : terrainBlobSmooth,
    offset: overrideEnabled ? (typeStyle?.offset ?? terrainBlobOffset) : terrainBlobOffset,
    bump: overrideEnabled ? (typeStyle?.bump ?? terrainBlobBump) : terrainBlobBump,
    sweepFreq: overrideEnabled ? (typeStyle?.sweepFreq ?? terrainBlobSweepFreq) : terrainBlobSweepFreq,
    lobeFreq: overrideEnabled ? (typeStyle?.lobeFreq ?? terrainBlobLobeFreq) : terrainBlobLobeFreq,
    lobeAmp: overrideEnabled ? (typeStyle?.lobeAmp ?? terrainBlobLobeAmp) : terrainBlobLobeAmp,
    lobeThreshold: overrideEnabled ? (typeStyle?.lobeThreshold ?? terrainBlobLobeThreshold) : terrainBlobLobeThreshold,
    lobeDirection: overrideEnabled ? (typeStyle?.lobeDirection ?? terrainBlobLobeDirection) : terrainBlobLobeDirection,
  }

  // Local mirror of blobVals — updates instantly on drag, commits to store after 150 ms idle.
  // This prevents buildTerrainBlobsV2 from running on every slider tick.
  const [local, setLocal] = useState(blobVals)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)

  // Sync from store when not mid-drag (external reset, terrain switch, override toggle)
  useEffect(() => {
    if (!draggingRef.current) setLocal(blobVals)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.smooth, local.offset, local.bump, local.sweepFreq,
      local.lobeFreq, local.lobeAmp, local.lobeThreshold, local.lobeDirection])

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

  const handleEnableToggle = (checked: boolean) => {
    if (!terrain) return
    if (checked) {
      setTerrainTypeBlobStyle(terrain, {
        enabled: true,
        smooth: terrainBlobSmooth,
        offset: terrainBlobOffset,
        bump: terrainBlobBump,
        sweepFreq: terrainBlobSweepFreq,
        lobeFreq: terrainBlobLobeFreq,
        lobeAmp: terrainBlobLobeAmp,
        lobeThreshold: terrainBlobLobeThreshold,
        lobeDirection: terrainBlobLobeDirection,
      })
    } else {
      setTerrainTypeBlobStyle(terrain, { enabled: false })
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

  const controlsDisabled = !isDefaults && !overrideEnabled

  const blobControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: controlsDisabled ? 0.4 : 1, pointerEvents: controlsDisabled ? 'none' : 'auto' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Corner Rounding</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{local.smooth}</span>
        </div>
        <input type="range" min={0} max={5} step={1} value={local.smooth}
          onChange={e => setBlob('smooth', Number(e.target.value))}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Waviness</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(local.bump * 100)}%</span>
        </div>
        <input type="range" min={0} max={60} step={1} value={Math.round(local.bump * 100)}
          onChange={e => setBlob('bump', Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Inset</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{local.offset > 0 ? '+' : ''}{Math.round(local.offset * 100)}%</span>
        </div>
        <input type="range" min={-80} max={30} step={1} value={Math.round(local.offset * 100)}
          onChange={e => setBlob('offset', Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Wave Scale</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{local.sweepFreq.toFixed(2)}</span>
        </div>
        <input type="range" min={40} max={100} step={1} value={Math.round(local.sweepFreq * 100)}
          onChange={e => setBlob('sweepFreq', Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Fringe Scale</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{local.lobeFreq.toFixed(1)}</span>
        </div>
        <input type="range" min={20} max={50} step={1} value={Math.round(local.lobeFreq * 10)}
          onChange={e => setBlob('lobeFreq', Number(e.target.value) / 10)}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Fringe Strength</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(local.lobeAmp * 100)}%</span>
        </div>
        <input type="range" min={0} max={100} step={1} value={Math.round(local.lobeAmp * 100)}
          onChange={e => setBlob('lobeAmp', Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span>Fringe Sparsity</span>
          <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(local.lobeThreshold * 100)}%</span>
        </div>
        <input type="range" min={0} max={40} step={1} value={Math.round(local.lobeThreshold * 100)}
          onChange={e => setBlob('lobeThreshold', Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: color }} />
      </div>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 5 }}>Fringe Direction</div>
        <ToggleButtonGroup
          options={[{ value: 'outward', label: 'Outward' }, { value: 'inward', label: 'Inward' }]}
          value={local.lobeDirection >= 0 ? 'outward' : 'inward'}
          onChange={v => setBlob('lobeDirection', v === 'outward' ? 1 : -1)}
        />
      </div>
    </div>
  )

  return (
    <FlyoutContainer
      top={Math.min(anchorY, window.innerHeight - 48)}
      scrollable
      data-terrain-flyout=""
    >
      <FlyoutHeader
        title={isDefaults ? 'Default blob shape' : terrain!.replace(/_/g, ' ')}
        onClose={onClose}
      />

      {isDefaults && showBlobSection && blobControls}

      {!isDefaults && (
        <>
          <div style={{ marginBottom: hasTexture ? 12 : 0 }}>
            <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a', display: 'block', marginBottom: 5 }}>Color</span>
            <ColorSwatch value={color} onChange={v => setTerrainColor(terrain!, v)} palette={PALETTE_TERRAIN} />
          </div>

          {hasTexture && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Texture Scale</span>
                <span style={{ color: '#5a5a7a', fontSize: 10 }}>{textureScale.toFixed(1)}×</span>
              </div>
              <input
                type="range" min={5} max={80} step={1}
                value={Math.round(textureScale * 10)}
                onChange={e => setTerrainTextureScale(terrain!, Number(e.target.value) / 10)}
                style={{ width: '100%', accentColor: color }}
              />
            </div>
          )}

          {/* hasWildness block — detached with field render */}

          {showBlobSection && (
            <div style={{ marginTop: 12, borderTop: '1px solid #1e1f2e', paddingTop: 10 }}>
              <EnabledSection
                label="Custom blob shape"
                enabled={overrideEnabled}
                onToggle={handleEnableToggle}
                accentColor={color}
              >
                {blobControls}
              </EnabledSection>
            </div>
          )}
        </>
      )}
    </FlyoutContainer>
  )
}
