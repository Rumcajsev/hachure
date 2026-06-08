import { useState, useEffect } from 'react'
import { useMapStore, DEFAULT_RIVER_TIER_STYLES, type SettlementTier } from '../../store/mapStore'
import { shouldSuppressShortcut } from '../../lib/keyboard'
import { useTheme } from '../../context/ThemeContext'
import {
  BrushRow, StripShell, FlyoutShell, V2Divider, TriggerRow, TGap, ToggleRow,
} from './sidebar'
import {
  RiverTierFlyout, CanalStyleFlyout, OsmRiversFlyout,
  RiverSegmentFlyout, RiverLabelFlyout,
} from './RiversSidebarV3'
import {
  RoadStyleFlyout, RailStyleFlyout, RoadShapeFlyout, RailShapeFlyout,
  OsmRoadsFlyout, OsmRailsFlyout, BridgesFlyout, RoadSegmentFlyout,
  TerrainClearanceFlyout,
} from './RoadsSidebarV3'
import {
  TierIcon, TierStyleFlyout, UrbanStyleFlyout, OsmSettlementsFlyout, SettlementLabelFlyout,
} from './SettlementsSidebarV3'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROAD_TIERS = [
  { tier: 0 as const, label: 'Motorway',  color: '#b07820' },
  { tier: 1 as const, label: 'Primary',   color: '#8a5c2a' },
  { tier: 2 as const, label: 'Secondary', color: '#606060' },
]
const RAIL_COLOR = '#4a7a9a'
const TIER_LABELS: Record<SettlementTier, string> = {
  1: 'Tier I', 2: 'Tier II', 3: 'Tier III', 4: 'Tier IV',
}
const IMPORT_ICON = (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 1.5v5" /><path d="M2.5 4.5l2.5 2.5 2.5-2.5" /><path d="M1.5 8.5h7" />
  </svg>
)

// ── FlyoutState ───────────────────────────────────────────────────────────────

type FlyoutState =
  | null
  | { kind: 'river-0' } | { kind: 'river-1' } | { kind: 'river-2' }
  | { kind: 'osm-rivers' }
  | { kind: 'river-segment'; segMode: 'river' | 'canal' }
  | { kind: 'river-labels' }
  | { kind: 'road-style'; tier: 0 | 1 | 2 }
  | { kind: 'rail-style' }
  | { kind: 'road-shape' }
  | { kind: 'rail-shape' }
  | { kind: 'road-import' }
  | { kind: 'rail-import' }
  | { kind: 'bridges' }
  | { kind: 'terrain-clearance' }
  | { kind: 'road-segment'; segMode: 'road' | 'rail' }
  | { kind: 'tier'; tier: SettlementTier }
  | { kind: 'urban' }
  | { kind: 'placed' }
  | { kind: 'osm-settlements' }
  | { kind: 'label'; index: number }

function flyoutKey(f: FlyoutState): string | null {
  if (!f) return null
  if (f.kind === 'road-style') return `road-style-${f.tier}`
  if (f.kind === 'tier') return `tier-${f.tier}`
  if (f.kind === 'label') return `label-${f.index}`
  return f.kind
}

// ── PlacedSettlementsFlyout ───────────────────────────────────────────────────

