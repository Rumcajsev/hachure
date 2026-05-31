import { useEffect, useState } from 'react'
import { useMapStore, TERRAIN_PRIORITY } from '../store/mapStore'
import { TerrainBrushPicker } from './TerrainBrushPicker'
import { TerrainSettingsFlyout } from './TerrainSettingsFlyout'
import { CoastlineSettingsFlyout } from './CoastlineSettingsFlyout'
import { EdgeBlobShapeFlyout } from './EdgeBlobShapeFlyout'
import { ClassificationFlyout } from './ClassificationFlyout'
import { AddTerrainFlyout } from './AddTerrainFlyout'
import { BlobCutsFlyout } from './BlobCutsFlyout'
import { ElevationFlyout } from './ElevationFlyout'
import { ToolButton, CogIcon } from './ToolButton'
import { sidebarStyle, sectionStyle, labelStyle } from './sidebarStyles'
import { EnabledSection, SectionLabel } from './ui'
import { shouldSuppressShortcut } from '../lib/keyboard'

const ELEVATION_BRUSHES = [
  { brush: 'flat'      as const, color: '#5a7a5a', accent: '#3a7a3a' },
  { brush: 'hills'     as const, color: '#8a8a4a', accent: '#7a7a30' },
  { brush: 'mountains' as const, color: '#8a6a3a', accent: '#7a4a20' },
]

