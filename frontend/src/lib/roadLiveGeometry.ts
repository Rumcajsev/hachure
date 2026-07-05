/**
 * Live drag geometry for roads, rails, and rivers.
 *
 * draw() is not allowed to call buildRoadChains/buildRailChains/buildRiverChainsV2
 * inline — this module owns all live-drag geometry computation and projection caching.
 */
import { buildRoadChains } from './roadChains'
import type { RoadBaseData, RoadTierGeomMap } from './roadChains'
import { buildRailChains, applyRailWiggle } from './railChains'
import type { RailBaseData } from './railChains'
import type { RailNetwork } from './railNetwork'
import { buildRiverChainsV2 } from './riverChains'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DenseDragPt = {
  id: string
  handleIdx: number
  handles: [number, number][]
  kind: 'road' | 'rail' | 'river'
}

export interface DragLiveInput {
  dragLiveOverride: Record<string, [number, number]>
  draggingDensePt: DenseDragPt | null
  dragLiveDensePos: [number, number] | null
  draggingCpKind: string | null

  roadNetwork: { getBaseData(wa: number, wf: number, sp: any, hp: any, t: number): RoadBaseData }
  roadEdges: { q1: number; r1: number; q2: number; r2: number; tier: 0 | 1 | 2 }[]
  hexIdx: Map<string, { center: [number, number] }>
  roadControlOverrides: Record<string, [number, number]>
  roadChainOverrides: Record<string, [number, number][]>
  roadWiggleAmp: number
  roadWiggleFreq: number
  roadSmoothing: number
  roadPathSmoothing: number
  roadSegmentProps: any
  roadHopProps: any
  roadTierGeometry: (object | null)[]
  roadCenterPull: number

  railEdges: { q1: number; r1: number; q2: number; r2: number }[]
  railControlOverrides: Record<string, [number, number]>
  railNetwork: RailNetwork
  railSmoothing: number
  railPathSmoothing: number
  railWiggleAmp: number
  railWiggleFreq: number
  railWiggleDragging: boolean
  railSegmentProps: any
  railHopProps: any
  railGeomOverride: { smoothing?: number; pathSmoothing?: number } | null

  riverEdges: any[]
  hexes: any[]
  riverChainOverrides: Record<string, [number, number][]>
  riverWiggleFreq: number
  riverWiggleAmp: number
  riverSmoothing: number
  riverHopProps: any
  riverSegmentProps: any
  riverPathSmoothing: number
}

export interface DragLiveResult {
  isDraggingCP: boolean
  isDraggingRailCP: boolean
  isDraggingDense: boolean
  isDraggingRiverDense: boolean
  stableRoadData: RoadBaseData
  liveRoadData: RoadBaseData
  liveRailData: RailBaseData
  liveRiverChainOverrides: Record<string, [number, number][]> | null
}

// Stable-reference cache for applyRailWiggle — avoids a new object every RAF frame
// when nothing is dragging, which would bust the projection cache and force a roads rebuild.
let _railWiggleCache: {
  base: RailBaseData
  wiggleAmp: number; wiggleFreq: number
  segProps: any; hopProps: any
  chaikinPasses: number
  geomOverride: any
  result: RailBaseData
} | null = null

function stableApplyRailWiggle(
  base: RailBaseData,
  wiggleAmp: number, wiggleFreq: number,
  segProps: any, hopProps: any,
  chaikinPasses: number,
  geomOverride: any,
): RailBaseData {
  if (
    _railWiggleCache &&
    _railWiggleCache.base === base &&
    _railWiggleCache.wiggleAmp === wiggleAmp &&
    _railWiggleCache.wiggleFreq === wiggleFreq &&
    _railWiggleCache.segProps === segProps &&
    _railWiggleCache.hopProps === hopProps &&
    _railWiggleCache.chaikinPasses === chaikinPasses &&
    _railWiggleCache.geomOverride === geomOverride
  ) {
    return _railWiggleCache.result
  }
  const result = applyRailWiggle(base, wiggleAmp, wiggleFreq, segProps, hopProps, chaikinPasses, geomOverride ?? undefined)
  _railWiggleCache = { base, wiggleAmp, wiggleFreq, segProps, hopProps, chaikinPasses, geomOverride, result }
  return result
}

