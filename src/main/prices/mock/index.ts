/**
 * Providers that do not touch the network — XJADEITE §14.
 *
 * These are **shipped code, not test scaffolding**, and the distinction earns
 * its place twice over. §14 requires the provider to be swappable "without
 * touching anything else", and an interface with one implementation has never
 * been asked to prove it; these are the second and third, present from the day
 * the first was written. And they are what lets this Realisation claim that no
 * test in any layer makes a network call — five of its seven acceptance checks
 * run against these, including both of §14.2's silent failures.
 *
 * `hosts` is empty on all three, so the registry's allowlist check passes them
 * without widening anything. A mock that named a host would be a mock that could
 * be pointed somewhere.
 *
 * They are unreachable in a packaged build: `selectedProviderId` returns
 * `haremaltin` unconditionally when `app.isPackaged`, so the environment
 * variable read below cannot influence a shipped installation. That is what
 * keeps it clear of §16.6 — there is no configuration file, and the only build
 * that consults anything outside itself is one a developer started by hand.
 */

import type {
  Close,
  HistoryRequest,
  PriceProvider,
  PriceResult,
  Quote,
  Snapshot
} from '../provider.js'
import { MAPPINGS } from '../haremaltin/mapping.js'
import { parseHistoryBody, parseSnapshotFrame } from '../haremaltin/parse.js'
import {
  DATALESS_HISTORY,
  DATALESS_HISTORY_REQUEST,
  GOOD_HISTORY,
  GOOD_HISTORY_REQUEST,
  PRICE_CHANGED_FRAME,
  TRUNCATED_HISTORY,
  TRUNCATED_HISTORY_REQUEST
} from './recorded.js'

/**
 * Which recorded body `mock.history` answers with.
 *
 * This is the seam the acceptance checks turn on. §14.2's two silent failures
 * are properties of a *response*, so proving the provider refuses them needs a
 * way to hand it one — otherwise the checks can only be made against the parser
 * in isolation, which proves the parser and not the provider.
 *
 * The **request is taken from the fixture, not from the caller**. That looks
 * backwards and is deliberate: a recorded body's dates are fixed in the past, so
 * validating it against a range ending today would report `STALE_RANGE` for
 * every fixture including the good one — and the tempting repair, widening
 * `STALE_RANGE_TOLERANCE_DAYS` until the good fixture passes, would dismantle
 * the §14.2 defence in order to make a mock convenient.
 */
type Fixture = 'good' | 'truncated' | 'dataless'

function selectedFixture(): Fixture {
  const named = process.env['JADEITE_PRICE_FIXTURE']
  return named === 'truncated' || named === 'dataless' ? named : 'good'
}

function recordedHistory(): PriceResult<readonly Close[]> {
  switch (selectedFixture()) {
    case 'truncated':
      return parseHistoryBody(TRUNCATED_HISTORY, TRUNCATED_HISTORY_REQUEST)
    case 'dataless':
      return parseHistoryBody(DATALESS_HISTORY, DATALESS_HISTORY_REQUEST)
    case 'good':
      return parseHistoryBody(GOOD_HISTORY, GOOD_HISTORY_REQUEST)
  }
}

/**
 * The ordinary mock: the recorded frame, through the real parser.
 *
 * Routing it through `parseSnapshotFrame` rather than returning a hand-built
 * `Snapshot` is the point — the mock exercises the same untrusted-input path the
 * real provider does, so a defect in the parser fails these tests too. A mock
 * that returned finished objects would be a mock that agreed with itself.
 */
export const mock: PriceProvider = {
  id: 'mock',
  hosts: [],

  snapshot(signal: AbortSignal): Promise<PriceResult<Snapshot>> {
    if (signal.aborted) return Promise.resolve({ ok: false, error: 'TIMEOUT' })
    return Promise.resolve(parseSnapshotFrame(PRICE_CHANGED_FRAME, 'mock', new Date().toISOString()))
  },

  history(_request: HistoryRequest, signal: AbortSignal): Promise<PriceResult<readonly Close[]>> {
    if (signal.aborted) return Promise.resolve({ ok: false, error: 'TIMEOUT' })
    return Promise.resolve(recordedHistory())
  }
}

/**
 * A second provider, quoting different figures under a different name.
 *
 * This is what makes "provider swap demonstrated with a mock second provider
 * behind the same interface" a test rather than a claim. Demonstrating the swap
 * against `offline-mock` would prove only that a failure propagates; two
 * providers that both *succeed* with **different numbers** prove that the
 * figures on screen followed the swap, and that `provider` on each stored row
 * names the one that actually said so.
 *
 * Every quote is one per cent above `mock`'s, which is far enough apart to read
 * at a glance and close enough to stay well inside the price ceiling.
 */
export const mockB: PriceProvider = {
  id: 'mock-b',
  hosts: [],

  snapshot(signal: AbortSignal): Promise<PriceResult<Snapshot>> {
    if (signal.aborted) return Promise.resolve({ ok: false, error: 'TIMEOUT' })

    const base = parseSnapshotFrame(PRICE_CHANGED_FRAME, 'mock-b', new Date().toISOString())
    if (!base.ok) return Promise.resolve(base)

    const quotes: Quote[] = base.value.quotes.map((quote) => ({
      typeCode: quote.typeCode,
      // Integer arithmetic, because a live figure is stored in the same kuruş
      // column as the owner's own and a rounded float would put a price in the
      // vault that no source ever quoted.
      value: quote.value + Math.round(quote.value / 100)
    }))

    return Promise.resolve({ ok: true, value: { ...base.value, quotes } })
  },

  history(_request: HistoryRequest, signal: AbortSignal): Promise<PriceResult<readonly Close[]>> {
    if (signal.aborted) return Promise.resolve({ ok: false, error: 'TIMEOUT' })
    return Promise.resolve(recordedHistory())
  }
}

/**
 * A provider that is never reachable.
 *
 * REALISATION.md asks that an "airplane-mode run degrades silently", and no test
 * may unplug a network cable. Everything downstream of `{ok:false,
 * error:'OFFLINE'}` is byte-identical to what a real unplugged interface
 * produces, so this proves the whole of that path except the transport's own
 * failure detection — which is why the rung also carries a recorded manual
 * airplane-mode check that a person performs.
 */
export const offlineMock: PriceProvider = {
  id: 'offline-mock',
  hosts: [],
  snapshot: (): Promise<PriceResult<Snapshot>> =>
    Promise.resolve({ ok: false, error: 'OFFLINE' }),
  history: (): Promise<PriceResult<readonly Close[]>> =>
    Promise.resolve({ ok: false, error: 'OFFLINE' })
}

/** Every type the mocks quote, for a suite that wants to assert coverage. */
export const MOCK_TYPE_COUNT = MAPPINGS.length