export function TerrainSidebar() {
  const {
    terrainPaintMode, terrainPaintBrush,
    elevationPaintMode, elevationPaintBrush,
    setActiveTool,
    terrainLayersEnabled, setTerrainLayersEnabled,
    realisticCoastline, setRealisticCoastline,
    terrainEdgePaintEnabled, setTerrainEdgePaintEnabled,
    customTerrains, updateCustomTerrain, removeCustomTerrain,
  } = useMapStore()

  const [openSettingsTerrain, setOpenSettingsTerrain] = useState<string | null>(null)
  const [settingsAnchorY, setSettingsAnchorY] = useState(0)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [defaultsAnchorY, setDefaultsAnchorY] = useState(0)
  const [edgeBlobShapeOpen, setEdgeBlobShapeOpen] = useState(false)
  const [edgeBlobShapeAnchorY, setEdgeBlobShapeAnchorY] = useState(0)
  const [blobCutsOpen, setBlobCutsOpen] = useState(false)
  const [blobCutsAnchorY, setBlobCutsAnchorY] = useState(0)
  const [coastlineFlyoutOpen, setCoastlineFlyoutOpen] = useState(false)
  const [coastlineAnchorY, setCoastlineAnchorY] = useState(0)
  const [classificationOpen, setClassificationOpen] = useState(false)
  const [classificationAnchorY, setClassificationAnchorY] = useState(0)
  const [elevationFlyoutOpen, setElevationFlyoutOpen] = useState(false)
  const [elevationFlyoutAnchorY, setElevationFlyoutAnchorY] = useState(0)
  const [addTerrainOpen, setAddTerrainOpen] = useState(false)
  const [addTerrainAnchorY, setAddTerrainAnchorY] = useState(0)
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)

  const selectBrush = (terrain: string) => {
    if (terrainPaintMode && terrainPaintBrush === terrain) {
      setActiveTool({ type: 'none' })
    } else {
      setActiveTool({ type: 'terrain', brush: terrain })
    }
  }

  const toggleElevationPaint = (brush: 'flat' | 'hills' | 'mountains') => {
    if (elevationPaintMode && elevationPaintBrush === brush) {
      setActiveTool({ type: 'none' })
    } else {
      setActiveTool({ type: 'elevation', brush })
    }
  }

  const openSettings = (terrain: string, y: number) => {
    if (openSettingsTerrain === terrain) {
      setOpenSettingsTerrain(null)
    } else {
      setDefaultsOpen(false)
      setOpenSettingsTerrain(terrain)
      setSettingsAnchorY(y)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (shouldSuppressShortcut(e)) return
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TERRAIN_PRIORITY.length) {
        selectBrush(TERRAIN_PRIORITY[idx])
      } else if (e.key === 'Escape') {
        setActiveTool({ type: 'none' })
        setOpenSettingsTerrain(null)
        setDefaultsOpen(false)
        setClassificationOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainPaintMode, terrainPaintBrush])

  const cogBtn = (
    dataAttr: string,
    isOpen: boolean,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void,
  ) => (
    <button
      {...{ [dataAttr]: '' }}
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
        color: isOpen ? '#a0a0c0' : '#4a4a6a',
        display: 'flex', alignItems: 'center', lineHeight: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = '#a0a0c0')}
      onMouseLeave={e => (e.currentTarget.style.color = isOpen ? '#a0a0c0' : '#4a4a6a')}
    >
      <CogIcon />
    </button>
  )

  const flyoutBtn = (
    label: string,
    isOpen: boolean,
    dataAttr: string,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void,
    accentBg = '#1a1f1a',
    accentBorder = '#3a5a3a',
    accentText = '#c0e0c0',
  ) => (
    <button
      {...{ [dataAttr]: '' }}
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: isOpen ? accentBg : 'none',
        border: `1px solid ${isOpen ? accentBorder : '#1e1f2e'}`,
        borderRadius: 3, padding: '5px 8px', cursor: 'pointer',
        fontFamily: 'ui-monospace, monospace', fontSize: 11,
        color: isOpen ? accentText : '#8a8aaa', width: '100%',
      }}
      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.color = '#a0a0c0' }}
      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.color = '#8a8aaa' }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 9, color: '#4a4a6a' }}>›</span>
    </button>
  )

  return (
    <>
      {openSettingsTerrain && (
        <TerrainSettingsFlyout terrain={openSettingsTerrain} anchorY={settingsAnchorY} onClose={() => setOpenSettingsTerrain(null)} />
      )}
      {defaultsOpen && (
        <TerrainSettingsFlyout anchorY={defaultsAnchorY} onClose={() => setDefaultsOpen(false)} />
      )}
      {coastlineFlyoutOpen && (
        <CoastlineSettingsFlyout anchorY={coastlineAnchorY} onClose={() => setCoastlineFlyoutOpen(false)} />
      )}
      {edgeBlobShapeOpen && (
        <EdgeBlobShapeFlyout anchorY={edgeBlobShapeAnchorY} onClose={() => setEdgeBlobShapeOpen(false)} />
      )}
      {blobCutsOpen && (
        <BlobCutsFlyout anchorY={blobCutsAnchorY} onClose={() => setBlobCutsOpen(false)} />
      )}
      {classificationOpen && (
        <ClassificationFlyout anchorY={classificationAnchorY} onClose={() => setClassificationOpen(false)} />
      )}
      {addTerrainOpen && (
        <AddTerrainFlyout anchorY={addTerrainAnchorY} onClose={() => setAddTerrainOpen(false)} />
      )}
      {elevationFlyoutOpen && (
        <ElevationFlyout anchorY={elevationFlyoutAnchorY} onClose={() => setElevationFlyoutOpen(false)} />
      )}

      <div style={sidebarStyle}>

        {/* ── Terrain ── */}
        <div style={sectionStyle}>
          <SectionLabel action={cogBtn(
            'data-classification-flyout',
            classificationOpen,
            e => { setClassificationOpen(o => !o); setClassificationAnchorY(e.currentTarget.getBoundingClientRect().top) },
          )}>Terrain</SectionLabel>
          <TerrainBrushPicker
            activeBrush={terrainPaintBrush}
            paintMode={terrainPaintMode}
            onSelect={selectBrush}
            onSettings={openSettings}
            onAddTerrain={y => { setAddTerrainAnchorY(y); setAddTerrainOpen(o => !o) }}
          />
        </div>

        {/* ── Elevation ── */}
        <div style={sectionStyle}>
          <SectionLabel action={cogBtn(
            'data-elevation-flyout',
            elevationFlyoutOpen,
            e => { setElevationFlyoutOpen(o => !o); setElevationFlyoutAnchorY(e.currentTarget.getBoundingClientRect().top) },
          )}>Elevation</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ELEVATION_BRUSHES.map(({ brush, color, accent }) => (
              <ToolButton
                key={brush}
                label={brush}
                active={elevationPaintMode && elevationPaintBrush === brush}
                color={color}
                onSelect={() => toggleElevationPaint(brush)}
                accentBg={`${accent}22`}
                accentBorder={accent}
                accentText="#d0d0b0"
              />
            ))}
          </div>
        </div>

        {/* ── Settings ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Settings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: terrainEdgePaintEnabled ? '#c0c0e0' : '#6a6a8a' }}>
              <input
                type="checkbox"
                checked={terrainEdgePaintEnabled}
                onChange={e => setTerrainEdgePaintEnabled(e.target.checked)}
                style={{ accentColor: '#7a9e7a' }}
              />
              Edge painting
            </label>
            {terrainEdgePaintEnabled && (
              <div style={{ fontSize: 10, color: '#5a8a5a', letterSpacing: 0.3, paddingLeft: 18 }}>
                Near edge → paints edge blob · mountains → cliff symbol
              </div>
            )}

            <EnabledSection
              label="Realistic coastline"
              enabled={realisticCoastline}
              onToggle={v => { setRealisticCoastline(v); if (!v) setCoastlineFlyoutOpen(false) }}
              accentColor="#4a7a9a"
            >
              {flyoutBtn(
                'Coastline settings',
                coastlineFlyoutOpen,
                'data-coastline-flyout',
                e => { setCoastlineFlyoutOpen(o => !o); setCoastlineAnchorY(e.currentTarget.getBoundingClientRect().top) },
                '#1a1f2a', '#3a5a7a', '#a0c0e0',
              )}
            </EnabledSection>

            {flyoutBtn(
              'Default blob shape',
              defaultsOpen,
              'data-terrain-flyout',
              e => {
                if (defaultsOpen) { setDefaultsOpen(false) }
                else { setOpenSettingsTerrain(null); setDefaultsOpen(true); setDefaultsAnchorY(e.currentTarget.getBoundingClientRect().top) }
              },
            )}
            {flyoutBtn(
              'Road & river cuts',
              blobCutsOpen,
              'data-blob-cuts-flyout',
              e => { setBlobCutsOpen(o => !o); setBlobCutsAnchorY(e.currentTarget.getBoundingClientRect().top) },
            )}

          </div>
        </div>

        {/* ── Render Style ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Render Style</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: terrainLayersEnabled ? '#c0c0e0' : '#6a6a8a' }}>
              <input
                type="checkbox"
                checked={terrainLayersEnabled}
                onChange={e => setTerrainLayersEnabled(e.target.checked)}
                style={{ accentColor: '#4a7a5a' }}
              />
              Terrain layers
            </label>
          </div>
        </div>

        {/* ── Edge Blobs ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Edge Blobs</div>
          {flyoutBtn(
            'Edge blob shape',
            edgeBlobShapeOpen,
            'data-edge-blob-shape-flyout',
            e => { setEdgeBlobShapeOpen(o => !o); setEdgeBlobShapeAnchorY(e.currentTarget.getBoundingClientRect().top) },
          )}
        </div>

        {/* ── Custom Terrains ── */}
        {customTerrains.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Custom Terrains</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {customTerrains.map(ct => (
                <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: ct.color, flexShrink: 0, border: '1px solid #3a3a5a' }} />
                  {editingCustomId === ct.id ? (
                    <input
                      autoFocus
                      value={ct.name}
                      onChange={e => updateCustomTerrain(ct.id, { name: e.target.value })}
                      onBlur={() => setEditingCustomId(null)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingCustomId(null) }}
                      style={{ flex: 1, background: '#1a1f2a', border: '1px solid #3a5a7a', borderRadius: 3, padding: '2px 5px', color: '#c0c0e0', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, fontSize: 11, color: '#b0b0d0', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      onDoubleClick={() => setEditingCustomId(ct.id)}
                      title="Double-click to rename"
                    >{ct.name}</span>
                  )}
                  <input
                    type="color"
                    value={ct.color}
                    onChange={e => updateCustomTerrain(ct.id, { color: e.target.value })}
                    title="Color"
                    style={{ width: 18, height: 18, padding: 0, border: 'none', borderRadius: 2, cursor: 'pointer', background: 'none', flexShrink: 0 }}
                  />
                  <button
                    onClick={() => removeCustomTerrain(ct.id)}
                    title="Remove"
                    style={{ background: 'none', border: 'none', color: '#5a3a3a', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
