import { useEffect } from 'react'
import { useMapStore } from '../store/mapStore'
import { FlyoutContainer, FlyoutHeader, SliderRow } from './ui'

interface Props {
  anchorY: number
  onClose: () => void
}

export function ElevationFlyout({ anchorY, onClose }: Props) {
  const {
    generatedHexes,
    elevationStatus,
    elevationError,
    elevationProgress,
    showElevationDebug,
    classificationParams,
    fetchElevation,
    setShowElevationDebug,
    setClassificationParam,
    dataSource,
  } = useMapStore()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-elevation-flyout]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const hasData = generatedHexes.some(h => h.elevation_avg_m != null)
  const fetchedCount = generatedHexes.filter(h => h.elevation_avg_m != null).length
  const isLoading = elevationStatus === 'loading'
  const noHexes = generatedHexes.length === 0

  const flatCount = hasData ? generatedHexes.filter(h => h.elevation_class === 'flat').length : 0
  const hillsCount = hasData ? generatedHexes.filter(h => h.elevation_class === 'hills').length : 0
  const mountainsCount = hasData ? generatedHexes.filter(h => h.elevation_class === 'mountains').length : 0
  return (
    <FlyoutContainer
      top={Math.min(anchorY, window.innerHeight - 48)}
      scrollable
      width={220}
      data-elevation-flyout=""
    >
      <FlyoutHeader title="Elevation" onClose={onClose} />

      {/* Fetch */}
      {dataSource === 'osm' && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => fetchElevation()}
            disabled={isLoading || noHexes}
            style={{
              width: '100%', padding: '4px 0', marginBottom: 4,
              background: 'none',
              border: `1px solid ${isLoading ? '#2a2a4a' : '#3a6a9a'}`,
              color: isLoading ? '#3a3a5a' : '#5a9aba',
              borderRadius: 3,
              cursor: isLoading || noHexes ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: elevationStatus === 'done' ? '#5a9e6f'
                : elevationStatus === 'loading' ? '#a0a060'
                : elevationStatus === 'error' ? '#9e5a5a'
                : '#3a3a5a',
            }} />
            {isLoading ? 'Fetching…' : 'Fetch Elevation'}
          </button>

          {isLoading && elevationProgress && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ height: 2, background: '#1e1f2e', borderRadius: 1, marginBottom: 3 }}>
                <div style={{
                  height: '100%', borderRadius: 1, background: '#3a6a9a',
                  width: `${elevationProgress.progress}%`, transition: 'width 0.2s',
                }} />
              </div>
              <div style={{ fontSize: 10, color: '#4a4a6a' }}>{elevationProgress.message}</div>
            </div>
          )}

          {elevationStatus === 'error' && elevationError && (
            <div style={{ fontSize: 10, color: '#9e5a5a' }}>{elevationError}</div>
          )}

          {elevationStatus === 'done' && (
            <div style={{ fontSize: 10, color: '#4a4a6a' }}>
              {fetchedCount} / {generatedHexes.length} hexes
            </div>
          )}
        </div>
      )}

      {/* Classification */}
      {hasData && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 6 }}>
            Classification
          </div>

          <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 4 }}>Relief (internal range)</div>
          <SliderRow label="Hills ≥" value={classificationParams.rangeHillsM} min={10} max={500} step={10} unit="m" onChange={v => setClassificationParam('rangeHillsM', v)} />
          <SliderRow label="Mountains ≥" value={classificationParams.rangeMountainsM} min={50} max={1000} step={25} unit="m" onChange={v => setClassificationParam('rangeMountainsM', v)} />
          <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#4a4a6a', marginBottom: 4, marginTop: 6 }}>Altitude (median)</div>
          <SliderRow label="Hills ≥" value={classificationParams.medianHillsM} min={0} max={2000} step={50} unit="m" onChange={v => setClassificationParam('medianHillsM', v)} />
          <SliderRow label="Mountains ≥" value={classificationParams.medianMountainsM} min={100} max={4000} step={50} unit="m" onChange={v => setClassificationParam('medianMountainsM', v)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10, textAlign: 'center' }}>
            {[
              { label: 'Flat', count: flatCount, color: '#5a7a5a' },
              { label: 'Hills', count: hillsCount, color: '#7a8a5a' },
              { label: 'Mtns', count: mountainsCount, color: '#8a6a3a' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ background: '#12131e', borderRadius: 3, padding: '4px 2px' }}>
                <div style={{ color, marginBottom: 1 }}>{label}</div>
                <div style={{ color: '#5a5a7a' }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug */}
      {hasData && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
          <input
            type="checkbox"
            checked={showElevationDebug}
            onChange={e => setShowElevationDebug(e.target.checked)}
            style={{ accentColor: '#3a6a9a' }}
          />
          <span style={{ color: '#6a6a8a' }}>Show avg / max per hex</span>
        </label>
      )}
    </FlyoutContainer>
  )
}
