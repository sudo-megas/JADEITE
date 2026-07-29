/**
 * Section 2 — Payments / Installments (§7).
 *
 * The forward-looking tracker: what month, how much in total, seen in advance.
 * The workspace transition is Section 1's, deliberately — one directional slide
 * of the grid pane, 180 ms, transform only, with reduced motion handled in CSS
 * so no branch here can drift from it. Two sections that move differently would
 * read as two applications.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Bank, BankDraft, BankUsage } from '@shared/section2/types'
import { MAX_YEAR, MIN_YEAR } from '@shared/section2/types'
import { computeGrid } from '@shared/section2/engine'
import { parseAmount } from '@shared/money'
import { paletteById } from '@shared/theme/palettes'
import { useAppStore } from '../../store/app-store.js'
import { useSection2Store } from '../../store/section2-store.js'
import { measureWorkspaceSwitch } from '../../store/frame-stats.js'
import { yearAccentVariables } from '../../theme/accents.js'
import { Grid, type GridHandlers } from './Grid.js'
import { formatTry } from './format.js'

export function Section2(): ReactElement {
  const { t } = useTranslation()
  const paletteId = useAppStore((s) => s.paletteId)
  const language = useAppStore((s) => s.language)
  const store = useSection2Store()
  const { years, anchorYear, activeYear, grid, loading, error, direction, switchToken } = store

  const [addingYear, setAddingYear] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ bank: Bank; usage: BankUsage } | null>(null)
  const [confirmingFreeze, setConfirmingFreeze] = useState(false)

  useEffect(() => {
    void store.load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The switch is measured rather than asserted; see store/frame-stats.ts.
  useEffect(() => {
    if (switchToken > 0) measureWorkspaceSwitch()
  }, [switchToken])

  /**
   * Today, read once per mount and handed to the engine.
   *
   * Reading the calendar is not OS-locale detection: §13 prohibits taking the
   * *language* and the formatting conventions from the machine, and the vault
   * already timestamps every row it writes.
   */
  const today = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }, [])

  const computed = useMemo(() => (grid ? computeGrid(grid, today) : null), [grid, today])

  /** The year's accent (§12.3), the same one Section 1 gives it. */
  const accentStyle = useMemo<CSSProperties>(() => {
    if (activeYear === null) return {}
    return yearAccentVariables(
      paletteById(paletteId),
      activeYear,
      anchorYear,
      grid?.accentOverride ?? null
    ) as CSSProperties
  }, [paletteId, activeYear, anchorYear, grid?.accentOverride])

  const requestDelete = useCallback(async (bank: Bank) => {
    const usage = await window.jadeite.section2.bankUsage(bank.id)
    if (!usage.ok) return
    if (usage.value.cellCount === 0) {
      // A confirmation guarding nothing is theatre; there is nothing to lose.
      void useSection2Store.getState().deleteBank(bank.id)
      return
    }
    setPendingDelete({ bank, usage: usage.value })
  }, [])

  const handlers = useMemo<GridHandlers>(
    () => ({
      onCommitCell: (month, bankId, amount) => void store.setCell(month, bankId, amount),
      onSetLimit: (id, limit) => void store.setCreditLimit(id, limit),
      onSetParty: (id, party) => void store.setCounterParty(id, party),
      onRename: (id, name) => void store.renameBank(id, name),
      onMove: (bank, delta) => void store.moveBank(bank, delta),
      onDelete: (bank) => void requestDelete(bank)
    }),
    [store, requestDelete]
  )

  if (loading && !grid) return <section className="s2" data-testid="section2" />

  const archived = grid?.archived ?? false

  return (
    <section className="s2" data-testid="section2" style={accentStyle}>
      <header className="s2-top">
        <div className="s2-years" role="tablist" aria-label={t('section2.years')}>
          {years.map((year) => (
            <span key={year} className="s2-year-slot">
              <button
                type="button"
                role="tab"
                className="s2-year-chip"
                aria-selected={year === activeYear}
                data-active={year === activeYear ? 'true' : undefined}
                data-testid={`s2-year-${year}`}
                onClick={() => void store.selectYear(year)}
              >
                {year}
              </button>
            </span>
          ))}
          <button
            type="button"
            className="s2-year-add"
            aria-label={t('section2.addYear')}
            data-testid="s2-add-year"
            onClick={() => setAddingYear(true)}
          >
            +
          </button>
        </div>

        {activeYear === null ? null : (
          <div className="s2-tools">
            {archived ? (
              <button
                type="button"
                className="s2-btn-quiet"
                data-testid="s2-reopen"
                onClick={() => void store.setArchived(false)}
              >
                {t('section2.archive.reopen')}
              </button>
            ) : (
              <button
                type="button"
                className="s2-btn-quiet"
                data-testid="s2-freeze"
                onClick={() => setConfirmingFreeze(true)}
              >
                {t('section2.archive.freeze')}
              </button>
            )}
          </div>
        )}
      </header>

      {error ? (
        <p className="s2-error" role="alert" data-testid="section2-error">
          {t(`section2.errors.${error}`)}
          <button type="button" className="s2-btn-quiet" onClick={store.dismissError}>
            {t('common.close')}
          </button>
        </p>
      ) : null}

      {archived ? (
        <p className="s2-frozen" data-testid="s2-frozen-banner">
          {t('section2.archive.frozen', { year: activeYear })}
          <span className="lede">{t('section2.archive.frozenHint')}</span>
        </p>
      ) : null}

      {activeYear === null || !computed ? null : (
        <div
          className="s2-pane"
          key={switchToken}
          data-direction={direction}
          data-testid={`s2-workspace-${activeYear}`}
        >
          {computed.columns.length === 0 ? (
            <p className="s2-empty-state" data-testid="section2-empty">
              {t('section2.noBanks')}
            </p>
          ) : (
            <Grid computed={computed} language={language} handlers={handlers} />
          )}

          {archived ? null : <AddBank onAdd={(draft) => void store.addBank(draft)} />}
        </div>
      )}

      {addingYear ? (
        <AddYear
          years={years}
          onCancel={() => setAddingYear(false)}
          onCreate={(year) => {
            setAddingYear(false)
            void store.createYear(year)
          }}
        />
      ) : null}

      {confirmingFreeze && activeYear !== null ? (
        <ConfirmFreeze
          year={activeYear}
          onCancel={() => setConfirmingFreeze(false)}
          onConfirm={() => {
            setConfirmingFreeze(false)
            void store.setArchived(true)
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDelete
          bank={pendingDelete.bank}
          usage={pendingDelete.usage}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.bank.id
            setPendingDelete(null)
            void store.deleteBank(id)
          }}
        />
      ) : null}
    </section>
  )
}

