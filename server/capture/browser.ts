import { chromium, type Browser } from 'playwright'

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser
  browser = await chromium.launch({
    headless: true,
    // Required when running as root inside the container image.
    args: process.env.CHROMIUM_NO_SANDBOX ? ['--no-sandbox'] : [],
  })
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
