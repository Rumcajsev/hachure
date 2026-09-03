import { useState, useEffect, useRef } from 'react'
import { TK, TK_DARK } from '../../theme'
import { useMapStore, mapResolutionMpx, pageGridTotalMm, paperDimsMm } from '../../store/mapStore'
import type { PaperSize, Orientation, HexOrientation } from '../../store/mapStore'
import { MapView } from '../MapView'
import { TerrainViewCanvas } from '../TerrainViewCanvas'
import { generateMapTitle, nominatimZoomForWidth } from '../../lib/generateMapTitle'
import type { NominatimResult } from '../../lib/generateMapTitle'

type Theme = typeof TK
type WizardStep = 'source' | 'paper-blank' | 'paper-area' | 'paper-reference' | 'generating'
type SourceMode = 'osm' | 'blank' | 'reference'

export function SetupWizard({ onCancel, onDone, isDark = false }: {
  onCancel: () => void
  onDone: () => void
  isDark?: boolean
}) {
  const [step, setStep] = useState<WizardStep>('source')
  const [source, setSource] = useState<SourceMode>('osm')
  const { setBlankMap, generateMap, startImageImport } = useMapStore()
  const t = isDark ? TK_DARK : TK

  function handleContinue() {
    if (step === 'source') {
      if (source === 'blank') setStep('paper-blank')
      else if (source === 'reference') setStep('paper-reference')
      else setStep('paper-area')
    }
  }

  function handleStartBlank() {
    onDone()
  }

  async function handleStartReference() {
    await startImageImport()
    if (useMapStore.getState().generateStatus !== 'error') onDone()
  }

  function handleGenerate() {
    setBlankMap(false)
    setStep('generating')
    generateMap()
  }

  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'flex', flexDirection: 'column',
      background: t.paper, fontFamily: t.sans, color: t.ink,
      overflow: 'hidden',
    }}>
      <WizardTopBar step={step} onExit={onCancel} t={t} />

      {step === 'source' && (
        <SourcePickerStep
          selected={source}
          onSelect={setSource}
          onBack={onCancel}
          onContinue={handleContinue}
          t={t}
        />
      )}

      {step === 'paper-blank' && (
        <PaperAreaStep showMap={false} onBack={() => setStep('source')} onGenerate={handleStartBlank} t={t} />
      )}

      {step === 'paper-area' && (
        <PaperAreaStep onBack={() => setStep('source')} onGenerate={handleGenerate} t={t} />
      )}

      {step === 'paper-reference' && (
        <PaperAreaStep showMap={false} onBack={() => setStep('source')} onGenerate={handleStartReference} generateLabel="UPLOAD IMAGE →" t={t} />
      )}

      {step === 'generating' && (
        <GeneratingStep onDone={onDone} t={t} />
      )}
    </div>
  )
}

// ── Wizard top bar ──────────────────────────────────────────────────────────

function WizardTopBar({ step, onExit, t }: {
  step: WizardStep
  onExit: () => void
  t: Theme
}) {
  return (
    <div style={{
      height: t.topBarHeight,
      flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 20px',
      borderBottom: `1px solid ${t.line2}`,
    }}>
      <button
        onClick={onExit}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <HachureLogo t={t} />
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
        {step === 'source' && (
          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint, letterSpacing: 0.5 }}>
            DRAFT · UNTITLED
          </span>
        )}
        {step !== 'generating' && (
          <button
            onClick={onExit}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: t.mono, fontSize: 10, color: t.inkMute,
              letterSpacing: 0.5, padding: '4px 0',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = t.ink }}
            onMouseLeave={e => { e.currentTarget.style.color = t.inkMute }}
          >
            ESC · SAVE &amp; EXIT
          </button>
        )}
      </div>
    </div>
  )
}

// ── Screen 01 — Source picker ───────────────────────────────────────────────

