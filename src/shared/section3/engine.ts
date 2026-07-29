/**
 * The Section 3 arithmetic — written once, tested, and never re-typed per cell.
 *
 * Two documents were being kept by hand where this module now stands, and they
 * disagreed. A workbook ledger said one thing about how much gold existed; a
 * slide deck's charts said another, running a purchase behind, with quantities
 * divided by a thousand so a linear axis would not crush them. Between the two
 * of them a car went missing. Nothing here is maintained: holdings, cost, market
 * value and gain are all derived from the ledger on every read, and there is no
 * second place for them to be derived differently.
 *
 * Five rules govern everything below.
 *
 * 1. **Integers only.** Quantities are milligrams, coins or cents; money is
 *    kuruş. `units.ts` owns the one division between them.
 *
 * 2. **The stored number is never signed.** `direction` decides whether a row
 *    adds to a holding or comes off it, applied in exactly one function. Mirror
 *    of `section2/engine.ts:signedDebt` and `section1/engine.ts:signedContribution`,
 *    for the same reason: a rule about the owner's money written down twice is a
 *    rule that will be changed once.
 *
 * 3. **Cost basis is the cost of what is still held, oldest lot first.** A
 *    disposal consumes the earliest acquisitions of that person and type, and
 *    cost basis is what remains unconsumed. See `computeHoldings` for why this
 *    reading and not the alternatives.
 *
 * 4. **A disposal never edits history.** No lot state is stored anywhere. Lots
 *    are rebuilt from the ledger on every call, so an acquisition row means the
 *    same thing forever and there is nothing that can fall out of step with it.
 *
 * 5. **The two axes must agree.** A holding can be totalled by adding signed
 *    quantities, or by measuring what the lots have left. The unit suite asserts
 *    the two are equal; where they cannot be, the holding is flagged rather than
 *    quietly corrected, because the only way they disagree is that the ledger
 *    disposes of something it never recorded acquiring — which is exactly the
 *    gap the two source documents hid between them.
 */

import { transactionValue } from './units.js'
import type {
  LedgerData,
  Person,
  QuantityUnit,
  Transaction,
  TypeCode,
  ValuableType
} from './types.js'

/**
 * What one row contributes to the holding it touches.
 *
 * Stored positive with a direction on the row (§8.3) and inverted exactly here —
 * the one place in the app that knows what `dispose` means.
 */
export function signedQuantity(
  transaction: Pick<Transaction, 'direction' | 'quantity'>
): number {
  return transaction.direction === 'dispose' ? -transaction.quantity : transaction.quantity
}

/**
 * The ledger in the order events happened.
 *
 * By date, then by `seq` for two rows on one day. `seq` is the tie-break rather
 * than an ordering of its own because rows are typed in the order the owner
 * remembers them, not the order they occurred — the historical run of §18.5 goes
 * in oldest-first, but a forgotten purchase added later must still land in its
 * own place in the sequence rather than at the end of it.
 *
 * Dates are ISO-8601, so a string comparison *is* a chronological one. That is
 * the whole reason §5.2 stores them that way.
 */
export function orderedTransactions(
  transactions: readonly Transaction[]
): readonly Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.seq - b.seq
  })
}

// --- 3a, the ledger ---------------------------------------------------------

/** One drawn row of the ledger (§8.3). */
export interface LedgerRow {
  transaction: Transaction
  type: ValuableType
  /** Resolved, never null: a row with no person belongs to Ortak (§8.1). */
  person: Person
  /** Quantity × unit price ÷ scale — the row's own **Transaction Total**. */
  total: number
  /**
   * The **Total Quantity** column of §8.3: how much of *this type* was held
   * after this row, across every person.
   *
   * Per type rather than overall, because adding milligrams to coins produces a
   * number that describes nothing. Running rather than final, because that is
   * what makes the car legible — a cliff in the column at the row that sold it,
   * instead of a total that simply disagrees with a chart in another file.
   */
  runningQuantity: number
}

