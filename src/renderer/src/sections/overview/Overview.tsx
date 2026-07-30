/**
 * Overview — the zoomed-out dashboard (XJADEITE §10).
 *
 * "Read-only; every number is derived from Sections 1–3." Both halves of that
 * are structural here rather than intended. Derived: every figure below comes
 * out of `selectors.ts`, which is pure and calls the same engines the sections
 * call — this file formats and arranges, and computes nothing. Read-only: the
 * store it reads exposes no mutator, and no callback on this page reaches one.
 * There is no code path from this screen to a write.
 *
 * **Nothing on a dashboard may print a figure it does not have.** Three of the
 * four tiles have a state where the arithmetic yields a real `0` and the honest
 * answer is *there is no figure* — a debt year with no columns, a remaining
 * limit over an empty row, an unrealised gain on holdings nobody has priced.
 * Every one of those is a `kind` on a discriminated union in `selectors.ts` and
 * a branch below, because a zero on this page is a claim about the owner's
 * money. This whole application is a reply to two documents that looked complete
 * and disagreed; a dashboard is where that failure would do the most damage.
 *
 * **The root testid is present in every state.** Loading, error, empty and
 * furnished all render `data-testid="overview"` with the banners as children —
 * `tests/e2e/shell.spec.ts` asserts the destination is visible immediately after
 * a keyboard switch, and three alternative roots would make that assertion
 * depend on which one won.
 */

