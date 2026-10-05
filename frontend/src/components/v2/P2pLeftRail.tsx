import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { useMapStore } from '../../store/mapStore'
import { P2P_TERRAIN_TYPES, DEFAULT_P2P_BLOB, type P2pTerrainType } from '../../store/slices/p2pTerrainSlice'
import { DEFAULT_P2P_TERRAIN_STYLES } from '../../lib/drawP2pTerrain'
import { PALETTE_TERRAIN_GROUPS } from '../../palettes'
import {
  BrushRow, MiniSlider, StripShell, useDeferredSlider,
  BlobPresetChips, ColorChip, ColorPickerHost, ToggleSwitch,
} from './sidebar'

const TERRAIN_LABELS: Record<P2pTerrainType, string> = {
  fields: 'Fields',
  light_forest: 'Light Forest',
  heavy_forest: 'Heavy Forest',
  swamp: 'Swamp',
}

/** Minimal placeholder sidebar for p2p mode — just the terrain brush for now.
 *  Phase 7 replaces this with full Network/Terrain/Rivers panels. */
export function P2pLeftRail({ onRegionSizePreviewChange }: {
  /** Called with the slider's in-progress value while dragging (for the canvas's
   *  live all-edges preview), and with null once the drag ends. */
  onRegionSizePreviewChange: (v: number | null) => void
}) {
  const t = useTheme()
  const {
    p2pBrush, setP2pBrush, p2pMaxRegionSizeCm2, setP2pMaxRegionSizeCm2,
    p2pBlobSmooth, setP2pBlobSmooth,
    p2pBlobOffset, setP2pBlobOffset,
    p2pBlobBump, setP2pBlobBump,
    p2pBlobSweepFreq,
    p2pBlobLobeFreq, setP2pBlobLobeFreq,
    p2pBlobLobeAmp, setP2pBlobLobeAmp,
    p2pBlobLobeThreshold, setP2pBlobLobeThreshold,
    p2pBlobLobeDirection,
    p2pBlobTopoStyle, setP2pBlobTopoStyle,
    p2pBlobOutlineEnabled, setP2pBlobOutlineEnabled,
    p2pBlobOutlineColor, setP2pBlobOutlineColor,
    p2pBlobOutlineWidth, setP2pBlobOutlineWidth,
    applyP2pBlobPreset, resetP2pBlobShape,
    p2pRoadBlobCutEnabled, setP2pRoadBlobCutEnabled,
    p2pRoadBlobCutWidth, setP2pRoadBlobCutWidth,
    p2pRoadBlobCutRoughness, setP2pRoadBlobCutRoughness,
    p2pRiverBlobCutEnabled, setP2pRiverBlobCutEnabled,
    p2pRiverBlobCutWidth, setP2pRiverBlobCutWidth,
    p2pRiverBlobCutRoughness, setP2pRiverBlobCutRoughness,
  } = useMapStore()
  const regionSizeSlider = useDeferredSlider(p2pMaxRegionSizeCm2, setP2pMaxRegionSizeCm2)

  // All blob shape sliders trigger the full shapeTerrainBlobs pipeline — defer to drag end,
  // same discipline as hex mode's "Default Shape" flyout (ShapeSettingsFlyout).
  const smoothSlider = useDeferredSlider(p2pBlobSmooth, setP2pBlobSmooth)
  const bumpSlider   = useDeferredSlider(Math.round(p2pBlobBump * 100), v => setP2pBlobBump(v / 100))
  const offsetSlider = useDeferredSlider(Math.round(p2pBlobOffset * 100), v => setP2pBlobOffset(v / 100))
  const topoSlider   = useDeferredSlider(Math.round(p2pBlobTopoStyle * 10), v => setP2pBlobTopoStyle(v / 10))
  const fringeRef = useRef(p2pBlobLobeAmp)
  const [fringeLocal, setFringeLocal] = useState(Math.round(p2pBlobLobeAmp * 100))
  useEffect(() => { setFringeLocal(Math.round(p2pBlobLobeAmp * 100)); fringeRef.current = p2pBlobLobeAmp }, [p2pBlobLobeAmp])

  // Corridor clipping sliders — same deferred-commit discipline (full re-shape + cut
  // on every value), same units as hex mode's RoadTerrainCutFlyout/river equivalent:
  // width is a multiple of R, roughness 0% = a straight-sided cut.
  const roadCutWidthSlider = useDeferredSlider(Math.round(p2pRoadBlobCutWidth * 100), v => setP2pRoadBlobCutWidth(v / 100))
  const roadCutRoughSlider = useDeferredSlider(Math.round(p2pRoadBlobCutRoughness * 100), v => setP2pRoadBlobCutRoughness(v / 100))
  const riverCutWidthSlider = useDeferredSlider(Math.round(p2pRiverBlobCutWidth * 100), v => setP2pRiverBlobCutWidth(v / 100))
  const riverCutRoughSlider = useDeferredSlider(Math.round(p2pRiverBlobCutRoughness * 100), v => setP2pRiverBlobCutRoughness(v / 100))

  const isShapeModified =
    p2pBlobSmooth !== DEFAULT_P2P_BLOB.smooth ||
    p2pBlobOffset !== DEFAULT_P2P_BLOB.offset ||
    p2pBlobBump !== DEFAULT_P2P_BLOB.bump ||
    p2pBlobSweepFreq !== DEFAULT_P2P_BLOB.sweepFreq ||
    p2pBlobLobeFreq !== DEFAULT_P2P_BLOB.lobeFreq ||
    p2pBlobLobeAmp !== DEFAULT_P2P_BLOB.lobeAmp ||
    p2pBlobLobeThreshold !== DEFAULT_P2P_BLOB.lobeThreshold ||
    p2pBlobLobeDirection !== DEFAULT_P2P_BLOB.lobeDirection ||
    p2pBlobTopoStyle !== DEFAULT_P2P_BLOB.topoStyle

  const selectBrush = (v: P2pTerrainType | 'eraser') => {
    setP2pBrush(p2pBrush === v ? 'off' : v)
  }

  const sectionLabel = (text: string) => (
    <div style={{ padding: '10px 12px 2px', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>
      {text}
    </div>
  )

  return (
    <ColorPickerHost>
      <StripShell>
        {sectionLabel('Terrain Brush')}
        {P2P_TERRAIN_TYPES.map(terrain => (
          <BrushRow
            key={terrain}
            label={TERRAIN_LABELS[terrain]}
            color={DEFAULT_P2P_TERRAIN_STYLES[terrain].color}
            active={p2pBrush === terrain}
            onSelect={() => selectBrush(terrain)}
          />
        ))}
        <BrushRow
          label="Eraser"
          color="#cc4444"
          active={p2pBrush === 'eraser'}
          onSelect={() => selectBrush('eraser')}
        />

        {sectionLabel('Regions')}
        <MiniSlider
          label="Max region size"
          display={`${regionSizeSlider.value} cm²`}
          value={regionSizeSlider.value}
          min={1}
          max={60}
          step={1}
          onChange={v => { regionSizeSlider.onChange(v); onRegionSizePreviewChange(v) }}
          onDragStart={() => onRegionSizePreviewChange(p2pMaxRegionSizeCm2)}
          onDragEnd={() => { regionSizeSlider.onDragEnd(); onRegionSizePreviewChange(null) }}
        />

        {sectionLabel('Blob Shape')}
        <BlobPresetChips currentValues={{
          smooth: p2pBlobSmooth, offset: p2pBlobOffset, bump: p2pBlobBump,
          sweepFreq: p2pBlobSweepFreq, lobeFreq: p2pBlobLobeFreq,
          lobeAmp: p2pBlobLobeAmp, lobeThreshold: p2pBlobLobeThreshold,
          lobeDirection: p2pBlobLobeDirection,
        }} onSelect={id => applyP2pBlobPreset(id)} />
        <MiniSlider label="Topo style" display={topoSlider.value === 0 ? 'off' : `${Math.round(topoSlider.value) / 10}×`}
          value={topoSlider.value} min={0} max={30} step={1}
          onChange={topoSlider.onChange} onDragEnd={topoSlider.onDragEnd} />
        <MiniSlider label="Corner Rounding" display={Math.round(smoothSlider.value * 4) / 4}
          value={smoothSlider.value} min={0} max={2} step={0.25}
          onChange={smoothSlider.onChange} onDragEnd={smoothSlider.onDragEnd} />
        <MiniSlider label="Waviness" display={`${bumpSlider.value}%`}
          value={bumpSlider.value} min={0} max={60} step={1}
          onChange={bumpSlider.onChange} onDragEnd={bumpSlider.onDragEnd} />
        <MiniSlider label="Inset" display={`${offsetSlider.value > 0 ? '+' : ''}${offsetSlider.value}%`}
          value={offsetSlider.value} min={-80} max={30} step={1}
          onChange={offsetSlider.onChange} onDragEnd={offsetSlider.onDragEnd} />
        <MiniSlider label="Fringe" display={`${fringeLocal}%`} value={fringeLocal} min={0} max={100} step={1}
          onChange={v => { fringeRef.current = v / 100; setFringeLocal(v) }}
          onDragEnd={() => { const amp = fringeRef.current; setP2pBlobLobeAmp(amp); setP2pBlobLobeFreq(2.0 + amp * 3.0); setP2pBlobLobeThreshold(0) }}
        />

        <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Blob outline</span>
          <ToggleSwitch enabled={p2pBlobOutlineEnabled} onChange={setP2pBlobOutlineEnabled} />
        </div>
        {p2pBlobOutlineEnabled && <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px' }}>
            <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint }}>Color</span>
            <ColorChip value={p2pBlobOutlineColor} onChange={setP2pBlobOutlineColor} groups={PALETTE_TERRAIN_GROUPS} label="Outline color" />
          </div>
          <MiniSlider label="Width" display={`${p2pBlobOutlineWidth}px`} value={p2pBlobOutlineWidth} min={0.5} max={8} step={0.5} onChange={setP2pBlobOutlineWidth} />
        </>}

        <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Road corridor cut</span>
          <ToggleSwitch enabled={p2pRoadBlobCutEnabled} onChange={setP2pRoadBlobCutEnabled} />
        </div>
        {p2pRoadBlobCutEnabled && <>
          <MiniSlider label="Width" display={`${(roadCutWidthSlider.value / 100).toFixed(2)}×`}
            value={roadCutWidthSlider.value} min={1} max={100} step={1}
            onChange={roadCutWidthSlider.onChange} onDragEnd={roadCutWidthSlider.onDragEnd} />
          <MiniSlider label="Roughness" display={`${roadCutRoughSlider.value}%`}
            value={roadCutRoughSlider.value} min={0} max={100} step={1}
            onChange={roadCutRoughSlider.onChange} onDragEnd={roadCutRoughSlider.onDragEnd} />
        </>}

        <div style={{ borderTop: `1px solid ${t.line2}`, padding: '6px 12px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>River corridor cut</span>
          <ToggleSwitch enabled={p2pRiverBlobCutEnabled} onChange={setP2pRiverBlobCutEnabled} />
        </div>
        {p2pRiverBlobCutEnabled && <>
          <MiniSlider label="Width" display={`${(riverCutWidthSlider.value / 100).toFixed(2)}×`}
            value={riverCutWidthSlider.value} min={1} max={100} step={1}
            onChange={riverCutWidthSlider.onChange} onDragEnd={riverCutWidthSlider.onDragEnd} />
          <MiniSlider label="Roughness" display={`${riverCutRoughSlider.value}%`}
            value={riverCutRoughSlider.value} min={0} max={100} step={1}
            onChange={riverCutRoughSlider.onChange} onDragEnd={riverCutRoughSlider.onDragEnd} />
        </>}

        {isShapeModified && (
          <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
            <button
              onClick={resetP2pBlobShape}
              style={{
                width: '100%', padding: '4px 0', background: 'none',
                border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer',
                fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5,
              }}
            >
              Reset shape to default
            </button>
          </div>
        )}
      </StripShell>
    </ColorPickerHost>
  )
}
