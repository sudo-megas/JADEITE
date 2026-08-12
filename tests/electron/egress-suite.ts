/**
 * The egress gate — XJADEITE §3.3 and §14, and the acceptance check that no
 * end-to-end test can honestly make.
 *
 * **Why this suite exists at all.** `tests/e2e/hardening.spec.ts` drives a real
 * renderer and watches a `fetch` from it fail. That proves the CSP and nothing
 * else: `connect-src 'none'` stops the request before Chromium ever consults
 * `webRequest.onBeforeRequest`, so a renderer aimed at the provider host would
 * fail identically whether `isPermittedRequest`'s `webContentsId` gate is
 * correct, missing, or inverted. A test that cannot distinguish those three is
 * not a test of the gate. So the predicate is called here directly, with
 * synthetic details, which is the only place in the repository where the
 * discrimination it makes is actually observed.
 *
 * **Why it is inside Electron rather than under Vitest.** The pure allowlist —
 * hostname, scheme, port, credentials — is already proved in
 * `tests/unit/egress.test.ts` against `hosts.ts`, which imports nothing. What
 * lives here is what only this runtime has: a module whose behaviour is decided
 * by `app.isPackaged` at module scope, and the two filters `hardenSession`
 * installs on a session. Nothing below duplicates the unit table; the near-miss
 * URLs that reappear do so because they are being asked of a *different*
 * predicate, one that takes an origin as well as a URL.
 *
 * **No network call is made, in either direction.** REALISATION.md rule 6 holds:
 * every URL below is a string, the session is a stub that records the listeners
 * handed to it, and the request that the filter is asked about never leaves this
 * process. The stub is not a convenience — `hardenSession()` with no argument
 * installs real filters on `session.defaultSession`, which would harden the test
 * process itself and leave the listeners uninvokable.
 *
 * **`session.ts` is imported dynamically, and that is load-bearing.** The module
 * decides `isDev` once, at module scope, from `ELECTRON_RENDERER_URL`. The suite
 * runs unpackaged with that variable unset, so a static import would fix `isDev`
 * false and the dev-mode warning — half of this rung's second acceptance check —
 * could never be reached. Setting the variable and then importing is the only
 * honest way in; see `security()` below for what that costs.
 */

import type { Session, WebContents } from 'electron'

import { describe, expect, it } from './harness.js'

import { EgressRefused, assertPermittedEgress } from '../../src/main/prices/egress.js'

/** The two real targets (§14.1). Written out, never contacted. */
const HISTORY_URL = 'https://www.haremaltin.com/ajax/cur/history'
const SOCKET_URL = 'wss://hrmsocketonly.haremaltin.com/socket.io/?EIO=4&transport=websocket'

/** What `electron-vite dev` sets, and what the import below makes the module believe. */
const DEV_SERVER = 'http://localhost:5173'

// --- Getting at the module in its development configuration -----------------

type SecurityModule = typeof import('../../src/main/security/session.js')

let loaded: SecurityModule | null = null

/**
 * `session.ts`, imported once, with `ELECTRON_RENDERER_URL` set for the instant
 * that decides `isDev`.
 *
 * ESM caches by resolved specifier and esbuild's CJS bundle preserves that — the
 * dynamic import compiles to a lazily-initialised module closure, which was
 * confirmed by reading the generated bundle rather than assumed. So there is
 * **one** instance for the whole process and it is a development one. Two
 * consequences, both stated rather than worked around:
 *
 *   - Every assertion below sees `isDev === true`. The provider gate is the same
 *     code either way — `isPermittedRequest` does not read the flag — but the
 *     dev origin is permitted here where a packaged build would refuse it, so
 *     the "still loads the application" cases include the Vite server.
 *   - `contentSecurityPolicy()` therefore returns the **development** policy.
 *     `connect-src 'none'` belongs to the packaged branch, which this process
 *     cannot enter; `tests/e2e/hardening.spec.ts` asserts that string against
 *     the build-time `<meta>` copy in `electron.vite.config.ts`, which is the
 *     same rule written in a second place rather than this function's output.
 *     What is worth asserting here is the stronger, configuration-independent
 *     claim: not even the loosest policy this application ever serves names the
 *     provider.
 *
 * The variable is removed again immediately. The module has already read it, and
 * leaving it set would change how a later suite's own dynamic imports behave for
 * no gain — the blast radius of an `afterEach` without the honesty of one.
 */
