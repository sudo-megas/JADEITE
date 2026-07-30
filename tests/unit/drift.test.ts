/**
 * What "notably" means, pinned from both sides.
 *
 * Two things are worth testing here and they are not the obvious one. The first
 * is the boundary: a rule stated as two per cent is worth nothing if the figure
 * exactly two per cent away lands on whichever side the arithmetic felt like, so
 * every threshold case is asserted at the last kuruş of agreement *and* the
 * first kuruş of drift, in both directions, including a type whose two per cent
 * is not a whole kuruş.
 *
 * The second is the silences. §8.5's ruling is that a missing live figure must
 * never read as an alarm, and the only way that promise breaks is a null or a
 * zero taking a path meant for a number — so every combination of absent, zero
 * and present is written down rather than assumed.
 */

import { describe, expect, it } from 'vitest'

import { DRIFT_THRESHOLD, driftRatio, driftState } from '@shared/section3/drift'

/** ₺6.505,00 per gram — the price Section 3's acceptance figures are quoted at. */
const GOLD = 650_500

/** Two per cent of it, exactly: ₺130,10. */
const GOLD_TWO_PERCENT = 13_010

/** ₺41,30 per dollar, whose two per cent is 82,6 kuruş and not a whole one. */
const USD = 4_130

describe('the threshold itself', () => {
  it('is two per cent, the figure §8.5 and §14.3 argue for', () => {
    expect(DRIFT_THRESHOLD).toBe(0.02)
  })
})

describe('two figures that agree', () => {
  it('is aligned when they are the same number', () => {
    expect(driftState(GOLD, GOLD)).toBe('aligned')
  })

  it('is aligned for the ESKİ/YENİ spread, which §8.5 puts near half a per cent', () => {
    expect(driftState(GOLD, GOLD + 3_300)).toBe('aligned')
    expect(driftState(GOLD, GOLD - 3_300)).toBe('aligned')
  })

  it('is aligned at exactly two per cent, above and below', () => {
    expect(driftState(GOLD, GOLD + GOLD_TWO_PERCENT)).toBe('aligned')
    expect(driftState(GOLD, GOLD - GOLD_TWO_PERCENT)).toBe('aligned')
  })

  it('is aligned at the last whole kuruş inside a fractional threshold', () => {
    // Two per cent of ₺41,30 is 82,6 kuruş, so 82 is still agreement.
    expect(driftState(USD, USD + 82)).toBe('aligned')
    expect(driftState(USD, USD - 82)).toBe('aligned')
  })
})

describe('two figures that have parted company', () => {
  it('drifts one kuruş past two per cent, above and below', () => {
    expect(driftState(GOLD, GOLD + GOLD_TWO_PERCENT + 1)).toBe('drifting')
    expect(driftState(GOLD, GOLD - GOLD_TWO_PERCENT - 1)).toBe('drifting')
  })

  it('drifts at the first whole kuruş outside a fractional threshold', () => {
    expect(driftState(USD, USD + 83)).toBe('drifting')
    expect(driftState(USD, USD - 83)).toBe('drifting')
  })

  it('drifts when a typed price has been left behind by a rising market', () => {
    // ₺5.900,00 typed against ₺6.505,00 live — a shade over ten per cent.
    expect(driftState(590_000, GOLD)).toBe('drifting')
  })

})

describe('which price is the yardstick', () => {
  it('measures away from the owner’s figure, and so is deliberately not symmetric', () => {
    // The same two numbers — ₺100,00 and ₺102,04 — once with the owner's as the
    // smaller and once as the larger. The gap is 2,04% of 100,00 and 1,999% of
    // 102,04, so the verdict turns entirely on whose price is the denominator.
    // §8.5 says it is the owner's, which is what this pair asserts.
    expect(driftState(10_000, 10_204)).toBe('drifting')
    expect(driftState(10_204, 10_000)).toBe('aligned')
  })
})

describe('the silences', () => {
  it('says nothing at all when the provider has no figure for the type', () => {
    expect(driftState(GOLD, null)).toBe('none')
  })

  it('says nothing when neither side has a figure', () => {
    expect(driftState(null, null)).toBe('none')
  })

  it('says nothing when a manual price of zero meets no live figure', () => {
    expect(driftState(0, null)).toBe('none')
  })

  it('treats a live figure of zero as no figure, never as a hundred per cent drift', () => {
    expect(driftState(GOLD, 0)).toBe('none')
    expect(driftState(GOLD, -1)).toBe('none')
  })

  it('is unpriced when a live figure has nothing typed to measure it against', () => {
    expect(driftState(null, GOLD)).toBe('unpriced')
  })

  it('is unpriced rather than dividing by a manual price of zero', () => {
    expect(driftState(0, GOLD)).toBe('unpriced')
    expect(driftState(-1, GOLD)).toBe('unpriced')
  })

  it('never answers drifting because something is missing', () => {
    const missing = [
      driftState(null, null),
      driftState(null, GOLD),
      driftState(GOLD, null),
      driftState(0, GOLD),
      driftState(GOLD, 0)
    ]
    expect(missing).not.toContain('drifting')
  })
})

describe('the ratio the tooltip shows', () => {
  it('is the gap as a fraction of the owner’s price', () => {
    expect(driftRatio(GOLD, GOLD + GOLD_TWO_PERCENT)).toBeCloseTo(0.02, 10)
    expect(driftRatio(GOLD, GOLD - GOLD_TWO_PERCENT)).toBeCloseTo(0.02, 10)
    expect(driftRatio(10_000, 10_800)).toBeCloseTo(0.08, 10)
  })

  it('is zero when the two agree exactly, not null', () => {
    expect(driftRatio(GOLD, GOLD)).toBe(0)
  })

  it('is null wherever there is no ratio to state', () => {
    expect(driftRatio(null, null)).toBeNull()
    expect(driftRatio(null, GOLD)).toBeNull()
    expect(driftRatio(GOLD, null)).toBeNull()
    expect(driftRatio(0, GOLD)).toBeNull()
    expect(driftRatio(GOLD, 0)).toBeNull()
  })
})
