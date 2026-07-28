/**
 * Electron hardening — XJADEITE §3.3.
 *
 * Realisation I has no network at all. The single allowlisted price-provider
 * host of §14 arrives at Realisation VII and will be added here, in one place,
 * as the only edit that has ever been permitted to widen this.
 */

import { app, session, shell, type Session } from 'electron'

/** Set by electron-vite while developing; absent in a packaged build. */
const devRendererUrl = process.env['ELECTRON_RENDERER_URL']
const isDev = !app.isPackaged && typeof devRendererUrl === 'string' && devRendererUrl.length > 0

/** Schemes the renderer is allowed to load at all. */
const LOCAL_SCHEMES = new Set(['file:', 'devtools:', 'blob:', 'data:', 'chrome-extension:'])

function devOrigin(): string | null {
  if (!isDev || !devRendererUrl) return null
  try {
    return new URL(devRendererUrl).origin
  } catch {
    return null
  }
}

function isPermitted(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (LOCAL_SCHEMES.has(url.protocol)) return true

  const dev = devOrigin()
  if (dev !== null) {
    // Vite's dev server and its HMR websocket, and nothing else.
    if (url.origin === dev) return true
    if ((url.protocol === 'ws:' || url.protocol === 'wss:') && url.hostname === new URL(dev).hostname) {
      return true
    }
  }
  return false
}

function contentSecurityPolicy(): string {
  const base = [
    "default-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "media-src 'none'",
    "worker-src 'none'"
  ]

  if (isDev) {
    // Vite injects inline scripts and needs eval for HMR. Development only —
    // the packaged build gets neither.
    const dev = devOrigin() ?? ''
    return [
      ...base,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
      `style-src 'self' 'unsafe-inline'`,
      `connect-src 'self' ${dev} ws://localhost:* ws://127.0.0.1:*`
    ].join('; ')
  }

  return [
    ...base,
    "script-src 'self'",
    // React inlines component styles; no third-party stylesheet is ever loaded.
    "style-src 'self' 'unsafe-inline'",
    // Realisation I makes no network requests whatsoever.
    "connect-src 'none'"
  ].join('; ')
}

/**
 * Cancel every request that is not local, and stamp a strict CSP on every
 * response. This is the session-level enforcement §3.3 requires — not a
 * convention the renderer is trusted to honour.
 */
export function hardenSession(target: Session = session.defaultSession): void {
  target.webRequest.onBeforeRequest((details, callback) => {
    if (isPermitted(details.url)) {
      callback({ cancel: false })
      return
    }
    if (isDev) console.warn('[egress] blocked', details.url)
    callback({ cancel: true })
  })

  target.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
        'X-Content-Type-Options': ['nosniff']
      }
    })
  })

  // No camera, microphone, geolocation, notifications, clipboard — nothing.
  target.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  target.setPermissionCheckHandler(() => false)
  target.setDevicePermissionHandler(() => false)
}

/**
 * Refuse navigation and window creation everywhere.
 *
 * A renderer that is somehow persuaded to navigate off the app cannot: the
 * attempt is cancelled, and window.open is denied rather than handed to the
 * browser.
 */
export function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isPermitted(url)) {
        event.preventDefault()
        if (isDev) console.warn('[navigation] blocked', url)
      }
    })

    contents.on('will-attach-webview', (event) => event.preventDefault())

    contents.setWindowOpenHandler(({ url }) => {
      if (isDev) console.warn('[window-open] denied', url)
      return { action: 'deny' }
    })
  })
}

/** Nothing in JADEITE opens an external link; this exists to be unused. */
export function refuseExternalOpen(): void {
  void shell
}

export const SECURITY_FLAGS = { isDev } as const