function PlacedSettlementsFlyout({
  onClose,
  onOpenLabel,
}: {
  onClose: () => void
  onOpenLabel: (index: number) => void
}) {
  const t = useTheme()
  const {
    settlements, settlementTierStyles,
    deleteSettlement, updateSettlement,
    settlementMoveIndex, setSettlementMoveIndex,
  } = useMapStore()

  const [editingName, setEditingName] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  const allPlaced = settlements.filter(s => s.isCustom && s.hex_q !== null)

  const startRename = (i: number, name: string) => { setEditingName(i); setEditingNameValue(name) }
  const commitRename = (i: number) => {
    if (editingNameValue.trim()) updateSettlement(i, { name: editingNameValue.trim() })
    setEditingName(null)
  }

  return (
    <FlyoutShell title={`Placed (${allPlaced.length})`} onClose={onClose}>
      {allPlaced.length === 0 ? (
        <div style={{ padding: '8px 14px', fontFamily: t.sans, fontSize: 10.5, color: t.inkFaint, fontStyle: 'italic' }}>
          Click a tier then a hex to place
        </div>
      ) : (
        <div style={{ padding: '4px 0 8px' }}>
          {settlements.map((s, i) => {
            if (!s.isCustom) return null
            const ts = settlementTierStyles[(s.tier ?? 2) as SettlementTier]
            const isMoving = settlementMoveIndex === i
            const hasLabelOverride = !!(s.labelOverride && Object.keys(s.labelOverride).length > 0)
            return (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '16px 1fr 18px 18px 18px',
                  alignItems: 'center', gap: 4,
                  padding: '4px 12px', borderBottom: `1px solid ${t.line2}`,
                }}
              >
                <TierIcon shape={ts.shape} size={ts.size} fill={ts.fillColor} stroke={ts.strokeColor} strokeWidth={ts.strokeWidth} />
                {editingName === i ? (
                  <input
                    autoFocus
                    value={editingNameValue}
                    onChange={e => setEditingNameValue(e.target.value)}
                    onBlur={() => commitRename(i)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditingName(null) }}
                    style={{
                      flex: 1, background: t.paper2, border: `1px solid ${t.line}`,
                      color: t.ink, fontFamily: t.sans, fontSize: 10.5, padding: '1px 4px',
                      minWidth: 0,
                    }}
                  />
                ) : (
                  <span
                    style={{ fontFamily: t.sans, fontSize: 10.5, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', minWidth: 0 }}
                    onDoubleClick={() => startRename(i, s.name)}
                    title="Double-click to rename"
                  >
                    {s.name}
                  </span>
                )}
                <button
                  onClick={() => isMoving ? setSettlementMoveIndex(null) : setSettlementMoveIndex(i)}
                  title={isMoving ? 'Cancel move' : 'Move'}
                  style={{
                    background: isMoving ? t.paper2 : 'none',
                    border: `1px solid ${isMoving ? t.line : 'transparent'}`,
                    color: isMoving ? t.ink : t.inkFaint,
                    cursor: 'pointer', padding: '1px 2px', fontSize: 9, fontFamily: t.mono,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >↔</button>
                <button
                  onClick={() => onOpenLabel(i)}
                  title="Label style"
                  style={{
                    background: 'none', border: 'none',
                    color: hasLabelOverride ? '#7de0a0' : t.inkFaint,
                    cursor: 'pointer', padding: '1px 2px', fontSize: 9, fontFamily: t.mono,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >T</button>
                <button
                  onClick={() => deleteSettlement(i)}
                  title="Delete"
                  style={{ background: 'none', border: 'none', color: t.inkFaint, cursor: 'pointer', padding: '1px 2px', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >×</button>
              </div>
            )
          })}
        </div>
      )}
    </FlyoutShell>
  )
}

// ── FeaturesSidebarV3 ─────────────────────────────────────────────────────────

export function FeaturesSidebarV3() {
  const t = useTheme()
  const {
    riverEditMode, riverNodeEditMode,
    riverSelectMode,
    riverTierStyles, riverStyle,
    selectedSegmentKeys, setSelectedSegmentKeys,
    selectedCanalSegmentKeys, setSelectedCanalSegmentKeys,
    roadPaintMode, roadPaintBrush, roadPaintEraser,
    railPaintMode, railPaintEraser,
    roadNodeEditMode, railNodeEditMode,
    roadSelectMode, railSelectMode,
    selectedRoadSegmentKeys, setSelectedRoadSegmentKeys,
    selectedRailSegmentKeys, setSelectedRailSegmentKeys,
    bridgesEnabled,
    settlements,
    settlementPlaceTier, setSettlementPlaceTier,
    settlementTierStyles,
    settlementMoveIndex, setSettlementMoveIndex,
    urbanHexes, urbanPaintMode,
    showSettlementLabels, setShowSettlementLabels,
    setActiveTool,
    dataSource,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutState>(null)

  const allPlaced = settlements.filter(s => s.isCustom && s.hex_q !== null)

  const open = (next: FlyoutState) =>
    setFlyout(prev => flyoutKey(prev) === flyoutKey(next) ? null : next)

  // Auto-open river segment flyout on selection
  useEffect(() => {
    if (selectedSegmentKeys.length > 0)       setFlyout({ kind: 'river-segment', segMode: 'river' })
    else if (selectedCanalSegmentKeys.length > 0) setFlyout({ kind: 'river-segment', segMode: 'canal' })
    else setFlyout(prev => prev?.kind === 'river-segment' ? null : prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentKeys.length, selectedCanalSegmentKeys.length])

  // Auto-open road segment flyout on selection
  useEffect(() => {
    if (selectedRoadSegmentKeys.length > 0)       setFlyout({ kind: 'road-segment', segMode: 'road' })
    else if (selectedRailSegmentKeys.length > 0)  setFlyout({ kind: 'road-segment', segMode: 'rail' })
    else setFlyout(prev => prev?.kind === 'road-segment' ? null : prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoadSegmentKeys.length, selectedRailSegmentKeys.length])

  // Settlement tier keyboard shortcuts
  const selectTier = (tier: SettlementTier) => {
    setSettlementPlaceTier(settlementPlaceTier === tier ? null : tier)
    setSettlementMoveIndex(null)
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldSuppressShortcut(e)) return
      if (e.key === '1') selectTier(1)
      else if (e.key === '2') selectTier(2)
      else if (e.key === '3') selectTier(3)
      else if (e.key === '4') selectTier(4)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementPlaceTier])

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <StripShell>

        {/* ── RIVERS ───────────────────────────────────────────────── */}
        <V2Divider label="Rivers" />

        {([0, 1, 2] as const).map((tier, i) => {
          const ts = (riverTierStyles ?? DEFAULT_RIVER_TIER_STYLES)[tier]
          const kind = `river-${tier}` as 'river-0' | 'river-1' | 'river-2'
          return (
            <BrushRow
              key={tier}
              label={ts.label}
              color={ts.color}
              active={riverEditMode}
              shortcut={['Q', 'W', 'E'][i]}
              showCog
              cogOpen={flyout?.kind === kind}
              onSelect={() => setActiveTool(riverEditMode ? { type: 'none' } : { type: 'river-paint' })}
              onCog={() => open({ kind })}
            />
          )
        })}
        {riverEditMode && (
          <BrushRow
            label="— select"
            color={riverSelectMode ? (riverTierStyles ?? DEFAULT_RIVER_TIER_STYLES)[1].color : t.inkFaint}
            active={riverSelectMode}
            onSelect={() => setActiveTool(riverSelectMode ? { type: 'river-paint' } : { type: 'river-select' })}
          />
        )}

        <TGap />

        <BrushRow
          label="Edit nodes"
          color={riverNodeEditMode ? '#8ab8d8' : t.inkFaint}
          active={riverNodeEditMode}
          onSelect={() => setActiveTool(riverNodeEditMode ? { type: 'none' } : { type: 'river-node-edit' })}
        />

        {dataSource === 'osm' && (
          <>
            <TGap />
            <TriggerRow label="Fetch rivers" active={flyout?.kind === 'osm-rivers'} onClick={() => open({ kind: 'osm-rivers' })} />
          </>
        )}

        <TGap />
        <TriggerRow label="Label style" active={flyout?.kind === 'river-labels'} onClick={() => open({ kind: 'river-labels' })} />

        {/* ── ROADS ────────────────────────────────────────────────── */}
        <V2Divider label="Roads" />

        {ROAD_TIERS.map(({ tier, label, color }) => (
          <BrushRow
            key={tier}
            label={label}
            color={color}
            active={roadPaintMode && roadPaintBrush === tier && !roadPaintEraser}
            shortcut={['1', '2', '3'][tier]}
            showCog
            cogOpen={flyout?.kind === 'road-style' && (flyout as Extract<FlyoutState, { kind: 'road-style' }>).tier === tier}
            onSelect={() => {
              if (roadPaintMode && roadPaintBrush === tier && !roadPaintEraser) setActiveTool({ type: 'none' })
              else setActiveTool({ type: 'road', tier, erasing: false })
            }}
            onCog={() => open({ kind: 'road-style', tier })}
          />
        ))}
        <BrushRow
          label="Eraser"
          color={t.inkFaint}
          active={roadPaintMode && roadPaintEraser}
          shortcut="R"
          onSelect={() => {
            if (roadPaintMode && roadPaintEraser) setActiveTool({ type: 'none' })
            else setActiveTool({ type: 'road', tier: roadPaintBrush, erasing: true })
          }}
        />
        <BrushRow
          label="Edit nodes"
          color={roadNodeEditMode ? '#b07820' : t.inkFaint}
          active={roadNodeEditMode}
          onSelect={() => setActiveTool(roadNodeEditMode ? { type: 'none' } : { type: 'node-edit' })}
        />
        {roadSelectMode && (
          <div style={{ padding: '1px 8px 4px', fontFamily: t.mono, fontSize: 8.5, color: t.inkMute, lineHeight: 1.4 }}>
            click road to select
          </div>
        )}
        <TGap />
        <TriggerRow label="Road shape" active={flyout?.kind === 'road-shape'} onClick={() => open({ kind: 'road-shape' })} />
        <TriggerRow label="Terrain clearance" active={flyout?.kind === 'terrain-clearance'} onClick={() => open({ kind: 'terrain-clearance' })} />
        {dataSource === 'osm' && (
          <TriggerRow label="Fetch from OSM" active={flyout?.kind === 'road-import'} icon={IMPORT_ICON} onClick={() => open({ kind: 'road-import' })} />
        )}

        <V2Divider label="Rails" />

        <BrushRow
          label="Rail"
          color={RAIL_COLOR}
          active={railPaintMode && !railPaintEraser}
          showCog
          cogOpen={flyout?.kind === 'rail-style'}
          onSelect={() => {
            if (railPaintMode && !railPaintEraser) setActiveTool({ type: 'none' })
            else setActiveTool({ type: 'rail', erasing: false })
          }}
          onCog={() => open({ kind: 'rail-style' })}
        />
        <BrushRow
          label="Eraser"
          color={t.inkFaint}
          active={railPaintMode && railPaintEraser}
          onSelect={() => {
            if (railPaintMode && railPaintEraser) setActiveTool({ type: 'none' })
            else setActiveTool({ type: 'rail', erasing: true })
          }}
        />
        <BrushRow
          label="Edit nodes"
          color={railNodeEditMode ? '#4a7a9a' : t.inkFaint}
          active={railNodeEditMode}
          onSelect={() => setActiveTool(railNodeEditMode ? { type: 'none' } : { type: 'rail-node-edit' })}
        />
        {railSelectMode && (
          <div style={{ padding: '1px 8px 4px', fontFamily: t.mono, fontSize: 8.5, color: t.inkMute, lineHeight: 1.4 }}>
            right-click rail to select
          </div>
        )}
        <TGap />
        <TriggerRow label="Rail shape" active={flyout?.kind === 'rail-shape'} onClick={() => open({ kind: 'rail-shape' })} />
        {dataSource === 'osm' && (
          <TriggerRow label="Fetch from OSM" active={flyout?.kind === 'rail-import'} icon={IMPORT_ICON} onClick={() => open({ kind: 'rail-import' })} />
        )}

        <V2Divider label="Bridges" />
        <TriggerRow label="Bridge settings" active={flyout?.kind === 'bridges'} onClick={() => open({ kind: 'bridges' })} enabled={bridgesEnabled} />

        {/* ── SETTLEMENTS ──────────────────────────────────────────── */}
        <V2Divider label="Settlements" />

        {([1, 2, 3, 4] as SettlementTier[]).map(tier => {
          const ts = settlementTierStyles[tier]
          return (
            <BrushRow
              key={tier}
              label={TIER_LABELS[tier]}
              color={ts.fillColor || ts.strokeColor}
              active={settlementPlaceTier === tier}
              shortcut={['Z', 'X', 'C', 'V'][tier - 1]}
              showCog
              cogOpen={flyout?.kind === 'tier' && (flyout as Extract<FlyoutState, { kind: 'tier' }>).tier === tier}
              onSelect={() => selectTier(tier)}
              onCog={() => open({ kind: 'tier', tier })}
            />
          )
        })}

        <TGap />
        <V2Divider label={`Urban (${urbanHexes.length})`} />
        <BrushRow
          label="Paint"
          color="#5a8a5a"
          active={urbanPaintMode === 'paint'}
          onSelect={() => setActiveTool(urbanPaintMode === 'paint' ? { type: 'none' } : { type: 'urban', mode: 'paint' })}
        />
        <BrushRow
          label="Erase"
          color="#8a5a5a"
          active={urbanPaintMode === 'erase'}
          onSelect={() => setActiveTool(urbanPaintMode === 'erase' ? { type: 'none' } : { type: 'urban', mode: 'erase' })}
        />
        <TriggerRow label="Style…" active={flyout?.kind === 'urban'} onClick={() => open({ kind: 'urban' })} />

        <TGap />
        <TriggerRow
          label={`Placed (${allPlaced.length})`}
          active={flyout?.kind === 'placed'}
          onClick={() => open({ kind: 'placed' })}
        />

        {dataSource === 'osm' && (
          <>
            <TGap />
            <V2Divider label="OSM" />
            <TriggerRow label="Settlements" active={flyout?.kind === 'osm-settlements'} onClick={() => open({ kind: 'osm-settlements' })} />
          </>
        )}

        <TGap />
        <V2Divider label="Labels" />
        <ToggleRow label="Show labels" checked={showSettlementLabels} onChange={setShowSettlementLabels} />

        <div style={{ height: 8 }} />
      </StripShell>

      {/* ── Flyouts ───────────────────────────────────────────────── */}
      {flyout?.kind === 'river-0' && <RiverTierFlyout tier={0} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'river-1' && <RiverTierFlyout tier={1} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'river-2' && <RiverTierFlyout tier={2} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'osm-rivers'        && <OsmRiversFlyout  onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'river-labels'      && <RiverLabelFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'river-segment'     && (
        <RiverSegmentFlyout
          mode={(flyout as Extract<FlyoutState, { kind: 'river-segment' }>).segMode}
          onClose={() => {
            const mode = (flyout as Extract<FlyoutState, { kind: 'river-segment' }>).segMode
            if (mode === 'river') setSelectedSegmentKeys([])
            else setSelectedCanalSegmentKeys([])
          }}
        />
      )}
      {flyout?.kind === 'road-style'        && <RoadStyleFlyout tier={(flyout as Extract<FlyoutState, { kind: 'road-style' }>).tier} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'rail-style'        && <RailStyleFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'road-shape'        && <RoadShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'rail-shape'        && <RailShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'road-import'       && <OsmRoadsFlyout  onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'rail-import'       && <OsmRailsFlyout  onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'bridges'           && <BridgesFlyout   onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'terrain-clearance' && <TerrainClearanceFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'road-segment'      && (
        <RoadSegmentFlyout
          mode={(flyout as Extract<FlyoutState, { kind: 'road-segment' }>).segMode}
          onClose={() => {
            const mode = (flyout as Extract<FlyoutState, { kind: 'road-segment' }>).segMode
            if (mode === 'road') setSelectedRoadSegmentKeys([])
            else setSelectedRailSegmentKeys([])
            setFlyout(null)
          }}
        />
      )}
      {flyout?.kind === 'tier'              && <TierStyleFlyout tier={(flyout as Extract<FlyoutState, { kind: 'tier' }>).tier} onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'urban'             && <UrbanStyleFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'placed'            && (
        <PlacedSettlementsFlyout
          onClose={() => setFlyout(null)}
          onOpenLabel={i => setFlyout({ kind: 'label', index: i })}
        />
      )}
      {flyout?.kind === 'osm-settlements'   && <OsmSettlementsFlyout onClose={() => setFlyout(null)} />}
      {flyout?.kind === 'label'             && <SettlementLabelFlyout index={(flyout as Extract<FlyoutState, { kind: 'label' }>).index} onClose={() => setFlyout(null)} />}

    </div>
  )
}
