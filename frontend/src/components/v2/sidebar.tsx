import { useRef, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

// ── Strip / flyout layout constants ──────────────────────────────────────────

export const STRIP_W = 176
export const FLYOUT_W = 232

// ── StripShell ────────────────────────────────────────────────────────────────

export function StripShell({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <div style={{
      width: STRIP_W,
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: t.surface,
      borderRight: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {children}
    </div>
  )
}

// ── FlyoutShell ───────────────────────────────────────────────────────────────

export function FlyoutShell({
  title, subtitle, onClose, onTitleChange, children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  onTitleChange?: (v: string) => void
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: STRIP_W,
      width: FLYOUT_W,
      maxHeight: '100%',
      overflowY: 'auto',
      background: t.surface,
      borderTop: `1px solid ${t.line}`,
      borderRight: `1px solid ${t.line}`,
      borderBottom: `1px solid ${t.line}`,
      borderLeft: `3px solid ${t.ink}`,
      boxShadow: t.shadowFlyout,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '9px 12px 7px',
        borderBottom: `1px solid ${t.line2}`,
        display: 'flex', alignItems: 'flex-start', gap: 6,
        flexShrink: 0,
        position: 'sticky', top: 0, background: t.surface, zIndex: 1,
      }}>
        <div style={{ flex: 1 }}>
          {onTitleChange ? (
            <input
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              style={{
                fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, color: t.ink,
                background: 'transparent', border: 'none', outline: 'none', padding: 0,
                width: '100%',
              }}
            />
          ) : (
            <div style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, color: t.ink }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ fontFamily: t.sans, fontSize: 10, color: t.inkFaint, marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: t.inkFaint, display: 'flex', alignItems: 'center' }}
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>
      <div style={{ padding: '6px 0 12px' }}>
        {children}
      </div>
    </div>
  )
}

// ── V2Divider ─────────────────────────────────────────────────────────────────

export function V2Divider({ label }: { label: string }) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 8px 3px' }}>
      <div style={{ width: 6, height: 1, background: t.line, flexShrink: 0 }} />
      <span style={{
        fontFamily: t.mono, fontSize: 7.5, letterSpacing: 0.8,
        color: t.inkFaint, textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: t.line }} />
    </div>
  )
}

// ── TriggerRow ────────────────────────────────────────────────────────────────