// --- Adding a column --------------------------------------------------------

/**
 * One form for both kinds of column.
 *
 * A counter column is a bank column with a flag, so it is added by the same
 * form with the same fields — the second of which changes meaning, exactly as
 * the grid's own second top-bar row does.
 */
function AddBank({ onAdd }: { onAdd: (draft: BankDraft) => void }): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const [name, setName] = useState('')
  const [isCounter, setIsCounter] = useState(false)
  const [limit, setLimit] = useState('')
  const [party, setParty] = useState('')

  return (
    <form
      className="s2-add-column"
      data-testid="s2-add-column"
      onSubmit={(e) => {
        e.preventDefault()
        const cleaned = name.trim()
        if (cleaned.length === 0) return

        // The limit goes through the same parser as every other amount, so a
        // limit typed here and a limit typed into the grid cannot disagree
        // about what a comma means.
        const parsed = parseAmount(limit, language)
        const creditLimit = !isCounter && parsed.kind === 'amount' ? parsed.minorUnits : 0

        onAdd({
          name: cleaned,
          creditLimit,
          isCounter,
          counterParty: isCounter ? party.trim() || null : null
        })
        setName('')
        setLimit('')
        setParty('')
      }}
    >
      <input
        type="text"
        placeholder={t('section2.newBankName')}
        aria-label={t('section2.newBankName')}
        value={name}
        data-testid="s2-new-column-name"
        onChange={(e) => setName(e.target.value)}
      />

      <select
        aria-label={t('section2.bankKind')}
        value={isCounter ? 'counter' : 'bank'}
        data-testid="s2-new-column-kind"
        onChange={(e) => setIsCounter(e.target.value === 'counter')}
      >
        <option value="bank">{t('section2.bankKindBank')}</option>
        <option value="counter">{t('section2.bankKindCounter')}</option>
      </select>

      {isCounter ? (
        <input
          type="text"
          placeholder={t('section2.newParty')}
          aria-label={t('section2.newParty')}
          value={party}
          data-testid="s2-new-column-party"
          onChange={(e) => setParty(e.target.value)}
        />
      ) : (
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('section2.newLimit')}
          aria-label={t('section2.newLimit')}
          value={limit}
          data-testid="s2-new-column-limit"
          onChange={(e) => setLimit(e.target.value)}
        />
      )}

      <button type="submit" className="s2-btn" data-testid="s2-add-column-submit">
        {t('section2.addColumn')}
      </button>
    </form>
  )
}

