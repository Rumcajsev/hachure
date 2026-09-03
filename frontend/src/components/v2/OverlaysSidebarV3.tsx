import { useRef, useState } from 'react'
import {
  useMapStore,
  type HexHighlight, type IconOverlay, type LabelOverlay,
} from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'
import {
  DashedAddBtn, MiniSlider, SegmentedControl, ToggleRow, tintBg,
  StripShell, FlyoutShell, V2Divider, TGap,
} from './sidebar'

// ── Compact colour palette ─────────────────────────────────────────────────────

const COMPACT_PALETTE = [
  ['#1133aa', '#3355ee', '#88aaff'],
  ['#aa1111', '#dd4444', '#ee8888'],
  ['#116622', '#44aa55', '#88cc77'],
  ['#886600', '#ccaa00', '#ffee66'],
  ['#551199', '#8833dd', '#cc88ff'],
  ['#aa4400', '#dd6622', '#ffaa55'],
  ['#006655', '#229977', '#66ccaa'],
] as const

function CompactColorPalette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const t = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  const norm = (c: string) => c.toLowerCase()
  const allPalette: string[] = (COMPACT_PALETTE as readonly (readonly string[])[]).flat()
  const isCustom = value !== 'transparent' && !allPalette.some(c => norm(c) === norm(value))

  const renderFamily = (group: readonly string[]) => (
    <>
      {group.map(color => {
        const active = norm(color) === norm(value)
        return (
          <button key={color} onClick={() => onChange(color)} title={color} style={{
            flex: 1, height: 28, background: color, border: 'none', cursor: 'pointer', padding: 0,
            outline: active ? `2.5px solid ${t.ink}` : 'none', outlineOffset: -2,
          }} />
        )
      })}
    </>
  )

  const row1 = COMPACT_PALETTE.slice(0, 4)
  const row2 = COMPACT_PALETTE.slice(4)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 12px' }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {row1.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', flex: 1 }}>{renderFamily(group)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {row2.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', flex: 1 }}>{renderFamily(group)}</div>
        ))}
        <div style={{ display: 'flex', flex: 1 }}>
          {(['#111111', '#ffffff'] as const).map(color => {
            const active = norm(color) === norm(value)
            return (
              <button key={color} onClick={() => onChange(color)} title={color === '#111111' ? 'Black' : 'White'} style={{
                flex: 1, height: 28, background: color,
                border: color === '#ffffff' ? `1px solid ${t.line2}` : 'none',
                cursor: 'pointer', padding: 0,
                outline: active ? `2.5px solid ${t.rust}` : 'none', outlineOffset: -2,
              }} />
            )
          })}
          <button
            onClick={() => inputRef.current?.click()}
            title={isCustom ? value : 'Custom colour…'}
            style={{
              flex: 1, height: 28,
              background: isCustom ? value : 'transparent',
              border: isCustom ? 'none' : `1px dashed ${t.line}`,
              cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              outline: isCustom ? `2.5px solid ${t.rust}` : 'none', outlineOffset: -2,
            }}
          >
            {!isCustom && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={t.inkFaint} strokeWidth="1.4" strokeLinecap="round">
                <path d="M5 1v8M1 5h8" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <input ref={inputRef} type="color" value={isCustom ? value : '#aa1111'}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'fixed', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

// ── Overlay defaults ───────────────────────────────────────────────────────────

const OVERLAY_DEFAULTS = {
  fillEnabled: true,
  fillOpacity: 0.3,
  fillPattern: 'none' as const,
  fillPatternSpacing: 1,
  strokeEnabled: true,
  strokeOpacity: 0.9,
  strokeWidth: 3,
  joinNeighbors: true,
  smoothing: 0,
  linePattern: 'none' as const,
  linePatternSide: 'right' as const,
  patternSpacing: 1,
}

// ── Swatch SVGs (strip row) ────────────────────────────────────────────────────

function HighlightSwatch({ h }: { h: HexHighlight }) {
  const t = useTheme()
  const color = h.color
  const isLine = h.mode !== 'area'

  if (isLine) {
    const sw = Math.max(0.8, Math.min(h.strokeWidth * 0.45, 3))
    const lp = h.linePattern ?? 'none'
    const lineProps = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const }
    if (lp === 'dotted') return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><line x1="1" y1="9" x2="17" y2="9" {...lineProps} strokeDasharray="1.5 3.5" /></svg>
    if (lp === 'dashed') return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><line x1="1" y1="9" x2="17" y2="9" {...lineProps} strokeLinecap="butt" strokeDasharray="5 2.5" /></svg>
    if (lp === 'dashdot') return (
      <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
        <line x1="1" y1="9" x2="7" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="butt" />
        <circle cx="10" cy="9" r={Math.max(0.8, sw * 0.55)} fill={color} />
        <line x1="13" y1="9" x2="17" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="butt" />
      </svg>
    )
    return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><line x1="1" y1="9" x2="17" y2="9" {...lineProps} /></svg>
  }

  const strokeProps = { stroke: h.strokeEnabled ? color : t.line, strokeWidth: h.strokeEnabled ? 1.5 : 0.75 }
  const patId = `ov3-hatch-${color.replace('#', '')}`
  if ((h.fillPattern ?? 'none') === 'hatched' && h.fillEnabled && h.fillOpacity > 0) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
        <defs>
          <pattern id={patId} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="1" strokeOpacity={h.fillOpacity} />
          </pattern>
        </defs>
        <rect x="1.5" y="1.5" width="15" height="15" rx="2" fill={`url(#${patId})`} {...strokeProps} />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="1.5" width="15" height="15" rx="2"
        fill={color} fillOpacity={h.fillEnabled ? h.fillOpacity : 0} {...strokeProps} />
    </svg>
  )
}

