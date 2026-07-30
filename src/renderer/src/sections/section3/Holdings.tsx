/**
 * 3b — holdings, and §8.6's two bases side by side.
 *
 * Nothing here is entered and nothing here is stored. Every figure is derived from
 * the ledger and the manual prices on each read, which is the point: the two
 * documents this replaces each maintained their own totals, and the totals
 * disagreed by a car.
 *
 * Cost and market are always both visible, with the difference between them named
 * as unrealised gain or loss — §8.6's "exactly should". In the state that prompted
 * it, the two source documents showed ₺188.000 and ₺195.150 and never explained
 * the ₺7.150 between them. This page is the explanation.
 *
 * ---
 *
 * **The live column (§14, §8.5).** A seventh column arrived with Realisation VII
 * and it changed nothing that was already here. Market value and unrealised gain
 * are computed from the price the owner typed, exactly as before; the provider's
 * figure sits *beside* that number and never over it, which is the whole of
 * §8.5's ruling and the reason the column is seventh rather than instead.
 *
 * Four decisions are worth more than the markup.
 *
 * **It shows a value, not a price.** 3c is where the two *unit prices* sit side
 * by side; a unit price repeated here would be comparable to nothing on the row.
 * What 3b can say that 3c cannot is what the holding itself would be worth at the
 * source's figure, so that is the column — the same quantity, the other price.
 * The arithmetic is the engine's own `transactionValue` rather than a second
 * multiplication written here, so the two money columns cannot come to disagree
 * about a rounding.
 *
 * **The live figures are read from the store rather than passed in.** Threading
 * them through `Section3.tsx` was the first draft and was rejected: that file is
 * being edited by another hand this rung, and a column that reads "Sağlayıcı yok"
 * until somebody else adds a prop is a feature that ships broken. `AltinEgrisi`
 * already subscribes to this store directly for the same reason. Reading
 * `lastFetch` from the same place is what lets this page tell the two absences
 * apart exactly as 3c does, instead of guessing from whether any live row exists
 * at all — a fetch that answered and quoted nothing is precisely the case that
 * guess would get wrong.
 *
 * **The provider is named per row, from the row's own snapshot.** Never from
 * `lastFetch.provider`: after a provider swap whose first fetch failed, the fetch
 * record names the new provider while every stored price still belongs to the
 * old one, and a label taken from the record would credit the mock with
 * haremaltin's prices.
 *
 * **The totals leave the live cell empty.** A live grand total would sum only the
 * holdings the source happens to quote, and printing it beside a market value
 * summed over the holdings the *owner* has priced puts two different baskets
 * under one heading. `pricedCostBasis` exists in the engine because §8.6's
 * comparison has to be like-for-like; honouring that here would need a matching
 * manual subtotal beside it, which is an eighth column §8.6 does not ask for.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { driftState } from '@shared/section3/drift'
import type { Holding, HoldingsView } from '@shared/section3/engine'
import type {
  LivePrice,
  ManualPrice,
  Person,
  QuantityUnit,
  TypeCode,
  ValuableType
} from '@shared/section3/types'
import { transactionValue } from '@shared/section3/units'
import type { Palette } from '@shared/theme/types'
import type { AppLanguage } from '../../i18n/format.js'
import { useSection3Store } from '../../store/section3-store.js'
import { formatQuantity, formatTry, personAccent } from './format.js'

interface Props {
  view: HoldingsView
  types: readonly ValuableType[]
  language: AppLanguage
  palette: Palette
}

const NO_LIVE_PRICES: readonly LivePrice[] = Object.freeze([])
const NO_MANUAL_PRICES: readonly ManualPrice[] = Object.freeze([])

export function Holdings({ view, types, language, palette }: Props): ReactElement {
  const { t } = useTranslation()
  const livePrices = useSection3Store((s) => s.data?.livePrices) ?? NO_LIVE_PRICES
  const manualPrices = useSection3Store((s) => s.data?.manualPrices) ?? NO_MANUAL_PRICES
  const lastFetch = useSection3Store((s) => s.data?.lastFetch) ?? null

  const unitOf: ReadonlyMap<TypeCode, QuantityUnit> = new Map(
    types.map((type) => [type.code, type.unit])
  )
  const liveByCode: ReadonlyMap<TypeCode, LivePrice> = new Map(
    livePrices.map((price) => [price.typeCode, price])
  )
  /**
   * The typed prices, for the drift comparison alone — never for a figure on
   * this page. Every money column here still comes from the engine, which was
   * handed the same prices and did the arithmetic once (§8.5).
   */
  const manualByCode: ReadonlyMap<TypeCode, number> = new Map(
    manualPrices.map((price) => [price.typeCode, price.value])
  )

  /**
   * Whether the provider has ever answered — the same test `Prices.tsx` makes,
   * for the same reason. An attempt proves nothing: an offline one would
   * otherwise have every row claim the source declines to quote it, when in
   * truth the source was never reached.
   */
  const everAnswered = lastFetch !== null && lastFetch.succeededAt !== null

  if (view.byPerson.length === 0) {
    return (
      <p className="s3-empty-state" data-testid="s3-holdings-empty">
        {t('section3.noHoldings')}
      </p>
    )
  }

  return (
    <div className="s3-holdings" data-testid="s3-holdings">
      {/*
        The discrepancy indicator §8.4 asks for. It has exactly one cause: the
        ledger disposes of more of something than it records acquiring. During the
        typing sessions of §18.5 that is the expected state until the purchases
        before a disposal have all been entered, so it explains itself rather than
        merely flagging.
      */}
      {view.discrepancies.length > 0 ? (
        <p className="s3-discrepancy" role="status" data-testid="s3-discrepancy">
          <strong>{t('section3.discrepancyTitle')}</strong>
          <span className="lede">
            {t('section3.discrepancyBody', { count: view.discrepancies.length })}
          </span>
        </p>
      ) : null}

      {view.missingPrices.length > 0 ? (
        <p className="s3-note" role="status" data-testid="s3-missing-prices">
          {t('section3.missingPrices', {
            types: view.missingPrices.map((code) => t(`section3.types.${code}`)).join(', ')
          })}
        </p>
      ) : null}

      <table className="s3-holdings-table">
        <thead>
          <tr>
            <th scope="col">{t('section3.person')}</th>
            <th scope="col">{t('section3.type')}</th>
            <th scope="col" className="s3-figure">
              {t('section3.quantity')}
            </th>
            <th scope="col" className="s3-figure">
              {t('section3.costBasis')}
            </th>
            <th scope="col" className="s3-figure">
              {t('section3.marketValue')}
            </th>
            <th scope="col" className="s3-figure">
              {t('section3.liveValue')}
            </th>
            <th scope="col" className="s3-figure">
              {t('section3.unrealised')}
            </th>
          </tr>
        </thead>

        <tbody>
          {view.byPerson.map((entry) => (
            <PersonBlock
              key={entry.person.id}
              person={entry.person}
              holdings={entry.holdings}
              costBasis={entry.costBasis}
              marketValue={entry.marketValue}
              unrealised={entry.unrealised}
              unitOf={unitOf}
              liveByCode={liveByCode}
              manualByCode={manualByCode}
              everAnswered={everAnswered}
              language={language}
              palette={palette}
            />
          ))}
        </tbody>

        <tfoot>
          <tr className="s3-grand" data-testid="s3-grand-total">
            <th scope="row" colSpan={2}>
              {t('section3.grandTotal')}
            </th>
            <td className="s3-figure" />
            <td className="s3-figure" data-testid="s3-grand-cost">
              {formatTry(view.costBasis, language)}
            </td>
            <td className="s3-figure" data-testid="s3-grand-market">
              {formatTry(view.marketValue, language)}
            </td>
            {/* Deliberately empty — see the note on totals at the head of this file. */}
            <td className="s3-figure" />
            <td className="s3-figure" data-testid="s3-grand-unrealised">
              <Gain value={view.unrealised} language={language} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PersonBlock({
  person,
  holdings,
  costBasis,
  marketValue,
  unrealised,
  unitOf,
  liveByCode,
  manualByCode,
  everAnswered,
  language,
  palette
}: {
  person: Person
  holdings: readonly Holding[]
  costBasis: number
  marketValue: number
  unrealised: number
  unitOf: ReadonlyMap<TypeCode, QuantityUnit>
  liveByCode: ReadonlyMap<TypeCode, LivePrice>
  manualByCode: ReadonlyMap<TypeCode, number>
  everAnswered: boolean
  language: AppLanguage
  palette: Palette
}): ReactElement {
  const { t } = useTranslation()

  return (
    <>
      {holdings.map((holding, index) => (
        <tr
          key={holding.typeCode}
          className="s3-holding"
          data-oversold={holding.oversold ? 'true' : undefined}
          data-testid={`s3-holding-${person.id}-${holding.typeCode}`}
        >
          {index === 0 ? (
            <th scope="row" rowSpan={holdings.length} className="s3-person-cell">
              <span
                className="s3-dot"
                style={{ background: personAccent(palette, person.colour, person.position) }}
                aria-hidden="true"
              />
              {person.name}
            </th>
          ) : null}

          <td>
            {t(`section3.types.${holding.typeCode}`)}
            {holding.oversold ? (
              <span className="s3-flag" title={t('section3.oversoldHint')}>
                {' '}
                !
              </span>
            ) : null}
          </td>

          <td className="s3-figure" data-testid={`s3-qty-${person.id}-${holding.typeCode}`}>
            {formatQuantity(
              holding.quantity,
              holding.typeCode,
              unitOf.get(holding.typeCode) ?? holding.unit,
              language
            )}
            <Made
              holding={holding}
              unit={unitOf.get(holding.typeCode) ?? holding.unit}
              language={language}
            />
          </td>

          <td className="s3-figure">{formatTry(holding.costBasis, language)}</td>

          <td className="s3-figure" data-testid={`s3-market-${person.id}-${holding.typeCode}`}>
            {holding.marketValue === null ? (
              <span className="s3-unpriced">{t('section3.unpriced')}</span>
            ) : (
              formatTry(holding.marketValue, language)
            )}
          </td>

          <LiveValue
            holding={holding}
            unit={unitOf.get(holding.typeCode) ?? holding.unit}
            live={liveByCode.get(holding.typeCode)}
            manual={manualByCode.get(holding.typeCode) ?? null}
            everAnswered={everAnswered}
            language={language}
          />

          <td className="s3-figure">
            {holding.unrealised === null ? null : (
              <Gain value={holding.unrealised} language={language} />
            )}
          </td>
        </tr>
      ))}

      <tr className="s3-person-total" data-testid={`s3-person-total-${person.id}`}>
        <td className="s3-figure" colSpan={2}>
          {t('section3.personTotal', { name: person.name })}
        </td>
        <td className="s3-figure" />
        <td className="s3-figure" data-testid={`s3-person-cost-${person.id}`}>
          {formatTry(costBasis, language)}
        </td>
        <td className="s3-figure" data-testid={`s3-person-market-${person.id}`}>
          {formatTry(marketValue, language)}
        </td>
        {/* Empty for the same reason as the grand total's. */}
        <td className="s3-figure" />
        <td className="s3-figure" data-testid={`s3-person-unrealised-${person.id}`}>
          <Gain value={unrealised} language={language} />
        </td>
      </tr>
    </>
  )
}

/**
 * What the holding is physically made of — *2 × 10 g + 2 × 5 g* (§8.3, amended).
 *
 * Shown only for the weighable types. A coin's denomination is its own type, so a
 * çeyrek holding composes to *30 × 1* and the count beside it already said that;
 * printing it twice would be noise in a column that has to stay readable.
 *
 * The **unattributed** remainder is the part worth putting on screen. A disposal
 * that cut a bar leaves weight that is not a piece of anything, and the honest
 * report is to name it rather than to round it into a piece it is not. It is
 * styled as a note rather than as an alarm, because unlike `oversold` nothing is
 * wrong — the ledger is consistent and the shape is simply no longer knowable.
 */
function Made({
  holding,
  unit,
  language
}: {
  holding: Holding
  unit: QuantityUnit
  language: AppLanguage
}): ReactElement | null {
  const { t } = useTranslation()
  if (unit !== 'mg') return null

  const { chunks, unattributed } = holding.composition
  // One whole piece and nothing left over is the quantity already shown.
  if (unattributed === 0 && chunks.length === 1 && chunks[0]!.count === 1) return null
  if (chunks.length === 0 && unattributed === 0) return null

  const pieces = chunks.map(
    (chunk) => `${chunk.count} × ${formatQuantity(chunk.denomination, holding.typeCode, unit, language)}`
  )

  return (
    <span className="s3-made" data-testid={`s3-made-${holding.personId}-${holding.typeCode}`}>
      {pieces.join(' + ')}
      {unattributed > 0 ? (
        <span className="s3-made-loose" title={t('section3.unattributedHint')}>
          {pieces.length > 0 ? ' + ' : ''}
          {t('section3.unattributed', {
            amount: formatQuantity(unattributed, holding.typeCode, unit, language)
          })}
        </span>
      ) : null}
    </span>
  )
}

/**
 * What the holding would be worth at the provider's figure — §14, beside and
 * never over.
 *
 * **Absence renders as words.** Two different sets of them, `Prices.tsx`'s own:
 * `noProvider` when nothing has ever been fetched, `notQuoted` when a fetch
 * succeeded and this type was not in it. Inventing a third phrasing here would
 * mean the same fact was described two ways on two pages; ₺0,00 would be worse
 * still, and is the thing §8.5 exists to forbid.
 *
 * **The drift cue is one colour and no figure.** `driftState` decides it, and it
 * is asked about the two *unit prices* — never about the two totals on this row.
 * A ratio would rank them the same either way, but that function documents its
 * exactness against `MAX_UNIT_PRICE`, which bounds a price per unit and says
 * nothing about a holding's total; feeding it a total would leave 3b relying on
 * an argument written for something else. Asking the same question of the same
 * two numbers 3c asks it of also means the two pages cannot reach different
 * verdicts about one type.
 *
 * The cell says *these two have parted company* and stops there. How far apart
 * they are, in per cent and with an arrow, is 3c's column; repeating it against
 * every person holding the same type would print one fact five times.
 *
 * That colour is `--warning`, not `--success`/`--danger`. Those belong to the
 * sign in `.s3-gain` two columns along, and a live figure above the owner's is
 * not good news — it is out-of-date news. One channel, one claim.
 *
 * **An oversold row still shows its cue**, because the prices being compared are
 * the type's and have nothing to do with how much of it is held. The row already
 * carries `--warning` in its own background and in the `!` flag, which is the
 * one place this page permits a third: the flag speaks about the *ledger* and
 * this cell speaks about the *price*, and a row can honestly have both wrong.
 */
function LiveValue({
  holding,
  unit,
  live,
  manual,
  everAnswered,
  language
}: {
  holding: Holding
  unit: QuantityUnit
  live: LivePrice | undefined
  /** The owner's typed price for this type, per unit, or null (§8.5). */
  manual: number | null
  everAnswered: boolean
  language: AppLanguage
}): ReactElement {
  const { t } = useTranslation()

  // The engine's own arithmetic, not a second copy of it: `Math.sign` carries a
  // negative holding through so an oversold row reads negative here exactly as
  // it does in the market-value column beside it.
  const value =
    live === undefined
      ? null
      : Math.sign(holding.quantity) *
        transactionValue(Math.abs(holding.quantity), live.value, unit)

  const state = driftState(manual, live?.value ?? null)

  return (
    <td
      className="s3-figure s3-holding-live"
      // All four states are carried, as 3c carries them, so the attribute means
      // the same thing on both pages. Only one of them takes a colour here.
      data-drift={state}
      data-testid={`s3-holding-live-${holding.personId}-${holding.typeCode}`}
    >
      {value === null || live === undefined ? (
        <span className="s3-unpriced">
          {t(everAnswered ? 'section3.notQuoted' : 'section3.noProvider')}
        </span>
      ) : (
        <>
          {/* The hint sits on the figure, not on the cell: there is no
              computation to explain in a cell that holds none. */}
          <span title={t('section3.liveValueHint')}>{formatTry(value, language)}</span>
          {/*
            The provider named per row, out of the row's own snapshot. See the
            note at the head of this file for why never out of `lastFetch`.
          */}
          <span
            className="s3-holding-source"
            data-testid={`s3-holding-source-${holding.personId}-${holding.typeCode}`}
          >
            {t('section3.liveSource', { provider: live.provider })}
          </span>
          {state === 'drifting' ? (
            <span className="s3-sr-only">{t('section3.drift.drifting')}</span>
          ) : null}
        </>
      )}
    </td>
  )
}

/**
 * A gain or a loss, signed and coloured by the palette.
 *
 * The sign is written explicitly for a gain, because "+₺7.150" answers the
 * question and "₺7.150" in a column of money does not.
 */
function Gain({ value, language }: { value: number; language: AppLanguage }): ReactElement {
  const sign = value > 0 ? 'gain' : value < 0 ? 'loss' : 'flat'
  return (
    <span className="s3-gain" data-sign={sign}>
      {value > 0 ? '+' : ''}
      {formatTry(value, language)}
    </span>
  )
}
