/**
 * The Section 1 arithmetic, including the Realisation III acceptance fixture.
 *
 * The fixture takes the retiring workbook's *shape* — six income columns, ten
 * expense columns, five of them left empty, all in kuruş — and gives it amounts
 * that are nobody's. The workbook itself stays off this repository, so its
 * figures do too; what has to be proved is that sixteen columns of two-decimal
 * money total exactly, and that is a property of the arithmetic rather than of
 * any particular row.
 *
 * The real July 2026 row was run through this same engine on the owner's
 * machine and reproduced the sheet's own two totals to the kuruş.
 */

import { describe, expect, it } from 'vitest'

import {
  bucketOf,
  categoryTotalOver,
  computeWorkspace,
  orderedCategories,
  signedContribution,
  sumMonths
} from '@shared/section1/engine'
import type { Category, Entry, YearWorkspace } from '@shared/section1/types'

let nextId = 1

function category(
  name: string,
  kind: Category['kind'],
  position: number,
  valueType: Category['valueType'] = 'TRY',
  year = 2026
): Category {
  return { id: nextId++, year, name, kind, valueType, position }
}

function entry(
  categoryId: number,
  month: number,
  amount: number,
  isRefund = false,
  note: string | null = null
): Entry {
  return { categoryId, month, amount, isRefund, note }
}

function workspace(categories: Category[], entries: Entry[], year = 2026): YearWorkspace {
  return { year, accentOverride: null, categories, entries }
}

// --- The acceptance fixture ------------------------------------------------

/**
 * One month of a sixteen-column year, in the workbook's shape.
 *
 * The five empty expense columns stand where the sheet had blanks and `'-'`
 * placeholders: absent, not zero, because empty means empty (§6.3) and §18.2
 * finding 3 retires the placeholder itself.
 */
const ONE_MONTH = {
  income: [
    ['MAAŞ', 7_111_111],
    ['İKİNCİ MAAŞ', 6_888_889],
    ['EK DERS', 1_234_567],
    ['PRİM', 987_654],
    ['KİRA GELİRİ', 222_222],
    ['DİĞER GELİR', 177_778]
  ],
  expenses: [
    ['KİRA', 3_150_000],
    ['AİDAT', 247_533],
    ['ELEKTRİK', 41_925],
    ['DOĞALGAZ', 9_099],
    ['İNTERNET', 123_456],
    ['SU', null],
    ['MARKET', null],
    ['BENZİN', null],
    ['SERVİS', null],
    ['KREDİ', null]
  ]
} as const

/** Chosen so that no total lands on a round number by accident. */
const EXPECTED_INCOME_SUBTOTAL = 16_622_221 // 166.222,21 ₺
const EXPECTED_EXPENSE_TOTAL = 3_572_013 //     35.720,13 ₺
const EXPECTED_NET_TOTAL = 13_050_208 //       130.502,08 ₺

const JULY = 7

function buildJulyRow(): YearWorkspace {
  const categories: Category[] = []
  const entries: Entry[] = []

  ONE_MONTH.income.forEach(([name, amount], index) => {
    const c = category(name as string, 'income', index)
    categories.push(c)
    if (amount !== null) entries.push(entry(c.id, JULY, amount as number))
  })
  ONE_MONTH.expenses.forEach(([name, amount], index) => {
    const c = category(name as string, 'expense', index)
    categories.push(c)
    if (amount !== null) entries.push(entry(c.id, JULY, amount as number))
  })

  return workspace(categories, entries)
}

describe('Realisation III acceptance — the source workbook’s row shape', () => {
  it('has the shape the sheet has: six income columns and ten expense columns', () => {
    const ws = buildJulyRow()
    expect(ws.categories.filter((c) => c.kind === 'income')).toHaveLength(6)
    expect(ws.categories.filter((c) => c.kind === 'expense')).toHaveLength(10)
    expect(ws.categories).toHaveLength(16)
  })

  it('totals sixteen columns of kuruş exactly', () => {
    const computed = computeWorkspace(buildJulyRow())
    const july = computed.months.find((m) => m.month === 7)
    expect(july).toBeDefined()

    const bucket = bucketOf(july!.buckets, 'TRY')
    expect(bucket.income).toBe(EXPECTED_INCOME_SUBTOTAL)
    expect(bucket.expense).toBe(EXPECTED_EXPENSE_TOTAL)
    expect(bucket.net).toBe(EXPECTED_NET_TOTAL)

    // And the identity the sheet's own formula asserted.
    expect(bucket.income - bucket.expense).toBe(bucket.net)
  })

  it('leaves the eleven other months empty rather than zero-filled', () => {
    const computed = computeWorkspace(buildJulyRow())
    expect(computed.months).toHaveLength(12)

    for (const row of computed.months) {
      if (row.month === JULY) {
        // Five of the sixteen columns are blank, as they were on the sheet.
        expect(row.cells.size).toBe(11)
        continue
      }
      expect(row.cells.size).toBe(0)
      expect(bucketOf(row.buckets, 'TRY').net).toBe(0)
    }
  })

  it('reports the same figures on the year summary, July being the only month', () => {
    const computed = computeWorkspace(buildJulyRow())
    const year = bucketOf(computed.yearBuckets, 'TRY')
    expect(year.income).toBe(EXPECTED_INCOME_SUBTOTAL)
    expect(year.net).toBe(EXPECTED_NET_TOTAL)
  })

  it('never lets a float touch the money', () => {
    const computed = computeWorkspace(buildJulyRow())
    const july = bucketOf(computed.months[6]!.buckets, 'TRY')
    for (const value of [july.income, july.expense, july.net]) {
      expect(Number.isSafeInteger(value)).toBe(true)
    }
  })
})

