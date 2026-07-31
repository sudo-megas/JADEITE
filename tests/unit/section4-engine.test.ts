/**
 * The three statistics of §9, and the two edges that matter.
 *
 * The median has to be right for an odd count and an even one — the acceptance
 * says so in as many words — and the division that the even case and the average
 * both need has to round the same way every time. Both are pinned here, including
 * the exact halfway case, which is the one a later change would break silently.
 *
 * The grid replaced the list of labelled lines, and none of the arithmetic below
 * moved: a cell carries the same integer hundredths a line's value did. What did
 * move is what an absent figure looks like. There is no nullable value any more,
 * so the cases about a heading with no figure are gone rather than rewritten —
 * an untouched box has no row and never reaches this function at all, while a
 * box holding zero does and counts, which is pinned instead.
 */

import { describe, expect, it } from 'vitest'

import { computeStatistics, visibleRows } from '@shared/section4/engine'
import { COLUMNS, MAX_ROWS, MIN_ROWS } from '@shared/section4/types'
import type { Cell } from '@shared/section4/types'

let nextSlot = 0

/** A box carrying a figure. Values are hundredths, as §9's storage is. */
function cell(value: number): Cell {
  return { slot: nextSlot++, value }
}

/** A box at a named slot, for the cases where where it sits is the point. */
function at(slot: number, value = 100): Cell {
  return { slot, value }
}

describe('an empty grid has no statistics, and says so', () => {
  it('answers null rather than zero for all three', () => {
    expect(computeStatistics([])).toEqual({ count: 0, total: 0, average: null, median: null })
  })

  /**
   * Only boxes carrying a figure ever arrive here — an untouched one has no row
   * to send. A typed zero is not that: it is a figure, and it joins the average
   * like any other, which is the whole distinction the sparse table draws.
   */
  it('counts a zero as a figure, because someone typed it', () => {
    const stats = computeStatistics([cell(0), cell(300)])
    expect(stats.count).toBe(2)
    expect(stats.total).toBe(300)
    expect(stats.average).toBe(150)
  })
})

describe('the total is an exact sum', () => {
  it('adds hundredths without a float ever participating', () => {
    // 0,10 + 0,20 is 0,30 exactly, which is the sum floats famously get wrong.
    const stats = computeStatistics([cell(10), cell(20)])
    expect(stats.total).toBe(30)
  })

  it('is zero for a single zero, which is a real answer', () => {
    const stats = computeStatistics([cell(0)])
    expect(stats.count).toBe(1)
    expect(stats.total).toBe(0)
    expect(stats.average).toBe(0)
    expect(stats.median).toBe(0)
  })
})

describe('the median is right for both parities', () => {
  it('takes the middle figure of an odd count, exactly', () => {
    expect(computeStatistics([cell(100), cell(500), cell(300)]).median).toBe(300)
    expect(computeStatistics([cell(1)]).median).toBe(1)
  })

  it('takes the mean of the two middle figures of an even count', () => {
    expect(computeStatistics([cell(100), cell(200), cell(300), cell(400)]).median).toBe(250)
  })

  /**
   * Values are hundredths, so the mean of two of them can land on a half. It is
   * rounded to the precision the values carry rather than shown to a third
   * decimal no input has — false precision in a scratchpad is worse than a
   * rounded answer, and the rule is half up.
   */
  it('rounds the halfway case up rather than showing precision no input has', () => {
    expect(computeStatistics([cell(100), cell(101)]).median).toBe(101)
    expect(computeStatistics([cell(100), cell(103)]).median).toBe(102)
    expect(computeStatistics([cell(100), cell(105)]).median).toBe(103)
  })

  it('does not care what order the boxes were filled in', () => {
    const ascending = computeStatistics([cell(100), cell(200), cell(900)])
    const shuffled = computeStatistics([cell(900), cell(100), cell(200)])
    expect(shuffled.median).toBe(ascending.median)
    expect(shuffled.total).toBe(ascending.total)
  })

  /** Sorting the figures must not reorder the caller's own array. */
  it('leaves the caller’s array untouched', () => {
    const cells = [cell(900), cell(100), cell(200)]
    const before = cells.map((c) => c.value)
    computeStatistics(cells)
    expect(cells.map((c) => c.value)).toEqual(before)
  })

  it('handles repeated figures without collapsing them', () => {
    const stats = computeStatistics([cell(500), cell(500), cell(500), cell(500)])
    expect(stats.count).toBe(4)
    expect(stats.median).toBe(500)
    expect(stats.average).toBe(500)
  })
})

