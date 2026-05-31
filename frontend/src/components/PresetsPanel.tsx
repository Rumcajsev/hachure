import { useRef, useState, useEffect } from 'react'
import { useMapStore } from '../store/mapStore'
import { BUILTIN_PRESETS, isPresetEdited } from '../lib/stylePreset'
import { useTheme } from '../context/ThemeContext'

interface Props {
  anchorRef: React.RefObject<HTMLElement>
  onClose: () => void
}

export function PresetsDropdown({ anchorRef, onClose }: Props) {
  const t = useTheme()
  const {
    userPresets, activePresetId,
    savePreset, loadPreset, loadBuiltinPreset,
    deletePreset, exportPreset, importPresetData,
  } = useMapStore()
  const presetEdited = useMapStore(s => isPresetEdited(s, s.activePresetId))

  const [saveName, setSaveName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const anchorRect = anchorRef.current?.getBoundingClientRect()
  const top = anchorRect ? anchorRect.bottom + 4 : 48
  const left = anchorRect ? anchorRect.left : 0

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [anchorRef, onClose])

  const handleSave = () => {
    if (!saveName.trim()) return
    savePreset(saveName)
    setSaveName('')
  }

  const handleLoad = (id: string) => {
    loadPreset(id)
    setLoadedId(id)
    setTimeout(() => setLoadedId(null), 1500)
    onClose()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        const err = importPresetData(data)
        setImportError(err)
        if (err) setTimeout(() => setImportError(null), 3000)
      } catch {
        setImportError('Invalid file format')
        setTimeout(() => setImportError(null), 3000)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const sortedUser = [...userPresets].sort((a, b) => b.createdAt - a.createdAt)

  const divider = <div style={{ height: 1, background: t.line2, margin: '4px 0' }} />

  const sectionTitle = (label: string) => (
    <div style={{
      padding: '8px 14px 4px',
      fontSize: 10,
      letterSpacing: 0.8,
      color: t.inkFaint,
      textTransform: 'uppercase',
      fontFamily: t.mono,
    }}>{label}</div>
  )

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 2000,
        width: 280,
        maxHeight: 'calc(100vh - 80px)',
        display: 'flex',
        flexDirection: 'column',
        background: t.paper,
        border: `1px solid ${t.line}`,
        borderRadius: 4,
        fontFamily: t.sans,
        fontSize: 13,
        color: t.ink,
        boxShadow: t.shadowFlyout,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* ── Style presets ── */}
        {sectionTitle('Style')}
        {BUILTIN_PRESETS.map(preset => {
          const isActive = activePresetId === preset.id
          return (
            <button
              key={preset.id}
              onClick={() => { loadBuiltinPreset(preset.id); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px',
                background: isActive ? t.rustTint : 'none',
                border: 'none', borderBottom: `1px solid ${t.line2}`,
                cursor: 'pointer', fontFamily: t.sans, fontSize: 13,
                color: isActive ? t.rust : t.ink, textAlign: 'left',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.paper2 }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}
            >
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {preset.swatches.map((c, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c, border: `1px solid ${t.line}` }} />
                ))}
              </div>
              <span style={{ flex: 1, fontWeight: isActive ? 600 : 400 }}>{preset.name}</span>
              <span style={{ fontSize: 11, color: isActive ? t.rust : t.inkFaint }}>
                {isActive && presetEdited ? 'edited' : isActive ? '✓' : ''}
              </span>
            </button>
          )
        })}

        {activePresetId && presetEdited && (
          <button
            onClick={() => { loadBuiltinPreset(activePresetId); onClose() }}
            style={{
              display: 'block', width: '100%', padding: '5px 14px',
              background: 'none', border: 'none', borderBottom: `1px solid ${t.line2}`,
              color: t.inkMute, cursor: 'pointer', fontFamily: t.sans, fontSize: 11, textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = t.ink }}
            onMouseLeave={e => { e.currentTarget.style.color = t.inkMute }}
          >↺ Revert style to preset defaults</button>
        )}

        {/* ── User presets ── */}
        {sortedUser.length > 0 && (
          <>
            {divider}
            {sectionTitle('My presets')}
            {sortedUser.map(entry => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${t.line2}` }}>
                <button
                  onClick={() => handleLoad(entry.id)}
                  style={{
                    flex: 1, padding: '7px 14px', background: 'none', border: 'none',
                    color: loadedId === entry.id ? t.rust : t.ink,
                    cursor: 'pointer', fontFamily: t.sans, fontSize: 13, textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = t.paper2 }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                  {loadedId === entry.id ? '✓ ' : ''}{entry.name}
                </button>
                <button onClick={() => exportPreset(entry.id)} style={iconBtn(t)} title="Export">↓</button>
                <button onClick={() => deletePreset(entry.id)} style={iconBtn(t)}>×</button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Save as ── */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${t.line}`, flexShrink: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: 0.8, color: t.inkFaint, textTransform: 'uppercase', fontFamily: t.mono, marginBottom: 6 }}>
          Save current as
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="Name…"
            style={{
              flex: 1, background: t.paper2, border: `1px solid ${t.line}`, borderRadius: 3,
              color: t.ink, fontFamily: t.sans, fontSize: 12, padding: '5px 8px', outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            style={{
              padding: '5px 12px', borderRadius: 3, fontFamily: t.sans, fontSize: 12, flexShrink: 0,
              background: saveName.trim() ? t.rust : t.paper2,
              border: `1px solid ${saveName.trim() ? t.rust : t.line}`,
              color: saveName.trim() ? '#fff' : t.inkFaint,
              cursor: saveName.trim() ? 'pointer' : 'default',
            }}
          >Save</button>
        </div>
      </div>

      {/* ── Import ── */}
      <div style={{ padding: '5px 14px 10px', borderTop: `1px solid ${t.line2}`, flexShrink: 0 }}>
        <input ref={fileInputRef} type="file" accept=".ig2style,.json" style={{ display: 'none' }} onChange={handleImportFile} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '100%', padding: '5px 0', background: 'none', border: `1px solid ${t.line}`,
            borderRadius: 3, color: t.inkMute, cursor: 'pointer', fontFamily: t.sans, fontSize: 11,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = t.ink; e.currentTarget.style.borderColor = t.inkMute }}
          onMouseLeave={e => { e.currentTarget.style.color = t.inkMute; e.currentTarget.style.borderColor = t.line }}
        >Import from file…</button>
        {importError && <div style={{ marginTop: 5, color: t.rust, fontSize: 11 }}>{importError}</div>}
      </div>
    </div>
  )
}

function iconBtn(t: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    background: 'none', border: 'none', color: t.inkFaint, cursor: 'pointer',
    fontFamily: t.sans, fontSize: 13, padding: '7px 8px', flexShrink: 0,
  }
}