export function computeDragLiveData(p: DragLiveInput): DragLiveResult {
  const {
    dragLiveOverride, draggingDensePt, dragLiveDensePos, draggingCpKind,
    roadNetwork, roadEdges, hexIdx,
    roadControlOverrides, roadChainOverrides,
    roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing,
    roadSegmentProps, roadHopProps, roadTierGeometry, roadCenterPull,
    railEdges, railControlOverrides, railNetwork,
    railSmoothing, railPathSmoothing, railWiggleAmp, railWiggleFreq, railWiggleDragging,
    railSegmentProps, railHopProps, railGeomOverride,
    riverEdges, hexes, riverChainOverrides,
    riverWiggleFreq, riverWiggleAmp, riverSmoothing,
    riverHopProps, riverSegmentProps, riverPathSmoothing,
  } = p

  const isDraggingCP = Object.keys(dragLiveOverride).length > 0
  if (isDraggingCP && process.env.NODE_ENV === 'development')
    console.warn('[draw] isDraggingCP=true keys=', Object.keys(dragLiveOverride).slice(0, 3).join(','))

  const isDraggingRailCP = isDraggingCP && draggingCpKind === 'rail'
  const liveDenseDrag = draggingDensePt
  const liveDensePos = dragLiveDensePos

  const isDraggingRoadDense = !!(liveDenseDrag?.kind === 'road' && liveDensePos)
  const isDraggingRiverDense = !!(liveDenseDrag?.kind === 'river' && liveDensePos)
  const isDraggingDense = isDraggingRoadDense

  if (liveDenseDrag && liveDensePos && process.env.NODE_ENV === 'development')
    console.warn('[draw] isDraggingDense=true kind=', liveDenseDrag.kind)

  const liveChainOverrides = isDraggingRoadDense
    ? {
        ...roadChainOverrides,
        [liveDenseDrag!.id]: liveDenseDrag!.handles.map((p, i) =>
          i === liveDenseDrag!.handleIdx ? liveDensePos! : p
        ) as [number, number][],
      }
    : roadChainOverrides

  const liveTierGeomMap: RoadTierGeomMap = {}
  roadTierGeometry.forEach((g, i) => { if (g) liveTierGeomMap[i] = g as any })
  const tierGeomArg = Object.keys(liveTierGeomMap).length > 0 ? liveTierGeomMap : undefined

  const stableRoadData = roadNetwork.getBaseData(
    roadWiggleAmp, roadWiggleFreq, roadSegmentProps, roadHopProps, 2,
  )

  const liveRoadData: RoadBaseData = isDraggingCP
    ? buildRoadChains(
        roadEdges, hexIdx,
        { ...roadControlOverrides, ...dragLiveOverride },
        roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing,
        roadChainOverrides, roadSegmentProps, roadHopProps,
        undefined, 0, tierGeomArg, roadCenterPull,
      )
    : isDraggingDense
      ? buildRoadChains(
          roadEdges, hexIdx,
          roadControlOverrides,
          roadWiggleAmp, roadWiggleFreq, roadSmoothing, roadPathSmoothing,
          liveChainOverrides, roadSegmentProps, roadHopProps,
          undefined, 0, tierGeomArg, roadCenterPull,
        )
      : stableRoadData

  const liveRailGeomOverride = railGeomOverride ?? undefined
  const railRoadMidpoints = new Map(stableRoadData.controlPoints
    .filter(cp => cp.key.startsWith('em|'))
    .map(cp => [cp.key, cp.pos] as [string, [number, number]]))
  const railRoadJunctions = new Map(stableRoadData.controlPoints
    .filter(cp => cp.key.startsWith('ja|'))
    .map(cp => [cp.key.slice(3), cp.pos] as [string, [number, number]]))
  const networkRailBase = railNetwork.getBaseData(roadEdges, railRoadMidpoints, railRoadJunctions)
  const liveRailData: RailBaseData = isDraggingRailCP
    ? applyRailWiggle(
        buildRailChains(
          railEdges, roadEdges, hexIdx,
          railRoadMidpoints, railRoadJunctions,
          { ...railControlOverrides, ...dragLiveOverride },
          0, 0,
          liveRailGeomOverride?.smoothing ?? railSmoothing,
          {}, {}, 2,
          liveRailGeomOverride?.pathSmoothing ?? railPathSmoothing,
        ),
        railWiggleAmp, railWiggleFreq, railSegmentProps, railHopProps, 0, liveRailGeomOverride,
      )
    : stableApplyRailWiggle(
        networkRailBase,
        railWiggleAmp, railWiggleFreq, railSegmentProps, railHopProps,
        railWiggleDragging ? 0 : 2, liveRailGeomOverride,
      )

  const liveRiverChainOverrides: Record<string, [number, number][]> | null =
    isDraggingRiverDense && liveDenseDrag && liveDensePos
      ? {
          ...riverChainOverrides,
          [liveDenseDrag.id]: liveDenseDrag.handles.map((p, i) =>
            i === liveDenseDrag.handleIdx ? liveDensePos : p
          ) as [number, number][],
        }
      : null

  return {
    isDraggingCP,
    isDraggingRailCP,
    isDraggingDense,
    isDraggingRiverDense,
    stableRoadData,
    liveRoadData,
    liveRailData,
    liveRiverChainOverrides,
  }
}

