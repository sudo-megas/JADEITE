/**
 * The three Altın Eğrisi series, and the two defects they exist to retire.
 *
 * The deck this replaces drifted — one chart ran a purchase behind the other — and
 * it falsified data so a linear axis would not crush it. Both are properties of
 * the *derivation*, so both are tested here rather than left to the eye:
 *
 *   - drift: every series comes from one pass over one ledger, so adding a row
 *     moves all of them or none;
 *   - falsification: a 300 beside a run of 10s arrives as 300, and the ratio that
 *     made the linear axis useless is reported rather than worked around.
 */

import { describe, expect, it } from 'vitest'

import { buildSeries, spansOrdersOfMagnitude } from '@shared/altin/series'
import type {
  LedgerData,
  ManualPrice,
  Person,
  Transaction,
  TypeCode,
  ValuableType
} from '@shared/section3/types'

const ORTAK: Person = { id: 1, name: 'Ortak', colour: null, isBuiltin: true, position: 0 }
const KISI_A: Person = { id: 2, name: 'Kişi A', colour: null, isBuiltin: false, position: 1 }
const KISI_B: Person = { id: 3, name: 'Kişi B', colour: null, isBuiltin: false, position: 2 }

const TYPES: ValuableType[] = [
  { code: 'gram', unit: 'mg', position: 1 },
  { code: 'ceyrek', unit: 'piece', position: 2 },
  { code: 'gumus', unit: 'mg', position: 9 }
]

let nextSeq = 1

function row(
  date: string,
  person: Person | null,
  typeCode: TypeCode,
  direction: 'acquire' | 'dispose',
  quantity: number,
  unitPrice: number,
  provisional = false
): Transaction {
  return {
    seq: nextSeq++,
    date,
    dateProvisional: provisional,
    typeCode,
    direction,
    quantity,
    unitPrice,
    source: null,
    personId: person?.id ?? null,
    note: null
  }
}

function ledger(transactions: Transaction[], manualPrices: ManualPrice[] = []): LedgerData {
  return {
    persons: [ORTAK, KISI_A, KISI_B],
    types: TYPES,
    transactions,
    manualPrices,
    livePrices: []
  }
}

describe('Spektrum — the price line (§11.1)', () => {
  it('takes one point per priced row, in date order', () => {
    const series = buildSeries(
      ledger([
        row('2026-03-10', KISI_A, 'gram', 'acquire', 10_000, 700_000),
        row('2022-08-04', KISI_A, 'gram', 'acquire', 10_000, 100_000),
        row('2026-05-18', KISI_A, 'gram', 'acquire', 10_000, 650_500)
      ])
    )

    expect(series.spektrum.map((p) => p.date)).toEqual([
      '2022-08-04',
      '2026-03-10',
      '2026-05-18'
    ])
    // ₺1.000/g → ₺6.505/g, the real span of the owner's own price history.
    expect(series.spektrum.map((p) => p.price)).toEqual([100_000, 700_000, 650_500])
  })

  it('carries the quantity too, so a hover can say what was bought', () => {
    const series = buildSeries(ledger([row('2026-01-15', KISI_A, 'gram', 'acquire', 300_000, 186_500)]))
    expect(series.spektrum[0]?.quantity).toBe(300_000)
  })

  /** Zero is a gift rather than a quotation, and is not a point on a log axis. */
  it('leaves a price of zero out of the line but not out of the events', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 0),
        row('2026-02-20', KISI_A, 'gram', 'acquire', 10_000, 590_000)
      ])
    )

    expect(series.spektrum).toHaveLength(1)
    expect(series.frekans).toHaveLength(2)
  })

  it('includes a disposal’s price — it is what the day was worth', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 30_000, 500_000),
        row('2026-06-01', KISI_A, 'gram', 'dispose', 30_000, 660_000)
      ])
    )
    expect(series.spektrum.map((p) => p.price)).toEqual([500_000, 660_000])
  })
})

describe('Frekans — the quantity columns (§11.2)', () => {
  it('counts acquisitions and not disposals', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
        row('2026-02-20', KISI_A, 'gram', 'dispose', 10_000, 650_000),
        row('2026-03-10', KISI_A, 'gram', 'acquire', 20_000, 590_000)
      ])
    )

    expect(series.frekans.map((p) => p.quantity)).toEqual([10_000, 20_000])
  })

  /**
   * The falsification this replaces: 300 g and 400 g were typed as 0.300 and
   * 0.400 so a linear axis would not crush the smaller bars beside them. They
   * arrive here as themselves.
   */
  it('reports 300 as 300, never as a thousandth of itself', () => {
    const series = buildSeries(
      ledger([
        row('2023-10-15', KISI_A, 'gram', 'acquire', 300_000, 186_500),
        row('2024-02-01', KISI_A, 'gram', 'acquire', 400_000, 250_000),
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000)
      ])
    )

    expect(series.frekans.map((p) => p.quantity)).toEqual([300_000, 400_000, 10_000])
  })

  it('keeps each type in its own unit, coins beside grams', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
        row('2026-02-20', KISI_A, 'ceyrek', 'acquire', 4, 420_000)
      ])
    )

    expect(series.frekans).toEqual([
      { date: '2026-01-15', quantity: 10_000, typeCode: 'gram' },
      { date: '2026-02-20', quantity: 4, typeCode: 'ceyrek' }
    ])
  })
})

