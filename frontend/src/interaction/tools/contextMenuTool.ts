import type { MutableRefObject } from 'react'
import type { GeneratedHex, GridMetadata } from '../../store/mapStore'
import { hexTerrainLayers, edgeBlobCanonicalKey } from '../../store/mapStore'
import { findEdgeChains as findEdgeChainsSync } from '../../lib/edgeBlobs'
import { pointInPolygon, distToSeg } from '../../lib/geometry'
import { projectToCanvas } from '../../lib/projection'
import type { BridgePoint } from '../../lib/detectBridges'
import type { RiverChainV2 } from '../../lib/riverChains'
import type { RoadNetwork } from '../../lib/roadNetwork'
import type { LabelBBox } from '../../store/slices/labelOffsetsSlice'

type LogicalFn = (clientX: number, clientY: number) => { lx: number; ly: number; cssW: number; cssH: number } | null
type GetPaperFn = (cssW: number, cssH: number) => { pw: number; ph: number; px: number; py: number }
type FindHexFn = (clientX: number, clientY: number) => GeneratedHex | null

export type CtxItem = {
  label: string; action: () => void
  danger?: boolean; color?: string; dim?: boolean
  icon?: 'edit' | 'dice' | 'erase'
  highlightPolys?: [number, number][][]
  highlightLines?: [number, number][][]
}

type SettlementRef = { name: string; hex_q: number; hex_r: number; included: boolean; tier?: number }
type BridgeTierRef = { id: string; label: string; color: string }
type DefaultBlobEntry = { terrain: string; polys: [number, number][][]; blobKeys: (string | null)[] }
type SmoothedRailData = { chains: { id: string; chain: [number, number][]; hopKeys?: string[]; hopRanges?: [number, number][] }[] }
type RiverChain = RiverChainV2

export interface ContextMenuRefs {
  metaRef: MutableRefObject<GridMetadata | null>
  hexesRef: MutableRefObject<GeneratedHex[]>
  hexRadiusRef: MutableRefObject<number>
  settlementsRef: MutableRefObject<SettlementRef[]>
  labelBBoxCacheRef: MutableRefObject<Record<string, LabelBBox>>
  labelOffsetsRef: MutableRefObject<Record<string, { dx: number; dy: number }>>
  updateSettlementRef: MutableRefObject<(idx: number, patch: { tier: number }) => void>
  deleteSettlementRef: MutableRefObject<(idx: number) => void>
  clearLabelOffsetRef: MutableRefObject<(id: string) => void>
  setActiveToolRef: MutableRefObject<(tool: { type: string; [k: string]: unknown }) => void>
  roadControlOverridesRef: MutableRefObject<Record<string, unknown>>
  deleteRoadControlOverrideRef: MutableRefObject<(key: string) => void>
  setRoadControlOverrideRef: MutableRefObject<(key: string, value: unknown) => void>
  roadNodeEditModeRef: MutableRefObject<boolean>
  roadNetworkRef: MutableRefObject<RoadNetwork>
  roadWiggleAmpRef: MutableRefObject<number>
  roadWiggleFreqRef: MutableRefObject<number>
  roadSegmentPropsRef: MutableRefObject<unknown>
  roadHopPropsRef: MutableRefObject<unknown>
  roadSelectModeRef: MutableRefObject<boolean>
  roadChainOverridesRef: MutableRefObject<Record<string, unknown>>
  deleteRoadChainOverrideRef: MutableRefObject<(id: string) => void>
  hoveredChainRef: MutableRefObject<{ id: string; kind: 'road' | 'river' | 'rail' } | null>
  setSelectedRoadSegmentKeysRef: MutableRefObject<(keys: string[]) => void>
  setSelectedRoadHopKeyRef: MutableRefObject<(key: string | null) => void>
  railNodeEditModeRef: MutableRefObject<boolean>
  railControlOverridesRef: MutableRefObject<Record<string, unknown>>
  deleteRailControlOverrideRef: MutableRefObject<(key: string) => void>
  railChainOverridesRef: MutableRefObject<Record<string, unknown>>
  deleteRailChainOverrideRef: MutableRefObject<(id: string) => void>
  smoothedRailDataRef: MutableRefObject<SmoothedRailData>
  setSelectedRailSegmentKeysRef: MutableRefObject<(keys: string[]) => void>
  setSelectedRailHopKeyRef: MutableRefObject<(key: string | null) => void>
  riverChainsV2Ref: MutableRefObject<RiverChain[]>
  riverEditModeRef: MutableRefObject<boolean>
  setSelectedSegmentKeysRef: MutableRefObject<(keys: string[]) => void>
  setSelectedHopKeyRef: MutableRefObject<(key: string | null) => void>
  roadEdgesRef: MutableRefObject<{ q1: number; r1: number; q2: number; r2: number }[]>
  blobComponentsRef: MutableRefObject<Map<string, string>>
  blobComponentsByTerrainRef: MutableRefObject<Map<string, Map<string, string>>>
  defaultTerrainBlobsRef: MutableRefObject<DefaultBlobEntry[]>
  edgeBlobPaintedRef: MutableRefObject<Record<string, string | undefined>>
  hexVertMapRef: MutableRefObject<unknown>
  randomizeBlobSeedRef: MutableRefObject<(blobKey: string) => void>
  eraseEdgeBlobRef: MutableRefObject<(edgeKey: string) => void>
  bridgesEnabledRef: MutableRefObject<boolean>
  detectedBridgesRef: MutableRefObject<BridgePoint[]>
  bridgeOverridesRef: MutableRefObject<Record<string, string | undefined>>
  bridgeTiersRef: MutableRefObject<BridgeTierRef[]>
  setBridgeOverrideRef: MutableRefObject<(id: string, tierId: string) => void>
  clearBridgeOverrideRef: MutableRefObject<(id: string) => void>
  clientToLogicalRef: MutableRefObject<LogicalFn>
  getPaper: GetPaperFn
  findHexAtClient: FindHexFn
  setCtxMenu: (menu: { x: number; y: number; items: CtxItem[] } | null) => void
  setSettlementRename: (v: { index: number; name: string; x: number; y: number } | null) => void
  setBlobFlyout: (v: { type: string; canonicalKey: string; terrain?: string; x: number; y: number } | null) => void
}

