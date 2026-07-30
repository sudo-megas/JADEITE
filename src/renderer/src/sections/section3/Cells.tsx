/**
 * The editable cells of the ledger.
 *
 * Sections 1 and 2 each own an `AmountCell`, because each renders and refuses in
 * its own terms. Section 3 needs two kinds of cell rather than one — a price is
 * money and a quantity is grams, coins or dollars — so the shared behaviour sits
 * in one internal component here and the two exported ones differ only in how
 * they read and write the text.
 *
 * What they have in common is the part that matters: the app's language decides
 * the separators, a value that cannot be read is **refused rather than guessed
 * at**, and a refusal keeps the cell open with what was typed still in it. A cell
 * that silently discarded a rejected edit would lose a row in the middle of a
 * long typing session, which is precisely the session this section is built for.
 *
 * Nothing here opens a dialogue. §6.4 makes the keyboard path a graded
 * requirement, and a modal on the common path is what that rules out.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { amountToInput, parseAmount, type ParseFailure } from '@shared/money'
import { parseQuantity, quantityToInput, type QuantityFailure } from '@shared/section3/units'
import type { QuantityUnit, TypeCode } from '@shared/section3/types'
import type { AppLanguage } from '../../i18n/format.js'
import { formatCount } from '../../i18n/format.js'
import { formatQuantity, formatTry } from './format.js'

interface CoreProps {
  /** The text shown while the cell is not being edited. */
  display: string
  /** The text put into the field the moment it is focused. */
  editable: string
  label: string
  testId: string
  readOnly: boolean
  /**
   * A width modifier, as `s3-date-cell` is for a date.
   *
   * The ledger is wide and every column it does not need costs the one after it,
   * so a cell holding a count of pieces says so rather than taking the width a
   * lira figure needs.
   */
  cellClass?: string
  /** Returns a translation key for a refusal, or null when it committed. */
  onCommit: (draft: string) => string | null
  onEnter?: () => void
}

/**
 * One text cell that parses on commit.
 *
 * `type="text"` rather than `number`: a grid of spinners is noise, and a number
 * field would also accept the operating system's idea of a decimal separator
 * rather than the app language's (§13).
 */
function TextEntryCell({
  display,
  editable,
  label,
  testId,
  readOnly,
  cellClass,
  onCommit,
  onEnter
}: CoreProps): ReactElement {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(editable)
  }, [editable, editing])

  function commit(): boolean {
    const reason = onCommit(draft)
    if (reason) {
      setProblem(reason)
      return false
    }
    setProblem(null)
    setEditing(false)
    return true
  }

  return (
    <div className={cellClass ? `s3-cell ${cellClass}` : 's3-cell'}>
      <input
        ref={inputRef}
        className="s3-cell-input"
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={problem !== null}
        readOnly={readOnly}
        value={editing ? draft : display}
        data-testid={testId}
        onFocus={() => {
          if (readOnly) return
          setDraft(editable)
          setEditing(true)
          setProblem(null)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          if (problem) setProblem(null)
        }}
        onBlur={() => {
          if (editing) commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (commit() && onEnter) onEnter()
            else if (!onEnter) inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(editable)
            setProblem(null)
            setEditing(false)
            inputRef.current?.blur()
          }
        }}
      />

      {problem ? (
        <p className="s3-cell-problem" role="alert">
          {t(problem)}
        </p>
      ) : null}
    </div>
  )
}

interface MoneyCellProps {
  value: number | null
  language: AppLanguage
  label: string
  testId: string
  readOnly?: boolean
  /** Called with minor units, or null when the cell was cleared. */
  onCommit: (minorUnits: number | null) => void
  onEnter?: () => void
  /** Refuse an empty cell — a price of nothing is a gift, an absent one is not. */
  required?: boolean
}

/** A price, in integer kuruş. */
export function MoneyCell({
  value,
  language,
  label,
  testId,
  readOnly = false,
  onCommit,
  onEnter,
  required = false
}: MoneyCellProps): ReactElement {
  return (
    <TextEntryCell
      display={value === null ? '' : formatTry(value, language)}
      editable={amountToInput(value, language)}
      label={label}
      testId={testId}
      readOnly={readOnly}
      onEnter={onEnter}
      onCommit={(draft) => {
        const parsed = parseAmount(draft, language)
        if (parsed.kind === 'error') return failureKey(parsed.reason)
        if (parsed.kind === 'empty') {
          if (required) return 'section3.parse.REQUIRED'
          if (value !== null) onCommit(null)
          return null
        }
        if (parsed.minorUnits !== value) onCommit(parsed.minorUnits)
        return null
      }}
    />
  )
}

interface QuantityCellProps {
  value: number | null
  typeCode: TypeCode
  unit: QuantityUnit
  language: AppLanguage
  label: string
  testId: string
  readOnly?: boolean
  cellClass?: string
  onCommit: (quantity: number) => void
  onEnter?: () => void
}

/** A quantity, in the type's own smallest whole unit. */
export function QuantityCell({
  value,
  typeCode,
  unit,
  language,
  label,
  testId,
  readOnly = false,
  cellClass,
  onCommit,
  onEnter
}: QuantityCellProps): ReactElement {
  return (
    <TextEntryCell
      display={value === null ? '' : formatQuantity(value, typeCode, unit, language)}
      editable={quantityToInput(value, unit, language)}
      label={label}
      testId={testId}
      readOnly={readOnly}
      cellClass={cellClass}
      onEnter={onEnter}
      onCommit={(draft) => {
        const parsed = parseQuantity(draft, unit, language)
        // A quantity is never optional: `s3_transactions` requires one, and a
        // row where nothing moved is not a transaction.
        if (parsed.kind === 'empty') return 'section3.parse.REQUIRED'
        if (parsed.kind === 'error') return failureKey(parsed.reason)
        if (parsed.scaled !== value) onCommit(parsed.scaled)
        return null
      }}
    />
  )
}

interface CountCellProps {
  value: number
  language: AppLanguage
  label: string
  testId: string
  readOnly?: boolean
  onCommit: (count: number) => void
  onEnter?: () => void
}

/**
 * How many pieces of this denomination — the **Count** column of §8.3.
 *
 * A bare whole number, and deliberately parsed by `parseQuantity` with the
 * `piece` unit rather than by a rule of its own: `piece` already means scale 1
 * and zero decimal places, which is exactly what a count is. Half a bar is a
 * denomination question, never a count one, so refusing the decimal point here
 * costs nothing and one parser keeps the two columns' failures identical.
 *
 * Never null. A row records at least one of something, which the `piece_count > 0`
 * CHECK also says.
 */
export function CountCell({
  value,
  language,
  label,
  testId,
  readOnly = false,
  onCommit,
  onEnter
}: CountCellProps): ReactElement {
  return (
    <TextEntryCell
      display={formatCount(value, language)}
      editable={quantityToInput(value, 'piece', language)}
      label={label}
      testId={testId}
      readOnly={readOnly}
      cellClass="s3-count-cell"
      onEnter={onEnter}
      onCommit={(draft) => {
        const parsed = parseQuantity(draft, 'piece', language)
        if (parsed.kind === 'empty') return 'section3.parse.REQUIRED'
        if (parsed.kind === 'error') return failureKey(parsed.reason)
        if (parsed.scaled !== value) onCommit(parsed.scaled)
        return null
      }}
    />
  )
}

function failureKey(reason: ParseFailure | QuantityFailure): string {
  return `section3.parse.${reason}`
}
