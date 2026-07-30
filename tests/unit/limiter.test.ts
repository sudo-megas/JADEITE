/**
 * Politeness, and the two ways a rate limiter usually fails.
 *
 * The first is holding the button down: if a refused attempt counted as an
 * attempt it would push its own next opportunity away, and the owner could
 * never refresh again. The second is a clock that moves backwards — a timezone
 * change or an NTP correction — which on a naive subtraction permits an
 * unlimited burst at exactly the moment the app is least sure of itself.
 */

import { describe, expect, it } from 'vitest'

import {
  BACKOFF_BASE_MS,
  BACKOFF_CEILING_MS,
  FRESH,
  MIN_INTERVAL_MS,
  afterAttempt,
  mayAttempt,
  requiredWaitMs
} from '../../src/main/prices/limiter.js'

const T0 = 1_800_000_000_000

describe('the rate limiter (§14)', () => {
  it('permits the first attempt, having nothing to wait for', () => {
    expect(mayAttempt(FRESH, T0)).toBe(true)
    expect(requiredWaitMs(FRESH, T0)).toBe(0)
  })

  it('holds a successful attempt off for the ordinary floor', () => {
    const state = afterAttempt(FRESH, T0, true)
    expect(mayAttempt(state, T0)).toBe(false)
    expect(requiredWaitMs(state, T0)).toBe(MIN_INTERVAL_MS)
    expect(mayAttempt(state, T0 + MIN_INTERVAL_MS - 1)).toBe(false)
    expect(mayAttempt(state, T0 + MIN_INTERVAL_MS)).toBe(true)
  })

  it('backs off exponentially while the provider keeps failing', () => {
    let state = afterAttempt(FRESH, T0, false)
    expect(requiredWaitMs(state, T0)).toBe(BACKOFF_BASE_MS)

    state = afterAttempt(state, T0, false)
    expect(requiredWaitMs(state, T0)).toBe(BACKOFF_BASE_MS * 2)

    state = afterAttempt(state, T0, false)
    expect(requiredWaitMs(state, T0)).toBe(BACKOFF_BASE_MS * 4)
  })

  it('stops backing off at the ceiling, so an outage does not cost the day', () => {
    let state = FRESH
    for (let i = 0; i < 20; i += 1) state = afterAttempt(state, T0, false)
    expect(requiredWaitMs(state, T0)).toBe(BACKOFF_CEILING_MS)
  })

  it('forgets the backoff the moment an attempt succeeds', () => {
    let state = FRESH
    for (let i = 0; i < 5; i += 1) state = afterAttempt(state, T0, false)
    state = afterAttempt(state, T0, true)
    expect(requiredWaitMs(state, T0)).toBe(MIN_INTERVAL_MS)
  })

  it('does not let a refused request count against the next one', () => {
    // The button held down: `mayAttempt` says no, and nothing is recorded,
    // so the original wait runs out on schedule rather than being renewed.
    const state = afterAttempt(FRESH, T0, true)
    for (let t = T0; t < T0 + MIN_INTERVAL_MS; t += 1000) {
      expect(mayAttempt(state, t)).toBe(false)
    }
    expect(mayAttempt(state, T0 + MIN_INTERVAL_MS)).toBe(true)
  })

  it('refuses a burst when the clock goes backwards', () => {
    const state = afterAttempt(FRESH, T0, true)
    // An hour earlier than the last attempt: a naive subtraction makes the
    // elapsed time hugely negative and permits everything.
    expect(mayAttempt(state, T0 - 3_600_000)).toBe(false)
    expect(requiredWaitMs(state, T0 - 3_600_000)).toBe(MIN_INTERVAL_MS)
  })
})
