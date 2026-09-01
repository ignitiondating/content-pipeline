import { chromium, type Browser } from 'playwright'

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser
  browser = await chromium.launch({ headless: true })
  return browser
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
  }
}

export async function chromiumAvailable(): Promise<boolean> {
  try {
    await getBrowser()
    return true
  } catch {
    return false
  }
}
