/**
 * The year grid — twelve month rows, the year's own columns, and the totals.
 *
 * TanStack Table is used headless: it owns row order, filtering and the header
 * group structure, and every pixel is ours. That division is the whole reason
 * it was chosen over a batteries-included grid (§3.2) — Section 1 has to look
 * like JADEITE, not like a component library.
 *
 * Nothing here computes money. The buckets and totals arrive already worked out
 * by shared/section1/engine.ts, so what the grid draws and what a later
 * consumer (Overview, the importer) computes cannot drift apart.
 *
 * One structural rule governs the file: **every renderer is declared once, at
 * module level.** `flexRender` treats a cell or header function as a React
 * component type, so a renderer defined inline in the column definitions would
 * be a brand-new component on every render — React would unmount and remount
 * the entire grid each time, and every cell would lose what the owner was
 * typing into it. Per-column and per-table data therefore travel through
 * `meta`, which may change identity freely because it is only ever props.
 */

import { useMemo, type ReactElement } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type HeaderContext,
  type SortingState
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import type { Category, Entry, ValueType } from '@shared/section1/types'
import {
  bucketOf,
  signedContribution,
  sumMonths,
  type Bucket,
  type ComputedWorkspace,
  type MonthRow
} from '@shared/section1/engine'
import type { AppLanguage } from '../../i18n/format.js'
import { monthNames } from '../../i18n/format.js'
import type { ColumnFilter, SortState } from '../../store/section1-store.js'
import { AmountCell } from './AmountCell.js'
import { ColumnHeader } from './ColumnHeader.js'
import { formatByType, glyphFor } from './format.js'

/** A category column's id, and the way back to the category it stands for. */
export const columnIdFor = (categoryId: number): string => `c${categoryId}`
const categoryIdOf = (columnId: string): number => Number.parseInt(columnId.slice(1), 10)

export interface GridHandlers {
  onCommit: (
    month: number,
    categoryId: number,
    amount: number | null,
    isRefund: boolean,
    note: string | null
  ) => void
  onToggleSort: (columnId: string) => void
  onFilter: (categoryId: number, filter: ColumnFilter | null) => void
  onRename: (id: number, name: string) => void
  onRetype: (id: number, valueType: ValueType) => void
  onMove: (category: Category, delta: number) => void
  onDelete: (category: Category) => void
}

/** Everything the renderers need that is not the row they are drawing. */
interface GridMeta {
  language: AppLanguage
  months: string[]
  computed: ComputedWorkspace
  sort: SortState | null
  filters: Record<number, ColumnFilter>
  handlers: GridHandlers
}

/** What one column is about. */
type ColumnMeta =
  | { kind: 'category'; category: Category }
  | { kind: 'subtotal' | 'net'; valueType: ValueType }

const metaOf = (context: { table: { options: { meta?: unknown } } }): GridMeta =>
  context.table.options.meta as GridMeta

const columnMetaOf = (columnDef: { meta?: unknown }): ColumnMeta => columnDef.meta as ColumnMeta

interface Props {
  computed: ComputedWorkspace
  categories: readonly Category[]
  language: AppLanguage
  sort: SortState | null
  filters: Record<number, ColumnFilter>
  handlers: GridHandlers
}

/**
 * The per-column filter (§6.2).
 *
 * Deliberately small: this exists to find a month, not to query a database.
 */
const matchesFilter: FilterFn<MonthRow> = (row, columnId, value) => {
  const filter = value as ColumnFilter
  const entry = row.original.cells.get(categoryIdOf(columnId))

  // The comparators read the signed contribution, the same number the column
  // sorts by and totals to. Comparing the stored magnitude instead would let
  // one column mean two different things to two view tools: a refund of
  // 300,00 ₺ would satisfy "at least 300,00" while sorting and summing as
  // −300,00.
  const contribution = entry ? signedContribution(entry) : null

  switch (filter.mode) {
    case 'empty':
      return entry === undefined
    case 'filled':
      return entry !== undefined
    case 'refund':
      return entry?.isRefund === true
    case 'atLeast':
      return contribution !== null && filter.threshold !== null && contribution >= filter.threshold
    case 'atMost':
      return contribution !== null && filter.threshold !== null && contribution <= filter.threshold
    case 'all':
    default:
      return true
  }
}