function SourcePickerStep({ selected, onSelect, onBack, onContinue, t }: {
  selected: SourceMode
  onSelect: (m: SourceMode) => void
  onBack: () => void
  onContinue: () => void
  t: Theme
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px 40px',
        gap: 32,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: t.mono, fontSize: 10, letterSpacing: 2,
            color: t.rust, textTransform: 'uppercase', marginBottom: 12,
          }}>
            Step 01 of 03
          </div>
          <h2 style={{
            fontFamily: t.serif, fontSize: 52, fontWeight: 400,
            color: t.ink, margin: '0 0 14px 0', lineHeight: 1.05,
          }}>
            What are we starting <em>from?</em>
          </h2>
          <p style={{
            fontFamily: t.sans, fontSize: 13, color: t.inkMute,
            maxWidth: 520, lineHeight: 1.6, margin: '0 auto',
          }}>
            One choice — cannot be reversed after generation. Paper, hex size, and
            region are all adjustable in the next step.
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <SourceCard
            num="01" category="REAL WORLD"
            title="OSM Data"
            desc="Generate terrain from OpenStreetMap. Pick a region, set paper size, and hexes are built from real elevation and land use."
            footer="REGION SET IN NEXT STEP"
            selected={selected === 'osm'}
            onClick={() => onSelect('osm')}
            illustration={<OsmIllustration t={t} />}
            t={t}
          />
          <SourceCard
            num="02" category="EMPTY"
            title="Blank"
            desc="Skip to the editor with an empty grid. For original worlds, scenario design, or freeform painting from scratch."
            footer="NO AREA SETUP NEEDED"
            selected={selected === 'blank'}
            onClick={() => onSelect('blank')}
            illustration={<BlankIllustration t={t} />}
            t={t}
          />
          <SourceCard
            num="03" category="REFERENCE"
            title="Reference image"
            desc="Drop a scanned or historical map. Hexes overlay on top — trace terrain by hand without auto-generation."
            footer="UPLOAD IMAGE IN NEXT STEP"
            selected={selected === 'reference'}
            onClick={() => onSelect('reference')}
            illustration={<ReferenceIllustration t={t} />}
            t={t}
          />
        </div>
      </div>

      {/* Bottom nav */}
      <BottomNav
        t={t}
        left={<NavButton onClick={onBack} ghost t={t}>← CANCEL</NavButton>}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkMute, letterSpacing: 0.5 }}>
              STEP 1 / 3
            </span>
            <NavButton onClick={onContinue} t={t}>CONTINUE →</NavButton>
          </div>
        }
      />
    </div>
  )
}

