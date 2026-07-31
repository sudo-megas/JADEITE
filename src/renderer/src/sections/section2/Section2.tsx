/**
 * Section 2 — Payments / Installments (§7).
 *
 * The forward-looking tracker: what month, how much in total, seen in advance.
 *
 * One grid, twelve month lines, no year (§7.1, §7.3 as amended by point
 * revision v0.8b). The year chips, the add-year form and the freeze went with
 * the year, and so did the directional workspace transition they existed to
 * animate — there is no longer a second workspace to slide to. Section 1 keeps
 * both its years and that transition.
 *
 * The accent goes with them too. §12.3's year accents are derived from a year
 * number, and a section without one has nothing to derive from; the `--year-accent`
 * family falls back to the palette's own accent at `:root` (theme/tokens.css),
 * so Section 2 stays painted without asking for anything.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Bank, BankDraft, BankUsage } from '@shared/section2/types'
import { computeGrid } from '@shared/section2/engine'
import { parseAmount } from '@shared/money'
import { useAppStore } from '../../store/app-store.js'
import { useSection2Store } from '../../store/section2-store.js'
import { Grid, type GridHandlers } from './Grid.js'
import { formatTry } from './format.js'

export function Section2(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const store = useSection2Store()
  const { grid, loading, error } = store

  const [pendingDelete, setPendingDelete] = useState<{ bank: Bank; usage: BankUsage } | null>(null)

  useEffect(() => {
    void store.load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The month the owner is in, read once per mount and handed to the engine.
   *
   * Reading the calendar is not OS-locale detection: §13 prohibits taking the
   * *language* and the formatting conventions from the machine, and the vault
   * already timestamps every row it writes.
   */
  const currentMonth = useMemo(() => new Date().getMonth() + 1, [])

  const computed = useMemo(
    () => (grid ? computeGrid(grid, currentMonth) : null),
    [grid, currentMonth]
  )

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

  return (
    <section className="s2" data-testid="section2">
      {error ? (
        <p className="s2-error" role="alert" data-testid="section2-error">
          {t(`section2.errors.${error}`)}
          <button type="button" className="s2-btn-quiet" onClick={store.dismissError}>
            {t('common.close')}
          </button>
        </p>
      ) : null}

      {!computed ? null : (
        <div className="s2-pane" data-testid="s2-workspace">
          {computed.columns.length === 0 ? (
            <p className="s2-empty-state" data-testid="section2-empty">
              {t('section2.noBanks')}
            </p>
          ) : (
            <Grid computed={computed} language={language} handlers={handlers} />
          )}

          <AddBank onAdd={(draft) => void store.addBank(draft)} />
        </div>
      )}

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
