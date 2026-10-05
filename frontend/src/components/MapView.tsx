import { useEffect, useRef, useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  useMapStore, pageGridTotalMm, FRAME_MARGIN,
  validColWidthsForRows, validRowHeightsForCols, cellPaperInfo,
  type HexEdgeMode,
} from '../store/mapStore'

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

// ---------------------------------------------------------------------------
// Hex layout engine — pure screen-space geometry, three edge modes
// ---------------------------------------------------------------------------

function computeHexLayout(
  frameW: number,
  frameH: number,
  marginPx: number,
  R: number,
  flat: boolean,
  mode: HexEdgeMode,
): { hexPoints: string[]; marginPx: number } {
  const sq3 = Math.sqrt(3)
  const base = flat ? 0 : 30
  const iW = frameW - 2 * marginPx
  const iH = frameH - 2 * marginPx
  const hw = iW / 2
  const hh = iH / 2
  // Paper centre in screen space — q=0,r=0 is placed here, matching the backend
  const cx0 = marginPx + hw
  const cy0 = marginPx + hh

  // Axial hex centre offset from the paper centre (identical to backend hex_grid.py)
  const axDx = (q: number, r: number) =>
    flat ? 1.5 * R * q : sq3 * R * q + (sq3 / 2) * R * r
  const axDy = (q: number, r: number) =>
    flat ? (sq3 / 2) * R * q + sq3 * R * r : 1.5 * R * r

  const sweep = Math.ceil((Math.max(iW, iH) / 2 + R) / R) + 1

  const hexPoints: string[] = []
  for (let q = -sweep; q <= sweep; q++) {
    for (let r = -sweep; r <= sweep; r++) {
      const dx = axDx(q, r)
      const dy = axDy(q, r)

      // Quick cull: centre must be reachable from the inner area
      if (Math.abs(dx) > hw + R || Math.abs(dy) > hh + R) continue

      // Vertex offsets relative to the paper centre
      const verts = Array.from({ length: 6 }, (_, i) => {
        const a = ((base + 60 * i) * Math.PI) / 180
        return [dx + R * Math.cos(a), dy + R * Math.sin(a)] as [number, number]
      })

      const isPartial = verts.some(([vx, vy]) => Math.abs(vx) > hw || Math.abs(vy) > hh)
      if (mode === 'whole' && isPartial) continue

      const pts = verts.map(([vx, vy]) => `${cx0 + vx},${cy0 + vy}`).join(' ')
      hexPoints.push(pts)
    }
  }

  return { hexPoints, marginPx }
}

// ---------------------------------------------------------------------------
// SVG component — renders the layout and the margin guide line
// ---------------------------------------------------------------------------

interface HexPreviewProps {
  frameW: number
  frameH: number
  paperWidthMm: number
  paperHeightMm: number
  pageGrid: { colWidths: number[]; rowHeights: number[] }
  hexSizeMm: number
  hexOrientation: 'flat' | 'pointy'
  marginMm: number
  hexEdgeMode: HexEdgeMode
}

