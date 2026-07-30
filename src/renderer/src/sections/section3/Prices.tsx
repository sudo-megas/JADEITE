/**
 * 3c — current prices (§8.5), and the live provider beside them (§14).
 *
 * **The owner's typed price is the authority.** The provider arrived with this
 * Realisation and it did not change that: it fills the column that was drawn
 * empty a Realisation ago, and it fills nothing else. An unofficial source will
 * change or break someday (§14), and a number the owner typed will still be
 * there when it does.
 *
 * Three decisions here are worth more than the markup around them.
 *
 * **"Last checked" reads `attemptedAt`, never a price's own timestamp.**
 * `LivePrice.fetchedAt` is when a *value* last moved and snapshots are only
 * appended when the figure changes, so on a quiet afternoon it is hours old
 * while the provider has been asked and has agreed a dozen times. Showing it
 * here would report a working provider as stale — the two fields exist
 * separately for exactly this reason, and this is the line that would conflate
 * them. When a fetch has failed, `succeededAt` gets its own line rather than
 * blanking the figures: an offline spell should show the last good price with an
 * honest age.
 *
 * **An absent live figure never renders as ₺0.** It renders as words, and as two
 * different sets of words: `noProvider` when nothing has ever been fetched, and
 * `notQuoted` when a fetch succeeded and this type was simply not in it. Those
 * are different facts about the world and a blank cell tells the owner neither.
 *
 * **The drift cell spends one colour channel.** `data-drift` carries the state
 * and the state alone decides the colour; the arrow says which way and the
 * figure says how far. Sign already owns `--success` and `--danger` in
 * `.s3-gain`, and a glyph that coloured direction *and* magnitude would be
 * making two claims in one channel — the rule this codebase keeps for the year
 * accent and the sign is the rule here.
 *
 * The live controls arrive as optional props because Section 3 renders before
 * anything has been fetched and, in a build where no provider is wired at all,
 * would render forever that way. A disabled refresh and "not asked yet" is the
 * truthful drawing of that state rather than a placeholder for it.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { DRIFT_THRESHOLD, driftRatio, driftState } from '@shared/section3/drift'
import type {
  FetchRecord,
  LivePrice,
  LivePriceErrorCode,
  ManualPrice,
  TypeCode,
  ValuableType
} from '@shared/section3/types'
import type { AppLanguage } from '../../i18n/format.js'
import { formatDate, localeFor } from '../../i18n/format.js'
import { MoneyCell } from './Cells.js'
import { formatTry } from './format.js'

interface Props {
  types: readonly ValuableType[]
  manual: readonly ManualPrice[]
  live: readonly LivePrice[]
  language: AppLanguage
  onSet: (typeCode: TypeCode, value: number) => void
  onClear: (typeCode: TypeCode) => void
  /** When the provider was last asked, or null if it never has been (§14). */
  lastFetch?: FetchRecord | null
  /** A fetch is in flight; the control refuses a second one. */
  refreshing?: boolean
  /** A `PriceErrorCode` from the last attempt, shown as a sentence and never as a stack. */
  liveError?: string | null
  onRefresh?: () => void
}

/**
 * Every failure code this catalogue can speak.
 *
 * A map keyed by the union rather than a list of strings, so a sixth code added
 * to `LivePriceErrorCode` fails this build instead of quietly reaching the owner
 * as a vaguer sentence — the same trade the locale files cannot make for
 * themselves, since nothing checks the two catalogues for parity.
 *
 * The prop is nonetheless a plain string: it crosses the bridge from a vault
 * that may have been written by an older version of the app, and an unrecognised
 * code has to become a sentence rather than a missing translation key on screen.
 */
const LIVE_ERROR_CODES: Record<LivePriceErrorCode, true> = {
  OFFLINE: true,
  TIMEOUT: true,
  MALFORMED: true,
  STALE_RANGE: true,
  NO_DATA: true
}

function liveErrorKey(code: string): string {
  // `hasOwn` rather than `in`, which would answer true for "constructor" and
  // send the owner a key instead of a sentence.
  return Object.hasOwn(LIVE_ERROR_CODES, code)
    ? `section3.liveErrors.${code}`
    : 'section3.liveErrors.UNKNOWN'
}

/** Direction, in the one channel that carries it. */
const RISING = '▲'
const FALLING = '▼'
const AGREES = '≈'
const ABSENT = '—'

/**
 * Joins the arrow to its figure so the pair cannot break across a line. An
 * escape rather than a typed character, for `i18n/format.ts`'s reason: the
 * difference between this and an ordinary space is invisible in source.
 */
const NBSP = '\u00A0'

function priceUnitKey(type: ValuableType): string {
  if (type.unit === 'mg') return 'section3.perGram'
  if (type.unit === 'piece') return 'section3.perPiece'
  return 'section3.perUnit'
}

/**
 * A proportion as the app language writes one — "%2,4" in Turkish, "2.4%" in
 * English, the symbol on the side each convention puts it.
 *
 * The locale comes from the app language and never from the machine (§13), which
 * is the whole reason this is a formatter and not a template.
 */
function formatPercent(fraction: number, language: AppLanguage, fractionDigits: number): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits
  }).format(fraction)
}

