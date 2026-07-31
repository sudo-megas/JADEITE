/**
 * The Payments grid — twelve month lines, the year's bank columns, and the
 * five figures §7.1 asks for.
 *
 * TanStack Table is used headless, as in Section 1, and the same structural
 * rule governs the file: **every renderer passed to `flexRender` is declared
 * once, at module level.** `flexRender` treats such a function as a React
 * component type, so one defined inline would be a brand-new component on every
 * render and the whole grid would remount, losing whatever was being typed.
 *
 * Three of the grid's six bars are not TanStack's, and that is deliberate.
 * TanStack yields exactly one header row per level of the column tree, so the
 * Credit Limit row (§7.1 top bar 2) would need a third nesting level — which
 * renders in the wrong order, points every `column.parent` at a synthetic
 * wrapper, and encodes an editable data row as table structure. It and the two
 * lower footer rows are written by hand over `getVisibleLeafColumns()`, the
 * same technique Section 1's selection row already uses.
 *
 * GRAND TOTAL DEBT needs no special case at all: it is the footer of the TOTAL
 * DEBT column, which lands on the DEBT row by construction — the intersection
 * §7.1 describes, for free.
 *
 * Nothing here computes money. Every figure arrives worked out by
 * shared/section2/engine.ts.
 */

import { useMemo, type ReactElement, type ReactNode } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type HeaderContext
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import type { Bank } from '@shared/section2/types'
import type { ComputedGrid, MonthLine } from '@shared/section2/engine'
import type { AppLanguage } from '../../i18n/format.js'
import { monthNames } from '../../i18n/format.js'
import { AmountCell } from './AmountCell.js'
import { BankHeader } from './BankHeader.js'
import { formatTry } from './format.js'

/** A bank column's id, and the way back to the column it stands for. */
export const columnIdFor = (bankId: number): string => `b${bankId}`

export interface GridHandlers {
  onCommitCell: (month: number, bankId: number, amount: number | null) => void
  onSetLimit: (id: number, limit: number) => void
  onSetParty: (id: number, party: string | null) => void
  onRename: (id: number, name: string) => void
  onMove: (bank: Bank, delta: number) => void
  onDelete: (bank: Bank) => void
}

interface GridMeta {
  language: AppLanguage
  months: string[]
  computed: ComputedGrid
  handlers: GridHandlers
}

type ColumnMeta = { kind: 'month' } | { kind: 'bank'; bank: Bank } | { kind: 'total' }

const metaOf = (context: { table: { options: { meta?: unknown } } }): GridMeta =>
  context.table.options.meta as GridMeta

const columnMetaOf = (columnDef: { meta?: unknown }): ColumnMeta => columnDef.meta as ColumnMeta

const helper = createColumnHelper<MonthLine>()

// --- Module-level renderers -------------------------------------------------

function MonthNameCell(context: CellContext<MonthLine, unknown>): ReactElement {
  const { months } = metaOf(context)
  return <span className="s2-month">{months[context.row.original.month - 1] ?? ''}</span>
}

function BankHeaderCell(context: HeaderContext<MonthLine, unknown>): ReactElement {
  const { handlers } = metaOf(context)
  const meta = columnMetaOf(context.column.columnDef)
  if (meta.kind !== 'bank') return <span />
  return (
    <BankHeader
      bank={meta.bank}
      onRename={handlers.onRename}
      onMove={handlers.onMove}
      onDelete={handlers.onDelete}
    />
  )
}

function BankAmountCell(context: CellContext<MonthLine, unknown>): ReactElement {
  const { language, months, handlers } = metaOf(context)
  const meta = columnMetaOf(context.column.columnDef)
  if (meta.kind !== 'bank') return <span />

  const line = context.row.original
  const monthName = months[line.month - 1] ?? String(line.month)
  const cell = line.cells.get(meta.bank.id)

  return (
    <AmountCell
      value={cell ? cell.amount : null}
      language={language}
      label={`${monthName} · ${meta.bank.name}`}
      testId={`s2-cell-${meta.bank.name}-${monthName}`}
      onCommit={(amount) => handlers.onCommitCell(line.month, meta.bank.id, amount)}
    />
  )
}