/**
 * Totals for the ledger's bottom row (§8.3).
 *
 * Quantities are kept per type and never added across types. Values are in
 * kuruş and may be added freely, because every price in the ledger is quoted in
 * lira regardless of what it bought.
 */
export interface LedgerTotals {
  rowCount: number
  /** Σ of the acquisition rows' totals — what was paid, over the whole ledger. */
  acquiredValue: number
  /** Σ of the disposal rows' totals — what they fetched. */
  disposedValue: number
  /** Net quantity per type, in that type's own unit. */
  quantityByType: ReadonlyMap<TypeCode, number>
  /** How many rows still carry `dateProvisional` (§18.3, item 6). */
  provisionalCount: number
}

export interface LedgerView {
  rows: readonly LedgerRow[]
  totals: LedgerTotals
}

/**
 * Resolve the person a row belongs to.
 *
 * A null or unrecognised `personId` reads as Ortak rather than as an error:
 * §8.1 makes Ortak the home for rows whose ownership is not yet known, and a
 * ledger row is never worth less than the person attached to it.
 */
function resolvePerson(
  personId: number | null,
  byId: ReadonlyMap<number, Person>,
  fallback: Person
): Person {
  if (personId === null) return fallback
  return byId.get(personId) ?? fallback
}

/**
 * The person every unattributed row falls back to.
 *
 * The seeded built-in, or failing that the first person in the vault — a vault
 * with no persons at all cannot have transactions, since every row is written
 * with one.
 */
function fallbackPerson(persons: readonly Person[]): Person | null {
  return persons.find((person) => person.isBuiltin) ?? persons[0] ?? null
}

export function computeLedger(data: LedgerData): LedgerView {
  const typesByCode = new Map<TypeCode, ValuableType>()
  for (const type of data.types) typesByCode.set(type.code, type)

  const personsById = new Map<number, Person>()
  for (const person of data.persons) personsById.set(person.id, person)

  const fallback = fallbackPerson(data.persons)

  const running = new Map<TypeCode, number>()
  const rows: LedgerRow[] = []

  let acquiredValue = 0
  let disposedValue = 0
  let provisionalCount = 0

  for (const transaction of orderedTransactions(data.transactions)) {
    const type = typesByCode.get(transaction.typeCode)
    // A row naming a type the vault does not have is not drawn and not totalled.
    // The closed list (§8.2) is seeded, so this is unreachable by construction —
    // and silently counting such a row would be worse than not drawing it.
    if (!type || !fallback) continue

    const total = transactionValue(transaction.quantity, transaction.unitPrice, type.unit)
    const next = (running.get(type.code) ?? 0) + signedQuantity(transaction)
    running.set(type.code, next)

    if (transaction.direction === 'dispose') disposedValue += total
    else acquiredValue += total

    if (transaction.dateProvisional) provisionalCount += 1

    rows.push({
      transaction,
      type,
      person: resolvePerson(transaction.personId, personsById, fallback),
      total,
      runningQuantity: next
    })
  }

  return {
    rows,
    totals: {
      rowCount: rows.length,
      acquiredValue,
      disposedValue,
      quantityByType: running,
      provisionalCount
    }
  }
}

// --- 3b, holdings, and §8.6's two bases -------------------------------------

/** One acquisition, with however much of it has not yet been disposed of. */
interface Lot {
  remaining: number
  unitPrice: number
}

/**
 * One person's position in one type — the cell of §8.4's grid.
 *
 * Computed, never stored, which is why it lives here beside the engine rather
 * than in `types.ts` with the shapes the vault holds.
 */
