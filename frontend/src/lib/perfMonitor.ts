// Performance black-box recorder for draw() diagnostics.
// Exposes window.__ig2perf for live console inspection.

export interface DrawFrameRecord {
  t: number                // performance.now() at draw start
  ms: number               // total frame time
  rebuiltLayers: string[]  // which LayerCache instances actually rebuilt
  riverChainRebuilt: boolean
  bridgeChainRebuilt: boolean
  sectionMs: {
    setup: number          // _t0 → _tTerrain0
    terrain: number        // _tTerrain0 → _tRivers0
    rivers: number         // _tRivers0 → _tRoads0
    roads: number          // _tRoads0 → _tSettlements0
    settlements: number    // _tSettlements0 → _tEnd
  }
  // Time spent in drawImage() for each layer's blit — if a layer's blitMs is high
  // but its section compute time is low, the GPU is stalling (memory pressure).
  // If compute is high and blitMs is low, the algorithm itself is expensive.
  blitMs: {
    terrain: number
    hexBorder: number
    highlights: number
    rivers: number
    buildings: number
    roads: number
    settlements: number
  }
}

const RING_SIZE = 120
const ring: (DrawFrameRecord | undefined)[] = new Array(RING_SIZE).fill(undefined)
let head = 0

// Sliding window of draw timestamps for rate detection
const callWindow: number[] = []
const RATE_WINDOW_MS = 1000
// 120/sec = 2× the 60fps RAF budget. Anything above this means draw() is being
// called faster than requestAnimationFrame can deliver frames — a tight loop.
const RATE_ALARM_THRESHOLD = 120
let rateAlarmed = false

// --- Store set() call tracking ---
const storeSetWindow: number[] = []
let storeSetTotal = 0
let storeSetAlarmFrame = 0  // head value when last burst alarm fired

export function recordStoreSet(): void {
  const now = performance.now()
  storeSetTotal++
  let lo = 0
  while (lo < storeSetWindow.length && now - storeSetWindow[lo] > RATE_WINDOW_MS) lo++
  if (lo > 0) storeSetWindow.splice(0, lo)
  storeSetWindow.push(now)

  // Warn when store gets hit in a burst (>5 in the same ~16ms frame window)
  if (storeSetWindow.length >= 5) {
    const recentWindow = now - storeSetWindow[storeSetWindow.length - 5]
    if (recentWindow < 20 && head !== storeSetAlarmFrame) {
      storeSetAlarmFrame = head
      console.warn(
        `[ig2:perf] store burst: ${storeSetWindow.length} set() calls in last ${RATE_WINDOW_MS}ms` +
        ` (${storeSetWindow.length >= 5 ? recentWindow.toFixed(0) + 'ms for last 5' : ''})` +
        ' — check for batch violations (multiple set() calls in a loop).'
      )
    }
  }
}

export function getStoreSetRate(): number { return storeSetWindow.length }

// --- Per-layer rebuild rate tracking ---
const rebuildWindows: Record<string, number[]> = {}

export function recordLayerRebuild(layerName: string): void {
  const now = performance.now()
  if (!rebuildWindows[layerName]) rebuildWindows[layerName] = []
  const w = rebuildWindows[layerName]
  let lo = 0
  while (lo < w.length && now - w[lo] > RATE_WINDOW_MS) lo++
  if (lo > 0) w.splice(0, lo)
  w.push(now)
}

export function getLayerRebuildRate(layerName: string): number {
  return rebuildWindows[layerName]?.length ?? 0
}

function fmtBlit(b: DrawFrameRecord['blitMs']): string {
  const pairs = [
    ['T', b.terrain], ['HB', b.hexBorder], ['HL', b.highlights],
    ['R', b.rivers], ['Bld', b.buildings], ['Rd', b.roads], ['S', b.settlements],
  ] as [string, number][]
  return pairs.filter(([, v]) => v > 1).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ') || '<1ms each'
}