async function security(): Promise<SecurityModule> {
  const cached = loaded
  if (cached !== null) return cached

  process.env['ELECTRON_RENDERER_URL'] = DEV_SERVER
  let imported: SecurityModule
  try {
    imported = await import('../../src/main/security/session.js')
  } finally {
    delete process.env['ELECTRON_RENDERER_URL']
  }

  loaded = imported
  return imported
}

// --- A session that records rather than enforces ----------------------------

interface RequestSummary {
  url: string
  /** Absent when the main process asked. Present, and an integer, when a renderer did. */
  webContentsId?: number | undefined
}

type BeforeRequestListener = (
  details: RequestSummary,
  callback: (verdict: { cancel: boolean }) => void
) => void

interface HeaderBag {
  responseHeaders?: Record<string, string[]> | undefined
}

type HeadersListener = (details: HeaderBag, callback: (response: HeaderBag) => void) => void

/**
 * What `hardenSession` installed, in a form a test can interrogate.
 *
 * The listeners are collected into arrays rather than into `let` bindings on
 * purpose: a `let x: T | null = null` assigned only inside a callback stays
 * narrowed to `null` for the compiler, so the guard that proves a listener
 * arrived would leave the call site typed `never`. An index under
 * `noUncheckedIndexedAccess` carries `| undefined` honestly and needs no cast.
 */
interface Hardened {
  /** The verdict `onBeforeRequest` returns for one request. */
  cancels(url: string, webContentsId?: number): boolean
  /** The `Content-Security-Policy` stamped on every response. */
  policy(): string
  /** The `X-Content-Type-Options` header stamped on every response. */
  nosniff(): string | undefined
  /** `false` from every one of the three permission surfaces, for anything asked. */
  permissionsDenied(): boolean
}

type PermissionRequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
  details: unknown
) => void
type PermissionCheckHandler = (
  webContents: unknown,
  permission: string,
  requestingOrigin: string,
  details: unknown
) => boolean
type DevicePermissionHandler = (details: unknown) => boolean

function harden(hardenSession: (target: Session) => void): Hardened {
  const requestListeners: BeforeRequestListener[] = []
  const headerListeners: HeadersListener[] = []
  let permissionRequest: PermissionRequestHandler | null = null
  let permissionCheck: PermissionCheckHandler | null = null
  let devicePermission: DevicePermissionHandler | null = null

  // Cast rather than implemented: `Session` is some two hundred members and this
  // suite needs five of them. `as unknown as` keeps `any` out of the file (the
  // house rule) while saying plainly that the object is a stand-in — and if
  // `hardenSession` ever reaches for a sixth member, the stub throws at the call
  // rather than passing silently.
  const target = {
    webRequest: {
      onBeforeRequest: (listener: BeforeRequestListener): void => {
        requestListeners.push(listener)
      },
      onHeadersReceived: (listener: HeadersListener): void => {
        headerListeners.push(listener)
      }
    },
    setPermissionRequestHandler: (handler: PermissionRequestHandler): void => {
      permissionRequest = handler
    },
    setPermissionCheckHandler: (handler: PermissionCheckHandler): void => {
      permissionCheck = handler
    },
    setDevicePermissionHandler: (handler: DevicePermissionHandler): void => {
      devicePermission = handler
    }
  } as unknown as Session

  hardenSession(target)

  const onRequest = requestListeners[0]
  const onHeaders = headerListeners[0]
  if (onRequest === undefined) throw new Error('hardenSession installed no request filter')
  if (onHeaders === undefined) throw new Error('hardenSession installed no header filter')

  const headers = (): HeaderBag => {
    const answers: HeaderBag[] = []
    onHeaders({ responseHeaders: {} }, (response) => answers.push(response))
    const only = answers[0]
    if (only === undefined) throw new Error('the header filter answered nothing')
    return only
  }

  return {
    cancels(url, webContentsId): boolean {
      const verdicts: { cancel: boolean }[] = []
      onRequest({ url, webContentsId }, (verdict) => verdicts.push(verdict))
      const only = verdicts[0]
      if (only === undefined) throw new Error('the request filter answered nothing')
      return only.cancel
    },

    policy(): string {
      const policy = headers().responseHeaders?.['Content-Security-Policy']?.[0]
      if (policy === undefined) throw new Error('no Content-Security-Policy was stamped')
      return policy
    },

    nosniff(): string | undefined {
      return headers().responseHeaders?.['X-Content-Type-Options']?.[0]
    },

    permissionsDenied(): boolean {
      if (permissionRequest === null) throw new Error('no permission request handler installed')
      if (permissionCheck === null) throw new Error('no permission check handler installed')
      if (devicePermission === null) throw new Error('no device permission handler installed')

      const grants: boolean[] = []
      permissionRequest({}, 'geolocation', (granted) => grants.push(granted), {})
      if (grants.length !== 1) throw new Error('the permission request handler answered nothing')

      const checked = permissionCheck(null, 'geolocation', 'file:///', {})
      const device = devicePermission({})

      return grants[0] === false && checked === false && device === false
    }
  }
}

