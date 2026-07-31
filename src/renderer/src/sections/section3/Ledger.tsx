/**
 * 3a — the transaction ledger (§8.3).
 *
 * **The ledger is not sorted, and that is deliberate.** Realisation IV refused
 * sorting in Section 2 because its rows *are* the calendar; the same argument
 * decides it here, and one further thing does. The **Total Quantity** column of
 * §8.3 is a running holding — how much of this type existed after this row — and
 * a running total in any order but chronological describes nothing. Sorting by
 * amount would not merely lose the ordering; it would make a whole column lie.
 * Filtering to one person would do the same, since the column runs across all of
 * them. The per-person and per-type views §8.4 asks for are what 3b is, and the
 * charts of Realisation VI get filters of their own.
 *
 * So rows arrive in the order the vault reads them — by date, then by number —
 * and the number column shows gaps where rows were deleted, honestly.
 *
 * The **append row** at the foot is the section's graded requirement (§6.4). It is
 * always there, it carries the previous row's date, type, direction and person
 * forward, and Enter commits it and returns to its first field ready for the next.
 * Thirty consecutive purchases go in without the mouse and without a dialogue.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { LedgerRow, LedgerTotals } from '@shared/section3/engine'
import type {
  Direction,
  Person,
  TransactionDraft,
  TypeCode,
  ValuableType
} from '@shared/section3/types'
import { parseQuantity, quantityToInput } from '@shared/section3/units'
import { parseAmount } from '@shared/money'
import type { AppLanguage } from '../../i18n/format.js'
import { formatDate, parseDate } from '../../i18n/format.js'
import { CountCell, MoneyCell, QuantityCell } from './Cells.js'
import { formatQuantity, formatTry } from './format.js'

/** The unit a price is quoted against, as a short suffix for the header. */
function priceSuffixKey(type: ValuableType): string {
  if (type.unit === 'mg') return 'section3.perGram'
  if (type.unit === 'piece') return 'section3.perPiece'
  return 'section3.perUnit'
}

export interface LedgerHandlers {
  onPatch: (seq: number, patch: Partial<TransactionDraft>) => void
  onDelete: (seq: number) => void
  onAppend: (draft: TransactionDraft) => Promise<boolean>
}

interface Props {
  rows: readonly LedgerRow[]
  totals: LedgerTotals
  types: readonly ValuableType[]
  persons: readonly Person[]
  language: AppLanguage
  handlers: LedgerHandlers
  /** Moves when a row is committed, so the append row can reset itself. */
  commitToken: number
}

export function Ledger({
  rows,
  totals,
  types,
  persons,
  language,
  handlers,
  commitToken
}: Props): ReactElement {
  const { t } = useTranslation()

  /**
   * The append row's refusal, held here rather than in the row itself.
   *
   * Every other refusal in this section is an overlay hanging off the cell it is
   * about, which is right for a cell with rows below it. The append row is the
   * last row of a table inside an `overflow-x: auto` scroller — and a scroller
   * clips both axes, not the one it names — so an overlay below that row is cut
   * off at its bottom edge and one above it is cut off at the header. Drawn as a
   * sibling of the scroller, it cannot be clipped by anything.
   */
  const [appendProblem, setAppendProblem] = useState<string | null>(null)

  return (
    <>
      <div className="s3-ledger-scroll">
        <table className="s3-ledger" data-testid="s3-ledger">
          <thead>
            <tr>
              <th scope="col" className="s3-num">
                {t('section3.no')}
              </th>
              <th scope="col">{t('section3.date')}</th>
              <th scope="col">{t('section3.type')}</th>
              <th scope="col">{t('section3.direction')}</th>
              <th scope="col" className="s3-figure">
                {t('section3.denomination')}
              </th>
              <th scope="col" className="s3-figure">
                {t('section3.count')}
              </th>
              <th scope="col" className="s3-figure">
                {t('section3.quantity')}
              </th>
              <th scope="col" className="s3-figure">
                {t('section3.totalQuantity')}
              </th>
              <th scope="col" className="s3-figure">
                {t('section3.unitPrice')}
              </th>
              <th scope="col" className="s3-figure">
                {t('section3.transactionTotal')}
              </th>
              <th scope="col">{t('section3.source')}</th>
              <th scope="col">{t('section3.person')}</th>
              <th scope="col">{t('section3.note')}</th>
              <th scope="col">
                <span className="s3-sr-only">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <Row
                key={row.transaction.seq}
                row={row}
                types={types}
                persons={persons}
                language={language}
                handlers={handlers}
              />
            ))}

            <AppendRow
              types={types}
              persons={persons}
              language={language}
              previous={rows.at(-1) ?? null}
              commitToken={commitToken}
              onAppend={handlers.onAppend}
              problem={appendProblem}
              onProblem={setAppendProblem}
            />
          </tbody>

          <tfoot>
            <tr className="s3-ledger-totals" data-testid="s3-ledger-totals">
              <th scope="row" colSpan={4}>
                {t('section3.ledgerTotals', { count: totals.rowCount })}
              </th>
              {/* Denomination, Count, Quantity, Total Quantity, Unit Price — five
                  since §8.3's amendment split quantity into two typed columns and
                  one derived, where there was one. */}
              <td colSpan={5} className="s3-figure">
                {totals.provisionalCount > 0
                  ? t('section3.provisionalCount', { count: totals.provisionalCount })
                  : null}
              </td>
              <td className="s3-figure" data-testid="s3-total-acquired">
                {t('section3.acquiredValue', {
                  value: formatTry(totals.acquiredValue, language)
                })}
              </td>
              <td colSpan={3} className="s3-figure" data-testid="s3-total-disposed">
                {totals.disposedValue > 0
                  ? t('section3.disposedValue', {
                      value: formatTry(totals.disposedValue, language)
                    })
                  : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {appendProblem ? (
        <p className="s3-append-problem" role="alert" data-testid="s3-append-problem">
          {t(appendProblem)}
        </p>
      ) : null}
    </>
  )
}

