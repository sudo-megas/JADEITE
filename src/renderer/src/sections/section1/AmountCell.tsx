/**
 * One cell of the year grid.
 *
 * The cell is an input, not a button that opens an editor: this grid is the
 * heart of daily use and typing into it should cost one keystroke. What that
 * buys in speed it pays back in care about commits — a value is written only
 * when it parses, and a refusal says which rule it broke rather than silently
 * keeping the old number.
 *
 * The refund flag and the note live behind a small affordance on the cell,
 * because they are rare and the amount is not.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Entry, ValueType } from '@shared/section1/types'
import { amountToInput, parseAmount, type ParseFailure } from '@shared/money'
import type { AppLanguage } from '../../i18n/format.js'
import { formatByType } from './format.js'

interface Props {
  entry: Entry | undefined
  valueType: ValueType
  language: AppLanguage
  /** Column name and month, for the accessible name of a cell in a wide grid. */
  columnName: string
  monthName: string
  onCommit: (amount: number | null, isRefund: boolean, note: string | null) => void
}

export function AmountCell({
  entry,
  valueType,
  language,
  columnName,
  monthName,
  onCommit
}: Props): ReactElement {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<ParseFailure | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const stored = entry ? entry.amount : null
  const isRefund = entry?.isRefund ?? false
  const note = entry?.note ?? null

  // While not editing, the cell shows the formatted value; the moment it is
  // focused it shows the ungrouped, editable one.
  useEffect(() => {
    if (!editing) setDraft(amountToInput(stored, language))
  }, [stored, language, editing])

  function beginEditing(): void {
    setDraft(amountToInput(stored, language))
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
      // Empty is empty (§6.3): the row goes, and its note and flag with it.
      if (stored !== null) onCommit(null, false, null)
      return
    }
    if (parsed.minorUnits === stored) return
    onCommit(parsed.minorUnits, isRefund, note)
  }

  function cancel(): void {
    setDraft(amountToInput(stored, language))
    setProblem(null)
    setEditing(false)
  }

  const display = stored === null ? '' : formatByType(stored, valueType, language)
  const label = `${monthName} · ${columnName}`

  return (
    <div className="s1-cell" data-refund={isRefund ? 'true' : undefined}>
      <input
        ref={inputRef}
        className="s1-cell-input"
        // A grid of type="number" spinners is noise, and it would also accept
        // the OS's idea of a decimal separator rather than the app language's.
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={problem !== null}
        value={editing ? draft : display}
        data-testid={`cell-${columnName}-${monthName}`}
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
          // Clearing needs no special key: emptying the text and committing
          // deletes the row, which is what "empty is empty" means here.
        }}
      />

      <button
        type="button"
        className="s1-cell-mark"
        aria-label={t('section1.cellDetails', { cell: label })}
        aria-expanded={detailsOpen}
        data-testid={`cell-details-${columnName}-${monthName}`}
        data-marked={isRefund || note ? 'true' : undefined}
        onClick={() => setDetailsOpen((open) => !open)}
      >
        {isRefund ? '↩' : note ? '·' : '⋯'}
      </button>

      {problem ? (
        <p className="s1-cell-problem" role="alert">
          {t(`section1.parse.${problem}`)}
        </p>
      ) : null}

      {detailsOpen ? (
        <CellDetails
          isRefund={isRefund}
          note={note}
          disabled={stored === null}
          onClose={() => setDetailsOpen(false)}
          onChange={(nextRefund, nextNote) => {
            if (stored === null) return
            onCommit(stored, nextRefund, nextNote)
          }}
        />
      ) : null}
    </div>
  )
}

interface DetailsProps {
  isRefund: boolean
  note: string | null
  /** A note is a note about a number; an empty cell has none to annotate. */
  disabled: boolean
  onClose: () => void
  onChange: (isRefund: boolean, note: string | null) => void
}

function CellDetails({ isRefund, note, disabled, onClose, onChange }: DetailsProps): ReactElement {
  const { t } = useTranslation()
  const [draftNote, setDraftNote] = useState(note ?? '')

  return (
    <div className="s1-cell-details" role="dialog" aria-label={t('section1.cellDetailsTitle')}>
      {disabled ? (
        <p className="s1-hint">{t('section1.detailsNeedAmount')}</p>
      ) : (
        <>
          <label className="s1-check">
            <input
              type="checkbox"
              checked={isRefund}
              data-testid="cell-refund"
              onChange={(e) => onChange(e.target.checked, draftNote.trim() || null)}
            />
            <span>{t('section1.refund')}</span>
          </label>

          <label className="s1-field-label" htmlFor="s1-note">
            {t('section1.note')}
          </label>
          <input
            id="s1-note"
            type="text"
            value={draftNote}
            data-testid="cell-note"
            onChange={(e) => setDraftNote(e.target.value)}
            onBlur={() => onChange(isRefund, draftNote.trim() || null)}
          />
        </>
      )}

      <button type="button" className="s1-btn-quiet" onClick={onClose}>
        {t('common.close')}
      </button>
    </div>
  )
}