// ---------------------------------------------------------------------------
// Projection cache
// ---------------------------------------------------------------------------

type ChainBBox = { minX: number; maxX: number; minY: number; maxY: number }

export type RoadProjectionCache = {
  roadData: RoadBaseData
  railData: RailBaseData
  pw: number; ph: number; px: number; py: number
  roadChainsPx: { tier: 0|1|2; chain: [number,number][]; bbox: ChainBBox }[]
  junctionsPx:  { pos: [number,number]; tier: 0|1|2 }[]
  railChainsPx: { chain: [number,number][]; baseChain?: [number,number][]; id?: string; isShared: boolean; isLoop: boolean; hopKeys?: string[]; hopRanges?: [number,number][]; bbox: ChainBBox }[]
}

export interface RoadProjectionInput {
  liveRoadData: RoadBaseData
  liveRailData: RailBaseData
  cache: RoadProjectionCache | null
  pw: number; ph: number
  project: (lon: number, lat: number) => [number, number]
  isDraggingCP: boolean
  isDraggingDense: boolean
  isDraggingRailCP: boolean
}

export interface RoadProjectionResult {
  roadChainsPx: RoadProjectionCache['roadChainsPx']
  junctionsPx:  RoadProjectionCache['junctionsPx']
  railChainsPx: RoadProjectionCache['railChainsPx']
  projCacheMiss: boolean
  updatedCache: RoadProjectionCache
}

function chainBBox(pts: [number,number][]): ChainBBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX, maxX, minY, maxY }
}

export function computeRoadProjections(p: RoadProjectionInput): RoadProjectionResult {
  const { liveRoadData, liveRailData, cache, pw, ph, project,
    isDraggingCP, isDraggingDense, isDraggingRailCP } = p

  const rpc = cache
  if (rpc &&
      rpc.roadData === liveRoadData && rpc.railData === liveRailData &&
      rpc.pw === pw && rpc.ph === ph && rpc.px === 0 && rpc.py === 0) {
    return {
      roadChainsPx: rpc.roadChainsPx,
      junctionsPx:  rpc.junctionsPx,
      railChainsPx: rpc.railChainsPx,
      projCacheMiss: false,
      updatedCache: rpc,
    }
  }

  if (process.env.NODE_ENV === 'development') {
    const reason = !rpc ? 'no-cache'
      : rpc.roadData !== liveRoadData ? `road-identity(isDragCP=${isDraggingCP},isDragDense=${isDraggingDense})`
      : rpc.railData !== liveRailData ? `rail-identity(isDragRailCP=${isDraggingRailCP})`
      : `paper(pw ${rpc.pw.toFixed(1)}→${pw.toFixed(1)})`
    const chains = liveRoadData.chains
    console.warn('[roads-proj] miss reason=', reason, 'chains=', chains.length, 'pts=', chains.reduce((s, c) => s + c.chain.length, 0))
  }

  const roadChainsPx = liveRoadData.chains.map(c => {
    const chain = c.chain.map(([lon, lat]) => project(lon, lat)) as [number,number][]
    return { tier: c.tier, chain, bbox: chainBBox(chain) }
  })
  const junctionsPx = liveRoadData.junctions.map(j => ({
    tier: j.tier, pos: project(j.pos[0], j.pos[1]) as [number,number],
  }))
  const railChainsPx = liveRailData.chains.map(c => {
    const chain = c.chain.map(([lon, lat]) => project(lon, lat)) as [number,number][]
    const baseChain = c.baseChain?.map(([lon, lat]) => project(lon, lat)) as [number,number][] | undefined
    return { ...c, chain, baseChain, bbox: chainBBox(chain) }
  })

  const updatedCache: RoadProjectionCache = {
    roadData: liveRoadData, railData: liveRailData,
    pw, ph, px: 0, py: 0,
    roadChainsPx, junctionsPx, railChainsPx,
  }

  return { roadChainsPx, junctionsPx, railChainsPx, projCacheMiss: true, updatedCache }
}

// ---------------------------------------------------------------------------
// Live river chain override → riverChainData patch
// ---------------------------------------------------------------------------

export function computeLiveRiverChainData(
  overrides: Record<string, [number, number][]>,
  riverEdges: any[],
  hexes: any[],
  riverWiggleFreq: number,
  riverWiggleAmp: number,
  riverSmoothing: number,
  riverHopProps: any,
  riverSegmentProps: any,
  riverPathSmoothing: number,
): { vertices: [number,number][]; segKey: string }[] {
  const chains = buildRiverChainsV2(
    riverEdges, hexes, overrides,
    riverWiggleFreq, riverWiggleAmp, riverSmoothing,
    riverHopProps, riverSegmentProps, riverPathSmoothing,
  )
  return chains.map(c => ({ vertices: c.chain, segKey: c.segKey }))
}