// --- Renderers, each declared exactly once ---------------------------------

function MonthNameCell(context: CellContext<MonthRow, unknown>): ReactElement {
  const { months } = metaOf(context)
  return <span className="s1-month">{months[context.row.original.month - 1] ?? ''}</span>
}

function CategoryCell(context: CellContext<MonthRow, unknown>): ReactElement {
  const meta = metaOf(context)
  const column = columnMetaOf(context.column.columnDef)
  const row = context.row.original
  if (column.kind !== 'category') return <span />

  const category = column.category
  return (
    <AmountCell
      entry={row.cells.get(category.id) as Entry | undefined}
      valueType={category.valueType}
      language={meta.language}
      columnName={category.name}
      monthName={meta.months[row.month - 1] ?? String(row.month)}
      onCommit={(amount, isRefund, note) =>
        meta.handlers.onCommit(row.month, category.id, amount, isRefund, note)
      }
    />
  )
}

function CategoryHeader(context: HeaderContext<MonthRow, unknown>): ReactElement {
  const meta = metaOf(context)
  const column = columnMetaOf(context.column.columnDef)
  if (column.kind !== 'category') return <span />

  const category = column.category
  return (
    <ColumnHeader
      category={category}
      columnId={context.column.id}
      language={meta.language}
      sort={meta.sort}
      filter={meta.filters[category.id] ?? null}
      onToggleSort={meta.handlers.onToggleSort}
      onFilter={meta.handlers.onFilter}
      onRename={meta.handlers.onRename}
      onRetype={meta.handlers.onRetype}
      onMove={meta.handlers.onMove}
      onDelete={meta.handlers.onDelete}
    />
  )
}

function CategoryFooter(context: HeaderContext<MonthRow, unknown>): ReactElement {
  const meta = metaOf(context)
  const column = columnMetaOf(context.column.columnDef)
  if (column.kind !== 'category') return <span />

  const category = column.category
  const total = meta.computed.categoryTotals.get(category.id) ?? 0
  return (
    <span className="s1-num" data-testid={`year-total-${category.name}`}>
      {formatByType(total, category.valueType, meta.language)}
    </span>
  )
}

/**
 * A TOTAL-group header.
 *
 * Sortable like any other column, because "which month was worst?" is a real
 * question and §6.2 grants sorting per column. It carries no menu: a computed
 * column has nothing to rename, retype, reorder or delete.
 */
function TotalHeader(context: HeaderContext<MonthRow, unknown>): ReactElement {
  const meta = metaOf(context)
  const column = columnMetaOf(context.column.columnDef)
  const { t } = useTranslation()
  if (column.kind === 'category') return <span />

  const columnId = context.column.id
  const sorted = meta.sort?.columnId === columnId
  const suffix = meta.computed.valueTypesInUse.length > 1 ? ` ${glyphFor(column.valueType)}` : ''
  const label =
    (column.kind === 'subtotal' ? t('section1.incomeSubtotal') : t('section1.netTotal')) + suffix

  return (
    <div className="s1-header">
      <button
        type="button"
        className="s1-header-name"
        data-sorted={sorted ? 'true' : undefined}
        // Deliberately not the `header-` prefix the year's own columns use: a
        // computed column is not one of the owner's, and counting the year's
        // columns must not pick these up.
        data-testid={`total-header-${columnId}`}
        title={t('section1.sortHint')}
        onClick={() => meta.handlers.onToggleSort(columnId)}
      >
        <span className="s1-header-text">{label}</span>
        <span className="s1-sort-mark" aria-hidden="true">
          {sorted ? (meta.sort?.descending ? '▾' : '▴') : ''}
        </span>
      </button>
    </div>
  )
}

function TotalCell(context: CellContext<MonthRow, unknown>): ReactElement {
  const meta = metaOf(context)
  const column = columnMetaOf(context.column.columnDef)
  if (column.kind === 'category') return <span />

  const bucket = bucketOf(context.row.original.buckets, column.valueType)
  const value = column.kind === 'subtotal' ? bucket.income : bucket.net
  return (
    <NumberSpan
      value={value}
      valueType={column.valueType}
      language={meta.language}
      net={column.kind === 'net'}
      testId={`${column.kind === 'subtotal' ? 'subtotal' : 'net'}-${column.valueType}-${context.row.original.month}`}
    />
  )
}

