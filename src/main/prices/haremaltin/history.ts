/**
 * Daily closes — XJADEITE §14.1, and the two silent failures of §14.2.
 *
 * A two-request dance, because the endpoint wants a session cookie: `GET
 * /grafik` to be issued one, then `POST /ajax/cur/history` carrying it. Without
 * the `X-Requested-With: XMLHttpRequest` header the second request answers 404
 * with HTML, which is the sort of thing that reads as "the endpoint moved" and
 * is not.
 *
 * **Electron's `net`, not Node's `fetch`.** A probe at the start of this
 * Realisation measured the difference: a `net.request` is seen by
 * `webRequest.onBeforeRequest` and cancelling it yields
 * `net::ERR_BLOCKED_BY_CLIENT`, while a global `fetch` is invisible to the
 * filter and unstoppable by it. Using `net` means this request is governed by
 * the session allowlist *as well as* by the chokepoint below, so §3.3's "blocked
 * at the session level" is literally true of it — which it cannot be of the
 * socket.
 *
 * **The app cannot identify itself.** §14.3 asks it to "identify politely", and
 * the endpoint returns 404 to anything without a browser User-Agent, so a header
 * naming JADEITE would simply break the request. That clause is amended in this
 * Realisation. What is left of politeness is asking rarely, which lives in
 * `limiter.ts`, and never asking for more than is needed, which is why the
 * request parameters below are fixed rather than derived from the ledger: asking
 * only for the types the owner holds, over the owner's own date range, would
 * make every request a small disclosure of the portfolio (§16.1).
 */

import { net } from 'electron'

import { assertPermittedEgress } from '../egress.js'
import type { Close, HistoryRequest, PriceResult } from '../provider.js'
import { sourceCodeFor } from './mapping.js'
import { parseHistoryBody } from './parse.js'

const ORIGIN = 'https://www.haremaltin.com'
const CHART_URL = `${ORIGIN}/grafik?tip=altin&birim=ALTIN`
const HISTORY_URL = `${ORIGIN}/ajax/cur/history`

/**
 * A current desktop Chrome User-Agent.
 *
 * Sent as a per-request header and nowhere else. Setting
 * `app.userAgentFallback` or `session.setUserAgent` would change what the
 * *renderer* announces as well, and `scripts/audit-egress.mjs` fails the build
 * on both for that reason.
 */
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

const REQUEST_TIMEOUT_MS = 15_000

/**
 * The session cookie, held for the life of the process and no longer.
 *
 * Deliberately not in Electron's cookie jar. `net.request` would happily persist
 * it into the default session — the same store the renderer's browsing context
 * uses — and a third party's session cookie sitting in the application's own
 * profile is a durable trace of an activity that should leave none. Held here it
 * dies with the process, and `credentials: 'omit'` keeps the jar out of it in
 * both directions.
 */
let sessionCookie: string | null = null

interface Response {
  status: number
  body: string
  setCookie: readonly string[]
}

function request(
  rawUrl: string,
  init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
  signal: AbortSignal
): Promise<Response | null> {
  const url = assertPermittedEgress(rawUrl)

  return new Promise((resolve) => {
    const req = net.request({
      method: init.method,
      url: url.toString(),
      // Neither send nor accept the app's cookie jar. The one cookie this
      // transport needs is carried by hand, above.
      credentials: 'omit',
      redirect: 'error'
    })

    req.setHeader('User-Agent', BROWSER_UA)
    for (const [name, value] of Object.entries(init.headers ?? {})) req.setHeader(name, value)

    let settled = false
    const finish = (value: Response | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }

    const timer = setTimeout(() => {
      req.abort()
      finish(null)
    }, REQUEST_TIMEOUT_MS)
    const onAbort = (): void => {
      req.abort()
      finish(null)
    }
    signal.addEventListener('abort', onAbort, { once: true })

    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const raw = res.headers['set-cookie']
        finish({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          setCookie: Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
        })
      })
      res.on('error', () => finish(null))
    })

    req.on('error', () => finish(null))

    if (init.body !== undefined) req.write(init.body)
    req.end()
  })
}

/** Take a PHPSESSID from the chart page, if we do not already hold one. */
async function ensureCookie(signal: AbortSignal): Promise<boolean> {
  if (sessionCookie !== null) return true

  const res = await request(CHART_URL, { method: 'GET' }, signal)
  if (res === null) return false

  for (const header of res.setCookie) {
    const [pair] = header.split(';')
    if (pair !== undefined && pair.trim().startsWith('PHPSESSID=')) {
      sessionCookie = pair.trim()
      return true
    }
  }
  // The endpoint has answered without a cookie before; the POST is still worth
  // attempting, and its own failure is more informative than guessing here.
  return true
}

/** Only for the suites, and for a provider swap that must not inherit a session. */
export function forgetSession(): void {
  sessionCookie = null
}

/**
 * `YYYY-MM-DD` → `YYYY-MM-DD HH:MM:SS`, which is the form the endpoint wants.
 *
 * The end of the range takes the end of the day: closes land at about 23:59, so
 * a range ending at midnight excludes the very day it names and every response
 * would arrive one day short of what was asked — indistinguishable, to the
 * validator, from §14.2's stale cache.
 */
function asBound(date: string, edge: 'start' | 'end'): string {
  return `${date} ${edge === 'start' ? '00:00:00' : '23:59:59'}`
}

export async function fetchHistory(
  historyRequest: HistoryRequest,
  signal: AbortSignal
): Promise<PriceResult<readonly Close[]>> {
  if (signal.aborted) return { ok: false, error: 'TIMEOUT' }
  if (!(await ensureCookie(signal))) return { ok: false, error: 'OFFLINE' }

  const body = new URLSearchParams({
    kod: sourceCodeFor(historyRequest.typeCode),
    dil_kodu: 'tr',
    tarih1: asBound(historyRequest.from, 'start'),
    tarih2: asBound(historyRequest.to, 'end')
  }).toString()

  const res = await request(
    HISTORY_URL,
    {
      method: 'POST',
      headers: {
        // Without this the endpoint answers 404 with HTML (§14.1).
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: CHART_URL
      },
      body
    },
    signal
  )

  if (res === null) return { ok: false, error: signal.aborted ? 'TIMEOUT' : 'OFFLINE' }
  if (res.status !== 200) return { ok: false, error: 'MALFORMED' }

  // Everything past here is §14.2's business: the status code has already said
  // 200 and the body has already said `error:false` in both of the failures this
  // transport exists to survive.
  return parseHistoryBody(res.body, historyRequest)
}