export function attachContextMenuHandlers(el: HTMLElement, refs: ContextMenuRefs): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    e.preventDefault()
    const hex = refs.findHexAtClient(e.clientX, e.clientY)
    const items: CtxItem[] = []

    const meta2 = refs.metaRef.current
    const logical2 = meta2 ? refs.clientToLogicalRef.current(e.clientX, e.clientY) : null
    const lx2 = logical2?.lx ?? 0, ly2 = logical2?.ly ?? 0
    const cssW2 = logical2?.cssW ?? 0, cssH2 = logical2?.cssH ?? 0
    const { pw: pw2, ph: ph2, px: px2, py: py2 } = meta2 && cssW2 > 0
      ? refs.getPaper(cssW2, cssH2)
      : { pw: 0, ph: 0, px: 0, py: 0 }
    const R2 = refs.hexRadiusRef.current
    const projectPt = (lon: number, lat: number): [number, number] =>
      meta2 && cssW2 > 0 ? projectToCanvas(lon, lat, meta2, pw2, ph2, px2, py2) : [0, 0]
    const chainPixels = (chain: [number, number][]) =>
      chain.map(([lon, lat]) => projectPt(lon, lat)) as [number, number][]

    // ── SETTLEMENT ─────────────────────────────────────────────────────────
    if (meta2 && cssW2 > 0) {
      let nearestIdx = -1, nearestDist = R2 * 0.8
      for (let i = 0; i < refs.settlementsRef.current.length; i++) {
        const s = refs.settlementsRef.current[i]
        if (!s.included) continue
        const bbox = refs.labelBBoxCacheRef.current[`settlement:${s.name}`]
        if (!bbox) continue
        const rx = Math.abs(lx2 - bbox.cx), ry = Math.abs(ly2 - bbox.cy)
        if (rx <= bbox.hw + 6 && ry <= bbox.hh + 6) { nearestIdx = i; nearestDist = 0; break }
      }
      if (nearestIdx < 0) {
        for (let i = 0; i < refs.settlementsRef.current.length; i++) {
          const s = refs.settlementsRef.current[i]
          if (!s.included) continue
          const h = refs.hexesRef.current.find(hx => hx.q === s.hex_q && hx.r === s.hex_r)
          if (!h) continue
          const [sx, sy] = projectPt(h.center[0], h.center[1])
          const d = Math.hypot(lx2 - sx, ly2 - sy)
          if (d < nearestDist) { nearestDist = d; nearestIdx = i }
        }
      }
      if (nearestIdx >= 0) {
        const s = refs.settlementsRef.current[nearestIdx]
        const idx = nearestIdx
        const h = refs.hexesRef.current.find(hx => hx.q === s.hex_q && hx.r === s.hex_r)
        const [sx, sy] = h ? projectPt(h.center[0], h.center[1]) : [e.clientX, e.clientY]
        items.push({ label: 'Settlement', action: () => {}, dim: true })
        items.push({
          label: 'Rename…', icon: 'edit' as const,
          action: () => refs.setSettlementRename({ index: idx, name: s.name, x: e.clientX, y: e.clientY }),
        })
        const tierLabels: Record<number, string> = { 1: 'Tier I', 2: 'Tier II', 3: 'Tier III', 4: 'Tier IV' }
        for (const tier of [1, 2, 3, 4] as const) {
          items.push({
            label: tierLabels[tier],
            dim: (s.tier ?? 1) === tier,
            action: () => refs.updateSettlementRef.current(idx, { tier }),
          })
        }
        const labelId = `settlement:${s.name}`
        items.push({
          label: 'Move label', icon: 'edit' as const,
          action: () => {
            const off = refs.labelOffsetsRef.current[labelId] ?? { dx: 0, dy: 0 }
            const bbox = refs.labelBBoxCacheRef.current[labelId]
            const iconCx = (bbox as { iconCx?: number })?.iconCx ?? sx
            const iconCy = (bbox as { iconCy?: number })?.iconCy ?? sy
            refs.setActiveToolRef.current({ type: 'label-follow', id: labelId, iconCx, iconCy, prevDx: off.dx, prevDy: off.dy })
          },
        })
        if (refs.labelOffsetsRef.current[labelId]) {
          items.push({ label: 'Reset label position', action: () => refs.clearLabelOffsetRef.current(labelId) })
        }
        items.push({ label: 'Remove settlement', danger: true, action: () => refs.deleteSettlementRef.current(idx) })
        items.push({ label: '─', action: () => {} })
      }
    }

    // ── ROAD junction / node ───────────────────────────────────────────────
    if (hex) {
      const hexKey = `${hex.q},${hex.r}`
      const overrides = refs.roadControlOverridesRef.current
      const touchingKeys = Object.keys(overrides).filter(k =>
        k === `ja|${hexKey}` ||
        (k.startsWith('jt|') && k.split('|')[1] === hexKey) ||
        (k.startsWith('em|') && (k.includes(`|${hexKey}|`) || k.endsWith(`|${hexKey}`)))
      )
      if (touchingKeys.length > 0) {
        items.push({ label: 'Revert road node', danger: true, action: () => touchingKeys.forEach(k => refs.deleteRoadControlOverrideRef.current(k)) })
      }
      const hovChainId = refs.hoveredChainRef.current?.kind === 'road' ? refs.hoveredChainRef.current?.id : null
      if (hovChainId && refs.roadChainOverridesRef.current[hovChainId]) {
        items.push({ label: 'Revert road shape', danger: true, action: () => { refs.deleteRoadChainOverrideRef.current(hovChainId) } })
      }
      const h = refs.hexesRef.current.find(hx => hx.q === hex.q && hx.r === hex.r)
      const armNeighbors = [...new Set(
        refs.roadEdgesRef.current
          .filter(e2 => (e2.q1 === hex.q && e2.r1 === hex.r) || (e2.q2 === hex.q && e2.r2 === hex.r))
          .map(e2 => e2.q1 === hex.q && e2.r1 === hex.r ? `${e2.q2},${e2.r2}` : `${e2.q1},${e2.r1}`)
      )]
      if (armNeighbors.length > 2) {
        const isAlreadyDissolved = armNeighbors.every(nk => !!refs.roadControlOverridesRef.current[`jt|${hexKey}|${nk}`])
        if (!isAlreadyDissolved) {
          items.push({
            label: 'Dissolve junction',
            action: () => {
              const juncCenter = (refs.roadControlOverridesRef.current[`ja|${hexKey}`] ?? h?.center) as [number, number]
              if (!juncCenter) return
              for (const nk of armNeighbors) {
                const [nq, nr] = nk.split(',').map(Number)
                const nh = refs.hexesRef.current.find(hx => hx.q === nq && hx.r === nr)
                if (nh) {
                  const dx = nh.center[0] - juncCenter[0], dy = nh.center[1] - juncCenter[1]
                  refs.setRoadControlOverrideRef.current(`jt|${hexKey}|${nk}`, [juncCenter[0] + dx * 0.2, juncCenter[1] + dy * 0.2])
                } else {
                  refs.setRoadControlOverrideRef.current(`jt|${hexKey}|${nk}`, juncCenter)
                }
              }
            },
          })
        } else {
          const jtCpsForHex = (refs.roadNetworkRef.current.getBaseData(refs.roadWiggleAmpRef.current, refs.roadWiggleFreqRef.current, refs.roadSegmentPropsRef.current as Parameters<RoadNetwork['getBaseData']>[2], refs.roadHopPropsRef.current as Parameters<RoadNetwork['getBaseData']>[3], 2).controlPoints ?? [])
            .filter(cp => cp.key.startsWith('jt|') && cp.key.split('|')[1] === hexKey)
          if (meta2 && cssW2 > 0) {
            const groups: { keys: string[]; pos: [number, number] }[] = []
            for (const cp of jtCpsForHex) {
              const [cx, cy] = projectPt(cp.pos[0], cp.pos[1])
              let merged = false
              for (const g of groups) {
                const [gx, gy] = projectPt(g.pos[0], g.pos[1])
                if (Math.hypot(cx - gx, cy - gy) < 2) { g.keys.push(cp.key); merged = true; break }
              }
              if (!merged) groups.push({ keys: [cp.key], pos: cp.pos })
            }
            const connectedGroups = groups.filter(g => g.keys.length >= 2)
            if (connectedGroups.length > 0) {
              items.push({
                label: 'Dissolve group',
                action: () => {
                  for (const g of connectedGroups) {
                    for (const key of g.keys) {
                      const nk = key.split('|')[2]
                      const [nq, nr] = nk.split(',').map(Number)
                      const nh = refs.hexesRef.current.find(hx => hx.q === nq && hx.r === nr)
                      const dx = (nh?.center[0] ?? g.pos[0]) - g.pos[0]
                      const dy = (nh?.center[1] ?? g.pos[1]) - g.pos[1]
                      refs.setRoadControlOverrideRef.current(key, [g.pos[0] + dx * 0.2, g.pos[1] + dy * 0.2])
                    }
                  }
                },
              })
            }
          }
        }
      }
    }

    // ── ROAD segment / hop ─────────────────────────────────────────────────
    if (meta2 && cssW2 > 0 && !refs.roadNodeEditModeRef.current) {
      const roadChains = refs.roadNetworkRef.current.getBaseData(refs.roadWiggleAmpRef.current, refs.roadWiggleFreqRef.current, refs.roadSegmentPropsRef.current as Parameters<RoadNetwork['getBaseData']>[2], refs.roadHopPropsRef.current as Parameters<RoadNetwork['getBaseData']>[3], 2).chains
      let bestChain: typeof roadChains[0] | null = null
      let bestDist = Infinity
      for (const chain of roadChains) {
        if (chain.id.startsWith('stub|')) continue
        const pxPts = chainPixels(chain.chain)
        for (let i = 0; i < pxPts.length - 1; i++) {
          const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
          const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
          if (dist < bestDist) { bestDist = dist; bestChain = chain }
        }
      }
      if (bestDist < R2 * 0.7 && bestChain) {
        const pxPts = chainPixels(bestChain.chain)
        let bestHopKey: string | null = null, bestHopDist = Infinity
        if (bestChain.hopKeys && bestChain.hopRanges) {
          for (let h2 = 0; h2 < bestChain.hopKeys.length; h2++) {
            const [hs, he] = bestChain.hopRanges[h2]
            for (let i = hs; i < he; i++) {
              const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
              const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
              const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
              const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
              if (dist < bestHopDist) { bestHopDist = dist; bestHopKey = bestChain!.hopKeys![h2] }
            }
          }
        }
        const cap = bestChain, capHop = bestHopKey
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({ label: 'Road', action: () => {}, dim: true })
        items.push({
          label: 'Edit segment', highlightLines: [pxPts],
          action: () => {
            refs.setActiveToolRef.current({ type: 'road-select' })
            refs.setSelectedRoadSegmentKeysRef.current([cap.id])
            refs.setSelectedRoadHopKeyRef.current(null)
          },
        })
        if (capHop) {
          items.push({
            label: 'Edit hop here', highlightLines: [pxPts],
            action: () => {
              refs.setActiveToolRef.current({ type: 'road-select' })
              refs.setSelectedRoadSegmentKeysRef.current([cap.id])
              refs.setSelectedRoadHopKeyRef.current(capHop)
            },
          })
        }
      }
      if (refs.roadSelectModeRef.current) {
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({ label: 'Exit road editing', action: () => refs.setActiveToolRef.current({ type: 'none' }) })
      }
    }

    // ── RAIL segment / hop ─────────────────────────────────────────────────
    if (meta2 && cssW2 > 0 && !refs.railNodeEditModeRef.current) {
      const railChains = refs.smoothedRailDataRef.current.chains
      let bestRailChain: typeof railChains[0] | null = null, bestRailDist = Infinity
      for (const chain of railChains) {
        const pxPts = chainPixels(chain.chain)
        for (let i = 0; i < pxPts.length - 1; i++) {
          const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
          const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
          if (dist < bestRailDist) { bestRailDist = dist; bestRailChain = chain }
        }
      }
      if (bestRailDist < R2 * 0.7 && bestRailChain) {
        const pxPts = chainPixels(bestRailChain.chain)
        let bestHopKey: string | null = null, bestHopDist = Infinity
        if (bestRailChain.hopKeys && bestRailChain.hopRanges) {
          for (let h2 = 0; h2 < bestRailChain.hopKeys.length; h2++) {
            const [hs, he] = bestRailChain.hopRanges[h2]
            for (let i = hs; i < he; i++) {
              const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
              const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
              const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
              const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
              if (dist < bestHopDist) { bestHopDist = dist; bestHopKey = bestRailChain!.hopKeys![h2] }
            }
          }
        }
        const cap = bestRailChain, capHop = bestHopKey
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({ label: 'Rail', action: () => {}, dim: true })
        items.push({
          label: 'Edit rail segment', highlightLines: [pxPts],
          action: () => {
            refs.setActiveToolRef.current({ type: 'rail-select' })
            refs.setSelectedRailSegmentKeysRef.current([cap.id])
            refs.setSelectedRailHopKeyRef.current(null)
          },
        })
        if (capHop) {
          items.push({
            label: 'Edit rail hop here', highlightLines: [pxPts],
            action: () => {
              refs.setActiveToolRef.current({ type: 'rail-select' })
              refs.setSelectedRailSegmentKeysRef.current([cap.id])
              refs.setSelectedRailHopKeyRef.current(capHop)
            },
          })
        }
      }
    }

    // ── RAIL node overrides revert ─────────────────────────────────────────
    if (hex && refs.railNodeEditModeRef.current) {
      const hexKey = `${hex.q},${hex.r}`
      const railTouchingKeys = Object.keys(refs.railControlOverridesRef.current).filter(k =>
        k === `ja|${hexKey}` ||
        (k.startsWith('em|') && (k.includes(`|${hexKey}|`) || k.endsWith(`|${hexKey}`)))
      )
      if (railTouchingKeys.length > 0) {
        items.push({ label: 'Revert rail node', danger: true, action: () => railTouchingKeys.forEach(k => refs.deleteRailControlOverrideRef.current(k)) })
      }
      const hovRailChainId = refs.hoveredChainRef.current?.kind === 'rail' ? refs.hoveredChainRef.current?.id : null
      if (hovRailChainId && refs.railChainOverridesRef.current[hovRailChainId]) {
        items.push({ label: 'Revert rail shape', danger: true, action: () => { refs.deleteRailChainOverrideRef.current(hovRailChainId) } })
      }
    }

    // ── RIVER segment / hop ────────────────────────────────────────────────
    if (meta2 && cssW2 > 0 && refs.riverChainsV2Ref.current.length > 0) {
      let bestChain: RiverChain | null = null, bestSegDist = Infinity
      for (const chain of refs.riverChainsV2Ref.current) {
        const pxPts = chainPixels(chain.chain)
        for (let i = 0; i < pxPts.length - 1; i++) {
          const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
          const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
          if (dist < bestSegDist) { bestSegDist = dist; bestChain = chain }
        }
      }
      if (bestSegDist < R2 * 0.7 && bestChain) {
        const pxPts = chainPixels(bestChain.chain)
        let bestHopKey: string | null = null, bestHopDist = Infinity
        for (let h2 = 0; h2 < bestChain.hopKeys.length; h2++) {
          const [hs, he] = bestChain.hopRanges[h2]
          for (let i = hs; i < he; i++) {
            const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]
            const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx2 - ax) * dx + (ly2 - ay) * dy) / len2)) : 0
            const dist = Math.hypot(lx2 - (ax + t * dx), ly2 - (ay + t * dy))
            if (dist < bestHopDist) { bestHopDist = dist; bestHopKey = bestChain.hopKeys[h2] }
          }
        }
        const capturedChain = bestChain, capturedHopKey = bestHopKey
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({ label: 'River', action: () => {}, dim: true })
        items.push({
          label: 'Edit segment', highlightLines: [pxPts],
          action: () => {
            refs.setActiveToolRef.current({ type: 'river-select' })
            refs.setSelectedSegmentKeysRef.current([capturedChain.segKey])
            refs.setSelectedHopKeyRef.current(null)
          },
        })
        if (capturedHopKey) {
          items.push({
            label: 'Edit hop here', highlightLines: [pxPts],
            action: () => {
              refs.setActiveToolRef.current({ type: 'river-select' })
              refs.setSelectedSegmentKeysRef.current([capturedChain.segKey])
              refs.setSelectedHopKeyRef.current(capturedHopKey)
            },
          })
        }
      }
      if (refs.riverEditModeRef.current) {
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({ label: 'Exit river editing', action: () => refs.setActiveToolRef.current({ type: 'none' }) })
      }
    }

    // ── TERRAIN blob / hex ─────────────────────────────────────────────────
    if (hex) {
      const hexKey = `${hex.q},${hex.r}`
      const storedHexForBlob = refs.hexesRef.current.find(h => h.q === hex.q && h.r === hex.r)
      const blobLogical = refs.clientToLogicalRef.current(e.clientX, e.clientY)
      const blobLx = blobLogical ? blobLogical.lx - px2 : 0
      const blobLy = blobLogical ? blobLogical.ly - py2 : 0
      const blobToCanvas = (poly: [number, number][]) => poly.map(([x, y]) => [x + px2, y + py2] as [number, number])

      if (storedHexForBlob) {
        const editableLayers = hexTerrainLayers(storedHexForBlob)
        let addedHeader = false
        for (const t of editableLayers) {
          const componentMap = refs.blobComponentsByTerrainRef.current.get(t)
          const canonicalKey = componentMap?.get(hexKey)
          if (!canonicalKey) continue
          const terrainPolys = refs.defaultTerrainBlobsRef.current.find(b => b.terrain === t)?.polys ?? []
          const hitTerrainPoly = blobLogical ? terrainPolys.filter(p => pointInPolygon(blobLx, blobLy, p)).map(blobToCanvas) : []
          if (!addedHeader) { items.push({ label: 'Terrain', action: () => {}, dim: true }); addedHeader = true }
          items.push({
            label: `Edit ${t.replace(/_/g, ' ')} blob…`, icon: 'edit' as const, highlightPolys: hitTerrainPoly,
            action: () => refs.setBlobFlyout({ type: 'terrain', canonicalKey, terrain: t, x: e.clientX, y: e.clientY }),
          })
        }
      }

      if (blobLogical) {
        const allBlobs = refs.defaultTerrainBlobsRef.current
        let hitBlobKey: string | null = null
        outer: for (const entry of allBlobs) {
          for (let i = 0; i < entry.polys.length; i++) {
            if (pointInPolygon(blobLx, blobLy, entry.polys[i])) { hitBlobKey = entry.blobKeys[i] ?? null; break outer }
          }
        }
        if (hitBlobKey) {
          const captured = hitBlobKey
          const hitPoly = (() => {
            for (const entry of allBlobs) {
              for (let i = 0; i < entry.polys.length; i++) {
                if ((entry.blobKeys[i] ?? null) === captured) return [blobToCanvas(entry.polys[i])]
              }
            }
            return []
          })()
          items.push({ label: 'Randomize blob', icon: 'dice' as const, highlightPolys: hitPoly, action: () => refs.randomizeBlobSeedRef.current(captured) })
        }
      }

      if (Object.keys(refs.edgeBlobPaintedRef.current).length > 0 && meta2 && logical2) {
        const threshold3 = R2 * 0.35
        const hexMap3 = new Map<string, GeneratedHex>()
        for (const h of refs.hexesRef.current) hexMap3.set(`${h.q},${h.r}`, h)
        const HEX_DIRS3: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
        const SNAP3 = 2
        const vk3 = (p: [number, number]) => `${Math.round(p[0] / SNAP3)},${Math.round(p[1] / SNAP3)}`
        let nearestEdgeKey: string | null = null, nearestEdgeDist = threshold3
        for (const h of refs.hexesRef.current) {
          const hv = h.vertices.map(([lon, lat]) => projectPt(lon, lat))
          const cx3 = hv.reduce((s, v) => s + v[0], 0) / 6, cy3 = hv.reduce((s, v) => s + v[1], 0) / 6
          if (Math.hypot(lx2 - cx3, ly2 - cy3) > R2 * 2) continue
          for (const [dq3, dr3] of HEX_DIRS3) {
            const nq3 = h.q + dq3, nr3 = h.r + dr3
            if (!hexMap3.has(`${nq3},${nr3}`)) continue
            const ek3 = edgeBlobCanonicalKey(h.q, h.r, nq3, nr3)
            if (!refs.edgeBlobPaintedRef.current[ek3]) continue
            const nv = hexMap3.get(`${nq3},${nr3}`)!.vertices.map(([lon, lat]) => projectPt(lon, lat))
            const nkeys3 = new Set(nv.map(vk3))
            const shared3 = hv.filter(v => nkeys3.has(vk3(v)))
            if (shared3.length < 2) continue
            const d3 = distToSeg([lx2, ly2], shared3[0], shared3[1])
            if (d3 < nearestEdgeDist) { nearestEdgeDist = d3; nearestEdgeKey = ek3 }
          }
        }
        if (nearestEdgeKey) {
          const ek = nearestEdgeKey
          const terrain3 = refs.edgeBlobPaintedRef.current[ek]
          const chains3 = findEdgeChainsSync(refs.edgeBlobPaintedRef.current, refs.hexVertMapRef.current as Parameters<typeof findEdgeChainsSync>[1])
          const chain3 = chains3.find(c => c.edgeKeys.includes(ek))
          const chainKey3 = chain3?.chainKey ?? ek
          items.push({
            label: `Edit edge ${terrain3?.replace(/_/g, ' ') ?? 'blob'}…`, icon: 'edit' as const,
            action: () => refs.setBlobFlyout({ type: 'edge', canonicalKey: chainKey3, terrain: terrain3 ?? undefined, x: e.clientX, y: e.clientY }),
          })
          items.push({ label: 'Erase edge blob', icon: 'erase' as const, danger: true, action: () => refs.eraseEdgeBlobRef.current(ek) })
        }
      }
      if (items.length > 0) items.push({ label: '─', action: () => {} })
    }

    // ── BRIDGE ─────────────────────────────────────────────────────────────
    if (refs.bridgesEnabledRef.current && refs.detectedBridgesRef.current.length > 0 && meta2 && cssW2 > 0) {
      let nearestBridge: BridgePoint | null = null, nearestDist = Infinity
      for (const bridge of refs.detectedBridgesRef.current) {
        const [bx, by] = projectPt(bridge.pos[0], bridge.pos[1])
        const dist = Math.hypot(lx2 - bx, ly2 - by)
        if (dist < nearestDist) { nearestDist = dist; nearestBridge = bridge }
      }
      if (nearestBridge && nearestDist < R2 * 0.6) {
        const captured = nearestBridge
        const currentTierId = refs.bridgeOverridesRef.current[captured.id]
        if (items.length > 0) items.push({ label: '─', action: () => {} })
        items.push({ label: 'Bridge tier', action: () => {}, dim: true })
        items.push({ label: 'Default (no marker)', action: () => refs.clearBridgeOverrideRef.current(captured.id), dim: !currentTierId })
        for (const tier of refs.bridgeTiersRef.current) {
          items.push({
            label: tier.label, color: tier.color, dim: tier.id === currentTierId,
            action: () => refs.setBridgeOverrideRef.current(captured.id, tier.id),
          })
        }
      }
    }

    if (items.length > 0) refs.setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  el.addEventListener('contextmenu', onContextMenu)
  return () => el.removeEventListener('contextmenu', onContextMenu)
}
