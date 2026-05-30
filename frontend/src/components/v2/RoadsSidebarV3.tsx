import { useEffect, useRef, useMemo, useState } from 'react'
import {
  useMapStore,
  DEFAULT_ROAD_TIER_STYLES, DEFAULT_RAIL_STYLE, DEFAULT_ROAD_GEOM, DEFAULT_RAIL_GEOM,
  DEFAULT_ROAD_V3_TIER_GEOM,
} from '../../store/mapStore'
import type { RoadDashStyle, RoadTierStyle } from '../../store/mapStore'
import { buildRoadChains, buildRailChains } from '../../lib/roadChains'
import { buildRoadChainsV3 } from '../../lib/roadChainsV3'
import { drawRoadsAndRails } from '../../lib/drawRoadsRails'
import { PALETTE_RAIL_LIGHT, PALETTE_RAIL_DARK } from '../../palettes'
import { computePaper } from '../../lib/projection'
import { useTheme } from '../../context/ThemeContext'
import {
  BrushRow, MiniSlider, BigColorSwatch, SegmentedControl, ToggleRow, tintBg,
  STRIP_W, FLYOUT_W, StripShell, FlyoutShell, V2Divider, TriggerRow, TGap,
} from './sidebar'

// ── Palette groups ─────────────────────────────────────────────────────────────

const ROAD_SURFACE_GROUPS = [
  { label: 'Pale', colors: ['#ffffff', '#f5f0e8', '#f0e8d0', '#e8dcc8'] },
  { label: 'Warm', colors: ['#ffe8a8', '#ffe0a0', '#ffd080', '#f5d878', '#f0e0b8', '#d8d8c0', '#d0cca8'] },
  { label: 'Red',  colors: ['#c83030', '#a02020', '#802020', '#d85050'] },
] as const satisfies { label: string; colors: string[] }[]

const ROAD_CASING_GROUPS = [
  { label: 'Dark', colors: ['#1a1208', '#3a3020', '#4a3820'] },
  { label: 'Warm', colors: ['#6a4828', '#8a5c2a', '#b07820', '#786040', '#a09070', '#606060', '#808060'] },
  { label: 'Red',  colors: ['#5a1010', '#781818', '#380808'] },
] as const satisfies { label: string; colors: string[] }[]

const RAIL_LIGHT_GROUPS = [{ label: 'Light', colors: [...PALETTE_RAIL_LIGHT] }] as const satisfies { label: string; colors: string[] }[]
const RAIL_DARK_GROUPS  = [{ label: 'Dark',  colors: [...PALETTE_RAIL_DARK]  }] as const satisfies { label: string; colors: string[] }[]

// ── Constants ──────────────────────────────────────────────────────────────────

const ROAD_TIERS = [
  { tier: 0 as const, label: 'Motorway', color: '#b07820' },
  { tier: 1 as const, label: 'Primary',  color: '#8a5c2a' },
  { tier: 2 as const, label: 'Secondary', color: '#606060' },
]

const RAIL_COLOR = '#4a7a9a'

const IMPORT_ICON = (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 1.5v5" /><path d="M2.5 4.5l2.5 2.5 2.5-2.5" /><path d="M1.5 8.5h7" />
  </svg>
)

// ── FlyoutId ───────────────────────────────────────────────────────────────────

type FlyoutId = 'road-style' | 'rail-style' | 'road-shape' | 'rail-shape' | 'road-import' | 'rail-import' | 'bridges' | 'segment' | null

// ── HexPreview ─────────────────────────────────────────────────────────────────

