export type BlobPresetId = 'basic' | 'organic' | 'spill-out' | 'textured'

export type BlobPresetValues = {
  smooth: number
  offset: number
  bump: number
  sweepFreq: number
  lobeFreq: number
  lobeAmp: number
  lobeThreshold: number
  lobeDirection: number
}

export const BLOB_PRESETS: Record<BlobPresetId, { label: string; values: BlobPresetValues }> = {
  basic: {
    label: 'Basic',
    values: { smooth: 0, offset: 0, bump: 0, sweepFreq: 0.40, lobeFreq: 2.0, lobeAmp: 0, lobeThreshold: 0, lobeDirection: -1 },
  },
  organic: {
    label: 'Organic',
    values: { smooth: 0, offset: -0.10, bump: 0.40, sweepFreq: 0.50, lobeFreq: 3.0, lobeAmp: 0.50, lobeThreshold: 0, lobeDirection: -1 },
  },
  'spill-out': {
    label: 'Spill Out',
    values: { smooth: 0, offset: 0.10, bump: 0.25, sweepFreq: 0.45, lobeFreq: 4.0, lobeAmp: 0.20, lobeThreshold: 0, lobeDirection: -1 },
  },
  textured: {
    label: 'Textured',
    values: { smooth: 2, offset: 0, bump: 0.40, sweepFreq: 0.90, lobeFreq: 3.2, lobeAmp: 0.85, lobeThreshold: 0.10, lobeDirection: -1 },
  },
}

export const BLOB_PRESET_ORDER: BlobPresetId[] = ['basic', 'organic', 'spill-out', 'textured']
