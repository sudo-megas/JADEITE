/**
 * Section 3 — Valuables (§8).
 *
 * Three sub-sections over one read. 3a is the ledger the owner types into, 3b is
 * what that ledger means, and 3c is the price that turns a quantity into a value.
 * They are tabs rather than a scroll because 3a is a wide table and 3b is a
 * narrow one, and a page that is both is a page that is neither.
 *
 * There is no year switcher and no workspace transition. Sections 1 and 2 are
 * workspaces onto a year; a valuables ledger is a lifetime, so there is nowhere to
 * switch to.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { computeHoldings, computeLedger } from '@shared/section3/engine'
import type { Person, PersonUsage, TransactionDraft } from '@shared/section3/types'
import { paletteById } from '@shared/theme/palettes'
import { useAppStore } from '../../store/app-store.js'
import { useSection3Store, type Section3View } from '../../store/section3-store.js'
import { Holdings } from './Holdings.js'
import { Ledger, type LedgerHandlers } from './Ledger.js'
import { ConfirmDeletePerson, Persons, type PersonHandlers } from './Persons.js'
import { Prices } from './Prices.js'

const VIEWS: readonly Section3View[] = Object.freeze(['ledger', 'holdings', 'prices'])

export function Section3(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const paletteId = useAppStore((s) => s.paletteId)
  const store = useSection3Store()
  const { data, loading, error, view, commitToken } = store

  const [pendingDelete, setPendingDelete] = useState<{
    person: Person
    usage: PersonUsage
  } | null>(null)

  useEffect(() => {
    void store.load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const palette = useMemo(() => paletteById(paletteId), [paletteId])

  // Both views are computed from the one read, so a holding and the row behind it
  // can never have come from different states of the vault.
  const ledger = useMemo(() => (data ? computeLedger(data) : null), [data])
  const holdings = useMemo(() => (data ? computeHoldings(data) : null), [data])

  const ledgerHandlers = useMemo<LedgerHandlers>(
    () => ({
      onPatch: (seq, patch) => void store.updateTransaction({ seq, ...patch }),
      onDelete: (seq) => void store.deleteTransaction(seq),
      onAppend: (draft: TransactionDraft) => store.addTransaction(draft)
    }),
    [store]
  )

  const requestDeletePerson = useCallback(async (person: Person) => {
    const usage = await window.jadeite.section3.personUsage(person.id)
    if (!usage.ok) return
    setPendingDelete({ person, usage: usage.value })
  }, [])

  const personHandlers = useMemo<PersonHandlers>(
    () => ({
      onAdd: (name) => void store.addPerson({ name, colour: null }),
      onRename: (id, name) => void store.renamePerson(id, name),
      onColour: (id, colour) => void store.setPersonColour(id, colour),
      onMove: (person, delta) => void store.movePerson(person, delta),
      onRequestDelete: (person) => void requestDeletePerson(person)
    }),
    [store, requestDeletePerson]
  )

  if (loading && !data) return <section className="s3" data-testid="section3" />

  return (
    <section className="s3" data-testid="section3">
      <header className="s3-top">
        <div className="s3-views" role="tablist" aria-label={t('section3.subsections')}>
          {VIEWS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              className="s3-view-chip"
              aria-selected={candidate === view}
              data-active={candidate === view ? 'true' : undefined}
              data-testid={`s3-view-${candidate}`}
              onClick={() => store.setView(candidate)}
            >
              {t(`section3.views.${candidate}`)}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p className="s3-error" role="alert" data-testid="section3-error">
          {t(`section3.errors.${error}`)}
          <button type="button" className="s3-btn-quiet" onClick={store.dismissError}>
            {t('common.close')}
          </button>
        </p>
      ) : null}

      {!data || !ledger || !holdings ? null : (
        <div className="s3-pane">
          {view === 'ledger' ? (
            <Ledger
              rows={ledger.rows}
              totals={ledger.totals}
              types={data.types}
              persons={data.persons}
              language={language}
              handlers={ledgerHandlers}
              commitToken={commitToken}
            />
          ) : null}

          {view === 'holdings' ? (
            <Holdings
              view={holdings}
              types={data.types}
              language={language}
              palette={palette}
            />
          ) : null}

          {view === 'prices' ? (
            <Prices
              types={data.types}
              manual={data.manualPrices}
              live={data.livePrices}
              lastFetch={data.lastFetch}
              refreshing={store.refreshing}
              liveError={store.liveError}
              liveRetryAfter={store.liveRetryAfter}
              liveIncomplete={store.liveIncomplete}
              language={language}
              onSet={(typeCode, value) => void store.setManualPrice(typeCode, value)}
              onClear={(typeCode) => void store.clearManualPrice(typeCode)}
              onRefresh={() => void store.refreshPrices()}
            />
          ) : null}

          {/*
            Persons sit under every view rather than behind a fourth tab: the
            ledger's person column and the holdings' rows are both meaningless
            until at least one exists, and a run of typing often adds one
            mid-session.
          */}
          <Persons persons={data.persons} palette={palette} handlers={personHandlers} />
        </div>
      )}

      {pendingDelete ? (
        <ConfirmDeletePerson
          person={pendingDelete.person}
          usage={pendingDelete.usage}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.person.id
            setPendingDelete(null)
            void store.deletePerson(id)
          }}
        />
      ) : null}
    </section>
  )
}