function SourceCard({ num, category, title, desc, footer, selected, onClick, illustration, t }: {
  num: string; category: string; title: string; desc: string; footer: string
  selected: boolean; onClick: () => void; illustration: React.ReactNode; t: Theme
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 280,
        display: 'flex', flexDirection: 'column',
        background: t.surface,
        border: `1px solid ${selected ? t.ink : t.line}`,
        borderRadius: 2,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        outline: 'none',
      }}
    >
      {/* Checkmark badge */}
      {selected && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          width: 20, height: 20,
          background: t.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: t.paper,
          zIndex: 1,
        }}>
          ✓
        </div>
      )}

      {/* Illustration */}
      <div style={{
        height: 140,
        background: t.paper2,
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${t.line2}`,
      }}>
        {illustration}
      </div>

      {/* Content */}
      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          fontFamily: t.mono, fontSize: 9, letterSpacing: 1.5,
          color: t.rust, textTransform: 'uppercase',
        }}>
          {num} · {category}
        </div>
        <div style={{
          fontFamily: t.serif, fontSize: 24, fontWeight: 400,
          color: t.ink, lineHeight: 1.1,
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: t.sans, fontSize: 12, color: t.inkMute,
          lineHeight: 1.55, flex: 1,
        }}>
          {desc}
        </div>
      </div>

      {/* Footer note */}
      <div style={{
        padding: '10px 18px',
        borderTop: `1px solid ${t.line2}`,
        fontFamily: t.mono, fontSize: 9, letterSpacing: 1.2,
        color: t.inkFaint, textTransform: 'uppercase',
      }}>
        {footer}
      </div>
    </button>
  )
}

function PaperAreaStep({ onBack, onGenerate, showMap = true, generateLabel, t }: {
  onBack: () => void; onGenerate: () => void; showMap?: boolean; generateLabel?: string; t: Theme
}) {
  const {
    paperSize, orientation, pageGrid,
    hexSizeMm, hexOrientation, marginMm, hexEdgeMode,
    zoom, framePixelWidth, center,
    setPaperSize, setOrientation, setPageGrid,
    setHexSizeMm, setHexOrientation, setMarginMm, setHexEdgeMode,
    flyTo, setBlankMap, generateMap,
  } = useMapStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [customW, setCustomW] = useState(420)
  const [customH, setCustomH] = useState(297)

  useEffect(() => {
    if (showMap) return
    setBlankMap(true)
    generateMap()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showMap) return
    const timer = setTimeout(() => {
      setBlankMap(true)
      generateMap()
    }, 600)
    return () => clearTimeout(timer)
  }, [hexSizeMm, hexOrientation, paperSize, orientation, marginMm, hexEdgeMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDisabled = showMap && framePixelWidth === 0

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`)
    const data = await r.json()
    if (data[0]) flyTo([parseFloat(data[0].lon), parseFloat(data[0].lat)], 12)
  }

  function handleSetSize(s: PaperSize) {
    setIsCustom(false)
    setPaperSize(s)
  }

  function handleCustom() {
    const [w, h] = pageGridTotalMm(pageGrid)
    setCustomW(w)
    setCustomH(h)
    setIsCustom(true)
  }

  function handleCustomDim(w: number, h: number) {
    setCustomW(w)
    setCustomH(h)
    if (w > 0 && h > 0) setPageGrid({ colWidths: [w], rowHeights: [h] })
  }

  const [paperW, paperH] = pageGridTotalMm(pageGrid)
  const terrainWidthKm = framePixelWidth > 0
    ? (framePixelWidth * mapResolutionMpx(center[1], zoom)) / 1000
    : null
  const terrainHeightKm = terrainWidthKm !== null ? terrainWidthKm * (paperH / paperW) : null
  const hexKm = terrainWidthKm !== null
    ? (hexSizeMm / paperW) * (terrainWidthKm * 1000) / 1000
    : null

  const hexDisplay = hexKm !== null
    ? `${hexSizeMm} mm · ${hexKm.toFixed(1)} km`
    : `${hexSizeMm} mm`

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left panel ── */}
        <div style={{
          width: 380, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${t.line}`,
          overflowY: 'auto',
          background: t.surface,
        }}>

          {/* AREA — OSM only, at top */}
          {showMap && (
            <PanelSection label="AREA" t={t}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: `1px solid ${t.line}`,
                background: t.paper,
              }}>
                <span style={{ padding: '0 10px', color: t.inkFaint, fontSize: 13 }}>⌕</span>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search location…"
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    fontFamily: t.sans, fontSize: 12, color: t.ink,
                    padding: '8px 0', outline: 'none',
                  }}
                />
              </div>
            </PanelSection>
          )}

          {/* PAPER */}
          <PanelSection label="PAPER" t={t}>
            <div>
              <FieldLabel t={t}>SIZE</FieldLabel>
              <ToggleGroup>
                {(['A4','A3','A2','A1'] as PaperSize[]).map(s => (
                  <ToggleBtn key={s} active={!isCustom && paperSize === s} onClick={() => handleSetSize(s)} t={t}>{s}</ToggleBtn>
                ))}
                <ToggleBtn active={isCustom} onClick={handleCustom} t={t}>Custom</ToggleBtn>
              </ToggleGroup>
            </div>

            {isCustom ? (
              <div style={{ marginTop: 10 }}>
                <FieldLabel t={t}>DIMENSIONS</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min={50} max={2000} value={customW}
                    onChange={e => handleCustomDim(Number(e.target.value), customH)}
                    style={{
                      width: 64, padding: '6px 8px',
                      fontFamily: t.mono, fontSize: 12, color: t.ink,
                      background: t.paper, border: `1px solid ${t.line}`,
                      outline: 'none', textAlign: 'center',
                    }}
                  />
                  <span style={{ fontFamily: t.mono, fontSize: 11, color: t.inkFaint }}>×</span>
                  <input
                    type="number" min={50} max={2000} value={customH}
                    onChange={e => handleCustomDim(customW, Number(e.target.value))}
                    style={{
                      width: 64, padding: '6px 8px',
                      fontFamily: t.mono, fontSize: 12, color: t.ink,
                      background: t.paper, border: `1px solid ${t.line}`,
                      outline: 'none', textAlign: 'center',
                    }}
                  />
                  <span style={{ fontFamily: t.mono, fontSize: 11, color: t.inkFaint }}>mm</span>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <FieldLabel t={t}>ORIENTATION</FieldLabel>
                <ToggleGroup>
                  <ToggleBtn active={orientation === 'landscape'} onClick={() => setOrientation('landscape' as Orientation)} t={t}>Landscape</ToggleBtn>
                  <ToggleBtn active={orientation === 'portrait'}  onClick={() => setOrientation('portrait'  as Orientation)} t={t}>Portrait</ToggleBtn>
                </ToggleGroup>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <SetupSliderRow
                label="Print margin"
                display={`${marginMm} mm`}
                value={marginMm} min={0} max={25} step={1}
                t={t}
                onChange={setMarginMm}
              />
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1.2, textTransform: 'uppercase' }}>Sheet</span>
                <span style={{ fontFamily: t.mono, fontSize: 10, color: t.ink }}>{paperW} × {paperH} mm</span>
              </div>
              {terrainWidthKm !== null && terrainHeightKm !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1.2, textTransform: 'uppercase' }}>Map</span>
                  <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkMute }}>{terrainWidthKm.toFixed(0)} × {terrainHeightKm.toFixed(0)} km</span>
                </div>
              )}
            </div>
          </PanelSection>

          {/* HEX */}
          <PanelSection label="HEX" t={t}>
            <div>
              <FieldLabel t={t}>ORIENTATION</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ToggleGroup>
                  <ToggleBtn active={hexOrientation === 'pointy'} onClick={() => setHexOrientation('pointy' as HexOrientation)} t={t}>Pointy</ToggleBtn>
                  <ToggleBtn active={hexOrientation === 'flat'}   onClick={() => setHexOrientation('flat'   as HexOrientation)} t={t}>Flat</ToggleBtn>
                </ToggleGroup>
                <HexOrientIcon orientation={hexOrientation} t={t} />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <FieldLabel t={t}>HEX SIZE</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: t.serif, fontSize: 28, fontWeight: 400, color: t.ink, lineHeight: 1 }}>
                  {hexSizeMm}
                </span>
                <span style={{ fontFamily: t.mono, fontSize: 11, color: t.inkMute }}>
                  mm{hexKm !== null ? ` · ≈ ${hexKm.toFixed(1)} km` : ''}
                </span>
              </div>
              <SetupSliderTrack value={hexSizeMm} min={5} max={50} step={1} t={t} onChange={setHexSizeMm} />
            </div>

            <div style={{ marginTop: 10 }}>
              <FieldLabel t={t}>EDGE HEXES</FieldLabel>
              <ToggleGroup>
                <ToggleBtn active={hexEdgeMode === 'whole'} onClick={() => setHexEdgeMode('whole')} t={t}>Full only</ToggleBtn>
                <ToggleBtn active={hexEdgeMode === 'half'}  onClick={() => setHexEdgeMode('half')} t={t}>Partial</ToggleBtn>
              </ToggleGroup>
            </div>
          </PanelSection>
        </div>

        {/* ── Right: map or blank canvas preview ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {showMap
            ? <MapView editable />
            : <TerrainViewCanvas surroundColor={t.paper2} />
          }
        </div>
      </div>

      {/* ── Bottom nav ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
        borderTop: `1px solid ${t.line2}`,
        background: t.surface,
      }}>
        <NavButton onClick={onBack} ghost t={t}>← BACK</NavButton>
        <NavButton onClick={onGenerate} disabled={isDisabled} t={t}>
          {generateLabel ?? (showMap ? 'GENERATE →' : 'START EDITING →')}
        </NavButton>
      </div>
    </div>
  )
}

function SetupSliderTrack({ value, min, max, step, t, onChange }: {
  value: number; min: number; max: number; step: number; t: Theme; onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = (value - min) / (max - min)
  function compute(clientX: number) {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onChange(Math.max(min, Math.min(max, Math.round((min + frac * (max - min)) / step) * step)))
  }
  return (
    <div
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); compute(e.clientX) }}
      onPointerMove={e => { if (e.buttons === 0) return; compute(e.clientX) }}
      style={{ padding: '6px 0', cursor: 'ew-resize', userSelect: 'none', touchAction: 'none' }}
    >
      <div ref={trackRef} style={{ position: 'relative', height: 2, background: t.line }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct * 100}%`, background: t.rust }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${pct * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12, background: t.surface, border: `1.5px solid ${t.rust}`,
        }} />
      </div>
    </div>
  )
}

