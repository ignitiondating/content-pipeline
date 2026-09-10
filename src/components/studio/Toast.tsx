import { useEffect, useState } from 'react'

/** Transient confirmation for actions with no visible result (copy, save). */
export function useToast(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2000)
    return () => clearTimeout(timer)
  }, [message])
  return [message, setMessage]
}

export default function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
        {message}
      </div>
    </div>
  )
}
