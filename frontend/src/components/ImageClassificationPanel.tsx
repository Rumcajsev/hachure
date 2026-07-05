import { useState, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useMapStore, TERRAIN_COLORS, type ClassRule } from '../store/mapStore'
import { STRIP_W, MiniSlider, tintBg } from './v2/sidebar'

const PANEL_W = 520
const CLASSIFY_TERRAINS = ['water', 'marsh', 'woods', 'light_woods', 'rough']

const terrainLabel = (t: string) => t.replace(/_/g, ' ')

// ── Draggable swatch chip (left column) ────────────────────────────────────────

function SwatchChip({
  id, color, tolerance, assigned, onDragStart, onToleranceChange, onRemove,
}: {
  id: number
  color: string
  tolerance: number
  assigned: boolean
  onDragStart: (id: number) => void
  onToleranceChange: (v: number) => void
  onRemove: () => void
}) {
  const t = useTheme()
  const [localPct, setLocalPct] = useState(tolerance)
  const draggingRef = useRef(false)
  const localRef = useRef(tolerance)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevTolerance = useRef(tolerance)
  if (prevTolerance.current !== tolerance && !draggingRef.current) {
    prevTolerance.current = tolerance
    localRef.current = tolerance
    setLocalPct(tolerance)
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(id)}
      style={{
        padding: '4px 8px',
        background: assigned ? t.surfaceAlt : t.surface,
        border: `1px solid ${t.line}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        cursor: 'grab',
        opacity: assigned ? 0.5 : 1,
        marginBottom: 4,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 16, marginBottom: 4 }}>
        <div style={{ width: 12, height: 12, background: color, flexShrink: 0, borderRadius: 2, border: `1px solid ${t.line}` }} />
        <span style={{ fontSize: 10, fontFamily: t.mono, color: t.inkMute }}>{color}</span>
      </div>
      <MiniSlider
        label="tolerance"
        display={`${localPct}`}
        value={localPct}
        min={0} max={150} step={1}
        accentColor={color}
        onChange={v => {
          localRef.current = v
          setLocalPct(v)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null
            onToleranceChange(localRef.current)
          }, 150)
        }}
        onDragStart={() => { draggingRef.current = true }}
        onDragEnd={() => {
          draggingRef.current = false
          if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
          onToleranceChange(localRef.current)
        }}
      />
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          position: 'absolute', top: 4, right: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.inkMute, fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}
      >×</button>
    </div>
  )
}

// ── Assigned rule row (inside terrain drop zone) ──────────────────────────────

function AssignedImageRule({
  color, threshold, onThresholdChange, onRemove,
}: {
  color: string
  threshold: number
  onThresholdChange: (v: number) => void
  onRemove: () => void
}) {
  const t = useTheme()
  const [localPct, setLocalPct] = useState(() => Math.round(threshold * 100))
  const localRef = useRef(threshold)
  const draggingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevThreshold = useRef(threshold)
  if (prevThreshold.current !== threshold && !draggingRef.current) {
    prevThreshold.current = threshold
    localRef.current = threshold
    setLocalPct(Math.round(threshold * 100))
  }

  return (
    <div style={{
      background: t.surfaceAlt,
      border: `1px solid ${t.line}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 3,
      marginBottom: 3,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingRight: 24 }}>
        <div style={{ flex: 1 }}>
          <MiniSlider
            label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: color, borderRadius: 2, display: 'inline-block' }} />
              area
            </span>}
            display={`${localPct}%`}
            value={localPct}
            min={1} max={100} step={1}
            accentColor={color}
            onChange={v => {
              localRef.current = v / 100
              setLocalPct(v)
              if (debounceRef.current) clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => {
                debounceRef.current = null
                onThresholdChange(localRef.current)
              }, 150)
            }}
            onDragStart={() => { draggingRef.current = true }}
            onDragEnd={() => {
              draggingRef.current = false
              if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
              onThresholdChange(localRef.current)
            }}
          />
        </div>
      </div>
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          position: 'absolute', top: '50%', right: 6,
          transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.inkMute, fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}
      >×</button>
    </div>
  )
}

// ── Terrain drop target ───────────────────────────────────────────────────────