export function TriggerRow({
  label, icon, active, onClick,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  const t = useTheme()
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        margin: '1px 5px', padding: '3px 6px',
        width: 'calc(100% - 10px)',
        background: active ? t.ink : hov ? t.paper2 : 'transparent',
        border: `1px solid ${active ? t.ink : hov ? t.line : 'transparent'}`,
        cursor: 'pointer',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      {icon && (
        <span style={{ color: active ? 'rgba(251,249,244,0.7)' : t.inkFaint, display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
      )}
      <span style={{
        flex: 1,
        fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.4,
        color: active ? t.surface : hov ? t.ink2 : t.inkFaint,
        textAlign: 'left',
      }}>
        {label}
      </span>
      <svg width="6" height="6" viewBox="0 0 8 8" fill="none"
        stroke={active ? 'rgba(251,249,244,0.4)' : t.inkFaint}
        strokeWidth="1.4" strokeLinecap="round">
        <path d="M3 1.5l2.5 2.5L3 6.5" />
      </svg>
    </button>
  )
}

// ── TGap ──────────────────────────────────────────────────────────────────────

export const TGap = () => <div style={{ height: 3 }} />

// ── Helpers ──────────────────────────────────────────────────────────────────

export function tintBg(hex: string, opacity: number): string {
  const t = useTheme()
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <div style={{
      width: t.sidebarWidth,
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: t.surface,
      border: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {children}
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

export function SidebarHeader({ title, count }: { title: string; count?: number }) {
  const t = useTheme()
  return (
    <div style={{ padding: '16px 14px 12px', borderBottom: `1px solid ${t.line2}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: t.serif, fontSize: 22, fontWeight: 400, color: t.ink }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.inkFaint, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            {count} brushes
          </span>
        )}
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function SidebarSection({
  label, sub, action, children,
}: {
  label: string; sub?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <div style={{ borderTop: `1px solid ${t.line2}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', padding: '12px 14px 6px', gap: 6 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1, color: t.ink2, textTransform: 'uppercase', fontWeight: 600 }}>
          {label}
        </span>
        {sub && <span style={{ fontFamily: t.mono, fontSize: 9, color: t.inkFaint }}>· {sub}</span>}
        {action && <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{action}</div>}
      </div>
      <div style={{ padding: '0 0 10px' }}>
        {children}
      </div>
    </div>
  )
}

// ── BrushRow ──────────────────────────────────────────────────────────────────

interface BrushRowProps {
  label: string
  color: string
  active: boolean
  shortcut?: string
  showCog?: boolean
  cogOpen?: boolean
  customShape?: boolean
  onSelect: () => void
  onCog?: (y: number) => void
  cogDataAttr?: string
}

export function BrushRow({ label, color, active, shortcut, showCog, cogOpen, customShape, onSelect, onCog, cogDataAttr }: BrushRowProps) {
  const t = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '16px 1fr auto auto',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px 7px 10px',
        borderLeft: `2px solid ${active ? color : 'transparent'}`,
        background: active ? tintBg(color, 0.18) : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Swatch */}
      <div style={{ position: 'relative', width: 14, height: 14, flexShrink: 0 }}>
        <div style={{
          width: 14,
          height: 14,
          background: color,
          border: `1px solid rgba(0,0,0,0.18)`,
        }} />
        {customShape && (
          <span title="Custom blob shape" style={{
            position: 'absolute',
            bottom: -2, right: -2,
            width: 5, height: 5,
            borderRadius: 1,
            background: t.rust,
            transform: 'rotate(45deg)',
            display: 'block',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          }} />
        )}
      </div>

      {/* Label */}
      <span style={{
        fontFamily: t.sans,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        color: t.ink,
        textTransform: 'capitalize',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>

      {/* Cog */}
      {showCog && (
        <button
          {...(cogDataAttr ? { [cogDataAttr]: '' } : {})}
          onClick={e => { e.stopPropagation(); onCog?.(e.currentTarget.getBoundingClientRect().top) }}
          style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: cogOpen ? t.rust : t.inkFaint,
            opacity: active || cogOpen || hovered ? 1 : 0,
            padding: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="6" cy="6" r="1.8" />
            <path d="M6 0v2M6 10v2M0 6h2M10 6h2M2 2l1.4 1.4M8.6 8.6L10 10M2 10l1.4-1.4M8.6 3.4L10 2" />
          </svg>
        </button>
      )}

      {/* Shortcut badge */}
      {shortcut && (
        <span style={{
          fontFamily: t.mono,
          fontSize: 9.5,
          color: active ? t.ink : t.inkFaint,
          padding: '1px 5px',
          borderTop: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
          borderLeft: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
          borderRight: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
          borderBottom: `2px solid ${active ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.18)'}`,
          background: t.paper,
          minWidth: 16,
          textAlign: 'center',
          display: 'inline-block',
        }}>
          {shortcut}
        </span>
      )}
    </div>
  )
}

// ── ElevBrushRow ──────────────────────────────────────────────────────────────

interface ElevBrushRowProps {
  tier: 0 | 1 | 2
  label: string
  color: string
  active: boolean
  shortcut: string
  showCog?: boolean
  cogOpen?: boolean
  customShape?: boolean
  onSelect: () => void
  onCog?: () => void
}

export function ElevBrushRow({ tier, label, color, active, shortcut, showCog, cogOpen, customShape, onSelect, onCog }: ElevBrushRowProps) {
  const t = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: `36px 1fr ${showCog ? 'auto ' : ''}auto`,
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px 6px 10px',
        borderLeft: `2px solid ${active ? color : 'transparent'}`,
        background: active ? tintBg(color, 0.15) : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* SVG glyph */}
      <div style={{ position: 'relative', width: 36, height: 20, flexShrink: 0 }}>
        <svg width="36" height="20" viewBox="0 0 36 20">
          {tier === 0 && <line x1="2" y1="10" x2="34" y2="10" stroke={color} strokeWidth="2" />}
          {tier === 1 && <path d="M2 16 Q8 5 14 9 T26 7 T34 13 L34 18 L2 18 Z" fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth="0.6" />}
          {tier === 2 && <path d="M2 18 L10 4 L18 11 L24 5 L34 18 Z" fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />}
        </svg>
        {customShape && (
          <span title="Custom blob shape" style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 5, height: 5, borderRadius: 1,
            background: t.rust, transform: 'rotate(45deg)', display: 'block',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          }} />
        )}
      </div>

      <span style={{ fontFamily: t.sans, fontSize: 12.5, fontWeight: active ? 600 : 500, color: t.ink, textTransform: 'capitalize' }}>
        {label}
      </span>

      {showCog && (
        <button
          onClick={e => { e.stopPropagation(); onCog?.() }}
          style={{
            width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: cogOpen ? t.rust : t.inkFaint,
            opacity: active || cogOpen || hovered ? 1 : 0, padding: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="6" cy="6" r="1.8" />
            <path d="M6 0v2M6 10v2M0 6h2M10 6h2M2 2l1.4 1.4M8.6 8.6L10 10M2 10l1.4-1.4M8.6 3.4L10 2" />
          </svg>
        </button>
      )}

      <span style={{
        fontFamily: t.mono, fontSize: 9.5,
        color: active ? t.ink : t.inkFaint,
        padding: '1px 5px',
        borderTop: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
        borderLeft: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
        borderRight: `1px solid ${active ? 'rgba(0,0,0,0.15)' : t.line}`,
        borderBottom: `2px solid ${active ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.18)'}`,
        background: t.paper,
        minWidth: 16,
        textAlign: 'center',
        display: 'inline-block',
      }}>
        {shortcut}
      </span>
    </div>
  )
}

// ── ToggleRow ─────────────────────────────────────────────────────────────────

export function ToggleRow({
  label, hint, checked, onChange,
}: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  const t = useTheme()
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ display: 'flex', gap: 10, padding: '5px 14px', cursor: 'pointer', alignItems: 'flex-start' }}
    >
      <div style={{
        width: 14,
        height: 14,
        marginTop: 1,
        flexShrink: 0,
        background: checked ? t.rust : 'transparent',
        border: `1px solid ${checked ? t.rust : t.line}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" stroke={t.surface} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 3.5l2.5 2.5L8 1" />
          </svg>
        )}
      </div>
      <div>
        <div style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 500, color: t.ink }}>{label}</div>
        {hint && <div style={{ fontFamily: t.sans, fontSize: 10.5, color: t.inkMute, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
    </div>
  )
}

// ── FlyoutBtn ─────────────────────────────────────────────────────────────────

export function FlyoutBtn({
  label, isOpen, dataAttr, onClick, disabled,
}: {
  label: string; isOpen: boolean; dataAttr?: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean
}) {
  const t = useTheme()
  return (
    <button
      {...(dataAttr ? { [dataAttr]: '' } : {})}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: '7px 14px',
        background: isOpen ? t.rustTint : 'transparent',
        border: 'none',
        borderTop: `1px solid ${t.line2}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: t.sans,
        fontSize: 12,
        color: disabled ? t.inkFaint : isOpen ? t.rust : t.ink2,
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: t.mono, fontSize: 10, color: t.inkFaint }}>›</span>
    </button>
  )
}

// ── DashedAddBtn ──────────────────────────────────────────────────────────────

export function DashedAddBtn({ label, onClick, dataAttr }: { label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; dataAttr?: string }) {
  const t = useTheme()
  return (
    <button
      {...(dataAttr ? { [dataAttr]: '' } : {})}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '4px 10px',
        padding: '7px 12px',
        width: 'calc(100% - 20px)',
        background: 'transparent',
        border: `1px dashed ${t.line}`,
        cursor: 'pointer',
        fontFamily: t.sans,
        fontSize: 11,
        fontWeight: 400,
        color: t.inkFaint,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M6 1v10M1 6h10" />
      </svg>
      {label}
    </button>
  )
}

// ── SectionDivider ────────────────────────────────────────────────────────────

export function SectionDivider() {
  const t = useTheme()
  return <div style={{ height: 1, background: t.line2, margin: '4px 0' }} />
}

// ── SidebarDetailHeader ───────────────────────────────────────────────────────

export function SidebarDetailHeader({
  title, onBack, status, onReset, onTitleChange,
}: {
  title: string
  onBack: () => void
  status?: 'default' | 'modified'
  onReset?: () => void
  onTitleChange?: (v: string) => void
}) {
  const t = useTheme()
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: `1px solid ${t.line2}`,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.inkMute, padding: 0, flexShrink: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 5l3 3" />
        </svg>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' }}>Back</span>
      </button>
      <div style={{ width: 1, height: 12, background: t.line }} />
      {onTitleChange ? (
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          style={{
            fontFamily: t.serif, fontSize: 18, fontWeight: 400, color: t.ink,
            background: 'transparent', border: 'none', outline: 'none',
            flex: 1, minWidth: 0, padding: 0,
          }}
        />
      ) : (
        <span style={{
          fontFamily: t.serif, fontSize: 18, fontWeight: 400, color: t.ink,
          textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {title}
        </span>
      )}
      {status && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontFamily: t.mono, fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600,
            color: status === 'modified' ? t.rust : t.inkFaint,
          }}>
            {status}
          </span>
          {status === 'modified' && onReset && (
            <button
              onClick={onReset}
              title="Reset to defaults"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: t.inkMute, display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4a5 5 0 1 1 .9 4.5" /><path d="M1 1v3h3" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── DetailViewShell ───────────────────────────────────────────────────────────

export function DetailViewShell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <div style={{
      width: t.sidebarWidth,
      height: '100%',
      overflow: 'hidden',
      background: t.surface,
      border: `1px solid ${t.line}`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {header}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

export function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme()
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        width: 30, height: 16, flexShrink: 0,
        background: enabled ? t.ink : t.line,
        border: 'none', cursor: 'pointer', padding: 0,
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3, left: enabled ? 15 : 3,
        width: 10, height: 10,
        background: t.surface,
        transition: 'left 0.12s ease',
      }} />
    </button>
  )
}

// ── DetailSection ─────────────────────────────────────────────────────────────

export function DetailSection({
  label, hint, children, toggle, action, preview,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  toggle?: { enabled: boolean; onChange: (v: boolean) => void }
  action?: React.ReactNode
  preview?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <div style={{ borderTop: `1px solid ${t.line2}` }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 1,
        background: t.paper2,
        borderBottom: `1px solid ${t.line2}`,
        ...(preview ? { position: 'relative' as const } : {}),
      }}>
        {/* When there's a preview, it fills the header area and the label is overlaid */}
        {preview && <div>{preview}</div>}
        <div style={{
          padding: '10px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          ...(preview ? { position: 'absolute' as const, top: 0, left: 0, right: 0 } : {}),
        }}>
          <span style={{
            fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1, fontWeight: 600,
            textTransform: 'uppercase',
            color: toggle && !toggle.enabled ? t.inkFaint : t.ink2,
          }}>
            {label}
          </span>
          {action}
          {toggle && <ToggleSwitch enabled={toggle.enabled} onChange={toggle.onChange} />}
        </div>
        {hint && !preview && (
          <div style={{ padding: '0 14px 8px', fontFamily: t.sans, fontSize: 11, color: t.inkMute, lineHeight: 1.4 }}>
            {hint}
          </div>
        )}
      </div>
      {(!toggle || toggle.enabled) && (
        <div style={{ padding: '8px 0 16px', background: t.surface }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── MiniSlider ────────────────────────────────────────────────────────────────

export function MiniSlider({
  label, display, value, min, max, step, onChange, disabled, accentColor, onDragStart, onDragEnd,
}: {
  label: React.ReactNode; display: string | number; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  accentColor?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const t = useTheme()
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const fillColor = accentColor ?? t.ink

  const compute = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + t * (max - min)
    const snapped = Math.round(raw / step) * step
    onChange(parseFloat(Math.max(min, Math.min(max, snapped)).toFixed(10)))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px', opacity: disabled ? 0.4 : 1 }}>
      <span style={{ fontFamily: t.sans, fontSize: 11, color: t.ink2, flexShrink: 0, width: 96 }}>{label}</span>
      <div
        onPointerDown={e => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); onDragStart?.(); compute(e.clientX) }}
        onPointerMove={e => { if (disabled || e.buttons === 0) return; compute(e.clientX) }}
        onPointerUp={() => onDragEnd?.()}
        onPointerCancel={() => onDragEnd?.()}
        style={{ flex: 1, padding: '6px 0', cursor: disabled ? 'default' : 'ew-resize', userSelect: 'none', touchAction: 'none' }}
      >
        <div ref={trackRef} style={{ position: 'relative', height: 2, background: t.line }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct * 100}%`, background: fillColor }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${pct * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 12, height: 12,
            background: t.surface,
            border: `1.5px solid ${fillColor}`,
          }} />
        </div>
      </div>
      <span style={{ fontFamily: t.mono, fontSize: 10.5, color: t.inkMute, flexShrink: 0, width: 34, textAlign: 'right' }}>{display}</span>
    </div>
  )
}

// ── BigColorSwatch ────────────────────────────────────────────────────────────

type ColorGroup = { label: string; colors: readonly string[] }

function SwatchBtn({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  const t = useTheme()
  return (
    <button
      onClick={onClick}
      title={color}
      style={{
        width: 26, height: 26,
        background: color,
        border: active ? `2px solid ${t.paper}` : `1px solid rgba(0,0,0,0.14)`,
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        boxSizing: 'border-box',
        boxShadow: active ? `0 0 0 1.5px ${t.ink}` : 'none',
        outline: 'none',
      }}
    />
  )
}

export function BigColorSwatch({
  value, onChange, groups,
}: {
  value: string
  onChange: (color: string) => void
  groups: readonly ColorGroup[]
}) {
  const t = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  const norm = (c: string) => c.toLowerCase()
  const paletteColors = groups.flatMap(g => g.colors)

  const [customColors, setCustomColors] = useState<string[]>(() => {
    // Seed with current value if it's already custom
    return paletteColors.some(c => norm(c) === norm(value)) ? [] : [value]
  })

  const handleCustomPick = (color: string) => {
    // If it matches a palette color, just select it without adding to custom list
    if (paletteColors.some(c => norm(c) === norm(color))) {
      onChange(color)
      return
    }
    setCustomColors(prev =>
      prev.some(c => norm(c) === norm(color)) ? prev : [...prev, color]
    )
    onChange(color)
  }

  return (
    <div style={{ padding: '2px 14px 8px' }}>
      {/* Grouped rows */}
      {groups.map(group => (
        <div key={group.label} style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {group.colors.map(color => (
              <SwatchBtn
                key={color}
                color={color}
                active={norm(color) === norm(value)}
                onClick={() => onChange(color)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Custom colors + add button */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {customColors.map(color => (
          <SwatchBtn
            key={color}
            color={color}
            active={norm(color) === norm(value)}
            onClick={() => onChange(color)}
          />
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          title="Custom color…"
          style={{
            width: 26, height: 26,
            background: 'transparent',
            border: `1px dashed ${t.ink2}`,
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={t.ink2} strokeWidth="1.4" strokeLinecap="round">
            <path d="M5 1v8M1 5h8" />
          </svg>
        </button>
      </div>

      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={e => handleCustomPick(e.target.value)}
        style={{ position: 'fixed', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

// ── InlineColorSwatch ─────────────────────────────────────────────────────────

export function InlineColorSwatch({
  value, onChange, palette,
}: {
  value: string
  onChange: (color: string) => void
  palette: readonly string[]
}) {
  const t = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  const norm = (c: string) => c.toLowerCase()
  const isCustom = !palette.some(c => norm(c) === norm(value))

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
      {palette.map(color => {
        const active = norm(color) === norm(value)
        return (
          <button
            key={color}
            onClick={() => onChange(color)}
            title={color}
            style={{
              width: 18, height: 18,
              background: color,
              border: `1px solid rgba(0,0,0,0.12)`,
              cursor: 'pointer', padding: 0, flexShrink: 0,
              boxSizing: 'border-box',
              boxShadow: active ? `0 0 0 2px ${t.surface}, 0 0 0 3.5px ${t.ink}` : 'none',
              outline: 'none',
            }}
          />
        )
      })}
      <button
        onClick={() => inputRef.current?.click()}
        title={isCustom ? value : 'Custom…'}
        style={{
          width: 18, height: 18,
          background: isCustom ? value : 'transparent',
          border: isCustom ? `1px solid rgba(0,0,0,0.12)` : `1px dashed ${t.line}`,
          cursor: 'pointer', padding: 0, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.mono, fontSize: 10, color: t.inkFaint,
          boxSizing: 'border-box',
          boxShadow: isCustom ? `0 0 0 2px ${t.surface}, 0 0 0 3.5px ${t.ink}` : 'none',
          outline: 'none',
        }}
      >
        {!isCustom && '+'}
      </button>
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'fixed', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

// ── SegmentedControl ──────────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex' }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: '4px 0',
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
            background: value === opt.value ? t.ink : 'transparent',
            color: value === opt.value ? t.surface : t.inkMute,
            border: `1px solid ${value === opt.value ? t.ink : t.line}`,
            marginLeft: i > 0 ? -1 : 0,
            cursor: 'pointer',
            position: 'relative',
            zIndex: value === opt.value ? 1 : 0,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
