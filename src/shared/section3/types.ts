/**
 * Section 3 — Valuables. The shapes both sides of the bridge agree on.
 *
 * Types only, so this module can be imported by the sandboxed renderer, the
 * main process and the tests without dragging any runtime behaviour along.
 *
 * Two things distinguish Section 3 from the two grids that came before it.
 *
 * It is **not year-scoped.** `s3_transactions` has no year column and takes no
 * foreign key to `years`, because a valuables ledger is a lifetime: the purchase
 * that matters most may be four years old, and asking which workspace it belongs
 * to would be asking the owner to file their own history. Sections 1 and 2 are
 * workspaces onto a year; this is one continuous record.
 *
 * And it carries **three different units of quantity** where the other sections
 * carried one kind of money. A gram of gold, a çeyrek coin and a dollar are
 * counted in milligrams, pieces and cents respectively, and each multiplies
 * against its price differently. That arithmetic lives in `units.ts` and nowhere
 * else.
 */

/**
 * The closed list of §8.2 — "only these", the owner's ruling.
 *
 * A union rather than a string, so a typo in a type code is a build failure
 * instead of a row that silently belongs to nothing. There is no
 * user-defined-type path anywhere in the application, by construction.
 */
export type TypeCode =
  | 'gram'
  | 'ceyrek'
  | 'yarim'
  | 'tam'
  | 'iki_bucuk'
  | 'besli'
  | 'usd'
  | 'eur'
  | 'gumus'
  | 'ziynet'

/**
 * How a type's quantity is counted (§5.2).
 *
 *   mg     — weighable, stored as integer milligrams. Gram, gümüş, ziynet.
 *   piece  — countable, stored as whole coins. Çeyrek through beşli.
 *   minor  — foreign currency, stored as integer cents. USD, EUR.
 *
 * The unit decides the scale between a quantity and its unit price, which is
 * why it is data on the type rather than a branch at each call site.
 */
export type QuantityUnit = 'mg' | 'piece' | 'minor'

/**
 * One row of the seeded `valuable_types` table.
 *
 * Read from the vault at runtime rather than hard-coded here, so there is one
 * home for the list (§4.1's "one home per value", applied to a seed). The union
 * above constrains what a code may *be*; the table decides which exist and in
 * what order. `tests/electron/section3-suite.ts` asserts the two agree, in the
 * same spirit as Section 2's engine order and `ORDER BY` having to match.
 */
export interface ValuableType {
  code: TypeCode
  unit: QuantityUnit
  position: number
}

/**
 * Acquisition or disposal (§8.3, **Alış / Elden Çıkarma**).
 *
 * Direction exists because reality demanded it: lifetime purchases and current
 * holdings differed by a car, and that event has to be an honest ledger entry
 * rather than gold quietly vanishing between two documents. Quantities are
 * stored positive either way and the direction carries the sign — the §5.2
 * convention, third section running.
 */
export type Direction = 'acquire' | 'dispose'

/**
 * A person a transaction belongs to (§8.1).
 *
 * **Ortak** is seeded with `isBuiltin`, and is where rows whose ownership the
 * owner cannot recall land for later reassignment. It can be neither renamed nor
 * deleted, because it is also the destination every other person's rows fall
 * back to when that person is removed.
 */
export interface Person {
  id: number
  name: string
  /** A palette-independent colour dot, or null to take the default. */
  colour: string | null
  isBuiltin: boolean
  position: number
}

export interface PersonDraft {
  name: string
  colour: string | null
}

/**
 * What removing a person would touch.
 *
 * Asked for before the offer is made, so the confirmation can say how many rows
 * will move to Ortak rather than asking "are you sure?" about an unspecified
 * quantity of the owner's own history. Nothing is deleted — see
 * `deletePerson` in `main/vault/db/section3.ts`.
 */
export interface PersonUsage {
  transactionCount: number
  isBuiltin: boolean
}