/** The DEBT row (§7.1 bottom bar 1), one cell per column. */
function BankFooterCell(context: HeaderContext<MonthLine, unknown>): ReactElement {
  const { language, computed } = metaOf(context)
  const meta = columnMetaOf(context.column.columnDef)
  if (meta.kind !== 'bank') return <span />

  const column = computed.columns.find((candidate) => candidate.bank.id === meta.bank.id)
  return (
    <span className="s2-num" data-testid={`s2-debt-${meta.bank.name}`}>
      {formatTry(column?.debt ?? 0, language)}
    </span>
  )
}

function TotalDebtHeader(context: HeaderContext<MonthLine, unknown>): ReactElement {
  const { t } = useTranslation()
  void context
  return (
    <span className="s2-header-text" data-testid="s2-header-total-debt">
      {t('section2.totalDebt')}
    </span>
  )
}

/**
 * The TOTAL DEBT cell, with the restrained magnitude bar of §7.2.
 *
 * The bar is scaled by the largest month of the year, computed once in the
 * engine, so the component never decides what "big" means. A negative month —
 * counters exceeding the cards — reads in the success colour, because money
 * coming back is not debt.
 */
function TotalDebtCell(context: CellContext<MonthLine, unknown>): ReactElement {
  const { language, computed } = metaOf(context)
  const line = context.row.original
  const fraction =
    computed.peakMonthDebt === 0 ? 0 : Math.abs(line.totalDebt) / computed.peakMonthDebt

  return (
    <span
      className="s2-total"
      data-sign={line.totalDebt < 0 ? 'negative' : undefined}
      data-testid={`s2-total-debt-${line.month}`}
    >
      <span className="s2-bar" style={{ width: `${(fraction * 100).toFixed(2)}%` }} aria-hidden="true" />
      <span className="s2-num">{formatTry(line.totalDebt, language)}</span>
    </span>
  )
}

/** GRAND TOTAL DEBT — the DEBT row × TOTAL DEBT column intersection. */
function TotalDebtFooter(context: HeaderContext<MonthLine, unknown>): ReactElement {
  const { language, computed } = metaOf(context)
  return (
    <span className="s2-num s2-grand" data-testid="s2-grand-total-debt">
      {formatTry(computed.grandTotalDebt, language)}
    </span>
  )
}

// --- The grid ---------------------------------------------------------------

interface Props {
  computed: ComputedGrid
  language: AppLanguage
  handlers: GridHandlers
}

