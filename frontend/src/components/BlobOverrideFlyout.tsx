import { useEffect } from 'react'
import { useMapStore, WATER_COLOR, type BlobOverride } from '../store/mapStore'

interface Props {
  type: 'terrain' | 'water' | 'edge'
  canonicalKey: string
  terrain?: string
  x: number
  y: number
  onClose: () => void
}

export function BlobOverrideFlyout({ type, canonicalKey, terrain, x, y, onClose }: Props) {
  const {
    terrainBlobOverrides, setTerrainBlobOverride,
    waterOverrides, setWaterOverride,
    edgeBlobOverrides, setEdgeBlobOverride,
    terrainColors,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump,
    terrainBlobSweepFreq, terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
    edgeBlobWidth,
  } = useMapStore()

  const hasOverride = type === 'terrain'
    ? !!terrainBlobOverrides[canonicalKey]
    : type === 'water'
      ? !!waterOverrides[canonicalKey]
      : !!edgeBlobOverrides[canonicalKey]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-blob-flyout]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const W = 210
  const estH = type === 'edge' ? 200 : 180
  const clampedX = Math.min(x, window.innerWidth - W - 8)
  const clampedY = Math.min(y, window.innerHeight - estH - 8)

  const override: BlobOverride = type === 'terrain'
    ? (terrainBlobOverrides[canonicalKey] ?? {})
    : type === 'water'
      ? (waterOverrides[canonicalKey] ?? {})
      : (edgeBlobOverrides[canonicalKey] ?? {})

  // Edge blobs inherit shape from terrain blob global params; only width is edge-specific.
  const globalSmooth        = terrainBlobSmooth
  const globalOffset        = terrainBlobOffset
  const globalBump          = terrainBlobBump
  const globalSweepFreq     = terrainBlobSweepFreq
  const globalLobeFreq      = terrainBlobLobeFreq
  const globalLobeAmp       = terrainBlobLobeAmp
  const globalLobeThreshold = terrainBlobLobeThreshold
  const globalLobeDirection = terrainBlobLobeDirection
  const globalWidth         = edgeBlobWidth

  const currentSmooth        = override.smooth        ?? globalSmooth
  const currentOffset        = override.offset        ?? globalOffset
  const currentBump          = override.bump          ?? globalBump
  const currentSweepFreq     = override.sweepFreq     ?? globalSweepFreq
  const currentLobeFreq      = override.lobeFreq      ?? globalLobeFreq
  const currentLobeAmp       = override.lobeAmp       ?? globalLobeAmp
  const currentLobeThreshold = override.lobeThreshold ?? globalLobeThreshold
  const currentLobeDirection = override.lobeDirection ?? globalLobeDirection
  const currentWidth         = override.width         ?? globalWidth

  const setOverride = (patch: BlobOverride) => {
    if (type === 'terrain') setTerrainBlobOverride(canonicalKey, { terrain, ...patch })
    else if (type === 'water') setWaterOverride(canonicalKey, patch)
    else setEdgeBlobOverride(canonicalKey, patch)
  }

  const fieldVal = (sliderInt: number, globalSliderInt: number, transform: (v: number) => number): number | undefined =>
    sliderInt === globalSliderInt ? undefined : transform(sliderInt)

  const reset = () => {
    if (type === 'terrain') setTerrainBlobOverride(canonicalKey, null)
    else if (type === 'water') setWaterOverride(canonicalKey, null)
    else setEdgeBlobOverride(canonicalKey, null)
    onClose()
  }

  const accentColor = type === 'terrain'
    ? (terrainColors[terrain!] ?? '#7a9e7a')
    : type === 'water'
      ? (terrainColors['water'] ?? WATER_COLOR)
      : (terrainColors[terrain!] ?? '#7a9e7a')

  const title = type === 'terrain'
    ? (terrain?.replace(/_/g, ' ') ?? 'blob')
    : type === 'water'
      ? 'water'
      : `edge · ${terrain?.replace(/_/g, ' ') ?? 'blob'}`

  return (
    <div
      data-blob-flyout=""
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        width: W,
        background: '#0e0f18',
        border: '1px solid #2a2a4a',
        borderRadius: 4,
        padding: '10px 12px',
        zIndex: 200,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        color: '#a0a0c0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#e0e0f0', textTransform: 'capitalize', letterSpacing: 0.5, fontWeight: 500 }}>
          {title}
          {hasOverride && <span style={{ color: '#5a7a5a', fontSize: 9, marginLeft: 5 }}>overridden</span>}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#4a4a6a', cursor: 'pointer', padding: '0 2px', fontSize: 15, lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#a0a0c0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#4a4a6a')}
        >×</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {type === 'edge' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Width</span>
                <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(currentWidth * 100)}%</span>
              </div>
              <input type="range" min={5} max={80} step={1} value={Math.round(currentWidth * 100)}
                onChange={e => setOverride({ width: fieldVal(Number(e.target.value), Math.round(globalWidth * 100), v => v / 100) })}
                style={{ width: '100%', accentColor }} />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Corner Rounding</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{currentSmooth}</span>
            </div>
            <input type="range" min={0} max={5} step={1} value={currentSmooth}
              onChange={e => setOverride({ smooth: fieldVal(Number(e.target.value), globalSmooth, v => v) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Waviness</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(currentBump * 100)}%</span>
            </div>
            <input type="range" min={0} max={60} step={1} value={Math.round(currentBump * 100)}
              onChange={e => setOverride({ bump: fieldVal(Number(e.target.value), Math.round(globalBump * 100), v => v / 100) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Inset</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{currentOffset > 0 ? '+' : ''}{Math.round(currentOffset * 100)}%</span>
            </div>
            <input type="range" min={-80} max={30} step={1} value={Math.round(currentOffset * 100)}
              onChange={e => setOverride({ offset: fieldVal(Number(e.target.value), Math.round(globalOffset * 100), v => v / 100) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Wave Scale</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{currentSweepFreq.toFixed(2)}</span>
            </div>
            <input type="range" min={40} max={100} step={1} value={Math.round(currentSweepFreq * 100)}
              onChange={e => setOverride({ sweepFreq: fieldVal(Number(e.target.value), Math.round(globalSweepFreq * 100), v => v / 100) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Fringe Scale</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{currentLobeFreq.toFixed(1)}</span>
            </div>
            <input type="range" min={20} max={50} step={1} value={Math.round(currentLobeFreq * 10)}
              onChange={e => setOverride({ lobeFreq: fieldVal(Number(e.target.value), Math.round(globalLobeFreq * 10), v => v / 10) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Fringe Strength</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(currentLobeAmp * 100)}%</span>
            </div>
            <input type="range" min={0} max={100} step={1} value={Math.round(currentLobeAmp * 100)}
              onChange={e => setOverride({ lobeAmp: fieldVal(Number(e.target.value), Math.round(globalLobeAmp * 100), v => v / 100) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a' }}>Fringe Sparsity</span>
              <span style={{ color: '#5a5a7a', fontSize: 10 }}>{Math.round(currentLobeThreshold * 100)}%</span>
            </div>
            <input type="range" min={0} max={40} step={1} value={Math.round(currentLobeThreshold * 100)}
              onChange={e => setOverride({ lobeThreshold: fieldVal(Number(e.target.value), Math.round(globalLobeThreshold * 100), v => v / 100) })}
              style={{ width: '100%', accentColor }} />
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 5 }}>Fringe Direction</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([['Outward', 1], ['Inward', -1]] as const).map(([label, dir]) => {
                const active = dir === 1 ? currentLobeDirection >= 0 : currentLobeDirection < 0
                return (
                  <button key={label} onClick={() => setOverride({ lobeDirection: dir === globalLobeDirection ? undefined : dir })} style={{
                    flex: 1, padding: '3px 0', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                    background: active ? '#2a3a5a' : 'none', border: '1px solid #2a2a4a',
                    color: active ? '#8ab0e0' : '#4a4a6a', borderRadius: 3, cursor: 'pointer', fontFamily: 'ui-monospace, monospace',
                  }}>{label}</button>
                )
              })}
            </div>
          </div>
          {hasOverride && (
            <button
              onClick={reset}
              style={{ background: 'none', border: '1px solid #3a2a2a', color: '#7a4a4a', borderRadius: 3, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, marginTop: 2 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#b06060')}
              onMouseLeave={e => (e.currentTarget.style.color = '#7a4a4a')}
            >Reset to global</button>
          )}
      </div>
    </div>
  )
}