function HexPreview({ mode, tier = 0 }: { mode: 'road' | 'rail'; tier?: 0 | 1 | 2 }) {
  const t = useTheme()
  const {
    hexSizeMm, hexOrientation,
    roadTierStyles, roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing,
    roadTierGeometry, mapStyle, roadRenderVersion, roadV3TierGeom,
    railStyle, railWiggleAmp, railWiggleFreq, railSmoothing, railGeomOverride,
    generatedMetadata,
  } = useMapStore()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const PX_PER_MM = 96 / 25.4
  const sqrt3 = Math.sqrt(3)

  const hexR = (hexSizeMm / sqrt3) * PX_PER_MM
  const isFlat = hexOrientation === 'flat'
  const interHexDist = hexSizeMm * PX_PER_MM

  const physicalScale = (() => {
    if (!generatedMetadata) return 1
    const canvasAreaW = window.innerWidth - t.sidebarWidth - 32
    const canvasAreaH = window.innerHeight - 48
    const { pw } = computePaper(canvasAreaW, canvasAreaH, generatedMetadata)
    return PX_PER_MM * generatedMetadata.paper_mm[0] / pw
  })()

  const W = FLYOUT_W
  const hexH = (isFlat ? sqrt3 : 2) * hexR
  const H = Math.min(140, Math.max(70, Math.round(hexH * 2.4)))
  const cy = H / 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const numHexes = Math.ceil(W / interHexDist) + 6
    const hexIdx = new Map<string, { center: [number, number] }>()

    const keyPts: [number, number][] = [
      [0,    0.30], [0.20, 0.22], [0.42, -0.10],
      [0.60, -0.28], [0.78, -0.20], [1, 0.00],
    ]
    const pathY = (t: number) => {
      for (let k = 0; k < keyPts.length - 1; k++) {
        const [t0, y0] = keyPts[k], [t1, y1] = keyPts[k + 1]
        if (t <= t1) {
          const f = (t - t0) / (t1 - t0)
          const sf = f * f * (3 - 2 * f)
          return cy + H * (y0 + sf * (y1 - y0))
        }
      }
      return cy + H * keyPts[keyPts.length - 1][1]
    }

    for (let i = 0; i < numHexes; i++) {
      const frac = i / (numHexes - 1)
      hexIdx.set(`${i},0`, { center: [(i - 2) * interHexDist, pathY(frac)] })
    }

    const project = (x: number, y: number): [number, number] => [x, y]

    if (mode === 'road') {
      const edges = Array.from({ length: numHexes - 1 }, (_, i) => ({
        q1: i, r1: 0, q2: i + 1, r2: 0, tier,
      }))

      let chains: { tier: 0 | 1 | 2; chain: [number, number][] }[]
      if (roadRenderVersion === 'v3') {
        const result = buildRoadChainsV3(edges, hexIdx, {}, roadV3TierGeom)
        chains = result.chains
      } else {
        const geom = roadTierGeometry[tier]
        const wiggleAmp     = geom?.wiggleAmp     ?? roadWiggleAmp
        const wiggleFreq    = geom?.wiggleFreq    ?? roadWiggleFreq
        const smoothing     = geom?.smoothing     ?? roadSmoothing
        const pathSmoothing = geom?.pathSmoothing ?? roadPathSmoothing
        const result = buildRoadChains(edges, hexIdx, {}, wiggleAmp, wiggleFreq, smoothing, pathSmoothing)
        chains = result.chains
      }

      const tierStyles = DEFAULT_ROAD_TIER_STYLES.map(
        (def, idx) => idx === tier
          ? { ...roadTierStyles[tier], outerW: roadTierStyles[tier].outerW * physicalScale }
          : { ...def, outerW: def.outerW * physicalScale },
      ) as [RoadTierStyle, RoadTierStyle, RoadTierStyle]

      drawRoadsAndRails(ctx, {
        roadChains: chains, junctions: [], railChains: [],
        tierStyles, railStyle: DEFAULT_RAIL_STYLE,
        project, mapStyle: mapStyle ?? 'standard',
      })
    } else {
      const wiggleAmp  = railGeomOverride?.wiggleAmp  ?? railWiggleAmp
      const wiggleFreq = railGeomOverride?.wiggleFreq ?? railWiggleFreq
      const smoothing  = railGeomOverride?.smoothing  ?? railSmoothing

      const edges = Array.from({ length: numHexes - 1 }, (_, i) => ({
        q1: i, r1: 0, q2: i + 1, r2: 0,
      }))
      const { chains } = buildRailChains(
        edges, [], hexIdx, new Map(), new Map(), {}, wiggleAmp, wiggleFreq, smoothing,
      )

      drawRoadsAndRails(ctx, {
        roadChains: [], junctions: [], railChains: chains,
        tierStyles: DEFAULT_ROAD_TIER_STYLES,
        railStyle: { ...railStyle, thickness: railStyle.thickness * physicalScale },
        project,
      })
    }
  }, [
    mode, tier, W, H, cy, interHexDist, physicalScale,
    roadTierStyles, roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing,
    roadTierGeometry, mapStyle, roadRenderVersion, roadV3TierGeom,
    railStyle, railWiggleAmp, railWiggleFreq, railSmoothing, railGeomOverride,
    generatedMetadata,
  ])

  const centers = useMemo(() => {
    const cx = W / 2
    const cs: { x: number; y: number }[] = []
    if (isFlat) {
      const colStep = 1.5 * hexR, rowStep = sqrt3 * hexR
      const cols = Math.ceil(cx / colStep) + 2, rows = Math.ceil(cy / rowStep) + 2
      for (let c = -cols; c <= cols; c++) {
        const yOff = Math.abs(c) % 2 === 1 ? rowStep / 2 : 0
        for (let r = -rows; r <= rows; r++)
          cs.push({ x: cx + c * colStep, y: cy + r * rowStep + yOff })
      }
    } else {
      const colStep = sqrt3 * hexR, rowStep = 1.5 * hexR
      const cols = Math.ceil(cx / colStep) + 2, rows = Math.ceil(cy / rowStep) + 2
      for (let r = -rows; r <= rows; r++) {
        const xOff = Math.abs(r) % 2 === 1 ? colStep / 2 : 0
        for (let c = -cols; c <= cols; c++)
          cs.push({ x: cx + c * colStep + xOff, y: cy + r * rowStep })
      }
    }
    return cs
  }, [isFlat, hexR, cy, sqrt3, W])

  const hexPolyPts = (hx: number, hy: number) => {
    const off = isFlat ? 0 : -30
    return Array.from({ length: 6 }, (_, i) => {
      const a = ((i * 60) + off) * Math.PI / 180
      return `${hx + Math.cos(a) * hexR},${hy + Math.sin(a) * hexR}`
    }).join(' ')
  }

  return (
    <div style={{ position: 'relative', width: W, height: H }}>
      <svg width={W} height={H} style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}>
        {centers.map(({ x, y }, i) => (
          <polygon key={i} points={hexPolyPts(x, y)} fill="none" stroke={t.line} strokeWidth={0.8} />
        ))}
      </svg>
      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ display: 'block', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

// ── Flyout section label helper ────────────────────────────────────────────────

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

// ── RoadShapeFlyout ────────────────────────────────────────────────────────────

function RoadShapeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    roadWiggleAmp, setRoadWiggleAmp,
    roadWiggleFreq, setRoadWiggleFreq,
    roadPathSmoothing, setRoadPathSmoothing,
    roadSmoothing, setRoadSmoothing,
    roadRenderVersion, setRoadRenderVersion,
  } = useMapStore()

  const isModified =
    roadWiggleAmp !== DEFAULT_ROAD_GEOM.wiggleAmp ||
    roadWiggleFreq !== DEFAULT_ROAD_GEOM.wiggleFreq ||
    roadPathSmoothing !== DEFAULT_ROAD_GEOM.pathSmoothing ||
    roadSmoothing !== DEFAULT_ROAD_GEOM.smoothing

  const handleReset = () => {
    setRoadWiggleAmp(DEFAULT_ROAD_GEOM.wiggleAmp)
    setRoadWiggleFreq(DEFAULT_ROAD_GEOM.wiggleFreq)
    setRoadPathSmoothing(DEFAULT_ROAD_GEOM.pathSmoothing)
    setRoadSmoothing(DEFAULT_ROAD_GEOM.smoothing)
  }

  return (
    <FlyoutShell title="Road shape" subtitle={roadRenderVersion === 'v3' ? 'V3 pipeline active' : isModified ? 'Modified from default' : 'Default for all tiers'} onClose={onClose}>
      <FSectionLabel label="Pipeline" />
      <div style={{ padding: '4px 12px 6px' }}>
        <SegmentedControl
          options={[{ value: 'v2', label: 'Classic' }, { value: 'v3', label: 'V3 (new)' }]}
          value={roadRenderVersion}
          onChange={v => setRoadRenderVersion(v as 'v2' | 'v3')}
        />
      </div>
      {roadRenderVersion === 'v3' ? (
        <div style={{ padding: '4px 12px 8px', fontFamily: t.sans, fontSize: 10.5, color: t.inkMute, lineHeight: 1.5 }}>
          Shape is configured per tier — open each tier's style flyout (⚙) to adjust corner rounding, path straightness, and segment variation.
        </div>
      ) : (
        <>
          <FSectionDivider />
          <MiniSlider label="Wiggle amp"   display={`${Math.round(roadWiggleAmp * 100)}%`} value={Math.round(roadWiggleAmp * 100)}  min={0} max={100} step={1}  accentColor={t.rust} onChange={v => setRoadWiggleAmp(v / 100)} />
          <MiniSlider label="Wiggle freq"  display={roadWiggleFreq.toFixed(1)}               value={Math.round(roadWiggleFreq * 10)} min={5} max={100} step={1}  accentColor={t.rust} onChange={v => setRoadWiggleFreq(v / 10)} />
          <MiniSlider label="Path smooth"  display={roadPathSmoothing}                        value={roadPathSmoothing}               min={0} max={50}  step={1}  accentColor={t.rust} onChange={setRoadPathSmoothing} />
          <MiniSlider label="Line smooth"  display={roadSmoothing}                            value={roadSmoothing}                   min={0} max={30}  step={1}  accentColor={t.rust} onChange={setRoadSmoothing} />
          {isModified && (
            <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
              <button
                onClick={handleReset}
                style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
              >
                Reset to default
              </button>
            </div>
          )}
        </>
      )}
    </FlyoutShell>
  )
}

// ── RailShapeFlyout ────────────────────────────────────────────────────────────

function RailShapeFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    railWiggleAmp, setRailWiggleAmp,
    railWiggleFreq, setRailWiggleFreq,
    railPathSmoothing, setRailPathSmoothing,
    railSmoothing, setRailSmoothing,
  } = useMapStore()

  const isModified =
    railWiggleAmp !== DEFAULT_RAIL_GEOM.wiggleAmp ||
    railWiggleFreq !== DEFAULT_RAIL_GEOM.wiggleFreq ||
    railPathSmoothing !== DEFAULT_RAIL_GEOM.pathSmoothing ||
    railSmoothing !== DEFAULT_RAIL_GEOM.smoothing

  const handleReset = () => {
    setRailWiggleAmp(DEFAULT_RAIL_GEOM.wiggleAmp)
    setRailWiggleFreq(DEFAULT_RAIL_GEOM.wiggleFreq)
    setRailPathSmoothing(DEFAULT_RAIL_GEOM.pathSmoothing)
    setRailSmoothing(DEFAULT_RAIL_GEOM.smoothing)
  }

  return (
    <FlyoutShell title="Rail shape" subtitle={isModified ? 'Modified from default' : 'Default'} onClose={onClose}>
      <MiniSlider label="Wiggle amp"  display={`${Math.round(railWiggleAmp * 100)}%`} value={Math.round(railWiggleAmp * 100)}  min={0} max={100} step={1} accentColor={RAIL_COLOR} onChange={v => setRailWiggleAmp(v / 100)} />
      <MiniSlider label="Wiggle freq" display={railWiggleFreq.toFixed(1)}              value={Math.round(railWiggleFreq * 10)} min={5} max={100} step={1} accentColor={RAIL_COLOR} onChange={v => setRailWiggleFreq(v / 10)} />
      <MiniSlider label="Path smooth" display={railPathSmoothing}                      value={railPathSmoothing}               min={0} max={50}  step={1} accentColor={RAIL_COLOR} onChange={setRailPathSmoothing} />
      <MiniSlider label="Line smooth" display={railSmoothing}                          value={railSmoothing}                   min={0} max={30}  step={1} accentColor={RAIL_COLOR} onChange={setRailSmoothing} />
      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={handleReset}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── RoadStyleFlyout ────────────────────────────────────────────────────────────

const DASH_OPTIONS: { value: RoadDashStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

function RoadStyleFlyout({ tier, onClose }: { tier: 0 | 1 | 2; onClose: () => void }) {
  const t = useTheme()
  const {
    mapStyle,
    roadTierStyles, setRoadTierStyle,
    roadWiggleAmp, roadWiggleFreq, roadPathSmoothing, roadSmoothing,
    roadTierGeometry, setRoadTierGeometry, clearRoadTierGeometry,
    roadRenderVersion, roadV3TierGeom, setRoadV3TierGeom, resetRoadV3TierGeom,
  } = useMapStore()

  const s = roadTierStyles[tier]
  const def = DEFAULT_ROAD_TIER_STYLES[tier]
  const { label: tierLabel, color: tierColor } = ROAD_TIERS[tier]

  const geomOverride = roadTierGeometry[tier]
  const overrideEnabled = geomOverride !== null
  const globalGeom = { wiggleAmp: roadWiggleAmp, wiggleFreq: roadWiggleFreq, pathSmoothing: roadPathSmoothing, smoothing: roadSmoothing }
  const effectiveGeom = geomOverride ?? globalGeom

  const v3Geom = roadV3TierGeom[tier]
  const defV3 = DEFAULT_ROAD_V3_TIER_GEOM[tier]
  const v3Modified = v3Geom.cornerRoundness !== defV3.cornerRoundness ||
    v3Geom.pathStraightness !== defV3.pathStraightness ||
    v3Geom.segmentVariation !== defV3.segmentVariation ||
    v3Geom.variationCharacter !== defV3.variationCharacter

  const isModified =
    s.outer !== def.outer || s.inner !== def.inner || s.outerW !== def.outerW ||
    s.caseDash !== def.caseDash || s.fillDash !== def.fillDash

  return (
    <FlyoutShell
      title={tierLabel}
      subtitle={isModified ? 'Modified from default' : 'Default style'}
      onClose={onClose}
    >
      <HexPreview mode="road" tier={tier} />
      <MiniSlider label="Thickness" display={s.outerW.toFixed(1)} value={s.outerW * 10} min={5} max={100} step={5} accentColor={tierColor} onChange={v => setRoadTierStyle(tier, { outerW: v / 10 })} />
      <FSectionDivider />
      <FSectionLabel label="Surface" />
      <BigColorSwatch value={s.inner} onChange={v => setRoadTierStyle(tier, { inner: v })} groups={ROAD_SURFACE_GROUPS} />
      <FSectionLabel label="Fill stroke" />
      <div style={{ padding: '4px 12px' }}>
        <SegmentedControl options={DASH_OPTIONS} value={s.fillDash} onChange={v => setRoadTierStyle(tier, { fillDash: v })} />
      </div>
      <FSectionDivider />
      <FSectionLabel label="Casing" />
      <BigColorSwatch value={s.outer} onChange={v => setRoadTierStyle(tier, { outer: v })} groups={ROAD_CASING_GROUPS} />
      <FSectionLabel label="Casing stroke" />
      <div style={{ padding: '4px 12px' }}>
        <SegmentedControl options={DASH_OPTIONS} value={s.caseDash} onChange={v => setRoadTierStyle(tier, { caseDash: v })} />
      </div>

      {roadRenderVersion === 'v3' ? (
        <>
          <FSectionDivider />
          <FSectionLabel label="Shape (V3)" />
          <MiniSlider label="Corner round"  display={`${Math.round(v3Geom.cornerRoundness * 100)}%`}  value={Math.round(v3Geom.cornerRoundness * 100)}  min={0} max={100} step={1}  accentColor={tierColor} onChange={v => setRoadV3TierGeom(tier, { cornerRoundness: v / 100 })} />
          <MiniSlider label="Straightness"  display={`${Math.round(v3Geom.pathStraightness * 100)}%`} value={Math.round(v3Geom.pathStraightness * 100)} min={0} max={100} step={1}  accentColor={tierColor} onChange={v => setRoadV3TierGeom(tier, { pathStraightness: v / 100 })} />
          <MiniSlider label="Variation"     display={`${Math.round(v3Geom.segmentVariation * 100)}%`} value={Math.round(v3Geom.segmentVariation * 100)} min={0} max={60}  step={1}  accentColor={tierColor} onChange={v => setRoadV3TierGeom(tier, { segmentVariation: v / 100 })} />
          <MiniSlider label="Var character" display={String(Math.round(v3Geom.variationCharacter))}   value={Math.round(v3Geom.variationCharacter)}      min={0} max={3}   step={1}  accentColor={tierColor} onChange={v => setRoadV3TierGeom(tier, { variationCharacter: v })} />
          {v3Modified && (
            <div style={{ padding: '4px 12px 0' }}>
              <button onClick={() => resetRoadV3TierGeom(tier)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.3 }}>
                ↺ reset shape
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <FSectionDivider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px' }}>
            <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Geometry override</span>
            <button
              onClick={() => {
                if (overrideEnabled) clearRoadTierGeometry(tier)
                else setRoadTierGeometry(tier, { ...globalGeom })
              }}
              style={{
                width: 30, height: 16, flexShrink: 0,
                background: overrideEnabled ? t.ink : t.line,
                border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: overrideEnabled ? 15 : 3,
                width: 10, height: 10, background: t.surface, transition: 'left 0.12s ease',
              }} />
            </button>
          </div>
          <div style={{ opacity: overrideEnabled ? 1 : 0.35, pointerEvents: overrideEnabled ? 'auto' : 'none' }}>
        <MiniSlider label="Wiggle amp"  display={`${Math.round(effectiveGeom.wiggleAmp * 100)}%`} value={Math.round(effectiveGeom.wiggleAmp * 100)} min={0} max={100} step={1} accentColor={tierColor} onChange={v => setRoadTierGeometry(tier, { wiggleAmp: v / 100 })} />
        <MiniSlider label="Wiggle freq" display={effectiveGeom.wiggleFreq.toFixed(1)}              value={Math.round(effectiveGeom.wiggleFreq * 10)} min={5} max={100} step={1} accentColor={tierColor} onChange={v => setRoadTierGeometry(tier, { wiggleFreq: v / 10 })} />
        <MiniSlider label="Path smooth" display={effectiveGeom.pathSmoothing}                      value={effectiveGeom.pathSmoothing}               min={0} max={50}  step={1} accentColor={tierColor} onChange={v => setRoadTierGeometry(tier, { pathSmoothing: v })} />
        <MiniSlider label="Line smooth" display={effectiveGeom.smoothing}                          value={effectiveGeom.smoothing}                   min={0} max={30}  step={1} accentColor={tierColor} onChange={v => setRoadTierGeometry(tier, { smoothing: v })} />
          </div>
        </>
      )}

      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={() => setRoadTierStyle(tier, { ...def })}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── RailStyleFlyout ────────────────────────────────────────────────────────────

function RailStyleFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    railStyle, setRailStyle,
    railWiggleAmp, railWiggleFreq, railPathSmoothing, railSmoothing,
    railGeomOverride, setRailGeomOverride, clearRailGeomOverride,
  } = useMapStore()

  const def = DEFAULT_RAIL_STYLE
  const globalGeom = { wiggleAmp: railWiggleAmp, wiggleFreq: railWiggleFreq, pathSmoothing: railPathSmoothing, smoothing: railSmoothing }
  const effectiveGeom = railGeomOverride ?? globalGeom
  const overrideEnabled = railGeomOverride !== null

  const isModified =
    railStyle.thickness !== def.thickness ||
    railStyle.innerColor !== def.innerColor ||
    railStyle.outerColor !== def.outerColor ||
    railStyle.railStyle !== def.railStyle

  return (
    <FlyoutShell title="Rail" subtitle={isModified ? 'Modified from default' : 'Default style'} onClose={onClose}>
      <HexPreview mode="rail" />
      <div style={{ padding: '4px 12px' }}>
        <SegmentedControl
          options={[{ value: 'classic', label: 'Classic' }, { value: 'cross', label: 'Cross' }]}
          value={railStyle.railStyle}
          onChange={s => setRailStyle({ railStyle: s })}
        />
      </div>
      <MiniSlider label="Thickness" display={railStyle.thickness.toFixed(1)} value={railStyle.thickness * 10} min={5} max={80} step={5} accentColor={RAIL_COLOR} onChange={v => setRailStyle({ thickness: v / 10 })} />
      {railStyle.railStyle === 'classic' && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Inner color" />
          <BigColorSwatch value={railStyle.innerColor} onChange={v => setRailStyle({ innerColor: v })} groups={RAIL_LIGHT_GROUPS} />
        </>
      )}
      <FSectionDivider />
      <FSectionLabel label={railStyle.railStyle === 'classic' ? 'Outer color' : 'Line color'} />
      <BigColorSwatch value={railStyle.outerColor} onChange={v => setRailStyle({ outerColor: v })} groups={RAIL_DARK_GROUPS} />

      <FSectionDivider />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px' }}>
        <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600 }}>Geometry override</span>
        <button
          onClick={() => {
            if (overrideEnabled) clearRailGeomOverride()
            else setRailGeomOverride({ ...globalGeom })
          }}
          style={{
            width: 30, height: 16, flexShrink: 0,
            background: overrideEnabled ? t.ink : t.line,
            border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: 3, left: overrideEnabled ? 15 : 3,
            width: 10, height: 10, background: t.surface, transition: 'left 0.12s ease',
          }} />
        </button>
      </div>
      <div style={{ opacity: overrideEnabled ? 1 : 0.35, pointerEvents: overrideEnabled ? 'auto' : 'none' }}>
        <MiniSlider label="Wiggle amp"  display={`${Math.round(effectiveGeom.wiggleAmp * 100)}%`} value={Math.round(effectiveGeom.wiggleAmp * 100)} min={0} max={100} step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ wiggleAmp: v / 100 })} />
        <MiniSlider label="Wiggle freq" display={effectiveGeom.wiggleFreq.toFixed(1)}              value={Math.round(effectiveGeom.wiggleFreq * 10)} min={5} max={100} step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ wiggleFreq: v / 10 })} />
        <MiniSlider label="Path smooth" display={effectiveGeom.pathSmoothing}                      value={effectiveGeom.pathSmoothing}               min={0} max={50}  step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ pathSmoothing: v })} />
        <MiniSlider label="Line smooth" display={effectiveGeom.smoothing}                          value={effectiveGeom.smoothing}                   min={0} max={30}  step={1} accentColor={RAIL_COLOR} onChange={v => setRailGeomOverride({ smoothing: v })} />
      </div>

      {isModified && (
        <div style={{ margin: '8px 12px 0', borderTop: `1px solid ${t.line2}`, paddingTop: 8 }}>
          <button
            onClick={() => setRailStyle({ ...def })}
            style={{ width: '100%', padding: '4px 0', background: 'none', border: `1px solid ${t.line}`, color: t.inkMute, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}
          >
            Reset to default
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── OsmRoadsFlyout ─────────────────────────────────────────────────────────────

function OsmRoadsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    roadsStatus, fetchRoads, clearRoads,
    osmHexPaths, osmHighlightTier, setOsmHighlightTier, applyOsmTier,
    showRawOsmRoads, setShowRawOsmRoads,
  } = useMapStore()

  const loading = roadsStatus === 'loading'
  const done = roadsStatus === 'done'

  return (
    <FlyoutShell title="Fetch from OSM" onClose={onClose}>
      <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6 }}>
        <button
          onClick={fetchRoads}
          disabled={loading}
          style={{
            flex: 1, padding: '5px 0', background: 'none',
            border: `1px solid ${loading ? t.line : t.rust}`,
            color: loading ? t.inkFaint : t.rust,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
          }}
        >
          {loading ? 'fetching…' : done ? '✓ Roads fetched' : 'Fetch roads'}
        </button>
        {done && (
          <button
            onClick={clearRoads}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}
          >
            clear
          </button>
        )}
      </div>

      {done && osmHexPaths.length > 0 && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Apply as tier" />
          <div style={{ display: 'flex', gap: 4, padding: '4px 12px 6px' }}>
            {(['Highways', 'Primary', 'Secondary'] as const).map((label, i) => (
              <button
                key={label}
                onClick={() => applyOsmTier(i as 0 | 1 | 2)}
                onMouseEnter={() => setOsmHighlightTier(i as 0 | 1 | 2)}
                onMouseLeave={() => setOsmHighlightTier(null)}
                style={{
                  flex: 1, padding: '4px 0',
                  background: osmHighlightTier === i ? tintBg(t.rust, 0.1) : 'transparent',
                  border: `1px solid ${osmHighlightTier === i ? t.rust : t.line}`,
                  color: osmHighlightTier === i ? t.rust : t.inkMute,
                  cursor: 'pointer', fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.3,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ padding: '0 12px' }}>
            <ToggleRow label="Show all OSM roads" checked={showRawOsmRoads} onChange={setShowRawOsmRoads} />
          </div>
        </>
      )}
    </FlyoutShell>
  )
}

