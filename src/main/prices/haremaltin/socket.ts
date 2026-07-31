/**
 * The price socket — XJADEITE §14.1.
 *
 * Connect, take the first unsolicited `price_changed` frame, disconnect. §14.1
 * established that the server pushes all its instruments about a hundred
 * milliseconds after the handshake with no subscribe step, which makes a
 * single-shot snapshot the natural primitive and matches §14's
 * manual-refresh-primary design exactly. Nothing here holds a connection open.
 *
 * **This file and `history.ts` are the only two in the application permitted to
 * open a connection**, and `scripts/audit-egress.mjs` fails the build if a third
 * appears or if a URL literal escapes them.
 *
 * The client is hand-rolled over Node's global `WebSocket`, which a probe at the
 * start of this Realisation confirmed exists in Electron 42.8.0's main process
 * (Node 24.18.0) — `engines.node` describes the Node that runs npm, not the one
 * inside Electron, so that needed measuring rather than assuming. The rejected
 * alternative was `socket.io-client`: a dependency built for long-lived
 * reconnecting sessions, whose defaults dial their own transport URLs and
 * reconnect forever, in service of a connection this application wants to last a
 * second and a half. What is actually needed is four frame shapes, and they are
 * below.
 *
 * **Node's WebSocket rides Node's stack, not Chromium's.** The same probe found
 * that `webRequest.onBeforeRequest` never sees it — which is why every URL here
 * goes through `assertPermittedEgress` first. For this transport the chokepoint
 * is not a belt beside a brace; it is the only thing there is.
 */

import { assertPermittedEgress } from '../egress.js'
import type { PriceResult, Snapshot } from '../provider.js'
import { parseSnapshotFrame } from './parse.js'

const SOCKET_ORIGIN = 'wss://hrmsocketonly.haremaltin.com'

/**
 * engine.io protocol versions to try, newest first.
 *
 * §14.1 established that the **polling** transport is disabled server-side for
 * both 3 and 4, but which version the websocket transport accepts was never
 * settled — the probe that would have answered it could not run, because the
 * build environment blocks outbound TCP. Trying both is not indecision: it is
 * the shape this should have anyway, since an unofficial source is free to move
 * between them and §14 requires exactly that kind of change to cost nothing.
 */
const PROTOCOL_VERSIONS = [4, 3] as const

/**
 * Long enough for a slow handshake, short enough that a hung socket gives up.
 *
 * Raised from 6s at v0.9c, against measurement rather than caution. The socket
 * itself is quick — 298ms from construction to the first price frame once the
 * name is resolved — but `getaddrinfo` is not always quick, and it is counted
 * inside this window. On the machine this was found on it returned a flat 5.2
 * seconds for *every* host, router-side DNS answering in 26ms; the resolver
 * stall was systemic and had nothing to do with this source. Six seconds left
 * about eight hundred milliseconds for the connection, so every refresh timed
 * out and the section reported a healthy provider as unreachable.
 *
 * A ceiling costs nothing when the network is well: this resolves in under a
 * second on a normal machine and the deadline is never approached. It is only
 * ever spent by someone who would otherwise have been told a lie.
 */
const FRAME_DEADLINE_MS = 15_000

function socketUrl(eio: number): string {
  return `${SOCKET_ORIGIN}/socket.io/?EIO=${eio}&transport=websocket`
}

/**
 * One attempt at one protocol version.
 *
 * Resolves rather than rejects, always. A transport that throws would put the
 * decision about what an unreachable source means into whichever `catch` block
 * happened to be nearest, and §14 wants that decision made once, here.
 */
function attempt(
  eio: number,
  provider: string,
  signal: AbortSignal
): Promise<PriceResult<Snapshot>> {
  return new Promise((resolve) => {
    const url = assertPermittedEgress(socketUrl(eio))

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      resolve({ ok: false, error: 'OFFLINE' })
      return
    }

    let settled = false
    const finish = (result: PriceResult<Snapshot>): void => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      signal.removeEventListener('abort', onAbort)
      try {
        socket.close()
      } catch {
        // Already closing, or never opened. Either way there is nothing to do.
      }
      resolve(result)
    }

    const deadline = setTimeout(() => finish({ ok: false, error: 'TIMEOUT' }), FRAME_DEADLINE_MS)
    const onAbort = (): void => finish({ ok: false, error: 'TIMEOUT' })
    signal.addEventListener('abort', onAbort, { once: true })

    socket.addEventListener('message', (event) => {
      const text = typeof event.data === 'string' ? event.data : ''
      if (text === '') return

      // engine.io OPEN. socket.io v4 will not deliver namespace events until the
      // client says it wants the default namespace; v3 sends its own and ignores
      // this, so it is sent unconditionally and costs two bytes.
      if (text.startsWith('0{')) {
        try {
          socket.send('40')
        } catch {
          finish({ ok: false, error: 'OFFLINE' })
        }
        return
      }

      // engine.io PING. Answering keeps the connection alive long enough for the
      // first price frame on a server that pings before pushing.
      if (text === '2') {
        try {
          socket.send('3')
        } catch {
          finish({ ok: false, error: 'OFFLINE' })
        }
        return
      }

      // Everything else is offered to the parser, which is the only thing that
      // decides what a frame is. A refusal here means *not this one yet* — the
      // handshake ack, a heartbeat, an event for something else — so the socket
      // keeps listening and the deadline above, not the parser, produces the
      // timeout. Treating the first unparseable frame as failure would abandon
      // the connection on the namespace ack that always precedes the data.
      const parsed = parseSnapshotFrame(text, provider, new Date().toISOString())
      if (parsed.ok) finish(parsed)
    })

    socket.addEventListener('error', () => finish({ ok: false, error: 'OFFLINE' }))
    socket.addEventListener('close', () => finish({ ok: false, error: 'OFFLINE' }))
  })
}

/**
 * A snapshot, or a reason there is not one.
 *
 * Versions are tried in order and the first that yields a frame wins. A
 * `TIMEOUT` is worth retrying at the other version — it is what a server that
 * accepted the socket and then ignored the client looks like — while `OFFLINE`
 * is not: nothing about a second protocol version fixes an absent network, and
 * trying anyway would double the wait a disconnected owner sits through.
 */
export async function fetchSnapshot(
  provider: string,
  signal: AbortSignal
): Promise<PriceResult<Snapshot>> {
  let last: PriceResult<Snapshot> = { ok: false, error: 'OFFLINE' }

  for (const eio of PROTOCOL_VERSIONS) {
    if (signal.aborted) return { ok: false, error: 'TIMEOUT' }
    last = await attempt(eio, provider, signal)
    if (last.ok) return last
    if (last.error === 'OFFLINE') return last
  }

  return last
}
