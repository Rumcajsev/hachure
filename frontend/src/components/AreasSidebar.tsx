import { useMapStore } from '../store/mapStore'
import type { MapArea } from '../store/mapStore'
import { sidebarStyle, sectionStyle, labelStyle, modeBtn } from './sidebarStyles'
import { resolveLabels } from '../lib/labelPresets'
import { FONT_OPTIONS } from './v2/LabelSpecEditor'

// ── Area row ──────────────────────────────────────────────────────────────────

function AreaRow({
  area, isActive, hexCount,
  onSelect, onRename, onColorChange, onDelete,
}: {
  area: MapArea
  isActive: boolean
  hexCount: number
  onSelect: () => void
  onRename: (name: string) => void
  onColorChange: (color: string) => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
        background: isActive ? '#1e2a3a' : 'transparent',
        borderRadius: 3, cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <input
        type="color"
        value={area.color}
        style={{ width: 16, height: 16, border: 'none', padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onColorChange(e.target.value)}
      />
      <input
        type="text"
        value={area.name}
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          color: '#c0c0e0', fontSize: 11, fontFamily: 'ui-monospace, monospace',
          cursor: 'text', minWidth: 0,
        }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onRename(e.target.value)}
      />
      <span style={{ fontSize: 9, color: '#4a4a6a', flexShrink: 0 }}>{hexCount}</span>
      <button
        style={{
          background: 'none', border: 'none', color: '#5a3a3a', cursor: 'pointer',
          fontSize: 12, padding: '0 2px', lineHeight: 1, flexShrink: 0,
        }}
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title="Delete area"
      >×</button>
    </div>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function AreasSidebar() {
  const {
    areasMode, setAreasMode,
    areas, areaHexes,
    activeAreaId, setActiveAreaId,
    areasStyle, setAreasStyle,
    areasGenParams, setAreasGenParams,
    generateAreas,
    updateArea, deleteArea,
    eraseAllHexesForArea,
    activeTool, setActiveTool,
    labelPresetId, labelOverrides, setLabelCategoryOverride, resetLabelCategoryOverride,
  } = useMapStore()

  const terrainSpec = resolveLabels(labelPresetId, labelOverrides)['terrain']
  const terrainOverride = labelOverrides['terrain']
  const hasTerrainOverride = !!terrainOverride && Object.keys(terrainOverride).length > 0

  const hexCountByArea: Record<string, number> = {}
  for (const aId of Object.values(areaHexes)) {
    hexCountByArea[aId] = (hexCountByArea[aId] ?? 0) + 1
  }

  return (
    <div style={sidebarStyle}>

      {/* ── Mode + tool ───────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Areas Map Mode</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button style={modeBtn(areasMode)} onClick={() => setAreasMode(true)}>On</button>
          <button style={modeBtn(!areasMode)} onClick={() => setAreasMode(false)}>Off</button>
        </div>
        {areasMode && (
          <>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Tool</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                style={modeBtn(activeTool.type === 'areas-draw')}
                onClick={() => setActiveTool({ type: 'areas-draw' })}
              >
                Draw
              </button>
              <button
                style={modeBtn(activeTool.type === 'areas-erase')}
                onClick={() => setActiveTool({ type: 'areas-erase' })}
              >
                Erase
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: '#4a5a4a', lineHeight: 1.4 }}>
              Click empty terrain to create · drag from area to expand
            </div>
          </>
        )}
      </div>

      {/* ── Auto-generate ─────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Generate</div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Target size</span>
            <span style={{ color: '#8ab0e0' }}>{areasGenParams.targetSize} hexes</span>
          </div>
          <input
            type="range" min={2} max={30} step={1} value={areasGenParams.targetSize}
            style={{ width: '100%' }}
            onChange={(e) => setAreasGenParams({ targetSize: +e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>River borders</span>
            <span style={{ color: '#8ab0e0' }}>{Math.round(areasGenParams.riverWeight * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={Math.round(areasGenParams.riverWeight * 100)}
            style={{ width: '100%' }}
            onChange={(e) => setAreasGenParams({ riverWeight: +e.target.value / 100 })}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Terrain borders</span>
            <span style={{ color: '#8ab0e0' }}>{areasGenParams.terrainWeight.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0} max={10} step={0.5} value={areasGenParams.terrainWeight}
            style={{ width: '100%' }}
            onChange={(e) => setAreasGenParams({ terrainWeight: +e.target.value })}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={{
              flex: 1, padding: '5px 0', fontSize: 10, letterSpacing: 0.5,
              textTransform: 'uppercase', background: '#1a2a3a', border: '1px solid #2a3a5a',
              color: '#8ab0e0', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'ui-monospace, monospace',
            }}
            onClick={generateAreas}
          >
            Generate
          </button>
          <button
            style={{
              flex: 1, padding: '5px 0', fontSize: 10, letterSpacing: 0.5,
              textTransform: 'uppercase', background: 'none', border: '1px solid #2a2a4a',
              color: '#4a4a6a', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'ui-monospace, monospace',
            }}
            onClick={() => {
              for (const area of areas) eraseAllHexesForArea(area.id)
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Area list ─────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={labelStyle}>Areas ({areas.length})</span>
          {activeAreaId && (
            <button
              style={{
                background: 'none', border: '1px solid #3a2a2a', color: '#6a4a4a',
                fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'ui-monospace, monospace',
              }}
              onClick={() => eraseAllHexesForArea(activeAreaId)}
              title="Clear all hexes from this area"
            >
              Clear area
            </button>
          )}
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 220 }}>
          {areas.map((area) => (
            <AreaRow
              key={area.id}
              area={area}
              isActive={activeAreaId === area.id}
              hexCount={hexCountByArea[area.id] ?? 0}
              onSelect={() => setActiveAreaId(area.id)}
              onRename={(name) => updateArea(area.id, { name })}
              onColorChange={(color) => updateArea(area.id, { color })}
              onDelete={() => deleteArea(area.id)}
            />
          ))}
          {areas.length === 0 && (
            <div style={{ color: '#3a3a5a', fontSize: 11, paddingTop: 4 }}>
              No areas yet — Generate or draw on the map.
            </div>
          )}
        </div>
      </div>

      {/* ── Style ─────────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Style</div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Border width</span>
            <span style={{ color: '#8ab0e0' }}>{areasStyle.borderWidth.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.5} max={6} step={0.5} value={areasStyle.borderWidth}
            style={{ width: '100%' }}
            onChange={(e) => setAreasStyle({ borderWidth: +e.target.value })}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Border color</span>
          <input
            type="color"
            value={areasStyle.borderColor ?? '#2c1a00'}
            style={{ width: 28, height: 20, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
            onChange={(e) => setAreasStyle({ borderColor: e.target.value })}
          />
        </div>
      </div>

      {/* ── Labels ────────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={labelStyle}>Labels</span>
          {hasTerrainOverride && (
            <button
              onClick={() => resetLabelCategoryOverride('terrain')}
              style={{ background: 'none', border: '1px solid #3a3a5a', color: '#6a6a8a', fontSize: 9, padding: '2px 6px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }}
            >
              ↺ Reset
            </button>
          )}
        </div>

        {/* Font */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: '#6a6a8a', width: 44, flexShrink: 0 }}>Font</span>
          <select
            value={terrainSpec.family}
            onChange={e => setLabelCategoryOverride('terrain', { family: e.target.value })}
            style={{ flex: 1, fontSize: 9.5, background: '#1a1a2e', color: '#c0c0e0', border: '1px solid #2a2a4a', padding: '3px 4px', fontFamily: 'ui-monospace, monospace' }}
          >
            {FONT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Color */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: '#6a6a8a', width: 44, flexShrink: 0 }}>Color</span>
          <input
            type="color" value={terrainSpec.color}
            onChange={e => setLabelCategoryOverride('terrain', { color: e.target.value })}
            style={{ width: 26, height: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          />
          <span style={{ fontSize: 9.5, color: '#6a6a8a', fontFamily: 'ui-monospace, monospace' }}>{terrainSpec.color}</span>
        </div>

        {/* Size */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: '#6a6a8a' }}>Size</span>
            <span style={{ color: '#8ab0e0', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>{terrainSpec.sizeScale.toFixed(2)}×</span>
          </div>
          <input
            type="range" min={0.4} max={2.0} step={0.05} value={terrainSpec.sizeScale}
            style={{ width: '100%' }}
            onChange={e => setLabelCategoryOverride('terrain', { sizeScale: parseFloat(e.target.value) })}
          />
        </div>

        {/* Spacing */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: '#6a6a8a' }}>Spacing</span>
            <span style={{ color: '#8ab0e0', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>{terrainSpec.letterSpacing.toFixed(2)}em</span>
          </div>
          <input
            type="range" min={0} max={0.5} step={0.01} value={terrainSpec.letterSpacing}
            style={{ width: '100%' }}
            onChange={e => setLabelCategoryOverride('terrain', { letterSpacing: parseFloat(e.target.value) })}
          />
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['italic', 'uppercase'] as const).map(key => (
            <button
              key={key}
              onClick={() => setLabelCategoryOverride('terrain', { [key]: !terrainSpec[key] })}
              style={{
                padding: '2px 8px', fontSize: 9, fontFamily: 'ui-monospace, monospace',
                background: terrainSpec[key] ? '#2a3a5a' : 'none',
                color: terrainSpec[key] ? '#8ab0e0' : '#4a4a6a',
                border: `1px solid ${terrainSpec[key] ? '#3a5a8a' : '#2a2a4a'}`,
                cursor: 'pointer',
              }}
            >
              {key === 'italic' ? 'Italic' : 'UPPER'}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div style={{
          marginTop: 8, padding: '6px 8px', background: '#12122a', border: '1px solid #2a2a4a',
          fontFamily: terrainSpec.family.split(',')[0].replace(/"/g, ''),
          fontSize: Math.round(13 * terrainSpec.sizeScale),
          fontStyle: terrainSpec.italic ? 'italic' : 'normal',
          fontWeight: terrainSpec.weight,
          color: terrainSpec.color,
          letterSpacing: `${terrainSpec.letterSpacing}em`,
          textTransform: terrainSpec.uppercase ? 'uppercase' : 'none',
        }}>
          Forest Area
        </div>
      </div>

    </div>
  )
}
