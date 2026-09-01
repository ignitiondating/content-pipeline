import { CHAT_CANVAS } from '../../shared/formats/chat'
import { WEB_ORIGIN } from '../paths'
import { getBrowser } from './browser'

export interface CaptureRequest {
  /** Path + query on the Vite server, e.g. `/render/chat?specId=d_x&state=3`. */
  route: string
  outPath: string
  /** Transparent background (clip chat-card states, hook overlays). */
  transparent?: boolean
}

/**
 * Captures a /render/* page at 540×960 with deviceScaleFactor 2 → a
 * 1080×1920 PNG. The page must set `window.__READY__ = true` after fonts
 * and layout settle; capture pages disable CSS animations for determinism.
 */
export async function captureSequence(requests: CaptureRequest[]): Promise<void> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: CHAT_CANVAS.width, height: CHAT_CANVAS.height },
    deviceScaleFactor: CHAT_CANVAS.deviceScaleFactor,
    reducedMotion: 'reduce',
  })
  try {
    const page = await context.newPage()
    for (const request of requests) {
      await page.goto(`${WEB_ORIGIN}${request.route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => (window as { __READY__?: boolean }).__READY__ === true, {
        timeout: 15_000,
      })
      await page.screenshot({
        path: request.outPath,
        omitBackground: request.transparent ?? false,
      })
    }
  } finally {
    await context.close()
  }
}