import { useEffect, useMemo, type CSSProperties, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { paletteById } from '@shared/theme/palettes/index'
import { useAppStore } from '../../store/app-store.js'
import { useOverviewStore } from '../../store/overview-store.js'
import { yearAccentVariables } from '../../theme/accents.js'
import { formatTry } from '../section3/format.js'
import { Charts } from './Charts.js'
import {
  debtTile,
  holdingsOf,
  incompleteReads,
  marketTile,
  remainingTile,
  typeCodesAttribute,
  unrealisedTile,
  yearCards,
  type HeadlineBucket
} from './selectors.js'

interface Props {
  /** Go to a destination, optionally with a year in mind. See navigate.ts. */
  navigate: (id: string, year?: number) => void
}

/**
 * Today, read once per mount.
 *
 * `computeGrid` takes a `Today` from its caller rather than reading a clock, and
 * Section 2 reads it once on mount for the same reason. Reading it per selector
 * call would let a dashboard left open across midnight answer two questions
 * about two different days.
 */
function todayNow(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function Overview({ navigate }: Props): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const paletteId = useAppStore((s) => s.paletteId)

  const years = useOverviewStore((s) => s.years)
  const anchorYear = useOverviewStore((s) => s.anchorYear)
  const ledger = useOverviewStore((s) => s.ledger)
  const loading = useOverviewStore((s) => s.loading)
  const error = useOverviewStore((s) => s.error)

  useEffect(() => {
    void useOverviewStore.getState().load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = useMemo(todayNow, [])
  const palette = useMemo(() => paletteById(paletteId), [paletteId])

  const cards = useMemo(() => yearCards(years), [years])
  const holdings = useMemo(() => holdingsOf(ledger), [ledger])
  const debt = useMemo(() => debtTile(years, today), [years, today])
  const remaining = useMemo(() => remainingTile(years, today), [years, today])
  const market = useMemo(() => marketTile(holdings), [holdings])
  const unrealised = useMemo(() => unrealisedTile(holdings), [holdings])
  const incomplete = useMemo(() => incompleteReads(years, ledger), [years, ledger])

  const money = (kurus: number): string => formatTry(kurus, language)

  return (
    <section className="overview" data-testid="overview">
      <h1>{t('nav.overview')}</h1>
      <p className="lede">{t('overview.lede')}</p>

      {error !== null ? (
        <p className="overview-error" role="status" data-testid="overview-error">
          {t(`errors.${error}`)}
        </p>
      ) : null}

      {/*
        A year that failed to read is named rather than dropped. A year missing
        from a dashboard is indistinguishable from a year that held nothing, and
        the difference is exactly what the owner would need to know.
      */}
      {incomplete.any ? (
        <p className="overview-partial" role="status" data-testid="ov-partial">
          {t('overview.partial', {
            years: [...new Set([...incomplete.workspaceYears, ...incomplete.gridYears])]
              .sort((a, b) => a - b)
              .join(', ')
          })}
        </p>
      ) : null}

      {loading && years.length === 0 ? (
        <p className="lede" data-testid="ov-loading">
          {t('overview.loading')}
        </p>
      ) : null}

      {!loading && years.length === 0 && error === null ? (
        <p className="s3-empty-state" data-testid="ov-empty">
          {t('overview.empty')}
        </p>
      ) : null}

      {years.length > 0 ? (
        <>
          <div className="ov-tiles">
            <Tile
              testId="ov-tile-debt"
              label={t('overview.tiles.debt')}
              figure={debt.kind === 'figure' ? money(debt.debt) : null}
              note={
                debt.kind === 'no-years'
                  ? t('overview.notes.noDebtYear')
                  : debt.kind === 'unreadable'
                    ? t('overview.notes.gridUnreadable')
                    : debt.kind === 'no-columns'
                      ? t('overview.notes.noBanks')
                      : t('overview.tiles.debtOf', { year: debt.year })
              }
              onOpen={
                debt.kind === 'no-years' ? undefined : () => navigate('section2', debt.year)
              }
            />

            <Tile
              testId="ov-tile-remaining"
              label={t('overview.tiles.remaining')}
              figure={remaining.kind === 'figure' ? money(remaining.remaining) : null}
              note={
                remaining.kind === 'no-years'
                  ? t('overview.notes.noDebtYear')
                  : remaining.kind === 'unreadable'
                    ? t('overview.notes.gridUnreadable')
                    : remaining.kind === 'no-limits'
                      ? t('overview.notes.noBanks')
                      : null
              }
              onOpen={
                remaining.kind === 'no-years'
                  ? undefined
                  : () => navigate('section2', remaining.year)
              }
            />

            <Tile
              testId="ov-tile-market"
              label={t('overview.tiles.market')}
              figure={market.kind === 'figure' ? money(market.marketValue) : null}
              note={
                market.kind === 'nothing-held'
                  ? t('overview.notes.noHoldings')
                  : market.kind === 'none-priced'
                    ? t('overview.notes.noPricedHoldings')
                    : null
              }
              /*
                The unpriced marker rides alongside the figure rather than
                replacing it: partial pricing is the ordinary condition — gold
                priced, silver not — and the figure below is true of the priced
                part alone. `data-unpriced-types` names the types rather than
                counting them, so the cross-check can compare this against 3b's
                own marker and prove the two agree about *which*.
              */
              marker={
                (market.kind === 'figure' || market.kind === 'none-priced') &&
                market.unpricedTypes.length > 0
                  ? {
                      testId: 'ov-tile-market-unpriced',
                      types: typeCodesAttribute(market.unpricedTypes),
                      text: t('overview.notes.unpriced', { count: market.unpricedTypes.length })
                    }
                  : undefined
              }
              onOpen={() => navigate('section3')}
            />

            <Tile
              testId="ov-tile-unrealised"
              label={t('overview.tiles.unrealised')}
              figure={unrealised.kind === 'figure' ? money(unrealised.unrealised) : null}
              sign={
                unrealised.kind === 'figure'
                  ? unrealised.unrealised > 0
                    ? 'gain'
                    : unrealised.unrealised < 0
                      ? 'loss'
                      : 'flat'
                  : undefined
              }
              note={
                unrealised.kind === 'nothing-held'
                  ? t('overview.notes.noHoldings')
                  : unrealised.kind === 'none-priced'
                    ? t('overview.notes.noPricedHoldings')
                    : null
              }
              onOpen={() => navigate('section3')}
            />
          </div>

          <h2 className="ov-heading">{t('overview.years')}</h2>
          <div className="ov-years">
            {cards.map((card) => (
              <YearCard
                key={card.year}
                year={card.year}
                headline={card.headline}
                anchorYear={anchorYear ?? card.year}
                paletteId={paletteId}
                money={money}
                onOpen={() => navigate('section1', card.year)}
              />
            ))}
          </div>

          <Charts years={years} ledger={ledger} palette={palette} language={language} />
        </>
      ) : null}
    </section>
  )
}

interface TileProps {
  testId: string
  label: string
  /** Null when there is no figure — which is not the same as a figure of zero. */
  figure: string | null
  note: string | null
  sign?: 'gain' | 'loss' | 'flat'
  marker?: { testId: string; types: string; text: string }
  onOpen?: (() => void) | undefined
}

/**
 * One grand total.
 *
 * The em dash is deliberate and is not decoration: it is what "there is no
 * figure" looks like, and it is never `0,00 ₺`. The note beside it says which
 * of the several absences this one is.
 */
function Tile({ testId, label, figure, note, sign, marker, onOpen }: TileProps): ReactElement {
  return (
    <div className="ov-tile" data-testid={testId}>
      <p className="ov-tile-label">{label}</p>
      <p
        className="ov-tile-figure"
        data-testid={`${testId}-figure`}
        data-sign={sign}
        data-empty={figure === null ? 'true' : undefined}
      >
        {figure ?? '—'}
      </p>
      {note !== null ? (
        <p className="ov-tile-note" data-testid={`${testId}-note`}>
          {note}
        </p>
      ) : null}
      {marker !== undefined ? (
        <p className="ov-tile-note" data-testid={marker.testId} data-unpriced-types={marker.types}>
          {marker.text}
        </p>
      ) : null}
      {onOpen !== undefined ? (
        <button type="button" className="ov-open" onClick={onOpen} data-testid={`${testId}-open`}>
          →
        </button>
      ) : null}
    </div>
  )
}

interface YearCardProps {
  year: number
  headline: HeadlineBucket
  anchorYear: number
  paletteId: string
  money: (kurus: number) => string
  onOpen: () => void
}

/**
 * One year, wearing the accent that year wears everywhere else.
 *
 * The accent variables are spread onto the **card** rather than onto a section
 * root, which is the one adaptation §12.3's mechanism needs here: Sections 1 and
 * 2 set them once for the year they are showing, and a dashboard shows all of
 * them at once. The elegance constraint survives because a card uses `wash` for
 * its fill and `line` for its edge and never the accent at strength — twelve
 * cards at 88% would be a paint chart.
 *
 * A year with columns the headline does not cover says so. Every branch here is
 * a `kind` from `headlineBucket`, so a card cannot quietly draw a year the
 * charts excluded.
 */
function YearCard({
  year,
  headline,
  anchorYear,
  paletteId,
  money,
  onOpen
}: YearCardProps): ReactElement {
  const { t } = useTranslation()

  const style = useMemo<CSSProperties>(
    () => yearAccentVariables(paletteById(paletteId), year, anchorYear) as CSSProperties,
    [paletteId, year, anchorYear]
  )

  const net = headline.kind === 'net' ? headline.bucket.net : null

  return (
    <button
      type="button"
      className="ov-year"
      style={style}
      data-testid={`ov-year-${year}`}
      data-kind={headline.kind}
      onClick={onOpen}
      aria-label={t('overview.openYear', { year })}
    >
      <span className="ov-year-label">{year}</span>

      <span
        className="ov-year-net"
        data-testid={`ov-year-${year}-net`}
        data-negative={net !== null && net < 0 ? 'true' : undefined}
        data-empty={net === null ? 'true' : undefined}
      >
        {net === null ? '—' : money(net)}
      </span>

      {headline.kind === 'net' && headline.others.length > 0 ? (
        <span className="ov-year-other" data-testid={`ov-year-${year}-other`}>
          {t('overview.yearOther', { types: headline.others.join(', ') })}
        </span>
      ) : null}

      {headline.kind !== 'net' ? (
        <span className="ov-year-other" data-testid={`ov-year-${year}-other`}>
          {headline.kind === 'unreadable'
            ? t('overview.yearUnreadable')
            : headline.kind === 'no-columns'
              ? t('overview.yearEmpty')
              : t('overview.yearNoTry')}
        </span>
      ) : null}

      <span className="ov-year-open" data-testid={`ov-year-${year}-open-s1`} aria-hidden="true">
        →
      </span>
    </button>
  )
}