function IconShapeSwatch({ shape, fillColor, strokeColor, strokeWidth }: Pick<IconOverlay, 'shape' | 'fillColor' | 'strokeColor' | 'strokeWidth'>) {
  const cx = 9, cy = 9, r = 6
  const sw = Math.min(strokeWidth * 0.55, 2)
  const p = { fill: fillColor, stroke: strokeWidth > 0 ? strokeColor : 'none', strokeWidth: sw }
  if (shape === 'circle')   return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><circle cx={cx} cy={cy} r={r} {...p} /></svg>
  if (shape === 'square')   return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...p} /></svg>
  if (shape === 'triangle') { const s60 = r * Math.sin(Math.PI / 3); return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><polygon points={`${cx},${cy - r} ${cx - s60},${cy + r * 0.5} ${cx + s60},${cy + r * 0.5}`} {...p} /></svg> }
  if (shape === 'diamond')  return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...p} /></svg>
  const outerR = r, innerR = r * 0.38
  const pts = Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5 - Math.PI / 2; const rad = i % 2 === 0 ? outerR : innerR; return `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}` }).join(' ')
  return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><polygon points={pts} {...p} /></svg>
}

function LabelSwatch({ textColor, bgColor, strokeColor }: Pick<LabelOverlay, 'textColor' | 'bgColor' | 'strokeColor'>) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="4" width="15" height="10" rx="1" fill={bgColor === 'transparent' ? 'none' : bgColor} stroke={strokeColor} strokeWidth="1.2" />
      <text x="9" y="9.5" textAnchor="middle" dominantBaseline="middle" fill={textColor} fontSize="6" fontFamily="monospace" fontWeight="bold">Aa</text>
    </svg>
  )
}

// ── StripOverlayRow ────────────────────────────────────────────────────────────

