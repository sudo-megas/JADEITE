/**
 * 3c — current prices (§8.5).
 *
 * **The owner's typed price is the authority.** The live column beside it exists
 * from this Realisation and stays empty until Realisation VII fills it, because a
 * column that appears later moves every figure on the page sideways once and then
 * never again — better to draw it now and let it say so.
 *
 * When the provider does arrive it will back the manual figure up, never replace
 * it. That is not a UI preference: an unofficial source will change or break
 * someday (§14), and a number the owner typed will still be there when it does.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { LivePrice, ManualPrice, TypeCode, ValuableType } from '@shared/section3/types'
import type { AppLanguage } from '../../i18n/format.js'
import { formatDate } from '../../i18n/format.js'
import { MoneyCell } from './Cells.js'
import { formatTry } from './format.js'

interface Props {
  types: readonly ValuableType[]
  manual: readonly ManualPrice[]
  live: readonly LivePrice[]
  language: AppLanguage
  onSet: (typeCode: TypeCode, value: number) => void
  onClear: (typeCode: TypeCode) => void
}

function priceUnitKey(type: ValuableType): string {
  if (type.unit === 'mg') return 'section3.perGram'
  if (type.unit === 'piece') return 'section3.perPiece'
  return 'section3.perUnit'
}

export function Prices({
  types,
  manual,
  live,
  language,
  onSet,
  onClear
}: Props): ReactElement {
  const { t } = useTranslation()

  const manualByCode = new Map(manual.map((price) => [price.typeCode, price]))
  const liveByCode = new Map(live.map((price) => [price.typeCode, price]))

  return (
    <div className="s3-prices" data-testid="s3-prices">
      <p className="lede">{t('section3.pricesLede')}</p>

      <table className="s3-prices-table">
        <thead>
          <tr>
            <th scope="col">{t('section3.type')}</th>
            <th scope="col" className="s3-figure">
              {t('section3.manualPrice')}
            </th>
            <th scope="col">{t('section3.updatedAt')}</th>
            <th scope="col" className="s3-figure">
              {t('section3.livePrice')}
            </th>
            <th scope="col">
              <span className="s3-sr-only">{t('common.actions')}</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {types.map((type) => {
            const price = manualByCode.get(type.code)
            const snapshot = liveByCode.get(type.code)

            return (
              <tr key={type.code} data-testid={`s3-price-row-${type.code}`}>
                <th scope="row">
                  {t(`section3.types.${type.code}`)}
                  <span className="s3-unit-hint"> {t(priceUnitKey(type))}</span>
                </th>

                <td className="s3-figure">
                  <MoneyCell
                    value={price?.value ?? null}
                    language={language}
                    label={t('section3.priceOf', {
                      type: t(`section3.types.${type.code}`)
                    })}
                    testId={`s3-manual-price-${type.code}`}
                    onCommit={(value) => {
                      if (value === null) onClear(type.code)
                      else onSet(type.code, value)
                    }}
                  />
                </td>

                <td className="s3-stamp" data-testid={`s3-price-stamp-${type.code}`}>
                  {price ? formatDate(price.updatedAt.slice(0, 10), language) : null}
                </td>

                {/*
                  Empty until Realisation VII. Rendered so the shape of the page
                  is settled now, and labelled so an empty cell reads as "no
                  provider yet" rather than as "no price".
                */}
                <td className="s3-figure s3-live" data-testid={`s3-live-price-${type.code}`}>
                  {snapshot ? (
                    <span title={snapshot.fetchedAt}>{formatTry(snapshot.value, language)}</span>
                  ) : (
                    <span className="s3-unpriced">{t('section3.noProvider')}</span>
                  )}
                </td>

                <td>
                  {price ? (
                    <button
                      type="button"
                      className="s3-btn-quiet"
                      data-testid={`s3-clear-price-${type.code}`}
                      onClick={() => onClear(type.code)}
                    >
                      {t('section3.clearPrice')}
                    </button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
