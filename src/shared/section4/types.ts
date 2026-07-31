/**
 * Section 4 — Calculation Zone. The shapes both sides of the bridge agree on.
 *
 * §9 calls this section "deliberately unfancy", and after the owner's first day
 * with the application it is less fancy still. A month can carry a hundred and
 * twenty figures, and the *etiket* the old design demanded before each one made
 * the section unusable for the only thing it exists to do — so there are no
 * labels at all now, only a fixed grid of boxes that either hold a figure or do
 * not (§9, amended 31 July 2026).
 *
 * The rejected alternative was an optional label: a field that could be left
 * blank costs nothing to skip, and it would have kept the capability for whoever
 * wanted it. It is not here because an optional field is still a field — it
 * still takes a Tab to pass, still takes a column of width, and still asks the
 * question. The owner's finding was that being asked was the defect.
 *
 * A value is **integer hundredths**, the convention `plain`-typed Section 1
 * columns already use (`shared/money.ts`): the scratchpad is not money, but it is
 * stored in the same hundredths so that one more part of the app never needs a
 * second storage convention. Only its presentation differs — no currency symbol,
 * because a number in a scratchpad is a number.
 */

/**
 * One box carrying a figure.
 *
 * There is no null here and no row for a box that has never been typed in: the
 * table is sparse (`main/vault/db/schema.ts`, v4), so absence is the missing row
 * rather than a stored nothing. A box holding zero *does* have a row, and zero
 * is a real figure — it joins the count, the total and the average like any
 * other. That is the same distinction the old nullable column drew between a
 * heading and a figure, kept without a nullable column to draw it with.
 */
export interface Cell {
  /** Which box, counting from zero, left to right and then down. */
  slot: number
  /** Integer hundredths. Never negative (§5.2), never null. */
  value: number
}

/**
 * A write to one box.
 *
 * An explicit null empties the box, which removes its row rather than storing a
 * zero. "Nothing here" and "nothing came in" are different answers and the
 * statistics above the grid tell them apart, so the write has to as well.
 */
export interface CellPatch {
  slot: number
  value: number | null
}

/**
 * The grid is ten boxes wide.
 *
 * Ten because the owner asked for ten, and because a decimal width is countable
 * without counting: the box under the caret sits in a column whose position is
 * the last digit of its own number. It is a constant rather than a setting — a
 * scratchpad whose shape can be configured is the spreadsheet this application
 * replaces, wearing a preferences pane.
 */
export const COLUMNS = 10

/**
 * Rows the grid shows before anything at all is typed.
 *
 * A hundred boxes, which is the shape the owner described and enough for the
 * month they described it about. Fewer would mean the section grew during the
 * first thing anyone ever did with it.
 */
export const MIN_ROWS = 10

/**
 * The ceiling: a thousand boxes.
 *
 * The grid grows a row at a time and has to stop somewhere, and it stops well
 * past anything §9 is for — eight times the hundred and twenty figures the
 * owner's heaviest month carries. The storage layer refuses a slot at or above
 * `COLUMNS * MAX_ROWS`, so the ceiling is enforced behind the bridge rather than
 * by the grid that draws it.
 */
export const MAX_ROWS = 100

/** Coarse failure reasons for Section 4, in the style of `VaultErrorCode`. */
export type Section4ErrorCode = 'LOCKED' | 'INVALID_SLOT' | 'INVALID_VALUE' | 'INTERNAL'
