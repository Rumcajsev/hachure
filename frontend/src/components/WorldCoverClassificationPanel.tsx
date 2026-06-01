import { useState, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useMapStore, WORLDCOVER_CLASSES, DEFAULT_TERRAIN_RULES, TERRAIN_COLORS, type ClassRule } from '../store/mapStore'
import { STRIP_W } from './v2/sidebar'

const PANEL_W = 440

const CLASSIFY_TERRAINS = ['water', 'marsh', 'woods', 'light_woods', 'rough']

const terrainLabel = (t: string) => t.replace(/_/g, ' ')

// ── Draggable class chip ──────────────────────────────────────────────────────

function ClassChip({
  code, name, color, assigned, onDragStart,
}: {
  code: number
  name: string
  color: string
  assigned: boolean
  onDragStart: (code: number) => void
}) {
  const t = useTheme()
  return (
    <div
      draggable
      onDragStart={() => onDragStart(code)}
      title={`Class ${code}: ${name}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px',
        background: assigned ? t.surfaceAlt : t.surface,
        border: `1px solid ${t.line}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        cursor: 'grab',
        opacity: assigned ? 0.5 : 1,
        fontSize: 11,
        fontFamily: t.mono,
        color: t.ink,
        userSelect: 'none',
        marginBottom: 4,
      }}
    >
      <span style={{ color: t.inkMute, minWidth: 24 }}>{code}</span>
      <span>{name}</span>
    </div>
  )
}

// ── Assigned rule row (inside terrain drop zone) ──────────────────────────────

function AssignedRule({
  code, threshold, onThresholdChange, onRemove,
}: {
  code: number
  threshold: number
  onThresholdChange: (v: number) => void
  onRemove: () => void
}) {
  const t = useTheme()
  const cls = WORLDCOVER_CLASSES.find(c => c.code === code)
  if (!cls) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 6px 3px 8px',
      background: t.surfaceAlt,
      border: `1px solid ${t.line}`,
      borderLeft: `3px solid ${cls.color}`,
      borderRadius: 3,
      marginBottom: 3,
    }}>
      <span style={{ fontSize: 10, color: t.inkMute, fontFamily: t.mono, minWidth: 22 }}>{code}</span>
      <span style={{ fontSize: 11, color: t.ink, flex: 1, fontFamily: t.mono }}>{cls.name}</span>
      <span style={{ fontSize: 10, color: t.inkMute, minWidth: 30, textAlign: 'right', fontFamily: t.mono }}>
        {Math.round(threshold * 100)}%
      </span>
      <input
        type="range"
        min={1} max={100} step={1}
        value={Math.round(threshold * 100)}
        onChange={e => onThresholdChange(Number(e.target.value) / 100)}
        style={{ width: 70, cursor: 'pointer' }}
      />
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.inkMute, fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}
      >×</button>
    </div>
  )
}

// ── Terrain drop target ───────────────────────────────────────────────────────

function TerrainDropZone({
  terrain, rules, color, onDrop, onThresholdChange, onRemove,
}: {
  terrain: string
  rules: ClassRule[]
  color: string
  onDrop: (terrain: string, code: number) => void
  onThresholdChange: (terrain: string, code: number, v: number) => void
  onRemove: (terrain: string, code: number) => void
}) {
  const t = useTheme()
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(terrain, -1 /* resolved by parent */) }}
      style={{
        borderRadius: 4,
        border: `1px solid ${dragOver ? color : t.line}`,
        background: dragOver ? `${color}18` : t.surfaceAlt,
        padding: '6px 8px',
        marginBottom: 8,
        transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: rules.length > 0 ? 6 : 0 }}>
        <div style={{ width: 10, height: 10, background: color, flexShrink: 0, borderRadius: 1 }} />
        <span style={{ fontSize: 11, fontFamily: t.mono, color: t.ink, textTransform: 'capitalize', flex: 1 }}>
          {terrainLabel(terrain)}
        </span>
        {rules.length === 0 && (
          <span style={{ fontSize: 10, color: t.inkMute, fontFamily: t.mono }}>drop class here</span>
        )}
      </div>
      {rules.map(rule => (
        <AssignedRule
          key={rule.classCode}
          code={rule.classCode}
          threshold={rule.threshold}
          onThresholdChange={v => onThresholdChange(terrain, rule.classCode, v)}
          onRemove={() => onRemove(terrain, rule.classCode)}
        />
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function WorldCoverClassificationPanel({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { terrainRules, terrainColors, setClassRule, setTerrainRules } = useMapStore()
  const draggingCode = useRef<number | null>(null)

  const assignedCodes = new Set(
    Object.values(terrainRules).flat().map(r => r.classCode)
  )

  const handleDrop = (terrain: string) => {
    const code = draggingCode.current
    if (code === null) return
    const existing = (terrainRules[terrain] ?? []).find(r => r.classCode === code)
    if (!existing) {
      setClassRule(terrain, code, { classCode: code, threshold: 0.3 })
    }
    draggingCode.current = null
  }

  const handleThresholdChange = (terrain: string, code: number, v: number) => {
    setClassRule(terrain, code, { classCode: code, threshold: v })
  }

  const handleRemove = (terrain: string, code: number) => {
    setClassRule(terrain, code, null)
  }

  const handleReset = () => {
    setTerrainRules({ ...DEFAULT_TERRAIN_RULES })
  }

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
            WorldCover Classification
          </div>
          <div style={{ fontSize: 10, color: t.inkMute, fontFamily: t.mono }}>
            Drag classes onto terrain types · live reclassification
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={handleReset}
            title="Reset to defaults"
            style={{
              fontSize: 10, fontFamily: t.mono, color: t.inkMute,
              background: 'none', border: `1px solid ${t.line}`,
              borderRadius: 3, padding: '2px 6px', cursor: 'pointer',
            }}
          >reset</button>
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

        {/* Left: WorldCover classes */}
        <div style={{
          width: 180, flexShrink: 0,
          borderRight: `1px solid ${t.line}`,
          padding: '8px 8px',
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Classes
          </div>
          {WORLDCOVER_CLASSES.map(cls => (
            <ClassChip
              key={cls.code}
              code={cls.code}
              name={cls.name}
              color={cls.color}
              assigned={assignedCodes.has(cls.code)}
              onDragStart={code => { draggingCode.current = code }}
            />
          ))}
          <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, marginTop: 4, lineHeight: 1.4 }}>
            Dimmed = already assigned.<br />Drag to assign to multiple terrains.
          </div>
        </div>

        {/* Right: Terrain drop targets */}
        <div style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontFamily: t.mono, color: t.inkMute, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Terrain types
          </div>
          {CLASSIFY_TERRAINS.map(terrain => (
            <TerrainDropZone
              key={terrain}
              terrain={terrain}
              rules={terrainRules[terrain] ?? []}
              color={terrainColors[terrain] ?? TERRAIN_COLORS[terrain] ?? '#888'}
              onDrop={() => handleDrop(terrain)}
              onThresholdChange={handleThresholdChange}
              onRemove={handleRemove}
            />
          ))}
          <div style={{
            borderRadius: 4,
            border: `1px dashed ${t.line}`,
            padding: '6px 8px',
            opacity: 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, background: TERRAIN_COLORS['clear'] ?? '#ede8d5', flexShrink: 0, borderRadius: 1 }} />
              <span style={{ fontSize: 11, fontFamily: t.mono, color: t.inkMute }}>clear — fallback for unmatched hexes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
