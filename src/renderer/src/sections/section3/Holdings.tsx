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
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Holding, HoldingsView } from '@shared/section3/engine'
import type { Person, QuantityUnit, TypeCode, ValuableType } from '@shared/section3/types'
import type { Palette } from '@shared/theme/types'
import type { AppLanguage } from '../../i18n/format.js'
import { formatQuantity, formatTry, personAccent } from './format.js'

interface Props {
  view: HoldingsView
  types: readonly ValuableType[]
  language: AppLanguage
  palette: Palette
}

export function Holdings({ view, types, language, palette }: Props): ReactElement {
  const { t } = useTranslation()
  const unitOf: ReadonlyMap<TypeCode, QuantityUnit> = new Map(
    types.map((type) => [type.code, type.unit])
  )

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
  language,
  palette
}: {
  person: Person
  holdings: readonly Holding[]
  costBasis: number
  marketValue: number
  unrealised: number
  unitOf: ReadonlyMap<TypeCode, QuantityUnit>
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
          </td>

          <td className="s3-figure">{formatTry(holding.costBasis, language)}</td>

          <td className="s3-figure" data-testid={`s3-market-${person.id}-${holding.typeCode}`}>
            {holding.marketValue === null ? (
              <span className="s3-unpriced">{t('section3.unpriced')}</span>
            ) : (
              formatTry(holding.marketValue, language)
            )}
          </td>

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
        <td className="s3-figure" data-testid={`s3-person-unrealised-${person.id}`}>
          <Gain value={unrealised} language={language} />
        </td>
      </tr>
    </>
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
