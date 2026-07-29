/**
 * Section 1 — the year workspace.
 *
 * Years are workspaces in the desktop-environment sense (§6.1): switching is a
 * page change, not a scroll through one endless table. The switch is a single
 * directional slide of the grid pane, 180 ms, transform only — deliberate
 * enough to say which way time went, quiet enough that nobody would call it
 * theatre. Under `prefers-reduced-motion` it is an instant swap, decided in CSS
 * so no branch here can drift from it.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Category, CategoryUsage, ValueType, YearUsage } from '@shared/section1/types'
import { MAX_YEAR, MIN_YEAR, VALUE_TYPES } from '@shared/section1/types'
import { computeWorkspace } from '@shared/section1/engine'
import { paletteById } from '@shared/theme/palettes/index.js'
import { yearAccentVariables } from '../../theme/accents.js'
import { useAppStore } from '../../store/app-store.js'
import { useSection1Store } from '../../store/section1-store.js'
import { measureWorkspaceSwitch } from '../../store/frame-stats.js'
import { formatByType } from './format.js'
import { Grid, type GridHandlers } from './Grid.js'
import { YearMenu } from './YearMenu.js'

export function Section1(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const paletteId = useAppStore((s) => s.paletteId)

  const store = useSection1Store()
  const {
    years,
    anchorYear,
    activeYear,
    workspace,
    loading,
    error,
    direction,
    switchToken,
    sort,
    filters
  } = store

  const [addingYear, setAddingYear] = useState(false)
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const [pendingYearDelete, setPendingYearDelete] = useState<{
    year: number
    usage: YearUsage
  } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    category: Category
    usage: CategoryUsage
  } | null>(null)

  useEffect(() => {
    void store.load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The switch is measured rather than asserted; see store/frame-stats.ts.
  // switchToken only moves on a real workspace change, so editing a cell never
  // starts a sampler.
  useEffect(() => {
    if (switchToken > 0) measureWorkspaceSwitch()
  }, [switchToken])

  const computed = useMemo(
    () =>
      workspace
        ? computeWorkspace(workspace)
        : { valueTypesInUse: [], months: [], categoryTotals: new Map(), yearBuckets: [] },
    [workspace]
  )

  /**
   * The year's accent (§12.3), muted before it reaches a pixel.
   *
   * The anchor comes from the vault and never moves, so a year keeps the colour
   * the owner learnt to recognise even after an older year is added later.
   */
  const accentStyle = useMemo<CSSProperties>(() => {
    if (activeYear === null) return {}
    return yearAccentVariables(
      paletteById(paletteId),
      activeYear,
      anchorYear,
      workspace?.accentOverride ?? null
    ) as CSSProperties
  }, [paletteId, activeYear, anchorYear, workspace?.accentOverride])

  const requestDelete = useCallback(async (category: Category) => {
    const usage = await window.jadeite.section1.categoryUsage(category.id)
    if (!usage.ok) return
    if (usage.value.entryCount === 0) {
      // A confirmation guarding nothing is theatre; there is nothing to lose.
      void useSection1Store.getState().deleteCategory(category.id)
      return
    }
    setPendingDelete({ category, usage: usage.value })
  }, [])

  const requestYearDelete = useCallback(async (year: number) => {
    const usage = await window.jadeite.section1.yearUsage(year)
    if (!usage.ok) return
    if (usage.value.categoryCount === 0 && usage.value.entryCount === 0) {
      // An empty workspace is a mistyped year; there is nothing to weigh.
      void useSection1Store.getState().deleteYear(year)
      return
    }
    setPendingYearDelete({ year, usage: usage.value })
  }, [])

  /**
   * The grid's callbacks, gathered into one object.
   *
   * They reach the renderers through the table's `meta` rather than through
   * column definitions, so a keystroke never rebuilds the table — see the note
   * at the top of Grid.tsx about what `flexRender` does with a function.
   */
  const handlers: GridHandlers = {
    onCommit: (month, categoryId, amount, isRefund, note) =>
      void useSection1Store.getState().setEntry(month, categoryId, amount, isRefund, note),
    onToggleSort: (columnId) => useSection1Store.getState().toggleSort(columnId),
    onFilter: (categoryId, filter) => useSection1Store.getState().setFilter(categoryId, filter),
    onRename: (id, name) => void useSection1Store.getState().renameCategory(id, name),
    onRetype: (id, valueType) => void useSection1Store.getState().retypeCategory(id, valueType),
    onMove: (category, delta) =>
      void useSection1Store.getState().moveCategory(category.id, category.kind, delta),
    onDelete: (category) => void requestDelete(category)
  }

  if (loading && !workspace) {
    return <section className="s1" data-testid="section1" />
  }

  return (
    <section className="s1" data-testid="section1" style={accentStyle}>
      <header className="s1-top">
        <div className="s1-years" role="tablist" aria-label={t('section1.years')}>
          {years.map((year) => (
            <span key={year} className="s1-year-slot">
              <button
                type="button"
                role="tab"
                className="s1-year-chip"
                aria-selected={year === activeYear}
                data-active={year === activeYear ? 'true' : undefined}
                data-testid={`year-${year}`}
                onClick={() => void store.selectYear(year)}
              >
                {year}
              </button>
              {year === activeYear ? (
                <button
                  type="button"
                  className="s1-year-menu-button"
                  aria-label={t('section1.yearMenu', { year })}
                  aria-expanded={yearMenuOpen}
                  data-testid="year-menu"
                  onClick={() => setYearMenuOpen((open) => !open)}
                >
                  ⋮
                </button>
              ) : null}
              {year === activeYear && yearMenuOpen ? (
                <YearMenu
                  year={year}
                  anchorYear={anchorYear}
                  palette={paletteById(paletteId)}
                  override={workspace?.accentOverride ?? null}
                  canDelete={years.length > 1}
                  onSetAccent={(accent) => void store.setAccentOverride(accent)}
                  onDelete={() => void requestYearDelete(year)}
                  onClose={() => setYearMenuOpen(false)}
                />
              ) : null}
            </span>
          ))}
          <button
            type="button"
            className="s1-year-add"
            data-testid="add-year"
            aria-label={t('section1.addYear')}
            onClick={() => setAddingYear(true)}
          >
            +
          </button>
        </div>

        <div className="s1-tools">
          {sort ? (
            <button type="button" className="s1-btn-quiet" data-testid="clear-sort" onClick={store.clearSort}>
              {t('section1.clearSort')}
            </button>
          ) : null}
          {Object.keys(filters).length > 0 ? (
            <button
              type="button"
              className="s1-btn-quiet"
              data-testid="clear-filters"
              onClick={store.clearFilters}
            >
              {t('section1.clearFilters')}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="s1-error" role="alert" data-testid="section1-error">
          {t(`section1.errors.${error}`)}
          <button type="button" className="s1-btn-quiet" onClick={store.dismissError}>
            {t('common.close')}
          </button>
        </p>
      ) : null}

      {activeYear === null ? null : (
        <div
          className="s1-pane"
          key={switchToken}
          data-direction={direction}
          data-testid={`workspace-${activeYear}`}
        >
          {workspace && workspace.categories.length === 0 ? (
            <p className="s1-empty-state" data-testid="section1-empty">
              {t('section1.noColumns')}
            </p>
          ) : (
            <Grid
              computed={computed}
              categories={workspace?.categories ?? []}
              language={language}
              sort={sort}
              filters={filters}
              handlers={handlers}
            />
          )}

          <AddColumn onAdd={(name, kind, valueType) => void store.addCategory({ name, kind, valueType })} />
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

      {pendingYearDelete ? (
        <ConfirmDeleteYear
          year={pendingYearDelete.year}
          usage={pendingYearDelete.usage}
          onCancel={() => setPendingYearDelete(null)}
          onConfirm={() => {
            const year = pendingYearDelete.year
            setPendingYearDelete(null)
            void store.deleteYear(year)
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDelete
          category={pendingDelete.category}
          usage={pendingDelete.usage}
          language={language}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.category.id
            setPendingDelete(null)
            void store.deleteCategory(id)
          }}
        />
      ) : null}
    </section>
  )
}

// --- Adding a column -------------------------------------------------------

interface AddColumnProps {
  onAdd: (name: string, kind: 'income' | 'expense', valueType: ValueType) => void
}

function AddColumn({ onAdd }: AddColumnProps): ReactElement {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'income' | 'expense'>('expense')
  const [valueType, setValueType] = useState<ValueType>('TRY')

  return (
    <form
      className="s1-add-column"
      data-testid="add-column"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onAdd(name, kind, valueType)
        setName('')
      }}
    >
      <input
        type="text"
        value={name}
        placeholder={t('section1.newColumnName')}
        aria-label={t('section1.newColumnName')}
        data-testid="new-column-name"
        onChange={(e) => setName(e.target.value)}
      />
      <select
        value={kind}
        aria-label={t('section1.group')}
        data-testid="new-column-kind"
        onChange={(e) => setKind(e.target.value as 'income' | 'expense')}
      >
        <option value="income">{t('section1.groupIncome')}</option>
        <option value="expense">{t('section1.groupExpense')}</option>
      </select>
      <select
        value={valueType}
        aria-label={t('section1.valueType')}
        data-testid="new-column-type"
        onChange={(e) => setValueType(e.target.value as ValueType)}
      >
        {VALUE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type === 'plain' ? t('section1.typePlain') : type}
          </option>
        ))}
      </select>
      <button type="submit" className="s1-btn" data-testid="add-column-submit">
        {t('section1.addColumn')}
      </button>
    </form>
  )
}

