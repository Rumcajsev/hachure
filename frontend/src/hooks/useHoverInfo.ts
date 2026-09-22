import { useCallback, useRef, useState } from 'react'
import { OPTION_INFO } from '../content/optionInfo'

const HOVER_DELAY_MS = 1000

/** Arms a delayed "open" only when `id` has a registered OPTION_INFO entry. */
export function useHoverInfo(id: string) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const close = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setOpen(false)
  }, [])

  const onMouseEnter = useCallback(() => {
    if (!OPTION_INFO[id]) return
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS)
  }, [id])

  const onMouseLeave = useCallback(() => {
    close()
  }, [close])

  return { open, close, triggerProps: { onMouseEnter, onMouseLeave } }
}
