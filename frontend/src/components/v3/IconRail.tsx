import { useTheme } from '../../context/ThemeContext'

export type V3Panel = 'terrain' | 'roads' | 'rivers' | 'settlements' | 'highlights' | 'overlays' | 'display'

const ICONS: { id: V3Panel; label: string; svg: string }[] = [
  {
    id: 'terrain',
    label: 'Terrain',
    svg: `<path d="M8 14L4 8l4-4 4 4-1.5 2.5L12 14H8z" fill="currentColor" opacity="0.9"/>
          <path d="M12 14l2-4 2 4h-4z" fill="currentColor" opacity="0.5"/>`,
  },
  {
    id: 'roads',
    label: 'Roads',
    svg: `<path d="M3 13h2l1-3h4l1 3h2L10 4H6L3 13z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <line x1="8" y1="4" x2="8" y2="14" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5"/>`,
  },
  {
    id: 'rivers',
    label: 'Rivers',
    svg: `<path d="M3 5 C5 5, 6 8, 8 8 C10 8, 11 5, 13 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M3 9 C5 9, 7 12, 9 11 C11 10, 12 9, 14 10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.6"/>`,
  },
  {
    id: 'settlements',
    label: 'Settlements',
    svg: `<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <circle cx="8" cy="8" r="1" fill="currentColor"/>
          <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" stroke-width="1.2"/>
          <line x1="8" y1="11.5" x2="8" y2="14" stroke="currentColor" stroke-width="1.2"/>
          <line x1="2" y1="8" x2="4.5" y2="8" stroke="currentColor" stroke-width="1.2"/>
          <line x1="11.5" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.2"/>`,
  },
  {
    id: 'highlights',
    label: 'Highlights',
    svg: `<polygon points="8,3 10,7 14,7 11,10 12,14 8,12 4,14 5,10 2,7 6,7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`,
  },
  {
    id: 'overlays',
    label: 'Overlays',
    svg: `<rect x="3" y="3" width="5" height="5" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <rect x="8" y="8" width="5" height="5" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.6"/>
          <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1"/>`,
  },
  {
    id: 'display',
    label: 'Display',
    svg: `<rect x="2" y="4" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <line x1="5" y1="14" x2="11" y2="14" stroke="currentColor" stroke-width="1.3"/>
          <line x1="8" y1="13" x2="8" y2="14" stroke="currentColor" stroke-width="1.3"/>`,
  },
]

const RAIL_W = 48

interface IconRailProps {
  active: V3Panel | null
  onSelect: (panel: V3Panel) => void
  onSetup: () => void
}

export function IconRail({ active, onSelect, onSetup }: IconRailProps) {
  const t = useTheme()

  return (
    <div style={{
      width: RAIL_W,
      flexShrink: 0,
      height: '100%',
      background: t.surface,
      borderRight: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 8,
      gap: 2,
      zIndex: 20,
    }}>
      {ICONS.map(({ id, label, svg }) => {
        const isActive = active === id
        return (
          <RailButton
            key={id}
            label={label}
            svg={svg}
            isActive={isActive}
            onClick={() => onSelect(id)}
          />
        )
      })}

      <div style={{ flex: 1 }} />

      <RailButton
        label="Setup"
        svg={`<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l-1.4 1.4M4.5 11.5l-1.4 1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`}
        isActive={false}
        onClick={onSetup}
      />
    </div>
  )
}

function RailButton({ label, svg, isActive, onClick }: {
  label: string
  svg: string
  isActive: boolean
  onClick: () => void
}) {
  const t = useTheme()

  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        background: isActive ? t.rust : 'transparent',
        color: isActive ? '#fff' : t.ink2,
        transition: 'background 0.12s, color 0.12s',
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" dangerouslySetInnerHTML={{ __html: svg }} />
    </button>
  )
}

export { RAIL_W }