/** Whatever a call threw, or `null` — `toThrow()` takes no argument, so the error is fetched. */
function refusal(call: () => unknown): unknown {
  try {
    call()
    return null
  } catch (error) {
    return error
  }
}

/**
 * Everything written to `console.warn` while `action` ran, one line per call.
 *
 * Replacing the global is the only way at it: the warning is `console.warn` in
 * `session.ts` and in `egress.ts`, deliberately, because a dev-mode notice that
 * needed a logger injected would be a logger threaded through the security
 * modules for the benefit of a test.
 */
function warningsWhile(action: () => void): string[] {
  const captured: string[] = []
  const original = console.warn
  console.warn = (...parts: unknown[]): void => {
    captured.push(parts.map((part) => String(part)).join(' '))
  }
  try {
    action()
  } finally {
    console.warn = original
  }
  return captured
}

/**
 * Hosts that are nobody's business but their owner's.
 *
 * Five rows rather than the unit table's twelve, and chosen for what they mean
 * to *this* predicate: the provider is reachable and everything adjacent to it
 * is not, whoever is asking. The exhaustive allowlist argument — the suffix
 * attack, embedded credentials, a named port — is made once, against `hosts.ts`,
 * in `tests/unit/egress.test.ts`.
 */
const NOT_ALLOWLISTED: readonly { url: string; why: string }[] = [
  { url: 'https://example.com/', why: 'an unrelated host' },
  { url: 'http://www.haremaltin.com/ajax/cur/history', why: 'the provider, scheme downgraded' },
  { url: 'https://www.haremaltin.com.attacker.example/', why: 'the suffix attack' },
  { url: 'https://analytics.example.com/collect', why: 'the telemetry §16.6 forbids' },
  { url: 'http://localhost:8080/', why: 'the dev host on a port the dev server does not hold' }
]

// --- The gate the end-to-end test cannot see --------------------------------