function TotalFooter(context: HeaderContext<MonthRow, unknown>): ReactElement {
  const meta = metaOf(context)
  const column = columnMetaOf(context.column.columnDef)
  if (column.kind === 'category') return <span />

  const bucket = bucketOf(meta.computed.yearBuckets, column.valueType)
  const value = column.kind === 'subtotal' ? bucket.income : bucket.net
  return (
    <NumberSpan
      value={value}
      valueType={column.valueType}
      language={meta.language}
      net={column.kind === 'net'}
      testId={`year-${column.kind === 'subtotal' ? 'subtotal' : 'net'}-${column.valueType}`}
    />
  )
}

function NumberSpan({
  value,
  valueType,
  language,
  net,
  testId
}: {
  value: number
  valueType: ValueType
  language: AppLanguage
  net: boolean
  testId: string
}): ReactElement {
  return (
    <span
      className={net ? 's1-num s1-net' : 's1-num'}
      data-negative={net && value < 0 ? 'true' : undefined}
      data-testid={testId}
    >
      {formatByType(value, valueType, language)}
    </span>
  )
}

// --- The grid --------------------------------------------------------------

export function Grid({
  computed,
  categories,
  language,
  sort,
  filters,
  handlers
}: Props): ReactElement {
  const { t } = useTranslation()
  const months = useMemo(() => monthNames(language), [language])

  /**
   * Column definitions depend only on the *shape* of the year — which columns
   * exist and which value types are in use. They deliberately do not depend on
   * the amounts, on the sort, or on the handlers: all of that reaches the
   * renderers through `meta`, so typing into a cell never rebuilds the table.
   */
  const columns = useMemo<ColumnDef<MonthRow, unknown>[]>(() => {
    const helper = createColumnHelper<MonthRow>()

    const monthColumn = helper.accessor((row) => row.month, {
      id: 'month',
      header: () => t('section1.month'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: MonthNameCell
    }) as ColumnDef<MonthRow, unknown>

    const categoryColumn = (category: Category): ColumnDef<MonthRow, unknown> =>
      helper.accessor(
        (row) => {
          const entry = row.cells.get(category.id)
          // `undefined`, not null: that is what `sortUndefined` recognises, and
          // an empty cell must sort to the end whichever way the column points
          // rather than pretend to be a very small number.
          return entry ? signedContribution(entry) : undefined
        },
        {
          id: columnIdFor(category.id),
          meta: { kind: 'category', category } satisfies ColumnMeta,
          filterFn: matchesFilter,
          sortUndefined: 'last',
          header: CategoryHeader,
          cell: CategoryCell,
          footer: CategoryFooter
        }
      ) as ColumnDef<MonthRow, unknown>

    const income = categories.filter((c) => c.kind === 'income')
    const expense = categories.filter((c) => c.kind === 'expense')

    /**
     * The TOTAL group: an income-subtotal and a net column for each value type
     * the year actually uses. An all-lira year — the ordinary case — gets
     * exactly the two columns §6.2 draws.
     */
    const totalColumns = computed.valueTypesInUse.flatMap(
      (valueType): ColumnDef<MonthRow, unknown>[] => {
        return [
          helper.accessor((row) => bucketOf(row.buckets, valueType).income, {
            id: `subtotal-${valueType}`,
            meta: { kind: 'subtotal', valueType } satisfies ColumnMeta,
            enableColumnFilter: false,
            header: TotalHeader,
            cell: TotalCell,
            footer: TotalFooter
          }) as ColumnDef<MonthRow, unknown>,
          helper.accessor((row) => bucketOf(row.buckets, valueType).net, {
            id: `net-${valueType}`,
            meta: { kind: 'net', valueType } satisfies ColumnMeta,
            enableColumnFilter: false,
            header: TotalHeader,
            cell: TotalCell,
            footer: TotalFooter
          }) as ColumnDef<MonthRow, unknown>
        ]
      }
    )

    const groups: ColumnDef<MonthRow, unknown>[] = [monthColumn]

    if (income.length > 0) {
      groups.push(
        helper.group({
          id: 'group-income',
          header: () => t('section1.groupIncome'),
          columns: income.map(categoryColumn)
        }) as ColumnDef<MonthRow, unknown>
      )
    }
    if (expense.length > 0) {
      groups.push(
        helper.group({
          id: 'group-expense',
          header: () => t('section1.groupExpense'),
          columns: expense.map(categoryColumn)
        }) as ColumnDef<MonthRow, unknown>
      )
    }
    if (totalColumns.length > 0) {
      groups.push(
        helper.group({
          id: 'group-total',
          header: () => t('section1.groupTotal'),
          columns: totalColumns
        }) as ColumnDef<MonthRow, unknown>
      )
    }

    return groups
  }, [categories, computed.valueTypesInUse, t])

  const sorting = useMemo<SortingState>(
    () => (sort ? [{ id: sort.columnId, desc: sort.descending }] : []),
    [sort]
  )

  const columnFilters = useMemo<ColumnFiltersState>(
    () =>
      Object.entries(filters).map(([categoryId, filter]) => ({
        id: columnIdFor(Number(categoryId)),
        value: filter
      })),
    [filters]
  )

  const meta: GridMeta = { language, months, computed, sort, filters, handlers }

  const table = useReactTable({
    data: computed.months as MonthRow[],
    columns,
    state: { sorting, columnFilters },
    meta,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  })

  const rows = table.getRowModel().rows
  const filtering = columnFilters.length > 0
  const selection = useMemo(
    () => (filtering ? sumMonths(rows.map((r) => r.original), computed.valueTypesInUse) : null),
    [filtering, rows, computed.valueTypesInUse]
  )

  return (
    <div className="s1-grid-scroll">
      <table className="s1-grid" data-testid="section1-grid">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  data-group={header.column.parent?.id ?? header.column.id}
                  className={header.isPlaceholder ? 's1-th-empty' : undefined}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`month-row-${row.original.month}`}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} data-group={cell.column.parent?.id ?? cell.column.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={table.getAllLeafColumns().length} className="s1-empty">
                {t('section1.noRowsMatch')}
              </td>
            </tr>
          ) : null}
        </tbody>

        <tfoot>
          {/*
            A filtered view gets its own line. The year's own figure below is
            never narrowed to the filter: a total whose range silently disagrees
            with its label is the defect this whole application was written
            against.
          */}
          {selection ? (
            <tr className="s1-selection" data-testid="selection-row">
              <th scope="row">{t('section1.selection', { count: rows.length })}</th>
              {table
                .getAllLeafColumns()
                .filter((c) => c.id !== 'month')
                .map((column) => (
                  <td key={column.id} data-group={column.parent?.id ?? column.id}>
                    {renderSelectionCell(column.id, rows, selection, language, categories)}
                  </td>
                ))}
            </tr>
          ) : null}

          <tr className="s1-year-total" data-testid="year-summary-row">
            <th scope="row">{t('section1.yearTotal')}</th>
            {/*
              getFooterGroups() is getHeaderGroups() reversed, so its first
              entry is the leaf row — the one with a footer per column. The last
              entry is the group band, which has none.
            */}
            {table
              .getFooterGroups()[0]
              ?.headers.filter((h) => h.column.id !== 'month')
              .map((header) => (
                <td key={header.id} data-group={header.column.parent?.id ?? header.column.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.footer, header.getContext())}
                </td>
              ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** The visible-months figure for one column, shown only while a filter is on. */
function renderSelectionCell(
  columnId: string,
  rows: { original: MonthRow }[],
  selection: readonly Bucket[],
  language: AppLanguage,
  categories: readonly Category[]
): ReactElement | null {
  if (columnId.startsWith('c')) {
    const categoryId = categoryIdOf(columnId)
    const category = categories.find((c) => c.id === categoryId)
    if (!category) return null
    let total = 0
    for (const row of rows) {
      const entry = row.original.cells.get(categoryId)
      if (entry) total += signedContribution(entry)
    }
    return <span className="s1-num">{formatByType(total, category.valueType, language)}</span>
  }

  const subtotal = columnId.startsWith('subtotal-')
  const net = columnId.startsWith('net-')
  if (!subtotal && !net) return null

  const valueType = columnId.slice(subtotal ? 'subtotal-'.length : 'net-'.length) as ValueType
  const bucket = bucketOf(selection, valueType)
  const value = subtotal ? bucket.income : bucket.net
  return <span className="s1-num">{formatByType(value, valueType, language)}</span>
}