function StripOverlayRow({
  swatch, label, sub, active, cogOpen, onSelect, onCog, onDelete,
}: {
  swatch: React.ReactNode; label: string; sub?: string
  active: boolean; cogOpen: boolean
  onSelect: () => void; onCog: () => void; onDelete: () => void
}) {
  const t = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr 18px 18px',
        alignItems: 'center',
        gap: 5,
        padding: '5px 8px',
        borderLeft: `2px solid ${active ? t.rust : 'transparent'}`,
        background: active ? tintBg(t.rust, 0.08) : 'transparent',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>{swatch}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.sans, fontSize: 11, fontWeight: active ? 600 : 500, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {sub && <div style={{ fontFamily: t.mono, fontSize: 8, color: t.inkFaint, marginTop: 0.5 }}>{sub}</div>}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onCog() }}
        style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: cogOpen ? t.rust : t.inkFaint, opacity: active || cogOpen || hovered ? 1 : 0, padding: 0 }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="6" cy="6" r="1.8" /><path d="M6 0v2M6 10v2M0 6h2M10 6h2M2 2l1.4 1.4M8.6 8.6L10 10M2 10l1.4-1.4M8.6 3.4L10 2" />
        </svg>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: t.inkFaint, opacity: active || cogOpen || hovered ? 1 : 0, padding: 0, fontSize: 14, lineHeight: 1 }}
        onMouseEnter={e => (e.currentTarget.style.color = t.rust)}
        onMouseLeave={e => (e.currentTarget.style.color = t.inkFaint)}
      >×</button>
    </div>
  )
}

// ── Flyout helpers ─────────────────────────────────────────────────────────────

function FSectionLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 12px 2px', fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase' as const, fontWeight: 600 }}>
      {label}
    </div>
  )
}

function FSectionDivider() {
  const t = useTheme()
  return <div style={{ margin: '6px 12px 4px', borderTop: `1px solid ${t.line2}` }} />
}

function ClearBtn({ label, onClick }: { label: string; onClick: () => void }) {
  const t = useTheme()
  return (
    <div style={{ padding: '4px 12px 2px' }}>
      <button
        onClick={onClick}
        style={{ width: '100%', padding: '6px 0', background: 'none', border: `1px solid ${t.rust}`, color: t.rust, cursor: 'pointer', fontFamily: t.sans, fontSize: 11 }}
        onMouseEnter={e => { e.currentTarget.style.background = tintBg(t.rust, 0.08) }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        {label}
      </button>
    </div>
  )
}

// ── Line pattern picker ────────────────────────────────────────────────────────

type LinePattern = 'none' | 'dotted' | 'dashed' | 'dashdot'

function LinePatternBtn({ pattern, active, onClick }: { pattern: LinePattern; active: boolean; onClick: () => void }) {
  const t = useTheme()
  const sw = 1.4
  const color = active ? t.rust : t.inkMute
  const lp = { stroke: color, strokeWidth: sw }
  const preview: Record<LinePattern, React.ReactNode> = {
    none:    <svg width="28" height="18" viewBox="0 0 28 18"><line x1="2" y1="9" x2="26" y2="9" {...lp} strokeLinecap="round" /></svg>,
    dotted:  <svg width="28" height="18" viewBox="0 0 28 18"><line x1="2" y1="9" x2="26" y2="9" {...lp} strokeLinecap="round" strokeDasharray="1.5 3.5" /></svg>,
    dashed:  <svg width="28" height="18" viewBox="0 0 28 18"><line x1="2" y1="9" x2="26" y2="9" {...lp} strokeLinecap="butt" strokeDasharray="5 2.5" /></svg>,
    dashdot: <svg width="28" height="18" viewBox="0 0 28 18"><line x1="2" y1="9" x2="8" y2="9" {...lp} strokeLinecap="butt" /><circle cx="12" cy="9" r="1.5" fill={color} /><line x1="16" y1="9" x2="22" y2="9" {...lp} strokeLinecap="butt" /><circle cx="26" cy="9" r="1.5" fill={color} /></svg>,
  }
  return (
    <button onClick={onClick} title={pattern} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 3px', background: active ? tintBg(t.rust, 0.1) : 'transparent', border: `1px solid ${active ? t.rust : t.line}`, cursor: 'pointer', flexShrink: 0 }}>
      {preview[pattern]}
    </button>
  )
}

// ── Shape picker (icons) ───────────────────────────────────────────────────────

function ShapePreview({ shape }: { shape: IconOverlay['shape'] }) {
  const t = useTheme()
  const cx = 14, cy = 14, r = 8
  const p = { fill: t.inkMute, stroke: t.line, strokeWidth: 1 }
  if (shape === 'circle')   return <svg width="28" height="28" viewBox="0 0 28 28"><circle cx={cx} cy={cy} r={r} {...p} /></svg>
  if (shape === 'square')   return <svg width="28" height="28" viewBox="0 0 28 28"><rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...p} /></svg>
  if (shape === 'triangle') { const s60 = r * Math.sin(Math.PI / 3); return <svg width="28" height="28" viewBox="0 0 28 28"><polygon points={`${cx},${cy - r} ${cx - s60},${cy + r * 0.5} ${cx + s60},${cy + r * 0.5}`} {...p} /></svg> }
  if (shape === 'diamond')  return <svg width="28" height="28" viewBox="0 0 28 28"><polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...p} /></svg>
  const outerR = r, innerR = r * 0.38
  const pts = Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5 - Math.PI / 2; const rad = i % 2 === 0 ? outerR : innerR; return `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}` }).join(' ')
  return <svg width="28" height="28" viewBox="0 0 28 28"><polygon points={pts} {...p} /></svg>
}