describe('the request gate, which only a direct call can distinguish (§3.3)', () => {
  it('lets the main process reach both provider hosts', async () => {
    const { isPermittedRequest } = await security()

    // `undefined` is what a main-process `net.request` actually arrives with —
    // measured with a probe at the start of this Realisation, not inferred from
    // the type being optional.
    expect(isPermittedRequest(HISTORY_URL, undefined), 'history, from main').toBe(true)
    expect(isPermittedRequest(SOCKET_URL, undefined), 'socket, from main').toBe(true)
  })

  /**
   * The renderer half, and with it the proof that **`isPermitted` did not
   * widen** — which is the regression this two-predicate design exists to
   * prevent, and which can be established without exporting anything.
   *
   * `isPermittedRequest` is `isPermitted(url) || (webContentsId === undefined &&
   * provider(url))`. A `false` for a provider URL with any `webContentsId` is
   * therefore a statement about the *first* disjunct: had `isPermitted` been
   * widened to admit the provider host, it would have fired regardless of who
   * asked and this assertion would be `true`. And `isPermitted` is exactly what
   * `will-navigate` consults in `hardenWebContents`, so the same row is what
   * guarantees a renderer cannot *become* the provider's page — and be handed
   * the preload bridge, and with it the whole vault API.
   *
   * Id `0` is deliberate. It is not an id Electron issues, and that is the
   * point: an implementation written as `!webContentsId` rather than
   * `webContentsId === undefined` would let it through, and every other id in
   * this suite would go on passing.
   */
  it('refuses a renderer the very same URLs, which is also proof isPermitted did not widen', async () => {
    const { isPermittedRequest } = await security()

    for (const id of [0, 1, 42]) {
      expect(isPermittedRequest(HISTORY_URL, id), `history, from webContents ${id}`).toBe(false)
      expect(isPermittedRequest(SOCKET_URL, id), `socket, from webContents ${id}`).toBe(false)
    }
  })

  it('refuses a host the allowlist does not name, whoever asked', async () => {
    const { isPermittedRequest } = await security()

    for (const { url, why } of NOT_ALLOWLISTED) {
      expect(isPermittedRequest(url, undefined), `${why}, from main`).toBe(false)
      expect(isPermittedRequest(url, 1), `${why}, from a renderer`).toBe(false)
    }
  })

  /**
   * The application has to go on loading. A gate that answered "no" to the
   * renderer's own bundle would be perfectly secure and perfectly useless, so
   * the schemes `isPermitted` already allowed are asserted to be untouched —
   * with an id and without, since `onBeforeRequest` sees the renderer's own
   * requests and every one of them carries one.
   */
  it('goes on loading the application, from a renderer or from main', async () => {
    const { isPermittedRequest } = await security()

    const local = [
      'file:///opt/jadeite/resources/app.asar/out/renderer/index.html',
      'devtools://devtools/bundled/inspector.html',
      'blob:file:///2a1b8f0c-0000-4000-8000-000000000000',
      'data:text/css,body{}',
      // Dev only, and true here because this suite forced the module into its
      // development configuration; a packaged build refuses both.
      `${DEV_SERVER}/src/renderer/src/main.tsx`,
      'ws://localhost:5173/?token=hmr'
    ]

    for (const url of local) {
      expect(isPermittedRequest(url, undefined), `${url}, from main`).toBe(true)
      expect(isPermittedRequest(url, 3), `${url}, from a renderer`).toBe(true)
    }
  })
})

// --- What hardenSession actually installs -----------------------------------

