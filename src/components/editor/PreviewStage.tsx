import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CHAT_CANVAS } from '@shared/formats/chat'

/**
 * Fills the parent and reports the largest 9:16 height that fits.
 * The editor preview should grow with the well — never a fixed postage stamp.
 */
export default function PreviewStage({
  children,
}: {
  children: (height: number) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(360)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w < 8 || h < 8) return
      const fitted = Math.min(h, w * (CHAT_CANVAS.height / CHAT_CANVAS.width))
      setHeight(Math.max(240, Math.floor(fitted)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="flex h-full w-full min-h-0 items-center justify-center">
      {children(height)}
    </div>
  )
}