// ── Flyout state type ──────────────────────────────────────────────────────────

type FlyoutState = { kind: 'highlight' | 'icon' | 'label'; id: string } | null

// ── HighlightFlyout ────────────────────────────────────────────────────────────

function HighlightFlyout({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTheme()
  const { highlights, updateHighlight, clearAllHexHighlights, clearHighlightLine, clearHighlightEdgePath } = useMapStore()
  const h = highlights.find(x => x.id === id)
  if (!h) { onClose(); return null }

  const upd = (changes: Partial<Omit<HexHighlight, 'id'>>) => updateHighlight(id, changes)
  const isArea = h.mode === 'area'
  const fillPattern = h.fillPattern ?? 'none'
  const linePattern = (h.linePattern ?? 'none') as LinePattern
  const s = h.smoothing ?? 0
  const smoothLabel = s < 0.5 ? 'Sharp' : s < 1.5 ? 'Round' : `${Math.round(s - 1)} pass${Math.round(s - 1) !== 1 ? 'es' : ''}`

  return (
    <FlyoutShell
      title={h.name}
      subtitle={h.mode}
      onClose={onClose}
      onTitleChange={name => upd({ name })}
    >
      {/* Colour */}
      <CompactColorPalette value={h.color} onChange={color => upd({ color })} />

      {/* Fill — area only */}
      {isArea && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Fill" />
          <MiniSlider
            label="Opacity"
            display={h.fillOpacity === 0 ? 'off' : `${Math.round(h.fillOpacity * 100)}%`}
            value={Math.round(h.fillOpacity * 100)}
            min={0} max={100} step={10}
            onChange={v => upd({ fillOpacity: v / 100, fillEnabled: v > 0 })}
          />
          {h.fillOpacity > 0 && (
            <>
              <div style={{ padding: '4px 12px' }}>
                <SegmentedControl
                  options={[{ value: 'none', label: 'Solid' }, { value: 'hatched', label: 'Hatched' }]}
                  value={fillPattern}
                  onChange={v => upd({ fillPattern: v as HexHighlight['fillPattern'] })}
                />
              </div>
              {fillPattern === 'hatched' && (
                <MiniSlider label="Spacing" display={`×${(h.fillPatternSpacing ?? 1).toFixed(1)}`} value={h.fillPatternSpacing ?? 1} min={0.3} max={3} step={0.1} onChange={v => upd({ fillPatternSpacing: v })} />
              )}
            </>
          )}
        </>
      )}

      {/* Stroke */}
      <FSectionDivider />
      <FSectionLabel label="Stroke" />
      <MiniSlider label="Opacity" display={h.strokeOpacity === 0 ? 'off' : `${Math.round(h.strokeOpacity * 100)}%`} value={Math.round(h.strokeOpacity * 100)} min={0} max={100} step={10} onChange={v => upd({ strokeOpacity: v / 100, strokeEnabled: v > 0 })} />
      <MiniSlider label="Width"   display={String(h.strokeWidth)} value={h.strokeWidth} min={1} max={20} step={0.5} onChange={v => upd({ strokeWidth: v })} />
      <FSectionLabel label="Pattern" />
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 4px' }}>
        {(['none', 'dotted', 'dashed', 'dashdot'] as const).map(p => (
          <LinePatternBtn key={p} pattern={p} active={linePattern === p} onClick={() => upd({ linePattern: p })} />
        ))}
      </div>
      {linePattern !== 'none' && (
        <MiniSlider label="Spacing" display={`×${(h.patternSpacing ?? 1).toFixed(1)}`} value={h.patternSpacing ?? 1} min={0.3} max={3} step={0.1} onChange={v => upd({ patternSpacing: v })} />
      )}

      {/* Shape */}
      <FSectionDivider />
      <FSectionLabel label="Shape" />
      {isArea && (
        <ToggleRow label="Join neighbors" hint="Only outline the outer border." checked={h.joinNeighbors} onChange={v => upd({ joinNeighbors: v })} />
      )}
      {(!isArea || h.joinNeighbors) && (
        <MiniSlider label="Smoothing" display={smoothLabel} value={s} min={0} max={8} step={0.5} onChange={v => upd({ smoothing: v })} />
      )}

      {/* Clear */}
      <FSectionDivider />
      <ClearBtn
        label={isArea ? 'Clear all marked hexes' : 'Clear path'}
        onClick={() => {
          if (isArea) clearAllHexHighlights(id)
          else if (h.mode === 'edge') clearHighlightEdgePath(id)
          else clearHighlightLine(id)
        }}
      />
    </FlyoutShell>
  )
}