describe('the filters hardenSession installs on a session', () => {
  /**
   * The predicate is one thing; the wiring is another. A filter that consulted
   * `isPermittedRequest` and then called `callback({cancel: false})` regardless
   * would pass every assertion above.
   */
  it('cancels what the predicate refuses and passes what it permits', async () => {
    const { hardenSession } = await security()
    const gate = harden(hardenSession)

    // Wrapped so the two refusals below do not print into the harness's own
    // output — and so the count is asserted: exactly the cancelled requests
    // warn, which is the same claim as "silent about what it allows" made from
    // the other side.
    const warnings = warningsWhile(() => {
      expect(gate.cancels('https://example.com/', 1), 'an unrelated host').toBe(true)
      expect(gate.cancels(HISTORY_URL, 1), 'the provider, asked for by a renderer').toBe(true)
      expect(gate.cancels(HISTORY_URL, undefined), 'the provider, asked for by main').toBe(false)
      expect(gate.cancels(SOCKET_URL, undefined), 'the socket, asked for by main').toBe(false)
      expect(gate.cancels('file:///opt/jadeite/out/renderer/index.html', 1), 'the app').toBe(false)
    })

    expect(warnings).toHaveLength(2)
  })

  /**
   * "…and logged in dev" — the second half of the acceptance check, and the half
   * that is awkward to reach honestly.
   *
   * `SECURITY_FLAGS.isDev` is asserted **first**, before anything about warnings.
   * The whole test rests on the dynamic import in `security()` having run the
   * module body *after* `ELECTRON_RENDERER_URL` was set; if a bundler ever
   * hoisted that initialisation, `isDev` would be false, nothing would warn, and
   * a test written only around the absence of a warning line would either fail
   * with a mystifying message or — worse — pass vacuously somewhere else. This
   * way a hoist names itself in the failure.
   */
  it('warns in development, naming the URL it blocked', async () => {
    const { hardenSession, SECURITY_FLAGS } = await security()
    expect(SECURITY_FLAGS.isDev, 'the module must have read ELECTRON_RENDERER_URL').toBe(true)

    const gate = harden(hardenSession)
    const warnings = warningsWhile(() => {
      expect(gate.cancels('https://analytics.example.com/collect', 1)).toBe(true)
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0] ?? '').toContain('[egress] blocked')
    // The URL itself, because a log line that says only "blocked" tells whoever
    // is watching the terminal nothing they can act on.
    expect(warnings[0] ?? '').toContain('https://analytics.example.com/collect')
  })

  it('says nothing at all about a request it allows', async () => {
    const { hardenSession } = await security()
    const gate = harden(hardenSession)

    const warnings = warningsWhile(() => {
      expect(gate.cancels(HISTORY_URL, undefined)).toBe(false)
    })
    expect(warnings).toHaveLength(0)
  })

  /**
   * The renderer is never granted the provider host — in the *loosest*
   * configuration this application ever runs in.
   *
   * Development is where `connect-src` is at its widest: Vite's server, its HMR
   * socket, and `'self'`. Even there the provider is absent, which is precisely
   * why a renderer `fetch` at the provider dies against the CSP and why the
   * end-to-end test cannot tell a correct request gate from an inverted one.
   *
   * The packaged branch's `connect-src 'none'` is deliberately not restated
   * here: this process cannot reach that branch, and an assertion written
   * against a module forced into development would be asserting the wrong
   * string with a confident name.
   */
  it('never names the provider in the policy it serves the renderer', async () => {
    const { hardenSession } = await security()
    const policy = harden(hardenSession).policy()

    expect(policy).toContain('connect-src')
    expect(policy).not.toContain('haremaltin')
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
  })

  /**
   * L27. `hardening.spec.ts` never reads this header at all — it asserts the
   * CSP `<meta>` tag and stops there — so a build that stopped stamping
   * `nosniff` (or misspelled it) would ship silently.
   */
  it('stamps X-Content-Type-Options: nosniff on every response', async () => {
    const { hardenSession } = await security()
    expect(harden(hardenSession).nosniff()).toBe('nosniff')
  })

  /**
   * L27. Every one of the three permission surfaces `hardenSession` installs
   * denies unconditionally — no camera, microphone, geolocation, notifications,
   * clipboard, HID/USB/serial device access, nothing. Asked about a permission
   * chosen for being ordinary (`geolocation`) rather than for being on the
   * denylist, since the point is that nothing is on an *allow*list here at all.
   */
  it('denies every permission asked of it, on all three handlers', async () => {
    const { hardenSession } = await security()
    expect(harden(hardenSession).permissionsDenied()).toBe(true)
  })
})

/**
 * L26. Every assertion above runs against the module `security()` forced into
 * its development configuration, which the file-level comment on `security()`
 * explains and defends. What that configuration cannot answer is the one this
 * application actually ships: `connect-src 'none'`, no `unsafe-eval`, no dev
 * origin anywhere in the string. `contentSecurityPolicy` takes an explicit
 * `dev` parameter for exactly this — calling it with `false` here asks the
 * *same* cached module instance for its production answer, so this needs no
 * second import and cannot disturb the load-bearing ordering `security()`
 * depends on.
 */
