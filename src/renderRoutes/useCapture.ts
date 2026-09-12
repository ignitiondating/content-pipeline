import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type SpecResponse } from '../lib/api'

declare global {
  interface Window {
    __READY__?: boolean
  }
}

/** Fetches the draft spec named by ?specId= for a capture page. */
export function useSpec(): { data: SpecResponse | null; error: string | null; params: URLSearchParams } {
  const [params] = useSearchParams()
  const [data, setData] = useState<SpecResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const specId = params.get('specId')

  useEffect(() => {
    if (!specId) {
      setError('missing specId')
      return
    }
    api
      .spec(specId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [specId])

  return { data, error, params }
}

/**
 * Flags the page as capturable once fonts and images are loaded and two frames have
 * painted. Playwright waits on window.__READY__ before screenshotting.
 */
export function useReadyFlag(contentRendered: boolean): void {
  useEffect(() => {
    if (!contentRendered) return
    let cancelled = false
    Promise.all([document.fonts.ready, ...Array.from(document.images).map((image) => image.decode().catch(() => {}))]).then(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) window.__READY__ = true
        }),
      )
    })
    return () => {
      cancelled = true
    }
  }, [contentRendered])
}
