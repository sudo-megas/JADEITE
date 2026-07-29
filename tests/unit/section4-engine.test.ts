/**
 * The three statistics of §9, and the two edges that matter.
 *
 * The median has to be right for an odd count and an even one — the acceptance
 * says so in as many words — and the division that the even case and the average
 * both need has to round the same way every time. Both are pinned here, including
 * the exact halfway case, which is the one a later change would break silently.
 */

import { describe, expect, it } from 'vitest'

import { computeStatistics } from '@shared/section4/engine'
import type { Line } from '@shared/section4/types'

let nextId = 1

/** A line carrying a figure. Values are hundredths, as §9's storage is. */
function line(value: number | null, label = ''): Line {
  const id = nextId++
  return { id, label, value, position: id }
}

describe('an empty list has no statistics, and says so', () => {
  it('answers null rather than zero for all three', () => {
    expect(computeStatistics([])).toEqual({ count: 0, total: 0, average: null, median: null })
  })

  /**
   * A heading is a line with a label and no figure. Counting it as a zero would
   * drag every average toward it, which is the whole reason `value` is nullable.
   */
  it('ignores lines that carry only a label', () => {
    const stats = computeStatistics([line(null, 'Kira'), line(null, 'Fatura')])
    expect(stats).toEqual({ count: 0, total: 0, average: null, median: null })
  })

  it('counts the figures, not the lines', () => {
    const stats = computeStatistics([line(100), line(null, 'a heading'), line(300)])
    expect(stats.count).toBe(2)
    expect(stats.total).toBe(400)
    expect(stats.average).toBe(200)
  })
})

describe('the total is an exact sum', () => {
  it('adds hundredths without a float ever participating', () => {
    // 0,10 + 0,20 is 0,30 exactly, which is the sum floats famously get wrong.
    const stats = computeStatistics([line(10), line(20)])
    expect(stats.total).toBe(30)
  })

  it('is zero for a single zero, which is a real answer', () => {
    const stats = computeStatistics([line(0)])
    expect(stats.count).toBe(1)
    expect(stats.total).toBe(0)
    expect(stats.average).toBe(0)
    expect(stats.median).toBe(0)
  })
})

describe('the median is right for both parities', () => {
  it('takes the middle figure of an odd count, exactly', () => {
    expect(computeStatistics([line(100), line(500), line(300)]).median).toBe(300)
    expect(computeStatistics([line(1)]).median).toBe(1)
  })

  it('takes the mean of the two middle figures of an even count', () => {
    expect(computeStatistics([line(100), line(200), line(300), line(400)]).median).toBe(250)
  })

  /**
   * Values are hundredths, so the mean of two of them can land on a half. It is
   * rounded to the precision the values carry rather than shown to a third
   * decimal no input has — false precision in a scratchpad is worse than a
   * rounded answer, and the rule is half up.
   */
  it('rounds the halfway case up rather than showing precision no input has', () => {
    expect(computeStatistics([line(100), line(101)]).median).toBe(101)
    expect(computeStatistics([line(100), line(103)]).median).toBe(102)
    expect(computeStatistics([line(100), line(105)]).median).toBe(103)
  })

  it('does not care what order the lines are arranged in', () => {
    const ascending = computeStatistics([line(100), line(200), line(900)])
    const shuffled = computeStatistics([line(900), line(100), line(200)])
    expect(shuffled.median).toBe(ascending.median)
    expect(shuffled.total).toBe(ascending.total)
  })

  /** Sorting the figures must not reorder the owner's own arrangement. */
  it('leaves the caller’s list untouched', () => {
    const lines = [line(900), line(100), line(200)]
    const before = lines.map((l) => l.value)
    computeStatistics(lines)
    expect(lines.map((l) => l.value)).toEqual(before)
  })

  it('handles repeated figures without collapsing them', () => {
    const stats = computeStatistics([line(500), line(500), line(500), line(500)])
    expect(stats.count).toBe(4)
    expect(stats.median).toBe(500)
    expect(stats.average).toBe(500)
  })
})

describe('the average rounds the same way the median does', () => {
  it('rounds a third up when it lands on a half, and down otherwise', () => {
    // 1,00 + 1,00 + 2,00 averages to 1,3333… → 1,33.
    expect(computeStatistics([line(100), line(100), line(200)]).average).toBe(133)
    // 1,00 + 2,00 + 2,00 averages to 1,6666… → 1,67.
    expect(computeStatistics([line(100), line(200), line(200)]).average).toBe(167)
    // Exactly a half: 1,00 and 1,01 average to 1,005 → 1,01.
    expect(computeStatistics([line(100), line(101)]).average).toBe(101)
  })

  it('is the figure itself for a single line', () => {
    expect(computeStatistics([line(6_685_00)]).average).toBe(6_685_00)
  })

  it('stays an integer for every input', () => {
    const stats = computeStatistics([line(1), line(2), line(4), line(8), line(16), line(32), line(64)])
    expect(Number.isInteger(stats.average)).toBe(true)
    expect(Number.isInteger(stats.median)).toBe(true)
    expect(Number.isInteger(stats.total)).toBe(true)
  })
})

describe('a long list stays exact', () => {
  it('totals a thousand lines without drift', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => line(i + 1))
    const stats = computeStatistics(lines)
    expect(stats.count).toBe(1000)
    expect(stats.total).toBe((1000 * 1001) / 2)
    // Σ 1..1000 ÷ 1000 = 500,5 → 501 under half up.
    expect(stats.average).toBe(501)
    // Even count: the 500th and 501st figures are 500 and 501.
    expect(stats.median).toBe(501)
  })
})
