/**
 * A column header: its name, its sort state, its filter, and its own menu.
 *
 * Column management lives here rather than in a separate settings screen
 * because a column is edited while looking at it. Renaming, retyping,
 * reordering and deleting are all per-year operations — each year owns its
 * column set (§6.2), so nothing done here can reach a previous year.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Category, ValueType } from '@shared/section1/types'
import { VALUE_TYPES } from '@shared/section1/types'
import { parseAmount } from '@shared/money'
import type { AppLanguage } from '../../i18n/format.js'
import type { ColumnFilter, FilterMode, SortState } from '../../store/section1-store.js'

interface Props {
  category: Category
  /** This column's id in the grid, which is what the sort state is keyed by. */
  columnId: string
  language: AppLanguage
  sort: SortState | null
  filter: ColumnFilter | null
  onToggleSort: (columnId: string) => void
  onFilter: (categoryId: number, filter: ColumnFilter | null) => void
  onRename: (id: number, name: string) => void
  onRetype: (id: number, valueType: ValueType) => void
  onMove: (category: Category, delta: number) => void
  onDelete: (category: Category) => void
}

const NUMERIC_MODES: readonly FilterMode[] = ['atLeast', 'atMost']

export function ColumnHeader({
  category,
  columnId,
  language,
  sort,
  filter,
  onToggleSort,
  onFilter,
  onRename,
  onRetype,
  onMove,
  onDelete
}: Props): ReactElement {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [draftName, setDraftName] = useState(category.name)
  const [threshold, setThreshold] = useState('')

  const sorted = sort?.columnId === columnId
  const direction = !sorted ? 'none' : sort.descending ? 'descending' : 'ascending'

  return (
    <div className="s1-header" data-filtered={filter ? 'true' : undefined}>
      <button
        type="button"
        className="s1-header-name"
        // The sort state belongs in the button's own name: aria-sort is an
        // attribute of the column header cell, not of a control inside it.
        aria-label={`${category.name} — ${t(`section1.sortState.${direction}`)}`}
        data-sorted={sorted ? 'true' : undefined}
        data-testid={`header-${category.name}`}
        title={t('section1.sortHint')}
        onClick={() => onToggleSort(columnId)}
      >
        <span className="s1-header-text">{category.name}</span>
        <span className="s1-sort-mark" aria-hidden="true">
          {sorted ? (sort.descending ? '▾' : '▴') : ''}
        </span>
      </button>

      <button
        type="button"
        className="s1-header-menu"
        aria-label={t('section1.columnMenu', { name: category.name })}
        aria-expanded={menuOpen}
        data-testid={`column-menu-${category.name}`}
        onClick={() => {
          setDraftName(category.name)
          setMenuOpen((open) => !open)
        }}
      >
        ⋮
      </button>

      {menuOpen ? (
        <div className="s1-menu" role="dialog" aria-label={t('section1.columnMenuTitle')}>
          <label className="s1-field-label" htmlFor={`rename-${category.id}`}>
            {t('section1.rename')}
          </label>
          <input
            id={`rename-${category.id}`}
            type="text"
            value={draftName}
            data-testid={`rename-input-${category.name}`}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (draftName.trim() && draftName.trim() !== category.name) {
                  onRename(category.id, draftName)
                }
                setMenuOpen(false)
              }
            }}
          />

          <label className="s1-field-label" htmlFor={`type-${category.id}`}>
            {t('section1.valueType')}
          </label>
          <select
            id={`type-${category.id}`}
            value={category.valueType}
            data-testid={`retype-${category.name}`}
            onChange={(e) => onRetype(category.id, e.target.value as ValueType)}
          >
            {VALUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === 'plain' ? t('section1.typePlain') : type}
              </option>
            ))}
          </select>

          <div className="s1-menu-row">
            <button
              type="button"
              className="s1-btn-quiet"
              data-testid={`move-left-${category.name}`}
              onClick={() => onMove(category, -1)}
            >
              ← {t('section1.moveLeft')}
            </button>
            <button
              type="button"
              className="s1-btn-quiet"
              data-testid={`move-right-${category.name}`}
              onClick={() => onMove(category, 1)}
            >
              {t('section1.moveRight')} →
            </button>
          </div>

          <label className="s1-field-label" htmlFor={`filter-${category.id}`}>
            {t('section1.filter')}
          </label>
          <select
            id={`filter-${category.id}`}
            value={filter?.mode ?? 'all'}
            data-testid={`filter-${category.name}`}
            onChange={(e) => {
              const mode = e.target.value as FilterMode
              if (mode === 'all') {
                onFilter(category.id, null)
                return
              }
              const parsed = parseAmount(threshold, language)
              onFilter(category.id, {
                mode,
                threshold: parsed.kind === 'amount' ? parsed.minorUnits : null
              })
            }}
          >
            {(['all', 'filled', 'empty', 'refund', 'atLeast', 'atMost'] as FilterMode[]).map(
              (mode) => (
                <option key={mode} value={mode}>
                  {t(`section1.filterMode.${mode}`)}
                </option>
              )
            )}
          </select>

          {filter && NUMERIC_MODES.includes(filter.mode) ? (
            <input
              type="text"
              inputMode="decimal"
              value={threshold}
              aria-label={t('section1.filterThreshold')}
              data-testid={`filter-threshold-${category.name}`}
              onChange={(e) => {
                setThreshold(e.target.value)
                const parsed = parseAmount(e.target.value, language)
                onFilter(category.id, {
                  mode: filter.mode,
                  threshold: parsed.kind === 'amount' ? parsed.minorUnits : null
                })
              }}
            />
          ) : null}

          <div className="s1-menu-row s1-menu-foot">
            <button
              type="button"
              className="s1-btn-danger"
              data-testid={`delete-${category.name}`}
              onClick={() => {
                setMenuOpen(false)
                onDelete(category)
              }}
            >
              {t('section1.deleteColumn')}
            </button>
            <button type="button" className="s1-btn-quiet" onClick={() => setMenuOpen(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
