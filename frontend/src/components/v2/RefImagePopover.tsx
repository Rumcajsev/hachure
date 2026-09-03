import { useRef, useEffect } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'

export function RefImagePopover({
  anchorRef,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const t = useTheme()
  const {
    mapImageDataUrl,
    mapImageOpacity,
    mapImageTransform,
    activeTool,
    setMapImageDataUrl,
    setMapImageOpacity,
    setMapImageTransform,
    setActiveTool,
    removeReferenceImage,
  } = useMapStore()

  const popoverRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Anchor left edge to the button
  const anchorLeft = anchorRef.current?.getBoundingClientRect().left ?? 0

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        setMapImageDataUrl(dataUrl, img.naturalWidth, img.naturalHeight)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const isAligning = activeTool.type === 'align-image'

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: t.topBarHeight,
        left: anchorLeft,
        zIndex: 200,
        width: 220,
        background: t.paper,
        border: `1px solid ${t.line}`,
        boxShadow: t.shadowFlyout,
        fontFamily: t.sans,
        color: t.ink,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${t.line2}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: t.inkMute }}>
          Reference Image
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.inkFaint, padding: 2, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Upload / change / remove controls */}
        {!mapImageDataUrl ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '9px 0',
              background: t.surface,
              border: `1px dashed ${t.line}`,
              cursor: 'pointer',
              fontFamily: t.sans,
              fontSize: 11,
              color: t.inkMute,
              letterSpacing: 0.3,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.inkFaint }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.line }}
          >
            Upload image…
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                padding: '6px 0',
                background: 'none',
                border: `1px solid ${t.line}`,
                cursor: 'pointer',
                fontFamily: t.sans,
                fontSize: 10,
                color: t.inkMute,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = t.paper2 }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              Change
            </button>
            <button
              onClick={() => { removeReferenceImage(); onClose() }}
              style={{
                flex: 1,
                padding: '6px 0',
                background: 'none',
                border: `1px solid ${t.line}`,
                cursor: 'pointer',
                fontFamily: t.sans,
                fontSize: 10,
                color: t.rust,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = t.paper2 }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              Remove
            </button>
          </div>
        )}

        {/* Sliders — only when image is loaded */}
        {mapImageDataUrl && (
          <>
            <SliderRow
              label="Opacity"
              value={Math.round(mapImageOpacity * 100)}
              unit="%"
              min={0} max={100} step={1}
              onChange={v => setMapImageOpacity(v / 100)}
            />
            <SliderRow
              label="Rotation"
              value={Math.round(mapImageTransform.rotation)}
              unit="°"
              min={-180} max={180} step={1}
              onChange={v => setMapImageTransform({ rotation: v })}
            />

            {/* Align toggle */}
            <button
              onClick={() => setActiveTool(isAligning ? { type: 'none' } : { type: 'align-image' })}
              style={{
                width: '100%',
                padding: '7px 0',
                background: isAligning ? t.rust : 'none',
                border: `1px solid ${isAligning ? t.rust : t.line}`,
                cursor: 'pointer',
                fontFamily: t.sans,
                fontSize: 10,
                color: isAligning ? '#fff' : t.inkMute,
                letterSpacing: 0.3,
              }}
              onMouseEnter={e => {
                if (!isAligning) e.currentTarget.style.background = t.paper2
              }}
              onMouseLeave={e => {
                if (!isAligning) e.currentTarget.style.background = 'none'
              }}
            >
              {isAligning ? 'Drag / scroll to position — active' : 'Drag / scroll to position'}
            </button>
            {isAligning && (
              <div style={{ fontFamily: t.sans, fontSize: 10, color: t.inkFaint, lineHeight: 1.4 }}>
                Drag to move · scroll to scale
              </div>
            )}
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function SliderRow({
  label, value, unit, min, max, step, onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: t.inkMute }}>
          {label}
        </span>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.ink }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: t.rust }}
      />
    </div>
  )
}
