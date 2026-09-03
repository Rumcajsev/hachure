import { useState, useEffect } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { useMapStore } from '../../store/mapStore'
import type { TerrainViewCanvasHandle } from '../TerrainViewCanvas'
import { shouldSuppressShortcut } from '../../lib/keyboard'

// ── Primitives ────────────────────────────────────────────────────────────────

function DockBtn({
  onClick, onMouseDown, onMouseUp, onMouseLeave, active, label, children,
}: {
  onClick?: () => void
  onMouseDown?: () => void
  onMouseUp?: () => void
  onMouseLeave?: () => void
  active?: boolean
  label: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <button
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      style={{
        height: 36,
        padding: '0 12px',
        display: 'flex', alignItems: 'center', gap: 7,
        background: active ? t.ink : 'none',
        border: 'none',
        cursor: 'pointer',
        color: active ? t.surface : t.ink2,
        flexShrink: 0,
      }}
    >
      {children}
      <span style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.4 }}>{label}</span>
    </button>
  )
}

function KbdChip({ label, active }: { label: string; active: boolean }) {
  const t = useTheme()
  return (
    <span style={{
      fontFamily: t.mono,
      fontSize: 9.5,
      color: active ? t.ink2 : t.inkFaint,
      padding: '1px 5px',
      borderTop: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
      borderLeft: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
      borderRight: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
      borderBottom: `2px solid ${active ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.18)'}`,
      background: t.paper,
      letterSpacing: 0,
    }}>
      {label}
    </span>
  )
}

function DockDivider() {
  const t = useTheme()
  return <div style={{ width: 1, height: 20, background: t.line, flexShrink: 0, margin: '0 2px' }} />
}

// ── BottomDock ────────────────────────────────────────────────────────────────

export function BottomDock({ canvasRef }: { canvasRef: React.RefObject<TerrainViewCanvasHandle | null> }) {
  const t = useTheme()
  const generatedHexes = useMapStore(s => s.generatedHexes)
  const blankMap = useMapStore(s => s.blankMap)
  const mapImageDataUrl = useMapStore(s => s.mapImageDataUrl)

  const hasMap = generatedHexes.length > 0 && !blankMap
  const hasRefImage = !!mapImageDataUrl

  const [mapPeekOn, setMapPeekOn] = useState(false)
  const [refPeekOn, setRefPeekOn] = useState(false)

  const mapPeekStart = () => { canvasRef.current?.peekStart(); setMapPeekOn(true) }
  const mapPeekEnd = () => { canvasRef.current?.peekEnd(); setMapPeekOn(false) }
  const refPeekStart = () => { canvasRef.current?.refImagePeekStart(); setRefPeekOn(true) }
  const refPeekEnd = () => { canvasRef.current?.refImagePeekEnd(); setRefPeekOn(false) }

  // Sync M key visual state
  useEffect(() => {
    let held = false
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || held) return
      if (shouldSuppressShortcut(e)) return
      held = true
      setMapPeekOn(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM') return
      held = false
      setMapPeekOn(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  // Sync N key visual state
  useEffect(() => {
    let held = false
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN' || held) return
      if (shouldSuppressShortcut(e)) return
      held = true
      setRefPeekOn(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN') return
      held = false
      setRefPeekOn(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  const handleZoomPhysical = () => {
    canvasRef.current?.zoomToPhysical()
  }

  const showDivider = hasMap || hasRefImage

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      background: t.surface,
      border: `1px solid ${t.line}`,
      boxShadow: t.shadowFlyout,
      pointerEvents: 'auto',
    }}>
      {hasMap && (
        <DockBtn onMouseDown={mapPeekStart} onMouseUp={mapPeekEnd} onMouseLeave={mapPeekEnd} active={mapPeekOn} label="Map peek">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 7s2.5-4.5 6-4.5S13 7 13 7s-2.5 4.5-6 4.5S1 7 1 7z" />
            <circle cx="7" cy="7" r="1.8" />
          </svg>
          <KbdChip label="M" active={mapPeekOn} />
        </DockBtn>
      )}

      {hasRefImage && (
        <DockBtn onMouseDown={refPeekStart} onMouseUp={refPeekEnd} onMouseLeave={refPeekEnd} active={refPeekOn} label="Ref image">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="2" width="12" height="10" rx="1" />
            <path d="M1 9.5l3-3 2.5 2.5 2-2.5 3.5 3.5" />
          </svg>
          <KbdChip label="N" active={refPeekOn} />
        </DockBtn>
      )}

      {showDivider && <DockDivider />}

      <DockBtn onClick={handleZoomPhysical} label="1:1">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
        </svg>
      </DockBtn>
    </div>
  )
}