describe('the policy this application actually ships (§3.3, production branch)', () => {
  it('never carries a dev origin, unsafe-eval, or the provider host', async () => {
    const { contentSecurityPolicy } = await security()
    const policy = contentSecurityPolicy(false)

    expect(policy).toContain("connect-src 'none'")
    // The trailing `;` matters: it is what rules out `script-src 'self'
    // 'unsafe-inline' 'unsafe-eval'`, the dev directive, sharing the same
    // `.toContain("script-src 'self'")` prefix.
    expect(policy).toContain("script-src 'self';")
    expect(policy).not.toContain('unsafe-eval')
    expect(policy).not.toContain('localhost')
    expect(policy).not.toContain(DEV_SERVER)
    expect(policy).not.toContain('haremaltin')
  })

  it('still carries every base directive the dev branch also carries', async () => {
    const { contentSecurityPolicy } = await security()
    const policy = contentSecurityPolicy(false)

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("form-action 'none'")
  })
})

// --- The other end of the same rule -----------------------------------------

/**
 * The chokepoint, in the runtime that actually reaches the network.
 *
 * §3.3 says egress is blocked at the session level and for the history request
 * that is literally true. The socket is not: it rides Node's stack, which the
 * probe showed `onBeforeRequest` never sees. So `assertPermittedEgress` is the
 * *only* gate on half of this application's outbound traffic, and its refusal is
 * exercised here as well as in `tests/unit/egress.test.ts` — not to repeat the
 * table, but because "logged in dev" has to be true of this half too, and it is
 * the half a session cannot cancel.
 */
describe('the chokepoint on the Node-stack half of egress (§14)', () => {
  it('hands back a usable URL for the two real targets, so a caller cannot skip it', () => {
    expect(assertPermittedEgress(HISTORY_URL).hostname).toBe('www.haremaltin.com')
    expect(assertPermittedEgress(SOCKET_URL).hostname).toBe('hrmsocketonly.haremaltin.com')
    expect(assertPermittedEgress(SOCKET_URL).protocol).toBe('wss:')
  })

  it('throws EgressRefused for every host the allowlist does not name', () => {
    for (const { url, why } of NOT_ALLOWLISTED) {
      // `refusal` returns null when nothing was thrown, so a missing refusal
      // fails on the instanceof rather than passing quietly.
      expect(refusal(() => assertPermittedEgress(url)) instanceof EgressRefused, why).toBe(true)
    }
  })

  it('carries what was attempted, and writes it once when asked to warn', () => {
    const attempted = 'https://analytics.example.com/collect'

    const warnings = warningsWhile(() => {
      const error = refusal(() => assertPermittedEgress(attempted, { warn: true }))
      expect(error instanceof EgressRefused).toBe(true)
      expect(error instanceof EgressRefused ? error.attempted : '').toBe(attempted)
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0] ?? '').toContain('[egress] refused')
    expect(warnings[0] ?? '').toContain(attempted)
  })

  it('refuses a target that is not a URL at all, and says which kind of refusal it was', () => {
    const warnings = warningsWhile(() => {
      expect(refusal(() => assertPermittedEgress('haremaltin.com', { warn: true }))).not.toBeNull()
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0] ?? '').toContain('unparseable')
  })

  it('stays silent unless warning was asked for', () => {
    const warnings = warningsWhile(() => {
      expect(refusal(() => assertPermittedEgress('https://example.com/'))).not.toBeNull()
    })
    expect(warnings).toHaveLength(0)
  })
})

// --- What the renderer may *become*, as against what it may fetch -----------

/**
 * The navigation gate — §3.3, added at Realisation X.
 *
 * §3.3 says three times that `will-navigate` "permits nothing but this
 * application's own files", and until this rung the predicate behind it was the
 * same one `isPermittedRequest` starts from, which admits `blob:`, `data:` and
 * `chrome-extension:`. Those are legitimate for a *request* — an `img-src` data
 * URI, a blob the renderer made — and they are not this application's files.
 *
 * Nothing was exploitable through the gap: a `blob:` document is same-origin
 * with the `file:` renderer, Chromium blocks top-level `data:` navigation on
 * its own, and a packaged build loads no extension. That is exactly why it
 * wants a test rather than a comment — every one of those is a fact about
 * today's Chromium, and the spec sentence is a decision this application made.
 */
