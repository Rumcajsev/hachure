import { useEffect } from 'react'
import { useMapStore } from '../store/mapStore'
import { FlyoutContainer, FlyoutHeader, SliderRow } from './ui'

interface Props {
  anchorY: number
  onClose: () => void
}

export function EdgeBlobShapeFlyout({ anchorY, onClose }: Props) {
  const { edgeBlobWidth, setEdgeBlobWidth } = useMapStore()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-edge-blob-shape-flyout]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const ac = '#7a9e7a'

  return (
    <FlyoutContainer top={Math.min(anchorY, window.innerHeight - 48)} scrollable data-edge-blob-shape-flyout="">
      <FlyoutHeader title="Edge blob shape" onClose={onClose} />
      <SliderRow label="Width" value={`${Math.round(edgeBlobWidth * 100)}%`}>
        <input type="range" min={5} max={80} step={1} value={Math.round(edgeBlobWidth * 100)}
          onChange={e => setEdgeBlobWidth(Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: ac }} />
      </SliderRow>
    </FlyoutContainer>
  )
}