/**
 * A moment, to the minute.
 *
 * `formatDate` takes the day alone, which is the right resolution for a ledger
 * row and the wrong one here: "checked today" answers nothing on the afternoon
 * of a day the app has been open all through. No `timeZone` is passed, because
 * *when did I last look* is a question asked in the owner's own clock.
 *
 * A bare `new Date` is safe on these strings only because `vault/db/prices.ts`
 * re-emits every instant it stores through `toISOString()`. Had it kept the
 * space-separated SQLite form, V8 would read a UTC value as local and this line
 * would be three hours early in Turkey, plausibly and silently. The check
 * against `NaN` is what remains: a malformed stamp shows itself rather than
 * rendering as "Invalid Date".
 */
function formatStamp(iso: string, language: AppLanguage): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso

  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(at)
}

export function Prices({
  types,
  manual,
  live,
  language,
  onSet,
  onClear,
  lastFetch = null,
  refreshing = false,
  liveError = null,
  onRefresh
}: Props): ReactElement {
  const { t } = useTranslation()

  const manualByCode = new Map(manual.map((price) => [price.typeCode, price]))
  const liveByCode = new Map(live.map((price) => [price.typeCode, price]))

  const threshold = formatPercent(DRIFT_THRESHOLD, language, 0)

  /**
   * Whether the provider has ever answered — which is what tells the two
   * absences apart. A fetch that was *attempted* proves nothing: an offline
   * attempt would otherwise have every row claim the source declines to quote
   * it, when in truth the source was never reached.
   */
  const everAnswered = lastFetch !== null && lastFetch.succeededAt !== null

  return (
    <div className="s3-prices" data-testid="s3-prices">
      <p className="lede">{t('section3.pricesLede')}</p>

      <div className="s3-live-bar">
        <button
          type="button"
          className="s3-btn"
          data-testid="s3-refresh"
          // Refused while one is in flight, and while no provider is wired at
          // all — a control that cannot act says so by being unavailable rather
          // than by doing nothing when pressed.
          disabled={refreshing || onRefresh === undefined}
          onClick={() => onRefresh?.()}
        >
          {t('section3.refreshLive')}
        </button>

        {/*
          When the app last *looked*: `attemptedAt`, not any price's own stamp.
          Always rendered, so "never asked" is a state with a place to be said.
        */}
        <span className="s3-live-status" data-testid="s3-live-fetched-at">
          {refreshing
            ? t('section3.checkingLive')
            : lastFetch
              ? t('section3.lastChecked', { when: formatStamp(lastFetch.attemptedAt, language) })
              : t('section3.neverChecked')}
        </span>
      </div>

      {lastFetch && lastFetch.outcome !== 'ok' && lastFetch.succeededAt !== null ? (
        <p className="s3-live-held" data-testid="s3-live-last-good">
          {t('section3.lastGood', { when: formatStamp(lastFetch.succeededAt, language) })}
        </p>
      ) : null}

      {/*
        §14 asks that a broken provider be quiet and non-blocking, so this is a
        status and not an alert: nothing the owner typed is in doubt, and the
        page behind it still holds every figure it held a moment ago.
      */}
      {liveError !== null ? (
        <p className="s3-note" role="status" data-testid="s3-live-error">
          {t(liveErrorKey(liveError))}
        </p>
      ) : null}

      <div className="s3-prices-scroll">
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
              <th scope="col" className="s3-figure">
                {t('section3.drift.header')}
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

              const manualValue = price?.value ?? null
              const liveValue = snapshot?.value ?? null

              const state = driftState(manualValue, liveValue)
              const ratio = driftRatio(manualValue, liveValue)
              const parted = state === 'drifting' && ratio !== null
              const rising = liveValue !== null && manualValue !== null && liveValue > manualValue

              const driftTitle = parted
                ? t(rising ? 'section3.drift.above' : 'section3.drift.below', {
                    percent: formatPercent(ratio, language, 1)
                  })
                : state === 'aligned'
                  ? t('section3.drift.alignedTitle', { threshold })
                  : t(`section3.drift.${state}`)

              return (
                <tr key={type.code} data-testid={`s3-price-row-${type.code}`}>
                  <th scope="row">
                    {t(`section3.types.${type.code}`)}
                    <span className="s3-unit-hint"> {t(priceUnitKey(type))}</span>
                  </th>

                  <td className="s3-figure">
                    <MoneyCell
                      value={manualValue}
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
                    Never ₺0 for a figure nobody quoted. The two absences are
                    told apart: no answer has ever arrived, or one arrived
                    without this type in it.
                  */}
                  <td className="s3-figure s3-live" data-testid={`s3-live-price-${type.code}`}>
                    {snapshot ? (
                      <span title={formatStamp(snapshot.fetchedAt, language)}>
                        {formatTry(snapshot.value, language)}
                      </span>
                    ) : (
                      <span className="s3-unpriced">
                        {t(everAnswered ? 'section3.notQuoted' : 'section3.noProvider')}
                      </span>
                    )}
                  </td>

                  {/*
                    Rendered in all four states, so the cell is a place the owner
                    can learn to look rather than one that appears and vanishes.
                    The glyph is decoration over text a screen reader can read.
                  */}
                  <td
                    className="s3-figure s3-drift"
                    data-drift={state}
                    data-testid={`s3-drift-${type.code}`}
                    title={driftTitle}
                  >
                    <span aria-hidden="true">
                      {parted
                        ? `${rising ? RISING : FALLING}${NBSP}${formatPercent(ratio, language, 1)}`
                        : state === 'aligned'
                          ? AGREES
                          : ABSENT}
                    </span>
                    <span className="s3-sr-only">{driftTitle}</span>
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
    </div>
  )
}