// --- Refunds ---------------------------------------------------------------

describe('refunds count against their own category (§6.3)', () => {
  it('inverts a single entry’s contribution and nothing else', () => {
    expect(signedContribution({ amount: 60_050, isRefund: false })).toBe(60_050)
    expect(signedContribution({ amount: 60_050, isRefund: true })).toBe(-60_050)
  })

  it('an expense refund reduces expenses and raises the net', () => {
    const salary = category('MAAŞ', 'income', 0)
    const power = category('ELEKTRİK', 'expense', 0)
    const ws = workspace([salary, power], [entry(salary.id, 3, 100_000), entry(power.id, 3, 30_000)])
    // One entry per (month, category), as UNIQUE (year, month, category_id)
    // guarantees: the refund replaces the charge rather than joining it.
    const refunded = workspace(
      [salary, power],
      [entry(salary.id, 3, 100_000), entry(power.id, 3, 30_000, true)]
    )

    const plain = bucketOf(computeWorkspace(ws).months[2]!.buckets, 'TRY')
    const withRefund = bucketOf(computeWorkspace(refunded).months[2]!.buckets, 'TRY')

    expect(plain.expense).toBe(30_000)
    expect(withRefund.expense).toBe(-30_000)
    expect(withRefund.income).toBe(100_000)
    expect(withRefund.net).toBe(130_000)
  })

  it('an income refund reduces income and lowers the net', () => {
    const salary = category('MAAŞ', 'income', 0)
    const ws = workspace([salary], [entry(salary.id, 5, 10_000, true)])
    const bucket = bucketOf(computeWorkspace(ws).months[4]!.buckets, 'TRY')

    expect(bucket.income).toBe(-10_000)
    expect(bucket.expense).toBe(0)
    expect(bucket.net).toBe(-10_000)
  })

  it('never moves a refund into the opposite group', () => {
    // The rejected reading — "an expense refund is income" — would inflate
    // GELİR TOPLAM with money that was never income.
    const power = category('ELEKTRİK', 'expense', 0)
    const ws = workspace([power], [entry(power.id, 1, 50_000, true)])
    const bucket = bucketOf(computeWorkspace(ws).months[0]!.buckets, 'TRY')
    expect(bucket.income).toBe(0)
  })

  it('lets an aggregate go negative rather than clamping money out of sight', () => {
    const power = category('ELEKTRİK', 'expense', 0)
    const ws = workspace([power], [entry(power.id, 2, 40_000, true)])
    expect(bucketOf(computeWorkspace(ws).yearBuckets, 'TRY').expense).toBe(-40_000)
  })
})

// --- Empty, zero, and retirement -------------------------------------------

describe('empty is empty, and zero is a number (§6.3)', () => {
  it('distinguishes an absent cell from a stored zero', () => {
    const power = category('ELEKTRİK', 'expense', 0)
    const absent = computeWorkspace(workspace([power], []))
    const zero = computeWorkspace(workspace([power], [entry(power.id, 1, 0)]))

    expect(absent.months[0]!.cells.has(power.id)).toBe(false)
    expect(zero.months[0]!.cells.get(power.id)?.amount).toBe(0)

    // Arithmetically identical, semantically not — which is the whole point.
    expect(bucketOf(absent.months[0]!.buckets, 'TRY').net).toBe(0)
    expect(bucketOf(zero.months[0]!.buckets, 'TRY').net).toBe(0)
  })
})