// --- Adding a year ---------------------------------------------------------

interface AddYearProps {
  years: readonly number[]
  onCancel: () => void
  onCreate: (year: number) => void
}

function AddYear({ years, onCancel, onCreate }: AddYearProps): ReactElement {
  const { t } = useTranslation()
  const suggested = (years.at(-1) ?? new Date().getFullYear()) + 1
  const [value, setValue] = useState(String(suggested))

  const year = Number.parseInt(value, 10)
  const valid =
    Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR && !years.includes(year)

  return (
    <div className="s1-modal" role="dialog" aria-modal="true" aria-label={t('section1.addYear')}>
      <div className="s1-modal-body">
        <h2>{t('section1.addYear')}</h2>
        <p className="lede">{t('section1.addYearLede')}</p>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          aria-label={t('section1.year')}
          data-testid="new-year-input"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onCreate(year)
          }}
        />
        <div className="s1-menu-row s1-menu-foot">
          <button
            type="button"
            className="s1-btn"
            disabled={!valid}
            data-testid="new-year-submit"
            onClick={() => onCreate(year)}
          >
            {t('section1.createYear')}
          </button>
          <button type="button" className="s1-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Deleting a year -------------------------------------------------------

interface ConfirmDeleteYearProps {
  year: number
  usage: YearUsage
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Removing a whole workspace.
 *
 * The warning names the reach of it deliberately. `years` is the parent of the
 * Payments tables as well, so from Realisation IV a year deleted here takes its
 * Section 2 grid with it — a dialogue that mentioned only columns would be
 * describing half of what the button does.
 */
function ConfirmDeleteYear({
  year,
  usage,
  onCancel,
  onConfirm
}: ConfirmDeleteYearProps): ReactElement {
  const { t } = useTranslation()

  return (
    <div
      className="s1-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('section1.deleteYear')}
      data-testid="confirm-delete-year"
    >
      <div className="s1-modal-body">
        <h2>{t('section1.deleteYear')}</h2>
        <p className="lede" data-testid="confirm-delete-year-detail">
          {t('section1.deleteYearDetail', {
            year,
            columns: usage.categoryCount,
            count: usage.entryCount
          })}
        </p>
        <p className="warning">
          <strong>{t('section1.deleteYearWarningTitle')}</strong>
          {t('section1.deleteYearWarningBody')}
        </p>
        <div className="s1-menu-row s1-menu-foot">
          <button
            type="button"
            className="s1-btn-danger"
            data-testid="confirm-delete-year-yes"
            onClick={onConfirm}
          >
            {t('section1.deleteYearConfirm')}
          </button>
          <button type="button" className="s1-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Deleting a column -----------------------------------------------------

interface ConfirmDeleteProps {
  category: Category
  usage: CategoryUsage
  language: 'tr' | 'en'
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Naming what is about to be destroyed.
 *
 * There is no backup until Realisation IX and no undo journal in the schema, so
 * this dialogue says how many cells and how much money go, rather than asking
 * "are you sure?" about an unspecified quantity of the owner's own records.
 */
function ConfirmDelete({
  category,
  usage,
  language,
  onCancel,
  onConfirm
}: ConfirmDeleteProps): ReactElement {
  const { t } = useTranslation()

  return (
    <div
      className="s1-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('section1.deleteColumn')}
      data-testid="confirm-delete"
    >
      <div className="s1-modal-body">
        <h2>{t('section1.deleteColumn')}</h2>
        <p className="lede" data-testid="confirm-delete-detail">
          {t('section1.deleteColumnDetail', {
            name: category.name,
            count: usage.entryCount,
            total: formatByType(usage.total, usage.valueType, language)
          })}
        </p>
        <p className="warning">
          <strong>{t('section1.deleteColumnWarningTitle')}</strong>
          {t('section1.deleteColumnWarningBody')}
        </p>
        <div className="s1-menu-row s1-menu-foot">
          <button
            type="button"
            className="s1-btn-danger"
            data-testid="confirm-delete-yes"
            onClick={onConfirm}
          >
            {t('section1.deleteColumnConfirm')}
          </button>
          <button type="button" className="s1-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}