function SetupSliderRow({ label, display, value, min, max, step, t, onChange }: {
  label: string; display: string; value: number; min: number; max: number; step: number;
  t: Theme; onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = (value - min) / (max - min)

  function compute(clientX: number) {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + frac * (max - min)
    onChange(Math.max(min, Math.min(max, Math.round(raw / step) * step)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkMute }}>{display}</span>
      </div>
      <div
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); compute(e.clientX) }}
        onPointerMove={e => { if (e.buttons === 0) return; compute(e.clientX) }}
        style={{ padding: '6px 0', cursor: 'ew-resize', userSelect: 'none', touchAction: 'none' }}
      >
        <div ref={trackRef} style={{ position: 'relative', height: 2, background: t.line }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct * 100}%`, background: t.rust }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${pct * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 12, height: 12,
            background: t.surface,
            border: `1.5px solid ${t.rust}`,
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Panel primitives ────────────────────────────────────────────────────────

function PanelSection({ label, children, t }: { label?: string; children: React.ReactNode; t: Theme }) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.line2}` }}>
      {label && (
        <div style={{
          fontFamily: t.mono, fontSize: 10, color: t.ink,
          fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}

function FieldLabel({ children, style, t }: { children: React.ReactNode; style?: React.CSSProperties; t: Theme }) {
  return (
    <div style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 7, ...style }}>
      {children}
    </div>
  )
}

function ToggleGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 0 }}>{children}</div>
}