// ── IconFlyout ─────────────────────────────────────────────────────────────────

function IconFlyout({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTheme()
  const { iconOverlays, updateIconOverlay, clearIconOverlay } = useMapStore()
  const o = iconOverlays.find(x => x.id === id)
  if (!o) { onClose(); return null }
  const upd = (changes: Partial<Omit<IconOverlay, 'id'>>) => updateIconOverlay(id, changes)

  return (
    <FlyoutShell title={o.name} subtitle="icon overlay" onClose={onClose} onTitleChange={name => upd({ name })}>
      {/* Shape */}
      <FSectionLabel label="Shape" />
      <div style={{ display: 'flex', gap: 4, padding: '4px 12px' }}>
        {(['circle', 'square', 'triangle', 'diamond', 'star'] as const).map(shape => (
          <button key={shape} onClick={() => upd({ shape })} title={shape.charAt(0).toUpperCase() + shape.slice(1)} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: o.shape === shape ? tintBg(t.rust, 0.1) : 'transparent',
            border: `1px solid ${o.shape === shape ? t.rust : t.line}`,
            cursor: 'pointer', padding: 0, flexShrink: 0,
          }}>
            <ShapePreview shape={shape} />
          </button>
        ))}
      </div>

      {/* Fill */}
      <FSectionDivider />
      <FSectionLabel label="Fill" />
      <CompactColorPalette value={o.fillColor} onChange={v => upd({ fillColor: v })} />

      {/* Stroke */}
      <FSectionLabel label="Stroke" />
      <CompactColorPalette value={o.strokeColor} onChange={v => upd({ strokeColor: v })} />

      {/* Size */}
      <FSectionDivider />
      <MiniSlider label="Size"         display={`${Math.round(o.size * 100)}%`} value={Math.round(o.size * 100)} min={10} max={70} step={5}   onChange={v => upd({ size: v / 100 })} />
      <MiniSlider label="Stroke width" display={String(o.strokeWidth)}          value={o.strokeWidth}           min={0}  max={8}  step={0.5} onChange={v => upd({ strokeWidth: v })} />

      <FSectionDivider />
      <ClearBtn label="Clear all icons" onClick={() => clearIconOverlay(id)} />
    </FlyoutShell>
  )
}