describe('market value over time (§11.3)', () => {
  it('values the running holdings at the newest price then known', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
        row('2026-02-20', KISI_A, 'gram', 'acquire', 10_000, 600_000)
      ])
    )

    // 10 g at ₺5.000 = ₺50.000; then 20 g at the newer ₺6.000 = ₺120.000.
    expect(series.marketValue).toEqual([
      { date: '2026-01-15', value: 5_000_000 },
      { date: '2026-02-20', value: 12_000_000 }
    ])
  })

  it('falls when a disposal takes the holding down', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 40_000, 600_000),
        row('2026-06-01', KISI_A, 'gram', 'dispose', 30_000, 600_000)
      ])
    )

    expect(series.marketValue.map((p) => p.value)).toEqual([24_000_000, 6_000_000])
  })

  it('collapses two events on one day to the state that day ended in', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 600_000),
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 600_000)
      ])
    )

    expect(series.marketValue).toHaveLength(1)
    expect(series.marketValue[0]?.value).toBe(12_000_000)
  })

  it('adds types together, each at its own price and unit', () => {
    const series = buildSeries(
      ledger([
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 600_000),
        row('2026-02-20', KISI_A, 'ceyrek', 'acquire', 2, 420_000)
      ])
    )

    // ₺60.000 of gold, then ₺8.400 of coins on top of it.
    expect(series.marketValue.map((p) => p.value)).toEqual([6_000_000, 6_840_000])
  })
})

describe('the two charts cannot drift apart', () => {
  /**
   * The deck's own defect: the frequency chart ran one-plus purchases behind the
   * price chart, because each was maintained by hand. Here one row reaches every
   * series or none of them, so the question cannot arise.
   */
  it('moves every series when one row is added', () => {
    const rows = [
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
      row('2026-02-20', KISI_A, 'gram', 'acquire', 10_000, 600_000)
    ]
    const before = buildSeries(ledger(rows))

    const added = [...rows, row('2026-03-10', KISI_A, 'gram', 'acquire', 10_000, 700_000)]
    const after = buildSeries(ledger(added))

    expect(after.spektrum).toHaveLength(before.spektrum.length + 1)
    expect(after.frekans).toHaveLength(before.frekans.length + 1)
    expect(after.marketValue).toHaveLength(before.marketValue.length + 1)
  })

  it('reads an empty ledger as three empty series rather than as an error', () => {
    const series = buildSeries(ledger([]))
    expect(series.spektrum).toEqual([])
    expect(series.frekans).toEqual([])
    expect(series.marketValue).toEqual([])
    expect(series.typesPresent).toEqual([])
  })
})

describe('filters', () => {
  it('narrows to one type without touching the others’ units', () => {
    const data = ledger([
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
      row('2026-02-20', KISI_A, 'ceyrek', 'acquire', 4, 420_000)
    ])

    const series = buildSeries(data, { types: ['ceyrek'] })
    expect(series.frekans).toHaveLength(1)
    expect(series.frekans[0]?.quantity).toBe(4)
    expect(series.typesPresent).toEqual(['ceyrek'])
  })

  it('narrows to one person', () => {
    const data = ledger([
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
      row('2026-02-20', KISI_B, 'gram', 'acquire', 20_000, 600_000)
    ])

    const series = buildSeries(data, { personIds: [KISI_B.id] })
    expect(series.frekans.map((p) => p.quantity)).toEqual([20_000])
  })

  it('treats an empty filter as everything, not as nothing', () => {
    const data = ledger([
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
      row('2026-02-20', KISI_B, 'gram', 'acquire', 20_000, 600_000)
    ])

    expect(buildSeries(data, { types: [], personIds: [] }).frekans).toHaveLength(2)
    expect(buildSeries(data).frekans).toHaveLength(2)
  })
})

describe('a provisional date is reported, so the chart can mark it', () => {
  it('names the dates still awaiting a check', () => {
    const series = buildSeries(
      ledger([
        row('2023-10-15', KISI_A, 'gram', 'acquire', 300_000, 186_500, true),
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000)
      ])
    )
    expect(series.provisionalDates).toEqual(['2023-10-15'])
  })
})

describe('whether a logarithmic axis would help is answered from the data', () => {
  /**
   * §11's acceptance: with a 300 beside 10s the linear view crushes the small
   * bars. That is a ratio, so it is measured rather than eyeballed.
   */
  it('reports a span of orders of magnitude for a 300 among 10s', () => {
    expect(spansOrdersOfMagnitude([300_000, 10_000, 10_000, 10_000])).toBe(true)
  })

  it('reports none for values of a similar size', () => {
    expect(spansOrdersOfMagnitude([10_000, 20_000, 30_000])).toBe(false)
  })

  it('ignores zeros, which have no place on a logarithmic axis', () => {
    expect(spansOrdersOfMagnitude([0, 10_000, 20_000])).toBe(false)
    expect(spansOrdersOfMagnitude([0, 0])).toBe(false)
    expect(spansOrdersOfMagnitude([])).toBe(false)
  })
})