// --- One existing row -------------------------------------------------------

function Row({
  row,
  types,
  persons,
  language,
  handlers
}: {
  row: LedgerRow
  types: readonly ValuableType[]
  persons: readonly Person[]
  language: AppLanguage
  handlers: LedgerHandlers
}): ReactElement {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const { transaction: tx, type } = row
  const id = tx.seq

  return (
    <tr
      className="s3-row"
      data-direction={tx.direction}
      data-provisional={tx.dateProvisional ? 'true' : undefined}
      data-testid={`s3-row-${id}`}
    >
      <td className="s3-num" data-testid={`s3-seq-${id}`}>
        {id}
      </td>

      <td>
        <DateField
          value={tx.date}
          provisional={tx.dateProvisional}
          language={language}
          testId={`s3-date-${id}`}
          onCommitDate={(date) => handlers.onPatch(id, { date })}
          onToggleProvisional={(dateProvisional) => handlers.onPatch(id, { dateProvisional })}
        />
      </td>

      <td>
        <select
          className="s3-select"
          aria-label={t('section3.type')}
          value={tx.typeCode}
          data-testid={`s3-type-${id}`}
          onChange={(e) => handlers.onPatch(id, { typeCode: e.target.value as TypeCode })}
        >
          {types.map((candidate) => (
            <option key={candidate.code} value={candidate.code}>
              {t(`section3.types.${candidate.code}`)}
            </option>
          ))}
        </select>
      </td>

      <td>
        <select
          className="s3-select"
          aria-label={t('section3.direction')}
          value={tx.direction}
          data-testid={`s3-direction-${id}`}
          onChange={(e) => handlers.onPatch(id, { direction: e.target.value as Direction })}
        >
          <option value="acquire">{t('section3.acquire')}</option>
          <option value="dispose">{t('section3.dispose')}</option>
        </select>
      </td>

      {/*
        Denomination and count (§8.3, amended). A coin's denomination is its own
        type, so for a `piece` row the cell is read-only 1 rather than absent —
        one grid serves both kinds, and an editable 1 would invite an edit that
        means nothing.
      */}
      <td className="s3-figure">
        <QuantityCell
          value={tx.denomination}
          typeCode={tx.typeCode}
          unit={type.unit}
          language={language}
          label={t('section3.denomination')}
          testId={`s3-denomination-${id}`}
          cellClass="s3-denomination-cell"
          readOnly={type.unit === 'piece'}
          onCommit={(denomination) => handlers.onPatch(id, { denomination })}
        />
      </td>

      <td className="s3-figure">
        <CountCell
          value={tx.count}
          language={language}
          label={t('section3.count')}
          testId={`s3-count-${id}`}
          onCommit={(count) => handlers.onPatch(id, { count })}
        />
      </td>

      {/* Derived — denomination × count, generated by the vault. */}
      <td className="s3-figure s3-derived" data-testid={`s3-quantity-${id}`}>
        {formatQuantity(tx.quantity, tx.typeCode, type.unit, language)}
      </td>

      {/* Derived, so it is read rather than edited. */}
      <td className="s3-figure s3-derived" data-testid={`s3-running-${id}`}>
        {formatQuantity(row.runningQuantity, tx.typeCode, type.unit, language)}
      </td>

      <td className="s3-figure">
        <MoneyCell
          value={tx.unitPrice}
          language={language}
          label={t(priceSuffixKey(type))}
          testId={`s3-price-${id}`}
          required
          onCommit={(unitPrice) => {
            if (unitPrice !== null) handlers.onPatch(id, { unitPrice })
          }}
        />
      </td>

      <td className="s3-figure s3-derived" data-testid={`s3-total-${id}`}>
        {formatTry(row.total, language)}
      </td>

      <td>
        <TextField
          value={tx.source}
          label={t('section3.source')}
          testId={`s3-source-${id}`}
          onCommit={(source) => handlers.onPatch(id, { source })}
        />
      </td>

      <td>
        <select
          className="s3-select"
          aria-label={t('section3.person')}
          value={tx.personId ?? row.person.id}
          data-testid={`s3-person-${id}`}
          onChange={(e) => handlers.onPatch(id, { personId: Number(e.target.value) })}
        >
          {persons.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </td>

      <td>
        <TextField
          value={tx.note}
          label={t('section3.note')}
          testId={`s3-note-${id}`}
          onCommit={(note) => handlers.onPatch(id, { note })}
        />
      </td>

      {/*
        Two clicks rather than a dialogue. One ledger row is a small thing to
        lose and a modal on this table would break the keyboard path §6.4
        requires, so the button asks in place and forgets if it is ignored.
      */}
      <td>
        {confirming ? (
          <span className="s3-confirm">
            <button
              type="button"
              className="s3-btn-danger-quiet"
              data-testid={`s3-delete-confirm-${id}`}
              onClick={() => handlers.onDelete(id)}
            >
              {t('section3.deleteRowConfirm')}
            </button>
            <button
              type="button"
              className="s3-btn-quiet"
              onClick={() => setConfirming(false)}
            >
              {t('common.back')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="s3-btn-quiet s3-row-delete"
            aria-label={t('section3.deleteRow', { seq: id })}
            data-testid={`s3-delete-${id}`}
            onClick={() => setConfirming(true)}
          >
            ×
          </button>
        )}
      </td>
    </tr>
  )
}

// --- The append row ---------------------------------------------------------

interface Composed {
  date: string
  typeCode: TypeCode
  direction: Direction
  denomination: string
  count: string
  unitPrice: string
  source: string
  personId: number | null
  note: string
}

/**
 * What the next row starts as.
 *
 * Date, type, direction, person **and denomination** carry forward from the row
 * just committed; count returns to 1, and price, source and note clear. That is
 * the split a run of purchases actually wants: they are usually the same person
 * buying the same thing in the same size, and never the same amount at the same
 * price.
 *
 * Denomination joins the carried set rather than the cleared one because it *is*
 * "the same thing" — a run of ten-gram bars is one bar size typed once, and
 * clearing it would put a keystroke back into the loop §6.4 exists to empty.
 * Count clears to `1` rather than to empty for the same reason in reverse: one
 * piece is what most rows record, so the common case needs no keystroke at all.
 *
 * The date carries as the **display** string, not as the ISO the row stores. The
 * append row's date cell is a cell the owner types into, and what carries into
 * it has to be something they could have typed themselves; handing it back the
 * `2026-02-20` the vault holds would put a shape into the field that the field
 * no longer accepts, and the first row of every run would be refused for
 * agreeing with the database.
 */
function carriedForward(
  previous: LedgerRow | null,
  types: readonly ValuableType[],
  language: AppLanguage
): Composed {
  const firstType = types[0]?.code ?? 'gram'
  if (!previous) {
    return {
      date: '',
      typeCode: firstType,
      direction: 'acquire',
      denomination: '',
      count: '1',
      unitPrice: '',
      source: '',
      personId: null,
      note: ''
    }
  }
  return {
    date: formatDate(previous.transaction.date, language),
    typeCode: previous.transaction.typeCode,
    direction: previous.transaction.direction,
    denomination: quantityToInput(
      previous.transaction.denomination,
      previous.type.unit,
      language
    ),
    count: '1',
    unitPrice: '',
    source: '',
    personId: previous.transaction.personId,
    note: ''
  }
}

function AppendRow({
  types,
  persons,
  language,
  previous,
  commitToken,
  onAppend,
  problem,
  onProblem
}: {
  types: readonly ValuableType[]
  persons: readonly Person[]
  language: AppLanguage
  previous: LedgerRow | null
  commitToken: number
  onAppend: (draft: TransactionDraft) => Promise<boolean>
  /**
   * The refusal belongs to the row but is drawn outside the table.
   *
   * It used to hang off a cell as every other refusal in this section does,
   * which works for a cell in the middle of a grid and not for this one: the
   * append row is the last row of a table inside an `overflow: auto` scroller,
   * so an overlay below it is cut off at the scroller's edge and one above it is
   * cut off at the header. `Ledger` draws it under the scroller instead, where
   * nothing can clip it and the owner is already looking.
   */
  problem: string | null
  onProblem: (problem: string | null) => void
}): ReactElement {
  const { t } = useTranslation()
  const [composed, setComposed] = useState<Composed>(() =>
    carriedForward(previous, types, language)
  )
  const [provisional, setProvisional] = useState(false)
  const setProblem = onProblem
  const dateRef = useRef<HTMLInputElement>(null)

  /**
   * A commit resets the row and hands the caret back to its first field, so the
   * next purchase can be typed without reaching for anything.
   *
   * The carried date is **selected**, not merely focused. With the caret left at
   * the end, typing a new date would append to the old one and make
   * `05/04/202612` out of two perfectly good dates — while selecting it means
   * typing replaces and tabbing past keeps, which is exactly the choice the next
   * row needs. It also keeps the field scrolled to its start, so a ten-character
   * date is read from the day rather than from its last nine characters.
   */
  useEffect(() => {
    if (commitToken === 0) return
    setComposed(carriedForward(previous, types, language))
    setProvisional(false)
    setProblem(null)
    dateRef.current?.select()
    // The token is the trigger; `previous` is read at the moment it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitToken])

  const type = types.find((candidate) => candidate.code === composed.typeCode) ?? types[0]

  function patch(part: Partial<Composed>): void {
    setComposed((current) => ({ ...current, ...part }))
    if (problem) setProblem(null)
  }

  async function submit(): Promise<void> {
    if (!type) return

    // Typed as GG/AA/YYYY, stored as ISO-8601 (§5.2). The conversion happens
    // here, on the way out, so the main process still receives — and still
    // refuses on — exactly the shape it always did.
    const date = parseDate(composed.date, language)
    if (date.kind === 'error') {
      setProblem(`section3.parse.${date.reason}`)
      dateRef.current?.focus()
      return
    }

    // A coin's denomination is its own type, so the field is not offered and the
    // value is fixed at one piece; a weighable's is typed and unit-scaled.
    const denomination =
      type.unit === 'piece'
        ? ({ kind: 'quantity', scaled: 1 } as const)
        : parseQuantity(composed.denomination, type.unit, language)
    if (denomination.kind !== 'quantity') {
      setProblem(
        denomination.kind === 'empty'
          ? 'section3.parse.REQUIRED'
          : `section3.parse.${denomination.reason}`
      )
      return
    }

    const count = parseQuantity(composed.count, 'piece', language)
    if (count.kind !== 'quantity') {
      setProblem(
        count.kind === 'empty' ? 'section3.parse.REQUIRED' : `section3.parse.${count.reason}`
      )
      return
    }

    const price = parseAmount(composed.unitPrice, language)
    if (price.kind === 'error') {
      setProblem(`section3.parse.${price.reason}`)
      return
    }

    const accepted = await onAppend({
      date: date.iso,
      dateProvisional: provisional,
      typeCode: composed.typeCode,
      direction: composed.direction,
      denomination: denomination.scaled,
      count: count.scaled,
      unitPrice: price.kind === 'amount' ? price.minorUnits : 0,
      source: composed.source.trim() || null,
      personId: composed.personId,
      note: composed.note.trim() || null
    })

    // A refusal leaves everything on screen. The store has already put the
    // reason on the section's error line.
    if (!accepted) setProblem(null)
  }

  /** Enter anywhere in the row commits it, so no field is the special one. */
  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void submit()
  }

  return (
    <tr className="s3-row s3-append" data-testid="s3-append-row" onKeyDown={onKeyDown}>
      <td className="s3-num" aria-hidden="true">
        +
      </td>

      <td>
        {/* The same wrapper class an existing row's date uses, so both are sized
            by one rule rather than by two that can drift. */}
        <div className="s3-cell s3-date-cell">
          <input
            ref={dateRef}
            className="s3-cell-input"
            type="text"
            inputMode="numeric"
            placeholder={t('section3.datePlaceholder')}
            aria-label={t('section3.date')}
            aria-invalid={problem === 'section3.parse.INVALID_DATE'}
            value={composed.date}
            data-testid="s3-new-date"
            onChange={(e) => patch({ date: e.target.value })}
          />
          <label className="s3-provisional">
            <input
              type="checkbox"
              checked={provisional}
              data-testid="s3-new-provisional"
              onChange={(e) => setProvisional(e.target.checked)}
            />
            <span className="s3-sr-only">{t('section3.provisional')}</span>
            <span aria-hidden="true">?</span>
          </label>
        </div>
      </td>

      <td>
        <select
          className="s3-select"
          aria-label={t('section3.type')}
          value={composed.typeCode}
          data-testid="s3-new-type"
          onChange={(e) => patch({ typeCode: e.target.value as TypeCode })}
        >
          {types.map((candidate) => (
            <option key={candidate.code} value={candidate.code}>
              {t(`section3.types.${candidate.code}`)}
            </option>
          ))}
        </select>
      </td>

      <td>
        <select
          className="s3-select"
          aria-label={t('section3.direction')}
          value={composed.direction}
          data-testid="s3-new-direction"
          onChange={(e) => patch({ direction: e.target.value as Direction })}
        >
          <option value="acquire">{t('section3.acquire')}</option>
          <option value="dispose">{t('section3.dispose')}</option>
        </select>
      </td>

      {/*
        A coin has no denomination to type — it is the type — so the field is
        disabled rather than removed, keeping the append row's cells aligned with
        the rows above it and its tab order stable whichever type is chosen.
      */}
      <td className="s3-figure">
        <input
          className="s3-cell-input s3-denomination-input"
          type="text"
          inputMode="decimal"
          aria-label={t('section3.denomination')}
          value={type && type.unit === 'piece' ? '' : composed.denomination}
          disabled={!type || type.unit === 'piece'}
          data-testid="s3-new-denomination"
          onChange={(e) => patch({ denomination: e.target.value })}
        />
      </td>

      <td className="s3-figure">
        <input
          className="s3-cell-input s3-count-input"
          type="text"
          inputMode="numeric"
          aria-label={t('section3.count')}
          value={composed.count}
          data-testid="s3-new-count"
          onChange={(e) => patch({ count: e.target.value })}
        />
      </td>

      {/* Derived quantity, and the running total — both blank until committed. */}
      <td className="s3-figure s3-derived" aria-hidden="true" />

      <td className="s3-figure s3-derived" aria-hidden="true" />

      <td className="s3-figure">
        <input
          className="s3-cell-input"
          type="text"
          inputMode="decimal"
          aria-label={type ? t(priceSuffixKey(type)) : t('section3.unitPrice')}
          value={composed.unitPrice}
          data-testid="s3-new-price"
          onChange={(e) => patch({ unitPrice: e.target.value })}
        />
      </td>

      <td className="s3-figure s3-derived" aria-hidden="true" />

      <td>
        <input
          className="s3-cell-input"
          type="text"
          aria-label={t('section3.source')}
          value={composed.source}
          data-testid="s3-new-source"
          onChange={(e) => patch({ source: e.target.value })}
        />
      </td>

      <td>
        <select
          className="s3-select"
          aria-label={t('section3.person')}
          value={composed.personId ?? ''}
          data-testid="s3-new-person"
          onChange={(e) =>
            patch({ personId: e.target.value === '' ? null : Number(e.target.value) })
          }
        >
          {/* Empty means Ortak, which is what the vault writes for a null. */}
          <option value="">{t('section3.unassigned')}</option>
          {persons
            .filter((person) => !person.isBuiltin)
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
        </select>
      </td>

      <td>
        <input
          className="s3-cell-input"
          type="text"
          aria-label={t('section3.note')}
          value={composed.note}
          data-testid="s3-new-note"
          onChange={(e) => patch({ note: e.target.value })}
        />
      </td>

      <td>
        <button
          type="button"
          className="s3-btn"
          data-testid="s3-append-submit"
          onClick={() => void submit()}
        >
          {t('section3.addRow')}
        </button>
      </td>
    </tr>
  )
}

// --- Small fields -----------------------------------------------------------

/**
 * A date, with the flag that says it is still under review.
 *
 * Read and written in the app's own shape, GG/AA/YYYY, and stored as the ISO-8601
 * §5.2 pins. It showed the localised form when idle and the raw `2026-02-20`
 * the moment it was focused, which meant the cell displayed one thing and edited
 * another and the owner had to know both. One shape in both states is the fix,
 * and it is only possible now that there is a parser to read that shape back.
 *
 * A native date field would have been friendlier to click and would also have
 * drawn its format from the operating system, which §13 forbids outright — an
 * app that speaks Turkish must not show an American date because Chromium was
 * started with `--lang=en-US`.
 *
 * A refusal keeps the cell open with what was typed still in it, exactly as
 * `Cells.tsx` does for a price or a quantity: a date that cannot be read is
 * never guessed at, and silently discarding the attempt would lose an edit in
 * the middle of the long typing session this section is built for.
 */
function DateField({
  value,
  provisional,
  language,
  testId,
  onCommitDate,
  onToggleProvisional
}: {
  value: string
  provisional: boolean
  language: AppLanguage
  testId: string
  onCommitDate: (date: string) => void
  onToggleProvisional: (provisional: boolean) => void
}): ReactElement {
  const { t } = useTranslation()
  const display = formatDate(value, language)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(display)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(display)
  }, [display, editing])

  /**
   * The comparison is between ISO strings, never between the typed text and the
   * stored value: `20/02/2026` and `2026-02-20` are the same day spelled two
   * ways, and comparing them raw would make every focus-then-tab-away a patch.
   */
  function commit(): void {
    const parsed = parseDate(draft, language)
    if (parsed.kind === 'error') {
      setProblem(`section3.parse.${parsed.reason}`)
      return
    }
    setProblem(null)
    setEditing(false)
    if (parsed.iso !== value) onCommitDate(parsed.iso)
  }

  return (
    <div className="s3-cell s3-date-cell">
      <input
        className="s3-cell-input"
        type="text"
        inputMode="numeric"
        aria-label={t('section3.date')}
        aria-invalid={problem !== null}
        value={editing ? draft : display}
        data-testid={testId}
        onFocus={() => {
          setDraft(display)
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
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(display)
            setProblem(null)
            setEditing(false)
            e.currentTarget.blur()
          }
        }}
      />
      <label className="s3-provisional">
        <input
          type="checkbox"
          checked={provisional}
          data-testid={`${testId}-provisional`}
          onChange={(e) => onToggleProvisional(e.target.checked)}
        />
        <span className="s3-sr-only">{t('section3.provisional')}</span>
        <span aria-hidden="true">?</span>
      </label>

      {problem ? (
        <p className="s3-cell-problem" role="alert">
          {t(problem)}
        </p>
      ) : null}
    </div>
  )
}

/** Free text — a shop name, a note. Empty commits as null, never as ''. */
function TextField({
  value,
  label,
  testId,
  onCommit
}: {
  value: string | null
  label: string
  testId: string
  onCommit: (value: string | null) => void
}): ReactElement {
  const [draft, setDraft] = useState(value ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  return (
    <input
      className="s3-cell-input"
      type="text"
      aria-label={label}
      value={draft}
      data-testid={testId}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const cleaned = draft.trim()
        if (cleaned !== (value ?? '')) onCommit(cleaned.length === 0 ? null : cleaned)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
