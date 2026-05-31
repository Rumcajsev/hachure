import { useEffect } from 'react'
import { useMapStore } from '../store/mapStore'
import { FlyoutContainer, FlyoutHeader, SliderRow } from './ui'

const ROAD_TIER_LABELS: Record<string, string> = { '0': 'Tier 0 — major', '1': 'Tier 1', '2': 'Tier 2 — minor' }

const CUT_TERRAINS = [
  { key: 'woods',       label: 'Woods' },
  { key: 'light_woods', label: 'Light woods' },
  { key: 'marsh',       label: 'Marsh' },
  { key: 'rough',       label: 'Rough' },
  { key: 'clear',       label: 'Clear' },
]

interface Props {
  anchorY: number
  onClose: () => void
}

export function BlobCutsFlyout({ anchorY, onClose }: Props) {
  const {
    blobCutsEnabled, setBlobCutsEnabled,
    blobCutBuffer, setBlobCutBuffer,
    blobCutRoadTiers, setBlobCutRoadTier,
    blobCutRiverEnabled, setBlobCutRiverEnabled,
    blobCutCanalEnabled, setBlobCutCanalEnabled,
    blobCutTerrains, setBlobCutTerrains,
  } = useMapStore()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-blob-cuts-flyout]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const toggleTerrain = (key: string, on: boolean) => {
    const next = on
      ? [...blobCutTerrains, key]
      : blobCutTerrains.filter(t => t !== key)
    setBlobCutTerrains(next)
  }

  const disabled = !blobCutsEnabled

  return (
    <FlyoutContainer top={Math.min(anchorY, window.innerHeight - 48)} scrollable data-blob-cuts-flyout="">
      <FlyoutHeader title="Road & River Cuts" onClose={onClose} />

      {/* Master toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 10px' }}>
        <span style={{ fontSize: 11, color: '#a0a0c0' }}>Enable cuts</span>
        <input type="checkbox" checked={blobCutsEnabled} onChange={e => setBlobCutsEnabled(e.target.checked)} />
      </div>

      <div style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Buffer */}
        <SliderRow label="Buffer" value={Math.round(blobCutBuffer * 100)} min={0} max={80} step={1}
          onChange={v => setBlobCutBuffer(v / 100)}>
          <span style={{ fontSize: 10, color: '#5a5a7a' }}>{Math.round(blobCutBuffer * 100)}%R</span>
        </SliderRow>

        {/* Roads */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 6 }}>Roads</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {['0', '1', '2'].map(tier => (
              <label key={tier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#a0a0c0', cursor: 'pointer' }}>
                <span>{ROAD_TIER_LABELS[tier]}</span>
                <input type="checkbox" checked={blobCutRoadTiers[tier] ?? false}
                  onChange={e => setBlobCutRoadTier(tier, e.target.checked)} />
              </label>
            ))}
          </div>
        </div>

        {/* Rivers & Canals */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 6 }}>Rivers & Canals</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#a0a0c0', cursor: 'pointer' }}>
              <span>Rivers</span>
              <input type="checkbox" checked={blobCutRiverEnabled} onChange={e => setBlobCutRiverEnabled(e.target.checked)} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#a0a0c0', cursor: 'pointer' }}>
              <span>Canals</span>
              <input type="checkbox" checked={blobCutCanalEnabled} onChange={e => setBlobCutCanalEnabled(e.target.checked)} />
            </label>
          </div>
        </div>

        {/* Terrain types */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 6 }}>Terrain types</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {CUT_TERRAINS.map(({ key, label }) => {
              const on = blobCutTerrains.includes(key)
              return (
                <label key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#a0a0c0', cursor: 'pointer' }}>
                  <span>{label}</span>
                  <input type="checkbox" checked={on} onChange={e => toggleTerrain(key, e.target.checked)} />
                </label>
              )
            })}
          </div>
        </div>

      </div>
    </FlyoutContainer>
  )
}
