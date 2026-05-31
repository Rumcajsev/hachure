import type { ActiveTool, SettlementTier, SettlementTierStyle } from '../store/mapStore'

function svgCursor(svg: string, hx: number, hy: number, fallback = 'crosshair'): string {
  return `url("data:image/svg+xml;base64,${btoa(svg)}") ${hx} ${hy}, ${fallback}`
}

const ROAD_COLORS: Record<0 | 1 | 2, string> = { 0: '#b07820', 1: '#8a5c2a', 2: '#606060' }
const ROAD_WIDTHS: Record<0 | 1 | 2, number> = { 0: 4, 1: 2.5, 2: 1.5 }

function roadBrushCursor(tier: 0 | 1 | 2): string {
  const color = ROAD_COLORS[tier]
  const w = ROAD_WIDTHS[tier]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="0" y1="12" x2="24" y2="12" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/><line x1="12" y1="0" x2="12" y2="24" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/><line x1="3" y1="12" x2="21" y2="12" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5" fill="white" opacity="0.55"/></svg>`
  return svgCursor(svg, 12, 12)
}

function eraserCursor(color = '#9e5a5a'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="5" y="9" width="14" height="9" rx="2" fill="#252530" stroke="${color}" stroke-width="1.5"/><rect x="5" y="9" width="7" height="9" rx="2" fill="#2e2020"/><line x1="5" y1="14" x2="19" y2="14" stroke="${color}" stroke-width="0.5" opacity="0.5"/><circle cx="2" cy="21" r="1.5" fill="${color}" opacity="0.7"/></svg>`
  return svgCursor(svg, 2, 21, 'not-allowed')
}

function railBrushCursor(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="0" y1="12" x2="24" y2="12" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/><line x1="12" y1="0" x2="12" y2="24" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/><line x1="3" y1="9" x2="21" y2="9" stroke="#6a8aaa" stroke-width="1.5"/><line x1="3" y1="15" x2="21" y2="15" stroke="#6a8aaa" stroke-width="1.5"/><line x1="6" y1="7" x2="6" y2="17" stroke="#6a8aaa" stroke-width="1"/><line x1="12" y1="7" x2="12" y2="17" stroke="#6a8aaa" stroke-width="1"/><line x1="18" y1="7" x2="18" y2="17" stroke="#6a8aaa" stroke-width="1"/></svg>`
  return svgCursor(svg, 12, 12)
}

function riverBrushCursor(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 13 Q6 7 10 13 Q14 19 18 13 Q20 10 22 11" stroke="#4a8aaa" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="3" r="2" fill="#4a8aaa" opacity="0.85"/></svg>`
  return svgCursor(svg, 3, 3)
}

function canalBrushCursor(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="3" y1="9" x2="21" y2="9" stroke="#4a6a8a" stroke-width="1.5"/><line x1="3" y1="15" x2="21" y2="15" stroke="#4a6a8a" stroke-width="1.5"/><rect x="3" y="9" width="18" height="6" fill="#4a6a8a" opacity="0.12"/><circle cx="3" cy="3" r="2" fill="#4a6a8a" opacity="0.85"/></svg>`
  return svgCursor(svg, 3, 3)
}

function terrainBrushCursor(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="13" r="9" fill="${color}" opacity="0.75" stroke="rgba(0,0,0,0.4)" stroke-width="1"/><circle cx="3" cy="3" r="2" fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/></svg>`
  return svgCursor(svg, 3, 3)
}