function ToggleBtn({ active, onClick, children, t }: { active: boolean; onClick: () => void; children: React.ReactNode; t: Theme }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px',
        background: active ? t.ink : t.paper,
        color: active ? t.paper : t.inkMute,
        border: `1px solid ${t.line}`,
        marginLeft: -1,
        cursor: 'pointer',
        fontFamily: t.sans, fontSize: 11,
        position: 'relative', zIndex: active ? 1 : 0,
      }}
    >
      {children}
    </button>
  )
}

function HexOrientIcon({ orientation, t }: { orientation: HexOrientation; t: Theme }) {
  const pts = orientation === 'pointy'
    ? '10,2 18,6.5 18,15.5 10,20 2,15.5 2,6.5'
    : '2,11 7.5,2 16.5,2 22,11 16.5,20 7.5,20'
  return (
    <svg width="22" height="22" viewBox="0 0 24 22" fill="none">
      <polygon points={pts} stroke={t.inkMute} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    </svg>
  )
}

// ── Shared nav primitives ───────────────────────────────────────────────────

function BottomNav({ left, right, t }: { left: React.ReactNode; right: React.ReactNode; t: Theme }) {
  return (
    <div style={{
      height: 64, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px',
      borderTop: `1px solid ${t.line2}`,
      background: t.surface,
    }}>
      {left}
      {right}
    </div>
  )
}

function NavButton({ children, onClick, ghost, disabled, t }: {
  children: React.ReactNode; onClick: () => void; ghost?: boolean; disabled?: boolean; t: Theme
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 24px',
        background: ghost ? 'transparent' : t.ink,
        color: ghost ? t.inkMute : t.paper,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: t.mono,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: ghost ? 400 : 600,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={e => {
        if (disabled) return
        if (ghost) e.currentTarget.style.color = t.ink
        else e.currentTarget.style.background = t.ink2
      }}
      onMouseLeave={e => {
        if (ghost) e.currentTarget.style.color = t.inkMute
        else e.currentTarget.style.background = t.ink
      }}
    >
      {children}
    </button>
  )
}

// ── Card illustrations ──────────────────────────────────────────────────────