// --- Adding a year ----------------------------------------------------------

function AddYear({
  years,
  onCancel,
  onCreate
}: {
  years: number[]
  onCancel: () => void
  onCreate: (year: number) => void
}): ReactElement {
  const { t } = useTranslation()
  const suggested = (years.at(-1) ?? new Date().getFullYear()) + 1
  const [value, setValue] = useState(String(suggested))

  const parsed = Number.parseInt(value, 10)
  const valid =
    Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= MAX_YEAR && !years.includes(parsed)

  return (
    <div className="s2-modal" role="dialog" aria-modal="true" aria-label={t('section2.addYear')}>
      <div className="s2-modal-body">
        <h2>{t('section2.addYear')}</h2>
        <p className="lede">{t('section2.addYearLede')}</p>
        <input
          type="text"
          inputMode="numeric"
          aria-label={t('section2.year')}
          value={value}
          data-testid="s2-new-year-input"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onCreate(parsed)
          }}
        />
        <div className="s2-menu-foot">
          <button
            type="button"
            className="s2-btn"
            disabled={!valid}
            data-testid="s2-new-year-submit"
            onClick={() => valid && onCreate(parsed)}
          >
            {t('section2.createYear')}
          </button>
          <button type="button" className="s2-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Freezing ---------------------------------------------------------------

/**
 * Freezing is confirmed, but not gravely.
 *
 * Nothing is lost either way and it can be undone with one click, which is the
 * whole point of freezing rather than deleting — so the dialogue says what will
 * happen and how to undo it, and stops there.
 */
function ConfirmFreeze({
  year,
  onCancel,
  onConfirm
}: {
  year: number
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const { t } = useTranslation()
  return (
    <div
      className="s2-modal"
      role="dialog"
      aria-modal="true"
      data-testid="s2-confirm-freeze"
      aria-label={t('section2.archive.freezeTitle', { year })}
    >
      <div className="s2-modal-body">
        <h2>{t('section2.archive.freezeTitle', { year })}</h2>
        <p className="lede" data-testid="s2-confirm-freeze-detail">
          {t('section2.archive.freezeDetail')}
        </p>
        <div className="s2-menu-foot">
          <button
            type="button"
            className="s2-btn"
            data-testid="s2-confirm-freeze-yes"
            onClick={onConfirm}
          >
            {t('section2.archive.freezeConfirm')}
          </button>
          <button type="button" className="s2-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Deleting a column ------------------------------------------------------

function ConfirmDelete({
  bank,
  usage,
  onCancel,
  onConfirm
}: {
  bank: Bank
  usage: BankUsage
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)

  return (
    <div
      className="s2-modal"
      role="dialog"
      aria-modal="true"
      data-testid="s2-confirm-delete"
      aria-label={t('section2.deleteColumnWarningTitle', { name: bank.name })}
    >
      <div className="s2-modal-body">
        <h2>{t('section2.deleteColumnWarningTitle', { name: bank.name })}</h2>
        <p className="lede" data-testid="s2-confirm-delete-detail">
          {t('section2.deleteColumnDetail', {
            name: bank.name,
            count: usage.cellCount,
            total: formatTry(usage.total, language)
          })}
        </p>
        <p className="lede">{t('section2.deleteColumnWarningBody')}</p>
        <div className="s2-menu-foot">
          <button
            type="button"
            className="s2-btn-danger"
            data-testid="s2-confirm-delete-yes"
            onClick={onConfirm}
          >
            {t('section2.deleteColumnConfirm')}
          </button>
          <button type="button" className="s2-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}
