import { useMapStore, TERRAIN_COLORS, pageGridTotalMm } from '../../store/mapStore'
import { useState } from 'react'
import { useTheme } from '../../context/ThemeContext'
import {
  MiniSlider, ToggleRow, SegmentedControl,
  StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
} from './sidebar'
import { LABEL_PRESETS, resolveLabels } from '../../lib/labelPresets'

// ── Constants ─────────────────────────────────────────────────────────────────

const BG_PALETTE = ['#ffffff', '#f5f0e8', '#eae4d4', '#ddd5c0', '#d4e8d4', '#d0dce8', '#e8d8d0', '#1a1a2a', '#000000'] as const

const CORNER_OPTIONS = [
  { value: 'top-left',     label: '↖' },
  { value: 'top-right',    label: '↗' },
  { value: 'bottom-left',  label: '↙' },
  { value: 'bottom-right', label: '↘' },
] as const

const MEGA_HEX_SIZES: Record<number, string> = { 1: '7', 2: '19', 3: '37', 4: '61', 5: '91' }

const FLAT_EDGE_LABELS  = ['SE', 'S', 'SW', 'NW', 'N', 'NE', 'C'] as const
const POINTY_EDGE_LABELS = ['SE', 'S', 'SW', 'NW', 'N', 'NE', 'C'] as const

const terrainLabel = (k: string) => k.replace(/_/g, ' ')

type FlyoutId = 'hex-borders' | 'hex-numbers' | 'map-shape' | 'impassable' | 'map-frame' | 'mega-hex' | 'terrain-legend' | 'ui-scale' | 'document' | 'typography' | null

// ── SubLabel ──────────────────────────────────────────────────────────────────

function SubLabel({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ padding: '6px 14px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </div>
  )
}

// ── HexEdgePicker ─────────────────────────────────────────────────────────────

function HexEdgePicker({ hexOrientation, edgeIndex, onChange }: {
  hexOrientation: 'flat' | 'pointy'
  edgeIndex: number
  onChange: (i: number) => void
}) {
  const t = useTheme()
  const size = 52
  const cx = size / 2
  const cy = size / 2
  const R = size * 0.42
  const base = hexOrientation === 'flat' ? 0 : 30

  const verts = Array.from({ length: 6 }, (_, i) => {
    const a = ((base + 60 * i) * Math.PI) / 180
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number]
  })

  const edgeMids = verts.map((v, i) => {
    const v2 = verts[(i + 1) % 6]
    return [(v[0] + v2[0]) / 2, (v[1] + v2[1]) / 2] as [number, number]
  })

  const polyStr = verts.map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <svg width={size} height={size} style={{ display: 'block', cursor: 'pointer', flexShrink: 0 }}>
      <polygon points={polyStr} fill="none" stroke={t.line} strokeWidth={1} />
      {edgeMids.map(([mx, my], i) => (
        <circle
          key={i}
          cx={mx} cy={my} r={6}
          fill={edgeIndex === i ? '#7de0a0' : t.paper2}
          stroke={edgeIndex === i ? '#4a9a6a' : t.line}
          strokeWidth={1}
          onClick={() => onChange(i)}
          style={{ cursor: 'pointer' }}
        />
      ))}
      <circle
        cx={cx} cy={cy} r={6}
        fill={edgeIndex === 6 ? '#7de0a0' : t.paper2}
        stroke={edgeIndex === 6 ? '#4a9a6a' : t.line}
        strokeWidth={1}
        onClick={() => onChange(6)}
        style={{ cursor: 'pointer' }}
      />
    </svg>
  )
}