function elevationBrushCursor(brush: 'flat' | 'hills' | 'mountains'): string {
  let color: string
  let inner: string
  if (brush === 'flat') {
    color = '#5a9e6f'
    inner = `<line x1="3" y1="15" x2="21" y2="15" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
  } else if (brush === 'hills') {
    color = '#8a6a4a'
    inner = `<path d="M3 17 Q8 7 13 17" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M11 17 Q16 9 21 17" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.6"/>`
  } else {
    color = '#7a7a9a'
    inner = `<path d="M3 19 L9 7 L15 19" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 19 L18 9 L24 19" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">${inner}<circle cx="3" cy="3" r="2" fill="${color}" opacity="0.85"/></svg>`
  return svgCursor(svg, 3, 3)
}

function lakeBrushCursor(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><ellipse cx="12" cy="14" rx="9" ry="6" fill="#4a7a9a" opacity="0.7" stroke="#2a5a7a" stroke-width="1"/><path d="M7 13 Q10 10 13 13 Q16 16 19 13" stroke="white" stroke-width="0.8" fill="none" opacity="0.45"/><circle cx="3" cy="3" r="2" fill="#4a7a9a" opacity="0.85"/></svg>`
  return svgCursor(svg, 3, 3)
}

function highlightBrushCursor(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M12 4 L19 9 L16 19 L8 19 L5 9 Z" fill="${color}" opacity="0.65" stroke="rgba(0,0,0,0.35)" stroke-width="1"/><circle cx="3" cy="3" r="2" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/></svg>`
  return svgCursor(svg, 3, 3)
}

function settlementCursor(tier: SettlementTier, style: SettlementTierStyle): string {
  const radii: Record<SettlementTier, number> = { 1: 9, 2: 7, 3: 5, 4: 3 }
  const r = radii[tier]
  const inner = style.shape === 'circle'
    ? `<circle cx="12" cy="12" r="${r}" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${style.strokeWidth + 0.5}"/>`
    : `<rect x="${12 - r}" y="${12 - r}" width="${r * 2}" height="${r * 2}" fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${style.strokeWidth + 0.5}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">${inner}<circle cx="3" cy="3" r="2" fill="${style.strokeColor}" opacity="0.85"/></svg>`
  return svgCursor(svg, 3, 3, 'crosshair')
}

function urbanPaintCursor(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="9" y="5" width="10" height="14" rx="1" fill="#6a6a8a" stroke="#4a4a7a" stroke-width="1"/><rect x="5" y="10" width="7" height="9" rx="1" fill="#5a5a7a" stroke="#4a4a7a" stroke-width="1"/><rect x="11" y="9" width="3" height="3" fill="#1a1a2a" opacity="0.55"/><rect x="15" y="9" width="2" height="2" fill="#1a1a2a" opacity="0.55"/><circle cx="3" cy="3" r="2" fill="#6a6a8a" opacity="0.85"/></svg>`
  return svgCursor(svg, 3, 3)
}

export function getToolCursor(
  activeTool: ActiveTool,
  opts: {
    terrainColors: Record<string, string>
    highlights: Array<{ id: string; color: string }>
    settlementTier?: SettlementTier | null
    settlementTierStyles?: Record<SettlementTier, SettlementTierStyle>
  }
): string {
  if (opts.settlementTier && opts.settlementTierStyles) {
    return settlementCursor(opts.settlementTier, opts.settlementTierStyles[opts.settlementTier])
  }
  switch (activeTool.type) {
    case 'none':
      return 'grab'
    case 'terrain':
      return terrainBrushCursor(opts.terrainColors[activeTool.brush] ?? '#888')
    case 'elevation':
      return elevationBrushCursor(activeTool.brush)
    case 'lake':
      return lakeBrushCursor()
    case 'road':
      return activeTool.erasing ? eraserCursor('#9e5a5a') : roadBrushCursor(activeTool.tier)
    case 'rail':
      return activeTool.erasing ? eraserCursor('#9e5a5a') : railBrushCursor()
    case 'node-edit':
    case 'river-node-edit':
    case 'river-select':
    case 'canal-select':
    case 'road-select':
      return 'default'
    case 'river-paint':
      return riverBrushCursor()
    case 'canal-paint':
      return canalBrushCursor()
    case 'highlight-paint': {
      const hl = opts.highlights.find(h => h.id === activeTool.id)
      return highlightBrushCursor(hl?.color ?? '#a0a060')
    }
    case 'highlight-erase': {
      const hl = opts.highlights.find(h => h.id === activeTool.id)
      return eraserCursor(hl?.color ?? '#9e5a5a')
    }
    case 'urban':
      return activeTool.mode === 'erase' ? eraserCursor('#6a6a8a') : urbanPaintCursor()
    case 'align-image':
      return 'grab'
    default:
      return 'crosshair'
  }
}