function ImageDropZone({
  terrain, rules, color, swatchColors, onDrop, onThresholdChange, onRemove,
}: {
  terrain: string
  rules: ClassRule[]
  color: string
  swatchColors: Map<number, string>
  onDrop: (terrain: string) => void
  onThresholdChange: (terrain: string, swatchId: number, v: number) => void
  onRemove: (terrain: string, swatchId: number) => void
}) {
  const t = useTheme()
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(terrain) }}
      style={{
        borderRadius: 4,
        border: `1px solid ${dragOver ? color : t.line}`,
        borderLeft: `3px solid ${color}`,
        background: t.surfaceAlt,
        marginBottom: 8,
        overflow: 'hidden',
        transition: 'border-color 0.1s',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        background: dragOver ? `${color}30` : `${color}18`,
        transition: 'background 0.1s',
      }}>
        <div style={{ width: 10, height: 10, background: color, flexShrink: 0, borderRadius: 1 }} />
        <span style={{ fontSize: 11, fontFamily: t.mono, color: t.ink, textTransform: 'capitalize', flex: 1 }}>
          {terrainLabel(terrain)}
        </span>
        {rules.length === 0 && (
          <span style={{ fontSize: 10, color: t.inkMute, fontFamily: t.mono }}>drop swatch here</span>
        )}
      </div>
      <div style={{ padding: rules.length > 0 ? '6px 8px' : 0 }}>
        {rules.map(rule => (
          <AssignedImageRule
            key={rule.classCode}
            color={swatchColors.get(rule.classCode) ?? '#888'}
            threshold={rule.threshold}
            onThresholdChange={v => onThresholdChange(terrain, rule.classCode, v)}
            onRemove={() => onRemove(terrain, rule.classCode)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ImageClassificationPanel({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    imageSwatches, addImageSwatch, updateImageSwatchTolerance, removeImageSwatch,
    terrainRules, setClassRule, setTerrainRules, terrainColors, mapImageDataUrl,
    setActiveTool, activeTool,
  } = useMapStore()
  const draggingId = useRef<number | null>(null)

  const assignedIds = new Set(
    Object.values(terrainRules).flat().map(r => r.classCode)
  )
  const swatchColors = new Map(imageSwatches.map(s => [s.id, s.color]))

  const handleDrop = (terrain: string) => {
    const id = draggingId.current
    if (id === null) return
    const existing = (terrainRules[terrain] ?? []).find(r => r.classCode === id)
    if (!existing) {
      setClassRule(terrain, id, { classCode: id, threshold: 0.3 })
    }
    draggingId.current = null
  }

  const handleThresholdChange = (terrain: string, swatchId: number, v: number) => {
    setClassRule(terrain, swatchId, { classCode: swatchId, threshold: v })
  }

  const handleRemoveRule = (terrain: string, swatchId: number) => {
    setClassRule(terrain, swatchId, null)
  }

  const handleReset = () => {
    setTerrainRules({})
  }

  const isEyedropperActive = activeTool.type === 'image-eyedropper'

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: STRIP_W,
      width: PANEL_W,
      maxHeight: '100%',
      overflowY: 'auto',
      background: t.surface,
      borderTop: `1px solid ${t.line}`,
      borderRight: `1px solid ${t.line}`,
      borderBottom: `1px solid ${t.line}`,
      borderLeft: `3px solid ${t.ink}`,
      boxShadow: t.shadowFlyout,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px 6px',
        borderBottom: `1px solid ${t.line}`,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ink, fontFamily: t.mono }}>
            Image Color Classification
          </div>
          <div style={{ fontSize: 10, color: t.inkMute, fontFamily: t.mono }}>
            Eyedropper a color, drag onto a terrain type
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={handleReset}
            title="Clear all rules"
            style={{
              fontSize: 10, fontFamily: t.mono, color: t.inkMute,
              background: 'none', border: `1px solid ${t.line}`,
              borderRadius: 3, padding: '2px 6px', cursor: 'pointer',
            }}
          >clear rules</button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: t.inkMute, fontSize: 16, lineHeight: 1, padding: '0 2px',
            }}
          >×</button>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: picked color swatches */}
        <div style={{
          width: 180, flexShrink: 0,
          borderRight: `1px solid ${t.line}`,
          padding: '8px 8px',
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Colors
          </div>
          <button
            onClick={() => setActiveTool(isEyedropperActive ? { type: 'none' } : { type: 'image-eyedropper' })}
            disabled={!mapImageDataUrl}
            style={{
              width: '100%', padding: '6px 0', marginBottom: 8,
              background: isEyedropperActive ? tintBg(t.rust, 0.15) : 'none',
              border: `1px solid ${isEyedropperActive ? t.rust : t.line}`,
              color: isEyedropperActive ? t.rust : (mapImageDataUrl ? t.ink : t.inkMute),
              borderRadius: 3, cursor: mapImageDataUrl ? 'pointer' : 'not-allowed',
              fontFamily: t.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            {isEyedropperActive ? 'Click map to pick…' : 'Eyedropper'}
          </button>
          {imageSwatches.map(s => (
            <SwatchChip
              key={s.id}
              id={s.id}
              color={s.color}
              tolerance={s.tolerance}
              assigned={assignedIds.has(s.id)}
              onDragStart={id => { draggingId.current = id }}
              onToleranceChange={v => updateImageSwatchTolerance(s.id, v)}
              onRemove={() => removeImageSwatch(s.id)}
            />
          ))}
          {imageSwatches.length === 0 && (
            <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, lineHeight: 1.4 }}>
              No colors picked yet. Hold Space to peek at the source image, click Eyedropper, then click a point on the map.
            </div>
          )}
          <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, marginTop: 4, lineHeight: 1.4 }}>
            Dimmed = already assigned. Drag onto a terrain to assign.
          </div>
        </div>

        {/* Right: Terrain drop targets */}
        <div style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Terrain types
          </div>
          {CLASSIFY_TERRAINS.map(terrain => (
            <ImageDropZone
              key={terrain}
              terrain={terrain}
              rules={terrainRules[terrain] ?? []}
              color={terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888'}
              swatchColors={swatchColors}
              onDrop={handleDrop}
              onThresholdChange={handleThresholdChange}
              onRemove={handleRemoveRule}
            />
          ))}
          <div style={{
            borderRadius: 4,
            border: `1px dashed ${t.line}`,
            padding: '6px 8px',
            opacity: 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, background: terrainColors['clear'] ?? TERRAIN_COLORS['clear'] ?? '#ede8d5', flexShrink: 0, borderRadius: 1 }} />
              <span style={{ fontSize: 11, fontFamily: t.mono, color: t.inkMute }}>clear — fallback for unmatched hexes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
