import type { ClassificationParams } from '../store/mapStore'

export const liveClassParamsRef: { current: ClassificationParams | null } = { current: null }
export const requestDraw = { fn: null as (() => void) | null }
