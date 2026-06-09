import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'
import { PresetsDropdown } from '../PresetsPanel'
import { BUILTIN_PRESET_MAP, isPresetEdited } from '../../lib/stylePreset'

const TABS = [
  { id: 'terrain',    label: 'Terrain'  },
  { id: 'features',   label: 'Features' },
  { id: 'highlights', label: 'Overlays' },
  { id: 'display',    label: 'Display'  },
] as const

export function EditorTopBar({ onExportPDF, onGoHome, hideTabs }: { onExportPDF: (mode: 'sheets' | 'combined') => Promise<void>; onGoHome: () => void; hideTabs?: boolean }) {
  const t = useTheme()
  const {
    paperSize, generatedHexes, generatedMetadata, pageGrid,
    undoStack, redoStack, undo, redo,
    activePanel, setActivePanel,
    saveProject, restoreProject,
    mapTitle, setMapTitle,
    activePresetId,
  } = useMapStore()
  const presetEdited = useMapStore(s => isPresetEdited(s, s.activePresetId))

  const isMultiSheet = pageGrid.colWidths.length > 1 || pageGrid.rowHeights.length > 1

  const [exporting, setExporting] = useState(false)
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)

  const presetsBtnRef = useRef<HTMLButtonElement>(null)
  const printBtnRef = useRef<HTMLButtonElement>(null)
  const projectBtnRef = useRef<HTMLButtonElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startEditTitle = useCallback(() => {
    setTitleDraft(mapTitle)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }, [mapTitle])

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim()
    if (trimmed) setMapTitle(trimmed)
    setEditingTitle(false)
  }, [titleDraft, setMapTitle])

  const handlePrint = async (mode: 'sheets' | 'combined') => {
    setPrintMenuOpen(false)
    setExporting(true)
    try { await onExportPDF(mode) } finally { setExporting(false) }
  }

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try { restoreProject(JSON.parse(reader.result as string)) } catch { /* ignore malformed */ }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Close project menu on outside click
  useEffect(() => {
    if (!projectMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (
        projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node) &&
        projectBtnRef.current && !projectBtnRef.current.contains(e.target as Node)
      ) {
        setProjectMenuOpen(false)
        setEditingTitle(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [projectMenuOpen])

  const meta = useMemo(() => {
    if (!generatedHexes.length) return null
    const qs = generatedHexes.map(h => h.q)
    const rs = generatedHexes.map(h => h.r)
    const cols = Math.max(...qs) - Math.min(...qs) + 1
    const rows = Math.max(...rs) - Math.min(...rs) + 1
    const count = generatedMetadata?.hex_count ?? generatedHexes.length
    return { cols, rows, count }
  }, [generatedHexes, generatedMetadata])

  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  const activePresetName = activePresetId ? (BUILTIN_PRESET_MAP[activePresetId]?.name ?? null) : null

  const chipParts = [mapTitle || null, paperSize || null].filter(Boolean)
  const chipLabel = chipParts.length ? chipParts.join(' · ') : 'Untitled'

  return (
    <>
    {presetsOpen && <PresetsDropdown anchorRef={presetsBtnRef} onClose={() => setPresetsOpen(false)} />}

    {/* Project info dropdown */}
    {projectMenuOpen && (
      <div
        ref={projectMenuRef}
        style={{
          position: 'fixed',
          top: t.topBarHeight,
          left: 0,
          zIndex: 200,
          background: t.paper,
          border: `1px solid ${t.line}`,
          borderTop: 'none',
          borderRadius: '0 0 6px 0',
          minWidth: 280,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          padding: '16px 20px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase' }}>Map title</span>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              autoFocus
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              style={{
                fontFamily: t.serif,
                fontSize: 15,
                color: t.ink,
                background: t.paper2,
                border: `1px solid ${t.rust}`,
                outline: 'none',
                padding: '4px 8px',
                borderRadius: 3,
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <button
              onClick={startEditTitle}
              style={{
                background: 'none',
                border: `1px solid transparent`,
                borderRadius: 3,
                padding: '4px 8px',
                textAlign: 'left',
                cursor: 'text',
                fontFamily: t.serif,
                fontSize: 15,
                fontStyle: mapTitle ? 'normal' : 'italic',
                color: mapTitle ? t.ink : t.inkFaint,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.background = t.paper2 }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}
            >
              {mapTitle || 'Click to name this map'}
            </button>
          )}
        </div>

        {/* Map info */}
        {(paperSize || meta) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase' }}>Map info</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {paperSize && <InfoRow label="Paper" value={paperSize} t={t} />}
              {meta && (
                <>
                  <InfoRow label="Grid" value={`${meta.cols} × ${meta.rows}`} t={t} />
                  <InfoRow label="Hexes" value={meta.count.toLocaleString()} t={t} />
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ height: 1, background: t.line }} />

        {/* File actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <MenuBtn onClick={() => { saveProject(); setProjectMenuOpen(false) }} t={t}>Save project</MenuBtn>
          <MenuBtn onClick={() => fileInputRef.current?.click()} t={t}>Load project</MenuBtn>
          <input ref={fileInputRef} type="file" accept=".ig2,.json" style={{ display: 'none' }} onChange={handleLoad} />
        </div>
      </div>
    )}

    <div style={{
      height: t.topBarHeight,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'stretch',
      background: t.paper,
      borderBottom: `1px solid ${t.line}`,
      userSelect: 'none',
    }}>

      {/* Left: logo + project chip */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
        <button
          onClick={onGoHome}
          title="Back to home"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0 14px', display: 'flex', alignItems: 'center',
            borderRight: `1px solid ${t.line}`,
          }}
        >
          <img src="/icon.png" alt="" style={{ height: 24, display: 'block' }} />
        </button>

        <button
          ref={projectBtnRef}
          onClick={() => setProjectMenuOpen(v => !v)}
          style={{
            height: '100%',
            padding: '0 14px 0 12px',
            background: projectMenuOpen ? t.paper2 : 'none',
            border: 'none',
            borderRight: `1px solid ${t.line}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={e => { if (!projectMenuOpen) e.currentTarget.style.background = t.paper2 }}
          onMouseLeave={e => { if (!projectMenuOpen) e.currentTarget.style.background = 'none' }}
        >
          <span style={{
            fontFamily: t.serif,
            fontSize: 13,
            fontStyle: !mapTitle ? 'italic' : 'normal',
            color: mapTitle ? t.ink2 : t.inkFaint,
          }}>
            {chipLabel}
          </span>
          <span style={{ color: t.inkFaint, fontSize: 9, marginTop: 1 }}>▾</span>
        </button>

        {/* Preset selector */}
        <button
          ref={presetsBtnRef}
          onClick={() => setPresetsOpen(v => !v)}
          style={{
            height: '100%',
            padding: '0 13px',
            background: presetsOpen ? t.paper2 : 'none',
            border: 'none',
            borderRight: `1px solid ${t.line}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: t.sans,
            fontSize: 12,
            color: activePresetName ? t.ink2 : t.inkMute,
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (!presetsOpen) e.currentTarget.style.background = t.paper2 }}
          onMouseLeave={e => { if (!presetsOpen) e.currentTarget.style.background = 'none' }}
        >
          {activePresetName
            ? <>{activePresetName}{presetEdited && <span style={{ color: t.rust, fontSize: 10 }}> (edited)</span>}</>
            : 'Preset'
          }
          <span style={{ color: t.inkFaint, fontSize: 10 }}>▾</span>
        </button>
      </div>

      {/* Center: tabs */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
        {!hideTabs && TABS.map(tab => {
          const active = activePanel === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id as typeof activePanel)}
              style={{
                height: '100%',
                padding: '0 10px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${active ? t.rust : 'transparent'}`,
                cursor: 'pointer',
                fontFamily: t.sans,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? t.ink : t.inkMute,
                letterSpacing: 0.1,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Right: undo/redo + PRINT */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: `1px solid ${t.line}`, flexShrink: 0 }}>
        <IconBtn onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 6h8a4 4 0 010 8" /><path d="M4 3L1 6l3 3" />
          </svg>
        </IconBtn>
        <IconBtn onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 6H5a4 4 0 000 8" /><path d="M10 3l3 3-3 3" />
          </svg>
        </IconBtn>

        <div style={{ width: 1, background: t.line, margin: '8px 4px', flexShrink: 0 }} />

        {/* PRINT */}
        {printMenuOpen && (
          <div style={{
            position: 'fixed',
            top: t.topBarHeight,
            right: 0,
            background: t.paper,
            border: `1px solid ${t.line}`,
            borderTop: 'none',
            zIndex: 100,
            minWidth: 200,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            {[
              { mode: 'sheets' as const, label: 'Individual sheets', sub: 'One page per sheet, with bleed' },
              { mode: 'combined' as const, label: 'Single page', sub: 'Full map as one image' },
            ].map(({ mode, label, sub }) => (
              <button
                key={mode}
                onClick={() => handlePrint(mode)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', borderBottom: `1px solid ${t.line}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.paper2 }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                <div style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.ink }}>{label}</div>
                <div style={{ fontFamily: t.sans, fontSize: 10, color: t.inkFaint, marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        )}
        {printMenuOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setPrintMenuOpen(false)} />
        )}
        <button
          ref={printBtnRef}
          onClick={() => {
            if (exporting) return
            if (isMultiSheet) { setPrintMenuOpen(v => !v) }
            else handlePrint('sheets')
          }}
          disabled={exporting}
          style={{
            height: '100%',
            padding: '0 20px',
            background: exporting ? t.ink2 : t.ink,
            color: t.paper,
            border: 'none',
            cursor: exporting ? 'default' : 'pointer',
            fontFamily: t.sans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}
        >
          {exporting ? 'Exporting…' : isMultiSheet ? 'Print ▾' : 'Print ↗'}
        </button>
      </div>
    </div>
    </>
  )
}

function InfoRow({ label, value, t }: { label: string; value: string | number; t: ReturnType<typeof useTheme> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.5, color: t.inkFaint, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: t.mono, fontSize: 11, color: t.ink2 }}>{value}</span>
    </div>
  )
}

function MenuBtn({ onClick, children, t }: { onClick: () => void; children: React.ReactNode; t: ReturnType<typeof useTheme> }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '7px 10px',
        background: t.paper2,
        border: `1px solid ${t.line}`,
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: t.mono,
        fontSize: 10,
        letterSpacing: 0.3,
        color: t.ink2,
        textAlign: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = t.paper; e.currentTarget.style.borderColor = t.ink2 }}
      onMouseLeave={e => { e.currentTarget.style.background = t.paper2; e.currentTarget.style.borderColor = t.line }}
    >
      {children}
    </button>
  )
}

function IconBtn({ onClick, disabled, title, children }: {
  onClick: () => void; disabled: boolean; title: string; children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? t.inkFaint : t.ink2,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