// ── ToggleBtn helper ──────────────────────────────────────────────────────────

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const t = useTheme()
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px', fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
        background: active ? t.ink : 'transparent',
        color: active ? t.surface : t.inkMute,
        border: `1px solid ${active ? t.ink : t.line}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ── HexBordersFlyout ──────────────────────────────────────────────────────────

function HexBordersFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    hexBorderMode, setHexBorderMode,
    hexBorderOpacity, setHexBorderOpacity,
    hexBorderColor, setHexBorderColor,
    hexBorderDifference, setHexBorderDifference,
  } = useMapStore()

  return (
    <FlyoutShell title="Hex Borders" onClose={onClose}>
      <div style={{ padding: '4px 14px 6px' }}>
        <SegmentedControl
          options={[{ value: 'full', label: 'Full' }, { value: 'stubs', label: 'Stubs' }, { value: 'dashed', label: 'Dashed' }]}
          value={hexBorderMode}
          onChange={setHexBorderMode}
        />
      </div>

      {hexBorderMode !== 'none' && (
        <>
          <MiniSlider
            label="Opacity"
            display={`${Math.round(hexBorderOpacity * 100)}%`}
            value={hexBorderOpacity}
            min={0} max={1} step={0.05}
            onChange={setHexBorderOpacity}
          />

          {!hexBorderDifference && (
            <div style={{ padding: '4px 14px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600, width: 40, flexShrink: 0 }}>
                Color
              </span>
              <ToggleBtn label="Dark"  active={hexBorderColor === '#000000'} onClick={() => setHexBorderColor('#000000')} />
              <ToggleBtn label="Light" active={hexBorderColor === '#ffffff'} onClick={() => setHexBorderColor('#ffffff')} />
              <input
                type="color"
                value={hexBorderColor}
                onChange={e => setHexBorderColor(e.target.value)}
                style={{ width: 24, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
              />
            </div>
          )}

          <div style={{ padding: '4px 14px' }}>
            <ToggleRow label="Auto-contrast" checked={hexBorderDifference} onChange={setHexBorderDifference} />
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── HexNumbersFlyout ──────────────────────────────────────────────────────────

function HexNumbersFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    hexNumbersEnabled, setHexNumbersEnabled,
    hexNumberStartCorner, setHexNumberStartCorner,
    hexNumberEdge, setHexNumberEdge,
    hexNumberColor, setHexNumberColor,
    hexNumberFontScale, setHexNumberFontScale,
    hexOrientation,
  } = useMapStore()

  const edgeLabels = hexOrientation === 'flat' ? FLAT_EDGE_LABELS : POINTY_EDGE_LABELS
  const currentLabel = edgeLabels[hexNumberEdge] ?? '?'

  return (
    <FlyoutShell title="Hex Numbers" onClose={onClose}>
      <div style={{ padding: '4px 14px' }}>
        <ToggleRow label="Show hex numbers" checked={hexNumbersEnabled} onChange={setHexNumbersEnabled} />
      </div>

      {hexNumbersEnabled && (
        <>
          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label="Starting corner" />
            <div style={{ padding: '4px 14px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {CORNER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setHexNumberStartCorner(value)}
                  style={{
                    padding: '4px 0', fontSize: 16,
                    background: hexNumberStartCorner === value ? t.ink : 'transparent',
                    color: hexNumberStartCorner === value ? t.surface : t.inkMute,
                    border: `1px solid ${hexNumberStartCorner === value ? t.ink : t.line}`,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label={`Label position — ${currentLabel}`} />
            <div style={{ padding: '4px 14px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <HexEdgePicker hexOrientation={hexOrientation} edgeIndex={hexNumberEdge} onChange={setHexNumberEdge} />
              <div style={{ fontFamily: t.sans, fontSize: 10, color: t.inkMute, lineHeight: 1.5 }}>
                Click edge dot<br />or center
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <MiniSlider label="Size" display={`${hexNumberFontScale.toFixed(1)}×`} value={hexNumberFontScale} min={0.1} max={3.0} step={0.05} onChange={setHexNumberFontScale} />
            <div style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600, width: 40, flexShrink: 0 }}>
                Color
              </span>
              <input
                type="color"
                value={hexNumberColor}
                onChange={e => setHexNumberColor(e.target.value)}
                style={{ width: 26, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute }}>{hexNumberColor}</span>
            </div>
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── MapShapeFlyout ────────────────────────────────────────────────────────────

function MapShapeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { excludedHexKeys, resetExcludedHexes, activeTool, setActiveTool } = useMapStore()
  const hexMaskMode = activeTool.type === 'hex-mask' ? activeTool.mode : null

  return (
    <FlyoutShell title="Map Shape" onClose={onClose}>
      <div style={{ padding: '4px 14px 6px', fontFamily: t.sans, fontSize: 11, color: t.inkMute, lineHeight: 1.5 }}>
        Paint to remove or restore hexes from the map boundary.
      </div>
      <div style={{ padding: '0 14px 6px', display: 'flex', gap: 6 }}>
        {(['exclude', 'include'] as const).map(mode => {
          const active = hexMaskMode === mode
          return (
            <button
              key={mode}
              onClick={() => setActiveTool(active ? { type: 'none' } : { type: 'hex-mask', mode })}
              style={{
                flex: 1, padding: '5px 0',
                background: active ? (mode === 'exclude' ? 'rgba(192,64,64,0.15)' : 'rgba(64,154,90,0.15)') : 'transparent',
                color: active ? (mode === 'exclude' ? '#c04040' : '#4a9a5a') : t.inkMute,
                border: `1px solid ${active ? (mode === 'exclude' ? '#c04040' : '#4a9a5a') : t.line}`,
                cursor: 'pointer', fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
              }}
            >
              {mode === 'exclude' ? '− Remove' : '+ Add'}
            </button>
          )
        })}
      </div>
      {excludedHexKeys.length > 0 && (
        <div style={{ padding: '0 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute }}>
            {excludedHexKeys.length} hex{excludedHexKeys.length !== 1 ? 'es' : ''} removed
          </span>
          <button
            onClick={resetExcludedHexes}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '2px 8px', letterSpacing: 0.3 }}
          >
            Reset
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── ImpassableFlyout ──────────────────────────────────────────────────────────

function ImpassableFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    disabledHexKeys, autoDisabledOceanHexKeys,
    resetDisabledHexes, autoDisableOceanHexes,
    activeTool, setActiveTool,
  } = useMapStore()

  const hexDisableMode = activeTool.type === 'hex-disable' ? activeTool.mode : null
  const totalDisabled = disabledHexKeys.length + autoDisabledOceanHexKeys.length

  return (
    <FlyoutShell title="Impassable Hexes" onClose={onClose}>
      <div style={{ padding: '4px 14px 6px', fontFamily: t.sans, fontSize: 11, color: t.inkMute, lineHeight: 1.5 }}>
        Mark hexes as impassable for scenario rules.
      </div>
      <div style={{ padding: '0 14px 6px' }}>
        <button
          onClick={autoDisableOceanHexes}
          style={{
            width: '100%', padding: '5px 0',
            background: 'transparent', border: `1px solid ${t.line}`,
            color: t.inkMute, cursor: 'pointer',
            fontFamily: t.mono, fontSize: 9.5, letterSpacing: 0.3,
          }}
        >
          Auto-disable ocean hexes
        </button>
      </div>
      <div style={{ padding: '0 14px 6px', display: 'flex', gap: 6 }}>
        {(['disable', 'enable'] as const).map(mode => {
          const active = hexDisableMode === mode
          return (
            <button
              key={mode}
              onClick={() => setActiveTool(active ? { type: 'none' } : { type: 'hex-disable', mode })}
              style={{
                flex: 1, padding: '5px 0',
                background: active ? (mode === 'disable' ? 'rgba(192,64,64,0.15)' : 'rgba(64,154,90,0.15)') : 'transparent',
                color: active ? (mode === 'disable' ? '#c04040' : '#4a9a5a') : t.inkMute,
                border: `1px solid ${active ? (mode === 'disable' ? '#c04040' : '#4a9a5a') : t.line}`,
                cursor: 'pointer', fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
              }}
            >
              {mode === 'disable' ? '− Disable' : '+ Enable'}
            </button>
          )
        })}
      </div>
      {totalDisabled > 0 && (
        <div style={{ padding: '0 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute }}>
            {totalDisabled} hex{totalDisabled !== 1 ? 'es' : ''} disabled
            {autoDisabledOceanHexKeys.length > 0 && disabledHexKeys.length > 0 && (
              <> ({autoDisabledOceanHexKeys.length} auto)</>
            )}
          </span>
          <button
            onClick={resetDisabledHexes}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '2px 8px', letterSpacing: 0.3 }}
          >
            Reset
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── MapFrameFlyout ────────────────────────────────────────────────────────────

function MapFrameFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    mapBgColor, setMapBgColor,
    mapBorderEnabled, setMapBorderEnabled,
    mapBorderColor, setMapBorderColor,
    mapBorderWidth, setMapBorderWidth,
    clipToHexGrid, setClipToHexGrid,
  } = useMapStore()

  return (
    <FlyoutShell title="Map Frame" onClose={onClose}>
      <SubLabel label="Background" />
      <div style={{ padding: '2px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {BG_PALETTE.map(color => (
          <button
            key={color}
            onClick={() => setMapBgColor(color)}
            title={color}
            style={{
              width: 18, height: 18, background: color,
              border: mapBgColor.toLowerCase() === color.toLowerCase()
                ? `2px solid ${t.ink}`
                : `1px solid ${t.line}`,
              cursor: 'pointer', padding: 0, boxSizing: 'border-box',
            }}
          />
        ))}
        <input
          type="color"
          value={mapBgColor}
          onChange={e => setMapBgColor(e.target.value)}
          title="Custom color"
          style={{ width: 18, height: 18, border: `1px dashed ${t.line}`, cursor: 'pointer', padding: 0, background: 'none', flexShrink: 0 }}
        />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}`, padding: '4px 0' }}>
        <ToggleRow label="Clip to hex grid" checked={clipToHexGrid} onChange={setClipToHexGrid} />
      </div>

      <div style={{ borderTop: `1px solid ${t.line2}`, padding: '4px 0' }}>
        <ToggleRow label="Map border" checked={mapBorderEnabled} onChange={setMapBorderEnabled} />
        {mapBorderEnabled && (
          <>
            <div style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600, width: 40, flexShrink: 0 }}>Color</span>
              <input
                type="color"
                value={mapBorderColor}
                onChange={e => setMapBorderColor(e.target.value)}
                style={{ width: 26, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute }}>{mapBorderColor}</span>
            </div>
            <MiniSlider label="Width" display={`${mapBorderWidth.toFixed(2)}px`} value={mapBorderWidth} min={0.25} max={8} step={0.25} onChange={setMapBorderWidth} />
          </>
        )}
      </div>
    </FlyoutShell>
  )
}

