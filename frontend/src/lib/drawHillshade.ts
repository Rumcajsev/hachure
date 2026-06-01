/** Hillshade computation from a RG16-encoded heightmap.
 *  Pure canvas operations — no React or store imports. */

import type { HeightmapMeta } from '../store/slices/elevationSlice'

export type HillshadeParams = {
  azimuth: number   // degrees clockwise from north (0–360)
  altitude: number  // degrees above horizon (5–85)
  intensity: number // contrast exaggeration (0–1)
  mode: 'smooth' | 'hard'
}

export function computeHillshade(
  imgData: ImageData,
  meta: HeightmapMeta,
  params: HillshadeParams,
): OffscreenCanvas {
  const { width, height, data } = imgData
  const elevRange = meta.maxElev - meta.minElev
  const cellW = meta.widthM / width
  const cellH = meta.heightM / height

  // Decode RG16 → metres
  const elev = new Float32Array(width * height)
  for (let i = 0; i < elev.length; i++) {
    elev[i] = meta.minElev + (data[i * 4] * 256 + data[i * 4 + 1]) / 65535 * elevRange
  }

  // Sun vector in (east, north, up) space
  const az = (params.azimuth * Math.PI) / 180
  const alt = (params.altitude * Math.PI) / 180
  const lx = Math.sin(az) * Math.cos(alt)
  const ly = Math.cos(az) * Math.cos(alt)
  const lz = Math.sin(alt)

  // Flat terrain has shade = lz (the up-component of the sun vector).
  // For the overlay blend mode, gray=128 is neutral (no change to base layer).
  // We normalise so flat terrain → 128, shadowed → 0, fully lit → 255.
  // Below flat: map [0, flatShade] → [0, 128]
  // Above flat: map [flatShade, 1] → [128, 255]
  const flatShade = lz  // sin(altitude)
  const shadowScale  = flatShade > 0 ? 128 / flatShade : 128
  const highlightScale = flatShade < 1 ? 127 / (1 - flatShade) : 127

  // intensity shrinks the effect toward neutral (128) on both sides
  const t = params.intensity

  const out = new OffscreenCanvas(width, height)
  const ctx = out.getContext('2d')!
  const outImgData = ctx.createImageData(width, height)
  const od = outImgData.data

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x

      // Central-difference gradient; row 0 = north, so y-1 is more north
      const zl = elev[y * width + Math.max(0, x - 1)]
      const zr = elev[y * width + Math.min(width - 1, x + 1)]
      const zu = elev[Math.max(0, y - 1) * width + x]
      const zd = elev[Math.min(height - 1, y + 1) * width + x]

      const dzdx = (zr - zl) / (2 * cellW)
      const dzdy = (zu - zd) / (2 * cellH)

      // Surface normal = t_east × t_north = (-dzdx, -dzdy, 1)
      const nx = -dzdx
      const ny = -dzdy
      const nz = 1.0
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)

      const shade = Math.max(0, Math.min(1, nx / len * lx + ny / len * ly + nz / len * lz))

      // Normalise around flat=128 so overlay blend is centred on neutral
      const raw128 = shade < flatShade
        ? shade * shadowScale
        : 128 + (shade - flatShade) * highlightScale

      let gray: number
      if (params.mode === 'hard') {
        // Shadow side → flat dark; lit side → neutral (no highlight)
        gray = raw128 < 128 ? Math.round(128 * (1 - t)) : 128
      } else {
        // Blend toward 128 (neutral) by (1 - intensity)
        gray = Math.round(128 + (raw128 - 128) * t)
      }

      od[idx * 4]     = gray
      od[idx * 4 + 1] = gray
      od[idx * 4 + 2] = gray
      od[idx * 4 + 3] = 255
    }
  }

  ctx.putImageData(outImgData, 0, 0)
  return out
}