/**
 * One ledger row (§8.3).
 *
 * `seq` is the **No** column: `INTEGER PRIMARY KEY AUTOINCREMENT`, so the
 * source workbook's hand-typed duplicates 14, 14, 17, 17 are structurally
 * impossible. It is never renumbered, so deleting a row leaves a gap — a gap is
 * honest, whereas renumbering would make a row's identity mutable.
 *
 * `quantity` is in the type's own unit and always positive. `unitPrice` is
 * integer kuruş per *major* unit — per gram, per coin, per dollar — never per
 * milligram or per cent, because that is the number the owner is quoted and
 * types. `units.ts` reconciles the two scales.
 *
 * A disposal carries a `unitPrice` too: what it fetched. That price never
 * touches cost basis (which comes from the acquisitions the disposal consumes),
 * but it is what the row was worth on the day, and discarding it would throw
 * away the only record of what the car was sold for.
 */
export interface Transaction {
  seq: number
  /** ISO-8601, `YYYY-MM-DD`. */
  date: string
  /** Set for a hand-entered historical row whose date is still under review. */
  dateProvisional: boolean
  typeCode: TypeCode
  direction: Direction
  quantity: number
  unitPrice: number
  /** "Obtained where / gone where" (§8.3). */
  source: string | null
  /** Null is read as Ortak; the storage layer never leaves it null on write. */
  personId: number | null
  note: string | null
}

/** A new ledger row. `seq` is the vault's to assign, never the caller's. */
export type TransactionDraft = Omit<Transaction, 'seq'>

/**
 * An edit to one row.
 *
 * Every field is optional but `seq`, so the append row can commit a whole row
 * and a single-cell correction can send one field. Absent means "leave alone";
 * an explicit `null` on a nullable field means "clear it".
 */
export interface TransactionPatch extends Partial<TransactionDraft> {
  seq: number
}

/**
 * The owner's own current price for a type (§8.5) — the authority.
 *
 * Integer kuruş per major unit, on the same footing as a ledger row's
 * `unitPrice`, so a price typed here and a price typed there cannot disagree
 * about what they measure.
 */
export interface ManualPrice {
  typeCode: TypeCode
  value: number
  /** ISO-8601 timestamp, so the owner can see how stale their own figure is. */
  updatedAt: string
}

/**
 * A timestamped snapshot from the live provider (§14), shown *beside* the manual
 * value and never over it.
 *
 * Nothing writes this table until Realisation VII. It is read from here so that
 * 3c's live column exists, renders empty, and needs no new shape later.
 */
export interface LivePrice {
  typeCode: TypeCode
  value: number
  fetchedAt: string
}

/**
 * Everything Section 3 needs to render itself, read in one crossing.
 *
 * One call rather than five, because holdings are derived from the ledger and
 * the prices together: fetching them separately would let the screen show a
 * holding computed from one read and a market value computed from another.
 */
export interface LedgerData {
  persons: readonly Person[]
  types: readonly ValuableType[]
  transactions: readonly Transaction[]
  manualPrices: readonly ManualPrice[]
  /** Latest snapshot per type. Empty until Realisation VII. */
  livePrices: readonly LivePrice[]
}

/** Coarse failure reasons for Section 3, in the style of `VaultErrorCode`. */
export type Section3ErrorCode =
  | 'LOCKED'
  | 'NO_SUCH_TRANSACTION'
  | 'NO_SUCH_PERSON'
  | 'NO_SUCH_TYPE'
  /** Ortak is load-bearing: it cannot be renamed or removed. */
  | 'BUILTIN_PERSON'
  | 'DUPLICATE_NAME'
  | 'INVALID_NAME'
  | 'INVALID_DATE'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'INTERNAL'

/** A person's name has to fit beside a colour dot in a narrow column. */
export const MAX_PERSON_NAME_LENGTH = 48

/** "Obtained where / gone where" — a shop name, not an essay. */
export const MAX_SOURCE_LENGTH = 96

export const MAX_NOTE_LENGTH = 280

/**
 * The earliest date a ledger row may carry.
 *
 * Not a guess at the owner's history but a floor against a typo: a four-digit
 * year mistyped as 1022 should be refused at the cell rather than pushed onto a
 * date axis that then spans a millennium. `MAX_YEAR` comes from the shared
 * calendar, so Sections 1–3 agree on what a plausible year is.
 */
export { MAX_YEAR, MIN_YEAR } from '../calendar.js'
