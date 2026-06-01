import { useState, useRef, useMemo, useCallback } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useTheme } from '../../context/ThemeContext'
import { PresetsDropdown } from '../PresetsPanel'
import { BUILTIN_PRESET_MAP, isPresetEdited } from '../../lib/stylePreset'

const TABS = [
  { id: 'terrain',     label: 'Terrain'     },
  { id: 'rivers',      label: 'Rivers'      },
  { id: 'roads',       label: 'Roads'       },
  { id: 'settlements', label: 'Settlements' },
  { id: 'highlights',  label: 'Overlays'    },
  { id: 'display',     label: 'Display'     },
] as const

export function EditorTopBar({ onExportPDF, onGoHome }: { onExportPDF: () => Promise<void>; onGoHome: () => void }) {
  const t = useTheme()
  const {
    paperSize, generatedHexes, generatedMetadata,
    undoStack, redoStack, undo, redo,
    activePanel, setActivePanel,
    saveProject, restoreProject,
    mapTitle, setMapTitle,
    activePresetId,
  } = useMapStore()
  const presetEdited = useMapStore(s => isPresetEdited(s, s.activePresetId))

  const [exporting, setExporting] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const presetsBtnRef = useRef<HTMLButtonElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startEditTitle = useCallback(() => {
    setTitleDraft(mapTitle)
    setEditingTitle(true)
  }, [mapTitle])

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim()
    if (trimmed) setMapTitle(trimmed)
    setEditingTitle(false)
  }, [titleDraft, setMapTitle])

  const handlePrint = async () => {
    setExporting(true)
    try { await onExportPDF() } finally { setExporting(false) }
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

  const meta = useMemo(() => {
    if (!generatedHexes.length) return null
    const qs = generatedHexes.map(h => h.q)
    const rs = generatedHexes.map(h => h.r)
    const cols = Math.max(...qs) - Math.min(...qs) + 1
    const rows = Math.max(...rs) - Math.min(...rs) + 1
    const count = generatedMetadata?.hex_count ?? generatedHexes.length
    return `${paperSize} · ${cols} × ${rows} · ${count} hex`
  }, [generatedHexes, generatedMetadata, paperSize])

  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  const activePresetName = activePresetId ? (BUILTIN_PRESET_MAP[activePresetId]?.name ?? null) : null

  return (
    <>
    {presetsOpen && <PresetsDropdown anchorRef={presetsBtnRef} onClose={() => setPresetsOpen(false)} />}
    <div style={{
      height: t.topBarHeight,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'stretch',
      background: t.paper,
      borderBottom: `1px solid ${t.line}`,
      userSelect: 'none',
    }}>

      {/* Left: wordmark + metadata + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderRight: `1px solid ${t.line}`, flexShrink: 0 }}>
        <button
          onClick={onGoHome}
          title="Back to home"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/icon.png" alt="" style={{ height: 28, display: 'block' }} />
            <span style={{ fontFamily: t.serif, fontSize: 17, fontWeight: 400, color: t.ink }}>Hachure</span>
          </div>
        </button>
        {meta && (
          <>
            <span style={{ color: t.line, fontSize: 12 }}>|</span>
            <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkFaint, letterSpacing: 0.4 }}>{meta}</span>
          </>
        )}
        {(mapTitle || meta) && (
          <>
            <span style={{ color: t.line, fontSize: 12 }}>|</span>
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
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: t.ink,
                  background: t.paper2,
                  border: `1px solid ${t.rust}`,
                  outline: 'none',
                  padding: '2px 6px',
                  width: 200,
                }}
              />
            ) : (
              <button
                onClick={startEditTitle}
                title="Click to rename"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px 4px',
                  cursor: 'text',
                  fontFamily: t.serif,
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: mapTitle ? t.ink2 : t.inkFaint,
                  borderRadius: 2,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.paper2 }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                {mapTitle || 'Untitled'}
              </button>
            )}
          </>
        )}

        {/* Preset chip — sits right after the title */}
        <span style={{ color: t.line, fontSize: 12 }}>|</span>
        <button
          ref={presetsBtnRef}
          onClick={() => setPresetsOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: presetsOpen ? t.paper2 : 'none',
            border: 'none', borderRadius: 3, padding: '3px 7px',
            cursor: 'pointer', fontFamily: t.sans, fontSize: 12,
            color: activePresetName ? t.ink2 : t.inkMute,
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (!presetsOpen) e.currentTarget.style.background = t.paper2 }}
          onMouseLeave={e => { if (!presetsOpen) e.currentTarget.style.background = 'none' }}
        >
          {activePresetName
            ? <>
                {activePresetName}
                {presetEdited && <span style={{ color: t.rust, fontSize: 10 }}> (edited)</span>}
              </>
            : 'Preset'
          }
          <span style={{ color: t.inkFaint, fontSize: 10 }}>▾</span>
        </button>
      </div>

      {/* Center: tabs */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
        {TABS.map(tab => {
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

      {/* Right: save/load + undo/redo + PRINT */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: `1px solid ${t.line}`, flexShrink: 0 }}>
        {/* Save / Load */}
        <button onClick={saveProject} style={ghostBtnStyle(t)}>Save</button>
        <button onClick={() => fileInputRef.current?.click()} style={ghostBtnStyle(t)}>Load</button>
        <input ref={fileInputRef} type="file" accept=".ig2,.json" style={{ display: 'none' }} onChange={handleLoad} />

        <div style={{ width: 1, background: t.line, margin: '8px 4px', flexShrink: 0 }} />

        {/* Undo / Redo */}
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
        <button
          onClick={handlePrint}
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
          {exporting ? 'Exporting…' : 'Print ↗'}
        </button>
      </div>
    </div>
    </>
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

function ghostBtnStyle(t: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    padding: '0 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: t.mono,
    fontSize: 9.5,
    letterSpacing: 0.4,
    color: t.inkMute,
  }
}