// ── MegaHexFlyout ─────────────────────────────────────────────────────────────

function MegaHexFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    megaHexEnabled, setMegaHexEnabled,
    megaHexRadius, setMegaHexRadius,
    megaHexColor, setMegaHexColor,
    megaHexOpacity, setMegaHexOpacity,
    megaHexLineWidth, setMegaHexLineWidth,
    activeTool, setActiveTool,
  } = useMapStore()

  return (
    <FlyoutShell title="Mega Hex Grid" onClose={onClose}>
      <div style={{ padding: '4px 0' }}>
        <ToggleRow label="Show mega hex grid" checked={megaHexEnabled} onChange={setMegaHexEnabled} />
      </div>

      {megaHexEnabled && (
        <>
          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <SubLabel label={`Size — ${MEGA_HEX_SIZES[megaHexRadius] ?? '?'} hexes`} />
            <MiniSlider label="Radius" display={`R${megaHexRadius}`} value={megaHexRadius} min={1} max={5} step={1} onChange={setMegaHexRadius} />
          </div>

          <div style={{ borderTop: `1px solid ${t.line2}` }}>
            <div style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600, width: 40, flexShrink: 0 }}>Color</span>
              <input
                type="color"
                value={megaHexColor}
                onChange={e => setMegaHexColor(e.target.value)}
                style={{ width: 26, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkMute }}>{megaHexColor}</span>
            </div>
            <MiniSlider label="Opacity" display={`${Math.round(megaHexOpacity * 100)}%`} value={megaHexOpacity} min={0.05} max={1}   step={0.05} onChange={setMegaHexOpacity} />
            <MiniSlider label="Width"   display={`${megaHexLineWidth.toFixed(1)}px`}      value={megaHexLineWidth} min={0.5} max={8}   step={0.5}  onChange={setMegaHexLineWidth} />
          </div>

          <div style={{ padding: '8px 14px 4px' }}>
            <button
              onClick={() => setActiveTool(activeTool.type === 'mega-hex-origin' ? { type: 'none' } : { type: 'mega-hex-origin' })}
              style={{
                width: '100%', padding: '5px 0',
                background: activeTool.type === 'mega-hex-origin' ? t.ink : 'transparent',
                color: activeTool.type === 'mega-hex-origin' ? t.surface : t.inkMute,
                border: `1px solid ${activeTool.type === 'mega-hex-origin' ? t.ink : t.line}`,
                cursor: 'pointer', fontFamily: t.mono, fontSize: 9.5, letterSpacing: 0.3,
              }}
            >
              {activeTool.type === 'mega-hex-origin' ? 'Click a hex…' : 'Set origin'}
            </button>
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── TerrainLegendFlyout ───────────────────────────────────────────────────────

function TerrainLegendFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  return (
    <FlyoutShell title="Terrain Legend" onClose={onClose}>
      {Object.entries(TERRAIN_COLORS).map(([type, color]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: t.sans, fontSize: 11, color: t.ink2, textTransform: 'capitalize' }}>
            {terrainLabel(type)}
          </span>
        </div>
      ))}
    </FlyoutShell>
  )
}