function OsmIllustration({ t }: { t: Theme }) {
  const sq3 = Math.sqrt(3)
  const R = 14
  const colors = [
    '#d4c9b0','#c8bfa2','#b5a882','#d4c9b0','#cdc4ae',
    '#b8c9a8','#a8ba98','#c8bfa2','#b5a882','#d4c9b0',
    '#cdc4ae','#b8c9a8','#d4c9b0','#c8bfa2','#a8ba98',
    '#b5a882','#cdc4ae','#b8c9a8','#d4c9b0','#c8bfa2',
    '#a8ba98','#b5a882','#cdc4ae','#d4c9b0','#b8c9a8',
  ]
  const hexes: { cx: number; cy: number; color: string }[] = []
  const colSpacing = 1.5 * R
  const rowSpacing = sq3 * R
  let idx = 0
  for (let q = 0; q < 5; q++) {
    const cx = 20 + q * colSpacing
    const offset = q % 2 !== 0 ? rowSpacing / 2 : 0
    for (let r = 0; r < 5; r++) {
      const cy = 16 + r * rowSpacing - offset
      hexes.push({ cx, cy, color: colors[idx % colors.length] })
      idx++
    }
  }
  const pts = (cx: number, cy: number) =>
    [0,60,120,180,240,300].map(a => {
      const rad = a * Math.PI / 180
      return `${cx + R * Math.cos(rad)},${cy + R * Math.sin(rad)}`
    }).join(' ')

  return (
    <svg width="280" height="140" style={{ display: 'block' }}>
      {hexes.map((h, i) => (
        <polygon key={i} points={pts(h.cx, h.cy)} fill={h.color} stroke={t.paper2} strokeWidth={0.8} />
      ))}
    </svg>
  )
}

function BlankIllustration({ t }: { t: Theme }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.paper2,
    }}>
      <span style={{
        fontFamily: t.mono, fontSize: 11, letterSpacing: 2,
        color: t.inkFaint, textTransform: 'uppercase',
      }}>
        EMPTY
      </span>
    </div>
  )
}

function ReferenceIllustration({ t }: { t: Theme }) {
  return (
    <svg width="280" height="140" style={{ display: 'block' }} viewBox="0 0 280 140">
      <rect width="280" height="140" fill={t.paper2} />
      {/* Road/river curves */}
      <path d="M 20 100 C 80 80, 140 90, 200 60 S 260 30, 270 20"
        stroke={t.inkFaint} strokeWidth="1.5" fill="none" />
      <path d="M 30 140 C 90 120, 160 115, 220 100 S 265 90, 270 80"
        stroke={t.line} strokeWidth="1" fill="none" />
      {/* Settlement dots */}
      <circle cx="148" cy="82" r="3" fill={t.ink} />
      <text x="154" y="79" fontFamily="Geist, sans-serif" fontSize="10" fill={t.ink} fontStyle="italic">Bruck</text>
      <circle cx="218" cy="60" r="3" fill={t.ink} />
      <text x="224" y="57" fontFamily="Geist, sans-serif" fontSize="10" fill={t.ink} fontStyle="italic">Aldorf</text>
    </svg>
  )
}

// ── Screen 03 — Generating ──────────────────────────────────────────────────

const TERRAIN_STEPS = [
  { id: 'grid',      label: 'INITIALISING GRID' },
  { id: 'raster',    label: 'FETCHING RASTER DATA' },
  { id: 'classify',  label: 'CLASSIFYING TERRAIN' },
  { id: 'coastline', label: 'COMPOSITING COASTLINE' },
]

const LAYER_STEPS = [
  { id: 'roads-rails',  label: 'ROADS & RAILS' },
  { id: 'rivers',       label: 'RIVERS' },
  { id: 'settlements',  label: 'SETTLEMENTS' },
  { id: 'elevation',    label: 'ELEVATION' },
]