export interface Holding {
  personId: number
  typeCode: TypeCode
  unit: QuantityUnit
  /**
   * Σ signed quantities — the first axis, and the honest one. Negative when the
   * ledger disposes of more than it records acquiring.
   */
  quantity: number
  /** What the lots have left — the second axis. Never negative. */
  lotQuantity: number
  /** Cost of the unconsumed lots (§8.6's cost basis). */
  costBasis: number
  /** Quantity at the current manual price, or null if none has been typed. */
  marketValue: number | null
  /** `marketValue − costBasis`, null for the same reason. */
  unrealised: number | null
  /** The two axes disagree. See `HoldingsView.discrepancies`. */
  oversold: boolean
}

/** Per-person subtotals of §8.4, and §8.6's comparison at person scope. */
export interface PersonHoldings {
  person: Person
  /** Only types this person currently has a position in, empty ones omitted. */
  holdings: readonly Holding[]
  costBasis: number
  /** Cost of the priced holdings alone, so `unrealised` is a like-for-like. */
  pricedCostBasis: number
  marketValue: number
  unrealised: number
}

export interface HoldingsView {
  byPerson: readonly PersonHoldings[]
  costBasis: number
  pricedCostBasis: number
  marketValue: number
  /** `marketValue − pricedCostBasis` (§8.6). */
  unrealised: number
  /** Types held for which the owner has typed no price yet (§8.5). */
  missingPrices: readonly TypeCode[]
  /**
   * Holdings whose two axes disagree — more disposed than ever acquired.
   *
   * Surfaced rather than clamped. During the typing sessions of §18.5 this is
   * the expected state of gold until the acquisitions preceding a disposal have
   * all been entered, and it is the indicator that says so.
   */
  discrepancies: readonly Holding[]
}

/**
 * Holdings, cost basis, market value and unrealised gain — §8.4 and §8.6.
 *
 * **Why oldest-lot-first.** The alternative readings were weighed against the
 * figures REALISATION.md asks this section to reproduce. A running weighted
 * average over a history whose prices climbed from ₺1.000/g to ₺6.505/g values
 * the surviving 30 g at roughly a third of the acceptance figure, because it
 * blends four years of cheap gold into a holding bought this year. Treating cost
 * basis as the lifetime acquisition total is worse still: it compares what was
 * paid for 1,1 kg against the market value of 30 g and reports a catastrophic
 * loss where a car was in fact bought.
 *
 * Consuming the earliest lots first reproduces the figure, and it is also what
 * happened: the cheap old gold was what left. So cost basis is the cost of the
 * lots that remain, and it answers a question the owner can check — *what did
 * the gold I still have cost me*.
 *
 * Each residual lot is valued with the same `transactionValue` that drew its own
 * row's total, so a holding's cost basis and the ledger rows behind it round
 * identically. Cost basis that disagreed with the visible sum of its own rows
 * would be the workbook's defect wearing a new hat.
 */