// ── UiScaleFlyout ─────────────────────────────────────────────────────────────

const UI_SCALE_OPTIONS = [
  { value: '0.8',  label: 'Compact' },
  { value: '1.0',  label: 'Normal' },
  { value: '1.25', label: 'Large' },
] as const

function UiScaleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { uiScale, setUiScale } = useMapStore()
  return (
    <FlyoutShell title="UI Scale" onClose={onClose}>
      <div style={{ padding: '8px 14px 12px' }}>
        <div style={{ fontFamily: t.sans, fontSize: 11, color: t.inkMute, marginBottom: 10, lineHeight: 1.4 }}>
          Scales the sidebar. Use Compact on large monitors, Large on small ones.
        </div>
        <SegmentedControl
          options={UI_SCALE_OPTIONS as unknown as { value: string; label: string }[]}
          value={String(uiScale)}
          onChange={(v) => setUiScale(Number(v) as 0.8 | 1.0 | 1.25)}
        />
      </div>
    </FlyoutShell>
  )
}

// ── DocumentFlyout ────────────────────────────────────────────────────────────

function DocumentFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { pageGrid, generatedMetadata, setExpandMode } = useMapStore()
  const [cwMm, chMm] = pageGridTotalMm(pageGrid)
  const cols = pageGrid.colWidths.length
  const rows = pageGrid.rowHeights.length
  const scale = generatedMetadata?.scale_m_per_mm ?? null

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontFamily: t.mono, fontSize: 11, color: t.ink }}>{value}</span>
    </div>
  )

  return (
    <FlyoutShell title="Document" onClose={onClose}>
      <div style={{ padding: '8px 14px 14px' }}>
        <div style={{ marginBottom: 12 }}>
          {row('SHEETS', `${cols} × ${rows}`)}
          {row('SIZE', `${cwMm.toFixed(0)} × ${chMm.toFixed(0)} mm`)}
          {scale !== null && row('SCALE', `1 : ${Math.round(scale * 1000)}`)}
        </div>
        <button
          onClick={() => { onClose(); setExpandMode(true) }}
          style={{
            width: '100%', padding: '7px 0',
            background: 'transparent', border: `1px solid ${t.line2}`,
            borderRadius: 2, cursor: 'pointer',
            fontFamily: t.mono, fontSize: 11, letterSpacing: 0.8,
            color: t.inkMute, textTransform: 'uppercase' as const,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = t.ink; (e.currentTarget as HTMLElement).style.borderColor = t.line }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = t.inkMute; (e.currentTarget as HTMLElement).style.borderColor = t.line2 }}
        >
          Expand map…
        </button>
      </div>
    </FlyoutShell>
  )
}

