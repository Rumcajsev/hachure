/** Module-singleton decode cache for the aligned historical map image, shared by
 *  the eyedropper tool and the coverage-sampling classification action so neither
 *  depends on the other's lifecycle (and the image is only decoded once per URL). */

let cache: { url: string; data: ImageData } | null = null
let pending: { url: string; promise: Promise<ImageData> } | null = null

export function getCachedMapImageData(url: string): ImageData | null {
  return cache && cache.url === url ? cache.data : null
}

export function ensureMapImageData(url: string): Promise<ImageData> {
  if (cache && cache.url === url) return Promise.resolve(cache.data)
  if (pending && pending.url === url) return pending.promise

  const promise = new Promise<ImageData>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('OffscreenCanvas 2d context unavailable')); return }
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight)
      cache = { url, data }
      pending = null
      resolve(data)
    }
    img.onerror = () => { pending = null; reject(new Error('Failed to load map image')) }
    img.src = url
  })
  pending = { url, promise }
  return promise
}
