import { useState, useEffect } from 'react'
import { get as idbGet } from 'idb-keyval'
import { TK, TK_DARK } from '../../theme'
import { useMapStore } from '../../store/mapStore'
import { HowItWorksModal } from './HowItWorksModal'

type Theme = typeof TK

export function SetupLandingPage({
  onNewMap,
  onResume,
  onLoadFile,
  isDark,
  onToggleDark,
}: {
  onNewMap: () => void
  onResume: () => void
  onLoadFile: () => void
  isDark: boolean
  onToggleDark: () => void
}) {
  const { generatedHexes, generatedMetadata, paperSize, orientation, mapTitle } = useMapStore()
  const hasSavedMap = generatedHexes.length > 0
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const t = isDark ? TK_DARK : TK

  useEffect(() => {
    idbGet('hachure-thumb').then(v => {
      if (typeof v === 'string') setThumbUrl(v)
    }).catch(() => {})
  }, [])

  return (
    <div style={{
      position: 'relative',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: t.paper,
      fontFamily: t.sans,
      color: t.ink,
      transition: 'background 0.25s, color 0.25s',
    }}>
      {/* Ghost map background — full screen */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>
        <img
          src={thumbUrl ?? '/map-placeholder.jpg'}
          alt=""
          style={{
            position: 'absolute',
            height: '120%',
            width: 'auto',
            top: '50%',
            right: '-8%',
            transform: 'translateY(-50%)',
            opacity: isDark ? 0.20 : 0.30,
            mixBlendMode: isDark ? 'screen' : 'multiply',
          }}
        />
        {/* Fade from left — solid until ~30%, fully transparent by 65% */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to right, ${t.paper} 0%, ${t.paper} 30%, ${t.paper}cc 44%, ${t.paper}44 58%, transparent 68%)`,
        }} />
      </div>

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '20px 28px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 10,
      }}>
        <HachureLogo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <DarkModeToggle isDark={isDark} onToggle={onToggleDark} t={t} />
          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint, letterSpacing: 1.5 }}>V0.1</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 1,
        height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        paddingLeft: 80,
      }}>
        <h1 style={{
          fontFamily: t.serif,
          fontSize: 72,
          fontWeight: 400,
          color: t.ink,
          lineHeight: 1.02,
          margin: '0 0 18px 0',
          letterSpacing: -0.5,
        }}>
          A hex map<br />editor.
        </h1>

        <p style={{
          fontFamily: t.sans,
          fontSize: 13,
          color: t.inkMute,
          maxWidth: 370,
          lineHeight: 1.65,
          margin: '0 0 36px 0',
        }}>
          Build printable hex maps from real geodata or blank
          grids. Add reference images any time. Exports a print-ready PDF.
        </p>

        {/* Resume — standalone, only when there's saved work */}
        {hasSavedMap && (
          <>
            <button
              onClick={onResume}
              style={{
                width: 420,
                background: t.ink,
                border: `1px solid ${t.line}`,
                padding: '20px 22px',
                cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = t.ink2 }}
              onMouseLeave={e => { e.currentTarget.style.background = t.ink }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: t.sans, fontWeight: 600, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.paper }}>
                    Resume
                  </span>
                  <span style={{ fontFamily: t.serif, fontStyle: 'italic', fontSize: 13, color: t.inkFaint }}>
                    last session
                  </span>
                </div>
                {mapTitle && (
                  <div style={{ fontFamily: t.serif, fontSize: 17, fontStyle: 'italic', color: t.paper, marginBottom: 3 }}>
                    {mapTitle}
                  </div>
                )}
                <div style={{ fontFamily: t.sans, fontSize: 11, color: t.inkFaint }}>
                  {generatedMetadata
                    ? `${paperSize} · ${orientation} · ${generatedMetadata.hex_count} hexes · ${generatedMetadata.hex_size_km.toFixed(1)} km each`
                    : `${paperSize} · ${orientation} · ${generatedHexes.length} hexes`}
                </div>
              </div>
              <ArrowIcon color={`${t.paper}80`} />
            </button>

            {/* Separator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 420, margin: '16px 0' }}>
              <div style={{ flex: 1, height: 1, background: t.line }} />
              <span style={{ fontFamily: t.sans, fontSize: 10, color: t.inkFaint, letterSpacing: 1, textTransform: 'uppercase' }}>or</span>
              <div style={{ flex: 1, height: 1, background: t.line }} />
            </div>
          </>
        )}

        {/* Action card group */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          width: 420,
          border: `1px solid ${t.line}`,
        }}>
          {/* NEW MAP */}
          <button
            onClick={onNewMap}
            style={{
              background: hasSavedMap ? t.surface : t.ink,
              border: 'none',
              padding: '20px 22px',
              cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = hasSavedMap ? t.paper2 : t.ink2 }}
            onMouseLeave={e => { e.currentTarget.style.background = hasSavedMap ? t.surface : t.ink }}
          >
            <div>
              <div style={{ fontFamily: t.sans, fontWeight: 600, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: hasSavedMap ? t.ink : t.paper, marginBottom: 4 }}>
                New Map
              </div>
              <div style={{ fontFamily: t.sans, fontSize: 11, color: hasSavedMap ? t.inkMute : t.inkFaint }}>
                Choose source · set paper · paint
              </div>
            </div>
            <ArrowIcon color={hasSavedMap ? t.inkFaint : `${t.paper}80`} />
          </button>

          {/* LOAD FROM FILE */}
          <button
            onClick={onLoadFile}
            style={{
              background: t.surface,
              border: 'none',
              borderTop: `1px solid ${t.line}`,
              padding: '18px 22px',
              cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = t.paper2 }}
            onMouseLeave={e => { e.currentTarget.style.background = t.surface }}
          >
            <div>
              <div style={{ fontFamily: t.sans, fontWeight: 600, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.ink, marginBottom: 4 }}>
                Load from Saved File
              </div>
              <div style={{ fontFamily: t.sans, fontSize: 11, color: t.inkMute }}>
                .tabula or .json format
              </div>
            </div>
            <FolderIcon color={t.inkFaint} />
          </button>
        </div>

        {/* How it works link */}
        <button
          onClick={() => setShowHowItWorks(true)}
          style={{
            marginTop: 16,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: t.sans,
            fontSize: 11,
            color: t.inkMute,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            letterSpacing: 0.2,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = t.ink }}
          onMouseLeave={e => { e.currentTarget.style.color = t.inkMute }}
        >
          How does it work?
          <span style={{ fontSize: 12 }}>→</span>
        </button>
      </div>

      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} t={t} />}

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '13px 28px',
        display: 'flex', alignItems: 'center',
        borderTop: `1px solid ${t.line2}`,
        zIndex: 1,
      }}>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint, letterSpacing: 0.5 }}>
          Hachure · v0.1
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 28 }}>
          <FooterStat label="PAPER" value="A1–A6" t={t} />
          <FooterStat label="SOURCES" value="OSM · Blank" t={t} />
          <FooterStat label="OUTPUT" value="PDF · print scale" t={t} />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HachureLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/icon.png" alt="" style={{ height: 40, display: 'block' }} />
      <span style={{ fontFamily: TK.serif, fontSize: 22, fontWeight: 400, color: TK.ink }}>Hachure</span>
    </div>
  )
}

function DarkModeToggle({ isDark, onToggle, t }: { isDark: boolean; onToggle: () => void; t: Theme }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: 'none',
        border: `1px solid ${t.line}`,
        borderRadius: 4,
        padding: '4px 8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: t.mono,
        fontSize: 9,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: t.inkMute,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = t.inkFaint }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = t.line }}
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.inkMute} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.inkMute} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
        </svg>
      )}
    </button>
  )
}

function FooterStat({ label, value, t }: { label: string; value: string; t: Theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: t.sans, fontSize: 11, color: t.inkMute }}>
        {value}
      </span>
    </div>
  )
}

function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m12 5 7 7-7 7" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FolderIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