describe('the navigation gate is narrower than the request gate', () => {
  /** Legitimate to fetch, and never a page this application becomes. */
  const FETCHABLE_BUT_NOT_NAVIGABLE = [
    'blob:file:///2a1b8f0c-0000-4000-8000-000000000000',
    'data:text/css,body{}',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/panel.html'
  ]

  it('refuses to navigate to what it will happily load', async () => {
    const { isPermittedNavigation, isPermittedRequest } = await security()

    for (const url of FETCHABLE_BUT_NOT_NAVIGABLE) {
      // Both halves, in one loop, because either alone is satisfiable by a
      // predicate that is simply broken: a navigation gate that refused
      // everything would pass the first assertion and take the application
      // with it.
      expect(isPermittedRequest(url, 3), `${url} should still be fetchable`).toBe(true)
      expect(isPermittedNavigation(url), `${url} must not be navigable`).toBe(false)
    }
  })

  it('still lets the application be itself', async () => {
    const { isPermittedNavigation } = await security()

    for (const url of [
      'file:///opt/jadeite/resources/app.asar/out/renderer/index.html',
      // Chromium's own inspector, kept deliberately: it is not a document the
      // renderer could be persuaded into, and refusing it breaks devtools.
      'devtools://devtools/bundled/inspector.html',
      // Dev only, and true here because this suite forced the module into its
      // development configuration. While developing, the renderer *is* this
      // origin, so a gate that refused it would refuse the application.
      `${DEV_SERVER}/src/renderer/src/main.tsx`
    ]) {
      expect(isPermittedNavigation(url), `${url} must stay navigable`).toBe(true)
    }
  })

  it('refuses the provider hosts, which is the reason the two gates exist', async () => {
    const { isPermittedNavigation } = await security()

    // §3.3's own words: a permitted top-level navigation to a provider host
    // would hand a remote origin the preload bridge, and with it the vault API.
    // The request gate admits these from main; navigation admits them nowhere.
    for (const url of ['https://www.haremaltin.com/ajax/cur/history', 'https://example.com/']) {
      expect(isPermittedNavigation(url), `${url} must not be navigable`).toBe(false)
    }
  })
})

// --- The wiring itself, not just the predicate it calls ----------------------

/**
 * L25 / L1. Everything above proves `isPermittedNavigation` answers correctly
 * in isolation. None of it proves `hardenContents` actually binds that
 * predicate to the five events Electron fires — a listener bound to the wrong
 * event name, a `will-redirect`/`will-frame-navigate` handler written with a
 * two-argument `(event, url)` signature (the shape `will-navigate` genuinely
 * has, and the mistake this suite exists to catch: Electron's merged-event
 * listeners hand back one argument with `.url` mixed in, not two), or a branch
 * that was simply never reached by anything else in the repository, would
 * pass every assertion above and still ship broken.
 *
 * The stub below is a `WebContents` in exactly the sense `harden()` above is a
 * `Session`: the handful of members `hardenContents` actually calls, so a
 * member it starts relying on and this stub does not implement throws at the
 * call site rather than silently no-oping.
 */
type ContentsListener = (...args: never[]) => void

interface HardenedContents {
  /** Fires `will-navigate` with its real `(event, url)` shape. */
  navigate(url: string): boolean
  /** Fires `will-redirect` with its real single merged-event shape. */
  redirect(url: string): boolean
  /** Fires `will-frame-navigate` with its real single merged-event shape. */
  frameNavigate(url: string): boolean
  attachWebview(): boolean
  windowOpen(url: string): string
}