describe('the average rounds the same way the median does', () => {
  it('rounds a third up when it lands on a half, and down otherwise', () => {
    // 1,00 + 1,00 + 2,00 averages to 1,3333… → 1,33.
    expect(computeStatistics([cell(100), cell(100), cell(200)]).average).toBe(133)
    // 1,00 + 2,00 + 2,00 averages to 1,6666… → 1,67.
    expect(computeStatistics([cell(100), cell(200), cell(200)]).average).toBe(167)
    // Exactly a half: 1,00 and 1,01 average to 1,005 → 1,01.
    expect(computeStatistics([cell(100), cell(101)]).average).toBe(101)
  })

  it('is the figure itself for a single box', () => {
    expect(computeStatistics([cell(6_685_00)]).average).toBe(6_685_00)
  })

  it('stays an integer for every input', () => {
    const stats = computeStatistics([
      cell(1),
      cell(2),
      cell(4),
      cell(8),
      cell(16),
      cell(32),
      cell(64)
    ])
    expect(Number.isInteger(stats.average)).toBe(true)
    expect(Number.isInteger(stats.median)).toBe(true)
    expect(Number.isInteger(stats.total)).toBe(true)
  })
})

describe('a full grid stays exact', () => {
  it('totals a thousand figures without drift', () => {
    const cells = Array.from({ length: 1000 }, (_unused, i) => cell(i + 1))
    const stats = computeStatistics(cells)
    expect(stats.count).toBe(1000)
    expect(stats.total).toBe((1000 * 1001) / 2)
    // Σ 1..1000 ÷ 1000 = 500,5 → 501 under half up.
    expect(stats.average).toBe(501)
    // Even count: the 500th and 501st figures are 500 and 501.
    expect(stats.median).toBe(501)
  })
})

/**
 * How many rows the grid offers.
 *
 * The rule is one sentence — an empty row always follows the last figure, within
 * a floor and a ceiling — and every case below is that sentence at one of its
 * three boundaries. The store holds a high-water mark over the top of this, so
 * what is pinned here is the floor rather than what is finally drawn.
 */
describe('the grid grows a row at a time', () => {
  it('offers a hundred boxes before anything at all is typed', () => {
    expect(visibleRows([])).toBe(MIN_ROWS)
  })

  it('stays at the floor while the figures are nowhere near it', () => {
    expect(visibleRows([at(0), at(7), at(23)])).toBe(MIN_ROWS)
    // The last box of the second-to-last row is still inside the floor: the row
    // it asks to have after it is the last one already on screen.
    expect(visibleRows([at(COLUMNS * (MIN_ROWS - 1) - 1)])).toBe(MIN_ROWS)
  })

  it('adds a row the moment the last one is used at all', () => {
    // Slot 90 is the first box of the tenth row, and the tenth row is the last.
    expect(visibleRows([at(COLUMNS * (MIN_ROWS - 1))])).toBe(MIN_ROWS + 1)
    // Filling the rest of that row asks for no more than the one new row.
    expect(visibleRows([at(COLUMNS * MIN_ROWS - 1)])).toBe(MIN_ROWS + 1)
    // And using the new row asks for the one after it.
    expect(visibleRows([at(COLUMNS * MIN_ROWS)])).toBe(MIN_ROWS + 2)
  })

  it('measures the highest figure and ignores every gap below it', () => {
    const scattered = [at(3), at(COLUMNS * 20 + 4), at(11)]
    expect(visibleRows(scattered)).toBe(22)
    // Order of arrival is not slot order, and must not matter.
    expect(visibleRows([...scattered].reverse())).toBe(22)
  })

  it('stops at the ceiling rather than offering a row with no slots behind it', () => {
    // The last row that can be reached is the hundredth; it gets no trailing one.
    expect(visibleRows([at(COLUMNS * MAX_ROWS - 1)])).toBe(MAX_ROWS)
    // The row before it still wants its empty row, and that row is the last.
    expect(visibleRows([at(COLUMNS * (MAX_ROWS - 1) - 1)])).toBe(MAX_ROWS)
  })
})