// ── OsmRailsFlyout ─────────────────────────────────────────────────────────────

function OsmRailsFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    railsStatus, fetchRails, clearRails,
    osmRailHexPaths, osmRailHighlight, setOsmRailHighlight, applyOsmRails,
  } = useMapStore()

  const loading = railsStatus === 'loading'
  const done = railsStatus === 'done'

  return (
    <FlyoutShell title="Fetch rails from OSM" onClose={onClose}>
      <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6 }}>
        <button
          onClick={fetchRails}
          disabled={loading}
          style={{
            flex: 1, padding: '5px 0', background: 'none',
            border: `1px solid ${loading ? t.line : RAIL_COLOR}`,
            color: loading ? t.inkFaint : RAIL_COLOR,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
          }}
        >
          {loading ? 'fetching…' : done ? '✓ Rails fetched' : 'Fetch rails'}
        </button>
        {done && (
          <button
            onClick={clearRails}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}
          >
            clear
          </button>
        )}
      </div>

      {done && osmRailHexPaths.length > 0 && (
        <div style={{ padding: '4px 12px' }}>
          <button
            onClick={applyOsmRails}
            onMouseEnter={() => setOsmRailHighlight(true)}
            onMouseLeave={() => setOsmRailHighlight(false)}
            style={{
              width: '100%', padding: '5px 0',
              background: osmRailHighlight ? tintBg(RAIL_COLOR, 0.1) : 'transparent',
              border: `1px solid ${osmRailHighlight ? RAIL_COLOR : t.line}`,
              color: osmRailHighlight ? RAIL_COLOR : t.inkMute,
              cursor: 'pointer', fontFamily: t.mono, fontSize: 10, letterSpacing: 0.3,
            }}
          >
            Apply rails
          </button>
        </div>
      )}
    </FlyoutShell>
  )
}