export function Grid({ computed, language, handlers }: Props): ReactElement {
  const { t } = useTranslation()
  const months = useMemo(() => monthNames(language), [language])

  const banks = computed.banks.map((column) => column.bank)
  const counters = computed.counters.map((column) => column.bank)

  // Depends on the grid's *shape* only — never on amounts or handlers, which
  // travel through meta and may change identity freely.
  const shape = computed.columns.map((column) => `${column.bank.id}:${column.bank.name}`).join(',')

  const columns = useMemo(() => {
    const bankColumn = (bank: Bank): ColumnDef<MonthLine, unknown> =>
      helper.accessor((row) => row.cells.get(bank.id)?.amount, {
        id: columnIdFor(bank.id),
        meta: { kind: 'bank', bank } satisfies ColumnMeta,
        enableSorting: false,
        enableColumnFilter: false,
        header: BankHeaderCell,
        cell: BankAmountCell,
        footer: BankFooterCell
      }) as ColumnDef<MonthLine, unknown>

    const tree: ColumnDef<MonthLine, unknown>[] = [
      helper.accessor((row) => row.month, {
        id: 'month',
        meta: { kind: 'month' } satisfies ColumnMeta,
        enableSorting: false,
        enableColumnFilter: false,
        header: () => t('section2.month'),
        cell: MonthNameCell
      }) as ColumnDef<MonthLine, unknown>
    ]

    if (banks.length > 0) {
      tree.push(
        helper.group({
          id: 'group-banks',
          header: () => t('section2.groupBanks'),
          columns: banks.map(bankColumn)
        }) as ColumnDef<MonthLine, unknown>
      )
    }

    tree.push(
      helper.accessor((row) => row.totalDebt, {
        id: 'total-debt',
        meta: { kind: 'total' } satisfies ColumnMeta,
        enableSorting: false,
        enableColumnFilter: false,
        header: TotalDebtHeader,
        cell: TotalDebtCell,
        footer: TotalDebtFooter
      }) as ColumnDef<MonthLine, unknown>
    )

    // §7.1 places counter columns after TOTAL DEBT, and so do we.
    if (counters.length > 0) {
      tree.push(
        helper.group({
          id: 'group-counters',
          header: () => t('section2.groupCounters'),
          columns: counters.map(bankColumn)
        }) as ColumnDef<MonthLine, unknown>
      )
    }

    return tree
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, t])

  const meta: GridMeta = { language, months, computed, handlers }

  const table = useReactTable({
    data: computed.months as MonthLine[],
    columns,
    meta,
    getCoreRowModel: getCoreRowModel()
  })

  const leaves = table.getVisibleLeafColumns()

  /**
   * Top bar row 2 (§7.1): a card's credit limit, or a counter column's person.
   *
   * One row, two meanings, because that is what the section says: the counter
   * column has no limit to state, so its second row names whose money it is.
   */
  const limitCell = (columnId: string): ReactNode => {
    const column = computed.columns.find((candidate) => columnIdFor(candidate.bank.id) === columnId)
    if (!column) return null
    const bank = column.bank

    if (bank.isCounter) {
      return (
        <input
          className="s2-party-input"
          type="text"
          aria-label={t('section2.counterPartyOf', { name: bank.name })}
              defaultValue={bank.counterParty ?? ''}
          key={`${bank.id}:${bank.counterParty ?? ''}`}
          data-testid={`s2-party-${bank.name}`}
          onBlur={(e) => {
            const next = e.target.value.trim()
            if (next === (bank.counterParty ?? '')) return
            handlers.onSetParty(bank.id, next.length === 0 ? null : next)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )
    }

    return (
      <AmountCell
        value={bank.creditLimit}
        language={language}
        label={t('section2.creditLimitOf', { name: bank.name })}
        testId={`s2-limit-${bank.name}`}
          // A card always has a limit; clearing the field means zero, not absence.
        onCommit={(amount) => handlers.onSetLimit(bank.id, amount ?? 0)}
      />
    )
  }

  /** Bottom bar row 2 (§7.1): limit − debt, for cards only. */
  const remainingCell = (columnId: string): ReactNode => {
    const column = computed.columns.find((candidate) => columnIdFor(candidate.bank.id) === columnId)
    if (!column || column.remaining === null) return null
    return (
      <span
        className="s2-num"
        data-negative={column.remaining < 0 ? 'true' : undefined}
        data-testid={`s2-remaining-${column.bank.name}`}
      >
        {formatTry(column.remaining, language)}
      </span>
    )
  }

  return (
    <div className="s2-grid-scroll">
      <table className="s2-grid" data-testid="section2-grid">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  data-group={header.column.parent?.id ?? header.column.id}
                  className={header.isPlaceholder ? 's2-th-empty' : undefined}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}

          <tr className="s2-limit-row" data-testid="s2-limit-row">
            <th scope="row">{t('section2.creditLimit')}</th>
            {leaves
              .filter((column) => column.id !== 'month')
              .map((column) => (
                <td key={column.id} data-group={column.parent?.id ?? column.id}>
                  {limitCell(column.id)}
                </td>
              ))}
          </tr>
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              data-state={row.original.state}
              data-testid={`s2-month-row-${row.original.month}`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} data-group={cell.column.parent?.id ?? cell.column.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        <tfoot>
          {/*
            The DEBT row. GRAND TOTAL DEBT is the TOTAL DEBT column's own
            footer, so the intersection §7.1 names needs no code of its own.
          */}
          <tr className="s2-debt-row" data-testid="s2-debt-row">
            <th scope="row">{t('section2.debt')}</th>
            {table
              .getFooterGroups()[0]
              ?.headers.filter((header) => header.column.id !== 'month')
              .map((header) => (
                <td
                  key={header.id}
                  data-group={header.column.parent?.id ?? header.column.id}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.footer, header.getContext())}
                </td>
              ))}
          </tr>

          <tr className="s2-remaining-row" data-testid="s2-remaining-row">
            <th scope="row">{t('section2.remainingLimit')}</th>
            {leaves
              .filter((column) => column.id !== 'month')
              .map((column) => (
                <td key={column.id} data-group={column.parent?.id ?? column.id}>
                  {remainingCell(column.id)}
                </td>
              ))}
          </tr>

          <tr className="s2-total-remaining-row" data-testid="s2-total-remaining-row">
            <th scope="row">{t('section2.totalRemainingLimit')}</th>
            <td colSpan={Math.max(1, leaves.length - 1)}>
              <span className="s2-num s2-grand" data-testid="s2-total-remaining-limit">
                {formatTry(computed.totalRemainingLimit, language)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