function hardenedContents(hardenContents: (contents: WebContents) => void): HardenedContents {
  const listeners = new Map<string, ContentsListener>()
  let windowOpenHandler: ((details: { url: string }) => { action: string }) | null = null

  const stub = {
    on: (event: string, listener: ContentsListener): unknown => {
      listeners.set(event, listener)
      return stub
    },
    setWindowOpenHandler: (handler: typeof windowOpenHandler): void => {
      windowOpenHandler = handler
    }
  } as unknown as WebContents

  hardenContents(stub)

  return {
    // `will-navigate`'s real, two-argument shape: `(event, url)`.
    navigate: (url) => {
      const listener = listeners.get('will-navigate')
      if (listener === undefined) throw new Error('hardenContents installed no will-navigate listener')
      let prevented = false
      ;(listener as (e: { preventDefault(): void }, url: string) => void)(
        { preventDefault: () => { prevented = true } },
        url
      )
      return prevented
    },
    // `will-redirect`'s real shape: one argument, `.url` merged into it —
    // simulated by handing back an event object that already carries `url`,
    // never a bare string as a second argument.
    redirect: (url) => {
      const listener = listeners.get('will-redirect')
      if (listener === undefined) throw new Error('hardenContents installed no will-redirect listener')
      let prevented = false
      ;(listener as (e: { preventDefault(): void; url: string }) => void)({
        preventDefault: () => { prevented = true },
        url
      })
      return prevented
    },
    frameNavigate: (url) => {
      const listener = listeners.get('will-frame-navigate')
      if (listener === undefined) {
        throw new Error('hardenContents installed no will-frame-navigate listener')
      }
      let prevented = false
      ;(listener as (e: { preventDefault(): void; url: string }) => void)({
        preventDefault: () => { prevented = true },
        url
      })
      return prevented
    },
    attachWebview: () => {
      const listener = listeners.get('will-attach-webview')
      if (listener === undefined) {
        throw new Error('hardenContents installed no will-attach-webview listener')
      }
      let prevented = false
      ;(listener as (e: { preventDefault(): void }) => void)({
        preventDefault: () => { prevented = true }
      })
      return prevented
    },
    windowOpen: (url) => {
      if (windowOpenHandler === null) throw new Error('hardenContents installed no window-open handler')
      return windowOpenHandler({ url }).action
    }
  }
}

const LOCAL_FILE_URL = 'file:///opt/jadeite/resources/app.asar/out/renderer/index.html'
const REMOTE_URL = 'https://example.com/'

describe('hardenContents wires the predicate to real events, not just answers for it', () => {
  it('lets the application navigate to its own file — the positive case a swapped argument order would fail', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).navigate(LOCAL_FILE_URL)).toBe(false)
  })

  it('blocks will-navigate to a remote origin', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).navigate(REMOTE_URL)).toBe(true)
  })

  /**
   * The case that actually distinguishes a correct `(event)` handler from one
   * mistakenly written `(event, url)`: called here with the real one-argument
   * shape, a mis-signatured handler reads `url` as `undefined`, `isLocal`
   * throws inside its own try/catch and returns `false`, and the local file —
   * which ought to pass untouched — gets `preventDefault()`'d anyway. Only the
   * positive assertion catches that; the negative case below would pass either
   * way.
   */
  it('lets will-redirect to its own file through, proving the merged-event shape is handled', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).redirect(LOCAL_FILE_URL)).toBe(false)
  })

  it('blocks will-redirect to a remote origin', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).redirect(REMOTE_URL)).toBe(true)
  })

  it('lets will-frame-navigate to its own file through, same shape as will-redirect', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).frameNavigate(LOCAL_FILE_URL)).toBe(false)
  })

  it('blocks will-frame-navigate to a remote origin', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).frameNavigate(REMOTE_URL)).toBe(true)
  })

  it('always refuses to attach a webview, whatever it would have shown', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).attachWebview()).toBe(true)
  })

  it('always denies window.open, whatever URL asked for it', async () => {
    const { hardenContents } = await security()
    expect(hardenedContents(hardenContents).windowOpen(REMOTE_URL)).toBe('deny')
    expect(hardenedContents(hardenContents).windowOpen(LOCAL_FILE_URL)).toBe('deny')
  })
})