function GeneratingStep({ onDone, t }: { onDone: () => void; t: Theme }) {
  const {
    generateStatus, generateProgress, center,
    roadsStatus, railsStatus, riversOsmStatus, settlementsStatus,
    elevationStatus, elevationProgress,
    fetchRoads, fetchRails, fetchRivers, fetchSettlements, fetchElevation,
    generatedMetadata, settlements, mapTitle, setMapTitle,
  } = useMapStore()

  const [nominatimResult, setNominatimResult]       = useState<NominatimResult | null>(null)
  const [countryNominatim, setCountryNominatim]     = useState<NominatimResult | null>(null)
  const [phase, setPhase]         = useState<'terrain' | 'layers'>('terrain')
  const [tick, setTick]           = useState(0)

  const terrainStepStartRef = useRef(Date.now())
  const prevTerrainStepRef  = useRef<string | null>(null)
  const layerStartsRef      = useRef<Record<string, number>>({})
  const layersFetchedRef    = useRef(false)

  useEffect(() => {
    setNominatimResult(null)
    setCountryNominatim(null)
    if (!generatedMetadata) return
    const controller = new AbortController()
    const widthKm = generatedMetadata.scale_m_per_mm * generatedMetadata.paper_mm[0] / 1000
    const zoom    = nominatimZoomForWidth(widthKm)
    const base    = `https://nominatim.openstreetmap.org/reverse?lat=${center[1]}&lon=${center[0]}&format=json&accept-language=en`
    const opts    = { signal: controller.signal, headers: { 'User-Agent': 'IG2-map-generator' } }

    fetch(`${base}&zoom=${zoom}`, opts)
      .then(r => r.json())
      .then(d => setNominatimResult(d as NominatimResult))
      .catch(() => {})

    if (zoom !== 4) {
      fetch(`${base}&zoom=4`, opts)
        .then(r => r.json())
        .then(d => setCountryNominatim(d as NominatimResult))
        .catch(() => {})
    }

    return () => controller.abort()
  }, [generatedMetadata])

  useEffect(() => {
    if (!generatedMetadata) return
    if (settlementsStatus !== 'done' && settlementsStatus !== 'error') return
    const widthKm = generatedMetadata.scale_m_per_mm * generatedMetadata.paper_mm[0] / 1000
    if (widthKm >= 100 && !nominatimResult) return
    const title = generateMapTitle(
      settlements, generatedMetadata,
      nominatimResult ?? undefined,
      countryNominatim ?? undefined,
    )
    if (title) setMapTitle(title)
  }, [settlementsStatus, generatedMetadata, nominatimResult, countryNominatim, settlements])

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const step = generateProgress?.step ?? null
    if (step !== prevTerrainStepRef.current) {
      prevTerrainStepRef.current = step
      terrainStepStartRef.current = Date.now()
    }
  }, [generateProgress?.step])

  useEffect(() => {
    if (generateStatus === 'done' && !layersFetchedRef.current) {
      layersFetchedRef.current = true
      const now = Date.now()
      layerStartsRef.current = { 'roads-rails': now, rivers: now, settlements: now, elevation: now }
      setPhase('layers')
      fetchRoads()
      fetchRails()
      fetchRivers()
      fetchSettlements()
      fetchElevation()
    }
  }, [generateStatus, fetchRoads, fetchRails, fetchRivers, fetchSettlements, fetchElevation])

  const roadsRailsDone  = (roadsStatus === 'done' || roadsStatus === 'error')
                       && (railsStatus === 'done' || railsStatus === 'error')
  const riversDone      = riversOsmStatus === 'done'   || riversOsmStatus === 'error'
  const settlementsDone = settlementsStatus === 'done' || settlementsStatus === 'error'
  const elevationDone   = elevationStatus === 'done'   || elevationStatus === 'error'
  const allLayersDone   = roadsRailsDone && riversDone && settlementsDone && elevationDone

  useEffect(() => {
    if (phase === 'layers' && allLayersDone) {
      const timer = setTimeout(onDone, 700)
      return () => clearTimeout(timer)
    }
  }, [phase, allLayersDone, onDone])

  void tick
  const now = Date.now()
  const terrainElapsed = Math.floor((now - terrainStepStartRef.current) / 1000)
  const layerElapsed   = (id: string) => {
    const s = layerStartsRef.current[id]
    return s ? Math.floor((now - s) / 1000) : 0
  }

  const terrainProgress  = generateStatus === 'done' ? 100 : (generateProgress?.progress ?? 0)
  const elevFrac         = elevationDone ? 100 : (elevationProgress?.progress ?? 0)
  const nonElevDoneCount = [roadsRailsDone, riversDone, settlementsDone].filter(Boolean).length
  const layersProgress   = (nonElevDoneCount * 100 + elevFrac) / 4
  const progress         = phase === 'terrain' ? terrainProgress : layersProgress

  const currentStepId     = generateProgress?.step ?? null
  const currentTerrainIdx = TERRAIN_STEPS.findIndex(s => s.id === currentStepId)
  const terrainAllDone    = generateStatus === 'done'

  const roadsRailsActive  = phase === 'layers' && (roadsStatus === 'loading' || railsStatus === 'loading')
  const riversActive      = phase === 'layers' && riversOsmStatus === 'loading'
  const settlementsActive = phase === 'layers' && settlementsStatus === 'loading'
  const elevationActive   = phase === 'layers' && elevationStatus === 'loading'

  const layerDetail: Record<string, string | undefined> = {
    'roads-rails':  roadsRailsActive  ? `${layerElapsed('roads-rails')}s`      : undefined,
    'rivers':       riversActive      ? `${layerElapsed('rivers')}s`           : undefined,
    'settlements':  settlementsActive ? `${layerElapsed('settlements')}s`      : undefined,
    'elevation':    elevationActive   ? `${elevationProgress?.progress ?? 0}%` : undefined,
  }

  const layerState = {
    'roads-rails': { done: roadsRailsDone,  active: roadsRailsActive  },
    'rivers':      { done: riversDone,      active: riversActive      },
    'settlements': { done: settlementsDone, active: settlementsActive },
    'elevation':   { done: elevationDone,   active: elevationActive   },
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 36,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: t.mono, fontSize: 9, letterSpacing: 2,
          color: t.inkFaint, textTransform: 'uppercase', marginBottom: 10,
        }}>
          {allLayersDone && phase === 'layers' ? 'COMPLETE' : 'GENERATING'}
        </div>
        <h1 style={{
          fontFamily: t.serif, fontSize: 52, fontWeight: 400,
          color: t.ink, margin: 0, fontStyle: 'italic',
        }}>
          {mapTitle || 'Untitled'}
        </h1>
      </div>

      <HexDotBar progress={progress} t={t} />

      {phase === 'terrain' && generateProgress && (
        <div style={{
          fontFamily: t.mono, fontSize: 10, color: t.inkMute,
          letterSpacing: 0.5, textAlign: 'center',
        }}>
          {generateProgress.message} · {terrainElapsed}s
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TERRAIN_STEPS.map((s, i) => {
          const done   = terrainAllDone || currentTerrainIdx > i
          const active = !terrainAllDone && s.id === currentStepId
          const detail = active ? `${terrainElapsed}s` : undefined
          return <CheckRow key={s.id} label={s.label} done={done} active={active} detail={detail} t={t} />
        })}

        <div style={{ height: 1, background: t.line2, margin: '4px 0' }} />

        {LAYER_STEPS.map(s => {
          const ls = layerState[s.id as keyof typeof layerState]
          return (
            <CheckRow
              key={s.id}
              label={s.label}
              done={ls.done}
              active={ls.active}
              pending={phase === 'terrain'}
              detail={layerDetail[s.id]}
              t={t}
            />
          )
        })}
      </div>
    </div>
  )
}

