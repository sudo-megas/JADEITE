/**
 * One editable money cell of the Payments grid.
 *
 * The same component serves a month cell and a credit limit, because they are
 * the same act: type a number, have it parsed by the app's language rather than
 * the machine's, and be refused rather than guessed at. What differs is what
 * clearing means, and that belongs to the caller — a month with nothing due is
 * an absent row, while a card always has a limit even when it is zero.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { amountToInput, parseAmount, type ParseFailure } from '@shared/money'
import type { AppLanguage } from '../../i18n/format.js'
import { formatTry } from './format.js'

interface Props {
  /** Minor units, or null for a cell with nothing in it. */
  value: number | null
  language: AppLanguage
  /** The accessible name — column and row, for a cell in a wide grid. */
  label: string
  testId: string
  onCommit: (amount: number | null) => void
}

export function AmountCell({
  value,
  language,
  label,
  testId,
  onCommit
}: Props): ReactElement {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<ParseFailure | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // While not editing, the cell shows the formatted value; the moment it is
  // focused it shows the ungrouped, editable one.
  useEffect(() => {
    if (!editing) setDraft(amountToInput(value, language))
  }, [value, language, editing])

  function beginEditing(): void {
    setDraft(amountToInput(value, language))
    setEditing(true)
    setProblem(null)
  }

  function commit(): void {
    const parsed = parseAmount(draft, language)

    if (parsed.kind === 'error') {
      setProblem(parsed.reason)
      return
    }
    setProblem(null)
    setEditing(false)

    if (parsed.kind === 'empty') {
      if (value !== null) onCommit(null)
      return
    }
    if (parsed.minorUnits === value) return
    onCommit(parsed.minorUnits)
  }

  function cancel(): void {
    setDraft(amountToInput(value, language))
    setProblem(null)
    setEditing(false)
  }

  const display = value === null ? '' : formatTry(value, language)

  return (
    <div className="s2-cell">
      <input
        ref={inputRef}
        className="s2-cell-input"
        // A grid of type="number" spinners is noise, and it would also accept
        // the OS's idea of a decimal separator rather than the app language's.
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={problem !== null}
        value={editing ? draft : display}
        data-testid={testId}
        onFocus={beginEditing}
        onChange={(e) => {
          setDraft(e.target.value)
          if (problem) setProblem(null)
        }}
        onBlur={() => {
          // A refusal keeps the cell open rather than discarding what was typed.
          if (editing) commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
            inputRef.current?.blur()
          }
        }}
      />

      {problem ? (
        <p className="s2-cell-problem" role="alert">
          {t(`section2.parse.${problem}`)}
        </p>
      ) : null}
    </div>
  )
}