export function recordDrawFrame(r: DrawFrameRecord): void {
  ring[head % RING_SIZE] = r
  head++

  // Sliding window maintenance
  const now = r.t
  let lo = 0
  while (lo < callWindow.length && now - callWindow[lo] > RATE_WINDOW_MS) lo++
  if (lo > 0) callWindow.splice(0, lo)
  callWindow.push(now)
  const rate = callWindow.length

  // Slow-frame escalation — include blit breakdown to distinguish GPU stall vs compute
  if (r.ms > 100) {
    const { setup, terrain, rivers, roads, settlements } = r.sectionMs
    const rebuilt = r.rebuiltLayers.join(',') || 'none'
    console.error(
      `[ig2:perf] very slow frame ${r.ms.toFixed(0)}ms` +
      `  rebuilt=[${rebuilt}]` +
      `  riverChains=${r.riverChainRebuilt} bridgeChains=${r.bridgeChainRebuilt}\n` +
      `  setup=${setup.toFixed(0)} terrain=${terrain.toFixed(0)} rivers=${rivers.toFixed(0)}` +
      `  roads=${roads.toFixed(0)} settle=${settlements.toFixed(0)}\n` +
      `  blits: ${fmtBlit(r.blitMs)}`,
      '\nRecent context:', getRecent(10),
    )
  } else if (r.ms > 30) {
    const { terrain, rivers, roads, settlements } = r.sectionMs
    const rebuilt = r.rebuiltLayers.join(',') || 'none'
    console.warn(
      `[ig2:perf] slow frame ${r.ms.toFixed(0)}ms` +
      `  rebuilt=[${rebuilt}]` +
      `  terrain=${terrain.toFixed(0)} rivers=${rivers.toFixed(0)}` +
      `  roads=${roads.toFixed(0)} settle=${settlements.toFixed(0)}` +
      `  blits: ${fmtBlit(r.blitMs)}`,
    )
  }

  // Rate alarm — fires once, resets when rate drops to half threshold
  if (rate > RATE_ALARM_THRESHOLD && !rateAlarmed) {
    rateAlarmed = true
    console.error(
      `[ig2:perf] TIGHT LOOP: draw() called ${rate}× in last ${RATE_WINDOW_MS}ms` +
      ' (expected ≤120 for 60fps+hover).\n' +
      'Open Chrome DevTools → Performance and record while reproducing.\n' +
      'Or call window.__ig2perf.dump() to inspect the ring buffer.',
      '\nLast 20 frames:', getRecent(20),
    )
  } else if (rate <= RATE_ALARM_THRESHOLD * 0.5) {
    rateAlarmed = false
  }
}

export function getRecent(n = RING_SIZE): DrawFrameRecord[] {
  const count = Math.min(n, head)
  const out: DrawFrameRecord[] = []
  for (let i = head - count; i < head; i++) {
    const r = ring[i % RING_SIZE]
    if (r !== undefined) out.push(r)
  }
  return out
}

export interface DrawPerfState {
  frames: number
  fps: number
  lastSec: number
}

export interface FrameTimings {
  t0: number
  tEnd: number
  perfState: DrawPerfState
  rebuiltLayers: string[]
  dirtySnap: { rivers: boolean; bridges: boolean }
  sectionMs: { setup: number; terrain: number; rivers: number; roads: number; settlements: number }
  blitMs: DrawFrameRecord['blitMs']
  roadBreakdown: {
    buildings: number; roads: number; bridges: number; handles: number
    liveDataMs: string; rebuildMs: string; blitMs: string
  }
  pw: number; dpr: number; offZoom: number; zoom: number
}