describe('a retired category cannot go on contributing', () => {
  it('ignores entries whose category is not in this workspace', () => {
    const rent = category('KİRA', 'expense', 0)
    const stale = entry(9_999, 4, 500_000)
    const computed = computeWorkspace(workspace([rent], [entry(rent.id, 4, 100_000), stale]))

    expect(computed.months[3]!.cells.size).toBe(1)
    expect(bucketOf(computed.months[3]!.buckets, 'TRY').expense).toBe(100_000)
  })

  it('leaves year N untouched when year N+1 drops a column', () => {
    // The two years hold two distinct category rows, so the 2026 workspace is
    // computed from its own columns alone.
    const y2025 = [category('KİRA', 'expense', 0, 'TRY', 2025), category('SERVİS', 'expense', 1, 'TRY', 2025)]
    const y2026 = [category('KİRA', 'expense', 0, 'TRY', 2026)]

    const before = computeWorkspace(
      workspace(y2025, [entry(y2025[0]!.id, 1, 430_000), entry(y2025[1]!.id, 1, 90_000)], 2025)
    )
    const after = computeWorkspace(workspace(y2026, [entry(y2026[0]!.id, 1, 430_000)], 2026))

    expect(bucketOf(before.months[0]!.buckets, 'TRY').expense).toBe(520_000)
    expect(bucketOf(after.months[0]!.buckets, 'TRY').expense).toBe(430_000)
  })
})

// --- Units never mix -------------------------------------------------------

describe('units never mix', () => {
  it('keeps each value type in its own bucket', () => {
    const salaryTry = category('MAAŞ', 'income', 0, 'TRY')
    const savingsUsd = category('USD BİRİKİM', 'income', 1, 'USD')
    const rentTry = category('KİRA', 'expense', 0, 'TRY')

    const computed = computeWorkspace(
      workspace(
        [salaryTry, savingsUsd, rentTry],
        [
          entry(salaryTry.id, 1, 100_000),
          entry(savingsUsd.id, 1, 20_000),
          entry(rentTry.id, 1, 30_000)
        ]
      )
    )

    expect(computed.valueTypesInUse).toEqual(['TRY', 'USD'])
    const january = computed.months[0]!.buckets
    expect(bucketOf(january, 'TRY').net).toBe(70_000)
    expect(bucketOf(january, 'USD').net).toBe(20_000)
  })

  it('orders buckets canonically, not by order of appearance', () => {
    const usd = category('USD', 'income', 0, 'USD')
    const plain = category('GÜN', 'income', 1, 'plain')
    const türk = category('MAAŞ', 'income', 2, 'TRY')
    const computed = computeWorkspace(workspace([usd, plain, türk], []))

    // A new column must never shift the totals a reader already knows.
    expect(computed.valueTypesInUse).toEqual(['TRY', 'USD', 'plain'])
  })

  it('degenerates to a single bucket for an all-lira year', () => {
    const computed = computeWorkspace(buildJulyRow())
    expect(computed.valueTypesInUse).toEqual(['TRY'])
    expect(computed.yearBuckets).toHaveLength(1)
  })
})

// --- Column and selection totals -------------------------------------------

describe('column totals and the filtered selection', () => {
  it('totals a column across the year, net of its own refunds', () => {
    const power = category('ELEKTRİK', 'expense', 0)
    const computed = computeWorkspace(
      workspace(
        [power],
        [entry(power.id, 1, 30_000), entry(power.id, 2, 40_000), entry(power.id, 3, 10_000, true)]
      )
    )
    expect(computed.categoryTotals.get(power.id)).toBe(60_000)
  })

  it('sums only the months a filter left visible, without touching the year', () => {
    const salary = category('MAAŞ', 'income', 0)
    const computed = computeWorkspace(
      workspace(
        [salary],
        [entry(salary.id, 1, 100_000), entry(salary.id, 2, 200_000), entry(salary.id, 3, 300_000)]
      )
    )

    const visible = computed.months.filter((m) => m.month === 1 || m.month === 3)
    const selection = sumMonths(visible, computed.valueTypesInUse)

    expect(bucketOf(selection, 'TRY').income).toBe(400_000)
    expect(categoryTotalOver(visible, salary.id)).toBe(400_000)

    // The year's own figure is unmoved by what the view is hiding.
    expect(bucketOf(computed.yearBuckets, 'TRY').income).toBe(600_000)
  })
})

describe('display order', () => {
  it('puts the income group first, each group by position', () => {
    const a = category('B GELİR', 'income', 1)
    const b = category('A GELİR', 'income', 0)
    const c = category('GİDER', 'expense', 0)
    expect(orderedCategories([c, a, b]).map((x) => x.name)).toEqual([
      'A GELİR',
      'B GELİR',
      'GİDER'
    ])
  })
})
