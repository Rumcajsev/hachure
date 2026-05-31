import { useEffect, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'

export type ContextMenuItem = {
  label: string
  action: () => void
  destructive?: boolean
}

export type ContextMenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function CanvasContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const t = useTheme()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  // Clamp to viewport so the menu never clips off-screen
  const menuW = 172
  const left = Math.min(menu.x, window.innerWidth - menuW - 8)
  const top = menu.y

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        background: t.bg,
        border: `1px solid ${t.line}`,
        borderRadius: 5,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        minWidth: menuW,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {menu.items.map((item, i) => (
        <button
          key={i}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { item.action(); onClose() }}
          style={{
            display: 'block',
            width: '100%',
            padding: '7px 14px',
            textAlign: 'left',
            border: 'none',
            borderTop: i > 0 ? `1px solid ${t.line2}` : 'none',
            background: 'transparent',
            color: item.destructive ? '#c0392b' : t.ink,
            fontFamily: t.mono,
            fontSize: 12,
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = t.bg2 }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