export function computeHoldings(data: LedgerData): HoldingsView {
  const typesByCode = new Map<TypeCode, ValuableType>()
  for (const type of data.types) typesByCode.set(type.code, type)

  const priceByCode = new Map<TypeCode, number>()
  for (const price of data.manualPrices) priceByCode.set(price.typeCode, price.value)

  const personsById = new Map<number, Person>()
  for (const person of data.persons) personsById.set(person.id, person)

  const fallback = fallbackPerson(data.persons)
  if (!fallback) {
    return {
      byPerson: [],
      costBasis: 0,
      pricedCostBasis: 0,
      marketValue: 0,
      unrealised: 0,
      missingPrices: [],
      discrepancies: []
    }
  }

  /** Signed sum — the first axis. Keyed person → type. */
  const signed = new Map<number, Map<TypeCode, number>>()
  /** FIFO lots — the second axis, and the source of cost basis. */
  const lots = new Map<number, Map<TypeCode, Lot[]>>()

  const bucket = <T>(outer: Map<number, Map<TypeCode, T>>, personId: number): Map<TypeCode, T> => {
    let inner = outer.get(personId)
    if (!inner) {
      inner = new Map<TypeCode, T>()
      outer.set(personId, inner)
    }
    return inner
  }

  for (const transaction of orderedTransactions(data.transactions)) {
    const type = typesByCode.get(transaction.typeCode)
    if (!type) continue

    const person = resolvePerson(transaction.personId, personsById, fallback)

    const signedRow = bucket(signed, person.id)
    signedRow.set(
      type.code,
      (signedRow.get(type.code) ?? 0) + signedQuantity(transaction)
    )

    const lotRow = bucket<Lot[]>(lots, person.id)
    const queue = lotRow.get(type.code) ?? []
    if (!lotRow.has(type.code)) lotRow.set(type.code, queue)

    if (transaction.direction === 'acquire') {
      queue.push({ remaining: transaction.quantity, unitPrice: transaction.unitPrice })
      continue
    }

    // Oldest first. A disposal larger than everything acquired empties the queue
    // and leaves the surplus unbacked — recorded by the axes disagreeing, not by
    // inventing a lot to satisfy it.
    let outstanding = transaction.quantity
    while (outstanding > 0 && queue.length > 0) {
      const lot = queue[0]
      if (!lot) break
      const taken = Math.min(lot.remaining, outstanding)
      lot.remaining -= taken
      outstanding -= taken
      if (lot.remaining === 0) queue.shift()
    }
  }

  const missingPrices = new Set<TypeCode>()
  const discrepancies: Holding[] = []
  const byPerson: PersonHoldings[] = []

  for (const person of [...data.persons].sort(
    (a, b) => a.position - b.position || a.id - b.id
  )) {
    const signedRow = signed.get(person.id)
    const lotRow = lots.get(person.id)
    if (!signedRow && !lotRow) continue

    const holdings: Holding[] = []
    let personCost = 0
    let personPricedCost = 0
    let personMarket = 0

    for (const type of data.types) {
      const quantity = signedRow?.get(type.code) ?? 0
      const queue = lotRow?.get(type.code) ?? []
      const lotQuantity = queue.reduce((sum, lot) => sum + lot.remaining, 0)

      // A type once held and now entirely gone is not a current holding (§8.4);
      // the ledger keeps its history.
      if (quantity === 0 && lotQuantity === 0) continue

      const costBasis = queue.reduce(
        (sum, lot) => sum + transactionValue(lot.remaining, lot.unitPrice, type.unit),
        0
      )

      const price = priceByCode.get(type.code)
      const hasPrice = price !== undefined
      if (!hasPrice) missingPrices.add(type.code)

      // Computed from the signed axis, so a negative holding reads as negative
      // rather than as nothing. A figure that hid the shortfall would leave the
      // owner hunting for a purchase they had no reason to know was missing.
      const marketValue = hasPrice
        ? Math.sign(quantity) * transactionValue(Math.abs(quantity), price, type.unit)
        : null

      const holding: Holding = {
        personId: person.id,
        typeCode: type.code,
        unit: type.unit,
        quantity,
        lotQuantity,
        costBasis,
        marketValue,
        unrealised: marketValue === null ? null : marketValue - costBasis,
        oversold: quantity !== lotQuantity
      }

      if (holding.oversold) discrepancies.push(holding)

      personCost += costBasis
      if (marketValue !== null) {
        personPricedCost += costBasis
        personMarket += marketValue
      }

      holdings.push(holding)
    }

    if (holdings.length === 0) continue

    byPerson.push({
      person,
      holdings,
      costBasis: personCost,
      pricedCostBasis: personPricedCost,
      marketValue: personMarket,
      unrealised: personMarket - personPricedCost
    })
  }

  let costBasis = 0
  let pricedCostBasis = 0
  let marketValue = 0
  for (const entry of byPerson) {
    costBasis += entry.costBasis
    pricedCostBasis += entry.pricedCostBasis
    marketValue += entry.marketValue
  }

  return {
    byPerson,
    costBasis,
    pricedCostBasis,
    marketValue,
    unrealised: marketValue - pricedCostBasis,
    missingPrices: [...missingPrices],
    discrepancies
  }
}