function CheckRow({ label, done, active, pending, detail, t }: {
  label: string; done: boolean; active: boolean; pending?: boolean; detail?: string; t: Theme
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {done ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke={t.rust} strokeWidth="1" />
            <path d="M4.5 7l2 2 3.5-3.5" stroke={t.rust} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : active ? (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.rust }} />
        ) : (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: pending ? t.line2 : t.line }} />
        )}
      </div>
      <span style={{
        fontFamily: t.mono, fontSize: 10, letterSpacing: 1,
        color: done ? t.ink : active ? t.ink2 : t.inkFaint,
      }}>
        {label}
        {detail && (
          <span style={{ marginLeft: 8, color: t.inkFaint }}>· {detail}</span>
        )}
      </span>
    </div>
  )
}

function HexDotBar({ progress, t }: { progress: number; t: Theme }) {
  const TOTAL = 20
  const filled = Math.round((progress / 100) * TOTAL)
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: TOTAL }, (_, i) => (
        <svg key={i} width="13" height="15" viewBox="0 0 13 15">
          <polygon
            points="6.5,1 12,4 12,11 6.5,14 1,11 1,4"
            fill={i < filled ? t.rust : 'none'}
            stroke={i < filled ? t.rust : t.line}
            strokeWidth="1"
          />
        </svg>
      ))}
    </div>
  )
}

// ── Logo ─────────────────────────────────────────────────────────────────────

function HachureLogo({ t }: { t: Theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src="/icon.png" alt="" style={{ height: 28, display: 'block' }} />
      <span style={{ fontFamily: t.serif, fontSize: 17, fontWeight: 400, color: t.ink }}>Hachure</span>
    </div>
  )
}
