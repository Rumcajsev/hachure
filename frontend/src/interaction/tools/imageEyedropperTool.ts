import type { MutableRefObject } from 'react'
import type { ImageTransform } from '../../store/slices/mapImageSlice'
import { canvasPointToImagePixel, sampleAveragedPixel, rgbToHex } from '../../lib/imageCoverageSample'
import { ensureMapImageData } from '../../lib/decodedMapImage'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }

export interface ImageEyedropperRefs {
  activeToolRef: MutableRefObject<{ type: string; target?: string; tier?: 0 | 1 | 2 }>
  mapImageDataUrlRef: MutableRefObject<string | null>
  mapImageTransformRef: MutableRefObject<ImageTransform>
  addImageSwatchRef: MutableRefObject<(color: string, tolerance?: number) => number>
  addRoadImageSwatchRef: MutableRefObject<(color: string, tolerance?: number, tier?: 0 | 1 | 2 | null) => number>
  setRoadImagePreviewRef: MutableRefObject<(swatchId: number | null, phase: 'raw' | 'traced' | null) => void>
  clientToLogical: LogicalFn
  getPaper: GetPaperFn
}

export function attachImageEyedropperHandlers(el: HTMLElement, refs: ImageEyedropperRefs): () => void {
  const { activeToolRef, mapImageDataUrlRef, mapImageTransformRef, addImageSwatchRef, addRoadImageSwatchRef, setRoadImagePreviewRef, clientToLogical, getPaper } = refs

  const onDown = async (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    if (activeToolRef.current.type !== 'image-eyedropper') return
    const target = activeToolRef.current.target ?? 'terrain'
    const tier = activeToolRef.current.tier ?? null
    const url = mapImageDataUrlRef.current
    if (!url) return
    const logical = clientToLogical(e.clientX, e.clientY)
    if (!logical) return
    const { lx, ly, cssW, cssH } = logical
    const { pw, ph, px, py } = getPaper(cssW, cssH)
    const imgData = await ensureMapImageData(url)
    const pt = canvasPointToImagePixel(lx, ly, mapImageTransformRef.current, imgData.width, imgData.height, px, py, pw, ph)
    if (!pt) return
    const [r, g, b] = sampleAveragedPixel(imgData, pt.u, pt.v)
    const color = rgbToHex(r, g, b)
    if (target === 'road') {
      const id = addRoadImageSwatchRef.current(color, undefined, tier)
      setRoadImagePreviewRef.current(id, 'raw')
    } else addImageSwatchRef.current(color)
  }

  el.addEventListener('mousedown', onDown)
  return () => el.removeEventListener('mousedown', onDown)
}
