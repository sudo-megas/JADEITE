/**
 * Electron hardening — XJADEITE §3.3.
 *
 * Realisation I had no network at all, and this file promised that §14's
 * provider host would one day "be added here, in one place". Realisation VII
 * found that promise to be a trap and did not keep it.
 *
 * `isPermitted` has two callers with two different meanings: `onBeforeRequest`
 * asks *may this request go out?*, and `will-navigate` asks *may the renderer
 * become this page?* Widening the one function answers both — and the second
 * answer would hand a remote origin the preload bridge, and with it the whole
 * vault API. So the widening lives in a second predicate, `isPermittedRequest`,
 * which `onBeforeRequest` alone consults.
 *
 * Realisation X split the other end for the same reason. This paragraph has
 * claimed since Realisation I that nothing outside this application's own files
 * may ever be navigated to, and the predicate it described admitted `blob:`,
 * `data:` and `chrome-extension:` as well — harmless in fact, and not what the
 * sentence said. Navigation now has its own set (`NAVIGABLE_SCHEMES`) and the
 * request path keeps the wider one, so there are three predicates for three
 * questions and none of them is a comment.
 */

import { app, session, shell, type Session } from 'electron'

import { isPermittedProviderHref } from '../prices/hosts.js'

/** Set by electron-vite while developing; absent in a packaged build. */
const devRendererUrl = process.env['ELECTRON_RENDERER_URL']
const isDev = !app.isPackaged && typeof devRendererUrl === 'string' && devRendererUrl.length > 0

/** Schemes the renderer is allowed to load at all. */
const LOCAL_SCHEMES = new Set(['file:', 'devtools:', 'blob:', 'data:', 'chrome-extension:'])

/**
 * Schemes the renderer may *become* — a strict subset, added at Realisation X.
 *
 * §3.3 states the navigation rule three times and states it categorically:
 * `will-navigate` "permits nothing but this application's own files". The set
 * above was doing double duty and three of its five entries are not this
 * application's own files, so the sentence and the predicate disagreed — and
 * so did this module's own header, which has said "nothing outside this
 * application's own files may ever be navigated to" since Realisation I.
 *
 * Nothing was exploitable through the gap, which is why it survived a hardening
 * pass: a `blob:` document is same-origin with the `file:` renderer and confers
 * no privilege it lacks, Chromium refuses top-level `data:` navigation on its
 * own account, and no extension is ever loaded into a packaged build. The
 * argument for narrowing anyway is that every one of those is a fact about
 * *today's* Chromium rather than a decision this application made, and the
 * spec sentence is the decision. Read the other way round — weakening a
 * thrice-stated security rule to match the code that drifted from it — it would
 * be the wrong repair at v1.0.
 *
 * `devtools:` stays. It is Chromium's own inspector UI rather than a document
 * this application could be persuaded into, and blocking it would break the
 * developer tools in a build that has them. The request path is untouched: it
 * genuinely needs `data:` and `blob:` for images, and `isPermittedRequest`
 * still consults the wider set.
 */
const NAVIGABLE_SCHEMES = new Set(['file:', 'devtools:'])

function devOrigin(): string | null {
  if (!isDev || !devRendererUrl) return null
  try {
    return new URL(devRendererUrl).origin
  } catch {
    return null
  }
}

function isLocal(rawUrl: string, schemes: ReadonlySet<string>): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (schemes.has(url.protocol)) return true

  const dev = devOrigin()
  if (dev !== null) {
    // Vite's dev server and its HMR websocket, and nothing else. Shared by both
    // predicates on purpose: while developing, the renderer *is* that origin,
    // so a navigation gate that refused it would refuse the application itself.
    if (url.origin === dev) return true
    if ((url.protocol === 'ws:' || url.protocol === 'wss:') && url.hostname === new URL(dev).hostname) {
      return true
    }
  }
  return false
}

function isPermitted(rawUrl: string): boolean {
  return isLocal(rawUrl, LOCAL_SCHEMES)
}

/**
 * May the renderer *become* this page? The gate `will-navigate` consults.
 *
 * Exported for `tests/electron/egress-suite.ts`, which proves the two
 * predicates answer differently — the whole point of there being two.
 */
export function isPermittedNavigation(rawUrl: string): boolean {
  return isLocal(rawUrl, NAVIGABLE_SCHEMES)
}

/**
 * May this *request* proceed? Distinct from `isPermitted`, which answers a
 * different question above and must not learn about the provider.
 *
 * The provider host is allowed only when the request did not come from a
 * renderer. `webContentsId` is optional on the listener's details and a probe at
 * the start of this Realisation confirmed the discrimination is real: a
 * main-process `net.request` arrives with it `undefined`, and cancelling such a
 * request does stop it (`net::ERR_BLOCKED_BY_CLIENT`). So the price provider —
 * which runs in main — reaches its two hosts, and a renderer that somehow
 * attempted the same URL is refused here as well as by `connect-src 'none'`.
 *
 * Two mechanisms rather than one, deliberately: the CSP blocks the renderer
 * before a request is ever issued, which means an egress test written against
 * the renderer cannot tell a correct gate from an inverted one. This gate is
 * therefore proved directly, by `tests/electron/egress-suite.ts` calling it with
 * synthetic details, and the renderer assertions are labelled as what they are —
 * proof of the CSP.
 */
export function isPermittedRequest(rawUrl: string, webContentsId: number | undefined): boolean {
  if (isPermitted(rawUrl)) return true
  return webContentsId === undefined && isPermittedProviderHref(rawUrl)
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
    // Still 'none' at Realisation VII, and that is the point: the price provider
    // runs in the main process, so the renderer gained no reason to reach the
    // network and this policy did not have to move for it. Widening it would
    // have granted the entire renderer egress to serve one module in another
    // process. The build-time <meta> copy in electron.vite.config.ts says the
    // same thing and is likewise untouched.
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
    if (isPermittedRequest(details.url, details.webContentsId)) {
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
      if (!isPermittedNavigation(url)) {
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