// ── LabelFlyout ────────────────────────────────────────────────────────────────

function LabelFlyout({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTheme()
  const { labelOverlays, updateLabelOverlay, clearLabelOverlay } = useMapStore()
  const o = labelOverlays.find(x => x.id === id)
  if (!o) { onClose(); return null }
  const upd = (changes: Partial<Omit<LabelOverlay, 'id'>>) => updateLabelOverlay(id, changes)

  return (
    <FlyoutShell title={o.name} subtitle="label overlay" onClose={onClose} onTitleChange={name => upd({ name })}>
      {/* Text colour */}
      <FSectionLabel label="Text" />
      <CompactColorPalette value={o.textColor} onChange={v => upd({ textColor: v })} />

      {/* Background colour */}
      <FSectionLabel label="Background" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 12px' }}>
        <button
          onClick={() => upd({ bgColor: 'transparent' })}
          title="Transparent"
          style={{
            width: 22, height: 22, flexShrink: 0, padding: 0, cursor: 'pointer',
            border: o.bgColor === 'transparent' ? `2px solid ${t.rust}` : `1px solid ${t.line}`,
            backgroundImage: 'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%)',
            backgroundSize: '8px 8px',
          }}
        />
        <span style={{ fontFamily: t.mono, fontSize: 9, color: o.bgColor === 'transparent' ? t.rust : t.inkFaint }}>
          transparent
        </span>
      </div>
      <CompactColorPalette value={o.bgColor === 'transparent' ? '#aa1111' : o.bgColor} onChange={v => upd({ bgColor: v })} />

      {/* Stroke colour */}
      <FSectionLabel label="Stroke" />
      <CompactColorPalette value={o.strokeColor} onChange={v => upd({ strokeColor: v })} />

      {/* Style */}
      <FSectionDivider />
      <MiniSlider label="Text size"    display={`${o.textSize}px`}                  value={o.textSize}                  min={1}  max={16}  step={0.5} onChange={v => upd({ textSize: v })} />
      <MiniSlider label="Stroke width" display={String(o.strokeWidth)}              value={o.strokeWidth}               min={0}  max={8}   step={0.5} onChange={v => upd({ strokeWidth: v })} />
      <MiniSlider label="Opacity"      display={`${Math.round(o.opacity * 100)}%`}  value={Math.round(o.opacity * 100)} min={0}  max={100} step={5}   onChange={v => upd({ opacity: v / 100 })} />

      <FSectionDivider />
      <ClearBtn label="Clear all labels" onClick={() => clearLabelOverlay(id)} />
    </FlyoutShell>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OverlaysSidebarV3() {
  const t = useTheme()
  const {
    highlights, addHighlight, deleteHighlight,
    activeHighlightId, setActiveHighlightId,
    highlightPaintMode, highlightLineEraser,
    highlightedHexes, highlightLines,
    iconOverlays, placedIcons, addIconOverlay, deleteIconOverlay,
    activeIconOverlayId, iconPlaceMode,
    labelOverlays, placedLabels, addLabelOverlay, deleteLabelOverlay,
    activeLabelOverlayId, activeTool,
    setActiveTool,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutState>(null)

  const openFlyout = (kind: NonNullable<FlyoutState>['kind'], id: string) =>
    setFlyout(prev => prev?.kind === kind && prev?.id === id ? null : { kind, id })

  const areaOverlays = highlights.filter(h => h.mode === 'area')
  const edgeOverlays = highlights.filter(h => h.mode === 'edge')
  const lineOverlays = highlights.filter(h => h.mode === 'line')

  const isErasing = highlightLineEraser

  const handleEraser = () => {
    if (isErasing) {
      if (activeHighlightId) setActiveTool({ type: 'highlight-paint', id: activeHighlightId })
      else setActiveTool({ type: 'none' })
    } else {
      if (activeHighlightId) setActiveTool({ type: 'highlight-erase', id: activeHighlightId })
      else setActiveTool({ type: 'highlight-erase-any' })
    }
  }

  const handleRowClick = (id: string) => {
    if (activeHighlightId === id && highlightPaintMode) {
      setActiveTool({ type: 'none' }); setActiveHighlightId(null)
    } else {
      setActiveTool({ type: 'highlight-paint', id })
    }
  }
  const handleIconRowClick  = (id: string) => {
    if (activeIconOverlayId === id && iconPlaceMode) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'icon-place', id })
  }
  const handleLabelRowClick = (id: string) => {
    if (activeLabelOverlayId === id && activeTool.type === 'label-place') setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'label-place', id })
  }

  const handleAddArea  = () => addHighlight({ name: `Area ${areaOverlays.length + 1}`,  color: '#ffcc00', mode: 'area', ...OVERLAY_DEFAULTS })
  const handleAddEdge  = () => addHighlight({ name: `Edge ${edgeOverlays.length + 1}`,  color: '#44aaff', mode: 'edge', ...OVERLAY_DEFAULTS, fillEnabled: false })
  const handleAddLine  = () => addHighlight({ name: `Line ${lineOverlays.length + 1}`,  color: '#ff6644', mode: 'line', ...OVERLAY_DEFAULTS, fillEnabled: false })
  const handleAddIcon  = () => addIconOverlay({ name: `Icon ${iconOverlays.length + 1}`, shape: 'circle', fillColor: '#e05050', strokeColor: '#1a1b2e', strokeWidth: 1.5, size: 0.35 })
  const handleAddLabel = () => addLabelOverlay({ name: `Label ${labelOverlays.length + 1}`, textColor: '#ffffff', bgColor: '#aa1111', strokeColor: '#000000', strokeWidth: 1, textSize: 14, opacity: 1 })

  const highlightSub = (h: HexHighlight) => {
    const count = h.mode !== 'area'
      ? (highlightLines[h.id]?.reduce((sum, seg) => sum + seg.length, 0) ?? 0)
      : Object.values(highlightedHexes).filter(v => v === h.id).length
    return count > 0 ? `${count} hex${count !== 1 ? 'es' : ''}` : undefined
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <StripShell>

        {/* Eraser */}
        <V2Divider label="Tools" />
        <div
          onClick={handleEraser}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 8px',
            borderLeft: `2px solid ${isErasing ? t.rust : 'transparent'}`,
            background: isErasing ? tintBg(t.rust, 0.08) : 'transparent',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            stroke={isErasing ? t.rust : t.inkMute} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M2 14h12M10 2L14 6 6 14 2 10 10 2z" />
          </svg>
          <span style={{ fontFamily: t.sans, fontSize: 11, fontWeight: isErasing ? 600 : 500, color: isErasing ? t.rust : t.ink }}>
            Eraser
          </span>
        </div>

        {/* Areas */}
        <V2Divider label="Areas" />
        {areaOverlays.map(h => (
          <StripOverlayRow
            key={h.id}
            swatch={<HighlightSwatch h={h} />}
            label={h.name} sub={highlightSub(h)}
            active={activeHighlightId === h.id && highlightPaintMode}
            cogOpen={flyout?.kind === 'highlight' && flyout?.id === h.id}
            onSelect={() => handleRowClick(h.id)}
            onCog={() => openFlyout('highlight', h.id)}
            onDelete={() => { deleteHighlight(h.id); if (flyout?.id === h.id) setFlyout(null) }}
          />
        ))}
        <DashedAddBtn label="Add area" onClick={handleAddArea} />

        {/* Edges */}
        <V2Divider label="Edges" />
        {edgeOverlays.map(h => (
          <StripOverlayRow
            key={h.id}
            swatch={<HighlightSwatch h={h} />}
            label={h.name} sub={highlightSub(h)}
            active={activeHighlightId === h.id && highlightPaintMode}
            cogOpen={flyout?.kind === 'highlight' && flyout?.id === h.id}
            onSelect={() => handleRowClick(h.id)}
            onCog={() => openFlyout('highlight', h.id)}
            onDelete={() => { deleteHighlight(h.id); if (flyout?.id === h.id) setFlyout(null) }}
          />
        ))}
        <DashedAddBtn label="Add edge" onClick={handleAddEdge} />

        {/* Lines */}
        <V2Divider label="Lines" />
        {lineOverlays.map(h => (
          <StripOverlayRow
            key={h.id}
            swatch={<HighlightSwatch h={h} />}
            label={h.name} sub={highlightSub(h)}
            active={activeHighlightId === h.id && highlightPaintMode}
            cogOpen={flyout?.kind === 'highlight' && flyout?.id === h.id}
            onSelect={() => handleRowClick(h.id)}
            onCog={() => openFlyout('highlight', h.id)}
            onDelete={() => { deleteHighlight(h.id); if (flyout?.id === h.id) setFlyout(null) }}
          />
        ))}
        <DashedAddBtn label="Add line" onClick={handleAddLine} />

        {/* Icons */}
        <V2Divider label="Icons" />
        {iconOverlays.map(o => (
          <StripOverlayRow
            key={o.id}
            swatch={<IconShapeSwatch shape={o.shape} fillColor={o.fillColor} strokeColor={o.strokeColor} strokeWidth={o.strokeWidth} />}
            label={o.name}
            sub={(placedIcons[o.id]?.length ?? 0) > 0 ? `${placedIcons[o.id].length} placed` : undefined}
            active={activeIconOverlayId === o.id && iconPlaceMode}
            cogOpen={flyout?.kind === 'icon' && flyout?.id === o.id}
            onSelect={() => handleIconRowClick(o.id)}
            onCog={() => openFlyout('icon', o.id)}
            onDelete={() => { deleteIconOverlay(o.id); if (flyout?.id === o.id) setFlyout(null) }}
          />
        ))}
        <DashedAddBtn label="Add icon" onClick={handleAddIcon} />

        {/* Labels */}
        <V2Divider label="Labels" />
        {labelOverlays.map(o => (
          <StripOverlayRow
            key={o.id}
            swatch={<LabelSwatch textColor={o.textColor} bgColor={o.bgColor} strokeColor={o.strokeColor} />}
            label={o.name}
            sub={(placedLabels[o.id]?.length ?? 0) > 0 ? `${placedLabels[o.id].length} placed` : undefined}
            active={activeLabelOverlayId === o.id && activeTool.type === 'label-place'}
            cogOpen={flyout?.kind === 'label' && flyout?.id === o.id}
            onSelect={() => handleLabelRowClick(o.id)}
            onCog={() => openFlyout('label', o.id)}
            onDelete={() => { deleteLabelOverlay(o.id); if (flyout?.id === o.id) setFlyout(null) }}
          />
        ))}
        <DashedAddBtn label="Add label" onClick={handleAddLabel} />

        <TGap />
        <div style={{ height: 8 }} />
      </StripShell>

      {flyout?.kind === 'highlight' && <HighlightFlyout id={flyout.id} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'icon'      && <IconFlyout      id={flyout.id} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'label'     && <LabelFlyout     id={flyout.id} onClose={() => setFlyout(null)} />}
    </div>
  )
}
