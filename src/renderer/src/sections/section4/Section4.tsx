/**
 * Section 4 — Calculation Zone (§9).
 *
 * A fixed grid of value boxes, ten wide, with TOPLAM, ORTALAMA and ORTANCA
 * always above it. Nothing labels a box and nothing can: the owner's finding
 * after their first day with the application is that a month can carry a hundred
 * and twenty figures, and an *etiket* demanded before each one made the section
 * unusable for the only thing it is for (§9, amended 31 July 2026).
 *
 * The three headers are always on screen, including when every box is empty,
 * where they say so rather than showing a zero. A zero total is a real answer
 * for a grid of zeros; an empty grid has no total, and the difference is worth a
 * word.
 *
 * The keyboard path of §6.4 applies here too, and the grid *is* the whole of it.
 * Boxes are one flat run in DOM order — left to right, then down — so Tab walks
 * a row and falls into the next one, and a run of figures goes in without
 * reaching for anything. There is no arrow-key navigation and no roving
 * tabindex: this application has neither anywhere, and inventing them here would
 * make the scratchpad the one screen where the caret moves by a rule the rest of
 * the app does not follow. The grid grows a row at a time instead of ending in
 * an append widget — the eleventh box of a row is reached exactly as the tenth
 * was, and the row after the last figure is always there to be reached.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { computeStatistics } from '@shared/section4/engine'
import { COLUMNS } from '@shared/section4/types'
import { amountToInput, parseAmount, type ParseFailure } from '@shared/money'
import { formatNumber } from '../../i18n/format.js'
import { useAppStore } from '../../store/app-store.js'
import { useSection4Store } from '../../store/section4-store.js'

export function Section4(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const store = useSection4Store()
  const { cells, loading, error, rowsShown } = store

  useEffect(() => {
    void store.load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => computeStatistics(cells), [cells])

  // The cells arrive sparse and the grid is drawn dense, so the lookup is built
  // once per read rather than scanned once per box.
  const bySlot = useMemo(() => {
    const map = new Map<number, number>()
    for (const cell of cells) map.set(cell.slot, cell.value)
    return map
  }, [cells])

  if (loading && cells.length === 0) return <section className="s4" data-testid="section4" />

  return (
    <section className="s4" data-testid="section4">
      <header className="s4-stats" data-testid="s4-stats">
        <Statistic
          labelKey="section4.total"
          value={stats.count === 0 ? null : stats.total}
          language={language}
          testId="s4-total"
        />
        <Statistic
          labelKey="section4.average"
          value={stats.average}
          language={language}
          testId="s4-average"
        />
        <Statistic
          labelKey="section4.median"
          value={stats.median}
          language={language}
          testId="s4-median"
        />
        <p className="s4-count" data-testid="s4-count">
          {t('section4.counted', { count: stats.count })}
        </p>
      </header>

      {error ? (
        <p className="s4-error" role="alert" data-testid="section4-error">
          {t(`section4.errors.${error}`)}
          <button type="button" className="s4-btn-quiet" onClick={store.dismissError}>
            {t('common.close')}
          </button>
        </p>
      ) : null}

      <div className="s4-grid" data-testid="s4-grid">
        {Array.from({ length: rowsShown * COLUMNS }, (_unused, slot) => (
          <Box
            key={slot}
            slot={slot}
            value={bySlot.get(slot) ?? null}
            language={language}
            onCommit={(value) => void store.setCell({ slot, value })}
          />
        ))}
      </div>

      <ClearAll />
    </section>
  )
}

/**
 * One of the three headers.
 *
 * Formatted with `formatNumber` rather than as currency: this is a calculation
 * zone, and a scratchpad figure is a number. Values are stored in the same
 * hundredths money uses, so the two never need separate conventions — only
 * separate presentation.
 */
function Statistic({
  labelKey,
  value,
  language,
  testId
}: {
  labelKey: string
  value: number | null
  language: 'tr' | 'en'
  testId: string
}): ReactElement {
  const { t } = useTranslation()
  return (
    <div className="s4-stat">
      <span className="s4-stat-label">{t(labelKey)}</span>
      <span className="s4-stat-value" data-testid={testId}>
        {value === null ? <span className="s4-none">{t('section4.none')}</span> : formatNumber(value / 100, language)}
      </span>
    </div>
  )
}

/**
 * One box.
 *
 * The same state machine every editable figure in this application uses
 * (`sections/section2/AmountCell.tsx`): the app language parses what was typed
 * rather than the machine's locale, a refusal keeps what was typed instead of
 * discarding it, and nothing is guessed at. It is a `type="text"` with
 * `inputMode="decimal"` for the reason given there — a grid of spinners is
 * noise, and a `type="number"` would accept the operating system's idea of a
 * decimal separator rather than the app's.
 *
 * Empty commits as null, which removes the box's row rather than storing a zero.
 * A box the owner cleared is not a box holding nothing; it is a box holding no
 * figure, and an average must not be dragged toward a zero nobody typed.
 */
function Box({
  slot,
  value,
  language,
  onCommit
}: {
  slot: number
  /** Minor units, or null for a box with nothing in it. */
  value: number | null
  language: 'tr' | 'en'
  onCommit: (value: number | null) => void
}): ReactElement {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<ParseFailure | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // While not editing, the box shows the formatted figure; the moment it is
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

  const display = value === null ? '' : formatNumber(value / 100, language)

  return (
    <span className="s4-box-cell">
      <input
        ref={inputRef}
        className="s4-box"
        type="text"
        inputMode="decimal"
        // No label names this box, so its number does. Counted from one: the
        // first box is the first box, and only the storage counts from zero.
        aria-label={t('section4.box', { number: slot + 1 })}
        aria-invalid={problem !== null}
        value={editing ? draft : display}
        data-testid={`s4-box-${slot}`}
        onFocus={beginEditing}
        onChange={(e) => {
          setDraft(e.target.value)
          if (problem) setProblem(null)
        }}
        onBlur={() => {
          // A refusal keeps the box open rather than discarding what was typed.
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
        <p className="s4-problem" role="alert">
          {t(`section4.parse.${problem}`)}
        </p>
      ) : null}
    </span>
  )
}

/**
 * Empty every box.
 *
 * Two clicks rather than a dialogue, exactly as the ledger's own removals do:
 * §6.4 refuses a modal on the common path, and clearing a finished month's
 * arithmetic is close enough to common. It sits *after* the grid so that the one
 * destructive control in the section is never in the tab path of ordinary entry.
 */
function ClearAll(): ReactElement {
  const { t } = useTranslation()
  const store = useSection4Store()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="s4-tools">
      {confirming ? (
        <button
          type="button"
          className="s4-btn-danger-quiet"
          data-testid="s4-clear-confirm"
          onClick={() => {
            setConfirming(false)
            void store.clear()
          }}
        >
          {t('section4.clearConfirm')}
        </button>
      ) : (
        <button
          type="button"
          className="s4-btn-quiet"
          data-testid="s4-clear"
          onClick={() => setConfirming(true)}
        >
          {t('section4.clearAll')}
        </button>
      )}
    </div>
  )
}
