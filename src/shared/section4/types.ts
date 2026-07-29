/**
 * Section 4 — Calculation Zone. The shapes both sides of the bridge agree on.
 *
 * §9 calls this section "deliberately unfancy", and the type below is the whole
 * of it: a label, a value, and a position. The source workbook only ever sketched
 * this section in placeholder text; there is nothing here being replaced, only
 * something being built for the first time.
 *
 * A value is **integer hundredths**, the convention `plain`-typed Section 1
 * columns already use (`shared/money.ts`): the scratchpad is not money, but it is
 * stored in the same hundredths so that one more part of the app never needs a
 * second storage convention. Only its presentation differs — no currency symbol,
 * because a number in a scratchpad is a number.
 */

/**
 * One line.
 *
 * `value` is null for a line that has a label and nothing else yet. That is not a
 * zero: a heading typed above three figures must not join their average, and the
 * emptiness has to survive being stored (§6.3, kept).
 */
export interface Line {
  id: number
  label: string
  /** Integer hundredths, or null for a line with no figure on it. */
  value: number | null
  position: number
}

/** A new line. Position is the vault's to assign. */
export interface LineDraft {
  label: string
  value: number | null
}

/**
 * An edit to one line.
 *
 * Absent means "leave alone"; an explicit null on `value` clears the figure and
 * leaves the label. `label` is never null — a line with no label is an empty
 * string, which is a real state while one is being typed.
 */
export interface LinePatch {
  id: number
  label?: string
  value?: number | null
}

/** Coarse failure reasons for Section 4, in the style of `VaultErrorCode`. */
export type Section4ErrorCode =
  | 'LOCKED'
  | 'NO_SUCH_LINE'
  | 'INVALID_LABEL'
  | 'INVALID_VALUE'
  | 'INTERNAL'

/** A label has to fit on one line beside its figure. */
export const MAX_LABEL_LENGTH = 96