// ── TypographyFlyout ──────────────────────────────────────────────────────────

function TypographyFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const { labelPresetId, setLabelPresetId, labelOverrides, resetAllLabelOverrides } = useMapStore()
  const hasAnyOverride = Object.values(labelOverrides).some(v => v && Object.keys(v).length > 0)

  return (
    <FlyoutShell title="Typography" onClose={onClose} width={290}>
      <div style={{ padding: '6px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
          Label preset
        </span>
        {hasAnyOverride && (
          <button
            onClick={resetAllLabelOverrides}
            style={{ background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, padding: '2px 8px', letterSpacing: 0.3 }}
          >
            ↺ Clear all overrides
          </button>
        )}
      </div>
      <div style={{ padding: '2px 14px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {LABEL_PRESETS.map(preset => {
          const active = preset.id === labelPresetId
          const s = resolveLabels(preset.id, {})
          const nameStyle = s.cityMajor
          const waterStyle = s.water
          const fg = active ? t.surface : undefined
          const fgMuted = active ? `${t.surface}bb` : undefined
          return (
            <button
              key={preset.id}
              onClick={() => setLabelPresetId(preset.id)}
              style={{
                display: 'flex', alignItems: 'baseline',
                padding: '5px 10px', gap: 10,
                background: active ? t.ink : 'transparent',
                border: `1px solid ${active ? t.ink : t.line}`,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {/* Name rendered in the preset's own city font */}
              <span style={{
                fontFamily: nameStyle.family,
                fontSize: 13,
                fontStyle: nameStyle.italic ? 'italic' : 'normal',
                fontWeight: nameStyle.weight,
                color: fg ?? nameStyle.color,
                textTransform: nameStyle.uppercase ? 'uppercase' : 'none',
                letterSpacing: `${Math.min(nameStyle.letterSpacing, 0.12)}em`,
                flex: '1 1 0',
                minWidth: 0,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {preset.name}
              </span>
              {/* Two short samples */}
              <span style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginLeft: 'auto', flexShrink: 0 }}>
                <span style={{
                  fontFamily: nameStyle.family,
                  fontSize: 10,
                  fontWeight: nameStyle.weight,
                  fontStyle: nameStyle.italic ? 'italic' : 'normal',
                  color: fg ?? nameStyle.color,
                  textTransform: nameStyle.uppercase ? 'uppercase' : 'none',
                  letterSpacing: `${Math.min(nameStyle.letterSpacing, 0.08)}em`,
                  whiteSpace: 'nowrap',
                }}>
                  Lyon
                </span>
                <span style={{
                  fontFamily: waterStyle.family,
                  fontSize: 10,
                  fontWeight: waterStyle.weight,
                  fontStyle: 'italic',
                  color: fgMuted ?? waterStyle.color,
                  letterSpacing: `${Math.min(waterStyle.letterSpacing, 0.08)}em`,
                  whiteSpace: 'nowrap',
                }}>
                  Rhône
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </FlyoutShell>
  )
}

// ── DisplaySidebarV3 ──────────────────────────────────────────────────────────

export function DisplaySidebarV3() {
  const [flyout, setFlyout] = useState<FlyoutId>(null)
  const toggle = (id: NonNullable<FlyoutId>) => setFlyout(prev => prev === id ? null : id)

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <StripShell>

        <V2Divider label="Grid" />
        <TriggerRow label="Hex Borders"   active={flyout === 'hex-borders'}    onClick={() => toggle('hex-borders')} />
        <TriggerRow label="Hex Numbers"   active={flyout === 'hex-numbers'}    onClick={() => toggle('hex-numbers')} />

        <TGap />
        <V2Divider label="Shape" />
        <TriggerRow label="Map Shape"     active={flyout === 'map-shape'}      onClick={() => toggle('map-shape')} />
        <TriggerRow label="Impassable"    active={flyout === 'impassable'}     onClick={() => toggle('impassable')} />

        <TGap />
        <V2Divider label="Frame" />
        <TriggerRow label="Map Frame"     active={flyout === 'map-frame'}      onClick={() => toggle('map-frame')} />
        <TriggerRow label="Mega Hex"      active={flyout === 'mega-hex'}       onClick={() => toggle('mega-hex')} />

        <TGap />
        <V2Divider label="Info" />
        <TriggerRow label="Terrain Legend" active={flyout === 'terrain-legend'} onClick={() => toggle('terrain-legend')} />

        <TGap />
        <V2Divider label="Document" />
        <TriggerRow label="Document"        active={flyout === 'document'}       onClick={() => toggle('document')} />

        <TGap />
        <V2Divider label="Typography" />
        <TriggerRow label="Label Preset"    active={flyout === 'typography'}     onClick={() => toggle('typography')} />

        <TGap />
        <V2Divider label="App" />
        <TriggerRow label="UI Scale"        active={flyout === 'ui-scale'}       onClick={() => toggle('ui-scale')} />

      </StripShell>

      {flyout === 'hex-borders'    && <HexBordersFlyout    onClose={() => setFlyout(null)} />}
      {flyout === 'hex-numbers'    && <HexNumbersFlyout    onClose={() => setFlyout(null)} />}
      {flyout === 'map-shape'      && <MapShapeFlyout      onClose={() => setFlyout(null)} />}
      {flyout === 'impassable'     && <ImpassableFlyout    onClose={() => setFlyout(null)} />}
      {flyout === 'map-frame'      && <MapFrameFlyout      onClose={() => setFlyout(null)} />}
      {flyout === 'mega-hex'       && <MegaHexFlyout       onClose={() => setFlyout(null)} />}
      {flyout === 'terrain-legend' && <TerrainLegendFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'ui-scale'       && <UiScaleFlyout       onClose={() => setFlyout(null)} />}
      {flyout === 'document'       && <DocumentFlyout      onClose={() => setFlyout(null)} />}
      {flyout === 'typography'     && <TypographyFlyout    onClose={() => setFlyout(null)} />}

    </div>
  )
}