// ── BridgesFlyout ──────────────────────────────────────────────────────────────

function BridgesFlyout({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const {
    bridgesEnabled, setBridgesEnabled,
    bridgeStyle, setBridgeStyle,
    bridgeTiers, updateBridgeTier, addBridgeTier, removeBridgeTier,
  } = useMapStore()

  return (
    <FlyoutShell title="Bridges" onClose={onClose}>
      <ToggleRow label="Enabled" hint="Render bridge symbols on road crossings." checked={bridgesEnabled} onChange={setBridgesEnabled} />
      {bridgesEnabled && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Style" />
          <div style={{ padding: '4px 12px' }}>
            <SegmentedControl
              options={[{ value: 'plank', label: 'Plank' }, { value: 'icon', label: 'Icon' }]}
              value={bridgeStyle}
              onChange={setBridgeStyle}
            />
          </div>
          <FSectionDivider />
          <FSectionLabel label="Tiers" />
          {bridgeTiers.map((bt, idx) => (
            <div key={bt.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px' }}>
              <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint, width: 14, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
              <input
                type="color"
                value={bt.color}
                onChange={e => updateBridgeTier(bt.id, { color: e.target.value })}
                style={{ width: 22, height: 18, border: `1px solid ${t.line}`, padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }}
              />
              <input
                type="text"
                value={bt.label}
                onChange={e => updateBridgeTier(bt.id, { label: e.target.value })}
                style={{
                  flex: 1, minWidth: 0, background: t.paper, border: `1px solid ${t.line}`,
                  color: t.ink2, fontSize: 11, padding: '2px 6px', fontFamily: t.sans, outline: 'none',
                }}
              />
              <button
                onClick={() => removeBridgeTier(bt.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: t.inkFaint, fontSize: 13, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = t.rust)}
                onMouseLeave={e => (e.currentTarget.style.color = t.inkFaint)}
              >×</button>
            </div>
          ))}
          {bridgeTiers.length < 5 && (
            <div style={{ padding: '4px 12px' }}>
              <button
                onClick={addBridgeTier}
                style={{
                  width: '100%', padding: '4px 0',
                  background: 'transparent', border: `1px dashed ${t.line}`,
                  color: t.inkFaint, cursor: 'pointer', fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5,
                }}
              >
                + Add tier
              </button>
            </div>
          )}
        </>
      )}
    </FlyoutShell>
  )
}

// ── SegmentFlyout ──────────────────────────────────────────────────────────────

function SegmentFlyout({ mode, onClose }: { mode: 'road' | 'rail'; onClose: () => void }) {
  const t = useTheme()
  const {
    roadWiggleAmp, roadWiggleFreq,
    railWiggleAmp, railWiggleFreq,
    roadSegmentProps, railSegmentProps,
    roadHopProps, railHopProps,
    selectedRoadSegmentKeys, selectedRailSegmentKeys,
    selectedRoadHopKey, selectedRailHopKey,
    setSelectedRoadHopKey, setSelectedRailHopKey,
    setRoadSegmentProp, clearRoadSegmentProp,
    setRailSegmentProp, clearRailSegmentProp,
    setRoadHopProp, clearRoadHopProp,
    setRailHopProp, clearRailHopProp,
  } = useMapStore()

  const isRoad = mode === 'road'
  const accentColor = isRoad ? t.rust : RAIL_COLOR
  const selectedKeys = isRoad ? selectedRoadSegmentKeys : selectedRailSegmentKeys
  const segmentProps = isRoad ? roadSegmentProps : railSegmentProps
  const hopProps = isRoad ? roadHopProps : railHopProps
  const selectedHopKey = isRoad ? selectedRoadHopKey : selectedRailHopKey
  const globalAmp = isRoad ? roadWiggleAmp : railWiggleAmp
  const globalFreq = isRoad ? roadWiggleFreq : railWiggleFreq
  const setProp = isRoad ? setRoadSegmentProp : setRailSegmentProp
  const clearProp = isRoad ? clearRoadSegmentProp : clearRailSegmentProp
  const setHopProp = isRoad ? setRoadHopProp : setRailHopProp
  const clearHopProp = isRoad ? clearRoadHopProp : clearRailHopProp
  const setSelectedHopKey = isRoad ? setSelectedRoadHopKey : setSelectedRailHopKey

  const firstProps = segmentProps[selectedKeys[0]]
  const segAmp = firstProps?.wiggleAmp ?? globalAmp
  const segFreq = firstProps?.wiggleFreq ?? globalFreq
  const hasSegOverride = selectedKeys.some(k => segmentProps[k] !== undefined)

  const hopP = selectedHopKey ? hopProps[selectedHopKey] : null
  const hopAmp = hopP?.wiggleAmp ?? (firstProps?.wiggleAmp ?? globalAmp)
  const hopFreq = hopP?.wiggleFreq ?? (firstProps?.wiggleFreq ?? globalFreq)
  const hasHopOverride = !!hopP

  return (
    <FlyoutShell
      title={`${selectedKeys.length} segment${selectedKeys.length !== 1 ? 's' : ''}`}
      subtitle={hasSegOverride ? 'Custom wiggle active' : 'Default shape'}
      onClose={onClose}
    >
      <FSectionLabel label="Wiggle" />
      <div style={{ padding: '0 12px 2px', fontFamily: t.sans, fontSize: 10.5, color: t.inkMute, lineHeight: 1.5 }}>
        Per-segment override. Reverts to default when cleared.
      </div>
      <MiniSlider
        label="Amplitude"
        display={`${Math.round(segAmp * 100)}%`}
        value={Math.round(segAmp * 100)}
        min={0} max={100} step={1}
        accentColor={accentColor}
        onChange={v => selectedKeys.forEach(k => setProp(k, { wiggleAmp: v / 100 }))}
      />
      <MiniSlider
        label="Frequency"
        display={segFreq.toFixed(1)}
        value={Math.round(segFreq * 10)}
        min={5} max={100} step={1}
        accentColor={accentColor}
        onChange={v => selectedKeys.forEach(k => setProp(k, { wiggleFreq: v / 10 }))}
      />
      {hasSegOverride && (
        <div style={{ padding: '4px 12px 0' }}>
          <button
            onClick={() => { selectedKeys.forEach(k => clearProp(k)); setSelectedHopKey(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.3 }}
          >
            ↺ reset segments
          </button>
        </div>
      )}

      {selectedHopKey && (
        <>
          <FSectionDivider />
          <FSectionLabel label="Hop wiggle" />
          <div style={{ padding: '0 12px 2px', fontFamily: t.sans, fontSize: 10.5, color: t.inkMute, lineHeight: 1.5 }}>
            Override for this specific hop point.
          </div>
          <MiniSlider
            label="Amplitude"
            display={`${Math.round(hopAmp * 100)}%`}
            value={Math.round(hopAmp * 100)}
            min={0} max={100} step={1}
            accentColor={accentColor}
            onChange={v => setHopProp(selectedHopKey, { wiggleAmp: v / 100 })}
          />
          <MiniSlider
            label="Frequency"
            display={hopFreq.toFixed(1)}
            value={Math.round(hopFreq * 10)}
            min={5} max={100} step={1}
            accentColor={accentColor}
            onChange={v => setHopProp(selectedHopKey, { wiggleFreq: v / 10 })}
          />
          {hasHopOverride && (
            <div style={{ padding: '4px 12px 0' }}>
              <button
                onClick={() => { clearHopProp(selectedHopKey); setSelectedHopKey(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.3 }}
              >
                ↺ reset hop
              </button>
            </div>
          )}
        </>
      )}
    </FlyoutShell>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RoadsSidebarV3() {
  const {
    roadPaintMode, roadPaintBrush, roadPaintEraser,
    railPaintMode, railPaintEraser,
    roadSelectMode,
    railSelectMode,
    setActiveTool,
    selectedRoadSegmentKeys, setSelectedRoadSegmentKeys,
    selectedRailSegmentKeys, setSelectedRailSegmentKeys,
    dataSource,
  } = useMapStore()

  const [flyout, setFlyout] = useState<FlyoutId>(null)
  const [cogTier, setCogTier] = useState<0 | 1 | 2>(0)
  const [segmentMode, setSegmentMode] = useState<'road' | 'rail'>('road')

  const toggleFlyout = (id: NonNullable<FlyoutId>) =>
    setFlyout(prev => prev === id ? null : id)

  // Auto-open segment flyout when a segment is selected
  useEffect(() => {
    if (selectedRoadSegmentKeys.length > 0) {
      setSegmentMode('road')
      setFlyout('segment')
    } else if (selectedRailSegmentKeys.length > 0) {
      setSegmentMode('rail')
      setFlyout('segment')
    } else if (flyout === 'segment') {
      setFlyout(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoadSegmentKeys.length, selectedRailSegmentKeys.length])

  const selectRoadBrush = (tier: 0 | 1 | 2) => {
    if (roadPaintMode && roadPaintBrush === tier && !roadPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'road', tier, erasing: false })
  }
  const selectRoadEraser = () => {
    if (roadPaintMode && roadPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'road', tier: roadPaintBrush, erasing: true })
  }
  const selectRailBrush = () => {
    if (railPaintMode && !railPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'rail', erasing: false })
  }
  const selectRailEraser = () => {
    if (railPaintMode && railPaintEraser) setActiveTool({ type: 'none' })
    else setActiveTool({ type: 'rail', erasing: true })
  }

  const t = useTheme()

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <StripShell>

        <V2Divider label="Roads" />
        {ROAD_TIERS.map(({ tier, label, color }) => (
          <BrushRow
            key={tier}
            label={label}
            color={color}
            active={roadPaintMode && roadPaintBrush === tier && !roadPaintEraser}
            shortcut={String(tier + 1)}
            showCog
            cogOpen={flyout === 'road-style' && cogTier === tier}
            onSelect={() => selectRoadBrush(tier)}
            onCog={() => { setCogTier(tier); setFlyout('road-style') }}
          />
        ))}
        <BrushRow
          label="Eraser"
          color={t.inkFaint}
          active={roadPaintMode && roadPaintEraser}
          shortcut="E"
          onSelect={selectRoadEraser}
        />
        {roadSelectMode && (
          <div style={{ padding: '1px 8px 4px', fontFamily: t.mono, fontSize: 8.5, color: t.inkMute, lineHeight: 1.4 }}>
            click road to select
          </div>
        )}
        <TGap />
        <TriggerRow label="Road shape" active={flyout === 'road-shape'} onClick={() => toggleFlyout('road-shape')} />
        {dataSource === 'osm' && (
          <TriggerRow label="Fetch from OSM" active={flyout === 'road-import'} icon={IMPORT_ICON} onClick={() => toggleFlyout('road-import')} />
        )}

        <V2Divider label="Rails" />
        <BrushRow
          label="Rail"
          color={RAIL_COLOR}
          active={railPaintMode && !railPaintEraser}
          showCog
          cogOpen={flyout === 'rail-style'}
          onSelect={selectRailBrush}
          onCog={() => setFlyout('rail-style')}
        />
        <BrushRow
          label="Eraser"
          color={t.inkFaint}
          active={railPaintMode && railPaintEraser}
          onSelect={selectRailEraser}
        />
        {railSelectMode && (
          <div style={{ padding: '1px 8px 4px', fontFamily: t.mono, fontSize: 8.5, color: t.inkMute, lineHeight: 1.4 }}>
            right-click rail to select
          </div>
        )}
        <TGap />
        <TriggerRow label="Rail shape" active={flyout === 'rail-shape'} onClick={() => toggleFlyout('rail-shape')} />
        {dataSource === 'osm' && (
          <TriggerRow label="Fetch from OSM" active={flyout === 'rail-import'} icon={IMPORT_ICON} onClick={() => toggleFlyout('rail-import')} />
        )}

        <V2Divider label="Bridges" />
        <TriggerRow label="Bridge settings" active={flyout === 'bridges'} onClick={() => toggleFlyout('bridges')} />

        <div style={{ height: 8 }} />
      </StripShell>

      {flyout === 'road-style' && <RoadStyleFlyout tier={cogTier} onClose={() => setFlyout(null)} />}
      {flyout === 'rail-style' && <RailStyleFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'road-shape' && <RoadShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'rail-shape' && <RailShapeFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'road-import' && <OsmRoadsFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'rail-import' && <OsmRailsFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'bridges' && <BridgesFlyout onClose={() => setFlyout(null)} />}
      {flyout === 'segment' && (
        <SegmentFlyout
          mode={segmentMode}
          onClose={() => {
            if (segmentMode === 'road') setSelectedRoadSegmentKeys([])
            else setSelectedRailSegmentKeys([])
            setFlyout(null)
          }}
        />
      )}
    </div>
  )
}