function HexPreviewSVG({ frameW, frameH, paperWidthMm, paperHeightMm, pageGrid, hexSizeMm, hexOrientation, marginMm, hexEdgeMode }: HexPreviewProps) {
  const result = useMemo(() => {
    if (frameW === 0 || frameH === 0) return null
    const scalePxPerMm = frameW / paperWidthMm
    const R = (hexSizeMm / 2) * scalePxPerMm * 2 / Math.sqrt(3)
    const marginPx = marginMm * scalePxPerMm
    return computeHexLayout(frameW, frameH, marginPx, R, hexOrientation === 'flat', hexEdgeMode)
  }, [frameW, frameH, paperWidthMm, hexSizeMm, hexOrientation, marginMm, hexEdgeMode])

  if (!result) return null
  const { hexPoints, marginPx: mp } = result

  const scaleX = frameW / paperWidthMm
  const scaleY = frameH / paperHeightMm
  const multiSheet = pageGrid.colWidths.length > 1 || pageGrid.rowHeights.length > 1

  // Build per-cell margin rects
  const cellRects: { x: number; y: number; w: number; h: number }[] = []
  let yAcc = 0
  for (const rowH of pageGrid.rowHeights) {
    let xAcc = 0
    for (const colW of pageGrid.colWidths) {
      const cx = xAcc * scaleX
      const cy = yAcc * scaleY
      const cw = colW * scaleX
      const ch = rowH * scaleY
      cellRects.push({ x: cx + mp, y: cy + mp, w: cw - mp * 2, h: ch - mp * 2 })
      xAcc += colW
    }
    yAcc += rowH
  }

  // Clip hexes to the union of all per-cell content areas
  const clipId = 'margin-clip'

  return (
    <svg
      width={frameW}
      height={frameH}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      <defs>
        <clipPath id={clipId}>
          {cellRects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
          ))}
        </clipPath>
      </defs>

      {/* Hex grid clipped at margin boundaries */}
      <g clipPath={`url(#${clipId})`} opacity={0.75}>
        {hexPoints.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="rgba(40, 70, 30, 0.6)"
            strokeWidth={1}
          />
        ))}
      </g>

      {/* Per-cell margin guide lines */}
      {mp > 0 && cellRects.map((r, i) => (
        <rect
          key={i}
          x={r.x} y={r.y} width={r.w} height={r.h}
          fill={multiSheet ? 'none' : 'none'}
          stroke="rgba(20, 15, 10, 0.6)"
          strokeWidth={1.5}
          strokeDasharray="6,4"
        />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Main map view
// ---------------------------------------------------------------------------

type Edge = 'left' | 'right' | 'top' | 'bottom'

export function MapView({ editable = false }: { editable?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const [frameDims, setFrameDims] = useState({ w: 0, h: 0 })
  const [containerDims, setContainerDims] = useState({ w: 0, h: 0 })
  const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null)
  const [pickerEdge, setPickerEdge] = useState<Edge | null>(null)

  const { mapMode, pageGrid, hexSizeMm, hexOrientation, marginMm, hexEdgeMode, center, setMapState, setFramePixelWidth, flyTarget, clearFlyTarget, setPageGrid } = useMapStore()
  const [cwMm, chMm] = pageGridTotalMm(pageGrid)

  // Recompute frame pixel size when viewport or paper settings change
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const compute = () => {
      const vw = el.clientWidth
      const vh = el.clientHeight
      setContainerDims({ w: vw, h: vh })
      const aspect = cwMm / chMm
      const margin = FRAME_MARGIN

      let fw = vw * margin
      let fh = fw / aspect
      if (fh > vh * margin) {
        fh = vh * margin
        fw = fh * aspect
      }

      fw = Math.round(fw)
      fh = Math.round(fh)

      if (frameRef.current) {
        frameRef.current.style.width = `${fw}px`
        frameRef.current.style.height = `${fh}px`
      }
      setFrameDims({ w: fw, h: fh })
      setFramePixelWidth(fw)
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cwMm, chMm, setFramePixelWidth])

  // Adjust zoom when combined dims change to preserve km/hex scale
  const prevCombinedRef = useRef<[number, number] | null>(null)
  useEffect(() => {
    const prev = prevCombinedRef.current
    prevCombinedRef.current = [cwMm, chMm]
    if (!prev || !mapRef.current || !containerRef.current) return
    const [prevCw, prevCh] = prev
    if (prevCw === cwMm && prevCh === chMm) return

    const el = containerRef.current
    const vw = el.clientWidth
    const vh = el.clientHeight
    const calcFw = (cw: number, ch: number) => {
      let fw = vw * FRAME_MARGIN
      let fh = fw / (cw / ch)
      if (fh > vh * FRAME_MARGIN) { fh = vh * FRAME_MARGIN; fw = fh * (cw / ch) }
      return Math.round(fw)
    }

    const oldFw = calcFw(prevCw, prevCh)
    const newFw = calcFw(cwMm, chMm)
    if (oldFw === 0 || newFw === 0) return

    const newZoom = mapRef.current.getZoom() + Math.log2((newFw * prevCw) / (oldFw * cwMm))
    mapRef.current.setZoom(newZoom)
  }, [cwMm, chMm])

  // Fly to target when set from outside (search / quick jumps)
  useEffect(() => {
    if (!flyTarget || !mapRef.current) return
    mapRef.current.flyTo({ center: flyTarget.center, zoom: flyTarget.zoom, duration: 1200 })
    clearFlyTarget()
  }, [flyTarget?.id])

  // Init MapLibre once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: center,
      zoom: 7,
      bearing: 0,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')

    const onMove = () => {
      const c = map.getCenter()
      setMapState(map.getBearing(), [c.lng, c.lat], map.getZoom())
    }
    map.on('moveend', onMove)
    map.on('load', onMove)

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Editable-mode geometry ──────────────────────────────────────────────────

  const EDGE_ZONE = 52
  const fw = frameDims.w, fh = frameDims.h
  const fx = (containerDims.w - fw) / 2
  const fy = (containerDims.h - fh) / 2

  // Pixel boundaries of each column / row, relative to container
  const colBounds = pageGrid.colWidths.reduce<number[]>(
    (acc, w) => [...acc, acc[acc.length - 1] + fw * w / cwMm], [fx]
  )
  const rowBounds = pageGrid.rowHeights.reduce<number[]>(
    (acc, h) => [...acc, acc[acc.length - 1] + fh * h / chMm], [fy]
  )

  // Paper-chrome registration mark geometry
  const CH = 24        // arm length beyond frame corners
  const SEAM_TICK = 7  // tick mark length at seam edges
  const CHROME_COLOR = 'rgba(20, 15, 10, 0.8)'
  const colSeamSvgXs = colBounds.slice(1, -1).map(b => b - fx + CH)
  const rowSeamSvgYs = rowBounds.slice(1, -1).map(b => b - fy + CH)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!editable || fw === 0) return
    const rect = containerRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) {
      if (!pickerEdge) setHoveredEdge(null)
      let col = pageGrid.colWidths.length - 1
      for (let c = 0; c < colBounds.length - 1; c++) {
        if (x < colBounds[c + 1]) { col = c; break }
      }
      let row = pageGrid.rowHeights.length - 1
      for (let r = 0; r < rowBounds.length - 1; r++) {
        if (y < rowBounds[r + 1]) { row = r; break }
      }
      setHoveredCell({ col, row })
      return
    }
    setHoveredCell(null)
    if (pickerEdge) return
    const inYBand = y >= fy && y <= fy + fh
    const inXBand = x >= fx && x <= fx + fw
    if (x >= fx - EDGE_ZONE && x < fx && inYBand) setHoveredEdge('left')
    else if (x > fx + fw && x <= fx + fw + EDGE_ZONE && inYBand) setHoveredEdge('right')
    else if (y >= fy - EDGE_ZONE && y < fy && inXBand) setHoveredEdge('top')
    else if (y > fy + fh && y <= fy + fh + EDGE_ZONE && inXBand) setHoveredEdge('bottom')
    else setHoveredEdge(null)
  }

  function handleMouseLeave() {
    if (!pickerEdge) { setHoveredEdge(null); setHoveredCell(null) }
  }

  function edgeSizeLabel(isCol: boolean, mm: number) {
    const info = isCol ? cellPaperInfo(mm, pageGrid.rowHeights[0]) : cellPaperInfo(pageGrid.colWidths[0], mm)
    return info ? `${info.size} ${info.orientation === 'landscape' ? '↔' : '↕'}` : `${mm}mm`
  }

  function handleAddClick(edge: Edge) {
    const isCol = edge === 'left' || edge === 'right'
    const opts = isCol ? validColWidthsForRows(pageGrid.rowHeights) : validRowHeightsForCols(pageGrid.colWidths)
    if (opts.length === 0) return
    if (opts.length === 1) { applyAdd(edge, opts[0]); return }
    setPickerEdge(edge)
  }

  function applyAdd(edge: Edge, mm: number) {
    const g = pageGrid
    if (edge === 'left') setPageGrid({ ...g, colWidths: [mm, ...g.colWidths] })
    else if (edge === 'right') setPageGrid({ ...g, colWidths: [...g.colWidths, mm] })
    else if (edge === 'top') setPageGrid({ ...g, rowHeights: [mm, ...g.rowHeights] })
    else setPageGrid({ ...g, rowHeights: [...g.rowHeights, mm] })
    setPickerEdge(null); setHoveredEdge(null)
  }

  function removeCol(col: number) {
    setPageGrid({ ...pageGrid, colWidths: pageGrid.colWidths.filter((_, i) => i !== col) })
    setHoveredCell(null)
  }
  function removeRow(row: number) {
    setPageGrid({ ...pageGrid, rowHeights: pageGrid.rowHeights.filter((_, i) => i !== row) })
    setHoveredCell(null)
  }

  // ── Overlay element positions ───────────────────────────────────────────────

  const EDGE_GAP = 28  // distance from frame edge to button centre
  const addBtnCenter: Record<Edge, { x: number; y: number }> = {
    left:   { x: fx - EDGE_GAP,      y: fy + fh / 2 },
    right:  { x: fx + fw + EDGE_GAP, y: fy + fh / 2 },
    top:    { x: fx + fw / 2,        y: fy - EDGE_GAP },
    bottom: { x: fx + fw / 2,        y: fy + fh + EDGE_GAP },
  }

  const pickerPos: Record<Edge, React.CSSProperties> = {
    left:   { right: containerDims.w - fx + 8,        top: fy + fh / 2 - 40 },
    right:  { left: fx + fw + EDGE_GAP * 2 + 4,       top: fy + fh / 2 - 40 },
    top:    { left: fx + fw / 2 - 50, bottom: containerDims.h - fy + 8 },
    bottom: { left: fx + fw / 2 - 50, top: fy + fh + EDGE_GAP * 2 + 4 },
  }

  const pillBase: React.CSSProperties = {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(14, 13, 11, 0.88)',
    border: '1px solid rgba(100, 95, 88, 0.5)',
    borderRadius: 3,
    color: '#888078',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: 0.5,
    padding: '4px 9px',
    cursor: 'pointer',
    userSelect: 'none',
    pointerEvents: 'auto',
    whiteSpace: 'nowrap' as const,
  }

  const pillHoverOn  = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = '#ddd8d0'
    e.currentTarget.style.borderColor = 'rgba(180, 172, 160, 0.7)'
  }
  const pillHoverOff = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = '#888078'
    e.currentTarget.style.borderColor = 'rgba(100, 95, 88, 0.5)'
  }

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
      onMouseMove={editable ? handleMouseMove : undefined}
      onMouseLeave={editable ? handleMouseLeave : undefined}
    >
      {/* Paper frame — stays fixed on screen while map rotates beneath */}
      <div
        ref={frameRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.30)',
          pointerEvents: 'none',
          zIndex: 2,
          overflow: 'hidden',
        }}
      >
        {mapMode !== 'p2p' && (
          <HexPreviewSVG
            frameW={frameDims.w}
            frameH={frameDims.h}
            paperWidthMm={cwMm}
            paperHeightMm={chMm}
            pageGrid={pageGrid}
            hexSizeMm={hexSizeMm}
            hexOrientation={hexOrientation}
            marginMm={marginMm}
            hexEdgeMode={hexEdgeMode}
          />
        )}
        {pageGrid.colWidths.slice(0, -1).reduce<{ seams: number[]; acc: number }>(
          ({ seams, acc }, w) => ({ seams: [...seams, acc + w], acc: acc + w }), { seams: [], acc: 0 }
        ).seams.map((xMm, i) => (
          <div key={`sv-${i}`} style={{
            position: 'absolute',
            left: `calc(${xMm / cwMm * 100}% - 1.5px)`,
            top: 0, width: 3, height: '100%',
            background: 'rgba(20, 15, 10, 0.8)',
            pointerEvents: 'none',
          }} />
        ))}
        {pageGrid.rowHeights.slice(0, -1).reduce<{ seams: number[]; acc: number }>(
          ({ seams, acc }, h) => ({ seams: [...seams, acc + h], acc: acc + h }), { seams: [], acc: 0 }
        ).seams.map((yMm, j) => (
          <div key={`sh-${j}`} style={{
            position: 'absolute',
            left: 0, top: `calc(${yMm / chMm * 100}% - 1.5px)`,
            width: '100%', height: 3,
            background: 'rgba(20, 15, 10, 0.8)',
            pointerEvents: 'none',
          }} />
        ))}
      </div>

      {/* Paper-chrome: corner registration marks, dimension labels, seam ticks */}
      {fw > 0 && (() => {
        const x0 = CH, y0 = CH, x1 = CH + fw, y1 = CH + fh
        return (
          <svg
            width={fw + CH * 2} height={fh + CH * 2}
            style={{
              position: 'absolute',
              left: fx - CH, top: fy - CH,
              pointerEvents: 'none', zIndex: 3, overflow: 'visible',
            }}
          >
            {/* Frame border */}
            <rect x={x0} y={y0} width={fw} height={fh} fill="none" stroke={CHROME_COLOR} strokeWidth={3} />
            {/* Corner L-marks — same stroke, extend outward */}
            <path d={`M ${x0},0 L ${x0},${y0} L 0,${y0}`}             fill="none" stroke={CHROME_COLOR} strokeWidth={3} />
            <path d={`M ${x1},0 L ${x1},${y0} L ${x1+CH},${y0}`}      fill="none" stroke={CHROME_COLOR} strokeWidth={3} />
            <path d={`M 0,${y1} L ${x0},${y1} L ${x0},${y1+CH}`}      fill="none" stroke={CHROME_COLOR} strokeWidth={3} />
            <path d={`M ${x1+CH},${y1} L ${x1},${y1} L ${x1},${y1+CH}`} fill="none" stroke={CHROME_COLOR} strokeWidth={3} />
            {/* Width label */}
            <text
              x={(x0 + x1) / 2} y={y0 / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={10} fontFamily="ui-monospace,monospace"
              fill={CHROME_COLOR} letterSpacing={0.5}
            >{cwMm.toFixed(0)} mm</text>
            {/* Height label */}
            <text
              x={x0 / 2} y={(y0 + y1) / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={10} fontFamily="ui-monospace,monospace"
              fill={CHROME_COLOR} letterSpacing={0.5}
              transform={`rotate(-90,${x0 / 2},${(y0 + y1) / 2})`}
            >{chMm.toFixed(0)} mm</text>
            {/* Column seam ticks */}
            {colSeamSvgXs.map((sx, i) => (
              <g key={i}>
                <line x1={sx} y1={y0 - SEAM_TICK} x2={sx} y2={y0} stroke={CHROME_COLOR} strokeWidth={3} />
                <line x1={sx} y1={y1} x2={sx} y2={y1 + SEAM_TICK} stroke={CHROME_COLOR} strokeWidth={3} />
              </g>
            ))}
            {/* Row seam ticks */}
            {rowSeamSvgYs.map((sy, i) => (
              <g key={i}>
                <line x1={x0 - SEAM_TICK} y1={sy} x2={x0} y2={sy} stroke={CHROME_COLOR} strokeWidth={3} />
                <line x1={x1} y1={sy} x2={x1 + SEAM_TICK} y2={sy} stroke={CHROME_COLOR} strokeWidth={3} />
              </g>
            ))}
          </svg>
        )
      })()}

      {/* ── Page-grid edit overlays ── */}
      {editable && fw > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>

          {/* + buttons on edges */}
          {(['left', 'right', 'top', 'bottom'] as Edge[]).map(edge => {
            if (hoveredEdge !== edge && pickerEdge !== edge) return null
            const isCol = edge === 'left' || edge === 'right'
            const opts = isCol ? validColWidthsForRows(pageGrid.rowHeights) : validRowHeightsForCols(pageGrid.colWidths)
            if (opts.length === 0) return null
            const { x, y } = addBtnCenter[edge]
            return (
              <div
                key={edge}
                onClick={() => handleAddClick(edge)}
                onMouseEnter={pillHoverOn}
                onMouseLeave={pillHoverOff}
                style={{ ...pillBase, left: x, top: y }}
              >
                + {isCol ? 'COL' : 'ROW'}
              </div>
            )
          })}

          {/* Size picker */}
          {pickerEdge && (() => {
            const isCol = pickerEdge === 'left' || pickerEdge === 'right'
            const opts = isCol ? validColWidthsForRows(pageGrid.rowHeights) : validRowHeightsForCols(pageGrid.colWidths)
            return (
              <div style={{
                position: 'absolute',
                ...pickerPos[pickerEdge],
                background: 'rgba(14, 13, 11, 0.94)',
                border: '1px solid rgba(100, 95, 88, 0.5)',
                borderRadius: 3,
                padding: 4,
                display: 'flex',
                flexDirection: isCol ? 'column' : 'row',
                gap: 3,
                pointerEvents: 'auto',
              }}>
                {opts.map(mm => (
                  <button
                    key={mm}
                    onClick={() => applyAdd(pickerEdge, mm)}
                    onMouseEnter={pillHoverOn}
                    onMouseLeave={pillHoverOff}
                    style={{
                      padding: '4px 10px',
                      background: 'none',
                      border: '1px solid rgba(100, 95, 88, 0.4)',
                      borderRadius: 3,
                      color: '#888078',
                      cursor: 'pointer',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 11, whiteSpace: 'nowrap',
                    }}
                  >{edgeSizeLabel(isCol, mm)}</button>
                ))}
              </div>
            )
          })()}

          {/* × remove column */}
          {hoveredCell && hoveredCell.col > 0 && (() => {
            const col = hoveredCell.col
            const cx = (colBounds[col] + colBounds[col + 1]) / 2
            return (
              <div
                onClick={() => removeCol(col)}
                onMouseEnter={pillHoverOn}
                onMouseLeave={pillHoverOff}
                style={{ ...pillBase, left: cx, top: fy + fh / 2 }}
              >× REM COL</div>
            )
          })()}

          {/* × remove row */}
          {hoveredCell && hoveredCell.row > 0 && (() => {
            const row = hoveredCell.row
            const cy = (rowBounds[row] + rowBounds[row + 1]) / 2
            return (
              <div
                onClick={() => removeRow(row)}
                onMouseEnter={pillHoverOn}
                onMouseLeave={pillHoverOff}
                style={{ ...pillBase, left: fx + fw / 2, top: cy }}
              >× REM ROW</div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
