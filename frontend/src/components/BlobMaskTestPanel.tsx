import { useState } from 'react'
import type { GridMetadata, BlobMaskEdit, ActiveTool } from '../store/mapStore'

type Props = {
  meta: GridMetadata
  blobMaskEdits: BlobMaskEdit[]
  activeTool: ActiveTool
  setActiveTool: (t: ActiveTool) => void
  onRemove: (id: string) => void
  onClear: (terrain?: string) => void
}

export function BlobMaskTestPanel({ blobMaskEdits, activeTool, setActiveTool, onRemove, onClear }: Props) {
  const [terrain, setTerrain] = useState('woods')
  const [open, setOpen] = useState(false)

  const isBlobMask = activeTool.type === 'blob-mask'
  const activeMode = isBlobMask ? (activeTool as Extract<ActiveTool, { type: 'blob-mask' }>).mode : null

  const activate = (mode: 'add' | 'subtract') => {
    if (isBlobMask && activeMode === mode) {
      setActiveTool({ type: 'none' })
    } else {
      setActiveTool({ type: 'blob-mask', mode, terrain })
    }
  }

  const btn = (active = false, danger = false): React.CSSProperties => ({
    padding: '5px 10px', border: `1px solid ${active ? '#aaa' : '#555'}`, borderRadius: 3,
    background: active ? (danger ? '#5a2020' : '#2a4a3a') : '#2a2a3a',
    color: active ? '#fff' : '#bbb', fontSize: 11, cursor: 'pointer',
    fontFamily: 'monospace', outline: active ? `1px solid ${danger ? '#f88' : '#8f8'}` : 'none',
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ ...btn(isBlobMask), position: 'absolute', bottom: 12, left: 12, zIndex: 100, opacity: 0.8 }}
      >
        {isBlobMask ? `● blob mask (${activeMode})` : 'blob mask'}
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 100,
      background: '#1e1e2e', border: '1px solid #444', borderRadius: 6,
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
      fontFamily: 'monospace', fontSize: 11, color: '#ccc', minWidth: 230,
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: '#fff', fontSize: 12 }}>Blob mask</span>
        <button onClick={() => { setOpen(false); if (isBlobMask) setActiveTool({ type: 'none' }) }}
          style={{ ...btn(), padding: '1px 6px' }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ color: '#888' }}>terrain</span>
        <input
          value={terrain}
          onChange={e => {
            setTerrain(e.target.value)
            if (isBlobMask) setActiveTool({ type: 'blob-mask', mode: activeMode!, terrain: e.target.value })
          }}
          style={{ ...btn(), cursor: 'text', flex: 1, padding: '3px 5px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button style={btn(activeMode === 'add')} onClick={() => activate('add')}>
          {activeMode === 'add' ? '● ' : ''}+ add region
        </button>
        <button style={btn(activeMode === 'subtract', true)} onClick={() => activate('subtract')}>
          {activeMode === 'subtract' ? '● ' : ''}− subtract
        </button>
      </div>

      {isBlobMask && (
        <div style={{ color: '#888', fontSize: 10, lineHeight: 1.4 }}>
          {activeMode === 'subtract'
            ? 'Draw a stroke across the blob to cut it. Width scales with map size.'
            : 'Draw a closed shape to add to the blob.'}
        </div>
      )}

      <div style={{ borderTop: '1px solid #333', paddingTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#666' }}>{blobMaskEdits.length} edit{blobMaskEdits.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        {blobMaskEdits.length > 0 && (
          <button style={{ ...btn(false, true), color: '#f88' }} onClick={() => onClear()}>clear all</button>
        )}
      </div>

      {blobMaskEdits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
          {blobMaskEdits.map(e => (
            <div key={e.id} style={{ display: 'flex', gap: 4, alignItems: 'center', color: '#aaa' }}>
              <span style={{ color: e.type === 'add' ? '#8f8' : '#f88', minWidth: 10 }}>
                {e.type === 'add' ? '+' : '−'}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.terrain}</span>
              <button style={{ ...btn(), padding: '0 5px', fontSize: 10 }} onClick={() => onRemove(e.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