export function finalizeDrawFrame(t: FrameTimings): void {
  const total = t.tEnd - t.t0

  // FPS counter (mutates perfState in place — caller holds the ref)
  t.perfState.frames++
  if (t.tEnd - t.perfState.lastSec >= 1000) {
    t.perfState.fps = t.perfState.frames
    t.perfState.frames = 0
    t.perfState.lastSec = t.tEnd
  }

  performance.measure('ig2:draw', { start: t.t0, end: t.tEnd, detail: { total } })

  recordDrawFrame({
    t: t.t0, ms: total,
    rebuiltLayers: t.rebuiltLayers,
    riverChainRebuilt: t.dirtySnap.rivers,
    bridgeChainRebuilt: t.dirtySnap.bridges,
    sectionMs: t.sectionMs,
    blitMs: t.blitMs,
  })

  if (total > 8) {
    const { terrain, rivers, roads, settlements } = t.sectionMs
    const dirty = Object.entries(t.dirtySnap).filter(([, v]) => v).map(([k]) => k).join('+') || 'none'
    const offW = Math.ceil(t.pw * t.dpr * t.offZoom), offH = Math.ceil(t.pw * t.dpr * t.offZoom)
    const { buildings, roads: rRoads, bridges, handles, liveDataMs, rebuildMs, blitMs: rBlit } = t.roadBreakdown
    console.warn(
      `[draw] ${total.toFixed(1)}ms (${t.perfState.fps}fps)` +
      `  rebuilt=[${t.rebuiltLayers.join(',') || 'none'}]` +
      `  terrain=${terrain.toFixed(1)} rivers=${rivers.toFixed(1)}` +
      `  roads=${roads.toFixed(1)}[bldg=${buildings.toFixed(1)} rdlayer=${rRoads.toFixed(1)} bridges=${bridges.toFixed(1)} handles=${handles.toFixed(1)}]` +
      `  settle=${settlements.toFixed(1)}` +
      `  dirty=${dirty}  targetCanvas=${offW}×${offH}` +
      `  zoom=${t.zoom.toFixed(2)} offZoom=${t.offZoom.toFixed(2)}` +
      `  roads_breakdown: liveData=${liveDataMs} rebuild=${rebuildMs} blit=${rBlit}`
    )
  }
}

if (typeof window !== 'undefined') {
  ;(window as any).__ig2perf = {
    /** Last N draw frame records (default: all 120). */
    dump: (n?: number) => getRecent(n),
    /** Draws observed in the last second. */
    get callsPerSec() { return callWindow.length },
    /** Store set() calls observed in the last second. */
    get storeSetPerSec() { return storeSetWindow.length },
    /** Total store set() calls since page load. */
    get storeSetTotal() { return storeSetTotal },
    /** Rebuilds/sec for a named layer (e.g. 'terrain', 'roads'). */
    layerRebuildRate: getLayerRebuildRate,
    /** Rebuild rates for all tracked layers. */
    get allRebuildRates() {
      return Object.fromEntries(Object.entries(rebuildWindows).map(([k, w]) => [k, w.length]))
    },
    /** Most recent frame record. */
    get lastFrame() { return head > 0 ? ring[(head - 1) % RING_SIZE] : null },
    /** Per-layer rebuild frequency + average frame time over the last N frames. */
    summary(n = 60) {
      const frames = getRecent(n)
      if (!frames.length) return 'no data'
      const counts: Record<string, number> = {}
      let totalMs = 0
      let slowCount = 0
      let riverRebuildCount = 0
      const avgBlit = { terrain: 0, hexBorder: 0, highlights: 0, rivers: 0, buildings: 0, roads: 0, settlements: 0 }
      for (const f of frames) {
        totalMs += f.ms
        if (f.ms > 30) slowCount++
        if (f.riverChainRebuilt) riverRebuildCount++
        for (const l of f.rebuiltLayers) counts[l] = (counts[l] ?? 0) + 1
        for (const k of Object.keys(avgBlit) as (keyof typeof avgBlit)[]) avgBlit[k] += f.blitMs[k]
      }
      for (const k of Object.keys(avgBlit) as (keyof typeof avgBlit)[]) avgBlit[k] = Math.round(avgBlit[k] / frames.length)
      return {
        frames: frames.length,
        avgMs: (totalMs / frames.length).toFixed(1) + 'ms',
        slowFrames: slowCount,
        callsPerSec: callWindow.length,
        rebuildsPerLayer: counts,
        riverChainRebuilds: riverRebuildCount,
        avgBlitMs: avgBlit,
      }
    },
    clear() {
      ring.fill(undefined)
      head = 0
      callWindow.length = 0
      rateAlarmed = false
    },
  }
}
