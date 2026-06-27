import { useEffect, useState } from 'react'
import { useMapStore, type BlobOverride } from '../store/mapStore'
import { useTheme } from '../context/ThemeContext'
import { MiniSlider } from './v2/sidebar'

interface Props {
  type: 'terrain' | 'edge'
  canonicalKey: string
  terrain?: string
  x: number
  y: number
  onClose: () => void
}

type Tab = 'simple' | 'detail'

export function BlobOverrideFlyout({ type, canonicalKey, terrain, x, y, onClose }: Props) {
  const t = useTheme()
  const [tab, setTab] = useState<Tab>('simple')
  const {
    terrainBlobOverrides, setTerrainBlobOverride,
    edgeBlobOverrides, setEdgeBlobOverride,
    terrainColors,
    terrainBlobSmooth, terrainBlobOffset, terrainBlobBump,
    terrainBlobSweepFreq,
    terrainBlobLobeFreq, terrainBlobLobeAmp, terrainBlobLobeThreshold, terrainBlobLobeDirection,
    edgeBlobWidth,
  } = useMapStore()

  const hasOverride = type === 'terrain'
    ? !!terrainBlobOverrides[canonicalKey]
    : !!edgeBlobOverrides[canonicalKey]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-blob-flyout]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const W = 220
  const clampedX = Math.min(x, window.innerWidth - W - 8)
  const clampedY = Math.min(y, window.innerHeight - 400)

  const override: BlobOverride = type === 'terrain'
    ? (terrainBlobOverrides[canonicalKey] ?? {})
    : (edgeBlobOverrides[canonicalKey] ?? {})

  const g = {
    smooth:        terrainBlobSmooth,
    offset:        terrainBlobOffset,
    bump:          terrainBlobBump,
    sweepFreq:     terrainBlobSweepFreq,
    lobeFreq:      terrainBlobLobeFreq,
    lobeAmp:       terrainBlobLobeAmp,
    lobeThreshold: terrainBlobLobeThreshold,
    lobeDirection: terrainBlobLobeDirection,
    width:         edgeBlobWidth,
  }

  const cur = {
    smooth:        override.smooth        ?? g.smooth,
    offset:        override.offset        ?? g.offset,
    bump:          override.bump          ?? g.bump,
    sweepFreq:     override.sweepFreq     ?? g.sweepFreq,
    lobeFreq:      override.lobeFreq      ?? g.lobeFreq,
    lobeAmp:       override.lobeAmp       ?? g.lobeAmp,
    lobeThreshold: override.lobeThreshold ?? g.lobeThreshold,
    lobeDirection: override.lobeDirection ?? g.lobeDirection,
    width:         override.width         ?? g.width,
  }

  const setOverride = (patch: BlobOverride) => {
    if (type === 'terrain') setTerrainBlobOverride(canonicalKey, { terrain, ...patch })
    else setEdgeBlobOverride(canonicalKey, patch)
  }

  const undef = <T,>(v: T, gv: T): T | undefined => v === gv ? undefined : v

  const setFringe = (amp: number) => {
    const freq = 2.0 + amp * 3.0
    setOverride({
      lobeAmp: undef(amp, g.lobeAmp),
      lobeFreq: undef(freq, g.lobeFreq),
      lobeThreshold: undef(0, g.lobeThreshold),
    })
  }

  const reset = () => {
    if (type === 'terrain') setTerrainBlobOverride(canonicalKey, null)
    else setEdgeBlobOverride(canonicalKey, null)
    onClose()
  }

  const accentColor = terrainColors[terrain!] ?? t.rust

  const title = type === 'terrain'
    ? (terrain?.replace(/_/g, ' ') ?? 'blob')
    : `edge · ${terrain?.replace(/_/g, ' ') ?? 'blob'}`

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: '3px 0',
    fontFamily: t.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    background: active ? t.ink : 'transparent',
    color: active ? t.surface : t.inkFaint,
    border: `1px solid ${active ? t.ink : t.line}`,
    marginLeft: -1,
    cursor: 'pointer',
    position: 'relative' as const,
    zIndex: active ? 1 : 0,
  })

  return (
    <div
      data-blob-flyout=""
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        width: W,
        background: t.surface,
        borderTop: `1px solid ${t.line}`,
        borderRight: `1px solid ${t.line}`,
        borderBottom: `1px solid ${t.line}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 2,
        boxShadow: t.shadowFlyout,
        zIndex: 200,
        fontFamily: t.mono,
        fontSize: 11,
        color: t.ink,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px 6px',
        borderBottom: `1px solid ${t.line2}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, color: t.ink, textTransform: 'capitalize' }}>
            {title}
          </span>
          {hasOverride && (
            <span style={{ fontFamily: t.mono, fontSize: 8, letterSpacing: 0.4, color: t.rust, textTransform: 'uppercase' }}>
              modified
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: t.inkFaint, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.ink)}
          onMouseLeave={e => (e.currentTarget.style.color = t.inkFaint)}
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '6px 10px 0' }}>
        <button style={tabStyle(tab === 'simple')} onClick={() => setTab('simple')}>Simple</button>
        <button style={tabStyle(tab === 'detail')} onClick={() => setTab('detail')}>Detail</button>
      </div>

      {/* Controls */}
      <div style={{ padding: '4px 0 8px' }}>
        {tab === 'simple' ? (
          <>
            {type === 'edge' && (
              <MiniSlider label="Width" display={`${Math.round(cur.width * 100)}%`}
                value={Math.round(cur.width * 100)} min={5} max={80} step={1}
                onChange={v => setOverride({ width: undef(v / 100, g.width) })}
                accentColor={accentColor} />
            )}
            <MiniSlider label="Corner Rounding" display={cur.smooth}
              value={cur.smooth} min={0} max={5} step={1}
              onChange={v => setOverride({ smooth: undef(v, g.smooth) })}
              accentColor={accentColor} />
            <MiniSlider label="Waviness" display={`${Math.round(cur.bump * 100)}%`}
              value={Math.round(cur.bump * 100)} min={0} max={60} step={1}
              onChange={v => setOverride({ bump: undef(v / 100, g.bump) })}
              accentColor={accentColor} />
            <MiniSlider label="Inset" display={`${cur.offset > 0 ? '+' : ''}${Math.round(cur.offset * 100)}%`}
              value={Math.round(cur.offset * 100)} min={-80} max={30} step={1}
              onChange={v => setOverride({ offset: undef(v / 100, g.offset) })}
              accentColor={accentColor} />
            <MiniSlider label="Fringe" display={`${Math.round(cur.lobeAmp * 100)}%`}
              value={Math.round(cur.lobeAmp * 100)} min={0} max={100} step={1}
              onChange={v => setFringe(v / 100)}
              accentColor={accentColor} />
          </>
        ) : (
          <>
            {type === 'edge' && (
              <MiniSlider label="Width" display={`${Math.round(cur.width * 100)}%`}
                value={Math.round(cur.width * 100)} min={5} max={80} step={1}
                onChange={v => setOverride({ width: undef(v / 100, g.width) })}
                accentColor={accentColor} />
            )}
            <MiniSlider label="Corner Rounding" display={cur.smooth}
              value={cur.smooth} min={0} max={5} step={1}
              onChange={v => setOverride({ smooth: undef(v, g.smooth) })}
              accentColor={accentColor} />
            <MiniSlider label="Waviness" display={`${Math.round(cur.bump * 100)}%`}
              value={Math.round(cur.bump * 100)} min={0} max={60} step={1}
              onChange={v => setOverride({ bump: undef(v / 100, g.bump) })}
              accentColor={accentColor} />
            <MiniSlider label="Inset" display={`${cur.offset > 0 ? '+' : ''}${Math.round(cur.offset * 100)}%`}
              value={Math.round(cur.offset * 100)} min={-80} max={30} step={1}
              onChange={v => setOverride({ offset: undef(v / 100, g.offset) })}
              accentColor={accentColor} />
            <MiniSlider label="Wave Scale" display={cur.sweepFreq.toFixed(2)}
              value={Math.round(cur.sweepFreq * 100)} min={40} max={100} step={1}
              onChange={v => setOverride({ sweepFreq: undef(v / 100, g.sweepFreq) })}
              accentColor={accentColor} />
            <MiniSlider label="Fringe Strength" display={`${Math.round(cur.lobeAmp * 100)}%`}
              value={Math.round(cur.lobeAmp * 100)} min={0} max={100} step={1}
              onChange={v => setOverride({ lobeAmp: undef(v / 100, g.lobeAmp) })}
              accentColor={accentColor} />
            <MiniSlider label="Fringe Scale" display={cur.lobeFreq.toFixed(1)}
              value={Math.round(cur.lobeFreq * 10)} min={20} max={50} step={1}
              onChange={v => setOverride({ lobeFreq: undef(v / 10, g.lobeFreq) })}
              accentColor={accentColor} />
            <MiniSlider label="Fringe Sparsity" display={`${Math.round(cur.lobeThreshold * 100)}%`}
              value={Math.round(cur.lobeThreshold * 100)} min={0} max={40} step={1}
              onChange={v => setOverride({ lobeThreshold: undef(v / 100, g.lobeThreshold) })}
              accentColor={accentColor} />
            <div style={{ padding: '2px 14px 0' }}>
              <div style={{ fontFamily: t.mono, fontSize: 10, color: t.ink2, marginBottom: 4 }}>Fringe Direction</div>
              <div style={{ display: 'flex' }}>
                {(['Outward', 'Inward'] as const).map((label, i) => {
                  const dir = i === 0 ? 1 : -1
                  const active = i === 0 ? cur.lobeDirection >= 0 : cur.lobeDirection < 0
                  return (
                    <button key={label}
                      onClick={() => setOverride({ lobeDirection: undef(dir, g.lobeDirection) })}
                      style={{
                        flex: 1, padding: '3px 0',
                        fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase',
                        background: active ? t.ink : 'transparent',
                        color: active ? t.surface : t.inkFaint,
                        border: `1px solid ${active ? t.ink : t.line}`,
                        marginLeft: i > 0 ? -1 : 0,
                        cursor: 'pointer',
                        position: 'relative', zIndex: active ? 1 : 0,
                      }}
                    >{label}</button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {hasOverride && (
          <div style={{ margin: '6px 14px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 6 }}>
            <button
              onClick={reset}
              style={{
                width: '100%', padding: '4px 0', background: 'none',
                border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer',
                fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = t.ink)}
              onMouseLeave={e => (e.currentTarget.style.color = t.inkMute)}
            >
              Reset to global
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
